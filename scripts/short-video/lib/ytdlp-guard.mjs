/**
 * Persistent 412 backoff guard for the yt-dlp channel.
 *
 * Bilibili answers HTTP 412 in two regimes (yt-dlp #5083, #14830, #16571):
 *   1. deterministic precondition — requests without a buvid3 device cookie;
 *   2. rate-limit penalty — any 412 blocks further API calls from the
 *      offending key "for a while" (hours-scale, no official number), and
 *      since 2025-10 this can hit playurl even with valid cookies.
 * Neither yt-dlp upstream nor this repo's yt-dlp call sites had any backoff:
 * execSync one-shot calls re-hit the block and extend it.
 *
 * The guard keeps a per-domain penalty box persisted to the shared output
 * state dir (same convention as rate-limiter-state.json), so a fresh session
 * does not blindly re-hit an active block. Durations escalate exponentially
 * per consecutive 412 (1h base, 24h cap) and clear on the first success.
 *
 * Env:
 *   YTDLP_412_STATE_PATH — override the state file location (tests)
 *   YTDLP_GUARD_DISABLED=1 — escape hatch (tests/debugging)
 *
 * Consumers: asset-sourcer.mjs (searchYtdlp / downloadYtdlp),
 * video-downloaders.mjs (downloadYtdlpAdapter). Also exports a browser-like
 * User-Agent for yt-dlp invocations — the default python UA is part of what
 * the 412 risk control flags (#16571 workaround reports).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "node:child_process";
import { matchDomain } from "./rate-limiter.mjs";

/** Browser-like UA for yt-dlp invocations (#16571: UA is part of the fingerprint). */
export const YTDLP_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** YouTube hosts for the cookie-source policy (#313) — keep in sync with
 * YOUTUBE_HOSTS in video-downloaders.mjs (importing it from there would
 * create a cycle: video-downloaders imports this module). */
const YOUTUBE_COOKIE_HOSTS = ["youtube.com", "youtu.be", "m.youtube.com"];

/**
 * Per-platform cookie source for yt-dlp downloads (#313).
 *
 * youtube → "chrome": the machine's YouTube login state lives in Chrome's
 * cookie store (SID/SAPISID/HSID/SSID/APISID on .google.com plus
 * __Secure-3PSID on .youtube.com — read-only probe 2026-09-20); firefox has
 * none, and probe 4 (#309 §F.4) hit YouTube's "Sign in to confirm you're not
 * a bot" wall on every download. The chrome channel is proven on this host
 * (weibo retest 2026-09-17 with silent Keychain authorization; youtube live
 * download 2026-09-20 — no bot-check, valid mp4).
 *
 * Everything else keeps "firefox": the pipeline default has no Keychain
 * dependency and minimal credential exposure (bilibili firefox is enough,
 * #309 §F.4; weibo routes its own cookie file via WEIBO_COOKIE). Search
 * pseudo-URLs (ytsearch10:…) also stay firefox — search metadata has not
 * been bot-checked (#309 probe 4) and the working path gains no Keychain
 * dependency.
 *
 * @param {string} url - download target URL (or search pseudo-URL)
 * @returns {"chrome"|"firefox"} browser whose cookie store yt-dlp reads
 */
export function ytdlpCookieBrowser(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return YOUTUBE_COOKIE_HOSTS.some((h) => host === h || host.endsWith("." + h))
      ? "chrome"
      : "firefox";
  } catch {
    return "firefox";
  }
}

const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");

// ─── Proxy hand-off to the ffmpeg child (#324) ───
//
// `--download-sections` makes yt-dlp delegate the media fetch to a spawned
// ffmpeg. The two layers read proxies from different places:
//   - yt-dlp's own HTTP layer: Python `getproxies()`, which resolves the macOS
//     SystemConfiguration proxy (scutil --proxy) — metadata/format parsing works;
//   - ffmpeg: only the LOWERCASE http_proxy/https_proxy env vars — no macOS
//     system lookup at all.
// A session with no lowercase var exported therefore parses metadata fine and
// then dies at the CDN segment (`Error opening input ... timed out`,
// `ffmpeg exited with code 196`).
//
// Upstream yt-dlp already solves this in FFmpegFD: when `--proxy` is given it
// hands the ffmpeg child BOTH HTTP_PROXY and http_proxy
// (yt_dlp/downloader/external.py). So this module resolves the proxy the
// caller already has and hands it to yt-dlp — it does NOT grow its own
// env-injection path, which would have to track ffmpeg's own semantics.
//
// Observed on this host 2026-09-21 (ffmpeg-wrapper probe): without `--proxy`
// the child saw only HTTP_PROXY/HTTPS_PROXY; with `--proxy` it also saw
// `http_proxy`.

/** `scutil` is /usr/sbin/scutil and is absent from a minimal PATH. */
const SCUTIL_BIN = "/usr/sbin/scutil";

/**
 * Parse `scutil --proxy` output into the endpoints macOS currently enables.
 *
 * Only top-level `Key : value` lines are read (2-space indent, single-token
 * value), so nested blocks — `ExceptionsList : <array> { ... }` and the
 * numeric-keyed entries inside it — are skipped without a real parser.
 *
 * @param {string} text - raw `scutil --proxy` stdout
 * @returns {{httpProxy: string|null, httpsProxy: string|null, socksProxy: string|null}} `host:port` per protocol, null when disabled
 */
export function parseMacSystemProxy(text) {
  /** @type {Record<string, string>} */
  const dict = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = line.match(/^\s{2}([A-Za-z]+) : (\S+)\s*$/);
    if (m) dict[m[1]] = m[2];
  }
  const endpoint = (proto) =>
    dict[`${proto}Enable`] === "1" && dict[`${proto}Proxy`] && dict[`${proto}Port`]
      ? `${dict[`${proto}Proxy`]}:${dict[`${proto}Port`]}`
      : null;
  return {
    httpProxy: endpoint("HTTP"),
    httpsProxy: endpoint("HTTPS"),
    socksProxy: endpoint("SOCKS"),
  };
}

/** Cache the scutil read — it is a subprocess, and callers are per-candidate. */
let systemProxyCache;

/**
 * Read the macOS system proxy. Returns null off-macOS, on a PAC-only config,
 * or whenever scutil fails — this must never break a download.
 *
 * @returns {{httpProxy: string|null, httpsProxy: string|null, socksProxy: string|null}|null}
 */
export function readMacSystemProxy() {
  if (process.platform !== "darwin") return null;
  if (systemProxyCache !== undefined) return systemProxyCache;
  try {
    const out = execSync(`${SCUTIL_BIN} --proxy`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    systemProxyCache = parseMacSystemProxy(out);
  } catch {
    systemProxyCache = null;
  }
  return systemProxyCache;
}

/** Add the http:// scheme ffmpeg and yt-dlp both expect on a bare host:port. */
function withScheme(value) {
  return /^[0-9a-zA-Z+.-]+:\/\//.test(value) ? value : `http://${value}`;
}

/**
 * Resolve the proxy to hand to yt-dlp via `--proxy`, or null when none is needed.
 *
 * A lowercase `http_proxy` means the ffmpeg child already inherits the exact
 * variable it reads, so nothing is injected — injecting anyway would override
 * yt-dlp's own no_proxy handling for no gain. Every other case (uppercase-only
 * env, or nothing but the macOS system proxy) leaves the child without it.
 *
 * A SOCKS-only system config yields null: ffmpeg cannot use SOCKS, and
 * yt-dlp's own layer already resolves SystemConfiguration by itself, so
 * injecting would add a warning without fixing the section download.
 *
 * @param {Object} [deps]
 * @param {Record<string, string|undefined>} [deps.env] - Environment to read
 * @param {() => ({httpProxy: string|null, httpsProxy: string|null, socksProxy: string|null}|null)} [deps.readSystemProxy] - System proxy source
 * @returns {string|null} proxy URL to pass as `--proxy`, or null
 */
export function resolveYtdlpProxy({
  env = process.env,
  readSystemProxy = readMacSystemProxy,
} = {}) {
  if (env.http_proxy) return null;
  const fromEnv = env.https_proxy || env.HTTP_PROXY || env.HTTPS_PROXY;
  if (fromEnv) return withScheme(fromEnv);
  let system;
  try {
    system = readSystemProxy();
  } catch {
    return null;
  }
  const endpoint = system?.httpsProxy || system?.httpProxy;
  return endpoint ? withScheme(endpoint) : null;
}

/**
 * Shell fragment for the yt-dlp proxy hand-off — empty when no proxy applies.
 * One place owns the quoting so every call site composes the same way.
 *
 * @returns {string} `--proxy "<url>"`, or "" when nothing is injected
 */
export function ytdlpProxyArg() {
  const proxy = resolveYtdlpProxy();
  return proxy ? `--proxy "${proxy}"` : "";
}

/**
 * Resolve the file yt-dlp actually produced for a `-o <destPath>` template.
 *
 * yt-dlp appends the real container extension when the template's extension
 * doesn't match the final merged format (#323: `-o clip.mp4` on a video with
 * no mp4 format ≤720p merges webm+opus and lands at `clip.mp4.webm`). The
 * exact template path wins; otherwise the newest sibling that extends the
 * template name with a container suffix is the produced file. Returns null
 * when nothing landed on disk.
 *
 * @param {string} destPath - the `-o` output template path
 * @returns {string|null} produced file path, or null when absent
 */
export function resolveYtdlpOutputPath(destPath) {
  if (existsSync(destPath)) return destPath;
  const dir = dirname(destPath);
  const prefix = `${basename(destPath)}.`;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const produced = entries
    .filter((name) => name.startsWith(prefix))
    .map((name) => {
      const full = join(dir, name);
      try {
        return { full, mtimeMs: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return produced[0]?.full ?? null;
}

/**
 * Remove stale suffixed siblings of the `-o` template before a download
 * (#323 review finding: without this, an orphan `<dest>.mp4.webm` left by a
 * pre-fix failed run is re-resolved as a fresh success even when the current
 * run produces nothing). The exact template path is left untouched — the
 * entry fast path owns it.
 *
 * @param {string} destPath - the `-o` output template path
 */
export function removeYtdlpStaleOutput(destPath) {
  const dir = dirname(destPath);
  const prefix = `${basename(destPath)}.`;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    try {
      unlinkSync(join(dir, name));
    } catch {}
  }
}

/** Mime types for the containers yt-dlp can actually produce (#323). */
const YTDLP_CONTAINER_MIME = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

/**
 * Mime type for a resolved yt-dlp output extension (#323) — the download
 * result must describe the container on disk, not the requested one.
 *
 * @param {string} ext - extension without the leading dot
 * @returns {string} mime type (octet-stream fallback for unknown containers)
 */
export function ytdlpContainerMime(ext) {
  return YTDLP_CONTAINER_MIME[ext] ?? "application/octet-stream";
}

/** Default persistent state file (gitignored output dir — survives sessions). */
export const YTDLP_412_STATE_PATH = join(STATE_DIR, "yt-dlp-412-state.json");

export function ytdlp412StatePath() {
  return process.env.YTDLP_412_STATE_PATH || YTDLP_412_STATE_PATH;
}

/** First-penalty duration; doubles per consecutive 412, capped at 24h. */
export const YTDLP_412_BASE_MS = 60 * 60 * 1000;
export const YTDLP_412_MAX_MS = 24 * YTDLP_412_BASE_MS;

/**
 * Does this failure look like an upstream 412? Inspects execSync error
 * payloads (stderr string/Buffer, error message) for the 412 signature.
 *
 * @param {{ stderr?: string|Buffer, message?: string }|null|undefined} errLike
 * @returns {boolean}
 */
export function matchYtdlp412(errLike) {
  if (!errLike) return false;
  const stderr =
    typeof errLike.stderr === "string" ? errLike.stderr : (errLike.stderr?.toString?.() ?? "");
  const message = errLike.message ?? "";
  // Anchored: a bare "412" would false-positive on ids/durations/URL paths
  // in yt-dlp output. Both observed spellings covered (yt-dlp #5083/#14830).
  const pat = /HTTP Error 412|412: Precondition/i;
  return pat.test(stderr) || pat.test(message);
}

/**
 * Create a 412 penalty-box guard. All time and persistence are injected so
 * tests run instantly; production defaults read/write the state file lazily
 * on every call (cheap, once per yt-dlp invocation at most).
 *
 * @param {Object} [deps]
 * @param {() => number} [deps.now] - Current time in ms
 * @param {() => Object|null} [deps.loadState] - Load persisted penalty state
 * @param {(state: Object) => void} [deps.saveState] - Persist penalty state
 * @returns {{ isBlocked(domain: string): {blocked: boolean, until?: number, remainingMs?: number}, record412(domain: string): void, recordSuccess(domain: string): void }}
 */
export function createYtdlp412Guard({
  now = () => Date.now(),
  loadState = defaultLoadState,
  saveState = defaultSaveState,
} = {}) {
  function read() {
    try {
      const persisted = loadState();
      return persisted && typeof persisted === "object" && persisted.domains
        ? persisted.domains
        : {};
    } catch {
      console.warn("⚠️  yt-dlp 412 state file unreadable — starting with empty state");
      return {};
    }
  }

  function write(domains) {
    try {
      saveState({ domains });
    } catch (e) {
      console.warn(`⚠️  yt-dlp 412 state save failed: ${e.message}`);
    }
  }

  function isDisabled() {
    return process.env.YTDLP_GUARD_DISABLED === "1";
  }

  /**
   * @param {string} domain - Domain key (see matchDomain in rate-limiter.mjs)
   * @returns {{blocked: boolean, until?: number, remainingMs?: number}}
   */
  function isBlocked(domain) {
    if (isDisabled()) return { blocked: false };
    const entry = read()[domain];
    if (!entry || typeof entry.until !== "number") return { blocked: false };
    const remainingMs = entry.until - now();
    if (remainingMs <= 0) return { blocked: false };
    return { blocked: true, until: entry.until, remainingMs };
  }

  function record412(domain) {
    if (isDisabled()) return;
    const domains = read();
    const previous = domains[domain];
    // Escalate only while the previous penalty is still active; a re-hit
    // after expiry starts a fresh 1h window (otherwise a single false
    // positive per cooldown cycle could ratchet a healthy domain to 24h).
    const stillPenalized = previous && typeof previous.until === "number" && previous.until > now();
    const consecutive = stillPenalized
      ? (typeof previous.consecutive === "number" ? previous.consecutive : 1) + 1
      : 1;
    const duration = Math.min(YTDLP_412_BASE_MS * 2 ** (consecutive - 1), YTDLP_412_MAX_MS);
    domains[domain] = { until: now() + duration, consecutive, lastAt: now() };
    write(domains);
    console.warn(
      `🚫 yt-dlp 412 guard: ${domain} penalized ${Math.round(duration / 60000)}min ` +
        `(consecutive #${consecutive}) — yt-dlp calls for this domain are skipped until then`,
    );
  }

  function recordSuccess(domain) {
    const domains = read();
    if (!domains[domain]) return;
    delete domains[domain];
    write(domains);
  }

  return { isBlocked, record412, recordSuccess };
}

function defaultLoadState() {
  const path = ytdlp412StatePath();
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function defaultSaveState(state) {
  const path = ytdlp412StatePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2), "utf8");
}

// Module-level production guard (one per process; state file is the durable layer).
const sharedGuard = createYtdlp412Guard();

/**
 * Domain bucket for a yt-dlp target. Search keywords have no URL — callers
 * pass the platform ("bilibili" | "youtube") and it maps to the site domain;
 * download URLs go through the shared suffix matcher.
 *
 * @param {string} platformOrUrl - Platform name for searches, URL for downloads
 * @param {"search"|"download"} [kind]
 * @returns {string} Domain key
 */
export function ytdlpDomain(platformOrUrl, kind = "download") {
  if (kind === "search") {
    return platformOrUrl === "bilibili"
      ? "bilibili.com"
      : platformOrUrl === "youtube"
        ? "youtube.com"
        : platformOrUrl;
  }
  // Penalty boxes isolate per upstream site: unlisted hosts (weibo.com,
  // m.weibo.cn, …) get their own bucket instead of sharing "_default".
  const bucket = matchDomain(platformOrUrl);
  if (bucket !== "_default") return bucket;
  try {
    return new URL(platformOrUrl).hostname.toLowerCase();
  } catch {
    return bucket;
  }
}

/** Guard a yt-dlp call site: true → skip this invocation (domain is penalized). */
export function ytdlpGate(domain) {
  const { blocked, until } = sharedGuard.isBlocked(domain);
  if (!blocked) return false;
  console.warn(
    `🚫 yt-dlp 412 guard: skipping ${domain} call — penalized until ${new Date(until).toISOString()}`,
  );
  return true;
}

/** Record a 412 failure for the domain (call from yt-dlp error paths). */
export function ytdlpRecord412(domain) {
  sharedGuard.record412(domain);
}

/** Clear the penalty on a successful yt-dlp call. */
export function ytdlpRecordSuccess(domain) {
  sharedGuard.recordSuccess(domain);
}

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
import { basename, dirname, isAbsolute, join } from "path";
import { fileURLToPath } from "url";
import { homedir } from "node:os";
import { execSync } from "node:child_process";
import { matchDomain } from "./rate-limiter.mjs";

/** Browser-like UA for yt-dlp invocations (#16571: UA is part of the fingerprint). */
export const YTDLP_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Firefox application root — profile discovery starts here. */
const FIREFOX_ROOT = join(homedir(), "Library", "Application Support", "Firefox");

/**
 * Parse a Firefox `profiles.ini` into `[{name, kv}]` sections.
 *
 * `profiles.ini` is a plain INI file: `[Section]` headers followed by
 * `Key=Value` lines. Blank lines and `;`/`#` comments are skipped.
 *
 * @param {string} text - profiles.ini contents
 * @returns {Array<{name: string, kv: Record<string, string>}>}
 */
export function parseFirefoxProfilesIni(text) {
  const sections = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    const header = /^\[(.+)\]$/.exec(line);
    if (header) {
      current = { name: header[1].trim(), kv: {} };
      sections.push(current);
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (kv && current) current.kv[kv[1].trim()] = kv[2].trim();
  }
  return sections;
}

/**
 * Candidate profile paths from parsed profiles.ini, most-likely-first.
 *
 * Ordering matters because the two section families can disagree, and on this
 * host they do: `[Install*] Default=` names the profile the installed Firefox
 * actually runs, while `[Profile*] Default=1` points at an EMPTY profile whose
 * `cookies.sqlite` has no `moz_cookies` table. Reading the empty one makes
 * every firefox cookie extraction die with "no such table: moz_cookies"
 * (2026-10-14), so the install-level default is consulted first.
 *
 * @param {Array<{name: string, kv: Record<string, string>}>} sections
 * @returns {string[]} Paths as written in the ini (relative or absolute)
 */
export function firefoxProfileCandidates(sections) {
  const out = [];
  const push = (p) => {
    if (p && !out.includes(p)) out.push(p);
  };
  for (const s of sections) if (/^Install/i.test(s.name)) push(s.kv.Default);
  for (const s of sections) if (/^Profile/i.test(s.name) && s.kv.Default === "1") push(s.kv.Path);
  for (const s of sections) if (/^Profile/i.test(s.name)) push(s.kv.Path);
  return out;
}

/**
 * Resolve the `--cookies-from-browser` argument for yt-dlp.
 *
 * Returns `firefox:<absolute profile path>` — the profile is pinned because
 * yt-dlp's own default selection reads `profiles.ini`'s `Default=1` entry,
 * which on this host is the empty profile (see firefoxProfileCandidates). A
 * profile is only accepted when its `cookies.sqlite` exists and is non-empty;
 * with no usable candidate the bare `"firefox"` is returned so yt-dlp still
 * gets its own attempt instead of the pipeline hard-failing.
 *
 * Firefox cookies are plaintext SQLite, so this channel never touches the
 * macOS Keychain — that is the whole point of routing YouTube here
 * (2026-10-14 user decision: the Chrome Safe Storage ACL cannot be persisted
 * for an unsigned/adhoc binary chain, so every chrome read raised a blocking
 * SecurityAgent prompt that timed out at 120s unattended; #328).
 *
 * Env: `YTDLP_FIREFOX_PROFILE` — pin a profile explicitly (name or path),
 * bypassing discovery. Use it when a machine keeps its YouTube login in a
 * profile the ini does not name.
 *
 * @param {{root?: string}} [opts] `root` overrides the Firefox app root (tests)
 * @returns {string} e.g. `firefox:/Users/me/Library/.../Profiles/abc.default-release`
 */
export function resolveFirefoxCookieSource({ root = FIREFOX_ROOT } = {}) {
  const override = process.env.YTDLP_FIREFOX_PROFILE;
  if (override) return `firefox:${override}`;

  const iniPath = join(root, "profiles.ini");
  if (!existsSync(iniPath)) return "firefox";

  let sections;
  try {
    sections = parseFirefoxProfilesIni(readFileSync(iniPath, "utf8"));
  } catch {
    return "firefox";
  }

  for (const candidate of firefoxProfileCandidates(sections)) {
    const dir = isAbsolute(candidate) ? candidate : join(root, candidate);
    try {
      const db = join(dir, "cookies.sqlite");
      if (existsSync(db) && statSync(db).size > 0) return `firefox:${dir}`;
    } catch {
      // unreadable candidate → try the next one
    }
  }
  return "firefox";
}

/** Memoized resolveFirefoxCookieSource — profile discovery is a per-process fact. */
let cachedCookieSource;
/**
 * The `--cookies-from-browser` argument every yt-dlp call site should use.
 *
 * Always Firefox: it is the only channel that both holds the YouTube login
 * (user logged in with a burner account, 2026-10-14) and avoids the Keychain.
 * Callers interpolate this into a SHELL command, so it must be quoted — the
 * path contains a space (`Application Support`).
 *
 * @returns {string} cookie source spec, e.g. `firefox:/Users/.../Profiles/x.y`
 */
export function ytdlpCookieSource() {
  if (cachedCookieSource === undefined) cachedCookieSource = resolveFirefoxCookieSource();
  return cachedCookieSource;
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
 * @returns {{httpProxy: string|null, httpsProxy: string|null}} `host:port` per enabled protocol, null when disabled
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
  // SOCKS is deliberately not surfaced: ffmpeg cannot use it, so no caller
  // has anything to do with the endpoint (see resolveYtdlpProxy).
  return {
    httpProxy: endpoint("HTTP"),
    httpsProxy: endpoint("HTTPS"),
  };
}

/**
 * Cache a successful scutil read — it is a subprocess and callers are
 * per-candidate. Process-lifetime by design: a long-running process whose
 * proxy is reconfigured mid-run keeps the first value until it restarts.
 * Failures are deliberately not cached (see readMacSystemProxy).
 */
let systemProxyCache;

/**
 * Read the macOS system proxy. Returns null off-macOS or whenever scutil
 * fails; a PAC-only config parses to an all-null endpoint pair. Never
 * throws — this must never break a download.
 *
 * @returns {{httpProxy: string|null, httpsProxy: string|null}|null}
 */
function readMacSystemProxy() {
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
 * injecting would add a warning without fixing the section download. That is
 * also why parseMacSystemProxy does not surface the SOCKS endpoint.
 *
 * @param {Object} [deps]
 * @param {Record<string, string|undefined>} [deps.env] - Environment to read
 * @param {() => ({httpProxy: string|null, httpsProxy: string|null}|null)} [deps.readSystemProxy] - System proxy source
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
 * Escape a value for a double-quoted shell word. All three call sites compose
 * `execSync` command strings, so the quoting is decided here and nowhere else.
 *
 * @param {string} value
 * @returns {string} the value wrapped in double quotes, with shell metacharacters escaped
 */
export function shellQuote(value) {
  return `"${value.replace(/([\\"`$])/g, "\\$1")}"`;
}

/**
 * Shell fragment for the yt-dlp proxy hand-off — empty when no proxy applies.
 * One place owns the quoting so every call site composes the same way.
 *
 * @returns {string} `--proxy "<url>"`, or "" when nothing is injected
 */
export function ytdlpProxyArg() {
  const proxy = resolveYtdlpProxy();
  return proxy ? `--proxy ${shellQuote(proxy)}` : "";
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
const YTDLP_412_STATE_PATH = join(STATE_DIR, "yt-dlp-412-state.json");

function ytdlp412StatePath() {
  return process.env.YTDLP_412_STATE_PATH || YTDLP_412_STATE_PATH;
}

/** First-penalty duration; doubles per consecutive 412, capped at 24h. */
const YTDLP_412_BASE_MS = 60 * 60 * 1000;
const YTDLP_412_MAX_MS = 24 * YTDLP_412_BASE_MS;

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

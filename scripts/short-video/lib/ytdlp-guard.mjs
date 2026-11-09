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
import { matchDomain } from "./rate-limiter.mjs";
import {
  parseScutilProxy,
  probePort,
  proxyUrl,
  readLoopbackPorts,
  readScutilProxy,
  resolveLocalProxy,
} from "../../lib/proxy-port.mjs";

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
// Upstream yt-dlp also covers part of this in FFmpegFD: when `--proxy` is
// given it hands the ffmpeg child BOTH HTTP_PROXY and http_proxy
// (yt_dlp/downloader/external.py; still true in 2026.07.04). That is upstream
// behaviour this repo cannot pin — if it changes, the ffmpeg leg silently
// falls back to a direct connection and the failure only shows up as a CDN
// timeout. #329 therefore stops depending on it: the two spawn sites that can
// hand the fetch to ffmpeg (`asset-sourcer.downloadYtdlp`, and the
// non-TikTok branches of `video-downloaders.downloadYtdlpAdapter`) carry the
// lower-case variable themselves via `ytdlpProxyEnv()` — as spawn env on the
// argv path, as a shell prefix on the command-string path — and the
// real-binary probe in the test suite pins the yt-dlp → ffmpeg hop.
// `video-understand.downloadVideo` is not wired: it has no
// `--download-sections` (no ffmpeg child) and no production caller — its
// command construction is #325's cleanup scope.
//
// Observed on this host 2026-09-21 (ffmpeg-wrapper probe): without `--proxy`
// the child saw only HTTP_PROXY/HTTPS_PROXY; with `--proxy` it also saw
// `http_proxy`. Re-observed 2026-10-26 (#329): the env overlay alone reaches
// the child (the automated probe covers this), and a `--proxy`-only spawn
// still gets upstream's injection (manual observation, not asserted — that
// path is no longer load-bearing).
//
// SOCKS-only system proxy (2026-09-25 triage verdict, #329): ffmpeg has no
// SOCKS support and there is no local SOCKS→HTTP bridge, so this is an
// upstream hard limit, not something to paper over. resolveYtdlpProxy states
// it once per process — `--download-sections` fetches go direct in that
// configuration and can time out at the CDN.
//
// Lowercase `http_proxy` holding a SOCKS URL (#978, 2026-11-07) is the same
// verdict on a second trigger path: the early return below is correct — the
// child inherits the exported value verbatim — but ffmpeg cannot use SOCKS and
// does not route through a SOCKS-scheme proxy URL, so the `--download-sections`
// leg fails or falls back to a direct connection while the run looks proxied.
// Observed on this host with ffmpeg 8.1.2 against a live listener and a live
// origin: `http_proxy=http://<listener>` produced one accept and zero origin
// hits, while `socks5://` and `socks5h://` produced zero accepts and origin
// hits both times — the socks URL is bypassed, not attempted. The route is
// unchanged (no injection, no SOCKS→HTTP bridge); the null is now stated once
// per process, with its own dedupe slot so neither verdict can silence the
// other.

/**
 * Cache a successful scutil read — it is a subprocess and callers are
 * per-candidate. Process-lifetime by design: a long-running process whose
 * proxy is reconfigured mid-run keeps the first value until it restarts.
 * Failures are deliberately not cached (see readMacSystemProxy).
 */
let systemProxyCache;

/**
 * Read the macOS system proxy, parsed into per-protocol entries. Returns null
 * off-macOS or whenever scutil fails. Never throws — this must never break a
 * download.
 *
 * The structured shape (`parseScutilProxy`'s per-protocol entries, not endpoint
 * strings) is what the resolution needs: the port of a protocol whose `Enable`
 * flag is off is still a candidate, because that flag is exactly what disagrees
 * with reality (see `scripts/lib/proxy-port.mjs`).
 *
 * @returns {ReturnType<typeof parseScutilProxy>|null}
 */
function readMacSystemProxy() {
  if (process.platform !== "darwin") return null;
  if (systemProxyCache !== undefined) return systemProxyCache;
  const out = readScutilProxy();
  // A failed read is not cached (#329 review): one transient scutil failure
  // would otherwise switch the proxy hand-off off for the whole process.
  if (out === null) return null;
  systemProxyCache = parseScutilProxy(out);
  return systemProxyCache;
}

/**
 * Process-lifetime answer to "which port does the system proxy forward on":
 * `undefined` = not asked yet, `null` = asked and nothing forwards.
 *
 * Cached because the probe is a network round trip and this resolves per
 * candidate — a proxy-less machine would otherwise pay the whole probe budget
 * once per asset. A *hit* is kept for the life of the process (a proxy
 * reconfigured mid-run is picked up by the next process, same rule as
 * `systemProxyCache`). A *miss* expires after `SYSTEM_PORT_MISS_TTL_MS`: one
 * transient probe failure must not switch the hand-off off for the whole run,
 * which is the same reason a failed scutil read is not cached at all.
 *
 * Only the production path shares it. A caller that injects its sources gets a
 * fresh cache unless it passes one: a cache shared across test cases would make
 * each case depend on the probe the previous one ran.
 */
const systemPortCache = { port: undefined, at: 0 };

/** How long "no port forwards" is trusted before it is probed again. */
const SYSTEM_PORT_MISS_TTL_MS = 60_000;

/**
 * Protocol precedence for this caller: HTTPS before HTTP.
 *
 * Not a preference — it is the order this file answered in before #1064, when
 * the resolution was `system?.httpsProxy || system?.httpProxy` and the first
 * one named won without a probe. `scutil` can name two different loopback ports
 * (two clients, two egress paths, recorded in
 * `docs/conventions/test-env-baseline.md`), so when both forward, "first one
 * wins" silently switches the client the download leaves through. The shared
 * resolver defaults to HTTP-first because that is what the git wrapper always
 * did; this caller keeps its own answer by saying so, which is the whole point
 * of `protocols`.
 */
const SYSTEM_PROTOCOL_ORDER = ["HTTPS", "HTTP", "SOCKS"];

/**
 * Resolve the system configuration to the port that forwards traffic — the same
 * criterion the git wrapper uses (#1064), on the ports `scutil` names plus the
 * loopback listeners.
 *
 * The ports are taken regardless of `Enable` on purpose: the observed failure
 * mode is a client that left the flag off yet still binds a working port, and
 * only the probe can tell those apart (see `scripts/lib/proxy-port.mjs`).
 *
 * @param {{
 *   system: ReturnType<typeof parseScutilProxy>,
 *   readLoopback: () => number[],
 *   probe: (port: number) => string,
 *   cache: { port?: number|null, at?: number },
 *   now?: () => number,
 * }} input
 * @returns {number|null} Port that answered `204`, or `null`
 */
function resolveSystemPort({ system, readLoopback, probe, cache, now = Date.now }) {
  const decided = cache.port !== undefined;
  const missExpired = cache.port === null && now() - (cache.at ?? 0) >= SYSTEM_PORT_MISS_TTL_MS;
  if (decided && !missExpired) return cache.port;

  // The whole decision — candidates from the parsed dict plus the listeners,
  // then the probe — is `resolveLocalProxy`. Calling it rather than repeating
  // its two lines is the point of #1064: a second copy of "merge, probe, retry
  // once" is a second place that can disagree. `protocols` keeps this caller's
  // own precedence (see `SYSTEM_PROTOCOL_ORDER`).
  cache.port = resolveLocalProxy({
    scutilProxy: system,
    readLoopback,
    probe,
    protocols: SYSTEM_PROTOCOL_ORDER,
  }).port;
  cache.at = now();
  return cache.port;
}

/** True when an endpoint is this machine — the only kind #1064 is about. */
function isLoopbackHost(host) {
  return host === "localhost" || host === "::1" || host === "[::1]" || /^127\./.test(host);
}

/**
 * A system proxy that names another machine (a corporate gateway), if one is
 * enabled — in this file's original precedence, HTTPS before HTTP.
 *
 * Such an endpoint is not a candidate for "which *local* port proxies", and the
 * probe cannot answer for it without changing what it means (it would report
 * the network's reachability, not the proxy's). So it is passed through exactly
 * as before #1064; rewriting it to `127.0.0.1` would turn a working gateway into
 * "nothing forwards" and send downloads direct — the failure this ticket removes.
 *
 * @param {ReturnType<typeof parseScutilProxy>} system
 * @returns {{host: string, port: number}|null}
 */
function remoteSystemEndpoint(system) {
  for (const proto of ["HTTPS", "HTTP"]) {
    const entry = system?.[proto];
    if (entry?.enabled && entry.host && entry.port && !isLoopbackHost(entry.host)) {
      return { host: entry.host, port: entry.port };
    }
  }
  return null;
}

/** Add the http:// scheme ffmpeg and yt-dlp both expect on a bare host:port. */
function withScheme(value) {
  return /^[0-9a-zA-Z+.-]+:\/\//.test(value) ? value : `http://${value}`;
}

/**
 * True when a proxy URL names a SOCKS endpoint. Covers the spellings an
 * operator can realistically export: `socks://`, `socks4://`, `socks4a://`,
 * `socks5://` and `socks5h://`, case-insensitively, with zero to two slashes
 * after the scheme (`socks5:/host` is a common hand-edit). A bare `host:port`
 * is not a SOCKS URL — it keeps the pre-#978 semantics (no scheme, no verdict).
 *
 * @param {string} value - proxy URL from the environment
 * @returns {boolean}
 */
function isSocksProxyUrl(value) {
  return /^socks(?:4a?|5h?)?:\/{0,2}/i.test(value.trim());
}

/**
 * A host we are willing to print: an IPv4 literal, `localhost`, bracketed
 * IPv6, or a dotted name whose labels are letters only.
 *
 * Letters-only is the narrow part: it drops the token shapes that would
 * otherwise read as a hostname (`eyJ1…` in a JWT, `sk-live-abc.def` in an API
 * key), and numeric labels are accepted only in the IPv4 form, so
 * `5.6.7.8.9.10` is rejected. What it does *not* reject is a purely alphabetic
 * `username.password` — that is indistinguishable from `proxy.corp` by shape,
 * so it is a known narrow tradeoff rather than a guarantee: real credential
 * syntax is `user:pass@host`, and the `@` gate below catches that.
 */
const PROXY_HOST =
  /^(?:(?:\d{1,3}\.){3}\d{1,3}|localhost|\[[0-9A-Fa-f:.]+\]|[A-Za-z]+(?:\.[A-Za-z]+)+)$/;

/** Longest endpoint worth printing; a DNS name is ≤253 chars plus `:port`. */
const PROXY_ENDPOINT_MAX = 300;

/**
 * The endpoint a warning may name — or nothing.
 *
 * The gate is "no secrets in logs", and every attempt to *find* the endpoint
 * inside an arbitrary value leaked on some shape: `new URL` and a
 * `user:pass@` regex end the userinfo at the first `/`, so `ops:1234/5678@h`
 * printed `ops:1234`; a last-`@` boundary still printed the password tail when
 * the host was truncated (`operator:pa@ssword` → `ssword`); and with no `@` at
 * all, a token like `operator.sup3rsecret` is indistinguishable from a host.
 *
 * So the default is to print nothing, and a value is named only when it is
 * provably a bare endpoint: no `@`, no path, no whitespace, within
 * `PROXY_ENDPOINT_MAX`, and a host that passes `PROXY_HOST`. Credential-bearing
 * values — the only reason this function exists — never pass.
 *
 * @param {string} value - proxy URL from the environment
 * @returns {string} `host[:port]` for a provably bare endpoint, else a placeholder
 */
function describeProxyEndpoint(value) {
  const trimmed = value.trim();
  // Credentials live in userinfo, and userinfo is the one thing this function
  // exists to hide: the presence of `@` is the whole verdict, not a hint to
  // parse around.
  if (trimmed.includes("@")) return "<credentials-redacted proxy URL>";
  if (/\s/.test(trimmed)) return "<unparseable proxy URL>";
  // A value far longer than any endpoint is not a diagnostic; printing it
  // would only move the secret-shaped text into the log at full length.
  if (trimmed.length > PROXY_ENDPOINT_MAX) return "<unparseable proxy URL>";

  // At least one `/` is required, or a bare `127.0.0.1:7897` / `proxy.corp:7890`
  // reads as `scheme:` and loses its host to the strip.
  const authority = trimmed.replace(/^[A-Za-z0-9+.-]+:\/{1,2}/, "");
  // Bracketed IPv6 contains the same `:` that separates the port, so it is
  // matched as a unit rather than by splitting on the last colon.
  const bracketed = authority.match(/^(\[[0-9A-Fa-f:.]+\])(?::(\d{1,5}))?$/);
  if (bracketed) return bracketed[2] ? `${bracketed[1]}:${bracketed[2]}` : bracketed[1];
  const match = authority.match(/^([^/?#:]+)(?::(\d{1,5}))?$/);
  if (!match) return "<unparseable proxy URL>";
  const [, host, port] = match;
  if (!PROXY_HOST.test(host)) return "<unparseable proxy URL>";
  return port ? `${host}:${port}` : host;
}

/**
 * State that an env-provided proxy is a SOCKS URL ffmpeg cannot use.
 *
 * Three env spellings reach the ffmpeg leg, and all three failed silently
 * before #978: a lowercase `http_proxy` (inherited verbatim), and the
 * uppercase `HTTP_PROXY` / `https_proxy` / `HTTPS_PROXY` values this seam
 * mirrors into `--proxy` *and* into the child's `http_proxy` via
 * `ytdlpProxyEnv()` — the latter is worse, because the overlay then carries a
 * SOCKS URL this repo manufactured. The route does not change in any case
 * (yt-dlp's own layer can use SOCKS; ffmpeg cannot); the verdict is stated
 * once per env path, naming the variable the operator has to change.
 *
 * @param {string} variable - the env variable holding the SOCKS URL
 * @param {string} value - its value
 * @param {{socksInEnv?: boolean}} warnings - dedupe state
 * @param {(message: string) => void} warn - warning sink
 */
function warnSocksEnvProxy(variable, value, warnings, warn) {
  if (warnings.socksInEnv) return;
  warnings.socksInEnv = true;
  warn(
    `[ytdlp-guard] ${variable} is a SOCKS URL (${describeProxyEndpoint(value)}); ` +
      ffmpegSocksGap(`Export http_proxy=<an HTTP proxy> to cover the ffmpeg leg (#329, #978).`),
  );
}

/**
 * The half of every SOCKS verdict that is true whichever way the value got
 * here: ffmpeg cannot use SOCKS, so that leg does not go through this proxy.
 * One sentence, one owner — the two verdicts differ in what to change, not in
 * this consequence.
 *
 * @param {string} remedies - the closing "what to export instead" sentence
 * @returns {string}
 */
function ffmpegSocksGap(remedies) {
  return (
    `ffmpeg cannot use SOCKS, so downloads it handles (e.g. --download-sections) ` +
    `do not go through that proxy: they fail or fall back to a direct connection and may time out at the CDN. ` +
    remedies
  );
}

/**
 * Per-process SOCKS verdict state — callers resolve per candidate, so without
 * dedupe the warning would repeat for every one. `socksOnly` covers the macOS
 * system config; `socksInEnv` covers any env variable whose proxy value is a
 * SOCKS URL (#978). Separate slots on purpose: two trigger paths, two
 * remedies. Injectable so tests can get a fresh verdict without touching
 * module state.
 */
const proxyWarnings = { socksOnly: false, socksInEnv: false };

/**
 * Upper-case proxy variables, in the order they win — highest first.
 *
 * The value and the name reported by the SOCKS warning both come from a single
 * walk of this list, so the precedence exists once: reordering it or adding a
 * variable cannot leave the warning blaming a source that did not supply the
 * value.
 */
const ENV_PROXY_KEYS = ["https_proxy", "HTTP_PROXY", "HTTPS_PROXY"];

/**
 * Resolve the proxy to hand to yt-dlp via `--proxy`, or null when none is needed.
 *
 * A lowercase `http_proxy` means the ffmpeg child already inherits the exact
 * variable it reads, so this returns null — duplicating it would override
 * yt-dlp's own no_proxy handling for no gain (`ytdlpProxyEnv()` then adds
 * nothing, and the child keeps the inherited value). Every other case
 * (uppercase-only env, or nothing but the macOS system proxy) resolves a URL
 * callers pass both as `--proxy` and as the spawn-env overlay.
 *
 * That value is not always usable: ffmpeg has no SOCKS support and does not
 * route through a SOCKS-scheme proxy URL, so a SOCKS URL in `http_proxy`
 * leaves the `--download-sections` leg failing or direct-connected while the
 * run looks proxied. The same holds for the uppercase spellings this seam
 * mirrors into the child's `http_proxy` — see `warnSocksEnvProxy`. The route
 * does not change in either case (#978, same verdict as #329); the null is
 * stated once per process, in its own dedupe slot.
 *
 * A SOCKS-only system config yields null for the same reason: ffmpeg cannot
 * use SOCKS, and yt-dlp's own layer already resolves SystemConfiguration by
 * itself. #329 verdict (2026-09-25): that is an upstream hard limit, not
 * something to paper over, so the null is *stated* once per process — this
 * function is the one seam every call site goes through, which is why the
 * warning lives here rather than at each spawn.
 *
 * Which system port to use is *probed*, not read from `<Proto>Enable` (#1064):
 * the flag is what was observed lying, and `resolveSystemPort` is the same
 * criterion the git wrapper and the colima tunnel use. The verdict still fires
 * when HTTP/HTTPS are enabled but nothing forwards — the remedy ("export an HTTP
 * proxy") is the same, and the message names the endpoint ffmpeg cannot use.
 *
 * @param {Object} [deps]
 * @param {Record<string, string|undefined>} [deps.env] - Environment to read
 * @param {() => (ReturnType<typeof parseScutilProxy>|null)} [deps.readSystemProxy] - System proxy source
 * @param {() => number[]} [deps.readLoopback] - Loopback listener ports, for candidates
 * @param {(port: number) => string} [deps.probe] - Per-port proxy probe, synchronous
 * @param {{port?: number|null}} [deps.cache] - Resolved-port cache (see `systemPortCache`)
 * @param {{socksOnly?: boolean, socksInEnv?: boolean}} [deps.warnings] - SOCKS verdict dedupe state
 * @param {(message: string) => void} [deps.warn] - Warning sink (side effect: called at most once per verdict per `warnings` object)
 * @returns {string|null} proxy URL to pass as `--proxy`, or null
 */
export function resolveYtdlpProxy({
  env = process.env,
  readSystemProxy = readMacSystemProxy,
  readLoopback = readLoopbackPorts,
  probe = probePort,
  cache = null,
  warnings = proxyWarnings,
  warn = (message) => console.warn(message),
} = {}) {
  if (env.http_proxy) {
    if (isSocksProxyUrl(env.http_proxy)) {
      warnSocksEnvProxy("http_proxy", env.http_proxy, warnings, warn);
    }
    return null;
  }
  const envProxyVar = ENV_PROXY_KEYS.find((key) => env[key]);
  if (envProxyVar) {
    const fromEnv = env[envProxyVar];
    // The value is mirrored into the ffmpeg child's `http_proxy` by
    // `ytdlpProxyEnv()`, so a SOCKS URL here is worse than the inherited case:
    // this repo manufactures an env var ffmpeg will ignore.
    if (isSocksProxyUrl(fromEnv)) {
      warnSocksEnvProxy(envProxyVar, fromEnv, warnings, warn);
    }
    return withScheme(fromEnv);
  }
  let system;
  try {
    system = readSystemProxy();
  } catch {
    return null;
  }
  if (!system) return null;
  const remote = remoteSystemEndpoint(system);
  if (remote) return proxyUrl(remote.port, remote.host);
  // An injected reader is a test seam; a cache shared between cases would make
  // each one depend on the probe the previous one ran.
  const usingDefaultReader = readSystemProxy === readMacSystemProxy;
  const resolvedCache = cache ?? (usingDefaultReader ? systemPortCache : {});
  const port = resolveSystemPort({ system, readLoopback, probe, cache: resolvedCache });
  if (port !== null) return proxyUrl(port);
  const socks = system.SOCKS;
  if (socks?.enabled && !warnings.socksOnly) {
    warnings.socksOnly = true;
    warn(
      `[ytdlp-guard] system proxy is SOCKS-only (${describeProxyEndpoint(`${socks.host}:${socks.port}`)}); ` +
        ffmpegSocksGap(`Export http_proxy=<an HTTP proxy> to cover the ffmpeg leg (#329).`),
    );
  }
  return null;
}

/**
 * Environment overlay for a yt-dlp spawn that delegates the fetch to ffmpeg
 * (#329). ffmpeg reads only the lower-case `http_proxy`, and yt-dlp hands its
 * child whatever the parent env holds — so passing the resolved proxy here
 * makes that hop a property of this repo instead of an upstream detail.
 *
 * Empty when there is nothing to inject: no proxy applies, or a lower-case
 * variable is already exported and the child inherits it as-is.
 *
 * Carries resolveYtdlpProxy's side effects: the first SOCKS-only system
 * verdict and the first SOCKS-scheme env-proxy verdict in the process each
 * emit their one warning here too.
 *
 * @param {Object} [deps] - Same seams as resolveYtdlpProxy
 * @param {Record<string, string|undefined>} [deps.env] - Environment to read
 * @param {() => ({httpProxy: string|null, httpsProxy: string|null, socksProxy?: string|null}|null)} [deps.readSystemProxy] - System proxy source
 * @param {{socksOnly?: boolean, socksInEnv?: boolean}} [deps.warnings] - SOCKS verdict dedupe state
 * @param {(message: string) => void} [deps.warn] - Warning sink (side effect: called at most once per verdict per `warnings` object)
 * @returns {{http_proxy?: string}} overlay to spread into the spawn env
 */
export function ytdlpProxyEnv(deps = {}) {
  const proxy = resolveYtdlpProxy(deps);
  return proxy ? { http_proxy: proxy } : {};
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
 * Carries resolveYtdlpProxy's side effects: the first SOCKS-only system verdict
 * and the first SOCKS-scheme env-proxy verdict in the process each emit their
 * one warning here too.
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

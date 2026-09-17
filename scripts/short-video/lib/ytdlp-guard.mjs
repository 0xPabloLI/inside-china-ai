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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { matchDomain } from "./rate-limiter.mjs";

/** Browser-like UA for yt-dlp invocations (#16571: UA is part of the fingerprint). */
export const YTDLP_BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");

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
  return /412|precondition failed/i.test(stderr) || /412|precondition failed/i.test(message);
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
    const consecutive = (typeof previous?.consecutive === "number" ? previous.consecutive : 0) + 1;
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

/**
 * Per-domain rate limiter for CDP navigation (#89 P0).
 *
 * Decides, for a given navigation URL, whether to proceed immediately,
 * wait a randomized interval, or skip (hourly cap exceeded with an
 * unaffordable wait). Designed as a pure decision module: time, sleep,
 * randomness and persistence are all injected, so tests run instantly.
 *
 * Consumers: cdp-client.mjs wires this into cdpNewTab so every CDP
 * navigation (search-sources, asset-sourcer, extract-media,
 * video-understand) is rate limited without caller changes.
 *
 * Env escape hatch: RATE_LIMITER_DISABLED=1 disables all waits and
 * state writes (for tests and debugging).
 */

// Per-domain config from issue #89 research baseline.
// Keys are matched as hostname suffixes (longest match wins).
export const SITE_RATE_CONFIG = {
  "google.com": { baseDelay: 8000, jitter: [0.5, 1.5], maxPerHour: 30 },
  "bing.com": { baseDelay: 5000, jitter: [0.6, 1.4], maxPerHour: 60 },
  "baidu.com": { baseDelay: 7000, jitter: [0.7, 1.3], maxPerHour: 40 },
  // DuckDuckGo is scraping-friendly (10 req/s API-level ceiling, no CAPTCHA);
  // the HTML endpoint may return 202/403 when rate limited (#91).
  "duckduckgo.com": { baseDelay: 3000, jitter: [0.6, 1.4], maxPerHour: 120 },
  "bilibili.com": { baseDelay: 5000, jitter: [0.6, 1.4], maxPerHour: 50 },
  "zhihu.com": { baseDelay: 7000, jitter: [0.7, 1.3], maxPerHour: 40 },
  "xiaohongshu.com": { baseDelay: 15000, jitter: [0.6, 1.4], maxPerHour: 20 },
  // Self-hosted services on the local machine (SearXNG #92) — no throttle:
  // zero inter-request delay and no hourly cap. The host proxy carries the
  // per-backend-engine limits, not the local frontend.
  localhost: { baseDelay: 0, jitter: [1, 1], maxPerHour: Infinity },
  _default: { baseDelay: 1000, jitter: [0.5, 2.0], maxPerHour: 200 },
};

// Sliding window: requests newer than this count toward maxPerHour.
export const WINDOW_MS = 60 * 60 * 1000;
// #249: when the hourly-cap wait exceeds this, skip the navigation entirely
// instead of blocking the pipeline (the 554s Google block observed in Stage 4
// B-roll search was under the old 10min budget and stalled the whole run).
// Only cap waits are skipped — interval (baseDelay) politeness waits are
// always affordable and never skipped, so the skip threshold must stay above
// every configured jitter×baseDelay ceiling (largest: xiaohongshu ≈ 21s).
// Callers (cdp-client → asset-sourcer / search-sources) catch the resulting
// skip and move on to the next source in their fallback chain.
export const SKIP_WAIT_MS = 15 * 1000;

/**
 * Match a URL to its rate-limit domain key.
 *
 * Suffix matching against SITE_RATE_CONFIG keys (e.g. "google.com"
 * matches "www.google.com" and "news.google.com"); longest key wins.
 * Unparseable URLs and unknown domains resolve to "_default".
 *
 * @param {string} url - Navigation target URL
 * @returns {string} Domain key from SITE_RATE_CONFIG
 */
export function matchDomain(url) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return "_default";
  }
  let best = null;
  for (const key of Object.keys(SITE_RATE_CONFIG)) {
    if (key === "_default") continue;
    if (hostname === key || hostname.endsWith("." + key)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best || "_default";
}

/**
 * Create a rate limiter instance.
 *
 * @param {Object} [deps] - Injected dependencies
 * @param {() => number} [deps.now] - Current time in ms
 * @param {(ms: number) => Promise<void>} [deps.sleep] - Wait primitive
 * @param {() => number} [deps.random] - RNG in [0, 1) for jitter
 * @param {() => Object|null} [deps.loadState] - Load persisted window state
 * @param {(state: Object) => void} [deps.saveState] - Persist window state
 * @param {number} [deps.skipWaitMs] - Hourly-cap wait above which the
 *   navigation is skipped instead of blocking (default SKIP_WAIT_MS)
 * @param {boolean} [deps.disabled] - Escape hatch (also via RATE_LIMITER_DISABLED=1)
 * @returns {{ wait(url: string): Promise<{action: string, waitedMs: number, domain: string}> }}
 *   wait() returns { action: "pass" | "waited" | "skip", waitedMs, domain }.
 *   "skip" means the navigation should not proceed (hourly cap + over-cap wait).
 */
export function createRateLimiter({
  now = () => Date.now(),
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
  loadState = () => null,
  saveState = () => {},
  skipWaitMs = SKIP_WAIT_MS,
  disabled = process.env.RATE_LIMITER_DISABLED === "1",
} = {}) {
  // domain -> array of request timestamps (ascending), pruned to the window.
  // Loaded lazily on the first enabled wait() so tests can stub the env var
  // after module import (import-time I/O would also slow test startup).
  let windows = {};
  let loaded = false;

  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    try {
      const persisted = loadState();
      if (persisted && typeof persisted === "object" && persisted.domains) {
        windows = persisted.domains;
      }
    } catch {
      console.warn("⚠️  Rate limiter state file unreadable — starting with empty state");
      windows = {};
    }
  }

  function prune(domain, ts) {
    const entries = Array.isArray(windows[domain]) ? windows[domain] : [];
    const fresh = entries.filter((t) => ts - t < WINDOW_MS);
    windows[domain] = fresh;
    return fresh;
  }

  function persist() {
    try {
      saveState({ domains: windows });
    } catch (e) {
      console.warn(`⚠️  Rate limiter state save failed: ${e.message}`);
    }
  }

  async function wait(url) {
    const domain = matchDomain(url);
    // Lazy check so tests/scripts can stub the env var after module import
    const isDisabled = disabled || process.env.RATE_LIMITER_DISABLED === "1";
    if (isDisabled) {
      return { action: "pass", waitedMs: 0, domain };
    }
    ensureLoaded();
    const cfg = SITE_RATE_CONFIG[domain];
    const ts = now();

    const entries = prune(domain, ts);

    // 1. Interval since last request (first request: no wait) — politeness
    //    jitter, always affordable (bounded by jitter×baseDelay ≈ 21s max).
    let intervalWaitMs = 0;
    const last = entries[entries.length - 1];
    if (last !== undefined) {
      const [min, max] = cfg.jitter;
      const factor = min + random() * (max - min);
      const interval = Math.round(cfg.baseDelay * factor);
      intervalWaitMs = Math.max(0, last + interval - ts);
    }

    // 2. Hourly cap: wait until the oldest timestamp leaves the window
    let capWaitMs = 0;
    if (entries.length >= cfg.maxPerHour && entries.length > 0) {
      capWaitMs = Math.max(0, entries[0] + WINDOW_MS - ts);
    }

    // 3. Over-cap wait → skip the navigation entirely (#249). The source is
    //    temporarily exhausted; callers switch to their next source instead
    //    of blocking the whole pipeline (previously up to 10min, observed
    //    554s for google.com in Stage 4 B-roll search).
    if (capWaitMs > skipWaitMs) {
      console.warn(
        `🚫 Rate limiter: ${domain} hourly cap reached (${entries.length}/${cfg.maxPerHour}), ` +
          `required wait ${Math.round(capWaitMs / 1000)}s exceeds ${Math.round(skipWaitMs / 1000)}s ` +
          `skip threshold — skipping (caller should try other sources)`,
      );
      return { action: "skip", waitedMs: 0, domain };
    }

    const waitMs = Math.max(intervalWaitMs, capWaitMs);

    let waitedMs = 0;
    if (waitMs > 0) {
      console.log(`⏳ Rate limiter: waiting ${Math.round(waitMs / 1000)}s for ${domain}`);
      await sleep(waitMs);
      waitedMs = waitMs;
    }

    // Record the attempt (navigation proceeds from here — failures count too)
    const recordedTs = now();
    const fresh = prune(domain, recordedTs);
    fresh.push(recordedTs);
    persist();

    return { action: waitedMs > 0 ? "waited" : "pass", waitedMs, domain };
  }

  return { wait };
}

/**
 * Chrome DevTools Protocol (CDP) client.
 *
 * Generic CDP utilities for communicating with a local Chrome Remote
 * Debugging proxy (e.g. the web-access skill's proxy at localhost:3456).
 *
 * Used by: search-sources.mjs, and any script that needs to scrape
 * web pages through the user's authenticated Chrome session.
 */

import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { createRateLimiter } from "./rate-limiter.mjs";

export const CDP_BASE = process.env.CDP_BASE_URL || "http://localhost:3456";

// #89 P1: escalating random backoff replaces the fixed 3s retry wait.
// Deterministic ranges keep waits auditable; an attempt beyond the schedule
// returns null (give up). 429/503 responses back off an order of magnitude
// longer — the server told us to slow down, so a small jitter is pointless.
export const BACKOFF_RANGES_MS = [
  [3000, 5000], // retry 1
  [6000, 10000], // retry 2
  [12000, 20000], // retry 3 — give up after this
];
export const RATE_LIMIT_BACKOFF_MS = [30000, 60000];

/**
 * Delay before the given retry attempt (1-based), or null when retries are
 * exhausted.
 *
 * @param {number} attempt - 1-based retry attempt number
 * @param {() => number} [rand] - RNG seam (tests)
 * @returns {number|null} milliseconds to wait, or null to give up
 */
export function backoffDelayMs(attempt, rand = Math.random) {
  const range = BACKOFF_RANGES_MS[attempt - 1];
  if (!range) return null;
  return Math.round(range[0] + rand() * (range[1] - range[0]));
}

/**
 * Longer delay for HTTP 429/503 (order of magnitude above normal retries).
 */
export function rateLimitBackoffDelayMs(rand = Math.random) {
  return Math.round(
    RATE_LIMIT_BACKOFF_MS[0] + rand() * (RATE_LIMIT_BACKOFF_MS[1] - RATE_LIMIT_BACKOFF_MS[0]),
  );
}

// #89 P0: per-domain rate limiting for every CDP navigation.
// Wired into cdpNewTab so all consumers (search-sources, asset-sourcer,
// extract-media, video-understand) are covered without caller changes.
// Hourly sliding-window timestamps persist to the gitignored output dir so
// consecutive runs keep aggregating request volume per domain.
const STATE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "output");
const rateLimiter = createRateLimiter({
  loadState: () => {
    try {
      const p = join(STATE_DIR, "rate-limiter-state.json");
      if (!nodeFs.existsSync(p)) return null;
      return JSON.parse(nodeFs.readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  },
  saveState: (state) => {
    try {
      nodeFs.mkdirSync(STATE_DIR, { recursive: true });
      nodeFs.writeFileSync(
        join(STATE_DIR, "rate-limiter-state.json"),
        JSON.stringify(state),
        "utf8",
      );
    } catch (e) {
      console.warn(`⚠️  Rate limiter state save failed: ${e.message}`);
    }
  },
});

/**
 * Thrown by cdpNewTab when the rate limiter decides to skip a navigation
 * (#249: hourly-cap wait over the skip threshold). Unlike a transport
 * failure this means "this source is temporarily exhausted" — callers
 * (search-sources fallback chains, asset-sourcer source loops) catch it,
 * record which source/keyword was skipped, and continue with the next
 * source instead of treating it as a broken source.
 */
export class RateLimitedSkipError extends Error {
  /**
   * @param {string} domain - Rate-limited domain key from the limiter
   * @param {string} message - Human-readable reason
   */
  constructor(domain, message) {
    super(message);
    this.name = "RateLimitedSkipError";
    this.domain = domain;
  }
}

/**
 * Create a new browser tab via the CDP proxy.
 *
 * Rate-limited per domain (#89 P0): waits a randomized interval between
 * navigations to the same site and enforces an hourly cap. When the cap
 * would force an unaffordable wait, throws so callers degrade via their
 * existing fallback chain (CDP → googleSiteFallback → MCP).
 *
 * @param {string} url - URL to navigate to
 * @returns {Promise<string>} Tab ID (targetId)
 * @throws {Error} If the proxy doesn't return a targetId, or navigation is
 *   skipped by the rate limiter
 */
export async function cdpNewTab(url) {
  const limit = await rateLimiter.wait(url);
  if (limit.action === "skip") {
    throw new RateLimitedSkipError(
      limit.domain,
      `Rate limited: ${limit.domain} hourly cap exceeded — navigation skipped`,
    );
  }

  const resp = await fetch(`${CDP_BASE}/new`, {
    method: "POST",
    body: url,
  });
  const data = await resp.json();
  // #273 P0.2: the proxy refuses work when its concurrency guard is saturated
  // (it protects the single Chrome instead of dying under N parallel
  // pipelines). That is "temporarily exhausted", not "source broken" — map it
  // onto the skip path so the caller's fallback chain carries on.
  if (data.code === "CDP_PROXY_QUEUE_FULL" || data.code === "CDP_PROXY_QUEUE_TIMEOUT") {
    throw new RateLimitedSkipError(
      "cdp-proxy",
      `CDP proxy saturated (${data.code}) — navigation skipped, retry later`,
    );
  }
  if (!data.targetId) {
    throw new Error(`Failed to create tab for ${url}`);
  }
  return data.targetId;
}

/**
 * Thrown when a page-side extraction script fails (#308).
 *
 * The CDP proxy answers an eval of a throwing page script with HTTP 400
 * `{error: <description>}`. Before #308 both that error AND transport
 * failures were collapsed to a silent `[]` by extractFromTab — a rotted
 * selector looked exactly like "no news today" (the googleSiteFallback
 * dead layer stayed invisible for weeks). A ScriptError means "the script
 * is broken" — retrying it is pointless, so extractWithRetry lets it
 * propagate immediately while empty-array results keep their backoff.
 *
 * Callers decide the fail-open boundary: search-sources records the
 * `script-error` trajectory reason and continues its fallback chain;
 * asset-sourcer logs loudly and skips the source.
 */
export class ScriptError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScriptError";
  }
}

/**
 * Evaluate a JavaScript expression in a tab.
 *
 * @param {string} tabId - Tab ID from cdpNewTab
 * @param {string} script - JavaScript expression to evaluate
 * @returns {Promise<object>} Raw CDP eval response
 */
export async function cdpEval(tabId, script) {
  const resp = await fetch(`${CDP_BASE}/eval?target=${tabId}`, {
    method: "POST",
    body: script,
  });
  return resp.json();
}

/**
 * Close a browser tab. Silently ignores errors.
 *
 * @param {string} tabId - Tab ID to close
 */
export async function cdpCloseTab(tabId) {
  try {
    await fetch(`${CDP_BASE}/close?target=${tabId}`);
  } catch {
    // Ignore close errors
  }
}

/**
 * Wait for a tab's page to finish loading.
 *
 * Polls `document.readyState` up to `retries` times.
 *
 * @param {string} tabId - Tab ID
 * @param {number} [retries=2] - Number of retries (0 = check once)
 * @returns {Promise<boolean>} True if readyState is "complete" or "interactive"
 */
export async function waitForPageLoad(tabId, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await cdpEval(tabId, "document.readyState");
      const ready = resp?.result?.value || resp?.value || "";
      if (ready === "complete" || ready === "interactive") {
        return true;
      }
    } catch {
      // Tab not ready yet
    }
    if (i < retries) {
      // #89 P1: escalating wait instead of a fixed 3s between load polls
      const delay = backoffDelayMs(i + 1);
      await new Promise((r) => setTimeout(r, delay ?? 3000));
    }
  }
  return false;
}

/**
 * Extract content from a tab, retrying with escalating backoff (#89 P1).
 *
 * Up to 3 retries (3-5s → 6-10s → 12-20s, randomized); gives up after that
 * so the caller's fallback chain (googleSiteFallback → MCP) takes over.
 *
 * #308: extraction errors are NOT retried — a ScriptError (broken page
 * script) or a transport failure propagates immediately. The backoff loop
 * only covers "page loaded but selector found nothing yet", where waiting
 * genuinely helps.
 *
 * @param {string} tabId - Tab ID
 * @param {string} script - JS expression that returns an array
 * @param {object} [opts]
 * @param {(tabId: string, script: string) => Promise<Array>} [opts.extractFn] - extraction seam (tests)
 * @param {(ms: number) => Promise<void>} [opts.sleepFn] - sleep seam (tests)
 * @returns {Promise<Array>} Extracted articles (empty array after exhaustion)
 * @throws {ScriptError} When the extraction script itself is broken
 * @throws {Error} When the eval transport fails
 */
export async function extractWithRetry(tabId, script, opts = {}) {
  const extractFn = opts.extractFn || extractFromTab;
  const sleepFn = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  let articles = await extractFn(tabId, script);
  for (let attempt = 1; articles.length === 0; attempt++) {
    const delay = backoffDelayMs(attempt);
    if (delay === null) break;
    console.log(
      `  ⏳ No articles found — retry ${attempt}/${BACKOFF_RANGES_MS.length} in ${(delay / 1000).toFixed(1)}s...`,
    );
    await sleepFn(delay);
    articles = await extractFn(tabId, script);
  }
  return articles;
}

// ─── #89 P2: generic anti-bot / CAPTCHA detection ───

/**
 * Indicators from the #89 research report. `robot` is special-cased: as a
 * bare substring it false-positives on AI news articles ("Robots learned to
 * dance"), so it only matches explicit interstitial phrases — see
 * ROBOT_PHRASES in matchAntiBotIndicators.
 */
export const GENERIC_ANTI_BOT_INDICATORS = [
  "unusual traffic",
  "captcha",
  "robot",
  "验证码",
  "人机验证",
  "access denied",
  "blocked",
  "429",
  "precondition failed",
];

const ROBOT_PHRASES = [/are you a robot/i, /robot check/i, /robot or human/i];

/**
 * Match a page's text against the anti-bot indicators (pure, testable).
 *
 * @param {string|undefined} text - title + h1 + body head + DOM hints
 * @returns {string|null} the matched indicator, or null when the page looks clean
 */
export function matchAntiBotIndicators(text) {
  if (!text) return null;
  const lower = String(text).toLowerCase();
  for (const indicator of GENERIC_ANTI_BOT_INDICATORS) {
    if (indicator === "robot") {
      if (ROBOT_PHRASES.some((re) => re.test(text))) return indicator;
      continue;
    }
    // `429` is a number: as a bare substring it also matches "4290 views",
    // "id=1429" and "¥429" — an interstitial names the status as a token.
    if (indicator === "429") {
      if (/\b429\b/.test(text)) return indicator;
      continue;
    }
    if (lower.includes(indicator)) return indicator;
  }
  return null;
}

// Evaluates cheap signals only: title, first heading, the first 600 chars of
// body text, and CAPTCHA containers that are actually on screen. Full-page
// scans would false-positive on legitimate article content.
// Exported for tests: the size gate is the whole point of this script.
export const ANTI_BOT_CHECK_SCRIPT = `
  (() => {
    const title = document.title || "";
    const h1 = document.querySelector("h1")?.innerText || "";
    const bodyHead = (document.body?.innerText || "").slice(0, 600);
    // A captcha *container* only evidences an interstitial when it is visible.
    // Legitimate sites embed invisible reCAPTCHA / Turnstile widgets (and use
    // "captcha" in class names) for their own forms — the previous "any
    // matching element counts" rule labelled techcrunch / guancha / thepaper /
    // xhs / douyin as anti-bot and returned before extraction ever ran
    // (measured 2026-09-23: all five render a clean result page at t+5s).
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width >= 100 && r.height >= 40;
    };
    const sel = 'iframe[src*="captcha" i], .g-recaptcha, #captcha, [class*="captcha" i], [id*="captcha" i]';
    let captchaVisible = false;
    for (const el of document.querySelectorAll(sel)) {
      if (visible(el)) { captchaVisible = true; break; }
    }
    return JSON.stringify({ text: title + " " + h1 + " " + bodyHead, captchaVisible });
  })()
`;

/**
 * Read the page sample returned by `ANTI_BOT_CHECK_SCRIPT`. Kept separate so
 * the JSON shape and the legacy concatenated-string shape (older stubs, tests)
 * are decided in one place.
 *
 * @param {unknown} value - the eval result
 * @returns {{ text: string, captchaVisible: boolean }}
 */
export function parseAntiBotSample(value) {
  if (typeof value !== "string") return { text: "", captchaVisible: false };
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return { text: String(parsed.text ?? ""), captchaVisible: Boolean(parsed.captchaVisible) };
      }
    } catch {
      /* not JSON after all — fall through to the legacy shape */
    }
  }
  return { text: value, captchaVisible: false };
}

/**
 * Detect generic anti-bot / CAPTCHA interstitials on a tab (#89 P2).
 *
 * Runs for every CDP page before extraction, complementing the per-source
 * loginCheckScript. Fail-open: if the check itself errors, the page is
 * treated as clean — a broken check must not block scraping.
 *
 * Evidence strength is deliberately asymmetric. *Text* evidence (the page says
 * "unusual traffic" / "验证码" / "are you a robot") describes an interstitial and
 * is reported either way. A *widget* is much weaker: plenty of healthy pages
 * embed a visible captcha container for their own forms, so the DOM hint is
 * opt-in via `allowDomHint` and belongs at the "and nothing was extracted
 * either" checkpoint, not in the pre-flight gate.
 *
 * @param {string} tabId - Tab ID
 * @param {object} [opts]
 * @param {(tabId: string, script: string) => Promise<object>} [opts.evalFn] - eval seam (tests)
 * @param {boolean} [opts.allowDomHint=false] - also report a visible captcha widget
 * @returns {Promise<string|null>} the matched indicator, or null when clean
 */
export async function detectAntiBot(tabId, opts = {}) {
  const evalFn = opts.evalFn || cdpEval;
  const allowDomHint = opts.allowDomHint === true;
  try {
    const resp = await evalFn(tabId, ANTI_BOT_CHECK_SCRIPT);
    const value = resp?.result?.value ?? resp?.value ?? "";
    const { text, captchaVisible } = parseAntiBotSample(value);
    const fromText = matchAntiBotIndicators(text);
    if (fromText) return fromText;
    // The DOM hint is its own answer, not a magic string smuggled into the text
    // sample (which is how every "captcha" in the DOM used to be reported as a
    // text match on the word "captcha").
    return allowDomHint && captchaVisible ? "captcha-dom" : null;
  } catch {
    return null;
  }
}

/**
 * Extract content from a tab by evaluating an extraction script.
 *
 * The script is wrapped in an IIFE (CDP eval doesn't support top-level return).
 * Handles various CDP response formats: result.value, value, JSON string, or null.
 *
 * #308: extraction no longer swallows failures into a silent []. A
 * proxy-reported page-script exception throws ScriptError; a transport
 * failure (proxy down, tab closed) rethrows the original error. Only
 * legitimate "nothing extracted" shapes (null, non-JSON string, non-array
 * value) still resolve to [] so the retry/fallback machinery keeps working.
 *
 * @param {string} tabId - Tab ID
 * @param {string} script - JS expression that returns an array
 * @returns {Promise<Array>} Extracted articles
 * @throws {ScriptError} When the page script throws (proxy HTTP 400 {error})
 * @throws {Error} When the eval transport fails (proxy unreachable, tab gone)
 */
export async function extractFromTab(tabId, script) {
  // Wrap in async IIFE — supports both sync and async scripts.
  // CDP eval has awaitPromise:true, so async scripts are properly awaited.
  const wrappedScript = `(async function(){${script}})()`;
  const resp = await cdpEval(tabId, wrappedScript);
  // #308: the proxy turns a page-script exception into {error} (HTTP 400) —
  // surface it as a typed ScriptError instead of a silent zero-result.
  if (resp?.error) {
    throw new ScriptError(resp.error);
  }
  // CDP eval returns { value: ... } — value may be array, string, or null
  let articles = resp?.result?.value || resp?.value || resp;
  if (Array.isArray(articles)) {
    return articles;
  }
  // Try parsing if it's a string (some CDP proxies serialize arrays as JSON strings)
  if (typeof articles === "string") {
    try {
      const parsed = JSON.parse(articles);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON — return empty
    }
  }
  return [];
}

/**
 * Check if a tab requires login or has triggered a captcha.
 *
 * @param {string} tabId - Tab ID
 * @param {string|null} loginCheckScript - JS expression that returns a status string
 * @returns {Promise<string>} "ok", "need_login", "captcha", or "ok" on error
 */
export async function checkLogin(tabId, loginCheckScript) {
  if (!loginCheckScript) return "ok";
  try {
    const wrappedScript = `(async function(){${loginCheckScript}})()`;
    const resp = await cdpEval(tabId, wrappedScript);
    return resp?.result?.value || resp?.value || "ok";
  } catch {
    return "ok";
  }
}

// ─── CDP Proxy auto-start (#116) ───

/**
 * Find cdp-proxy.mjs by searching candidate paths.
 *
 * The proxy script lives in the web-access skill directory and depends on
 * browser-discovery.mjs in the same directory. We search known locations
 * rather than hard-coding a single path.
 *
 * @returns {string|null} Absolute path to cdp-proxy.mjs, or null if not found.
 */
export function findCdpProxyScript() {
  const home = nodeOs.homedir();
  const here = dirname(fileURLToPath(import.meta.url));

  const candidates = [
    // Global skill install (most common)
    join(home, ".agents", "skills", "web-access", "scripts", "cdp-proxy.mjs"),
    // Project-local skill (checked out in .cursor/skills/)
    join(here, "..", "..", ".cursor", "skills", "web-access", "scripts", "cdp-proxy.mjs"),
    // Future: project-local copy in lib/
    join(here, "cdp-proxy.mjs"),
  ];

  for (const candidate of candidates) {
    if (nodeFs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Ensure CDP proxy is running. If not, attempt to start it.
 *
 * Does not hard-fail — returns false on failure, allowing callers to
 * gracefully degrade (skip CDP sources, continue with API/MCP sources).
 *
 * @param {Object} [opts] - Configuration overrides
 * @param {number} [opts.maxRetries=10] - Health check retries after spawn
 * @param {number} [opts.intervalMs=1000] - Interval between retries
 * @returns {Promise<boolean>} true if proxy is running, false if could not start
 */
export async function ensureCdpProxy(opts = {}) {
  const maxRetries = opts.maxRetries ?? 10;
  const intervalMs = opts.intervalMs ?? 1000;

  // 1. Check if proxy already running
  try {
    const resp = await fetch(`${CDP_BASE}/targets`);
    if (resp.ok) {
      // Proxy is alive — verify it returns targets
      const data = await resp.json();
      if (Array.isArray(data)) {
        console.log("  ✅ CDP proxy already running");
        return true;
      }
    }
  } catch {
    // Proxy not running — continue to start attempt
  }

  // 2. Find cdp-proxy.mjs
  const proxyPath = findCdpProxyScript();
  if (!proxyPath) {
    console.warn("  ⚠️  cdp-proxy.mjs not found in candidate paths.");
    console.warn("     Install web-access skill or copy cdp-proxy.mjs to lib/");
    return false;
  }

  // 3. Start proxy as detached background process
  const logPath = `${nodeOs.homedir()}/.cdp-proxy.log`;
  let logFd;
  try {
    logFd = nodeFs.openSync(logPath, "a");
  } catch {
    logFd = "ignore";
  }

  try {
    const child = spawn(process.execPath, [proxyPath], {
      detached: true,
      stdio: [
        "ignore",
        logFd === "ignore" ? "ignore" : logFd,
        logFd === "ignore" ? "ignore" : logFd,
      ],
    });
    child.unref();
    if (logFd !== "ignore") nodeFs.closeSync(logFd);
  } catch (e) {
    console.warn(`  ⚠️  Failed to start CDP proxy: ${e.message}`);
    return false;
  }

  // 4. Wait for proxy to be ready
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const resp = await fetch(`${CDP_BASE}/targets`);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          console.log("  ✅ CDP proxy started successfully");
          return true;
        }
      }
    } catch {
      // Still starting up
    }
    if (i === 0) {
      console.log("  ⏳ Waiting for CDP proxy to connect to browser...");
      console.log("     If Chrome shows an authorization dialog, click 'Allow'");
    }
  }

  console.warn("  ⚠️  CDP proxy failed to start within timeout.");
  console.warn(`     Check log: ${logPath}`);
  console.warn("     Ensure Chrome remote debugging is enabled:");
  console.warn("       chrome://inspect/#remote-debugging");
  return false;
}

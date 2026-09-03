/**
 * Scenario-driven page-extraction helper (Issue #66).
 *
 * Picks the lightest tool that works for a known URL, following the
 * web-access skill's tool-selection philosophy (SKILL.md §联网工具选择):
 * use the cheapest layer that can read the page, escalate only when the
 * cheaper layer fails.
 *
 * Layer matrix:
 *   static — plain HTTP GET, raw HTML. Free, unlimited, no browser.
 *            Best for static article pages, RSS/JSON endpoints, meta tags.
 *   jina   — Jina Reader (https://r.jina.ai/<url>). Light JS rendering,
 *            returns Markdown. ~20 RPM on the free tier; no key needed,
 *            but an optional JINA_API_KEY env var is honored (Bearer auth)
 *            if the repo configures one.
 *   cdp    — full Chrome render via the local CDP proxy (cdp-client.mjs).
 *            Heaviest: consumes a CDP tab, exposes anti-bot risk, but has
 *            the user's session and complete JS rendering. Last resort.
 *
 * Usage:
 *   const { text, method } = await fetchPage(url);                 // auto
 *   const { text } = await fetchPage(url, { method: "static" });   // HTTP only
 *   const { text } = await fetchPage(url, { method: "jina" });     // Jina only
 *   const { text } = await fetchPage(url, { method: "cdp" });      // CDP only
 *
 * @module fetch-page
 */

/** Jina Reader endpoint prefix (free tier ~20 RPM). */
const JINA_READER_PREFIX = "https://r.jina.ai/";

const FETCH_METHODS = ["static", "jina", "cdp"];

/**
 * Plain HTTP GET — the lightest layer. Returns raw response text (HTML,
 * JSON, RSS — whatever the server sends).
 *
 * @param {string} url - URL to fetch
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=15000] - Abort timeout
 * @param {Object} [opts.headers] - Extra request headers
 * @returns {Promise<{ok: boolean, method: "static", text: string, status?: number, error?: string}>}
 */
export async function fetchStatic(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 15000;
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        ...(opts.headers || {}),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      return {
        ok: false,
        method: "static",
        text: "",
        status: resp.status,
        error: `HTTP ${resp.status}`,
      };
    }
    const text = await resp.text();
    return { ok: true, method: "static", text, status: resp.status };
  } catch (e) {
    return { ok: false, method: "static", text: "", error: e.message };
  }
}

/**
 * Jina Reader — light JS rendering, returns Markdown.
 * Honors an optional JINA_API_KEY env var (Bearer auth).
 *
 * @param {string} url - URL to extract
 * @param {Object} [opts]
 * @param {number} [opts.timeoutMs=30000] - Abort timeout (reader can be slow)
 * @returns {Promise<{ok: boolean, method: "jina", text: string, status?: number, error?: string}>}
 */
export async function fetchJina(url, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 30000;
  const headers = {};
  if (process.env.JINA_API_KEY) {
    headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;
  }
  try {
    const resp = await fetch(`${JINA_READER_PREFIX}${url}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      return {
        ok: false,
        method: "jina",
        text: "",
        status: resp.status,
        error: `HTTP ${resp.status}`,
      };
    }
    const text = await resp.text();
    return { ok: true, method: "jina", text, status: resp.status };
  } catch (e) {
    return { ok: false, method: "jina", text: "", error: e.message };
  }
}

/**
 * CDP extraction — full Chrome render via the local CDP proxy.
 * Heaviest layer: opens a real tab, waits for load, extracts
 * document.body.innerText, always closes the tab.
 *
 * @param {string} url - URL to extract
 * @param {Object} [opts]
 * @param {number} [opts.loadRetries=2] - waitForPageLoad retries
 * @returns {Promise<{ok: boolean, method: "cdp", text: string, error?: string}>}
 */
export async function fetchCdp(url, opts = {}) {
  // Dynamic import keeps the cdp-client dependency lazy (repo convention in
  // asset-sourcer.mjs) so static/jina callers don't touch CDP at all.
  const { cdpNewTab, cdpCloseTab, waitForPageLoad, extractFromTab } =
    await import("./cdp-client.mjs");
  let tabId = null;
  try {
    tabId = await cdpNewTab(url);
    await waitForPageLoad(tabId, opts.loadRetries ?? 2);
    const text = await extractFromTab(
      tabId,
      `return (document.body && document.body.innerText) || "";`,
    );
    const ok = typeof text === "string" && text.trim().length > 0;
    return {
      ok,
      method: "cdp",
      text: ok ? text : "",
      ...(ok ? {} : { error: "empty extraction result" }),
    };
  } catch (e) {
    return { ok: false, method: "cdp", text: "", error: e.message };
  } finally {
    if (tabId) await cdpCloseTab(tabId);
  }
}

/**
 * Whether a layer result counts as a usable extraction in auto mode.
 *
 * @param {{ok: boolean, text: string}} result
 * @param {number} minLength - Minimum non-whitespace character count
 * @returns {boolean}
 */
function isUsable(result, minLength) {
  return !!result.ok && typeof result.text === "string" && result.text.trim().length >= minLength;
}

/**
 * Scenario-driven page extraction.
 *
 * `method: "auto"` (default) tries the layers lightest-first:
 * static → jina → cdp, returning the first usable result together with the
 * method that produced it. Explicit methods only run that one layer.
 *
 * @param {string} url - URL to extract
 * @param {Object} [opts]
 * @param {"auto"|"static"|"jina"|"cdp"} [opts.method="auto"] - Extraction layer
 * @param {number} [opts.minLength=1] - Auto-mode usability threshold (non-whitespace chars)
 * @param {number} [opts.timeoutMs] - Per-layer timeout override
 * @returns {Promise<{ok: boolean, method: string, text: string, status?: number,
 *   error?: string, errors?: Object<string, string>}>}
 * @throws {Error} On an unknown method name
 */
export async function fetchPage(url, opts = {}) {
  const method = opts.method || "auto";

  if (method === "static") return fetchStatic(url, opts);
  if (method === "jina") return fetchJina(url, opts);
  if (method === "cdp") return fetchCdp(url, opts);
  if (method !== "auto") {
    throw new Error(`fetchPage: unknown method "${method}" (expected auto|static|jina|cdp)`);
  }

  const minLength = opts.minLength ?? 1;
  const errors = {};

  for (const layer of FETCH_METHODS) {
    const result =
      layer === "static"
        ? await fetchStatic(url, opts)
        : layer === "jina"
          ? await fetchJina(url, opts)
          : await fetchCdp(url, opts);
    if (isUsable(result, minLength)) {
      return result;
    }
    errors[layer] = result.error || (result.ok ? "text below minLength" : "failed");
  }

  return { ok: false, method: "auto", text: "", errors };
}

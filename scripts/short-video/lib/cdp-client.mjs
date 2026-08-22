/**
 * Chrome DevTools Protocol (CDP) client.
 *
 * Generic CDP utilities for communicating with a local Chrome Remote
 * Debugging proxy (e.g. the web-access skill's proxy at localhost:3456).
 *
 * Used by: search-sources.mjs, and any script that needs to scrape
 * web pages through the user's authenticated Chrome session.
 */

export const CDP_BASE = "http://localhost:3456";
export const RETRY_WAIT_MS = 3000;

/**
 * Create a new browser tab via the CDP proxy.
 *
 * @param {string} url - URL to navigate to
 * @returns {Promise<string>} Tab ID (targetId)
 * @throws {Error} If the proxy doesn't return a targetId
 */
export async function cdpNewTab(url) {
  const resp = await fetch(`${CDP_BASE}/new`, {
    method: "POST",
    body: url,
  });
  const data = await resp.json();
  if (!data.targetId) {
    throw new Error(`Failed to create tab for ${url}`);
  }
  return data.targetId;
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
      await new Promise((r) => setTimeout(r, RETRY_WAIT_MS));
    }
  }
  return false;
}

/**
 * Extract content from a tab by evaluating an extraction script.
 *
 * The script is wrapped in an IIFE (CDP eval doesn't support top-level return).
 * Handles various CDP response formats: result.value, value, JSON string, or null.
 *
 * @param {string} tabId - Tab ID
 * @param {string} extractScript - JS expression that returns an array
 * @returns {Promise<Array>} Extracted articles (empty array on failure)
 */
export async function extractFromTab(tabId, extractScript) {
  try {
    // Wrap in async IIFE — supports both sync and async extractScripts.
    // CDP eval has awaitPromise:true, so async scripts are properly awaited.
    const wrappedScript = `(async function(){${extractScript}})()`;
    const resp = await cdpEval(tabId, wrappedScript);
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
  } catch (e) {
    console.warn(`  ⚠️  Extract failed: ${e.message}`);
    return [];
  }
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

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
 * @param {string} script - JS expression that returns an array
 * @returns {Promise<Array>} Extracted articles (empty array on failure)
 */
export async function extractFromTab(tabId, script) {
  try {
    // Wrap in async IIFE — supports both sync and async scripts.
    // CDP eval has awaitPromise:true, so async scripts are properly awaited.
    const wrappedScript = `(async function(){${script}})()`;
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

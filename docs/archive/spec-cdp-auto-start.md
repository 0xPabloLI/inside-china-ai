# Spec: Pipeline Auto-Start CDP Proxy (#116)

**Issue**: #116 — Pipeline auto-start CDP proxy — self-sufficient search-sources.mjs
**Wave**: W1 / Tier 2
**Conflict files**: `cdp-client.mjs`, `search-sources.mjs`

## Problem

`search-sources.mjs main()` hard-fails (`process.exit(1)`) when CDP proxy is not running at `localhost:3456`. User must manually run `node ~/.agents/skills/web-access/scripts/check-deps.mjs` before each pipeline run. This breaks the "self-sufficient pipeline" goal.

## Solution

Add `ensureCdpProxy()` to `cdp-client.mjs` that:
1. Checks if proxy already running (GET `/targets`)
2. If not, finds and starts `cdp-proxy.mjs` as a detached background process
3. Waits for health with retry
4. Returns `true` on success, `false` on failure (no hard-fail)

Replace `process.exit(1)` in `search-sources.mjs main()` with `ensureCdpProxy()` call + graceful degradation.

### Key Design Decisions

**D1: No code duplication of browser discovery.**
`cdp-proxy.mjs` internally calls `browser-discovery.mjs` to find Chrome's DevToolsActivePort. The pipeline does NOT need to replicate this logic — it only starts the proxy process; the proxy handles browser connection itself.

**D2: Multi-path search for cdp-proxy.mjs.**
The proxy script lives in the web-access skill directory (`~/.agents/skills/web-access/scripts/cdp-proxy.mjs`). We search candidate paths in order:
1. `~/.agents/skills/web-access/scripts/cdp-proxy.mjs` (global skill install)
2. `<project>/.cursor/skills/web-access/scripts/cdp-proxy.mjs` (project-local skill)
3. `<project>/scripts/short-video/lib/cdp-proxy.mjs` (future project-local copy)

If none found, return `false` (graceful degradation — API/MCP sources continue).

**D3: Graceful degradation, no hard-fail.**
When proxy can't start (script not found, Chrome not running, timeout):
- Set `cdpAvailable = false`
- Print actionable warning (how to enable CDP)
- CDP-only sources are skipped (existing `collectFromCdp` checks `if (!cdpAvailable) return []`)
- API and MCP sources continue collecting

**D4: Configurable via environment.**
- `CDP_PROXY_PORT` (default 3456) — override proxy port
- `CDP_PROXY_START_RETRIES` (default 10) — max health check retries
- `CDP_PROXY_START_INTERVAL_MS` (default 1000) — interval between retries

## Implementation

### New functions in `cdp-client.mjs`

```javascript
/**
 * Find cdp-proxy.mjs by searching candidate paths.
 * @returns {string|null} Absolute path to cdp-proxy.mjs, or null if not found.
 */
export function findCdpProxyScript() { ... }

/**
 * Ensure CDP proxy is running. If not, attempt to start it.
 * Does not hard-fail — returns false on failure.
 *
 * @param {Object} [opts] - Configuration overrides
 * @param {number} [opts.maxRetries=10] - Health check retries
 * @param {number} [opts.intervalMs=1000] - Interval between retries
 * @returns {Promise<boolean>} true if proxy is running, false if could not start
 */
export async function ensureCdpProxy(opts) { ... }
```

### Modified logic in `search-sources.mjs main()`

**Before** (lines ~434-453):
```javascript
cdpAvailable = false;
try {
  const resp = await fetch(`${CDP_BASE}/targets`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  cdpAvailable = true;
} catch {
  if (mcpOrApiSources === sources.length) {
    // All MCP/API — continue
  } else {
    process.exit(1); // ← HARD FAIL
  }
}
```

**After**:
```javascript
cdpAvailable = await ensureCdpProxy();
if (!cdpAvailable) {
  const mcpOrApiSources = sources.filter(
    (s) => s.accessMethod?.primary === "mcp" || s.apiSearch,
  ).length;
  if (mcpOrApiSources === sources.length) {
    console.log("  ⚠️  CDP proxy unavailable, but all sources are MCP/API-based — continuing");
  } else {
    console.warn("  ⚠️  CDP proxy could not be started. CDP sources will be skipped.");
    console.warn("     To enable: open Chrome and visit chrome://inspect/#remote-debugging");
    console.warn("     Or run: node ~/.agents/skills/web-access/scripts/check-deps.mjs");
  }
}
```

### New exports from `cdp-client.mjs`

`findCdpProxyScript` and `ensureCdpProxy` are added to the module's exports. `search-sources.mjs` imports `ensureCdpProxy` alongside existing imports.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk Level | Assessment |
|------|-------------|------------|------------|
| `scripts/short-video/lib/cdp-client.mjs` | Add `findCdpProxyScript()` + `ensureCdpProxy()` (pure additions, no modification to existing functions) | Low | New functions only; existing `cdpNewTab`/`cdpEval`/etc unchanged |
| `scripts/short-video/search-sources.mjs` | Replace CDP check block (L434-453) with `ensureCdpProxy()` call + graceful warning instead of `process.exit(1)` | Medium | Changes main() control flow at one location; existing `collectFromCdp` already handles `cdpAvailable=false`; fallback chain (API→CDP→googleSite→MCP) unaffected because CDP step already returns `[]` when unavailable |
| `scripts/short-video/__tests__/cdp-client.test.mjs` | Add test suite for `findCdpProxyScript` + `ensureCdpProxy` | Low | Pure additions to test file |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | CDP proxy already running (`/targets` returns ok) | Return `true` immediately, no spawn | Low | Check-first-before-spawn pattern |
| 2 | Proxy not running, cdp-proxy.mjs found in skill dir | `spawn` detached → retry `/targets` → return `true` | Low | Detached + unref; health check with retry |
| 3 | cdp-proxy.mjs not found in any candidate path | Return `false`, print warning with actionable message | Medium | Multi-path search; graceful degradation; API/MCP sources continue |
| 4 | Proxy spawned but health check times out (Chrome not running) | Exhaust retries → return `false` → degrade | Medium | Configurable retries; warning tells user to enable remote debugging |
| 5 | All sources are MCP/API (research mode, no CDP sources) | `ensureCdpProxy` returns false → pipeline continues normally | Low | Check `mcpOrApiSources === sources.length` |
| 6 | Mixed sources (some CDP, some API) + proxy start fails | CDP sources return `[]` (existing `collectFromCdp` guard), API sources continue | Low | `cdpAvailable=false` already handled in `collectFromCdp` |
| 7 | Proxy spawned successfully, `/targets` returns array | Return `true` → `cdpAvailable=true` → CDP sources work | Low | Standard happy path |
| 8 | Proxy running but Chrome disconnected (proxy alive, /targets returns error) | `/targets` fails → attempt to start new proxy → port conflict or new proxy starts | Medium | If existing proxy process holds port, spawn fails; caught in retry; worst case degrade |
| 9 | `CDP_PROXY_PORT` env var set to non-default | Functions use configured port | Low | Read from env at module level |

## Out of Scope

- Copying `cdp-proxy.mjs` or `browser-discovery.mjs` into the project (future task if skill dependency is undesirable)
- Proxy process lifecycle management (auto-restart on crash)
- Config file for proxy preferences (config.env is web-access skill's domain)

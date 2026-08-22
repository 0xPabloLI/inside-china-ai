# Source Layer Comparison: CDP vs MCP vs API

Comparison of CDP, MCP, and API fallback layers for Xiaohongshu (xhs) and X (Twitter) search sources. Tested 2026-08-21 with keyword "DeepSeek" (and rotating keywords for MCP).

## Layer Definitions

| Layer | Method | How it works |
|-------|--------|-------------|
| L1 | CDP | Chrome DevTools Protocol — navigates to search page in logged-in Chrome, runs `extractScript` to scrape DOM |
| L2 | cdpFallback | Google `site:` search via CDP — fallback URL + different extractScript |
| L2 (xhs) | RedNote-MCP | `rednote-mcp --stdio` MCP server, `search_notes` tool |
| L3 | mcpFallback (Grok) | `mcp-search-bridge` → Bigsong API → `grok-chat-fast` model with native X data access |
| L3 (xhs) | dots-chat | Bigsong API → `dots-chat` model (access to Xiaohongshu knowledge base, no toolcall) |

## Test Results (10 rounds each)

### Xiaohongshu (xhs)

| Layer | Method | Success | Avg items/round | Avg time/round | Notes |
|-------|--------|---------|-----------------|-----------------|-------|
| L1 | CDP | **10/10 (100%)** | 40.0 | 4.5s | Stable, high yield. Selector `section.note-item` + `a[href*="/explore/"]` |
| L2 | RedNote-MCP | **0/10 (0%)** | 0 | 30s | Login succeeded, but `search_notes` timed out every round. `rednote-mcp` internal search likely blocked by anti-bot |
| L3 | dots-chat API | **0/10 (0%)** | 0 | 7.3s | `fetch failed` / `dots2api busy` — Bigsong API unstable |

**Recommended xhs fallback order**: L1 CDP only. L2 (RedNote-MCP) and L3 (dots-chat) both 0% success — keep as configured fallbacks but do not rely on them until upstream issues are resolved.

### X (Twitter)

| Layer | Method | Success | Avg items/round | Avg time/round | Notes |
|-------|--------|---------|-----------------|-----------------|-------|
| L1 | CDP | **5/10 (50%)** | 5.2 | 4.1s | SPA timing issue — ~50% of rounds return 0 items. `[data-testid="tweet"]` selector is correct when page loads |
| L2 | Google cdpFallback | **10/10 (100%)** | 9.0 | 4.0s | Fixed: `h3`-based selector (no Google class dependency). 9 x.com links/round, stable |
| L3 | Grok (mcp-search-bridge) | **2/10 (20%)** | 7.0 | 15.2s | When it works, returns high-quality results with full tweet text + URLs. But 8/10 `fetch failed` — Bigsong API unstable |

**Recommended x_search fallback order**: L1 CDP → L2 Google cdpFallback (h3-based, resilient) → L3 Grok. All three layers configured. CDP fastest but 50% reliable; Google stable but only titles; Grok highest quality but slow + unstable.

## CDP vs MCP: Scenario Comparison

### When CDP wins
- **Xiaohongshu**: CDP 100% success, 40 items/round, 4.5s. MCP 0% (timeout). CDP is the only working layer.
- **Speed-critical runs**: CDP averages 4-5s vs MCP/API 8-30s.
- **High-volume extraction**: CDP returns 40 items (page full), MCP/API return 5-9 items.

### When MCP/API wins
- **X (Twitter)**: Grok returns higher-quality data — full tweet text, author handles, engagement context. CDP only gets what's visible in DOM (~5 tweets). But Grok reliability is low (20%).
- **Anti-bot resilience**: MCP/API don't depend on DOM structure. When site redesigns, CDP selectors break; MCP/API keep working (if the upstream API is stable).
- **No-login scenarios**: MCP/API don't need Chrome logged in to the target platform.

## Fixes Applied

### 1. Xiaohongshu CDP extractScript (commit pending)
- **Bug**: `[data-v-*]` is not a valid CSS selector (CSS doesn't support wildcard attribute names)
- **Fix**: Changed to `section.note-item, .note-item, .search-result-item`
- **Secondary selector** (unchanged): `a[href*="/search_result/"], a[href*="/explore/"]` — this was already correct and is what actually returned results

### 2. X Google cdpFallback extractScript — Fixed
- **Bug**: `div.g, .Gx5Zad, .fP1Qef` — Google frontend redesign broke these classes (0/10 success)
- **Fix**: New `h3`-based selector — `h3` is a semantic tag, unlikely to change. Finds `h3`, gets parent `<a>` for href, filters `x.com`/`twitter.com` URLs. No dependency on Google internal class names.
- **Test**: 10/10 success, 9 items/round, 4.0s avg — verified 2026-08-21
- **DOM structure discovered**: Google now wraps `h3` directly in `<a class="zReHs">`, no more `div.g` container.

### 3. Xiaohongshu mcpFallback config (commit pending)
- **Bug**: Configured `python -m xiaohongshu_mcp_server` — package was never installed
- **Fix**: Changed to `rednote-mcp --stdio`, toolName `search_notes` (param `keywords` not `keyword`)
- **Status**: MCP server starts and login works, but `search_notes` times out. Issue is upstream (rednote-mcp internal search).

## Untested CDP Sources

Source registry has 40+ `extractScript` entries. Most were written during initial development and have never been systematically tested. See Issue #87 (88 manual maintenance items audit).

**Priority candidates for testing**:
- `sogou_weixin` — login wall + complex DOM
- `douyin` — SPA, heavy dynamic rendering
- `weibo` — frequent redesigns
- `zhihu` — login wall
- `bilibili` — SPA with lazy loading

## Design Decisions & References

- Issue #66: extractScript auto-fallback (generic eval + Jina Reader + health tracking)
- Issue #87: 88 manual maintenance items audit
- `mcp-client.mjs`: MCP stdio JSON-RPC 2.0 client implementation
- `search-sources.mjs`: `collectFromSource()` fallback chain logic (API → CDP → cdpFallback → mcpFallback)
- Bigsong API: `dots-chat` and `grok-chat-fast` models share the same upstream API (`key.bigsong`), which was intermittently unavailable during testing

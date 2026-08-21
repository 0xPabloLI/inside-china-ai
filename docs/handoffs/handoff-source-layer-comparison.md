# Handoff: CDP vs MCP vs API Source Layer Comparison

**Session**: 2026-08-21
**Issues**: #66 (extractScript auto-fallback, updated), #87 (88 maintenance items), #90 (MCP→API migration, new)
**Docs**: `docs/research/source-layer-comparison.md` (permanent reference)

## What was done

### 1. Test suite executed (10 rounds each)
- **XHS CDP (L1)**: 10/10 success, 40 items/round, 4.5s — stable
- **XHS RedNote-MCP (L2)**: 0/10 — login works but search_notes times out (30s each)
- **XHS dots-chat (L3)**: 0/10 — Bigsong API `fetch failed` / `dots2api busy`
- **X CDP (L1)**: 5/10, 5.2 items/round, 4.1s — SPA timing causes 50% blank
- **X Google cdpFallback (L2)**: 0/10 — Google frontend redesign broke selectors
- **X grok-chat-fast (L3)**: 2/10, 7.0 items/round, 15.2s — Bigsong API unstable

### 2. Source-registry.mjs fixes applied (not committed)
- **XHS extractScript**: `[data-v-*]` (invalid CSS) → `section.note-item, .note-item, .search-result-item`
- **XHS mcpFallback**: `python -m xiaohongshu_mcp_server` (never installed) → `rednote-mcp --stdio` (installed, login works, but search times out)
- **X cdpFallback (Google site:x.com)**: **Fixed** — old `div.g, .Gx5Zad, .fP1Qef` selectors broken (0/10). New `h3`-based selector: finds `h3`, gets parent `<a>` for href, filters x.com URLs. No Google class dependency. Manual test: 9 x.com links returned. 10-round test pending.

### 3. Issues
- **#66 updated**: Added test results confirming selectors break silently. Scope confirmed as already source-agnostic.
- **#90 created**: MCP→API migration — replace `mcp-search-bridge` with direct `lib/bigsong-api.mjs` HTTP calls. Both `grok-chat-fast` and `dots-chat` are non-toolcall models, so MCP `tools/call` provides no benefit.

### 4. Permanent doc
`docs/research/source-layer-comparison.md` — layer definitions, test results table, CDP vs MCP scenario comparison, fixes applied, untested sources list. Named without date (general reference, not ephemeral).

## Fallback order recommendations

### Xiaohongshu (xhs)
1. **L1 CDP** — only working layer (100% success, 40 items)
2. L2 RedNote-MCP — configured but search times out (keep as future option)
3. L3 dots-chat — Bigsong API unstable (keep as configured fallback)

### X (Twitter)
1. **L1 CDP** — 50% success but fast (4s); primary layer
2. **L2 Google cdpFallback** — fixed with h3-based selector; stable, returns 9 x.com links/round; only titles (no tweet content)
3. **L3 Grok** — 20% success but high quality when it works; slow (15s); Bigsong API unstable

## Uncommitted changes

```
scripts/short-video/lib/source-registry.mjs:
  - XHS extractScript selector fix ([data-v-*] → section.note-item)
  - XHS mcpFallback config (python → rednote-mcp --stdio)
  - X Google cdpFallback: old div.g selectors → h3-based selector (resilient)
```

## Next steps for a fresh session

1. ~~Commit the source-registry.mjs fixes~~ (done, commit 17ddc44)
2. **Amend with Google cdpFallback fix** (this session's additional change)
3. **Implement #90** (MCP→API migration) — create `lib/bigsong-api.mjs`, update source-registry + search-sources
4. **Monitor Bigsong API** — when stable, re-run dots-chat and grok-chat-fast tests to get complete data
5. **Systematic CDP source testing** — test extractScript for sogou_weixin, douyin, weibo, zhihu, bilibili (see #87)
6. **Implement #66** — extractScript auto-fallback chain (per-site → Jina → generic eval → /extract + health tracking)

## Key findings for future work

- `rednote-mcp` login works via MCP `login` tool (reads Chrome cookies), but `search_notes` times out — likely internal headless browser blocked by Xiaohongshu anti-bot
- Bigsong API (`key.bigsong`) was intermittently unavailable during testing — `fetch failed` for 8/10 grok rounds and 10/10 dots-chat rounds
- X CDP 50% failure rate is SPA timing — page loads but tweet DOM not ready when extractScript runs. Fix: increase wait time or use `MutationObserver` pattern
- `mcp-search-bridge/server.js` adds a `SYSTEM_PROMPT` and parses response text — this logic needs to be preserved in `lib/bigsong-api.mjs` during migration

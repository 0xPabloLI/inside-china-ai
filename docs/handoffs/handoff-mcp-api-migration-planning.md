# Handoff: MCP→API Migration & Auto-Fix Architecture (Planning Domain)

**Session**: 2026-08-21
**Issues**: #66 (extractScript auto-fallback), #87 (88 maintenance items), #90 (MCP→API migration, new)
**Docs**: `docs/research/source-layer-comparison.md` (permanent reference)

## Architecture decisions from this session

### MCP→API migration (#90, new)
- `mcp-search-bridge` wraps Bigsong API (`grok-chat-fast`, `dots-chat`) in MCP JSON-RPC stdio
- Both models are non-toolcall — MCP's `tools/call` provides no benefit
- Migration: create `lib/bigsong-api.mjs` with direct `fetch` calls, remove MCP subprocess layer
- `mcp-client.mjs` retained for `rednote-mcp` (real MCP server with structured tools)

### Auto-fallback scope (#66, updated)
- #66 design is already source-agnostic — `collectFromCdp()` serves all sources
- No scope expansion needed — 40 extractScript items + 1 cdpFallback all covered
- #87 covers the broader 88 maintenance items (loginCheckScript, apiSearch.parser, etc.)

### RedNote-MCP findings
- Open source (MIT): [ifuryst/rednote-mcp](https://github.com/ifuryst/rednote-mcp)
- Login works (reads Chrome cookies), but `search_notes` times out — internal headless browser blocked by XHS anti-bot
- Our CDP proxy (using your real Chrome) is not blocked — 10/10 success

## Next steps for a fresh session

1. Implement #90 — create `lib/bigsong-api.mjs`, update source-registry + search-sources
2. Implement #66 — auto-fallback chain (per-site → Jina → generic eval → /extract + health tracking)
3. Systematic CDP source testing — test extractScript for sogou_weixin, douyin, weibo, zhihu, bilibili (#87)
4. Monitor Bigsong API — when stable, re-run dots-chat and grok-chat-fast tests

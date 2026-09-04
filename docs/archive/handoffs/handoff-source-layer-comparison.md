# Handoff: Source Layer Comparison & Selector Fix

**Session**: 2026-08-21
**Commits**: `af75dc4` (source-registry.mjs), `85e39b9` (tests), `f6b3526` (docs)
**Issues**: #66 (auto-fallback, updated), #87 (88 items audit), #88 (rename script fields), #89 (anti-bot), #90 (MCP→API), #91 (DuckDuckGo), #92 (SearXNG)
**Spec**: `docs/specs/spec-source-registry-selector-fix.md`
**Permanent reference**: `docs/research/source-layer-comparison.md`

## What was done

### Selector fixes (TDD: red → green → refactor)

1. **XHS articleScript**: `[data-v-*]` (invalid CSS) → `section.note-item` — 10/10 CDP test success
2. **XHS mcpFallback**: `python -m xiaohongshu_mcp_server` (never installed) → `rednote-mcp --stdio` — login works, search times out (upstream)
3. **X googleSiteFallback**: `div.g, .Gx5Zad, .fP1Qef` (Google redesign broke) → `h3`-based selector — 10/10 CDP test success, 9 items/round

### Test coverage

- 119 tests pass (3 updated + 3 new)
- Red phase: 2 tests failed before update
- New tests verify: no `[data-v-*]`, has `section.note-item`, `h3` in googleSiteFallback, no `div.g`, `keywords` (plural) param

### Test results (10 rounds each)

| Source                      | Layer | Success      | Items/round | Avg time      |
| --------------------------- | ----- | ------------ | ----------- | ------------- |
| XHS CDP                     | L1    | 10/10 (100%) | 40          | 4.5s          |
| XHS RedNote-MCP             | L2    | 0/10 (0%)    | 0           | 30s (timeout) |
| XHS dots-chat               | L3    | 0/10 (0%)    | 0           | 7.3s          |
| X CDP                       | L1    | 5/10 (50%)   | 5.2         | 4.1s          |
| X Google googleSiteFallback | L2    | 10/10 (100%) | 9.0         | 4.0s          |
| X grok-chat-fast            | L3    | 2/10 (20%)   | 7.0         | 15.2s         |

### Architecture findings

- **CDP proxy** uses your real Chrome session (login state, cookies, fingerprint) — not a new profile
- **RedNote-MCP** (MIT, [ifuryst/rednote-mcp](https://github.com/ifuryst/rednote-mcp)): login works via Chrome cookies, but `search_notes` uses internal headless browser — blocked by XHS anti-bot
- **MCP→API migration** (#90): `mcp-search-bridge` wraps Bigsong API in MCP JSON-RPC, but both `grok-chat-fast` and `dots-chat` are non-toolcall models — MCP's `tools/call` adds no value. Direct `fetch` simpler + faster.
- **Auto-fallback** (#66): design is already source-agnostic. `collectFromCdp()` serves all sources. No scope expansion needed.

## Next steps for a fresh session

1. **Implement #90** — create `lib/bigsong-api.mjs`, update source-registry + search-sources
2. **Implement #66** — auto-fallback chain (per-site → Jina → generic eval → /extract + health tracking)
3. **Implement #88** — rename script fields (articleScript → articleScript, etc.)
4. **Implement #91** — add DuckDuckGo source (parent #89)
5. **Implement #92** — add SearXNG source (parent #89)
6. **Systematic CDP source testing** — test articleScript for sogou_weixin, douyin, weibo, zhihu, bilibili (#87)
7. **Monitor Bigsong API** — when stable, re-run dots-chat and grok-chat-fast tests

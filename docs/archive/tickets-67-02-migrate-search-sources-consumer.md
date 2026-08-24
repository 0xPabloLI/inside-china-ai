# 02 — Migrate search-sources.mjs consumers to read capabilities.articles

**What to build:** `collectFromCdp`, `collectFromApi`, `collectFromMcp`, `collectFromSource`, and `main` filter in `search-sources.mjs` switch from reading top-level `source.*` fields to reading `source.capabilities.articles.*` with top-level fallback (`cap?.x ?? source.x`). This includes fixing the existing bug where research-mode filter reads `cap.articles.cdpFallback` (line 339) which was never set — it will now be set by Ticket 01.

**Blocked by:** 01 (enrichWithCapabilities must add fields first)

**Status:** ready-for-agent

- [x] `collectFromCdp` reads `cap.url`, `cap.extractScript`, `cap.needsAuth`, `cap.loginCheckScript` with top-level fallback
- [x] `collectFromApi` reads `cap.apiSearch` with top-level fallback
- [x] `collectFromMcp` reads `cap.mcpFallback` with top-level fallback
- [x] `collectFromSource` reads `cap.apiSearch`, `cap.cdpFallback`, `cap.mcpFallback`, `cap.useCleanTitle` with top-level fallback
- [x] `main` filter reads `cap.supportsKeyword`, `cap.cdpFallback` (research mode), `cap.paidApi` (paid filter) instead of top-level
- [x] Existing test `source-registry.test.mjs` line 1138 (research-mode filter) now returns non-empty for `x_search`
- [x] Scenario matrix rows 3, 9, 10, 11 covered
- [x] All existing tests pass (374 total)

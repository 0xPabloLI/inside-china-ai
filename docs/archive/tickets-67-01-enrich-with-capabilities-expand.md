# 01 — Enrich capabilities.articles with method, apiSearch, credentials, fallbacks

**What to build:** `enrichWithCapabilities()` in `source-registry.mjs` adds `method`, `apiSearch`, `requiresApiKey`, `apiKeyEnv`, `paidApi`, `cdpFallback`, `mcpFallback` to every source's `capabilities.articles` object. After this, `capabilities.articles` is the complete source of truth for article collection. Top-level fields remain as legacy compat (direct references, not copies).

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `method` field set for all 53 article sources (from `accessMethod.primary`, values: `cdp`/`api`/`mcp`)
- [x] `apiSearch` direct-referenced into `capabilities.articles.apiSearch` for 23 API sources; `undefined` for 30 CDP-only sources
- [x] `requiresApiKey` set: `true` for sources where `apiSearch.authRequired === true`; `false` otherwise
- [x] `apiKeyEnv` set via hard-coded lookup: `tiktok_creator` → `SCRAPECREATORS_API_KEY`, `gnews` → `GNEWS_API_KEY`, `currents` → `CURRENTS_API_KEY`; `null` for all others
- [x] `paidApi` set: `true` if `apiSearch.paidApi === true`; `false` otherwise
- [x] `cdpFallback` direct-referenced into `capabilities.articles.cdpFallback` (1 source: `x_search`); `undefined` for sources without it
- [x] `mcpFallback` direct-referenced into `capabilities.articles.mcpFallback` (12 sources); `undefined` for sources without it
- [x] All existing 322+ tests pass unchanged (374 total across 3 files)
- [x] Scenario matrix rows 1-8, 12 covered by new tests in `source-registry-capabilities.test.mjs`

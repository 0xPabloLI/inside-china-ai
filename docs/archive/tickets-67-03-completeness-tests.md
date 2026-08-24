# 03 — Add capability completeness tests

**What to build:** New test groups in `source-registry-capabilities.test.mjs` verifying that `capabilities.articles` is the complete source of truth — every field a consumer needs is present in the capability, not just at top-level.

**Blocked by:** 01 (enrichWithCapabilities must add fields first), 02 (consumer migration validates the tests are meaningful)

**Status:** ready-for-agent

- [x] Test group: every article source has `method` with value `cdp`|`api`|`mcp`
- [x] Test group: every API source has `requiresApiKey` (boolean), `apiKeyEnv` (string|null), `paidApi` (boolean)
- [x] Test: `tiktok_creator` has `requiresApiKey: true`, `apiKeyEnv: "SCRAPECREATORS_API_KEY"`, `paidApi: true`
- [x] Test: `gnews` has `requiresApiKey: true`, `apiKeyEnv: "GNEWS_API_KEY"`, `paidApi: false`
- [x] Test: `currents` has `requiresApiKey: true`, `apiKeyEnv: "CURRENTS_API_KEY"`, `paidApi: false`
- [x] Test: `x_search` has `capabilities.articles.cdpFallback` defined (bug fix verification)
- [x] Test: all 12 sources with `mcpFallback` have `capabilities.articles.mcpFallback` defined
- [x] Test: `apiSearch` reference identity (`cap.articles.apiSearch === source.apiSearch`)
- [x] Test: CDP-only sources have `apiSearch: undefined`, `requiresApiKey: false`, `paidApi: false`
- [x] All scenario matrix rows covered as test cases

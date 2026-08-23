# Spec: capabilities.articles Schema Completion (Issue #67)

## Problem Statement

`capabilities.articles` is not the single source of truth it claims to be. While `enrichWithCapabilities()` copies basic fields (`supportsKeyword`, `url`, `extractScript`, `loginCheckScript`, `needsAuth`, `useCleanTitle`) into the capability, 5 critical gaps remain:

1. **`method` field missing** — 0/53 article sources have `capabilities.articles.method`. Consumers cannot distinguish CDP vs API vs MCP from the capability alone.
2. **`apiSearch` not in capability** — 23 API sources have `apiSearch` only at top-level. `capabilities.articles` lacks it entirely.
3. **API credentials not in capability** — `tiktok_creator` (paid), `gnews`/`currents` (free, requires key) have no `requiresApiKey`/`apiKeyEnv`/`paidApi` in the capability.
4. **`cdpFallback`/`mcpFallback` not in capability** — 1 source has `cdpFallback`, 12 have `mcpFallback`, all at top-level only.
5. **Existing bug** — `search-sources.mjs:339` reads `s.capabilities?.articles?.cdpFallback` for research-mode filtering, but this field was never set, silently dropping `x_search` from research mode.

## Solution

Migrate all article-consumption fields into `capabilities.articles` via `enrichWithCapabilities()`. Top-level fields remain as legacy compat (direct references, not copies — mutations reflect in both). Consumers (`search-sources.mjs`) switch to reading from `capabilities.articles` with top-level fallback.

### Schema (after migration)

```
capabilities.articles = {
  method: "cdp" | "api" | "mcp",       // from accessMethod.primary
  supportsKeyword: boolean,
  url: (keyword) => string,
  extractScript: string,
  loginCheckScript: string | null,
  needsAuth: boolean,
  useCleanTitle: boolean,
  // API-specific (when method === "api" and source.apiSearch exists):
  apiSearch: { url, parser, authRequired, headers, paidApi },  // direct ref
  requiresApiKey: boolean,    // true if apiSearch.authRequired
  apiKeyEnv: string | null,   // env var name for API key
  paidApi: boolean,            // true if apiSearch.paidApi
  // Fallback chain (direct references, undefined if not configured):
  cdpFallback: { url, extractScript } | undefined,
  mcpFallback: { command, args, toolName, toolArgs, timeoutMs, resultMapper } | undefined,
}
```

### `apiKeyEnv` mapping

| Source | apiKeyEnv | requiresApiKey | paidApi |
|--------|-----------|----------------|---------|
| tiktok_creator | SCRAPECREATORS_API_KEY | true | true |
| gnews | GNEWS_API_KEY | true | false |
| currents | CURRENTS_API_KEY | true | false |
| All other API sources | null | false | false |

Sources without `apiSearch` (30 CDP-only + MCP-only): `requiresApiKey = false`, `apiKeyEnv = null`, `paidApi = false`.

## User Stories

1. As a pipeline consumer, I want to read `capabilities.articles.method` to determine collection strategy without accessing top-level `accessMethod`.
2. As a pipeline consumer, I want to read `capabilities.articles.apiSearch` to make API calls without accessing top-level `apiSearch`.
3. As a pipeline consumer, I want to read `capabilities.articles.requiresApiKey` to gate API sources on env-var availability.
4. As a pipeline consumer, I want to read `capabilities.articles.paidApi` to filter paid sources without accessing top-level `apiSearch.paidApi`.
5. As a pipeline consumer, I want to read `capabilities.articles.cdpFallback` to trigger Google site: fallback without accessing top-level `cdpFallback`.
6. As a pipeline consumer, I want to read `capabilities.articles.mcpFallback` to trigger MCP fallback without accessing top-level `mcpFallback`.
7. As a developer, I want `search-sources.mjs` to read exclusively from `capabilities.articles` so top-level fields are purely legacy compat.
8. As a developer, I want research-mode filter to correctly include sources with `cdpFallback` (bug fix).
9. As a developer, I want tests verifying every article source has `method`, and API sources have `requiresApiKey`/`apiKeyEnv`/`paidApi`.
10. As a developer, I want tests verifying `cdpFallback`/`mcpFallback` presence in capability matches top-level.

## Implementation Decisions

### 1. Migration strategy: compat-layer (direct references)

`enrichWithCapabilities()` adds fields by direct reference (`capabilities.articles.cdpFallback = source.cdpFallback`). Top-level fields remain. Mutations reflect in both. No deep cloning.

### 2. Field structure: preserved (not restructured)

- `cdpFallback` and `mcpFallback` stay as separate named fields (not a `fallbacks[]` array). Rationale: types are heterogeneous, consumers branch by name anyway, YAGNI for dynamic chains.
- `apiSearch` stays as a single object (not split into `api: { ... }`). Rationale: minimal change, consumers read `cap.articles.apiSearch.url` etc.

### 3. `requiresApiKey`/`apiKeyEnv`/`paidApi` at capability top-level

Not inside `apiSearch`. These are source-level properties (affect source selection), not API-call details. `search-sources.mjs` main filter reads them to gate sources without diving into `apiSearch`.

### 4. Consumer migration: read capability, fallback to top-level

`collectFromCdp`, `collectFromApi`, `collectFromMcp`, `collectFromSource`, and `main` filter in `search-sources.mjs` switch to:
```
const cap = source.capabilities?.articles;
const url = cap?.url ?? source.url;
```
This pattern ensures backward compat if any source somehow lacks capabilities.

### 5. `apiKeyEnv` hard-coded mapping

Three sources need explicit `apiKeyEnv` values that cannot be derived from `apiSearch` structure. A lookup map in `enrichWithCapabilities()` maps source names to env var names. All other API sources get `requiresApiKey: false, apiKeyEnv: null, paidApi: false`.

## Testing Decisions

### Test seam: `source-registry-capabilities.test.mjs` (existing)

Tests verify the **capability object structure** (not runtime behavior). External behavior = the shape of `capabilities.articles` as consumed by `search-sources.mjs`.

### Test categories

1. **Method field**: every article source has `method` with value `cdp`|`api`|`mcp`
2. **API credentials**: every API source has `requiresApiKey` (boolean), `apiKeyEnv` (string|null), `paidApi` (boolean). `tiktok_creator`/`gnews`/`currents` have specific values.
3. **Fallback presence**: `x_search` has `cdpFallback` in capability. 12 sources with `mcpFallback` have it in capability. Sources without fallback have `undefined`.
4. **Consumer reading**: `collectFromSource` reads `capabilities.articles` — verified by mock test in `source-registry.test.mjs` or unit test of filter logic.
5. **No regression**: all existing 322+ tests pass unchanged.

### Prior art

- `source-registry-capabilities.test.mjs` R4 section (field presence tests)
- `source-registry.test.mjs` research-mode filter tests (lines 1123-1171)

## Out of Scope

- `capabilities.images` / `capabilities.videos` migration (stock API sources already have explicit capabilities)
- `asset-sourcer.mjs` `searchCdpSource` (reads `source.url`/`source.primaryScript` — these belong to `capabilities.images`, not `articles`)
- `brief-builder.mjs` (different `source` object, not registry sources)
- Deleting top-level fields (they remain as legacy compat)
- `fallbacks[]` array format (YAGNI)
- P0 fix for `xhs`/`douyin`/`weibo_hot` ytdlp video attribution (tracked in audit, separate issue)

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/short-video/lib/source-registry.mjs` | `enrichWithCapabilities()` adds `method`, `apiSearch`, `requiresApiKey`, `apiKeyEnv`, `paidApi`, `cdpFallback`, `mcpFallback` to `capabilities.articles` | Medium | Core registry function. All fields are direct references (no cloning). Verified: 53 article sources, 0 missing `accessMethod`. Existing 322 tests validate structural integrity. |
| `scripts/short-video/search-sources.mjs` | `collectFromCdp`, `collectFromApi`, `collectFromMcp`, `collectFromSource`, `main` filter switch to reading `capabilities.articles` with top-level fallback | High | Primary consumer. All 4 collection functions + filter logic change. If a field is missed, that collection path breaks silently (returns empty array). Mitigated by compat-layer fallback pattern `cap?.x ?? source.x`. |
| `scripts/short-video/__tests__/source-registry-capabilities.test.mjs` | Add test groups for `method`, `apiSearch`, `requiresApiKey`/`apiKeyEnv`/`paidApi`, `cdpFallback`/`mcpFallback` in capability | Low | Pure addition — new test groups, no modification to existing tests. |
| `scripts/short-video/__tests__/source-registry.test.mjs` | Research-mode filter tests verify `capabilities.articles.cdpFallback` is now set | Low | Line 1138 already references this field; it will now return data instead of empty. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Source with `method: "cdp"` and no fallbacks | `capabilities.articles.cdpFallback === undefined`, `mcpFallback === undefined`. `collectFromSource` skips fallback steps. | Low | `?.` chain + `if (articles.length === 0 && cap?.cdpFallback)` handles undefined. |
| 2 | Source with `method: "api"` and `apiSearch` | `capabilities.articles.apiSearch` is the same object reference as top-level `source.apiSearch`. `collectFromApi` reads `cap.apiSearch.url`. | Medium | Direct reference ensures consistency. Compat fallback `cap?.apiSearch ?? source.apiSearch`. |
| 3 | Source with `cdpFallback` (x_search) | `capabilities.articles.cdpFallback` is set. Research-mode filter correctly includes x_search. Bug fix. | Medium | Test verifies `cap.articles.cdpFallback` is defined for x_search. |
| 4 | Source with `mcpFallback` (12 sources) | `capabilities.articles.mcpFallback` is set. `collectFromMcp` reads from capability. | Medium | Test verifies all 12 sources have `cap.articles.mcpFallback` defined. |
| 5 | API source with `requiresApiKey: true` (gnews) | `capabilities.articles.requiresApiKey === true`, `apiKeyEnv === "GNEWS_API_KEY"`. Filter can gate on `cap.requiresApiKey` without checking `apiSearch.authRequired`. | Low | Hard-coded lookup map. Test verifies specific values. |
| 6 | Paid API source (tiktok_creator) | `capabilities.articles.paidApi === true`. Filter reads `cap.paidApi` instead of `source.apiSearch?.paidApi`. | Low | Test verifies `cap.paidApi === true` for tiktok_creator. |
| 7 | API source without auth (arxiv, reddit, etc.) | `capabilities.articles.requiresApiKey === false`, `apiKeyEnv === null`, `paidApi === false`. | Low | Test verifies defaults for 20 non-auth API sources. |
| 8 | CDP-only source (no apiSearch, no fallback) | `capabilities.articles.apiSearch === undefined`, `requiresApiKey === false`, `paidApi === false`. `collectFromApi` returns `[]` (no apiSearch). | Low | 30 CDP-only sources. Test verifies. |
| 9 | `collectFromSource` reads capability | All 4 collection functions read from `cap = source.capabilities?.articles`. If `cap` is undefined (shouldn't happen), fallback to top-level via `??`. | High | Compat fallback pattern. Test with mock source. |
| 10 | Research-mode filter uses `cap.cdpFallback` | Filter reads `s.capabilities?.articles?.cdpFallback` (existing line 339). After migration, x_search is correctly included. | Medium | Existing test at line 1138 now returns non-empty. |
| 11 | Paid-source filter uses `cap.paidApi` | Filter reads `s.capabilities?.articles?.paidApi` instead of `s.apiSearch?.paidApi`. | Medium | New filter line. Test verifies paid sources are filtered. |
| 12 | `apiSearch` reference identity | `source.capabilities.articles.apiSearch === source.apiSearch` (same object). Mutating one reflects in the other. | Low | Direct reference assignment. Test verifies identity. |

## Further Notes

- Triage comment on Issue #67 (2026-08-21) incorrectly states `method` and `requiresApiKey`/`apiKeyEnv`/`paidApi` are "COMPLETED". Code verification shows 0/53 sources have `method` and 0/23 API sources have `apiKeyEnv` in `capabilities.articles`. This spec covers the actual state.
- The `accessMethod.fallbacks` field was deleted in a prior commit (2026-08-20). The proposed `fallbacks` array should source from `cdpFallback`/`mcpFallback` top-level fields.
- `asset-sourcer.mjs:1458` reads `source.url` for image search — this belongs to `capabilities.images`, not `articles`. Not in scope.

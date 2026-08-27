# 01 — Source Registry Field Rename (articleScript, imageScript, googleSiteFallback)

**What to build:** All 4 field names renamed atomically across the entire codebase: `extractScript`→`articleScript`, `primaryScript`→`imageScript`, `fallbackScript`→`imageFallbackScript`, `cdpFallback`→`googleSiteFallback`. Tests, consumers, and non-archive docs all updated in one pass. Pipeline behavior identical after rename.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Wide refactor note:** This is a mechanical rename with blast radius across 6 code files + 2 test files + ~20 doc references. No compat aliases (internal codebase, no external consumers). Single atomic rename — CI green only after ALL references updated. Cannot be split into vertical slices because partial rename = field mismatch = all CDP sources return 0 results.

### TDD Checklist

- [ ] **Red**: Write test asserting `source.articleScript` exists (not `source.extractScript`) for a known source — fails because field still named `extractScript`
- [ ] **Red**: Write test asserting `source.googleSiteFallback` exists (not `source.cdpFallback`) for x_search — fails
- [ ] **Red**: Write test asserting `CDP_IMAGE_CAPABILITIES.ithome.imageScript` exists (not `primaryScript`) — fails
- [ ] **Red**: Write test asserting `CDP_IMAGE_CAPABILITIES.ithome.imageFallbackScript` exists (not `fallbackScript`) — fails
- [ ] **Red**: Write test asserting no source has old field names anywhere — fails (old names still present)
- [ ] **Green**: Rename in `source-registry.mjs`: all `extractScript`→`articleScript` (58), `cdpFallback`→`googleSiteFallback`, `primaryScript`→`imageScript` (9), `fallbackScript`→`imageFallbackScript` (9), update comment header + `enrichWithCapabilities()`
- [ ] **Green**: Rename in `search-sources.mjs`: `extractScript`→`articleScript` (6 refs), `cdpFallback`→`googleSiteFallback` (4 refs), update comments
- [ ] **Green**: Rename in `asset-sourcer.mjs`: `primaryScript`→`imageScript` (3 refs), `fallbackScript`→`imageFallbackScript` (3 refs)
- [ ] **Green**: Rename in `cdp-client.mjs`: parameter `extractScript`→`script`, update JSDoc
- [ ] **Green**: Update tests in `source-registry-capabilities.test.mjs` (~16 assertions)
- [ ] **Green**: Update tests in `asset-sourcer.test.mjs` (~14 assertions)
- [ ] **Green**: Update non-archive docs (~20 references across `docs/research/`, `docs/adr/`)
- [ ] **Refactor**: Run `grep -r 'extractScript\|primaryScript\|fallbackScript\|cdpFallback' scripts/short-video/` — verify 0 matches (excluding archive)
- [ ] **Refactor**: Run `grep -r 'extractScript\|primaryScript\|fallbackScript\|cdpFallback' docs/ --exclude-dir=archive` — verify 0 matches
- [ ] **Verify**: `npm run lint && npm run build && npx tsc --noEmit` all pass
- [ ] **Verify**: `npm test` all pass

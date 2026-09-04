# Code Review: SVE — Single-Visit Extraction (#114)

**Date:** 2026-08-27
**Spec:** `docs/spec-sve-single-visit-extraction.md`
**Tickets:** `docs/tickets-sve-single-visit-extraction.md`

## Standards

### Files changed

1. `scripts/short-video/lib/trends-utils.mjs` — `buildOutputJson` additive: `videos[]` + `metadata{}` fields
2. `scripts/short-video/search-sources.mjs` — `enrichWithImages` → `enrichWithMedia` rename + video/metadata extraction
3. `scripts/short-video/lib/extract-media.mjs` — new script, exports: `buildMediaExtractScript`, `parseMediaExtractResult`, `loadMediaCache`, `saveMediaCache`, `mergeMediaCacheEntry`, `main`
4. `scripts/short-video/lib/asset-sourcer.mjs` — `loadCachedMedia`, `toCachedMediaCandidate`, Phase 0b insertion
5. `docs/content-pipeline.md` — SVE rule added to Stage 0
6. `scripts/short-video/__tests__/extract-media.test.mjs` — new, 17 tests
7. `scripts/short-video/__tests__/trends-utils.test.mjs` — 7 new tests
8. `scripts/short-video/__tests__/asset-sourcer.test.mjs` — 4 new tests (10 assertions across 2 describes)

### Findings

1. **Duplicated Code (judgement call)** — `loadCachedMedia` in asset-sourcer.mjs and `loadCachedImages` in the same file share the same "file missing → [], malformed → [], keyword match" pattern. The data structures differ (trending-topics.json vs media-cache.json), so full extraction is justified, but the file-missing/malformed guard could be extracted to a shared helper. **Verdict: acceptable** — the difference in data shape (topics → images vs entries → images+videos+ogImage) means a shared helper would need to be generic enough to lose readability.

2. **Duplicated Code (judgement call)** — `enrichWithMedia` in search-sources.mjs and `buildMediaExtractScript` in extract-media.mjs both extract `<video>`, `<iframe>`, `og:image`/`og:video` from DOM. The eval scripts are similar but serve different contexts (search result page vs detail page) with different thresholds (search page matches by article link, detail page uses naturalWidth > 400). **Verdict: acceptable** — the contexts are different enough that sharing would require parametrization that obscures intent.

3. **Mysterious Name** — `mediaData.videos._page` in `enrichWithMedia` eval script uses `_page` as a key to indicate page-level videos (not per-article). **Verdict: minor** — could use `pageLevel` but `_page` convention is clear enough within context.

4. **Coding Conventions** — 2-space indentation ✅, PascalCase for types ✅, camelCase for functions ✅. No violations found.

5. **Non-fatal error handling** — both `enrichWithMedia` and `loadCachedMedia` use try/catch with empty-result fallback, matching the existing pattern from `loadCachedImages`. ✅

6. **Atomic write pattern** — `saveMediaCache` uses the same tmp-file + renameSync pattern as `search-results-cache.mjs`. ✅

7. **No linter errors** — all 7 changed files pass lint clean.

## Spec

### Requirements checklist

| Spec requirement                                                    | Status     | Notes                                            |
| ------------------------------------------------------------------- | ---------- | ------------------------------------------------ |
| `enrichWithImages` → `enrichWithMedia`                              | ✅ Done    | Renamed, same call site updated                  |
| Video extraction: `<video>` src, `<source>`, `<iframe>`, `og:video` | ✅ Done    | All 4 sources covered in eval script             |
| Metadata: `og:image`, `og:title`, `article:published_time`          | ✅ Done    | All 3 meta tags extracted                        |
| Articles get `videoUrls` + `metadata` fields                        | ✅ Done    | Additive, backward compat                        |
| `buildOutputJson` writes `videos[]` + `metadata{}`                  | ✅ Done    | 7 tests cover present/absent/both                |
| `extract-media.mjs` with `--url` and `--tab`                        | ✅ Done    | Both CLI options implemented                     |
| `media-cache.json` versioned schema                                 | ✅ Done    | `MEDIA_CACHE_VERSION = 1`                        |
| Merge by `sourceUrl`                                                | ✅ Done    | `mergeMediaCacheEntry` tested                    |
| Logo/icon filtering                                                 | ✅ Done    | `isLogoOrIcon()` reused                          |
| `loadCachedMedia` file-missing → [], malformed → []                 | ✅ Done    | 3 tests cover                                    |
| `toCachedMediaCandidate` type preservation                          | ✅ Done    | image stays image, video stays video             |
| Phase 0b between Phase 0 and Phase 1                                | ✅ Done    | Inserted in main function                        |
| Uses `downloadCandidate()`                                          | ✅ Done    | No new download logic                            |
| `downloadedUrls` Set cross-phase dedup                              | ✅ Done    | Phase 0b checks before download                  |
| `content-pipeline.md` updated                                       | ✅ Done    | SVE rule added to Stage 0 entries                |
| Non-fatal: media extraction failure doesn't block                   | ✅ Done    | try/catch in enrichWithMedia and loadCachedMedia |
| Scenario matrix rows 1-19                                           | ✅ Covered | Tests cover rows 1-6, 9-19                       |

### Missing/partial

None — all spec requirements are implemented.

### Scope creep

None — no behavior beyond what the spec describes.

### Implementation issues

1. `saveMediaCache` uses synchronous file I/O (`writeFileSync`, `renameSync`). This matches the existing pattern in `search-results-cache.mjs`, so it's consistent, but worth noting if the pipeline ever moves to async.

2. The `_page` key convention in `enrichWithMedia` eval script (`results.videos._page`) is a slightly unusual pattern — it stores page-level videos under a reserved key. An alternative would be `{ videos: [], metadata: {} }` where videos is a flat array. However, the current approach preserves the ability to later add per-article video matching (like images are matched by article URL), so it's forward-compatible.

## Summary

- **Standards:** 2 judgement calls (acceptable duplication), 1 minor naming. No hard violations.
- **Spec:** All requirements implemented. No missing, no scope creep, 2 implementation notes (non-blocking).

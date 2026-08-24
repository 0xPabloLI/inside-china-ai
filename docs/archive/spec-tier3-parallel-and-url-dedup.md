# Spec: Tier 3 Engine Parallelism + Cross-Phase URL Dedup

## Problem

Two issues identified after #110 implementation:

1. **Tier 3 engines were serial** — Brave Image and SearXNG Image searched sequentially per keyword, wasting wall-clock time when engines are independent.
2. **No URL-level dedup across phases** — Phase 0 (cached images from trend discovery) could download image URL X, then Tier 2 (CDP) returns the same URL X and downloads it again, violating Single Visit Extraction principle.

## Solution

### Part 1: Tier 3 Engine Parallelism

- Refactor Tier 3 loop from `for (source) { for (keyword) }` to `Promise.allSettled(tier3Sources.map(async (source) => { for (keyword) }))`
- Each engine runs independently; within each engine, keywords are processed serially (anti-bot: same engine doesn't get hammered with concurrent requests)
- Results merged back into `allAssets`, `failed`, `skipped` after all engines settle

### Part 2: Cross-Phase URL Dedup

- `const downloadedUrls = new Set()` declared in `main()` scope, accessible to all phases via closure
- Before each `downloadAsset()` / `downloadYtdlp()` call: check `downloadedUrls.has(candidate.url)` — if true, skip and push to `skipped`
- After successful download: `downloadedUrls.add(candidate.url)`
- Failed downloads do NOT add URL to Set — allows retry in later phase

## User Stories

1. As a pipeline operator, I want Tier 3 engines to search in parallel so that wall-clock time is reduced ~50% when both Brave and SearXNG are used.
2. As a pipeline operator, I want URL-level dedup so that the same image is never downloaded twice, even when different search phases return overlapping results.

## Implementation Decisions

- **No URL normalization**: URLs from different engines are compared as-is. Same image from different CDN URLs (e.g., `ithome.com/img/123.jpg` vs `ithome.com/img/123.jpg?v=2`) won't dedup — acceptable, as query-parameter variants are rare for content images.
- **No Set locking for Tier 3 parallel engines**: `Promise.allSettled` runs engines concurrently, but Brave Image and SearXNG Image indices don't overlap — URL collision probability is near zero. Race condition is documented as known limitation.
- **Downloaded URLs not persisted to cache**: `downloadedUrls` is runtime-only (per `main()` invocation). Cross-run dedup is handled by `search-cache.json` (cache hit skips search entirely) and `downloadAsset()` file-exists check (skips download if file already on disk).

## Testing Decisions

- Unit tests for parallel engine execution: mock `searchBraveImages` / `searchSearXngImages` to verify both are called concurrently
- Unit tests for URL dedup: verify that when the same URL appears in Phase 0 and Tier 2, only one download occurs
- Existing 223 tests serve as regression — all must still pass

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `scripts/short-video/lib/asset-sourcer.mjs` | Tier 3 serial → parallel (`Promise.allSettled`); add `downloadedUrls` Set + checks at 5 download points | Medium | 修改了 `main()` 核心编排逻辑。223 existing tests pass as regression. Parallel logic isolated to Tier 3 block. URL dedup is additive (skip before download), doesn't change existing download logic. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Phase 0 downloads URL X, Tier 2 returns same URL X | Tier 2 skips download, pushes to `skipped` with reason "URL already downloaded" | Low | `downloadedUrls.has(X)` check before `downloadAsset()` |
| 2 | API source and CDP source return same URL | Second occurrence skipped | Low | Same check at CDP download point |
| 3 | Tier 3 two engines return same URL (race condition) | Both may download — no `Set` locking | Low | Different search engines index different image sources; URL collision near-zero. Documented as known limitation. |
| 4 | Download fails (HTTP error) | URL NOT added to Set | Correct | `if (dlResult.success) downloadedUrls.add(url)` — only on success |
| 5 | URL is null/undefined | `downloadedUrls.has(null)` → false, proceeds to download | Correct | `null` URL candidates are filtered by `if (!candidate.url) continue` before dedup check |
| 6 | One Tier 3 engine rejects | Other engine still completes | Correct | `Promise.allSettled` isolates failures |
| 7 | All Tier 3 engines lack API keys | All skipped, Tier 3 produces no assets | Correct | Existing test coverage in `progressive-search.test.mjs` |
| 8 | Cache hit for all source/keyword pairs | No download triggered, no dedup needed | Correct | `getOrSearchResults` returns `cacheHit: true`, candidates come from cache, but download still runs — dedup check applies |
| 9 | yt-dlp source returns URL already downloaded by API source | yt-dlp skips download | Low | Same `downloadedUrls.has()` check at yt-dlp download point |
| 10 | Tier 3 runs after CDP, both downloaded same image | Tier 3 skips | Low | Same check at Tier 3 download point (inside `Promise.allSettled` callback) |

## Out of Scope

- URL normalization (stripping query params, normalizing hostnames)
- `Set` locking for thread-safe parallel engine dedup (documented limitation)
- Persisting `downloadedUrls` across runs (handled by `search-cache.json` + file-exists check)
- Phase 0 and Tier 2 cache file merge (different data structures, not worth coupling)

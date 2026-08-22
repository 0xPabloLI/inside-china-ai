# Spec: Refresh PR #102 on Current Asset Sourcer

## Goal

Update PR #102 without rewriting published history so that it merges cleanly with current `main`. The refreshed implementation must complete the open correctness work in #56 and reintroduce the same-stage search-call cache from #84 while preserving the current Asset Sourcer scoring, pre-download filtering, keyword provenance, VLM semantic analysis, and source behavior.

## Scope and Ownership

| Issue | Owned change                                                                                                                                                                                                 | Explicit non-goals                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| #56   | Make Phase 0 cached-image candidates pass the existing pre-download path when the originating article title matches the keyword; retain stable provenance; cover the positive and fallback paths with tests. | Do not change Stage 1 output schema or add cached video support.            |
| #84   | Add content-local, versioned API/CDP/yt-dlp search-result caching across reruns of the same content.                                                                                                         | Do not cache Phase 0 trend-discovery media or alter `trending-topics.json`. |

## Grill Record and Decisions

The previously published Issue acceptance criteria supply the implementation contract. The dedicated `grill-with-docs`, `to-spec`, and `to-tickets` skills are unavailable in the current environment; this specification records the equivalent decisions and scenario review.

| Decision                | Chosen behavior                                                                                                                    | Evidence / rationale                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Integration baseline    | Merge current `origin/main` into the existing PR branch through a non-rewriting merge commit.                                      | PR #102 is `DIRTY`; current main changed Asset Sourcer scoring, filtering, and source behavior after the PR branch point. |
| #56 candidate title     | Map `sourceTitle` to `title` when forming a Phase 0 candidate; retain `sourceArticle`; use `source: "cached"`.                     | `preFilterCandidate()` scores title relevance and otherwise rejects image candidates below the threshold.                 |
| Cache scope             | Cache only direct Stage 4 source-search results under `content/<slug>/search-cache.json`.                                          | Keeps #84 separate from #56's `trending-topics.json` cross-stage cache.                                                   |
| Cache key and freshness | Key by normalized `source + keyword`; use cache version 1 and a 24-hour TTL.                                                       | Prevents cross-source/query collisions and keeps direct media URLs reasonably fresh.                                      |
| Cache persistence       | Cache only non-empty live results; merge entries in memory and atomically persist once after source loops.                         | Avoids locking in transient empty/error responses and prevents concurrent source writes from overwriting each other.      |
| Cache failure behavior  | Invalid, expired, malformed, or write-failed caches degrade to live search; an optional cache write cannot fail the run.           | Search and media collection are the primary operation.                                                                    |
| Source availability     | Cache hits may be consumed without API credentials or CDP availability; a live miss retains the normal credential/CDP requirement. | Reuses already discovered candidates while preserving live-search safeguards.                                             |
| Merge order             | Finish #56 before completing #84 integration, then ensure both paths coexist in a single refreshed PR.                             | #84 must preserve the Phase 0 behavior that #56 repairs.                                                                  |

## Interface Contracts

### Phase 0 cached images (#56)

`loadCachedImages()` returns candidates derived from Stage 1 trend discovery. Before scoring and filtering, the Phase 0 mapping must provide:

```js
{
  title: sourceTitle,
  source: "cached",
  sourceArticle,
  type: "image",
  url
}
```

A missing trend cache, non-matching title, excluded URL pattern, failed download, or pre-download rejection must not suppress downstream source collection.

### Search result cache (#84)

The content-local cache envelope is:

```js
{
  version: 1,
  entries: [
    {
      source: "youtube",
      keyword: "Unitree H1",
      timestamp: "2026-08-22T00:00:00.000Z",
      results: [{ title: "…", url: "…", type: "video" }]
    }
  ]
}
```

The API, CDP, and yt-dlp loops receive the exact candidate arrays they would receive from live search, then continue through the existing score, `preFilterCandidate()`, download, VLM, and assignment flow.

## Scenario & Risk Verification Matrix

### Modified Files Impact

| File                                                                                     | Modification                                                                                                            |   Risk | Assessment                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/asset-sourcer.mjs`                                              | Merge latest pipeline behavior; map #56 candidate title/provenance; add #84 cache-first checks to API/CDP/yt-dlp loops. |   High | Central media pipeline path with multiple consumers. Preserve current score, prefilter, VLM, source-registry, download, and report behavior; validate targeted and full available tests. |
| `scripts/short-video/lib/search-results-cache.mjs`                                       | Add versioned cache read/write/lookup helpers.                                                                          |    Low | New isolated module. Validate malformed, expired, empty, persistence-error, and atomic-cleanup cases.                                                                                    |
| `scripts/short-video/__tests__/asset-sourcer.test.mjs`                                   | Add Phase 0 and cache integration regression coverage.                                                                  | Medium | Changes test expectations around a core orchestrator; use mocks and assert existing filtering is still applied.                                                                          |
| `scripts/short-video/__tests__/search-results-cache.test.mjs`                            | Add module-level cache contract tests.                                                                                  |    Low | New isolated test suite.                                                                                                                                                                 |
| `docs/spec-issue-56-84-pr102-refresh.md` and `docs/tickets-issue-56-84-pr102-refresh.md` | Temporary implementation records.                                                                                       |    Low | Archive after verified completion and update index/archive manifest.                                                                                                                     |

### Behavioral Scenarios

|   # | Scenario                                                                 | Expected behavior                                                                                                                                             | Risk                                                  | Mitigation / test                                                          |
| --: | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- |
|   1 | Matching Phase 0 cached image has `sourceTitle`                          | Candidate receives that title, clears the existing pre-download gate when otherwise eligible, downloads, and retains `source: "cached"` plus `sourceArticle`. | #56 image is silently skipped.                        | End-to-end mocked trend-cache/download test.                               |
|   2 | Trend cache is missing, a title does not match, or URL is logo/icon-like | Phase 0 returns no usable asset and normal sources remain available.                                                                                          | A cross-stage miss aborts source search.              | Existing pure-function negative tests plus fallback orchestrator coverage. |
|   3 | API cache hit with no API key                                            | Cached candidates continue through current score/prefilter/download behavior without a live API call.                                                         | Re-run fails unnecessarily.                           | Mock API search and assert it is not called.                               |
|   4 | API cache miss with no API key                                           | Source is skipped using current behavior; no empty result is cached.                                                                                          | Invalid cache masks configuration error.              | Regression test.                                                           |
|   5 | Fully cached CDP queries while CDP proxy is unavailable                  | Run may proceed without CDP; a live CDP miss still requires the existing proxy check.                                                                         | Cached rerun unnecessarily exits.                     | Cache hit/miss proxy-gating tests.                                         |
|   6 | yt-dlp cache hit and miss                                                | Hit skips `searchYtdlp`; miss searches and records only non-empty results.                                                                                    | Duplicate platform calls or loss of video candidates. | Source-specific mock tests.                                                |
|   7 | Expired, version-mismatched, malformed, or candidate-invalid cache       | Treat as a miss and perform live search; malformed data never reaches scoring/downloading.                                                                    | Stale/corrupt media is reused.                        | Module contract tests.                                                     |
|   8 | Multiple live source results in one run                                  | Entries merge in memory and save once atomically after the loops.                                                                                             | Last writer overwrites another source entry.          | Multi-entry persistence test.                                              |
|   9 | Cache write fails                                                        | Warn but preserve completed media collection/report behavior; clean any temporary file.                                                                       | Optional optimization aborts pipeline or leaks files. | Failure-injection test.                                                    |
|  10 | Cached or live candidate is processed                                    | Existing score, `preFilterCandidate()`, VLM semantic analysis, and assignment logic remain intact.                                                            | Cache bypasses current quality safeguards.            | Integration assertion plus targeted regression suite.                      |

## Test and Verification Plan

Implement every behavioral scenario as a failing test before its corresponding production change. Run the cache-specific suite, Asset Sourcer suite, formatter/lint for modified files, `npm run build`, and `npx tsc --noEmit`. Run the full suite where environment dependencies allow; document any existing fixture or local-runtime blockers separately.

## Completion Criteria

The refreshed PR #102 is mergeable against current `main`, preserves current Asset Sourcer contracts, contains the #56 correctness fix and #84 cache implementation, passes targeted verification, and includes updated Issue comments plus archived spec/ticket records.

## Design Decisions & References

- GitHub Issue #56 — Phase 0 cached-image correctness acceptance criteria.
- GitHub Issue #84 — same-stage search-call caching acceptance criteria.
- GitHub Issue #44 — current scoring, keyword-provenance, semantics, and pre-download-filter baseline.
- `docs/conventions/scenario-enumeration-checklist.md` and `docs/conventions/scenario-matrix.md` — scenario review requirements.

# Spec: Issue #84 Search-Call Cache

## Status

Active implementation specification for GitHub Issue #84.

## Problem

`asset-sourcer.mjs` avoids downloading a media file when the destination already exists, but it repeats the preceding API, CDP, and yt-dlp searches on every run. Repeating those searches consumes external quotas and browser sessions even when the same candidate set will be selected again.

## Goal

Add a content-scoped, versioned search-results cache. For the same source and normalized keyword, Asset Sourcer must reuse recent image or video candidates instead of issuing another search. A cache miss, expired entry, incompatible schema, malformed file, or empty cached result must preserve the current live-search behavior.

## Non-goals

This change does not alter candidate scoring, pre-download filtering, downloads, VLM analysis, scene assignment, source definitions, or the existing cross-stage trend-image cache. It does not cache media bytes, share results across content slugs, introduce a remote cache, or infer search success from an empty result array.

## Cache Contract

The cache lives at `scripts/short-video/content/<slug>/search-cache.json` and uses the following version-1 envelope:

```json
{
  "version": 1,
  "entries": [
    {
      "source": "youtube",
      "keyword": "Unitree H1",
      "timestamp": "2026-08-21T12:00:00.000Z",
      "results": [
        {
          "title": "Unitree H1 robot demo",
          "url": "https://www.youtube.com/watch?v=example",
          "type": "video",
          "duration": 8
        }
      ]
    }
  ]
}
```

| Contract element | Rule |
|---|---|
| Cache identity | `source` plus the trimmed, case-insensitive keyword. The original keyword remains in the entry for diagnostics. |
| Candidate payload | Store the raw candidate objects returned by the source so video fields such as `url`, `type`, `duration`, and `resolution` survive unchanged. `undefined` values may be omitted by JSON serialization. |
| Validity | An entry is reusable only when `version === 1`, `results` is a non-empty array, and its ISO timestamp is no older than 24 hours. |
| Miss behavior | Missing file, malformed JSON, missing/mismatched fields, expired timestamp, version mismatch, or empty results is a cache miss and invokes the existing live search. |
| Write behavior | Only non-empty live-search results are added. The process loads once, updates an in-memory envelope, and writes once after source collection. |
| Invalidation | Raising the cache version invalidates all prior envelopes. TTL expiry invalidates each entry independently. |
| Scope | Each content slug has its own file; no cache entry is read from another content directory. |

## Operational Flow

1. Asset Sourcer loads or initializes the content-local cache before source collection.
2. For each API source/keyword, yt-dlp source/keyword, and CDP source/keyword pair, it looks up a valid entry before invoking the existing search function.
3. On a valid hit, it passes the cached candidates into the unmodified scoring, pre-filtering, and download path. A hit is logged with source and keyword.
4. On a miss, it calls the existing search function. Non-empty results are queued for persistence and then flow through the same scoring, filtering, and download path.
5. After all source collection completes, Asset Sourcer writes the updated envelope once if live non-empty results were added. Failure to write the cache must not abort media collection.

## Scenario & Risk Verification

### Modified Files Impact

| File | Modification | Risk level | Assessment |
|---|---|---:|---|
| `scripts/short-video/lib/asset-sourcer.mjs` | Route API, yt-dlp, and CDP searches through the cache while retaining their current candidate processing. | Medium | Changes a core data path with three consumers. The cache falls back to the existing live search for every invalid or absent entry, and existing score/download behavior remains unchanged. |
| `scripts/short-video/lib/search-results-cache.mjs` | Add isolated parsing, keying, lookup, update, and persistence helpers. | Low | New module with no existing consumers. Explicit inputs and time injection make cache behavior independently testable. |
| `scripts/short-video/__tests__/asset-sourcer.test.mjs` | Add orchestration-level coverage for cache-aware collection helpers or exported cache integration points. | Medium | Tests must prevent regression in the three source types and ensure cache hits do not invoke a live search. |
| `scripts/short-video/__tests__/search-results-cache.test.mjs` | Add direct cache contract tests. | Low | New tests only; they lock the envelope schema and fallback behavior. |

### Behavioral Scenarios

| # | Scenario | Expected behavior | Risk | Mitigation |
|---:|---|---|---|---|
| 1 | No cache file exists | Return a miss and invoke the live search. | Missing media collection | Treat absent files as an empty cache. |
| 2 | Valid API image entry | Reuse candidates without an API request; later score/download behavior is unchanged. | Quota-saving path diverges | Feed raw candidates into the existing path. |
| 3 | Valid yt-dlp video entry | Reuse video candidates without invoking yt-dlp search; later `downloadYtdlp` still runs. | Video regression | Preserve `url`, `type`, and duration metadata unchanged. |
| 4 | Valid CDP image entry | Reuse cached candidates without opening a CDP search page. | Browser-session waste | Apply the same source/keyword lookup before CDP invocation. |
| 5 | Different source or keyword | Do not reuse another entry. | Incorrect media attribution | Key by source plus normalized keyword. |
| 6 | Keyword differs only by case or surrounding whitespace | Reuse the same entry. | Duplicate searches | Normalize cache keys only; retain original keyword for logging. |
| 7 | Entry is older than 24 hours | Treat as a miss and refresh it from live search. | Stale direct URLs/results | Inject the current time and check TTL per entry. |
| 8 | Envelope version differs | Treat all entries as a miss. | Parser/config changes use stale schema | Require exact version equality. |
| 9 | Malformed JSON or invalid entry shape | Treat as a miss; do not throw or abort the run. | Pipeline failure | Defensive parsing and validation. |
| 10 | Live search returns `[]` or fails internally | Do not persist an empty result set. | Transient failures become sticky misses | Store only non-empty arrays. |
| 11 | Multiple API searches run in parallel | All discovered entries are retained; disk receives one merged write. | Lost update race | Load once, mutate one in-memory envelope, save after collection. |
| 12 | Cache persistence fails | Continue with already collected candidates and report a warning. | Media run fails due to optional optimization | Make persistence best-effort. |

## Acceptance Criteria

1. A repeated run for the same content, source, and keyword reuses a valid cached image or video candidate set and skips the corresponding API/CDP/yt-dlp search.
2. Cache behavior is isolated by content slug, source, and normalized keyword.
3. Stale, malformed, empty, or incompatible cache data falls back to existing live search without terminating the run.
4. Results are written once per run only after a non-empty live search result is available.
5. Tests cover every behavioral scenario in the matrix, and existing Asset Sourcer tests continue to pass.

## Design Decisions & References

The 24-hour TTL, content-local placement, versioned envelope, non-empty-only writes, and single merged write are the user-confirmed defaults for this implementation. The issue scope and existing live-search paths are recorded in GitHub Issue #84 and `scripts/short-video/lib/asset-sourcer.mjs`.

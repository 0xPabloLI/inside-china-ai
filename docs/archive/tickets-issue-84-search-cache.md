# Tickets: Issue #84 Search-Call Cache

## Traceability

Specification: [`spec-issue-84-search-cache.md`](./spec-issue-84-search-cache.md)  
GitHub Issue: #84

## Dependency Graph

```text
T84-1 (cache contract tests) → T84-2 (cache module) → T84-3 (Asset Sourcer integration tests + implementation) → T84-4 (regression verification) → T84-5 (review, archive, issue update)
```

## T84-1 — Define the cache contract in tests

- [x] Add direct tests for absent, malformed, valid, expired, version-mismatched, empty, source-isolated, normalized-keyword, and multi-entry cache states.
- [x] Add test coverage proving raw video candidate fields survive a round-trip.
- [x] Verify the new test file fails before the cache module exists.

**Depends on:** none  
**Spec coverage:** scenarios 1, 5–11

## T84-2 — Implement isolated cache helpers

- [x] Add `search-results-cache.mjs` with version, TTL, load, lookup, record, and best-effort save helpers.
- [x] Keep the module independent from source-specific search logic.
- [x] Make time and filesystem paths explicit inputs for deterministic tests.
- [x] Re-run direct cache tests and confirm green.

**Depends on:** T84-1  
**Spec coverage:** scenarios 1, 5–12

## T84-3 — Route Asset Sourcer searches through the cache

- [x] Add orchestration tests for API images, yt-dlp videos, and CDP images proving cache hits avoid the corresponding live search.
- [x] Add cache loading before collection and one merged save after collection.
- [x] Preserve existing candidate scoring, filtering, downloading, reporting, and source attribution.
- [x] Ensure a cache-write failure logs a warning and does not discard already collected candidates.
- [x] Re-run the full Asset Sourcer test suite.

**Depends on:** T84-2  
**Spec coverage:** scenarios 2–4, 10, 12

## T84-4 — Run regression and runtime verification

- [x] Execute targeted cache and Asset Sourcer tests.
- [x] Execute the project test suite, lint, build, and TypeScript checks. Targeted tests, build, and type checks pass; repository-wide tests and lint remain blocked by pre-existing missing media/Python fixtures and unrelated formatting errors.
- [x] Inspect the cache file path and JSON shape through a controlled temporary-fixture run; do not call external source APIs.

**Depends on:** T84-3  
**Spec coverage:** all scenarios

## T84-5 — Review and integrate

- [x] Compare changed files against the specification and scenario matrix.
- [x] Inspect the diff for accidental source, download, or VLM behavior changes.
- [x] Commit with `Fixes #84`, push the feature branch, open pull request #102, and update Issue #84. GitHub will close the Issue automatically when the pull request merges.
- [x] Archive this specification and ticket file, then update `docs/archive/README.md` and `docs/DOCS-INDEX.md`.

**Depends on:** T84-4  
**Spec coverage:** completion governance

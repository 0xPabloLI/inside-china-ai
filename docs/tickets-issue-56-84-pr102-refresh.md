# Tickets: Refresh PR #102 on Current Asset Sourcer

> Spec: `docs/spec-issue-56-84-pr102-refresh.md`
>
> Merge policy: use a non-rewriting merge of current `origin/main` into the existing PR branch. Preserve current main behavior; do not resolve conflicts by restoring older code.

## T01 — Refresh the PR branch onto current main

- [ ] Merge current `origin/main` into `fix/issue-84-search-cache` without rebasing, amending, or force-pushing.
- [ ] Resolve each conflict by retaining current-main scoring, prefilter, semantic-analysis, source-registry, and test behavior; reapply only the #56/#84 deltas.
- [ ] Confirm the refreshed diff contains no unrelated reversions or generated artifacts.

**Depends on:** none.

## T02 — Repair Phase 0 cached-image candidate contract (#56)

- [ ] Add a failing orchestrator-level test showing a keyword-matched cached image with `sourceTitle` enters `allAssets` after a successful mock download.
- [ ] Add a failing negative/fallback test for non-matching or excluded URL candidates.
- [ ] Map `sourceTitle` to `title`; preserve `sourceArticle`; use stable `source: "cached"` in the Phase 0 asset mapping.
- [ ] Verify all candidates still pass the existing `scoreCandidate()` and `preFilterCandidate()` gate before download.

**Depends on:** T01.

## T03 — Reintroduce isolated search-result cache module (#84)

- [ ] Add or restore a failing module-level suite for normalized keys, TTL, version mismatch, malformed cache, non-empty-only writes, source isolation, candidate validation, atomic writes, and failure cleanup.
- [ ] Add `search-results-cache.mjs` with versioned envelope, 24-hour TTL, and atomic persistence.
- [ ] Ensure malformed/expired/invalid entries become cache misses and save failures are non-fatal.

**Depends on:** T01.

## T04 — Integrate same-stage cache without bypassing current filters (#84)

- [ ] Add failing API, CDP, and yt-dlp hit/miss tests showing live searches are skipped only on valid hits.
- [ ] Add failing regression tests for API cache hits without credentials and fully cached CDP runs without proxy availability; retain normal behavior for misses.
- [ ] Integrate cache-first lookup into API/CDP/yt-dlp searches, preserving `preFilterCandidate()`, search-keyword provenance, VLM semantic analysis, downloads, reports, and assignment.
- [ ] Write a merged cache once after all searches; warn instead of aborting on persistence failure.

**Depends on:** T02, T03.

## T05 — Review and validate the refreshed PR

- [ ] Re-run all targeted cache and Asset Sourcer tests.
- [ ] Run formatting/lint for every modified file, `npm run build`, and `npx tsc --noEmit`.
- [ ] Run the full test suite where environment dependencies allow; record blockers unrelated to this change.
- [ ] Check `git diff origin/main...HEAD`, whitespace errors, branch cleanliness, and PR mergeability.
- [ ] Conduct standards-and-spec code review; resolve findings with new commits rather than history rewrites.

**Depends on:** T04.

## T06 — Publish and close the tracking loop

- [ ] Commit each verified atomic change with explicit paths.
- [ ] Push normal follow-up commits to `fix/issue-84-search-cache`; do not force-push.
- [ ] Update PR #102 with its refreshed scope and verified test results.
- [ ] Update #56 and #84 with merged/remaining status; close only after the corresponding acceptance criteria are satisfied.
- [ ] Archive the spec and ticket files; update `docs/archive/README.md` and `docs/DOCS-INDEX.md`.

**Depends on:** T05.

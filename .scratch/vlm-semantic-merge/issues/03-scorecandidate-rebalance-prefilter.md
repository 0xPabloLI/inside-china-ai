# 03 — scoreCandidate rebalance + pre-filter gate (Issue #44)

**What to build:** Rebalance `scoreCandidate()` so non-AI components total 70 and AI relevance totals 30 (Issue #44 P1+P2). Add `searchKeyword` provenance preservation. Add boundary matching (punctuation normalization, token/phrase boundaries). Add pre-filter gate before VLM analysis. Fix 4K case-sensitivity (P3).

**Blocked by:** None — can start immediately (parallel with T-01).

**Status:** ready-for-agent

**Spec:** `docs/specs/spec-vlm-semantic-merge.md` (Issue #44 integration section)
**Review doc:** `docs/reviews/scorecandidate-review.md`

- [ ] Rebalance score weights: title 0-28, duration 0-18, size 0-14, resolution 0-10 = technical 0-70; AI relevance 0-30; total 0-100
- [ ] Preserve `searchKeyword` on every candidate in API, yt-dlp, and CDP paths (Issue #44 P1)
- [ ] Re-score after VLM analysis uses `asset.searchKeyword` not `keywords[0]`
- [ ] Boundary matching: normalize punctuation (including hyphens), use token/phrase boundaries for Latin, full-phrase bonus only on boundary match (Issue #44 P2)
- [ ] Fix 4K case sensitivity: `String(res).toLowerCase()` before checking (Issue #44 P3)
- [ ] Pre-filter gate: `technicalScore < 30` → mark `lowConfidence: true`, skip VLM analysis. Soft gate — VLM can still analyze if explicitly requested.
- [ ] Update `asset-sourcer.test.mjs`: recalculate all expected score values for rebalanced weights; add multi-keyword provenance tests; add boundary/hyphen/CJK tests; add near-100 base score tests; add pre-filter gate tests
- [ ] `scoreCandidate` signature unchanged: `scoreCandidate(candidate, keyword, aiDescription)` — backward compatible with existing callers

# 02 — scoreCandidate accepts { description, subjects } + recommendScene reads contentKind (P1-1)

**What to build:** Change `scoreCandidate` signature to accept a `{ description, subjects }` object. Subjects exact match (case-insensitive) gives 0-20 pts; description boundary match gives 0-10 pts. Add `contentKind → preferred visualType` mapping in `recommendScene`. Update all callers. Update all existing tests.

**Blocked by:** 01 (path fix may change `analyzeAssets` interface that callers depend on)

**Spec:** `docs/specs/spec-vlm-semantic-merge-remediation.md` (Decisions 2 + 3)

**Status:** ready-for-agent

- [ ] Change `scoreCandidate(candidate, keyword, semantics)` where `semantics = { description?: string, subjects?: string[] } | string` (string = backward compat)
- [ ] Subjects scoring: keyword case-insensitive exact match against subjects array → 20 pts; per-token match for multi-word keywords → proportional
- [ ] Description scoring: existing boundary match logic → 0-10 pts (unchanged)
- [ ] `relevanceScore = min(subjectsScore + descriptionScore, 30)`
- [ ] Update all callers in `asset-sourcer.mjs` `main()` to pass `{ description: asset.description, subjects: asset.subjects }`
- [ ] Add `CONTENT_KIND_PREFERENCE` map: `product_demo → narrative`, `talking_head → quote`
- [ ] Update `recommendScene` to prefer scenes matching `contentKind` preference before falling back
- [ ] Add test: subjects contains keyword (exact) → 20 pts, description does not → total 20
- [ ] Add test: subjects empty, description has keyword → 10 pts
- [ ] Add test: string semantics (backward compat) → works as before
- [ ] Add test: subjects substring (not exact) → no match
- [ ] Add test: multi-word keyword tokenized match against subjects
- [ ] Add test: `recommendScene` with `contentKind: "product_demo"` → prefers narrative
- [ ] Add test: `recommendScene` with `contentKind: "talking_head"` → prefers quote
- [ ] Add test: `recommendScene` with unknown contentKind → current fallback
- [ ] Add test: `recommendScene` with preferred type all taken → falls through
- [ ] All existing scoreCandidate tests updated for new signature

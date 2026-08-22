# 03 — Unify pre-filter as hard gate + isolate artifacts by content slug + legacy cleanup (P1-2/3/4)

**What to build:** (a) Update archived Spec text from "soft gate" to "hard gate" to match code. (b) Change artifact output paths to `output/{contentSlug}/` for both `asset-analysis.json` and `media-patch.json`. (c) Rename old experiment results file to `.legacy.json`. (d) Update `review-media-patch.mjs` default analysis path.

**Blocked by:** 02 (artifact path change depends on `analyzeAssets` interface from ticket 01+02)

**Spec:** `docs/specs/spec-vlm-semantic-merge-remediation.md` (Decisions 4 + 5 + 6)

**Status:** ready-for-agent

- [ ] Update `docs/archive/spec-vlm-semantic-merge.md` section 3: change "Soft gate" to "Hard gate" text
- [ ] Update `analyzeAssets` JSDoc: "hard gate" instead of "soft gate"
- [ ] Update `preFilterCandidate` JSDoc: remove "soft gate" reference
- [ ] In `main()`: change output dir from `output/` to `output/{contentSlug}/` for both asset-analysis.json and media-patch.json
- [ ] In `analyzeAssets`: write artifact to `join(outputDir, contentSlug, "asset-analysis.json")` when contentSlug is provided, else `join(outputDir, "asset-analysis.json")` (backward compat)
- [ ] Pass `contentSlug` to `analyzeAssets` via opts
- [ ] In `review-media-patch.mjs`: add `--content` CLI arg, default analysis path becomes `output/{contentSlug}/asset-analysis.json`
- [ ] Rename `experiments/vlm-focus-test-results.json` to `vlm-focus-test-results.legacy.json`
- [ ] Add test: `asset-analysis.json` written to `output/{contentSlug}/` when contentSlug provided
- [ ] Add test: `asset-analysis.json` written to `output/` when no contentSlug (backward compat)
- [ ] Add test: different contentSlugs produce different directories
- [ ] All existing tests still pass

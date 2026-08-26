# 04 — Pipeline Integration: Phase 3b + Artifacts + Patch Serialization

**What to build:** Add Phase 3b (crop decision) to `analyzeAssets()` in `asset-sourcer.mjs`. Include `cropFocus` in `media-patch.json` patch entries. Update `review-media-patch.mjs` to display crop decision. Update `apply-media-patch.mjs` to serialize `cropFocus` with numeric validation.

**Blocked by:** 01 (crop-decision.mjs), 02 (vlm crop simulation), 03 (renderer cropFocus field)

**Status:** ready-for-agent

- [x] `asset-sourcer.mjs` `analyzeAssets()`: Phase 3b added after Phase 3a. For each landscape image: calls `selectBestCrop()`, sets `asset.cropFocus`, `asset.fit`, `asset.cropDecision`.
- [x] `asset-sourcer.mjs` `assignAssetsToScenes()`: includes `cropFocus` in `media` object of patch entries when `asset.cropFocus` is set.
- [x] `asset-sourcer.mjs` artifact: includes `cropDecision` and `cropFocus` in `asset-analysis.json`.
- [x] `review-media-patch.mjs` `formatSemanticsSummary()`: displays `// Crop Decision:` line with status, policy, cropFocus, reason.
- [x] `review-media-patch.mjs` `formatPatchEntry()`: includes `cropFocus: { x: <val>, y: <val> },` in copyable media block.
- [x] `apply-media-patch.mjs` `formatMediaBlock()`: outputs `cropFocus` with numeric validation (throws on out-of-range or non-number).
- [x] `asset-sourcer-visual-integration.test.mjs` extended: 10 new tests covering Phase 3b (VC-01 to VC-04, portrait, video, VLM contain priority, artifact write) + 2 new assignAssetsToScenes cropFocus tests.
- [x] `apply-media-patch.test.mjs` extended: 3 new tests (VC-15 cropFocus serialization, absent cropFocus, VC-17 crop decision in review summary).
- [x] All tests pass: 185 total across 5 test files.

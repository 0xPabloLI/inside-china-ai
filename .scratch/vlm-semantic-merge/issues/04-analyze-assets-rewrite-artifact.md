# 04 — Rewrite analyzeAssets() + asset-analysis.json artifact

**What to build:** Rewrite `analyzeAssets()` in `asset-sourcer.mjs` to: Phase 1 focus detection (unchanged) → Phase 2a pre-filter (T-03) → Phase 2b single VLM call via `analyzeAssetSemantics` (T-02) → Phase 2c semantic scoring using VLM subjects + description. Output structured `asset-analysis.json` artifact for pipeline stages to consume. Update `review-media-patch.mjs` to read from artifact. Update `assignAssetsToScenes` to use `contentKind` for scene matching.

**Blocked by:** 02 (Node gateway) and 03 (scoreCandidate rebalance).

**Status:** ready-for-agent

**Spec:** `docs/specs/spec-vlm-semantic-merge.md`

- [ ] `analyzeAssets()` rewrite: Phase 1 focus detection → closeFocusDetector → Phase 2a pre-filter → Phase 2b `analyzeAssetSemantics` per surviving asset → Phase 2c semantic re-scoring
- [ ] Remove `checkResolution()` call from `analyzeAssets()` — Python side handles aspect ratio detection
- [ ] Remove `describeImage`/`describeVideo`/`analyzeFit` imports from `analyzeAssets()` — replaced by `analyzeAssetSemantics`
- [ ] Store VLM results on asset: `asset.description`, `asset.subjects`, `asset.contentKind`, `asset.fit`, `asset.criticalEdgeText`, `asset.reason`
- [ ] Semantic re-scoring: `relevanceScore` = subjects match (0-20) + description boundary match (0-10). Uses `asset.searchKeyword`.
- [ ] Output `asset-analysis.json` to `output/{pipelineId}/` — versioned, with model ID, analyzedAt, all assets with full VLM + focus analysis
- [ ] `assignAssetsToScenes` update: use `contentKind` for scene type matching (product_demo→narrative, talking_head→quote, chart→info-card, landscape→narrative)
- [ ] `assignAssetsToScenes` guard: skip `media.fit` for video assets (`if (semantics.fit && asset.type !== 'video')`)
- [ ] `review-media-patch.mjs` update: read from `asset-analysis.json` instead of scattered `asset.aiDescription`/`asset.aiFit` fields
- [ ] `remotion/src/types.ts` additive: add optional `contentKind` + `subjects` to `MediaField` (no existing fields changed)
- [ ] Rewrite `asset-sourcer-visual-integration.test.mjs`: mock `analyzeAssetSemantics` (not old APIs), verify single call per asset, verify pre-filter skip, verify `asset-analysis.json` output, verify semantic scoring
- [ ] `main()` in `asset-sourcer.mjs`: update to write `asset-analysis.json` alongside existing `asset-report.json` and `media-patch.json`
- [ ] Update `README.md` action table: `analyze_semantics` replaces `describe_image`/`describe_video`/`analyze_fit`

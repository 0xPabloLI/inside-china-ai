## Problem

`scoreCandidate()` in `asset-sourcer.mjs` has 5 issues documented in `docs/reviews/scorecandidate-review.md`:

### P1 — Re-scoring uses wrong keyword (High)
API candidates are flattened and scored with `keywords[0]`. After AI analysis, every downloaded asset is again scored using `keywords[0]`. The asset record does not retain the keyword that produced it.

**Fix**: Preserve `searchKeyword` on every candidate/asset. Call `scoreCandidate(asset, asset.searchKeyword, asset.aiDescription)`. For API results, retain the keyword-to-candidates association before flattening.

### P1 — AI score neutralized by 100-point cap (High)
The original quality components already total 100; AI points (0-30) are appended and clamped. A 95-point candidate can only gain 5 points.

**Fix**: Rebalance non-AI components to total 70, add AI relevance (0-30) on top. Documented maxima must sum to 100.

### P2 — Single keyword vs scene context (Medium)
Matching uses one search keyword rather than a scene's visual brief or narration context. Cannot distinguish a lab demo from a production-line scene.

**Fix**: Pass the relevant scene visual brief/voiceover and compute per-asset, per-scene relevance during assignment.

### P2 — Substring matching false positives (Medium)
`descLower.includes(kwLower)` is substring matching. Keyword `AI` matches `train` and `painting`. Does not split hyphenated words (`Unitree-H1` does not match `Unitree`). Does not handle CJK descriptions.

**Fix**: Normalize punctuation, use token/phrase boundaries for Latin text, use appropriate CJK segmentation.

### P3 — 4K check case-sensitive (Low)
`res.includes("4k")` does not recognize common `4K` metadata.

**Fix**: `String(res).toLowerCase()` before checking.

## Proposed Score Structure

See `docs/reviews/scorecandidate-review.md` for full details:

```js
const titleScore = /* 0-28 */;
const durationScore = /* 0-18 */;
const sizeScore = /* 0-14 */;
const resolutionScore = /* 0-10 */;
const technicalScore = titleScore + durationScore + sizeScore + resolutionScore; // 0-70
const relevanceScore = /* 0-30, based on the scene/query context */;
return technicalScore + relevanceScore;
```

## Scope

- `scripts/short-video/lib/asset-sourcer.mjs` — `scoreCandidate()`, `assignAssetsToScenes()`, API/yt-dlp/CDP candidate processing
- `scripts/short-video/__tests__/asset-sourcer.test.mjs` — add multi-keyword, boundary, hyphen/CJK, near-100 base score regression tests

## Merge Bar

| Requirement | Status |
|---|---|
| Preserve each asset's originating search keyword | Required |
| Re-score against that keyword or, preferably, per-scene context | Required |
| Rebalance the score so AI relevance has its advertised influence | Required |
| Add boundary, hyphen/CJK, and multi-keyword regression tests | Required |
| Normalize resolution casing | Recommended |
| Resolve existing formatter errors in the module | Required for clean lint |

## References

- Review: `docs/reviews/scorecandidate-review.md`
- ADR: `docs/adr/0009-vlm-qwen3-vl-mlx.md` (VLM model selection)

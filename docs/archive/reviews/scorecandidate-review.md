# `scoreCandidate()` Code Review

## Verdict

The existing heuristic is a reasonable **first-pass technical-quality ranking**: it evaluates title matching, duration, file size, and resolution with simple, explainable rules. The new AI-description extension, however, is **not reliable as an asset-relevance ranking signal in the current pipeline**. The two high-priority findings below should be resolved before relying on it for multi-keyword or scene-specific selection.

## Findings

| Priority | Location                                                     | Finding                                                                                                                                                                                                                                                                                                                      | Impact and recommendation                                                                                                                                                                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P1**   | `scripts/short-video/lib/asset-sourcer.mjs:1614, 1751`       | **Re-scoring uses the wrong keyword for many assets.** API candidates are flattened and scored with `keywords[0]`; after AI analysis, every downloaded asset is again scored using `keywords[0]`. The asset record does not retain the keyword that produced it.                                                             | With `--keywords "Unitree, ByteDance"`, a ByteDance asset may be compared to `Unitree` and receive no content credit despite a correct AI description. Preserve `searchKeyword` on every candidate/asset and call `scoreCandidate(asset, asset.searchKeyword, asset.aiDescription)`. For API results, retain the keyword-to-candidates association before flattening. |
| **P1**   | `scripts/short-video/lib/asset-sourcer.mjs:112-114, 203-210` | **The stated 0–30 AI score is mostly neutralized by the 100-point cap.** The original quality components already total 100; AI points are appended and the result is clamped. A 95-point candidate can only gain 5 points, while a 100-point candidate gains none.                                                           | The semantic signal cannot materially re-rank technically strong assets. If AI relevance should contribute up to 30 points, make the non-AI components total 70 and add AI relevance on top. Alternatively, document it as a capped tie-breaker and test that behavior.                                                                                               |
| **P2**   | `scripts/short-video/lib/asset-sourcer.mjs:185-206`          | **The comparison uses one search keyword rather than a scene’s visual or narration context.** It can establish that a description mentions `Unitree`, but cannot distinguish a lab demo from a production-line scene.                                                                                                        | Assignment is global and greedy: assets are sorted by score and assigned to the first available scene. Pass the relevant scene visual brief/voiceover and compute per-asset, per-scene relevance during assignment.                                                                                                                                                   |
| **P2**   | `scripts/short-video/lib/asset-sourcer.mjs:181-201`          | **Matching is brittle and admits false positives.** `descLower.includes(kwLower)` is substring matching. For example, a keyword `AI` matches `train` and `painting`. The split pattern also does not split hyphenated words, so `Unitree-H1` does not match `Unitree`; it does not address whitespace-free CJK descriptions. | Normalize punctuation—including hyphens—and use token/phrase boundaries for Latin text. Use appropriate CJK segmentation or normalize the VLM output language. Apply a full-phrase bonus only when phrase boundaries match.                                                                                                                                           |
| **P3**   | `scripts/short-video/lib/asset-sourcer.mjs:167-173`          | **The 4K check is case-sensitive.** `res.includes("4k")` does not recognize common `4K` metadata.                                                                                                                                                                                                                            | Normalize once with `String(res).toLowerCase()` before checking it. Add regression coverage for `4K`, `2160p`, and unknown resolution text.                                                                                                                                                                                                                           |

## Primary Pipeline Issue

The first-keyword behavior exists at two points. API candidates are fetched per keyword, flattened, and all scored with `keywords[0]`. The yt-dlp/CDP paths use the active keyword before downloading, but the AI pass re-scores every record with `keywords[0]`. As the downloaded asset does not record its source query, its correct keyword is unavailable during the second pass.

The minimal structural correction is to preserve query provenance:

```js
const scored = candidates.map((candidate) => ({
  ...candidate,
  searchKeyword: keyword,
  score: scoreCandidate(candidate, keyword),
}));

// Later, after AI analysis
asset.score = scoreCandidate(asset, asset.searchKeyword, asset.aiDescription);
```

For API sources, preserve the keyword alongside each candidate list rather than flattening the results first.

## Recommended Score Structure

If the intended result is a 0–100 composite in which AI relevance contributes a real 30 points, construct the score explicitly:

```js
const titleScore = /* 0–28 */;
const durationScore = /* 0–18 */;
const sizeScore = /* 0–14 */;
const resolutionScore = /* 0–10 */;
const technicalScore = titleScore + durationScore + sizeScore + resolutionScore; // 0–70
const relevanceScore = /* 0–30, based on the scene/query context */;
return technicalScore + relevanceScore;
```

The exact weights can vary. The essential constraint is that the documented component maxima sum to 100. If title matching must remain at 40, reduce the other technical weights or adopt a normalized weighted average.

## Test Assessment

The focused test run passed: **137 tests across 2 files**. It covers empty/undefined descriptions, no overlap, capping, and a basic matching-description uplift. It does not cover multi-keyword provenance, near-100 base scores with matching AI text, substring boundaries, hyphen/CJK handling, or scene-specific relevance. Add regression tests for each case.

A targeted lint run reports **19 Prettier errors** in `asset-sourcer.mjs` at lines 352–369 and 869. These are outside `scoreCandidate()`, so they do not invalidate the functional findings above, but they should be fixed before considering the module merge-ready.

## Positive Observations

Absent or blank `aiDAbsent or blank `aiDAbsent or blank `aiDAbsent or blank `aiDAbsserves the promised 0–100 range. The implementation also uses a `Set` for description tokens, preventing repeated VLM words from multiplying the token-overlap score. These are sound choices.

## Suggested Merge Bar

| Requirement                                                      | Status                         |
| ---------------------------------------------------------------- | ------------------------------ |
| Preserve each asset’s originating search keyword                 | Required                       |
| Re-score against that keyword or, preferably, per-scene context  | Required                       |
| Rebalance the score so AI relevance has its advertised influence | Required                       |
| Add boundary, hyphen/CJK, and multi-keyword regression tests     | Required                       |
| Normalize resolution casing                                      | Recommended                    |
| Resolve existing formatter errors in the module                  | Required for a clean lint gate |

> **Bottom line:** Keep the baseline heuristic, but revise the AI extension and its provenance flow. In its current form, it is suitable only as a weak, single-keyword tie-breaker—not as a trustworthy semantic selector.

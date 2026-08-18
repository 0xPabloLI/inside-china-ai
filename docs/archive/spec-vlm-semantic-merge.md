# Spec: VLM Semantic Merge — One-Call Asset Analysis with Markdown Output

> **Spec ID**: spec-vlm-semantic-merge
> **Created**: 2026-08-18
> **Status**: ready-for-agent
> **Related Issues**: #44 (scoreCandidate optimization), #33 (filter/classify — related but out of scope)
> **ADRs**: ADR-0009 (VLM), ADR-0015 (Focus Detection)
> **Grill session**: 3 rounds, all decisions settled

## Problem Statement

The VLM (Qwen3-VL-8B via mlx-vlm) is called **twice per landscape asset** in `analyzeAssets()`: once for `describeImage/Video()` (semantic description, 20-30s) and once for `analyzeFit()` (cover/contain decision, 20-30s) — doubling inference time to 40-60s per asset. With 20 assets per pipeline run, VLM analysis alone takes 40+ minutes.

Additionally:

1. **Output format is unreliable**: mlx-vlm does not support guided decoding / structured output / response_format. The VLM is forced to output JSON, but parsing relies on regex fallback (`_parse_fit_output`, `parseFitResponse`) that breaks when the model wraps JSON in markdown code fences or adds explanatory text.

2. **Semantic signal is wasted**: `scoreCandidate()` uses `aiDescription` for keyword token overlap — a crude string-matching approach that misses semantic relevance. The VLM understands "Unitree H1 humanoid robot in kitchen" but the scorer only checks if the word "Unitree" appears in the text.

3. **No pre-filtering**: Every downloaded asset goes through expensive VLM analysis (20-120s each), even when basic quality signals (small file, low resolution, title mismatch) would clearly mark it as unusable.

4. **No structured artifact**: VLM results are scattered across `asset.aiDescription`, `asset.aiFit`, `asset.aiFitReason`, `asset.focusAnalysis` — no single structured file for pipeline stages to consume.

## Solution

Replace the two-call VLM pattern with a **single `analyzeAssetSemantics` call** that:

1. Outputs **Markdown** (not JSON) — the VLM generates natural language structured with `## Section` headers, which is the format language models produce most reliably
2. Python parses Markdown to dict via code (`parse_markdown_to_dict`) — no LLM needed for conversion, no regex JSON extraction
3. Outputs **6 fields in one pass**: description, subjects, contentKind, fit, criticalEdgeText, reason
4. Runs **after lightweight pre-filtering** — rebalanced `scoreCandidate` (non-AI part, 0-70) filters out obviously bad assets before VLM
5. Produces a **structured artifact** (`asset-analysis.json`) — all pipeline stages read from this file, no repeated VLM calls

### Architecture

```
asset-sourcer.mjs (orchestrator)
  │
  ├─ Phase 1: Focus detection (OpenCV) — unchanged
  │    └─ closeFocusDetector()
  │
  ├─ Phase 2a: Pre-filter — rebalanced scoreCandidate non-AI (0-70)
  │    └─ assets with score < 30 → skip VLM, mark lowConfidence
  │
  ├─ Phase 2b: VLM deep analysis — one call per surviving asset
  │    └─ analyzeAssetSemantics(path) → Markdown → dict → asset-analysis.json
  │
  └─ Phase 2c: Semantic scoring — VLM subjects + description → per-scene relevance
```

### VLM Output Format (Markdown)

Image prompt produces:
```markdown
## Description
A humanoid robot demonstrating household tasks in a kitchen setting.

## Subjects
robot, kitchen, product

## Content Kind
product_demo

## Fit
contain

## Critical Edge Text
yes — bottom edge has product label text

## Reason
Bottom edge has product label text that would be cropped in vertical format.
```

Video prompt produces (no Fit/Critical Edge Text sections):
```markdown
## Description
A humanoid robot walking through a factory floor, demonstrating mobility.

## Subjects
robot, factory, mobility

## Content Kind
talking_head
```

### Python Markdown Parser

`parse_markdown_to_dict(raw_text)` logic:
1. Strip markdown code fences (```` ```markdown ... ``` ````) if present
2. Split by `## ` to get sections
3. Key = first line of section → lowercase + snake_case
4. Value = rest of section → trim
5. `subjects` → split by comma → list of trimmed strings
6. `contentKind`, `fit` → enum validation (case-insensitive)
7. Unrecognized sections → kept as raw key-value pairs (no error)
8. If no `## ` found at all → entire text becomes `description`, other fields = null

Degradation: any field that fails parsing → null. `description` is always present (from raw text if nothing else works).

## User Stories

1. As a pipeline operator, I want VLM to analyze each asset in a single call, so that inference time is halved for landscape assets (40-60s → 20-30s).

2. As a pipeline operator, I want VLM to output Markdown instead of JSON, so that format stability is higher (language models naturally produce structured text, not strict JSON).

3. As a pipeline operator, I want a Python code parser for Markdown, so that no LLM is needed for format conversion (pure string parsing, deterministic and free).

4. As a pipeline operator, I want pre-filtering before VLM analysis, so that obviously bad assets (small files, low resolution, title mismatch) don't waste 20-120s of VLM inference time.

5. As a pipeline operator, I want VLM to output `subjects` (key subject terms), so that semantic matching replaces crude keyword token overlap in `scoreCandidate`.

6. As a pipeline operator, I want VLM to output `contentKind` (content type classification), so that `recommendScene` can match assets to scene types (e.g., product_demo → narrative, talking_head → quote).

7. As a pipeline operator, I want VLM to output `criticalEdgeText`, so that layout decisions know whether edges contain crop-sensitive content.

8. As a pipeline operator, I want a structured `asset-analysis.json` artifact, so that all pipeline stages (scoring, scene matching, rendering, verification) read from a single source of truth.

9. As a pipeline operator, I want the old `describeImage`, `describeVideo`, `analyzeFit`, and `parseFitResponse` APIs deleted, so that the codebase has one clean VLM interface.

10. As a pipeline operator, I want video assets to skip fit analysis, so that VLM doesn't waste tokens generating irrelevant fields for videos (video fit is a P4+ concern involving temporal windows).

11. As a developer, I want `scoreCandidate` rebalanced so non-AI components total 70 and AI relevance totals 30, so that the AI signal actually has influence (Issue #44 fix).

12. As a developer, I want `searchKeyword` preserved on every candidate (Issue #44 P1 fix), so that re-scoring uses the correct originating keyword.

13. As a developer, I want boundary matching in `scoreCandidate` (Issue #44 P2 fix), so that keyword `AI` doesn't match `train` or `painting`.

14. As a developer, I want a 5-test validation plan, so that the new VLM approach is empirically verified before merging (format stability, parser robustness, pre-filter accuracy, latency, semantic scoring).

15. As a developer, I want video prompt to differ from image prompt (no Fit/Critical Edge Text sections), so that VLM doesn't waste inference tokens on irrelevant fields.

## Implementation Decisions

### 1. New VLM Action: `analyze_semantics`

**Python side** (`vlm_analyzer.py`):
- New `SEMANTICS_PROMPT_IMAGE` and `SEMANTICS_PROMPT_VIDEO` constants (Markdown-section format with few-shot examples)
- New `handle_analyze_semantics(model, processor, path)` handler — dispatches to image or video prompt based on file extension
- New `parse_markdown_to_dict(raw_text)` function — pure string parsing, no LLM
- Delete: `PROMPT`, `FIT_PROMPT`, `handle_describe_image`, `handle_describe_video`, `handle_analyze_fit`, `_parse_fit_output`
- Main loop: `analyze_semantics` replaces `describe_image`, `describe_video`, `analyze_fit`

**Node side** (`visual-analyzer.mjs`):
- New `analyzeAssetSemantics(assetPath)` → `Promise<AssetSemantics>` 
- Delete: `describeImage`, `describeVideo`, `analyzeFit`, `parseFitResponse`, `VALID_FITS`, `VALID_FOCUSES`
- `requestQueue` entry: `action: "analyze_semantics"` (no `isFit` flag)
- `handleResponse`: `JSON.parse(line)` → if `response.error` → resolve with degraded result; else → resolve with response object (minus `error` field)
- Degraded result: `{description: "", subjects: [], contentKind: null, fit: null, criticalEdgeText: null, reason: ""}`

### 2. VLM Output Fields

| Field | Type | Image | Video | Consumers |
|-------|------|-------|-------|-----------|
| `description` | string | ✅ | ✅ | scoreCandidate, human review |
| `subjects` | string[] | ✅ | ✅ | scoreCandidate (semantic match) |
| `contentKind` | enum | ✅ | ✅ | recommendScene |
| `fit` | "cover" \| "contain" | ✅ | ❌ | assignAssetsToScenes (media.fit) |
| `criticalEdgeText` | string \| null | ✅ | ❌ | assignAssetsToScenes, layout |
| `reason` | string | ✅ | ❌ | human review |

`contentKind` enum values: `product_demo`, `talking_head`, `landscape`, `chart`, `text_screenshot`, `other`

### 3. Pre-filter: Rebalanced scoreCandidate

**Issue #44 fix** — rebalance non-AI components to 70, AI relevance to 30:

```js
const titleScore = /* 0-28 */;
const durationScore = /* 0-18 */;
const sizeScore = /* 0-14 */;
const resolutionScore = /* 0-10 */;
const technicalScore = titleScore + durationScore + sizeScore + resolutionScore; // 0-70
const relevanceScore = /* 0-30, based on VLM subjects + description */;
return technicalScore + relevanceScore;
```

Pre-filter gate: `technicalScore < 30` → skip VLM, mark `lowConfidence: true`. Soft gate — if VLM is available, `lowConfidence` assets can still be analyzed (VLM may rescue good content with poor metadata).

**Issue #44 P1**: Preserve `searchKeyword` on every candidate. `scoreCandidate(asset, asset.searchKeyword, ...)`.

**Issue #44 P2**: Boundary matching — normalize punctuation (including hyphens), use token/phrase boundaries for Latin text, full-phrase bonus only on boundary match.

### 4. Asset Analysis Artifact

`output/{pipelineId}/asset-analysis.json`:
```json
{
  "version": 1,
  "analyzedAt": "ISO-8601",
  "model": "mlx-community/Qwen3-VL-8B-Instruct-8bit",
  "assets": [
    {
      "path": "/abs/path/to/asset.jpg",
      "type": "image",
      "searchKeyword": "Unitree",
      "technicalScore": 55,
      "lowConfidence": false,
      "description": "...",
      "subjects": ["robot", "kitchen", "product"],
      "contentKind": "product_demo",
      "fit": "contain",
      "criticalEdgeText": "yes — bottom edge has product label text",
      "reason": "...",
      "focusAnalysis": { "status": "ok", "protectedRegions": [...], "saliency": {...} }
    }
  ]
}
```

### 5. Phase 2c: Semantic Scoring

After VLM analysis, re-score assets using VLM output:
- `relevanceScore` = subjects match (0-20) + description match (0-10)
- Subjects match: for each scene's keywords, check if keyword appears in `subjects` list (exact, not substring)
- Description match: keyword appears in `description` with boundary matching
- `totalScore = technicalScore + relevanceScore` (capped at 100)

### 6. Deleted APIs (Q6 = option C)

All deleted with their tests rewritten:
- `describeImage(path)` → replaced by `analyzeAssetSemantics(path)`
- `describeVideo(path)` → replaced by `analyzeAssetSemantics(path)`
- `analyzeFit(path)` → replaced by `analyzeAssetSemantics(path)`
- `parseFitResponse(text)` → replaced by `parse_markdown_to_dict` in Python
- `PROMPT`, `FIT_PROMPT` → replaced by `SEMANTICS_PROMPT_IMAGE`, `SEMANTICS_PROMPT_VIDEO`

## Testing Decisions

### Test Seams (5 total)

1. **Mock IPC seam** (`visual-analyzer.test.mjs`) — test `analyzeAssetSemantics` queue management, IPC protocol, degradation. Same mock pattern as existing `describeImage` tests. ~20 tests.

2. **Integration seam** (`asset-sourcer-visual-integration.test.mjs`) — mock `visual-analyzer.mjs`, test `analyzeAssets()` orchestration: pre-filter → single VLM call → semantic scoring. ~8 tests.

3. **Pure function seam** (`asset-sourcer.test.mjs`) — test rebalanced `scoreCandidate` with keyword provenance, boundary matching, hyphen/CJK handling. ~15 tests.

4. **Python parser seam** (new `test_parse_markdown.py`) — test `parse_markdown_to_dict` with 10 boundary cases. Pure Python, runs standalone.

5. **End-to-end validation** (`experiments/vlm-p3-validation/`) — not a formal test, but a validation script that calls real VLM. Gitignored.

### Validation Plan (Test 5 / experiments)

| Test | What | Input | Pass Criteria |
|------|------|-------|---------------|
| VLM Markdown stability | Format correctness rate | 5 images × 3 runs (temp 0.0) | ≥80% correct `## Section` format |
| Python parser robustness | 10 boundary cases | Hand-crafted inputs | 10/10 no crash, ≥8/10 key fields present |
| Pre-filter accuracy | False reject / false accept | 20 simulated candidates | 0 false rejects, ≤20% false accepts |
| End-to-end latency | Single vs double call | 3 images through full pipeline | Single ≤ 60% of double-call time |
| Semantic scoring (optional) | New vs old ranking | 10 assets + 3 scene contexts | New top-3 ≥ old top-3 |

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `vlm_analyzer.py` | Delete 3 handlers + 2 prompts + 1 parser; add 2 prompts + 1 handler + 1 parser | **High** | Core VLM subprocess. All 3 existing actions deleted. Tests rewritten. Worst case: VLM subprocess crashes on startup → graceful degradation returns empty results (same as current). |
| `visual-analyzer.mjs` | Delete 4 exports + 2 constants; add 1 export; rewrite `handleResponse` + `requestQueue` | **High** | Node gateway. IPC protocol changes (new action name, new response shape). All consumers go through `asset-sourcer.mjs`. Worst case: IPC mismatch → timeout → empty result degradation. |
| `asset-sourcer.mjs` | Rewrite `analyzeAssets()`; rebalance `scoreCandidate`; add pre-filter gate; add `asset-analysis.json` output | **Medium** | Orchestration logic changes. `scoreCandidate` is a pure function with 137 tests — rebalancing weights changes expected values but not structure. `assignAssetsToScenes` unchanged. |
| `review-media-patch.mjs` | Update to consume `asset-analysis.json` instead of scattered fields | **Low** | Presentation-only. Reads fields, formats for human. |
| `remotion/src/types.ts` | Add optional `contentKind` + `subjects` to `MediaField` | **Low** | Pure additive. Existing fields unchanged. |
| `visual-analyzer.test.mjs` | Delete ~20 tests; add ~20 new tests | **Medium** | Test rewrite. Risk: missing a scenario. Mitigated by scenario matrix below. |
| `asset-sourcer-visual-integration.test.mjs` | Update mock + assertions | **Medium** | Mock interface changes. 4 existing tests rewritten. |
| `asset-sourcer.test.mjs` | Update `scoreCandidate` expected values + add boundary tests | **Medium** | Score values change due to rebalancing. All expected values recalculated. |
| `README.md` | Update action table | **Low** | Documentation only. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | VLM outputs perfect Markdown with all 6 sections | `parse_markdown_to_dict` returns dict with all fields populated | Low | Standard path, most common |
| 2 | VLM wraps Markdown in ```` ```markdown ``` ```` fence | Parser strips fence, parses normally | Low | Strip code fence before parsing |
| 3 | VLM adds extra sections (e.g., `## Mood`) | Extra sections kept as raw key-value, no error | Low | Unknown keys preserved, not dropped |
| 4 | VLM outputs free text with no `## ` headers | Entire text becomes `description`, all other fields = null | Medium | Description always present, fit/contentKind null → scoreCandidate falls back to keyword match |
| 5 | VLM outputs partial sections (e.g., Description + Subjects only, no Fit) | Present fields parsed, missing fields = null | Low | Per-field independence — each section parsed independently |
| 6 | VLM outputs `subjects` as newline-separated instead of comma | Parser tries comma split → if only 1 element, try newline split | Medium | Parser handles both separators |
| 7 | VLM outputs `contentKind` with non-standard value (e.g., "demo") | `contentKind` = raw string (not enum-validated), `recommendScene` treats unknown as "other" | Low | Enum validation is case-insensitive, unknown values kept as-is |
| 8 | VLM outputs `fit` with non-standard value (e.g., "fill") | `fit` = null (invalid enum), asset uses default fit from `assignAssetsToScenes` | Medium | Enum validation rejects unknown; consumer has fallback |
| 9 | VLM unavailable (Python not found / model load fails) | `analyzeAssetSemantics` resolves with degraded result (all fields null/empty) | Medium | Same graceful degradation as current. `scoreCandidate` uses keyword match only. |
| 10 | VLM subprocess crashes mid-request | `handleResponse` timeout fires (180s), resolves with degraded result | Low | Existing timeout mechanism unchanged |
| 11 | Asset has no `searchKeyword` (orphan from old pipeline) | `scoreCandidate` falls back to `keywords[0]` | Low | Backward compat: `asset.searchKeyword ?? keywords[0]` |
| 12 | Pre-filter marks good asset as `lowConfidence` (false reject) | Asset still analyzed by VLM (soft gate, not hard cut) | Low | Soft gate — VLM can rescue good content with poor metadata |
| 13 | Pre-filter lets bad asset through (false accept) | VLM analyzes it, `scoreCandidate` gives low `relevanceScore`, asset not assigned to scenes | Low | VLM + scoring is the real filter; pre-filter is just cost optimization |
| 14 | Video asset analyzed (no fit/criticalEdgeText in output) | `assignAssetsToScenes` skips `media.fit` for video assets | Low | `if (semantics.fit && asset.type !== 'video')` guard |
| 15 | `asset-analysis.json` already exists (re-run pipeline) | Overwrite with new analysis (no caching in P3) | Low | P7 (caching) is separate. P3 always re-analyzes. |
| 16 | Empty assets array passed to `analyzeAssets()` | Returns empty array, writes empty `asset-analysis.json` | Low | Guard: `if (assets.length === 0) return []` |
| 17 | Asset file not found / corrupt | VLM returns error, `analyzeAssetSemantics` resolves with degraded result, asset skipped in assignment | Low | Existing file-existence check in Python handler |
| 18 | VLM returns `description` but all other fields null | `scoreCandidate` uses description for token overlap (backward compat), `recommendScene` uses default visualType matching | Medium | Description-only path = current behavior (graceful) |
| 19 | Multiple assets with same path | Each gets separate VLM call (no dedup in P3) | Low | P7 (caching) will dedup by asset hash |
| 20 | `scoreCandidate` called with `aiDescription` from VLM + `subjects` from VLM | Relevance score uses both: subjects exact match (0-20) + description boundary match (0-10) | Medium | New scoring logic — tested in pure function seam |

## Out of Scope

1. **Issue #33** (filterChinaAI + classifyTopic → LLM) — related concept but different pipeline stage (trend discovery vs asset sourcing). Separate ticket.

2. **P4: Video temporal windowing** (`analyzeVideoWindow`) — video fit analysis needs temporal dimension (which seconds to show). P3 only does per-frame description for videos.

3. **P5: Local ASR worker** — reusing whisperx for video audio transcription. Separate infrastructure.

4. **P6: Deterministic timeline fusion** — fusing VLM visual windows with ASR segments. Depends on P4 + P5.

5. **P7: Content-addressed caching** — `SHA-256(asset + profile + model + promptVersion)` caching. P3 always re-analyzes.

6. **P8: Focus Phase 2** — video multi-frame, slot scoring, Remotion integration. Depends on P4.

7. **Pipeline order change** — moving asset-sourcer before scene-data generation. Current order (script-driven asset search) is correct for content creation flow.

8. **OCR / onScreenText fields** — VLM is not good at precise text localization. These belong to P8 layout layer.

9. **Golden fixture images** (P1-1 from previous session) — needs real human-annotated face images. Data collection task, not code.

## Further Notes

### JSON vs Markdown Rationale

mlx-vlm (0.6.13) does **not** support guided decoding / structured output / response_format. The `generate()` function accepts only `temperature`, `max_tokens`, `repetition_penalty` via kwargs — no schema constraint.

Forcing JSON output via prompt alone is unreliable: the model wraps JSON in markdown code fences, adds explanatory text, or produces syntax errors. The current codebase has regex fallback chains (`_parse_fit_output`, `parseFitResponse`) as a workaround.

Markdown output is more natural for language models:
- `## Section` headers are a common pattern in training data
- Each section is independently parseable (one missing section doesn't break others)
- No syntax-critical characters (quotes, commas, brackets) that can break parsing
- Human-readable in `asset-analysis.json` and review outputs

The Python parser (`parse_markdown_to_dict`) is pure string manipulation — no LLM, no regex JSON extraction, no Pydantic dependency. It runs in <1ms per asset.

### Issue #44 Integration

P3 directly fixes all 5 findings from `docs/reviews/scorecandidate-review.md`:
- P1 (wrong keyword): preserve `searchKeyword` on every candidate
- P1 (score cap): rebalance to 70+30
- P2 (single keyword): use VLM `subjects` for per-scene semantic matching
- P2 (substring matching): boundary matching with punctuation normalization
- P3 (4K case): `String(res).toLowerCase()` before checking

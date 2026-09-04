# Golden Asset Evaluation for VLM Quality

> **Status**: Active · **Created**: 2026-08-18 · **ADR**: [0009](../adr/0009-vlm-qwen3-vl-mlx.md), [0015](../adr/0015-opencv-focus-detection.md)
>
> **Scope**: Defines the golden asset set, human expectations, model/prompt versions, and testing strategy for the VLM analysis layer (`visual-analyzer.mjs` + `vlm_analyzer.py` + `focus_detector.py`).

## 1. Purpose

The VLM layer (Qwen3-VL-8B + OpenCV focus detection) provides three capabilities critical to the video pipeline:

1. **describeImage/describeVideo** — 1-2 sentence asset description for matching to scene narration
2. **analyzeFit** — `{fit, focus, reason}` for placing landscape assets in 9:16 canvas
3. **detectFocus** — OpenCV-based main subject position detection

Quality drift in any of these capabilities causes silent regression: assets get mis-assigned, cropping loses critical content, or focus positioning degrades. A golden asset set with human-verified expectations provides a repeatable evaluation baseline.

## 2. Golden Asset Set

### Design Principles

Each asset targets a specific edge case that the VLM must handle correctly:

| Category         | What it tests                                                 | Why it matters                                  |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| Edge text        | `contain` (not `cover`) — text at borders must not be cropped | Cropping Chinese text renders it unreadable     |
| Top subject      | `focus: top` — subject in upper third                         | Focus positioning affects crop alignment        |
| Center subject   | `focus: center` — subject in middle                           | Default case, most common                       |
| Bottom subject   | `focus: bottom` — subject in lower third                      | Crop must preserve bottom content               |
| No visible brand | Description must not hallucinate brand names                  | 8B model has known hallucination tendency       |
| Short video      | Video description + fit analysis                              | Native video path vs. frame extraction fallback |
| Mixed content    | Image with both tech product and human                        | Description must capture both subjects          |

### Asset Inventory

> **Note**: Assets are stored in `scripts/short-video/assets/golden/` (gitignored — too large for git, tracked via LFS if committed).

| ID    | File                           | Type  | Dimensions    | Key Feature                                      | Expected `fit` | Expected `focus` | Expected Description Keywords                         |
| ----- | ------------------------------ | ----- | ------------- | ------------------------------------------------ | -------------- | ---------------- | ----------------------------------------------------- |
| GA-01 | `golden-chart-with-labels.png` | image | 1920×1080     | Financial chart with axis labels at all edges    | `contain`      | `center`         | "chart", "data", "graph"                              |
| GA-02 | `golden-robot-top.png`         | image | 1920×1080     | Robot in upper third, plain background at bottom | `cover`        | `top`            | "robot", "machine", "technology"                      |
| GA-03 | `golden-cityscape-center.png`  | image | 1920×1080     | City skyline centered, sky above, road below     | `cover`        | `center`         | "city", "building", "skyline"                         |
| GA-04 | `golden-product-bottom.png`    | image | 1920×1080     | Product on table in lower third, shelf above     | `cover`        | `bottom`         | "product", "device", "table"                          |
| GA-05 | `golden-no-brand-photo.png`    | image | 1920×1080     | Generic office scene, no logos or brand marks    | any            | any              | Must NOT contain brand names (DeepSeek, Huawei, etc.) |
| GA-06 | `golden-tech-demo-clip.mp4`    | video | 1920×1080, 5s | Short tech demo with person + screen             | `cover`        | `center`         | "person", "screen", "demo"                            |
| GA-07 | `golden-text-overlay.png`      | image | 1920×1080     | Image with large Chinese text overlay at bottom  | `contain`      | `top`            | "text", "Chinese characters"                          |

### Asset Acquisition

- **GA-01 through GA-07**: Manually curated from existing video project assets (`scripts/short-video/content/*/assets/`) or created synthetically (PIL/matplotlib for charts).
- **Storage**: `scripts/short-video/assets/golden/` — directory added to `.gitignore`, assets managed via LFS.
- **Sizing**: All images are 1920×1080 (standard landscape). Video is 5s at 30fps (short enough for fast evaluation).

## 3. Human Expectations

Each golden asset has a human-verified expectation file in `golden-expectations.json`:

```json
{
  "GA-01": {
    "file": "golden-chart-with-labels.png",
    "type": "image",
    "expectedFit": "contain",
    "expectedFocus": "center",
    "expectedDescriptionKeywords": ["chart", "data", "graph"],
    "forbiddenDescriptionKeywords": ["DeepSeek", "Huawei", "Baidu"],
    "notes": "Axis labels at all four edges — must use contain to preserve text"
  },
  "GA-02": {
    "file": "golden-robot-top.png",
    "type": "image",
    "expectedFit": "cover",
    "expectedFocus": "top",
    "expectedDescriptionKeywords": ["robot", "machine"],
    "forbiddenDescriptionKeywords": [],
    "notes": "Subject in upper third — focus must be top for correct crop alignment"
  }
}
```

> Full file: `scripts/short-video/assets/golden/golden-expectations.json`

## 4. Model & Prompt Versions

### Model Versions (Pinned)

| Component      | Model                                     | Version        | Size   | Source      |
| -------------- | ----------------------------------------- | -------------- | ------ | ----------- |
| VLM (primary)  | `mlx-community/Qwen3-VL-8B-Instruct-8bit` | mlx-vlm 0.6.13 | 9.2 GB | HuggingFace |
| VLM (fallback) | `mlx-community/Qwen3-VL-8B-Instruct-4bit` | —              | 4.8 GB | HuggingFace |
| Focus detector | OpenCV Haar Cascade + Spectral Residual   | OpenCV 4.x     | —      | pip         |

### Prompt Versions

| Prompt                    | Version | Text                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Last Reviewed |
| ------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `PROMPT` (describe)       | v1      | `"Describe what is happening in this video/image in 1-2 sentences. Focus on the main subject, setting, and any visible technology, products, or brands."`                                                                                                                                                                                                                                                                                                                                                | 2026-08-17    |
| `FIT_PROMPT` (analyzeFit) | v1      | `"This image/video will be placed in a 9:16 vertical video canvas. Look at where the main subject is and whether the edges contain critical content (text, UI, charts). Respond as JSON: {\"fit\": \"cover\" or \"contain\", \"focus\": \"top\" or \"center\" or \"bottom\", \"reason\": \"one sentence\"}. Use \"cover\" if edge content is non-critical and we can crop. Use \"contain\" if edges have text/UI that must not be cropped. Use focus to indicate where the main subject is positioned."` | 2026-08-17    |

### Prompt Change Protocol

When prompts change:

1. Update the version number (v1 → v2)
2. Re-run golden asset evaluation against the new prompt
3. Update `golden-expectations.json` if expectations shift
4. Record the change in the "Evaluation History" section below

## 5. Testing Strategy

### Layer 1: Mock Unit Tests (CI-fast, always run)

**Location**: `scripts/short-video/__tests__/visual-analyzer.test.mjs`

These tests mock `child_process.spawn` to verify:

- Request/response JSON IPC format
- Subprocess lifecycle (spawn / reuse / respawn / close)
- Serial request queuing
- Graceful degradation when VLM unavailable
- `parseFitResponse()` — JSON extraction from raw text (plain JSON, markdown-wrapped, partial)

**Coverage**: 14 tests, all passing. These protect the **protocol and parsing layer**, not model quality.

### Layer 2: Golden Asset Evaluation (periodic, not in CI)

**Script**: `scripts/short-video/lib/golden-eval.mjs` (to be implemented)

**Flow**:

1. Load `golden-expectations.json`
2. For each golden asset:
   a. Call `describeImage()` or `describeVideo()` → compare keywords
   b. Call `analyzeFit()` → compare `fit` and `focus` against expectations
   c. Call `detectFocus()` → compare focus region
3. Calculate pass rate per capability:
   - Description: keyword match ≥ 80%
   - Fit: exact match ≥ 85%
   - Focus: exact match ≥ 75%
4. Output JSON report + human-readable summary

**Pass Criteria**:

- Description keywords: at least 1 expected keyword present, 0 forbidden keywords
- Fit: exact match (`contain` vs `cover`)
- Focus: exact match (`top` vs `center` vs `bottom`)

**Run Frequency**:

- After model upgrade (e.g., Qwen3-VL-8B → Qwen3-VL-14B)
- After prompt change
- Monthly regression check
- Before video pipeline batch run (optional, if quality drift suspected)

**Why not in CI**: The 9.2 GB model + 100s+ per video analysis makes this impractical for CI. Mock tests (Layer 1) protect protocol/parsing; golden eval (Layer 2) protects quality.

### Layer 3: Production Monitoring (runtime, passive)

During actual pipeline runs, `asset-sourcer.mjs` logs VLM analysis results. These are reviewed manually when:

- Asset assignment quality drops (human notices wrong assets in video)
- New asset types are introduced (different resolution, aspect ratio, content type)

## 6. Evaluation History

| Date       | Evaluator     | Model            | Prompt v | Assets Tested                              | Description Pass Rate | Fit Pass Rate | Focus Pass Rate | Notes                                                                                       |
| ---------- | ------------- | ---------------- | -------- | ------------------------------------------ | --------------------- | ------------- | --------------- | ------------------------------------------------------------------------------------------- |
| 2026-08-17 | Agent (smoke) | Qwen3-VL-8B-8bit | v1       | 2 (shanghai-skyline.jpg, unitree-demo.mp4) | 100%                  | N/A           | N/A             | Smoke test only — describeImage + describeVideo verified. Fit/focus not tested in this run. |
| _pending_  | —             | —                | —        | GA-01~07                                   | —                     | —             | —               | First full golden eval pending golden asset creation                                        |

## 7. Implementation Status

| Component                   | Status      | Notes                                                                     |
| --------------------------- | ----------- | ------------------------------------------------------------------------- |
| Golden asset set (GA-01~07) | **Pending** | Assets need to be curated/created in `scripts/short-video/assets/golden/` |
| `golden-expectations.json`  | **Pending** | Schema defined (§3), file not yet created                                 |
| `golden-eval.mjs` script    | **Pending** | Eval logic defined (§5), script not yet implemented                       |
| Mock unit tests             | **Done**    | 14 tests in `visual-analyzer.test.mjs`                                    |
| Model/prompt versioning     | **Done**    | Documented in §4                                                          |
| First full golden eval      | **Pending** | Blocked by asset creation                                                 |

## Design Decisions & References

- **Why 7 assets, not 20**: Each asset tests one specific edge case. More assets = slower evaluation with diminishing returns. 7 covers the critical edge cases (edge text, 3 focus positions, brand hallucination, video, text overlay).
- **Why 80%/85%/75% thresholds**: Description is fuzzy (keyword match), so lower bar. Fit is binary (cover/contain), so higher bar. Focus has 3 values, so medium bar.
- **Why not auto-generate expectations**: Human judgment is needed to determine "correct" fit/focus — it depends on semantic understanding of what's "critical content" vs "background".
- **Reference**: ADR-0009 (VLM choice), ADR-0015 (focus detection), `visual-analyzer.mjs` source, `vlm_analyzer.py` source.

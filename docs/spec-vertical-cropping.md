# Spec: Vertical Image Cropping Pipeline — Crop Decision Contract

> Created: 2026-08-26
> Based on: Grill session (Round 1 + Round 2) + handoff review
> Supersedes: `docs/spec-vlm-fit-focus.md` (archived to `docs/archive/`)
> Status: Ready for implementation

## Problem Statement

When landscape (16:9) images are rendered in a 9:16 (1080×1920) vertical video using
`object-fit: cover`, ~68.4% of source width is excluded (34.2% from each side for a
centered crop). The current pipeline has **no analysis of the cropped result** — the
VLM only sees the original image, and focus detection data (saliency centroid,
protected face regions) is not used to set `object-position` in the rendering. This
causes main subjects near image edges to be lost (e.g., "Alibaba" text partially
cropped in S4/S5 of the Alibaba video).

## Solution

Add a **crop-decision contract** to the asset analysis pipeline that:

1. **Simulates 9:16 cover crop** from candidate positions (center + saliency-anchored +
   protected-region-anchored) and evaluates whether each candidate preserves protected
   regions (deterministic geometry — no VLM needed for face-protected images).
2. **Selects the best safe crop** and emits a normalized `cropFocus: { x, y }` field for
   the renderer, replacing the deprecated `focus: top|center|bottom` enum.
3. **Falls back to `contain`** (current bare letterbox with `#0a0a14` background) when
   no safe cover crop exists. **Framed contain composition** (brand matte / palette
   gradient / blur last-resort) is **deferred** to a future spec.
4. Routes all recommendations through the **review-first** artifact flow
   (`asset-analysis.json` + `media-patch.json`) — no direct `scene-data` mutation.

## User Stories

1. As a video pipeline operator, I want landscape images to be intelligently cropped so
   that the main subject remains visible in the 9:16 frame.
2. As a video pipeline operator, I want the VLM to see the 9:16-cropped version of a
   landscape image (not just the original) so that its `fit` recommendation reflects what
   viewers will actually see.
3. As a pipeline developer, I want focus detection's saliency centroid and protected
   face regions to drive `object-position` deterministically, so that VLM inference is
   not wasted on cases where geometry can answer.
4. As a pipeline developer, I want a pure `resolveObjectPosition` function that converts
   normalized source-space focus coordinates into CSS `object-position` percentages, with
   clamp and boundary handling, so that the transform is testable independently of model
   inference.
5. As a scene-data author, I want `cropFocus: { x, y }` to be an optional field with a
   safe default (`center`), so existing scene-data files keep working without changes.
6. As a scene-data author, I want the deprecated `focus: top|center|bottom` to remain
   functional as a fallback, so that existing scene-data with `focus` values still
   renders correctly.
7. As a pipeline operator, I want the crop decision (status, policy, selected focus,
   reason) to appear in `asset-analysis.json` and the human-review output, so I can
   verify or override the recommendation before it reaches `scene-data.mjs`.
8. As a pipeline developer, I want `apply-media-patch.mjs` to serialize `cropFocus` into
   scene-data code blocks when present, so the renderer receives the positioning data.
9. As a pipeline developer, I want `validateMedia` to validate `cropFocus` numeric bounds
   `[0, 1]` and warn on out-of-range values, so misconfigurations are caught early.
10. As a pipeline developer, I want EXIF-rotated images to be normalized once before
    crop simulation, focus detection, and VLM analysis, so that all three operate in
    the same coordinate system.
11. As a pipeline developer, I want VLM unavailability or focus detector unavailability
    to degrade gracefully to `cover + center` with an `indeterminate` status in the
    review artifact, so the pipeline never blocks on analysis downtime.
12. As a pipeline developer, I want the VLM's existing `analyze_semantics` call to also
    receive the cropped image (when the image is landscape) so it can judge whether
    the cropped version loses important content — but only when deterministic geometry
    cannot decide (no protected regions).
13. As a pipeline operator, I want video assets to remain unchanged — crop simulation is
    not applied to videos — but `cropFocus` is still a valid field that the renderer
    consumes if I set it manually.
14. As a scene-data author, I want the old spec (`spec-vlm-fit-focus.md`) to be
    superseded and archived, so there is one authoritative implementation contract.

## Implementation Decisions

### 1. New module: `lib/crop-decision.mjs`

A pure-function module (no side effects, no I/O) containing:

- **`resolveObjectPosition({ sourceAspect, targetAspect, normalizedFocus })`** — Converts
  a normalized source-space focus `[x, y]` into a clamped CSS `object-position` string
  `"${xPct}% ${yPct}%"`. Uses the formula: when `r = sourceAspect / targetAspect > 1`,
  `p = clamp((0.5 - f × r + 0.5) / (1 - r), 0, 1)` for the horizontal axis. Vertical
  axis applies only when source is taller than target. Returns `"center"` when source
  and target have the same aspect ratio.

- **`evaluateCropSafety({ protectedRegions, cropRect })`** — Deterministic test: does
  the candidate crop rectangle (normalized `[x, y, w, h]`) fully contain all protected
  regions? Returns `{ safe: boolean, violatedRegions: Region[] }`.

- **`selectBestCrop({ sourceAspect, targetAspect, protectedRegions, saliency, frame })`**
  — Orchestrates candidate generation and evaluation. Generates candidates:
  (a) center crop, (b) saliency-anchored crop, (c) one crop per protected region anchor.
  Evaluates each with `evaluateCropSafety`. Selects the first safe candidate in priority
  order (protected-region anchors first, then saliency, then center). Returns a
  `CropDecision` object:
  ```
  { status: "safe" | "unsafe" | "indeterminate",
    policy: "cover" | "contain",
    cropFocus: { x: number, y: number } | null,
    reason: string,
    candidates: [{ anchor, cropRect, safe, violatedRegions }] }
  ```

### 2. Crop simulation in `vlm_analyzer.py`

- New function `simulate_crop(img_path, target_ratio=9/16, focus=[0.5, 0.5])` — Crops
  the image to `target_ratio` from the given focus point (normalized). Applies
  `ImageOps.exif_transpose().convert("RGB")` before cropping (matching
  `focus_detector.py`'s normalization). Returns `(cropped_path, cleanup_path)` where
  `cropped_path` is a temp JPEG file and `cleanup_path` is the path to delete afterward
  (or `None` if no crop was needed).

- **EXIF fix**: The existing `resize_image_if_needed()` function currently opens the
  image without `exif_transpose`. This is fixed: `resize_image_if_needed` now calls
  `ImageOps.exif_transpose()` before dimension check. This ensures VLM analysis and
  focus detection use the same orientation.

- **Crop simulation action**: The existing `analyze_semantics` handler is extended: when
  the image is landscape (aspect > 1.2), it first simulates a 9:16 center crop, then
  sends the **cropped** image to the VLM instead of the original. This means the VLM's
  `fit` recommendation and `criticalEdgeText` assessment reflect the actual cropped
  view. The crop temp file is cleaned up in a `finally` block.

- **No new VLM action**: Rather than adding a separate `analyze_crop` action, the crop
  simulation is integrated into `analyze_semantics` — the VLM sees the cropped image and
  its existing prompt (which already asks about fit and critical edge text) naturally
  answers the question. This avoids a second VLM call per asset.

### 3. Pipeline integration in `asset-sourcer.mjs` → `analyzeAssets()`

After Phase 2 (focus detection) and Phase 3a (VLM semantic analysis), add **Phase 3b:
Crop Decision**:

- For each image asset that is landscape (determined from `focusAnalysis.frame.width /
  height`):
  1. Call `selectBestCrop()` with `protectedRegions`, `saliency`, `frame`, and
     `sourceAspect` / `targetAspect` (9/16).
  2. If `status === "safe"`: set `asset.cropFocus = decision.cropFocus` and
     `asset.fit = "cover"`.
  3. If `status === "unsafe"`: set `asset.fit = "contain"` (current bare letterbox).
  4. If `status === "indeterminate"`: leave `cropFocus` and `fit` unset (defaults apply).
  5. Store `asset.cropDecision = decision` (full decision object with candidates) in
     `asset-analysis.json`.

- Video assets: skip crop decision entirely (focus detector does not support video).

### 4. `cropFocus` field in `MediaField` type

- `types.ts`: add `cropFocus?: { x: number; y: number }` to `MediaField`. Document as
  "Normalized [0,1] source-space focus point for cover crop positioning. Overrides
  deprecated `focus` enum when present."

- The deprecated `focus?: "top" | "center" | "bottom"` remains for backward
  compatibility.

### 5. `MediaBackground.tsx` rendering

- `objectPosition` resolution: `cropFocus ? \`${cropFocus.x * 100}% ${cropFocus.y * 100}%\` : FOCUS_MAP[media.focus ?? "center"] ?? "center"`.
  This means `cropFocus` takes priority over `focus` when both are present.

- No other rendering changes. `fit: "contain"` still uses bare letterbox with
  `#0a0a14` background. Framed contain composition is deferred.

### 6. `asset-analysis.json` artifact extension

- Each asset entry gains a `cropDecision` field (the full `CropDecision` object) when
  crop analysis was performed. This is the review-first artifact — the recommendation
  and evidence are here, not in `scene-data.mjs`.

### 7. `media-patch.json` + `review-media-patch.mjs`

- `assignAssetsToScenes()`: when `asset.cropFocus` is set, include `cropFocus` in the
  `media` object of the patch entry. `fit` is already included from existing logic.

- `review-media-patch.mjs` → `formatSemanticsSummary()`: add a `// Crop Decision:` line
  showing `status`, `policy`, `cropFocus`, and `reason` when `cropDecision` is present.

- `review-media-patch.mjs` → `formatPatchEntry()`: include `cropFocus` in the copyable
  media block: `cropFocus: { x: 0.3, y: 0.5 },`.

### 8. `apply-media-patch.mjs` serialization

- `formatMediaBlock()`: when `media.cropFocus` is present, output
  `cropFocus: { x: <val>, y: <val> },` line. Numeric validation: `x` and `y` must be
  numbers in `[0, 1]`. Reject patch entries with out-of-range `cropFocus` values.

### 9. `media-bg.mjs` validation

- `validateMedia()`: add `cropFocus` validation. If `cropFocus` is present, check that
  `x` and `y` are numbers in `[0, 1]`. Warn on out-of-range values.

- `VALID_FOCUSES` remains for the deprecated `focus` field.

### 10. Old spec supersedure

- `docs/spec-vlm-fit-focus.md` is superseded by this spec. It is moved to
  `docs/archive/spec-vlm-fit-focus.md` with a header note pointing to this spec.

### 11. `CONTEXT.md` glossary update

- **Asset Fit Analysis** entry: update to reflect that `focus` is deprecated and
  `cropFocus` is the new field. Mention crop simulation.

- New term: **Crop Decision** — the deterministic evaluation of whether a 9:16 cover
  crop from a candidate focus point preserves all protected regions. Produces a
  `CropDecision` object with `status`, `policy`, `cropFocus`, `reason`, and
  `candidates`.

## Testing Decisions

### Seams

1. **New seam: `crop-decision.test.mjs`** — Pure function tests for
   `resolveObjectPosition`, `evaluateCropSafety`, `selectBestCrop`. No mocks needed —
   these are pure geometry transforms. Covers all behavioral matrix rows.

2. **Existing seam: `visual-analyzer.test.mjs`** — Extend to test the crop simulation
   action. Mock Python subprocess: simulate the VLM receiving a cropped image path.
   Verify EXIF normalization is applied.

3. **Existing seam: `asset-sourcer.test.mjs`** — Extend to test `analyzeAssets()`
   Phase 3b integration: mock `detectFocus` + `analyzeAssetSemantics`, verify
   `cropDecision` written to asset-analysis.json, `cropFocus` set on asset.

4. **Existing seam: `media-bg.test.mjs`** — Extend `validateMedia` tests for
   `cropFocus` validation (valid, out-of-range, missing, type mismatch).

5. **Existing seam: `apply-media-patch.test.mjs`** — Extend `formatMediaBlock` tests
   for `cropFocus` serialization (present, absent, invalid values).

### Testing principles

- Test external behavior, not implementation details.
- `crop-decision.mjs` functions are pure — test with fixture inputs (aspect ratios,
  protected regions, saliency centroids) and assert exact outputs.
- VLM/Python side: test via JS mock (simulate cropped image path, VLM response).
  Python subprocess is an integration concern.
- `MediaBackground.tsx`: verify via `verify-video.mjs --pre` (DOM/props validation) and
  runtime visual check. Not in existing test suite's scope.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk Level | Assessment |
|------|-------------|------------|------------|
| `lib/crop-decision.mjs` (NEW) | New pure-function module: `resolveObjectPosition`, `evaluateCropSafety`, `selectBestCrop` | Low | New file, no existing consumers. Pure functions, fully testable. |
| `lib/vlm_analyzer.py` | Add `simulate_crop()` function; extend `handle_analyze_semantics` to crop landscape images before VLM; fix `resize_image_if_needed` EXIF normalization | Medium | Core VLM analysis path. EXIF fix is a bug fix (current code doesn't normalize). Crop simulation changes the image the VLM sees — but the VLM prompt already asks about fit/critical edge text, so the output schema is unchanged. Cleaned up in `finally`. |
| `lib/visual-analyzer.mjs` | No changes needed — `analyzeAssetSemantics` already passes the path; crop simulation happens inside Python | Low | No JS-side changes. Python returns the same schema. |
| `lib/asset-sourcer.mjs` | Add Phase 3b (crop decision) after Phase 3a; store `cropDecision` + `cropFocus` on asset; include `cropFocus` in patch | Medium | New phase after existing phases. Does not modify existing phases. `cropFocus` is an additional field in patch output. |
| `remotion/src/types.ts` | Add `cropFocus?: { x: number; y: number }` to `MediaField` | Low | Pure addition. No existing consumer breaks — both `cropFocus` and `focus` default to center. |
| `remotion/src/components/MediaBackground.tsx` | Change `objectPosition` resolution: `cropFocus` priority over `focus` | Medium | Core render path. When `cropFocus` absent, falls back to existing `FOCUS_MAP[focus]` logic — identical to current behavior. |
| `lib/review-media-patch.mjs` | Add `cropDecision` display in `formatSemanticsSummary`; add `cropFocus` in `formatPatchEntry` | Low | Pure addition to output format. Existing fields unchanged. |
| `apply-media-patch.mjs` | Add `cropFocus` serialization in `formatMediaBlock`; add numeric validation | Low | Pure addition to output format. Validation is additive. |
| `lib/media-bg.mjs` | Add `cropFocus` validation in `validateMedia` | Low | Pure addition to validation. Existing checks unchanged. |
| `docs/spec-vlm-fit-focus.md` | Moved to `docs/archive/` | Low | Superseded by this spec. |
| `CONTEXT.md` | Update `Asset Fit Analysis` entry; add `Crop Decision` term | Low | Glossary update only. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| VC-01 | 16:9 fixture with subject centered, no protected regions | `selectBestCrop` returns `safe` with center crop; `cropFocus = {0.5, 0.5}`; VLM sees cropped image and may adjust `fit` | Cross-step contract | Deterministic geometry: center crop is always safe when no protected regions exist. |
| VC-02 | 16:9 fixture with face in left third (protected region at `[0.1, 0.4, 0.15, 0.3]`) | Center crop violates the protected region; saliency-anchored or protected-region-anchored crop shifts to keep the face visible; `cropFocus.x < 0.5` | Cross-step contract | `evaluateCropSafety` tests intersection; `selectBestCrop` tries protected-region anchor candidates. |
| VC-03 | 16:9 fixture with wide logo spanning full width, no protected regions, no saliency | `selectBestCrop` returns `unsafe` (no safe cover candidate); `fit = "contain"`; `cropFocus = null` | Cross-step contract | No candidate qualifies → `unsafe` → `contain` fallback. VLM may also see the cropped image and say `fit: "contain"` in its semantics. |
| VC-04 | Focus detector unavailable (`status: "degraded"`) | `selectBestCrop` receives no `protectedRegions` and no `saliency`; returns `indeterminate`; `cropFocus` and `fit` unset | Failure/degradation | Schema-complete degraded result. Pipeline uses defaults (`cover + center`). |
| VC-05 | VLM times out or returns malformed output | VLM result is degraded (existing mechanism). Crop decision still runs from focus detection data. `cropDecision.status` may be `safe` or `unsafe` even without VLM. | Failure/degradation | Crop decision is independent of VLM availability — it uses focus detector data. VLM only affects `fit` recommendation. |
| VC-06 | EXIF-rotated image (portrait stored as landscape in EXIF) | `exif_transpose` normalizes orientation before crop simulation and VLM analysis. Focus detector already normalizes. All three use same orientation. | Cross-step contract | `simulate_crop` and `resize_image_if_needed` both call `ImageOps.exif_transpose`. Focus detector already does this. |
| VC-07 | PNG with alpha channel | `convert("RGB")` in `simulate_crop` flattens alpha. No silent lossy conversion — JPEG output is documented as the crop simulation policy. | Null/boundary | `ImageOps.exif_transpose(source).convert("RGB")` matches focus detector's normalization. |
| VC-08 | Portrait image (aspect < 1.2) | Crop simulation skipped (image already narrower than 9:16). VLM receives original image. No `cropDecision` written. | Null/boundary | `analyzeAssets` checks `frame.width / height` before running crop decision. |
| VC-09 | Existing scene-data without `cropFocus` or `focus` | `MediaBackground` uses `objectPosition: "center"` (existing `FOCUS_MAP["center"]`). Identical to current behavior. | Backward compat | `??` operator defaults. |
| VC-10 | Existing scene-data with legacy `focus: "top"` (no `cropFocus`) | `MediaBackground` uses `FOCUS_MAP["top"]` = `"center top"`. `cropFocus` absent → `focus` used. Identical to current behavior. | Backward compat | `cropFocus ? ... : FOCUS_MAP[focus]` — `cropFocus` absent, falls through to `focus`. |
| VC-11 | scene-data with both `cropFocus: {x: 0.3, y: 0.5}` and `focus: "top"` | `cropFocus` takes priority. `objectPosition: "30% 50%"`. `focus` ignored. | Cross-step contract | Priority order documented in types.ts. |
| VC-12 | Video asset with manual `cropFocus` in scene-data | `MediaBackground` applies `objectPosition` from `cropFocus` to `<Video>` element. CSS `object-position` works on video. No crop simulation run by pipeline. | Cross-step contract | `cropFocus` is pure data field, renderer doesn't distinguish image/video. |
| VC-13 | `validateMedia` receives `cropFocus: { x: 1.5, y: 0.5 }` | Warning: `cropFocus.x = 1.5 is out of range [0, 1]`. | Null/boundary | Numeric bounds validation in `validateMedia`. |
| VC-14 | `validateMedia` receives `cropFocus: { x: "0.5", y: 0.5 }` (string) | Warning: `cropFocus.x must be a number`. | Null/boundary | Type validation in `validateMedia`. |
| VC-15 | `apply-media-patch.mjs` receives patch with `cropFocus` | `formatMediaBlock` outputs `cropFocus: { x: 0.3, y: 0.5 },` in scene-data code block. | Cross-step contract | Conditional output when field present. |
| VC-16 | `apply-media-patch.mjs` receives patch with `cropFocus: { x: -0.1 }` | Validation rejects: `cropFocus.x = -0.1 is out of range [0, 1]`. Patch entry skipped. | Failure/degradation | Numeric bounds validation before serialization. |
| VC-17 | `review-media-patch.mjs` displays crop decision | `formatSemanticsSummary` shows `// Crop Decision: safe, cover, focus [0.3, 0.5] — center crop violates face, shifted left`. `formatPatchEntry` includes `cropFocus` in copyable block. | Cross-step contract | Review artifact shows evidence + recommendation. |
| VC-18 | `resolveObjectPosition` with `sourceAspect = 16/9`, `targetAspect = 9/16`, `normalizedFocus = [0.5, 0.5]` | Returns `"50% 50%"` (center). For `normalizedFocus = [0.25, 0.5]` (subject left of center), returns a left-shifted percentage. | Cross-step contract | Pure function with fixture tests. Formula: `p = clamp((0.5 - f × r + 0.5) / (1 - r), 0, 1)` where `r = (16/9) / (9/16) = 256/81 ≈ 3.16`. |
| VC-19 | `resolveObjectPosition` with `sourceAspect = 9/16`, `targetAspect = 9/16` (same ratio) | Returns `"center"` (no crop needed). | Null/boundary | Guard: `r ≤ 1` → no horizontal shift. |
| VC-20 | `resolveObjectPosition` with `sourceAspect = 9/16`, `targetAspect = 9/16` but source is taller | Vertical crop applies. `vy = clamp(...)` formula for vertical axis. | Cross-step contract | Symmetric formula for vertical axis when `targetAspect > sourceAspect`. |

## Out of Scope

- **Framed contain composition** (brand matte / palette gradient / blur last-resort):
  deferred to a future spec. Current `fit: "contain"` uses bare letterbox with
  `#0a0a14` background.
- **Padded preprocessing** (Phase 4 in handoff): deferred. No pre-rendered padded assets.
- **Video crop simulation**: `focus_detector.py` does not support video. `cropFocus`
  field works for video if set manually, but the pipeline does not auto-analyze video
  crops.
- **Second VLM action for crop validation**: not implemented. The VLM sees the cropped
  image in its existing `analyze_semantics` call, which already asks about fit and
  critical edge text.
- **`media-bg.mjs` (old Playwright rendering layer)**: not modified beyond validation.
  Remotion has replaced it. The data contract (scene-data `media` field) is shared.

## Further Notes

- The `resolveObjectPosition` formula is derived from the CSS `object-position`
  specification for `cover` scaling. When `r = sourceAspect / targetAspect > 1`, the
  source is wider than the target. The visible fraction is `1/r` of the source width.
  To keep a source-space focus point `f` (in `[0, 1]`) visible, the CSS position `p`
  (in `[0, 1]`) must satisfy: `p = (f × r - 0.5) / (r - 1)`, clamped to `[0, 1]`.
  Equivalently: `p = clamp((0.5 - f × r + 0.5) / (1 - r), 0, 1)` (same formula,
  rearranged). The vertical axis applies the same formula when the source is taller
  than the target (`r = targetAspect / sourceAspect > 1`).

- The EXIF normalization fix in `resize_image_if_needed` is a bug fix: the current code
  opens the image without `exif_transpose`, meaning an EXIF-rotated image's pixel
  dimensions may not match its visual orientation. This could cause the VLM to analyze
  a sideways image and the focus detector to produce coordinates in a different
  orientation than the VLM. Fixing this ensures both operate in the same coordinate
  system.

- The `cropDecision` object in `asset-analysis.json` includes the full candidate list
  (with crop rectangles and safety evaluations), so a human reviewer can understand why
  a particular focus was chosen and whether alternatives were considered.

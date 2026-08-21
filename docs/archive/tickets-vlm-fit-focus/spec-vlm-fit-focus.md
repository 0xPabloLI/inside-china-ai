# Spec: VLM-Driven Fit/Focus for Landscape Assets in Vertical Video

> Created: 2026-08-17
> Based on: Grill session (Round 1 + Round 2)
> Status: Ready for implementation

## Problem Statement

When landscape (16:9) images or videos are placed in a vertical (9:16) TikTok canvas,
`MediaBackground.tsx` hardcodes `objectFit: "cover"` with no focus control. This crops
the center of every landscape asset uniformly, losing critical content when the main
subject is above or below center, or when text/UI elements sit at the edges.

The pipeline has a VLM layer (Qwen3-VL-8B) that already describes asset content, but
that description is only used for scoring — never for placement decisions.

## Solution

Add a VLM `analyze_fit` action that examines each landscape asset and outputs
`{ fit: "cover" | "contain", focus: "top" | "center" | "bottom" }`. Extend `MediaField`
with these optional fields. Update `MediaBackground.tsx` to consume them via CSS
`objectFit` and `objectPosition`. Wire the VLM call into `asset-sourcer.mjs`'s
`analyzeAssets()` phase, and pass the results through `media-patch.json` into
`scene-data.mjs`.

The `mode` field (fullscreen vs background) remains an agent decision at scene-data
authoring time — not VLM-automated — because Qwen3-VL is a vision model unsuited for
pure-text reasoning about narrative structure.

## User Stories

1. As a video pipeline operator, I want landscape assets to be intelligently cropped
   so that the main subject is always visible in the 9:16 frame.
2. As a video pipeline operator, I want landscape assets with edge-critical content
   (text, UI, charts) to use letterbox (contain) instead of crop, so no information
   is lost.
3. As a video pipeline operator, I want the VLM to decide fit/focus automatically
   during asset sourcing, so I don't have to manually set these fields per asset.
4. As a scene-data author, I want fit/focus to be optional fields with safe defaults
   (cover + center), so existing scene-data files keep working without changes.
5. As a scene-data author, I want `mode` (fullscreen/background) to remain my decision,
   based on the narrative context of each scene, so the VLM isn't forced into a task
   it's bad at.
6. As a pipeline developer, I want `validateMedia` to warn on invalid fit/focus values
   and on landscape assets missing a fit field, so misconfigurations are caught early.
7. As a pipeline developer, I want VLM unavailability to degrade gracefully to
   cover + center, so the pipeline never blocks on VLM downtime.
8. As a pipeline developer, I want the VLM process to stay alive across both the
   `analyzeAssets` and `assignAssetsToScenes` phases, so the 11 GB model doesn't
   reload between them.
9. As a pipeline operator, I want `media-patch.json` to include fit/focus/mode fields
   when VLM analysis succeeds, so `apply-media-patch.mjs` outputs them for copy-paste.
10. As a pipeline developer, I want the VLM JSON response parser to handle markdown
    code blocks and extra text, so occasional format deviations don't crash the pipeline.

## Implementation Decisions

### 1. New VLM action: `analyze_fit`

- **Python side** (`ai_analyzer.py`): new `handle_analyze_fit(model, processor, path)`
  handler. Uses a dedicated prompt asking Qwen3-VL to output JSON
  `{"fit": "cover"|"contain", "focus": "top"|"center"|"bottom", "reason": "..."}`.
  Added to main loop as `elif action == "analyze_fit":` branch.
- **JS side** (`ai-analyzer.mjs`): new `analyzeFit(assetPath)` export. Pushes
  `{ action: "analyze_fit", path: assetPath }` to the request queue. Returns
  `{ fit, focus, reason }` parsed object, or `{}` on failure.

### 2. Fit/focus only for landscape assets

- Use `upscale.mjs`'s `checkResolution()` to detect aspect ratio.
- Only call `analyzeFit()` when `width / height > 1.2` (landscape).
- Portrait/square assets get `fit: "cover", focus: "center"` without VLM call.

### 3. VLM prompt design (analyze_fit)

Prompt: "This image/video will be placed in a 9:16 vertical video canvas. Look at
where the main subject is and whether the edges contain critical content (text, UI,
charts). Respond as JSON: {\"fit\": \"cover\" or \"contain\", \"focus\": \"top\" or
\"center\" or \"bottom\", \"reason\": \"one sentence\"}. Use \"cover\" if edge content
is non-critical. Use \"contain\" if edges have text/UI that must not be cropped."

### 4. JSON response parsing

- New `parseFitResponse(text)` function: tries `JSON.parse` first, falls back to
  regex `\{[^}]+\}` extraction. Validates `fit` ∈ {cover, contain} and
  `focus` ∈ {top, center, bottom}. Returns `{}` on parse failure → defaults apply.

### 5. MediaField type extension

- `types.ts`: add `fit?: "cover" | "contain"` and `focus?: "top" | "center" | "bottom"`.
  Both optional. Existing scene-data without these fields → defaults (cover + center).

### 6. MediaBackground.tsx rendering

- `objectFit`: `media.fit ?? "cover"`
- `objectPosition`: focusMap[`media.focus ?? "center"`] where
  `focusMap = { top: "center top", center: "center", bottom: "center bottom" }`
- `fit: "contain"` → `objectFit: "contain"`, letterbox filled by `AbsoluteFill`'s
  `backgroundColor: "#0a0a14"` (already set). No extra letterbox div needed.

### 7. asset-sourcer.mjs integration

- `analyzeAssets()`: after `describeImage/describeVideo`, check aspect ratio. If
  landscape, call `analyzeFit()`. Store result in `asset.aiFit` and `asset.aiFocus`.
  Do NOT call `closeAnalyzer()` here (moved to main function's finally).
- `assignAssetsToScenes()`: remains synchronous (no `suggest_mode` VLM call needed
  since mode is an agent decision). Patch `media` object includes `fit`/`focus` when
  VLM analysis succeeded.
- `closeAnalyzer()` moves from `analyzeAssets()` finally to main function's finally
  block, keeping the VLM process alive across both phases.

### 8. media-patch.json + apply-media-patch.mjs

- Patch `media` object: add `fit`, `focus`, `mode` fields when present.
- `apply-media-patch.mjs`: output `fit: "cover",` and `focus: "center",` lines
  when fields exist. `mode` field output when present (already in current code
  implicitly via `media.mode`).

### 9. validateMedia updates

- New constants: `VALID_FITS = ["cover", "contain"]`,
  `VALID_FOCUSES = ["top", "center", "bottom"]`.
- Warn on invalid `fit`/`focus` values.
- Warn on `fit: "contain"` when `mode` is not set (contain + background is fine;
  contain + fullscreen is also fine — no cross-validation needed).

### 10. scene-rules: landscape asset without fit → warn

- In `verify-video.mjs --pre` mode: use ffprobe to check media aspect ratio. If
  landscape (aspect > 1.2) and `media.fit` is undefined, emit a warning suggesting
  to set fit/focus via VLM analysis.

### 11. suggest_mode NOT implemented

- `mode` (fullscreen vs background) remains an agent decision at scene-data
  authoring time. Qwen3-VL is a vision model; pure-text reasoning about narrative
  structure is not its strength. The agent writes `mode: "fullscreen"` when the
  asset is primary content (product demo, interview) and leaves it unset
  (defaulting to background) when the asset is illustrative.

## Testing Decisions

### Seams (existing, preferred)

1. **`ai-analyzer.test.mjs`** — test `analyzeFit()` JS API: mock Python subprocess,
   verify request/response parsing, JSON extraction, degradation on failure.
2. **`asset-sourcer.test.mjs`** — test `analyzeAssets()` integration: mock VLM,
   verify `aiFit`/`aiFocus` set on landscape assets, not set on portrait.
3. **`asset-sourcer-ai-integration.test.mjs`** — test `assignAssetsToScenes()`
   patch output includes fit/focus when VLM succeeded.
4. **`media-bg.test.mjs`** — test `validateMedia()` with fit/focus values:
   valid, invalid, missing, combinations.
5. **`scene-rules.test.mjs`** — test landscape-without-fit warning (if feasible
   without ffprobe runtime; otherwise test the rule function in isolation).

### Testing principles

- Test external behavior, not implementation details.
- VLM Python side: test via JS mock (simulate JSON response, malformed JSON, empty
  response). Python subprocess is an integration concern, not a unit test concern.
- `MediaBackground.tsx`: Remotion component testing is not in the existing test
  suite's scope. Verify via `verify-video.mjs --pre` (DOM/props validation) and
  runtime visual check.
- `parseFitResponse()`: pure function, fully unit-testable. Cover all scenarios
  from the Behavioral Scenarios matrix.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `lib/ai_analyzer.py` | New `handle_analyze_fit` handler + `analyze_fit` action in main loop | Low | Pure addition. Existing `describe_image`/`describe_video` handlers unchanged. |
| `lib/ai-analyzer.mjs` | New `analyzeFit()` export. `requestQueue` entry format unchanged (already has action + path). | Low | Pure addition. Existing `describeImage`/`describeVideo` unchanged. |
| `remotion/src/types.ts` | `MediaField` adds `fit?` and `focus?` optional fields | Low | Pure addition. No existing consumer breaks — both default to current behavior. |
| `remotion/src/components/MediaBackground.tsx` | `objectFit` from hardcoded `"cover"` to `media.fit ?? "cover"`. New `objectPosition` logic. | Medium | Core render path. Default `"cover"` preserves backward compatibility. Verified by: existing videos render identically when fit/focus absent. |
| `lib/media-bg.mjs` (`validateMedia`) | New `VALID_FITS`/`VALID_FOCUSES` checks + warnings | Low | Pure addition to validation. Existing checks unchanged. |
| `lib/asset-sourcer.mjs` (`analyzeAssets`) | Add `analyzeFit()` call for landscape assets. Move `closeAnalyzer()` to main finally. | Medium | VLM lifecycle change. If `closeAnalyzer` is not called in `analyzeAssets`, the process stays alive — must ensure main function's finally always runs. |
| `lib/asset-sourcer.mjs` (`assignAssetsToScenes`) | Patch `media` object includes `fit`/`focus` when present | Low | Pure addition to patch output. No structural change. |
| `apply-media-patch.mjs` | Output `fit`/`focus` lines when fields exist | Low | Pure addition to output format. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | VLM unavailable (Python not found / model load fails) | `analyzeFit()` returns `{}`. `asset.aiFit`/`aiFocus` not set. Patch omits fit/focus. `MediaBackground` uses `cover + center`. | Failure/degradation | Reuse existing `vlmAvailable = false` mechanism. |
| 2 | Portrait asset (aspect < 1.2) | `analyzeFit()` not called. `fit: "cover", focus: "center"` set directly. | Null/boundary | `checkResolution()` detects aspect ratio before VLM call. |
| 3 | VLM returns JSON wrapped in markdown code block | `parseFitResponse()` extracts JSON via regex. Returns parsed object. | Failure/degradation | Regex `\{[^}]+\}` fallback after `JSON.parse` fails. |
| 4 | VLM returns extra text around JSON | Same as #3. Regex extraction. | Failure/degradation | Same parser. |
| 5 | VLM returns `fit: "invalid"` | `parseFitResponse()` validates values. Returns `{}` → defaults. | Null/boundary | `fit` must be in `["cover", "contain"]`, `focus` in `["top", "center", "bottom"]`. |
| 6 | VLM returns empty string | `parseFitResponse("")` returns `{}`. | Null/boundary | Guard on empty/whitespace input. |
| 7 | `fit: "contain"` rendering — landscape in 9:16 | `objectFit: "contain"`, asset shows fully, letterbox bars filled by `#0a0a14`. | Cross-step contract | `AbsoluteFill` already sets `backgroundColor: "#0a0a14"`. No extra div needed. |
| 8 | `focus: "top"` + `fit: "cover"` — subject in upper frame | `objectPosition: "center top"`. Top of asset preserved. | Cross-step contract | CSS `object-position` native support. |
| 9 | `focus: "bottom"` + `fit: "cover"` — subject in lower frame | `objectPosition: "center bottom"`. Bottom of asset preserved. | Cross-step contract | Same. |
| 10 | `fit`/`focus` both absent (existing scene-data) | `objectFit: "cover"`, `objectPosition: "center"`. Identical to current behavior. | Backward compat | `??` operator defaults to `"cover"` / `"center"`. |
| 11 | `mode: "fullscreen"` + `fit: "contain"` | `FullscreenMedia` renders with `MediaBackground` using contain. Letterbox visible in fullscreen. Acceptable — agent chose this. | State/transition | No cross-validation. Both fields independent. |
| 12 | VLM process idle-timeout between analyzeAssets and assignAssetsToScenes | `ensureProcess()` respawns on next call. `analyzeFit` in analyzeAssets succeeds; no VLM call in assignAssetsToScenes (mode is agent decision). | Failure/degradation | `closeAnalyzer()` moved to main finally. Process stays alive across both phases. |
| 13 | Video asset `analyzeFit` takes ~120s | 180s timeout (`RESPONSE_TIMEOUT_MS`) covers it. Returns fit/focus. If timeout, returns `{}`. | Failure/degradation | Existing timeout mechanism. |
| 14 | `validateMedia` receives `fit: "contain"` valid | No warning. Passes. | Null/boundary | `VALID_FITS` includes "contain". |
| 15 | `validateMedia` receives `focus: "left"` invalid | Warn: "Unknown focus value, will use 'center'". | Null/boundary | `VALID_FOCUSES` does not include "left". |
| 16 | Landscape asset without `fit` field in pre-render check | `scene-rules` warns: "Landscape asset without fit, defaulting to cover". | Cross-step contract | ffprobe aspect ratio check in `verify-video.mjs --pre`. |
| 17 | `media-patch.json` has `fit`/`focus` fields | `apply-media-patch.mjs` outputs `fit: "cover",` and `focus: "center",` lines. | Cross-step contract | `if (m.fit)` conditional output. |
| 18 | `media-patch.json` lacks `fit`/`focus` fields (VLM was down) | `apply-media-patch.mjs` omits these lines. Scene-data uses defaults. | Failure/degradation | Fields are optional in output. |

## Out of Scope

- **Asset selection** (search/score/download): already fully implemented in
  `asset-sourcer.mjs`. Not modified beyond adding `analyzeFit` call.
- **Video segment selection** (which 8s of a long video to use): Issue #32.
  `downloadYtdlp()` still hardcodes `--download-sections "*0:00-0:08"`.
- **`suggest_mode` VLM action**: not implemented. `mode` remains an agent decision.
  Qwen3-VL is a vision model, unsuited for pure-text narrative reasoning.
- **Auto-writing scene-data.mjs**: Issue #31 (`ready-for-agent`). This spec only
  updates `apply-media-patch.mjs` output format.
- **`media-bg.mjs` (old Playwright rendering layer)**: not modified. Remotion has
  replaced it. The data contract (scene-data `media` field) is shared.
- **Upscale integration**: `autoUpscaleIfNeeded()` is orthogonal to fit/focus.
  No changes needed.

## Further Notes

- VLM prompt for `analyze_fit` should be validated at implementation time by running
  against existing test assets (`shanghai-skyline.jpg`, `unitree-demo.mp4`) to confirm
  Qwen3-VL can output structured JSON reliably at temperature=0.
- The `fit`/`focus` fields are data, not rendering logic — they survive in scene-data
  the same way `overlay` and `animation` do. The old Playwright `media-bg.mjs` could
  consume them if ever needed, but that's not in scope.
- The VLM process lifecycle change (moving `closeAnalyzer` to main finally) is the
  highest-risk change: if the main function throws before `finally`, the process
  leaks. The existing `process.on("exit")` cleanup in `ai-analyzer.mjs` is the
  safety net.

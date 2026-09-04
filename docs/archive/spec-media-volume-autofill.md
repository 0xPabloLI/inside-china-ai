# Spec: Per-scene Volume + Envelope Ducking & Asset-sourcer Auto-fill

> **Status**: Active — 2026-08-14
> **Source**: `docs/research/media-asset-strategy.md` §4.6 + §4.4
> **Workflow**: Substantial (Grill → Spec → Tickets → TDD → Review)

## 1. Goal

Two independent enhancements to the short-video pipeline:

1. **§4.6 Per-scene volume + envelope ducking** — Add `volume?: number` to `MediaField`, replace hardcoded `volume={0.08}` in `MediaBackground.tsx` with `media.volume ?? 0.08`, and apply envelope ducking so video audio fades in/out synchronized with opacity.

2. **§4.4 Asset-sourcer auto-fill** — New `assignAssetsToScenes()` function in `asset-sourcer.mjs` that batch-assigns downloaded assets to scenes. Outputs `media-patch.json` with per-scene media recommendations (including volume). New `apply-media-patch.mjs` script formats patches as copy-paste-ready code blocks for human review.

## 2. Design Decisions (from Grill)

| #   | Decision                                                                                             | Rationale                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Only Remotion `MediaBackground.tsx` gets volume support; Playwright `media-bg.mjs` stays `muted`     | Playwright renders visuals only; audio mixed by FFmpeg post-process. Video element volume is irrelevant to final output. |
| Q2  | `videoVolume = baseVolume * opacity` — reuse existing opacity interpolate                            | Zero extra interpolate calls. `none` preset opacity=1 → volume=baseVolume.                                               |
| Q3  | Default `0.08`, valid range [0,1]. Out-of-range → warning (not error) in `validateMedia()`           | Volume errors don't crash rendering; just bad audio. Warning is sufficient.                                              |
| Q4  | Generate `output/media-patch.json` + independent `apply-media-patch.mjs` script                      | Separation of concerns: sourcer searches, applier formats. HITL checkpoint between them.                                 |
| Q5  | Greedy matching: assets sorted by score desc, each assigned to first available scene                 | Simple, testable. Hungarian algorithm is overkill for 10 scenes.                                                         |
| Q6  | Auto-fill recommends volume: narrative+video→0.10, quote+video→0.04, info-card→0.08, image→no volume | Per §4.6 research table. Combines §4.6 and §4.4 naturally.                                                               |
| Q7  | `apply-media-patch.mjs` outputs formatted suggestion list, user manually copies to scene-data.mjs    | scene-data.mjs is hand-authored content; auto-rewriting risks losing comments/formatting.                                |
| Q8  | Apply script does NOT auto-modify .mjs files; outputs human-readable diff                            | HITL core is human review; auto-write weakens checkpoint.                                                                |
| Q9  | `media-patch.json` = flat array sorted by sceneId, each entry has full media object + metadata       | Easy to review and consume.                                                                                              |
| Q10 | All assets participate in matching; extras marked `status: "unassigned"`                             | Maximizes coverage; user sees what's unused.                                                                             |
| Q11 | Volume validation only in `validateMedia()`; `verify-video.mjs` inherits                             | Single source of validation logic.                                                                                       |
| Q12 | Unified formula `videoVolume = baseVolume * opacity` for all presets including `none`                | No special-case branch; `none`→opacity=1→volume=baseVolume.                                                              |
| Q13 | Image type media: no volume field in patch; `<Img>` ignores volume                                   | Images have no audio track.                                                                                              |

## 3. Modified Files Impact

| File                                          | Modification                                                                                   | Risk   | Assessment                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remotion/src/types.ts`                       | Add `volume?: number` to `MediaField` interface                                                | Low    | Pure addition; no existing field changed. All consumers use optional chaining or `??` defaults.                                                                                                                                                                                       |
| `remotion/src/components/MediaBackground.tsx` | Replace `volume={0.08}` with `volume={videoVolume}` where `videoVolume = baseVolume * opacity` | Medium | Core rendering component. 4 downstream consumers: `FullscreenMedia.tsx`, `NarrativeScene.tsx`, `InfoCardScene.tsx`, `ShortVideo.tsx`. All pass `media` through unchanged — volume is read internally. Risk mitigated: `baseVolume = media.volume ?? 0.08` preserves existing default. |
| `lib/media-bg.mjs`                            | Add volume range validation to `validateMedia()`                                               | Low    | Pure addition to validation function. `verify-video.mjs` calls `validateMedia()` → inherits. Existing tests unaffected (new check only fires when `volume` field present).                                                                                                            |
| `lib/asset-sourcer.mjs`                       | Add `assignAssetsToScenes()` function; call it in `main()` to generate `media-patch.json`      | Medium | New function + new output file. Existing `recommendScene()` retained (single-asset API) for backward compat. `buildReport()` unchanged. New code path in `main()` after attribution building.                                                                                         |
| `__tests__/media-bg.test.mjs`                 | Add volume validation test cases                                                               | Low    | Test-only file. New describe block or test cases appended.                                                                                                                                                                                                                            |
| `__tests__/asset-sourcer.test.mjs`            | Add `assignAssetsToScenes` test cases                                                          | Low    | Test-only file. New describe block appended.                                                                                                                                                                                                                                          |
| `scripts/short-video/apply-media-patch.mjs`   | New file — formats `media-patch.json` as copy-paste code blocks                                | Low    | New file, no existing code modified. Reads JSON, outputs formatted text to stdout.                                                                                                                                                                                                    |

## 4. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact (see §3 above)

### Section 2: Behavioral Scenarios

| #   | Scenario                                                         | Expected Behavior                                                                                                                   | Risk   | Mitigation                                                                                                         |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `media.volume` undefined (not set in scene-data)                 | `baseVolume = 0.08` (default). `videoVolume = 0.08 * opacity`. Same as current behavior.                                            | Low    | `?? 0.08` fallback. Existing scenes without volume field render identically.                                       |
| 2   | `media.volume = 0` (explicit silence)                            | `videoVolume = 0 * opacity = 0`. Video audio fully muted.                                                                           | Low    | `0 ?? 0.08` → `0` (nullish coalescing, 0 is not null/undefined). Correct behavior — user explicitly wants silence. |
| 3   | `media.volume = 0.12` (product demo, louder)                     | `videoVolume = 0.12 * opacity`. Audio fades in/out with opacity envelope.                                                           | Low    | Standard path.                                                                                                     |
| 4   | `media.volume = 1.5` (out of range)                              | `validateMedia()` returns warning `"Volume 1.5 is out of range [0, 1]"`. Rendering proceeds — Remotion clamps volume internally.    | Low    | Warning only, no error. Remotion `<Video volume>` clamps to [0, 1] at render time.                                 |
| 5   | `media.volume = -0.5` (negative)                                 | `validateMedia()` returns warning. Rendering proceeds — Remotion treats negative volume as 0.                                       | Low    | Same as #4.                                                                                                        |
| 6   | `media.type = "image"` + `media.volume = 0.1`                    | `<Img>` rendered (no volume prop). Volume field ignored. `validateMedia()` does NOT warn (image with volume is harmless dead data). | Low    | Image has no audio; volume is inert.                                                                               |
| 7   | `preset = "none"` + `media.type = "video"`                       | `opacity = 1`, `videoVolume = baseVolume * 1 = baseVolume`. No envelope ducking.                                                    | Low    | Unified formula handles this correctly.                                                                            |
| 8   | `preset = "fade"` + duration < inFrames (very short scene)       | `inFrames` clamped to `duration/2`. Opacity ramps 0→1→0. Volume follows same ramp.                                                  | Low    | Existing `Math.min(timing.in, duration/2)` clamping already handles this.                                          |
| 9   | `assignAssetsToScenes`: 0 assets, 3 available scenes             | Returns empty patch array. No scenes assigned.                                                                                      | Low    | Empty input → empty output.                                                                                        |
| 10  | `assignAssetsToScenes`: 5 assets, 2 available scenes             | Top-2 assets (by score) assigned. Remaining 3 marked `status: "unassigned"`.                                                        | Low    | Greedy matching stops when no available scenes remain.                                                             |
| 11  | `assignAssetsToScenes`: asset with `type: "image"`               | Assigned scene gets `media.volume` omitted (not set).                                                                               | Low    | Image has no audio.                                                                                                |
| 12  | `assignAssetsToScenes`: scene already has `media` field          | Scene skipped (not available for assignment).                                                                                       | Low    | `scene.media` check in existing `recommendScene()` logic preserved.                                                |
| 13  | `assignAssetsToScenes`: scene with `visualType: "hook"`          | Scene skipped (`NO_MEDIA_TYPES` includes "hook").                                                                                   | Low    | Existing logic preserved.                                                                                          |
| 14  | `assignAssetsToScenes`: multiple assets with same file path      | First one (higher score) assigned; second skipped (path already assigned).                                                          | Medium | Dedup by `asset.path` — track assigned paths in a Set.                                                             |
| 15  | `assignAssetsToScenes`: asset has no `path` field                | Asset skipped (can't assign without knowing file path).                                                                             | Low    | Guard: `if (!asset.path) continue`.                                                                                |
| 16  | `media-patch.json` generated but `output/` dir doesn't exist     | `mkdirSync(outputDir, { recursive: true })` creates it.                                                                             | Low    | Existing pattern in `asset-sourcer.mjs` main().                                                                    |
| 17  | `apply-media-patch.mjs`: patch file not found                    | Error message + exit(1).                                                                                                            | Low    | `existsSync` check before parsing.                                                                                 |
| 18  | `apply-media-patch.mjs`: patch file is invalid JSON              | Error message + exit(1).                                                                                                            | Low    | `try/catch` around `JSON.parse`.                                                                                   |
| 19  | `apply-media-patch.mjs`: patch entry with `status: "unassigned"` | Skipped in output (only assigned patches formatted).                                                                                | Low    | Filter by `status === "assigned"` or presence of `sceneId`.                                                        |
| 20  | `MediaBackground.tsx`: `media.mode = "fullscreen"`               | `overlay = 0` (existing). `videoVolume` still calculated from `media.volume ?? 0.08`. Volume independent of mode.                   | Low    | Volume and overlay are orthogonal.                                                                                 |

## 5. Implementation Plan

### Ticket 1: §4.6 Per-scene volume + envelope ducking

**Files**: `types.ts`, `MediaBackground.tsx`, `media-bg.mjs`, `media-bg.test.mjs`

**Changes**:

1. `types.ts`: Add `volume?: number` to `MediaField`
2. `MediaBackground.tsx`:
   - `const baseVolume = media.volume ?? 0.08;`
   - `const videoVolume = baseVolume * opacity;` (after opacity is computed)
   - `<Video src={src} style={mediaStyle} volume={videoVolume} />`
3. `media-bg.mjs` `validateMedia()`: Add volume range check
4. `media-bg.test.mjs`: Add test cases for scenarios #1-6

### Ticket 2: §4.4 `assignAssetsToScenes()` + `media-patch.json`

**Files**: `asset-sourcer.mjs`, `asset-sourcer.test.mjs`

**Changes**:

1. `assignAssetsToScenes(assets, scenes)`: Batch greedy matching
   - Input: assets array (sorted by score desc), scenes array
   - Output: `{ sceneId, media: { type, path, source, animation, overlay, volume? }, assetScore, source, attribution, status }[]`
   - Volume recommendation: narrative+video→0.10, quote+video→0.04, info-card→0.08, image→omit
2. `main()`: After attribution building, call `assignAssetsToScenes()`, write `media-patch.json`
3. `asset-sourcer.test.mjs`: Add test cases for scenarios #9-16

### Ticket 3: `apply-media-patch.mjs` script

**Files**: `scripts/short-video/apply-media-patch.mjs` (new)

**Changes**:

1. Read `output/media-patch.json`
2. Filter assigned patches
3. Format each as copy-paste-ready code block:
   ```
   // Scene 2 (narrative) — score: 85, source: youtube
   media: {
     type: "video",
     path: "assets/youtube-unitree-01.mp4",
     source: "Unitree Robotics",
     animation: "zoom",
     overlay: 0.7,
     volume: 0.10,
   },
   ```
4. Output to stdout
5. Test cases for scenarios #17-19

## 6. Cross-Step Interface Contract

### `MediaField` (types.ts) — consumed by:

| Consumer                         | How                                    | Impact of `volume` addition |
| -------------------------------- | -------------------------------------- | --------------------------- |
| `MediaBackground.tsx`            | `media.volume ?? 0.08` → `videoVolume` | Direct consumption          |
| `FullscreenMedia.tsx`            | Passes `media` to `MediaBackground`    | Indirect (inherits)         |
| `NarrativeScene.tsx`             | Passes `media` to `MediaBackground`    | Indirect (inherits)         |
| `InfoCardScene.tsx`              | Passes `media` to `MediaBackground`    | Indirect (inherits)         |
| `media-bg.mjs` `validateMedia()` | Reads `media.volume` for range check   | Validation only             |
| `verify-video.mjs`               | Calls `validateMedia()`                | Indirect (inherits)         |
| `asset-sourcer.mjs`              | Generates `media.volume` in patch      | Production side             |

### `media-patch.json` — produced by `asset-sourcer.mjs`, consumed by `apply-media-patch.mjs`

```json
[
  {
    "sceneId": 2,
    "sceneName": "ipo-details",
    "visualType": "narrative",
    "media": {
      "type": "video",
      "path": "assets/youtube-unitree-01.mp4",
      "source": "Unitree Robotics",
      "animation": "zoom",
      "overlay": 0.7,
      "volume": 0.1
    },
    "assetScore": 85,
    "source": "youtube",
    "attribution": { "text": "...", "source": "youtube", "license": "...", "logoRequired": false },
    "status": "assigned"
  }
]
```

### `assignAssetsToScenes` — internal to `asset-sourcer.mjs`

```
Input:  (assets: Asset[], scenes: Scene[])
Output: PatchEntry[] where PatchEntry = { sceneId, sceneName, visualType, media, assetScore, source, attribution, status }
```

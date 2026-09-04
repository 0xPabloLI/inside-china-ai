# Spec: Fix Scene Flicker (Double Fade)

## Context

Almost every scene transition in generated videos has a visible "flicker" / "blink to black" effect. Root cause: `MediaBackground` component fades its media opacity to 0 at scene end (`[0, inFrames, outStart, totalFrames] → [0, 1, 1, 0]`), while `ShortVideo`'s `TransitionSeries` applies `fade()` at scene boundaries. The `fade()` presentation only fades the entering scene in (opacity 0→1); it does not fade the exiting scene out unless `shouldFadeOutExitingScene: true` is passed. Therefore the exiting media layer's own opacity ramp to 0 creates a "blink to transparent" before the transition — the primary visual artifact.

Review reference: `docs/reviews/handoff-fix-scene-flicker-review-2026-08-26.md`.

## Scope

**Single file**: `scripts/short-video/remotion/src/components/MediaBackground.tsx`

No changes to `ShortVideo.tsx`, `TRANSITION_FRAMES`, or transition presentations.

## Changes

### 1. Media opacity envelope — remove exit fade

**Before**:

```typescript
const opacity =
  preset === "none"
    ? 1
    : interpolate(frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp);
```

**After**:

```typescript
const opacity =
  preset === "none" ? 1 : interpolate(frame, [0, inFrames, totalFrames], [0, 1, 1], clamp);
```

Rationale: Keep entrance fade (image fades in when scene starts). Remove exit fade (image stays at full opacity until `TransitionSeries` handles the crossfade). The `outStart` variable becomes unused for opacity but remains used by preset-specific transforms.

### 2. Video volume — independent exit fade

**Before**:

```typescript
const videoVolume = baseVolume * opacity;
```

**After**:

```typescript
const videoVolume =
  baseVolume * interpolate(frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp);
```

Rationale: `videoVolume` previously followed `opacity`, which provided a natural audio ducking tail. Removing the media opacity exit fade would cause an abrupt audio cutoff at scene end. This change preserves an independent audio fade-out envelope while the media image stays at full opacity.

### 3. Overlay envelope — no change

The overlay's exit dim (`overlay × 0.3` at scene end) is retained as-is. The overlay is a darkening layer (`rgba(10,10,20, ...)`), not a transparency layer. Dimming the overlay at scene end does not expose the composition background — it slightly lightens the background. This does not cause a "blink to black" artifact.

### 4. Preset-specific transforms — no change

Exit transforms (e.g., `translateY` drift in fade, `translateX` in slide, `scale` in zoom) remain. These are subtle motion effects, not opacity fades, and do not cause the flicker artifact. The `outStart` variable is kept for these transforms.

### 5. Header comment update

Update the JSDoc comment block to reflect that exit opacity is removed:

- "Exit: opacity 1→0 with slight upward drift (all presets)" → "Exit: no opacity ramp (TransitionSeries handles crossfade); subtle motion drift retained for some presets"

## Scenario & Risk Verification

### Modified Files Impact

| File                                                              | Section                  | Change                                                                                                          | Affected Consumers                                                     |
| ----------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/short-video/remotion/src/components/MediaBackground.tsx` | Media opacity (line ~75) | Remove exit opacity ramp: `[0, inFrames, totalFrames] → [0, 1, 1]`                                              | HookScene, NarrativeScene (3 variants), InfoCardScene, FullscreenMedia |
| Same file                                                         | Video volume (line ~117) | Independent exit fade for audio: `baseVolume * interpolate([0, inFrames, outStart, totalFrames], [0, 1, 1, 0])` | All video-backed scenes (any scene type with `media.type === "video"`) |
| Same file                                                         | JSDoc header             | Comment update                                                                                                  | Documentation only                                                     |

### Behavioral Scenarios

| #   | Scenario                     | Setup                                                                         | Expected Result                                                                                   | Risk Addressed                                                 |
| --- | ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| S1  | Narrative → narrative        | Two image-backed narrative scenes, default `fade` preset, `fade()` transition | No blink-to-black at boundary; outgoing image stays at opacity 1 until TransitionSeries crossfade | Primary defect regression                                      |
| S2  | Hook → narrative             | Media-backed hook → narrative                                                 | `slide({direction: "from-right"})` remains intact, no black frame                                 | HookScene also uses MediaBackground                            |
| S3  | Narrative → data/stat-reveal | Media-backed narrative beside data/stat-reveal                                | `wipe()` transition keeps emphasis, no unexpected brightness dip                                  | Global component change must not regress special transitions   |
| S4  | Final content → CTA          | Media-backed content → CTA                                                    | `slide({direction: "from-bottom"})` remains perceptually continuous                               | CTA has no MediaBackground; boundary is structurally different |
| S5  | Fullscreen media             | `media.mode === "fullscreen"`, image and video variants                       | Media stable through boundary; overlay stays 0                                                    | Fullscreen is separate consumer with different overlay config  |
| S6  | Animation presets            | `fade`, `ken-burns`, `slide`, `zoom`, `none`                                  | Only exit opacity behavior changes; `none` stays static at opacity 1; other transforms remain     | Preset-specific timing and transforms                          |
| S7  | Video-source audio           | Video-backed scene with `media.volume > 0`                                    | Audio tail fade-out is preserved (independent from media opacity)                                 | Volume previously followed media opacity                       |
| S8  | Short scenes                 | Duration ≤ 2× entrance/exit timing                                            | Interpolation stable, no timing inversion or flash                                                | `inFrames`/`outFrames` clamped to `duration/2`                 |
| S9  | Overlay tail                 | Non-fullscreen scene with `overlay > 0`                                       | Overlay exit dim (`overlay×0.3`) remains; no new artifact                                         | Overlay has independent envelope                               |

### Test Coverage

Each scenario row above becomes a test case:

- S1–S6: Source-level assertion tests (verify opacity envelope shape in source code)
- S7: Source-level assertion test (verify `videoVolume` has independent exit fade)
- S8: Logic test (verify clamping behavior with short durations)
- S9: Source-level assertion test (verify overlay envelope unchanged)

## Acceptance Criteria

1. Media opacity envelope has 3 keyframe stops (entrance only, no exit ramp) for all presets except `none`
2. `none` preset still has constant opacity 1
3. Video volume has independent 4-stop envelope with exit fade-out
4. Overlay envelope is unchanged (4-stop with exit dim)
5. All preset-specific transforms remain unchanged
6. `outStart` variable still computed (used by transforms and video volume)
7. All existing tests pass
8. New tests cover all 9 scenario rows

## Deferred (Not Part of This Fix)

- Changing `getTransition()` default from `fade()` to `none()` — separate visual-design decision
- Reducing `TRANSITION_FRAMES` — global constant affecting all transition types
- Fixing stale "6-frame fade" comment in `ShortVideo.tsx` — non-blocking cleanup

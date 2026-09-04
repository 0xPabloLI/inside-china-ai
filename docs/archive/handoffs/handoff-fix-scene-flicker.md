# Handoff: Fix Scene Flicker (Double Fade)

## Problem

Almost every scene transition in the generated video has a visible "flicker" or "blink" effect. The root cause is **double fade** — two independent fade animations overlapping at scene boundaries:

1. **MediaBackground layer** (`remotion/src/components/MediaBackground.tsx` line 75): All animation presets (including `ken-burns`) have opacity that starts at 0 and fades in over ~1s (`inFrames`), then fades out from 1→0 over ~0.6s at the end (`outFrames`). This means **every scene's background image fades out at the end of the scene**.

2. **TransitionSeries layer** (`remotion/src/ShortVideo.tsx` line 89): Scene-to-scene transitions use `fade()` by default (the `getTransition()` function returns `fade()` for narrative→narrative, which is the majority of scene transitions).

**Combined effect**: At each scene boundary, the current scene's image fades out (MediaBackground exit) → TransitionSeries fade transition (double fade) → next scene's image fades in (MediaBackground entrance). This creates a visible "blink to black" effect.

## Files to Modify

| File                                          | Section                        | Change                                                                                                                     |
| --------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `remotion/src/components/MediaBackground.tsx` | Line 75, opacity interpolation | Change exit fade: `[0, 1, 1, 1]` instead of `[0, 1, 1, 0]` — remove exit opacity ramp                                      |
| `remotion/src/ShortVideo.tsx`                 | Lines 65-90, `getTransition()` | Consider changing default from `fade()` to `none` for narrative→narrative, or keep `fade()` but reduce `TRANSITION_FRAMES` |

## Recommended Fix

### Option A (Recommended): Remove MediaBackground exit fade

Change line 75 of `MediaBackground.tsx`:

```typescript
// Before:
const opacity = interpolate(frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp);

// After:
const opacity = interpolate(frame, [0, inFrames, totalFrames], [0, 1, 1], clamp);
```

This keeps the entrance fade (image fades in when scene starts) but removes the exit fade (image stays at full opacity until TransitionSeries handles the crossfade). The TransitionSeries `fade()` transition will handle the smooth crossfade between scenes.

### Option B (Alternative): Change default transition to `none`

Change line 89 of `ShortVideo.tsx`:

```typescript
// Before:
return fade();

// After: Hard cut for narrative→narrative
return undefined; // or a very short slide
```

This removes the TransitionSeries fade, so only MediaBackground's entrance/exit animation is visible. But this may feel too abrupt.

### Option C (Best): Both

1. Remove MediaBackground exit fade (Option A)
2. Change narrative→narrative default transition to a very short `slide({ direction: "from-right" })` or keep `fade()` with reduced `TRANSITION_FRAMES` (e.g., 5 frames = 0.17s instead of 10 frames = 0.33s)

## Testing

1. After fix, render a test video with multiple narrative scenes
2. Verify: no "blink to black" between narrative scenes
3. Verify: hook→narrative slide still works (different transition type)
4. Verify: last scene→CTA slide still works

## Suggested Skills

- `remotion-markup` — for Remotion API best practices
- `impeccable` — for visual quality review after fix

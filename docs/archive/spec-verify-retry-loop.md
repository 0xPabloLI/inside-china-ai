# Spec: Pipeline Verify-Retry Loop

> Source: `docs/handoffs/handoff-verify-retry-loop.md` + grilling session (2026-08-17)
> Status: Ready for tickets

## Problem Statement

The short-video pipeline (`main.mjs` Step 6) does single-shot subtitle verification. When `verifySubtitles()` reports `summary.passed === false`, the pipeline exits immediately with `exit(1)`, leaving a human to diagnose and re-run. The specific trigger was `sensetime-latest` rendering with ~200ms/scene cumulative audio drift (TransitionSeries 6-frame overlap), but the feature addresses the general case: any mechanically fixable verification failure should get automatic retry attempts before giving up.

## Solution

A verify-retry loop wraps Step 6: on FAIL, classify the failure, attempt the appropriate repair, re-verify. Up to N retries (default 2, configurable via `--max-retries`). Only accept repairs that strictly reduce `summary.errors`; otherwise roll back to the best-known state. If all retries are exhausted, fall through to the existing `exit(1)` + diagnostics bundle behavior.

Additionally, a pre-requisite bug fix: Remotion's `TransitionSeries` uses 6-frame fade transitions that shift audio onset ~200ms/scene. Audio `<Audio>` elements must be moved out of `TransitionSeries.Sequence` and placed with independent `<Sequence>` offsets matching `sceneTimeline()`.

## User Stories

1. As a video producer, I want the pipeline to automatically retry subtitle verification failures, so that transient alignment issues are self-healed without manual intervention.
2. As a video producer, I want audio-sync drift to be automatically compensated in subtitles, so that subtitles match what viewers actually hear.
3. As a video producer, I want the pipeline to stop after bounded retries, so that an infinite loop doesn't burn TTS credits or CPU time.
4. As a video producer, I want `--max-retries N` to control retry count, so that I can debug with `--max-retries 0` (single-shot) or `--max-retries 5` (deep retry).
5. As a video producer, I want the diagnostics bundle on final FAIL, so that I can investigate the root cause when auto-repair can't fix it.
6. As a video producer, I want each retry attempt logged with failure category and repair action, so that I can trace what was attempted.
7. As a video producer, I want the Remotion audio placement fixed, so that audio onsets match the timeline from the start (reducing the need for retry).
8. As a video producer, I want subtitle alignment re-run when alignment data is missing or incomplete, so that dropped words are recovered automatically.
9. As a video producer, I want cue gaps repaired with relaxed parameters, so that blink-band violations are auto-corrected.
10. As a video producer, I want retry to check file pre-conditions before attempting repair, so that a missing audio file doesn't crash the retry loop.
11. As a video producer, I want subtitles re-burned from the presubs/raw video version after repair, so that old burned subtitles don't persist under new ones.
12. As a video producer, I want `--skip-verify` to skip the entire loop, so that fast iteration is possible during development.

## Implementation Decisions

### Module: `lib/verify-retry.mjs` (new file)

A new module that encapsulates the retry loop, failure classification, and repair dispatch. `main.mjs` Step 6 calls a single `verifyWithRetry()` function instead of `verifySubtitles()` directly.

**Exports:**

- `classifyFailure(report)` → returns a failure category string (`"subtitle-alignment"`, `"audio-sync-drift"`, `"cue-gaps"`, `"audio-sync-skipped"`, `"unknown"`) or `null` when the report passes.
- `verifyWithRetry(options)` → runs `verifySubtitles()`, classifies on FAIL, dispatches repair, re-verifies. Returns the final report.

**`classifyFailure` priority:** Check categories in order — first match wins. The classifier inspects the report's `wordSequence`, `audioSync`, `gaps` fields. If multiple categories fail simultaneously, the one with the most errors is chosen; ties broken by priority order (audio-sync-drift > subtitle-alignment > cue-gaps).

### Repair Actions

Each repair action is a function that takes the current pipeline state and returns `{ success: boolean, repairedPaths: { assPath?, videoPath? } }`. The loop replaces the corresponding paths in the verify call on re-verify.

**Subtitle alignment repair:**

1. Check `outputDir/audio/scene-{id}.wav` (or `.mp3`) files exist for all scenes.
2. Re-run `runWhisperAlignment()` with existing TTS results.
3. Call `regenerateSubtitles()` to rebuild `.ass` from new timing data.
4. Re-burn subtitles from `*-presubs.mp4` (or `*-raw.mp4` for Remotion) to a new `finalPath`.

**Audio-sync drift repair:**

1. Extract per-scene drift values from `report.audioSync.scenes` (the `drift` field for each non-OK scene).
2. Compute a corrected offset for each scene: `correctedOffset = timeline.offset + drift`.
3. Re-run `buildCues()` with the existing timing data.
4. Post-process cues: for each cue, find its scene, apply the scene's drift correction to `start`, `end`, and all `word.onset` timestamps.
5. `renderAss()` the corrected cues.
6. Re-burn subtitles from `*-presubs.mp4` (or `*-raw.mp4`).

**Cue gap repair:**

1. Re-run `buildCues()` — the gap rules are deterministic, so this alone won't help. Instead, relax: increase `GAP_THRESHOLD` by 0.1s (max 3 relaxations before giving up), and lower `CHAIN_GAP_FRAMES` to 1.
2. `renderAss()` + re-burn.

**Rollback:** If a repair produces a report with `summary.errors >= previousErrors`, discard the repaired artifacts and restore the pre-repair state (keep the old `assPath` and `videoPath`). The retry counter still increments.

### CLI: `--max-retries N`

New CLI flag in `main.mjs`. Default: 2. `--max-retries 0` = single-shot (current behavior). Parsed with existing `getArg()` pattern.

### Remotion Audio Placement Fix (pre-requisite ticket)

`ShortVideo.tsx`: Move `<Audio>` elements out of `<TransitionSeries.Sequence>` into top-level `<Sequence from={offsetInFrames}>` wrappers. The `offsetInFrames` for each scene is computed from `sceneTimeline()` (cumulative `sceneClipFrames`). This decouples visual transitions (fade overlap) from audio onset (frame-precise offset). Visual fade transitions remain via `TransitionSeries`; audio is placed independently.

### Loop Structure

```
attempt 0: verifySubtitles() → PASS? done. FAIL? classify.
  for i in 1..maxRetries:
    dispatch repair(classification, state)
    re-verify → PASS? done.
    errors decreased? keep repaired state.
    else? rollback to pre-repair state.
    re-classify (may be different after repair)
  final FAIL → exit(1) + diagnostics
```

### Logging

Each retry attempt logs:

- Attempt number / max
- Failure category detected
- Repair action dispatched
- Result: errors before → errors after (accepted/rolled back)

### Existing behavior preserved

- `--skip-verify` → no loop, no verification.
- No subtitles generated → no loop.
- Diagnostics bundle written on final FAIL.
- `verifySubtitles()` interface unchanged (called by the loop, not by main.mjs directly).

## Testing Decisions

### Test seams

1. **`classifyFailure(report)`** — pure function, mock reports. Highest seam; tests the classifier without any I/O.
2. **`verifyWithRetry(options)`** — integration with mocked `verifySubtitles` (injectable) and mocked repair actions. Tests the loop logic: retry count, rollback, acceptance criteria.
3. **Audio-sync drift compensation** — pure function `applyDriftCorrection(cues, driftMap)` that shifts cue timestamps. Tested in isolation.
4. **Cue gap relaxation** — pure function `relaxGapParams(attempt)` returning relaxed constants. Tested in isolation.
5. **Remotion audio fix** — integration test verifying that `<Audio>` elements use `<Sequence from={...}>` offsets (React component test).

### Prior art

- `__tests__/verify-subtitles.test.mjs` — mock report patterns, `buildReport()` usage
- `__tests__/audio-sync.test.mjs` — `evaluateAudioSync()` mock measurements
- `__tests__/audio-diagnostics.test.mjs` — diagnostics bundle structure

### Test philosophy

External behavior only. The loop's observable outputs are: (1) the final report, (2) whether it exited or passed, (3) log output. Internal state (which repair was attempted, whether rollback happened) is tested via injectable mocks, not by asserting on private variables.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                              | Modification                                                                                               | Risk   | Assessment                                                                                                                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/main.mjs`                    | Step 6: replace direct `verifySubtitles()` call with `verifyWithRetry()`. Add `--max-retries` arg parsing. | Medium | Changes the critical verify gate. Risk mitigated: `--max-retries 0` preserves exact current behavior. `verifyWithRetry()` delegates to existing `verifySubtitles()` internally.                                                 |
| `scripts/short-video/remotion/src/ShortVideo.tsx` | Move `<Audio>` out of `TransitionSeries.Sequence` into `<Sequence from={...}>`.                            | Medium | Changes audio placement in all Remotion-rendered videos. Risk mitigated: audio offsets now match `sceneTimeline()` (the same module subtitle generation uses), eliminating the 200ms/scene drift. Visual transitions unchanged. |
| `scripts/short-video/lib/verify-subtitles.mjs`    | No changes — called by the loop as-is.                                                                     | Low    | Untouched. The loop calls it and reads its report.                                                                                                                                                                              |
| `scripts/short-video/lib/timeline.mjs`            | No changes.                                                                                                | Low    | Untouched. Audio fix uses existing `sceneTimeline()`.                                                                                                                                                                           |
| `scripts/short-video/lib/subtitles/generate.mjs`  | No changes — `regenerateSubtitles()` already exists and is called by the loop.                             | Low    | Untouched.                                                                                                                                                                                                                      |
| `scripts/short-video/lib/audio/sync.mjs`          | No changes — `verifyAudioSync()` called by `verifySubtitles()` as-is.                                      | Low    | Untouched. Drift values read from its report.                                                                                                                                                                                   |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                                           | Expected Behavior                                                                                                                                                                       | Risk   | Mitigation                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Verify PASS on first attempt                                                       | No retry, return report immediately. No repair attempted.                                                                                                                               | None   | Direct path, simplest case.                                                                                                                                                                            |
| 2   | Audio-sync drift FAIL, retry compensates subtitles, re-verify PASS                 | Drift values extracted, cues offset-corrected, subtitles re-burned, re-verify passes.                                                                                                   | Medium | Compensation is data-driven from measured drift. If drift is uniform (TransitionSeries bug), one correction fixes all. If non-uniform, may need 2nd retry.                                             |
| 3   | Audio-sync drift FAIL, retry compensates, re-verify still FAIL (drift non-uniform) | 2nd retry uses updated drift measurements from re-verify. If still FAIL after max retries, exit(1) + diagnostics.                                                                       | Medium | Each retry uses fresh measurements, not stale ones. If drift is too large or non-monotonic, the loop exhausts and fails safely.                                                                        |
| 4   | Subtitle alignment FAIL (missing words), retry re-runs alignment, re-verify PASS   | `runWhisperAlignment()` regenerates timing data, `regenerateSubtitles()` rebuilds .ass, re-burn, pass.                                                                                  | Low    | Alignment is deterministic for the same audio. If it failed once, retry may help if the failure was transient (file lock, incomplete write). If deterministic, 2nd retry won't help and loop exhausts. |
| 5   | Cue gap violations FAIL, retry relaxes params, re-verify PASS                      | `GAP_THRESHOLD` increased, `CHAIN_GAP_FRAMES` reduced, cues regenerated, re-burn, pass.                                                                                                 | Low    | Relaxation is bounded (max 3 steps). Can't infinite-loop.                                                                                                                                              |
| 6   | Multiple failure categories FAIL simultaneously                                    | Classifier picks the category with most errors. Repair targets that category. Other categories may remain. Loop continues if errors decreased.                                          | Medium | Priority order ensures the most impactful repair is attempted first. If repair introduces a new category, the "strict decrease" rule prevents acceptance.                                              |
| 7   | Repair introduces new failure (errors not strictly decreased)                      | Repair result discarded, pre-repair state restored, retry counter increments. Next retry (if any) re-classifies.                                                                        | Medium | Rollback ensures no regression. Best-known state preserved.                                                                                                                                            |
| 8   | Repair action crashes (e.g., ffprobe fails, file missing)                          | Repair action catches error, returns `{ success: false }`. Loop logs the failure, treats as non-decreasing, continues.                                                                  | Low    | All repair actions are wrapped in try/catch. No crash propagates to the loop.                                                                                                                          |
| 9   | `--max-retries 0`                                                                  | Single-shot verify. FAIL → exit(1). Identical to current behavior.                                                                                                                      | None   | Feature flag preserves backward compatibility.                                                                                                                                                         |
| 10  | `--skip-verify`                                                                    | No verification, no loop. Pipeline proceeds to success output.                                                                                                                          | None   | Existing behavior unchanged.                                                                                                                                                                           |
| 11  | No subtitles generated (no timing data)                                            | No loop. Pipeline proceeds.                                                                                                                                                             | None   | Existing behavior unchanged.                                                                                                                                                                           |
| 12  | Presubs/raw video file missing for re-burn                                         | Repair action returns `{ success: false, reason: "presubs file not found" }`. Loop skips this repair, re-classifies, may try a different category. If no other category, loop exhausts. | Low    | File existence checked before attempting re-burn.                                                                                                                                                      |
| 13  | Audio-sync all scenes skipped (TTS format mismatch)                                | Classifier returns `"audio-sync-skipped"`. No repair attempted (not retry-fixable). Loop logs warning, does not retry this category. If no other categories, exit(1).                   | Low    | Handled by the `resolveSceneAudio()` fix from previous session. If still occurring, it's a config issue, not a retry-fixable one.                                                                      |
| 14  | Remotion path: audio drift after TransitionSeries fix                              | Verify may still report drift for other reasons (codec variance). Retry loop's drift compensation applies to both paths.                                                                | Low    | Drift compensation is renderer-agnostic — it reads measured values and adjusts subtitles.                                                                                                              |
| 15  | Playwright path: no presubs file (assembleVideo doesn't create one)                | Playwright path's `assembleVideo()` renames `finalPath` → `*-presubs.mp4` before burning. If the pipeline was interrupted, presubs may exist. If not, repair fails gracefully.          | Low    | File existence checked. If missing, the repair action can re-run `assembleVideo()` to regenerate the presubs version.                                                                                  |
| 16  | `--max-retries 5` with persistent failure                                          | 5 repair attempts, each using fresh verify data. After 5, exit(1) + diagnostics.                                                                                                        | None   | Bounded by CLI flag. No infinite loop.                                                                                                                                                                 |
| 17  | Empty report fields (null audioSync, null gaps)                                    | Classifier handles null/undefined gracefully, returns "unknown" or skips the category.                                                                                                  | Low    | Null-checks in classifier. Prior art: `buildReport()` already handles empty inputs.                                                                                                                    |
| 18  | Zero-duration scene in drift compensation                                          | `sceneClipDuration(0)` = `SCENE_BUFFER` frames. Cue offset adjustment handles 0-duration gracefully (no division, only addition).                                                       | Low    | Drift compensation is additive, not divisive.                                                                                                                                                          |
| 19  | Cross-step contract: verify-retry output → main.mjs final output                   | `verifyWithRetry()` returns `{ report, videoPath, assPath }`. main.mjs uses `result.path` for output logging. If repair changed the video file (re-burn), the returned path must match. | Medium | Repair actions update `videoPath` in the loop state. main.mjs receives the final path. Contract: the returned `videoPath` is always the canonical final video path.                                    |

## Out of Scope

- Re-running TTS generation as a repair action (expensive, non-deterministic — explicitly excluded by handoff constraints).
- Fixing the TransitionSeries 6-frame overlap in the timeline module itself (the audio placement fix is in Remotion's React component, not in `timeline.mjs`).
- Modifying `verifySubtitles()` internals — it remains a pure function called by the loop.
- Parallel/chained repair attempts (the loop is strictly sequential).
- Retry of Remotion render (`npx remotion render`) — too expensive and non-deterministic.

## Further Notes

- The Remotion audio placement fix (moving `<Audio>` to `<Sequence from={...}>`) is a pre-requisite ticket. The verify-retry loop's drift compensation is a second line of defense — it should rarely need to fire after the fix is in place.
- The loop is designed for the Playwright path too, but the Playwright path uses `buildVoiceoverTrack()` (gapless master track), so audio drift is structurally impossible there. The loop still works for subtitle alignment and cue gap failures on both paths.
- The `--max-retries` flag is additive: `--max-retries 0` = current behavior, `--max-retries 2` (default) = new behavior.

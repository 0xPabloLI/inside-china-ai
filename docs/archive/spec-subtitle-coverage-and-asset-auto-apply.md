# Spec: Subtitle 100% Coverage + Asset-Sourcer Auto-Apply

## Problem Statement

Two pipeline bugs cause repeated quality issues:

1. **Subtitle coverage gaps**: Video subtitles don't reach 100% timeline coverage. Scene-transition silence gaps (typically 1–2s) leave stretches of video with no subtitle on screen. The pipeline reports this as a WARNING but doesn't FAIL, so it ships with gaps.

2. **Asset-sourcer results never applied**: `main.mjs` Step 1.5 triggers `asset-sourcer.mjs` which searches, downloads, and generates `media-patch.json` with scene assignments — but `main.mjs` never reads or applies the patch. The patch file sits unused while scenes render with CSS-only backgrounds.

## Solution

### Fix A: Subtitle 100% Coverage (Hard Gate)

Raise `HOLD_OUT_GAP_THRESHOLD` from 0.6s to 2.0s in `lib/subtitles/cues.mjs`. This makes `holdOutExtension` fill all inter-cue gaps up to 2.0s — covering scene-transition silence. The last cue's text stays on screen during silence (no flicker, no blank).

Make 100% coverage a **hard gate** in `lib/verify-subtitles.mjs`: `coverage.gaps.length > 0` increments `errors` (not `warnings`). Exception: trailing gap < 1.0s at video end (CTA scene, subtitles may end before video).

### Fix B: Asset-Sourcer Auto-Apply (Inline in main.mjs)

After `asset-sourcer.mjs` completes in Step 1.5, read `output/<contentDir>/media-patch.json` and apply assigned patches to the in-memory `scenes` array. Only apply to scenes where `!scene.media` (don't overwrite existing media). Don't write back to `scene-data.mjs` file — memory-only mutation. Print a summary of applied patches.

## User Stories

1. As a video creator, I want subtitles to cover 100% of video timeline, so that viewers always see text on screen even during brief silences.
2. As a video creator, I want the pipeline to FAIL when subtitle coverage is below 100%, so that gaps are caught before publishing.
3. As a video creator, I want asset-sourcer's media assignments to be automatically applied to my scenes, so that I don't have to manually run a separate tool.
4. As a video creator, I want existing media declarations in scene-data to be preserved, so that manual curation isn't overwritten by auto-sourced assets.
5. As a video creator, I want the pipeline to continue gracefully when no assets are found, so that a CSS-only fallback video still renders.
6. As a pipeline maintainer, I want `holdOutExtension` tested for large gaps (1–2s), so that regressions in coverage are caught by tests.
7. As a pipeline maintainer, I want `analyzeCoverage` tested with the 100% gate, so that coverage failures are caught by tests.

## Implementation Decisions

### Fix A: Subtitle Coverage

- **`lib/subtitles/cues.mjs`**: Change `HOLD_OUT_GAP_THRESHOLD` from `0.6` to `2.0`. This is the only code change for the fill logic — `holdOutExtension` already extends the earlier cue's end to the next cue's start minus `CHAIN_GAP`. The threshold just determines which gaps get filled.
- **`lib/verify-subtitles.mjs`**: In `buildReport()`, move `coverage.gaps.length` from `warnings` to `errors`. Add a trailing-gap exception: if the only gap is at video end and < 2.0s, keep as warning (CTA scene may have visuals after voiceover ends, holdOutExtension can't fill trailing gaps).
- **No new modules** — both are constant/logic changes to existing functions.

### Fix B: Asset-Sourcer Auto-Apply

- **`main.mjs`**: After Step 1.5 `asset-sourcer` block, add Step 1.5c: read `output/<contentDir>/media-patch.json`, parse, filter `status === "assigned"` with `media.path`, apply to `scenes` array in memory (`scene.media = patch.media` if `!scene.media`). Print summary: "Applied N media assignments to scenes X, Y, Z."
- **No changes to `asset-sourcer.mjs`** — it already generates the patch correctly.
- **No changes to `apply-media-patch.mjs`** — it remains a standalone tool for human review.
- **`media-patch.json` path**: `output/<contentDir>/media-patch.json` (already the output location of asset-sourcer).

### Cross-Step Interface Contract

`media-patch.json` entries (produced by `asset-sourcer.mjs`):
```
{ sceneId: number, sceneName: string, visualType: string,
  media: { type, path, source?, animation, overlay, fit?, volume? },
  assetScore: number, source: string, attribution: Object,
  status: "assigned" | "unassigned" }
```

`main.mjs` consumes: `patch.media.path` is relative to contentDir. `main.mjs` uses `resolve(contentDirAbs, patch.media.path)` to verify file exists before applying.

## Testing Decisions

- **Fix A tests** in `__tests__/subtitle-cues.test.mjs`: Test `buildCues` output with a 1.5s inter-cue gap → verify the gap is filled (earlier cue's end extended). Test with a 2.5s gap → verify it's NOT filled (above threshold).
- **Fix A tests** in `__tests__/verify-subtitles.test.mjs`: Test `buildReport` with coverage gaps → verify `errors > 0` (not just warnings). Test with no gaps → verify `errors === 0`. Test trailing gap < 1.0s → verify it's a warning, not error.
- **Fix B tests**: No new test file needed. The logic is inline in `main.mjs` and covered by integration: if `media-patch.json` exists with assigned entries, scenes get media. Test via existing `asset-sourcer.test.mjs` patterns — verify `assignAssetsToScenes` output can be consumed by the apply logic.
- **Prior art**: `subtitle-cues.test.mjs` already tests `buildCues` with `measureWidth`. `verify-subtitles.test.mjs` already tests `analyzeCoverage`. Both are the highest existing seams.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `lib/subtitles/cues.mjs` | `HOLD_OUT_GAP_THRESHOLD` 0.6 → 2.0 | Medium | Changes subtitle timing for all videos. Existing tests don't cover holdOutExtension directly — new tests required. |
| `lib/verify-subtitles.mjs` | coverage gaps: warnings → errors | Medium | Changes pipeline pass/fail behavior. Could cause previously passing videos to fail. Mitigated: fix A ensures gaps are filled, so coverage should be 100%. |
| `main.mjs` | Add Step 1.5c: apply media-patch to scenes | Low | Pure addition — new code block after existing Step 1.5. Doesn't modify existing logic. |
| `__tests__/subtitle-cues.test.mjs` | New holdOutExtension gap tests | Low | Pure addition. |
| `__tests__/verify-subtitles.test.mjs` | New coverage gate tests | Low | Pure addition. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Inter-cue gap 1.5s (scene transition silence) | holdOutExtension fills gap: earlier cue end → next cue start - CHAIN_GAP | Coverage gap was 1.56s in doubao-work | Threshold raised to 2.0s |
| 2 | Inter-cue gap 2.5s (long silence, e.g. music intro) | holdOutExtension does NOT fill gap | Over-filling would show stale text too long | 2.0s threshold caps fill range |
| 3 | Inter-cue gap 0.3s (normal) | holdOutExtension fills (existing behavior unchanged) | None | Already covered by existing logic |
| 4 | Coverage 100% (no gaps) | buildReport: errors=0, passed=true | None | Happy path |
| 5 | Coverage 97.9% (1.56s gap, pre-fix) | buildReport: errors=1, passed=false | Pipeline fails until Fix A applied | Fix A raises threshold so gap is filled |
| 6 | Trailing gap 0.5s at video end | buildReport: warning (not error) | CTA scene ends before video | Exception: trailing < 1.0s = warning |
| 7 | Trailing gap 1.5s at video end | buildReport: error | Real coverage issue | Must FAIL |
| 8 | media-patch.json has 8 assigned entries | Step 1.5c applies 8 media to scenes, prints summary | None | Happy path |
| 9 | media-patch.json has 0 assigned, 10 unassigned | Step 1.5c prints WARNING, continues with CSS fallback | Same as current behavior | Graceful degradation |
| 10 | media-patch.json does not exist | Step 1.5c skips silently | None | asset-sourcer wasn't triggered |
| 11 | Scene already has media.path declared | Step 1.5c skips that scene | Manual curation preserved | `if (!scene.media)` guard |
| 12 | Scene has media.path but file missing | Step 1.5 tries asset-sourcer → patch generated → Step 1.5c applies | Full round-trip | Existing Step 1.5 logic + new 1.5c |
| 13 | Empty cues array | holdOutExtension returns [], coverage=0% → error | Edge case | `holdOutExtension` already handles: `if (cues.length < 2) return cues` |
| 14 | Single cue spanning entire video | coverage=100%, no gaps | Edge case | Happy path |
| 15 | patch.media.path is absolute path | Step 1.5c normalizes to relative | Path traversal risk | `normalizePathForPatch` already used by asset-sourcer |

## Out of Scope

- Changing TTS generation to reduce scene-transition silence (root cause of gaps, but TTS optimization is separate).
- Auto-generating `media` fields in scene-data when none are declared (scene-data authoring is manual).
- Modifying `asset-sourcer.mjs` internals (it already works correctly).
- Modifying `apply-media-patch.mjs` (standalone human-review tool, unchanged).
- Subtitle styling/positioning changes (only timing/coverage).

## Further Notes

- The 2.0s threshold for `HOLD_OUT_GAP_THRESHOLD` is chosen because: (1) scene-transition silence in F5-TTS output is typically 1–2s; (2) TikTok viewers tolerate up to ~2s of held text; (3) beyond 2s is likely a real silence (music intro, dramatic pause) where clearing is preferred.
- The trailing-gap exception (1.0s) is chosen because: (1) CTA scenes may have shorter voiceover than scene duration; (2) 1.0s < 1.0s `COVERAGE_GAP_THRESHOLD` would already not report — but we're lowering the threshold too, so we need the explicit exception.

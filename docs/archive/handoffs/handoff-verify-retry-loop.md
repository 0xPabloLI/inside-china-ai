# Handoff: Pipeline Verify-Retry Loop (auto-fix on subtitle/audio sync FAIL)

> Created: 2026-08-16
> Previous session: AudioSync file format fix + RMB annotation + hardcoded extension cleanup
> Target: Add automatic retry + repair loop to the short-video pipeline

## Context

The short-video pipeline (`scripts/short-video/main.mjs`) currently does **single-shot verification** in Step 6:

- `verifySubtitles()` runs after video assembly
- If `!report.summary.passed` → `process.exit(1)` — pipeline stops, human must intervene
- If audioSync skipped all scenes → passed silently as `true` (now fixed with a warning, but no retry)

The user wants a **verify-retry loop**: when verification FAILs, the pipeline should automatically attempt to fix the root cause and re-verify, up to a bounded number of retries, before giving up and exiting.

## CONFIRMED: Real audio drift found (2026-08-16 re-render)

After fixing audioSync to actually run (instead of skipping all scenes), re-rendering `sensetime-latest` revealed a **real cumulative drift**:

```
Audio sync: 7 scene(s) measured, 0 skipped, 6 over tolerance
   ✗ scene 2: -157ms (expected 11.97s, measured 11.81s)
   ✗ scene 3: -357ms (expected 20.37s, measured 20.01s)
   ✗ scene 4: -558ms (expected 29.83s, measured 29.28s)
   ✗ scene 5: -757ms (expected 37.87s, measured 37.11s)
   ✗ scene 6: -957ms (expected 46.27s, measured 45.31s)
   ✗ scene 7: -1157ms (expected 53.60s, measured 52.44s)
```

**Pattern**: ~200ms drift per scene, cumulative. This is the exact "字幕到后面跟不上语音" bug the user reported. The pipeline correctly FAILed and refused to ship the video.

**Root cause hypothesis**: The drift is likely in the assembly stage — scene clip durations (frame-aligned) vs actual TTS audio durations have a systematic ~200ms gap per scene. This may be the same class of bug as the previous "timestamp gaps from padding" issue (see `docs/research/audio-drift-fix.md`), or a new variant introduced by the Remotion rendering path.

**Diagnostics bundle**: `scripts/short-video/output/sensetime-latest/diagnostics/2026-08-16T10-59-18-501Z/`

The verify-retry loop should handle this case: on audioSync FAIL, attempt to re-assemble the video (which may resolve frame-alignment rounding), then re-verify.

## What the previous session did

1. **Fixed audioSync silent skip** — `lib/audio/sync.mjs` had hardcoded `scene-{id}.mp3`, but F5-MLX/Qwen3 output `.wav`. Added `resolveSceneAudio()` helper with `.wav`→`.mp3` fallback. Tests cover both formats.
2. **Cleaned up all hardcoded audio extensions** — `verify-remotion-frames.mjs` had the same bug. Fixed. Deleted orphaned `text-align-torchaudio.py`. Updated stale venv references and comments.
3. **Added audioSync skip guard** — `lib/verify-subtitles.mjs` now prints a warning when audioSync skips all scenes (`checked === 0 && skipped > 0`).
4. **RMB→USD dual-annotation** — `content/sensetime-latest/scene-data.mjs` converted to `$X (¥Y)` format. Rule added to `docs/video-workflow.md`.

All committed: `8acaaec`, `ae61baf`, `9b7307b`, `b025001`.

## What the next session should build

### Feature: Verify-Retry Loop

Add a retry loop around Step 6 (subtitle verification) in `main.mjs` that:

1. Runs `verifySubtitles()` as usual
2. If `report.summary.passed === false`:
   a. Inspect the report to determine the failure category
   b. Attempt the appropriate repair
   c. Re-verify
3. Repeat up to N times (default: 2 retries)
4. If still failing after N retries → exit(1) as before

### Failure categories and repair strategies

| Failure                               | Report signal                                          | Repair action                                                                                                                            | Re-run cost                        |
| ------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Subtitle alignment missing/incomplete | `timingData` empty or `wordSequence.matches === false` | Re-run `runWhisperAlignment()` → regenerate `.ass` via `buildCues()`+`renderAss()` → re-burn subtitles                                   | Low (no TTS re-render)             |
| Audio sync drift (>80ms per scene)    | `audioSync.scenes` has `ok: false`                     | Re-run `assembleVideo()` (frame-aligned clip durations may vary on re-encode) → re-verify                                                | Medium (re-assembly, no re-render) |
| Cue gap violations                    | `gaps.violations.length > 0`                           | Re-run `buildCues()` with relaxed parameters → re-render `.ass` → re-burn                                                                | Low                                |
| Audio sync all skipped                | `audioSync.checked === 0 && skipped > 0`               | Already fixed by `resolveSceneAudio()` — if still happening, WARN and don't retry (TTS output format issue, not a retry-fixable problem) | N/A                                |
| Other/unknown FAIL                    | Any other                                              | Don't retry — exit(1) with diagnostics                                                                                                   | N/A                                |

### Key files

- **Entry point**: `scripts/short-video/main.mjs` Step 6 (lines ~261-280)
- **Verification**: `scripts/short-video/lib/verify-subtitles.mjs` — `verifySubtitles()` returns report with `summary.passed`, `audioSync`, `wordSequence`, `sync`, `gaps`
- **Subtitle regeneration**: `scripts/short-video/lib/subtitles/generate.mjs` — `regenerateSubtitles()` (already exists)
- **Alignment**: `scripts/short-video/lib/tts/post-process.mjs` — `runWhisperAlignment()`
- **Assembly**: `scripts/short-video/lib/assemble.mjs` — `assembleVideo()`
- **Tests**: `scripts/short-video/__tests__/audio-sync.test.mjs` (21 tests, integration with real ffmpeg)

### Design constraints

1. **Bounded retries** — max 2 retries (3 total attempts). Unbounded loops = infinite TTS cost.
2. **Only retry what's mechanically fixable** — don't retry TTS generation (expensive, non-deterministic). Only retry alignment, subtitle generation, and assembly.
3. **Log each attempt** — print which failure category was detected and what repair was attempted.
4. **Preserve existing behavior** — if `--skip-verify` is passed, no loop. If no subtitles generated, no loop.
5. **Diagnostics still fire** — if the final attempt FAILs, the diagnostics bundle must still be written.

### Suggested approach

1. **Grill** the design: What happens if the repair itself introduces a new failure? (e.g., re-assembly fixes audio sync but breaks cue gaps). Should the loop optimize for "fewest total failures" or "fix the most severe failure first"?
2. **Spec** the retry loop: define the failure classifier function, the repair dispatch, and the loop structure. Scenario matrix must cover each failure category + the "repair introduces new failure" case.
3. **Tickets**: tracer-bullet tickets, each cutting through the full stack (classifier → repair → re-verify).
4. **TDD**: test the classifier with mock reports, test the loop with a fake `verifySubtitles` that fails N times then passes.

### Suggested skills

- `grill-with-docs` — stress-test the retry loop design
- `to-spec` — synthesize spec from grilling
- `to-tickets` — break into tracer bullets
- `implement` + `tdd` — implement test-first
- `code-review` — review the loop

## Separate task: Re-render sensetime-latest video

The user also wants to re-render the `sensetime-latest` video with the fixed pipeline to verify subtitle-audio alignment. The previous version was generated before the audioSync fix, so audioSync was skipped.

```bash
node scripts/short-video/main.mjs --content sensetime-latest --bgm
```

This is a quick validation run, not a code change task. Can be done before or after the loop feature.

## Remaining non-session items in git status

These are from other sessions, not blocking:

- `docs/DOCS-INDEX.md`, `docs/manual-ops.md`, `docs/tools-catalog.md` — modified by other work
- `scripts/short-video/discover-trends.mjs`, `lib/mcp-client.mjs`, `lib/trend-sources.mjs` — modified by other work
- `docs/handoffs/` — untracked handoff docs from other sessions
- `content/sensetime-latest/assets/`, `meta.mjs`, `scenes.mjs` — untracked content files (can be committed when re-rendering)
- `content/light-society/`, `content/sensetime-saudi-school-bus/`, `content/unitree/scenes.mjs` — untracked content from other sessions

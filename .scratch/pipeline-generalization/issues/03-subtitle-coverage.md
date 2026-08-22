# 03 — Subtitle 100% coverage via hold-out extension

**What to build:** Subtitle cues fill the 0.5s inter-scene buffer gaps by extending the previous cue's end time, achieving 100% timeline coverage without changing Netflix timing rules.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] In `cues.mjs` `buildCues()`: add final pass after all cues constructed
- [x] For each gap between consecutive cues < `SCENE_BUFFER + 0.1s` (0.6s): extend earlier cue's `end` to `nextCue.start - CHAIN_GAP`
- [x] `COVERAGE_GAP_THRESHOLD` stays at 1.0s (real gaps still caught)
- [x] Tests: two scenes with 0.5s gap → cue extended to fill gap
- [x] Tests: two scenes with >1.0s gap → not extended (real gap warning)
- [x] Tests: single cue → no extension needed
- [x] Scenario matrix row 7 covered

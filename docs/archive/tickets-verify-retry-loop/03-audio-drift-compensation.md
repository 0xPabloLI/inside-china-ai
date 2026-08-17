# 03 — Audio-sync drift compensation

**What to build:** A pure function `applyDriftCorrection(cues, driftMap)` that takes subtitle cues and a map of `{ sceneId: driftSeconds }` (extracted from `report.audioSync.scenes`), and returns new cues with every timestamp shifted by the corresponding scene's drift. The function is additive (adds drift to `start`, `end`, and all `word.onset` fields), per-scene (each cue belongs to a scene, identified by `cue.sceneId`), and never modifies the input array.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `applyDriftCorrection(cues, driftMap)` returns a new array (input not mutated)
- [ ] Each cue's `start` and `end` are shifted by `driftMap[cue.sceneId]`
- [ ] Each word's `onset` is shifted by the same scene drift
- [ ] Cues with no scene in `driftMap` are returned unchanged
- [ ] Empty `driftMap` returns cues unchanged (shallow copy)
- [ ] Negative drift (audio early) shifts cues earlier
- [ ] Handles `driftMap = {}` and `cues = []` gracefully
- [ ] Tests cover spec matrix: #2 (uniform drift), #3 (non-uniform drift), #18 (zero-duration scene)

# 02 — Smarter checkPrimaryGoal and checkLoopClose

**What to build:** Goal-signal detection only counts explicit CTA verbs (not narration words like "see"). Loop-close check has a pass state when CTA references the hook's core data point.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `checkPrimaryGoal`: remove "completion" category (`/watch|see|look|here is|this is/i`)
- [x] `checkPrimaryGoal`: 3 categories: engagement (`/follow|subscribe/`), interaction (`/comment|tell|ask|question/`), amplification (`/share|save/`)
- [x] `checkLoopClose`: extract core numbers from `meta.dataPoints` or hook voiceover
- [x] `checkLoopClose`: if any core number appears in CTA voiceover → pass
- [x] `checkLoopClose`: otherwise → warn (unchanged)
- [x] `runAllSceneDataChecks` passes `meta` to `checkLoopClose`
- [x] Tests: "see" in narration → not counted as goal signal
- [x] Tests: "follow" only → pass (1 signal)
- [x] Tests: CTA with "629" matching hook → loop-close pass
- [x] Tests: CTA with no hook reference → loop-close warn
- [x] Scenario matrix rows 3, 4, 5, 6 covered

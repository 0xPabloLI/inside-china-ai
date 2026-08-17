# 01 — Remotion audio placement fix

**What to build:** Remotion-rendered videos have audio onsets that match the scene timeline. Currently, `<Audio>` elements are placed inside `<TransitionSeries.Sequence>`, which means audio starts at the sequence's position minus the cumulative transition overlap (6 frames per transition = ~200ms/scene drift). Fix by moving `<Audio>` out of `TransitionSeries.Sequence` into top-level `<Sequence from={offsetInFrames}>` wrappers, where `offsetInFrames` is the cumulative `sceneClipFrames` from `sceneTimeline()`. Visual fade transitions remain via `TransitionSeries`; audio is placed independently.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `<Audio>` elements in `ShortVideo.tsx` are placed in `<Sequence from={N}>` wrappers, not inside `TransitionSeries.Sequence`
- [ ] The `from` value for each scene matches cumulative `sceneClipFrames(durations[i])` — same calculation as `sceneTimeline()`
- [ ] First scene has `from={0}` (no offset)
- [ ] Visual fade transitions still work (6-frame `TransitionSeries.Transition` between scenes)
- [ ] Existing scene tests pass (`__tests__/deepseek-scenes.test.mjs`, etc.)
- [ ] After fix, `verifyAudioSync()` on a re-rendered video reports <80ms drift per scene

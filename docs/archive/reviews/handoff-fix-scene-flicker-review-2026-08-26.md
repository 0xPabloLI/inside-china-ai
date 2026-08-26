# Review: `handoff-fix-scene-flicker`

| Field | Value |
|---|---|
| Status | **Revise before implementation** |
| Reviewed handoff | [`docs/handoffs/handoff-fix-scene-flicker.md`](../handoffs/handoff-fix-scene-flicker.md) |
| Review date | 2026-08-26 |
| Scope | Remotion scene-boundary compositing, implementation options, and verification plan |
| Reviewer | Manus AI |

## Executive Assessment

The handoff identifies a **real and high-probability source of the flicker**: every animated `MediaBackground` fades its media layer out near its own end, while `ShortVideo` adds a transition before every scene after the first. [1] [2] The proposed direction to remove the media layer's exit-opacity envelope is therefore sound.

However, the handoff is **not implementation-ready**. Its file paths omit the `scripts/short-video/` prefix; its explanation describes the default transition as a crossfade although the installed `fade()` presentation only fades the entering child unless `shouldFadeOutExitingScene` is enabled; and its `undefined` proposal for a hard cut is not a valid `TransitionSeries.Transition` presentation. [2] [3] [4] A small implementation mistake here can leave the visual artifact intact, introduce a new abrupt transition, or unintentionally alter video-background audio.

> **Review decision:** Keep the scope focused on removing the redundant `MediaBackground` exit fade. Do not combine it with a global transition-duration or presentation change until the corrected implementation has been rendered and inspected at the affected boundaries.

## Findings

| Priority | Finding | Evidence and consequence | Required revision to the handoff |
|---|---|---|---|
| P0 | The paths in the change table are incorrect. | The affected files are under `scripts/short-video/remotion/src/`, not `remotion/src/`. [2] [3] An implementer following the current paths will fail to locate the source. | Replace both file paths and give stable anchors by component/function name rather than line number alone. |
| P0 | The opacity diagnosis is directionally correct, but the stated transition mechanics are incomplete. | `MediaBackground` drives animated presets from opacity `0 → 1 → 1 → 0`. [2] `ShortVideo` passes `fade()` at the default boundary, but the installed fade presentation keeps the exiting scene at opacity `1` unless its optional `shouldFadeOutExitingScene` flag is truthy; no such flag is supplied. [3] [4] | Describe the problem as **overlapping, independent opacity envelopes**, rather than asserting that `TransitionSeries` itself performs a symmetric crossfade. State that the exiting media opacity and entering transition/media opacity must be validated together. |
| P0 | Option B's code example is invalid. | `TransitionSeries.Transition` expects a presentation. Remotion provides `none()` as the supported no-visual-effect presentation, imported from `@remotion/transitions/none`; returning `undefined` is not the documented approach. [3] [5] | Remove `return undefined`. If a no-effect presentation remains a deliberate experiment, show `import { none } from "@remotion/transitions/none";` and `return none();`, and explain that it is a separate visual-design decision. |
| P1 | Option A changes background-video audio as well as image opacity. | `videoVolume` is computed as `baseVolume * opacity`. Removing the exit opacity ramp keeps video-source audio at its base level until the sequence ends, replacing the current short ducking tail with an end-of-scene cut. [2] | Add an explicit product decision: retain an independent audio fade-out, or accept the hard audio cutoff. Include video media in acceptance testing. |
| P1 | The overlay has a separate boundary envelope and is not addressed. | For animated presets, the dark overlay ends at `overlay × 0.3`, independently of the media opacity. [2] This can change boundary brightness even after the image exit fade is removed. | State whether the overlay tail is intentionally retained. Test it with both `fullscreen` media, where overlay is zero, and non-fullscreen media with a nonzero overlay. |
| P1 | Option C combines a bug fix with unrelated global aesthetic changes. | `TRANSITION_FRAMES` is a single constant shared by default fades, hook-to-narrative slides, data/stat-reveal wipes, and CTA slides. [3] Reducing it changes all of those boundaries, not only narrative-to-narrative fades. | Remove Option C as the default recommendation. Make any timing/presentation adjustment a separately approved follow-up after the focused fix is verified. |
| P1 | The change impacts more scene consumers than the stated narrative case. | `MediaBackground` is used by hook, narrative, info-card, and fullscreen-media scene components. [2] | Expand the impact statement and scenario coverage to all media consumers and all animation presets. |
| P2 | The transition comment is stale. | The top-level comment says “6-frame fade,” while `TRANSITION_FRAMES` is currently `10`. [3] | Add a non-blocking cleanup note to align the comment with the actual constant if the file is otherwise edited. |
| P2 | The testing section is too subjective and has no reproducible acceptance evidence. | The current checks only say to render and visually verify a few boundary types. [1] | Replace them with the scenario matrix and boundary-frame evidence below. |

## Recommended Handoff Revision

### Corrected Scope

The first implementation should modify only `scripts/short-video/remotion/src/components/MediaBackground.tsx`. For every preset other than `none`, preserve the entrance envelope but remove the media layer's exit-opacity ramp:

```typescript
// Current media opacity envelope
interpolate(frame, [0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp);

// Intended media opacity envelope
interpolate(frame, [0, inFrames, totalFrames], [0, 1, 1], clamp);
```

This is a focused hypothesis test: it removes the component-local fade-to-transparent behavior while leaving `ShortVideo`'s boundary presentation unchanged. [2] [3] The existing preset-specific transform exits may remain for this first pass, but the implementation must explicitly decide whether video-source audio retains an independent tail fade.

### Deferred Alternatives

A change to `getTransition()` is **not part of the flicker fix** unless the focused render still demonstrates a boundary artifact. If a hard cut is later chosen, the supported Remotion form is `none()`, not `undefined`. [5] The decision should evaluate the intended creative effect and timing overlap separately from the opacity defect.

## Required Scenario and Risk Verification

The implementation handoff should make the following checks executable acceptance criteria. A fixed multi-scene fixture must be rendered before and after the change, and the same frames around each boundary must be inspected or captured as evidence.

| Scenario | Setup | Expected result | Risk addressed |
|---|---|---|---|
| Narrative → narrative | Two image-backed narrative scenes using the default animation preset and the default boundary presentation. | The outgoing image never reveals the composition background solely because its scene is ending; no dark blink is visible. | Primary defect regression. |
| Hook → narrative | Media-backed hook followed by narrative. | The configured right-to-left slide remains intact and does not reveal a black frame. | Shared `MediaBackground` change affects the hook consumer. |
| Narrative → data/stat-reveal | Media-backed narrative beside data or stat-reveal. | The wipe still has its intended emphasis and no unexpected brightness dip. | Global component change must not regress special transitions. |
| Final content → CTA | Media-backed content followed by CTA. | The bottom slide remains perceptually continuous. | CTA has no `MediaBackground`; its boundary is structurally different. |
| Fullscreen media | `media.mode = "fullscreen"` with image and video variants. | Media remains stable through the boundary; no overlay behavior is introduced where overlay should be zero. | Fullscreen is a separate consumer with a different overlay configuration. |
| Animation presets | `fade`, `ken-burns`, `slide`, `zoom`, and `none`. | Only the intended opacity behavior changes; `none` stays static and other transform behavior remains deliberate. | Preset-specific timing and transforms. |
| Video-source audio | A video-backed scene with a nonzero `media.volume`. | The approved audio-tail behavior is audible and documented; it is neither accidentally removed nor unexpectedly prolonged. | Volume currently follows media opacity. |
| Short scenes | A duration at or below twice the configured entrance/exit timing. | Interpolation remains stable and no timing inversion or flash occurs. | Timing clamps each envelope to half of scene duration. [2] |

For each visual scenario, capture at least the frames immediately before, at, and immediately after the `TransitionSeries` boundary. The review record should include the fixture identifier and the rendered artifact path so a later reviewer can reproduce the comparison.

## Suggested Replacement for the Original Recommendation

> **Recommended implementation:** Remove only the `MediaBackground` exit-opacity ramp in `scripts/short-video/remotion/src/components/MediaBackground.tsx`, retaining the existing `ShortVideo` presentations and `TRANSITION_FRAMES` value. Validate the boundary render across all `MediaBackground` consumers, presets, overlays, and video audio. If a visual defect remains, open a separate decision on transition presentation and duration with frame evidence; use Remotion's supported `none()` presentation for a no-effect transition experiment rather than returning `undefined`.

## Handoff Quality Checklist

| Criterion | Result | Notes |
|---|---|---|
| Problem has a code-backed hypothesis | Pass with revision | The source does contain both local opacity and composition transition behavior. |
| File locations are actionable | Fail | Both paths need the `scripts/short-video/` prefix. |
| Recommended code is API-safe | Fail | Option B must replace `undefined` with a supported presentation or remove the transition node. |
| Scope is isolated | Fail | Option C joins the defect fix to a global aesthetic change. |
| Consumer impact is accounted for | Fail | The scope extends beyond narrative scenes. |
| Regression testing is reproducible | Fail | The original plan needs the scenario matrix and retained render evidence. |

## References

[1]: ../handoffs/handoff-fix-scene-flicker.md "Original scene-flicker handoff"
[2]: ../../scripts/short-video/remotion/src/components/MediaBackground.tsx "Media background opacity, overlay, and video-volume behavior"
[3]: ../../scripts/short-video/remotion/src/ShortVideo.tsx "Scene transition selection and timing"
[4]: ../../scripts/short-video/remotion/node_modules/@remotion/transitions/dist/presentations/fade.js "Installed Remotion fade presentation implementation"
[5]: https://www.remotion.dev/docs/transitions/presentations/none "Remotion `none()` presentation documentation"

# Review: Vertical Cropping Pipeline Handoff

> **Review date:** 2026-08-26  
> **Reviewer:** Manus AI  
> **Scope:** `docs/handoffs/handoff-vertical-cropping-pipeline.md`  
> **Decision:** **Changes requested before implementation**

## Executive assessment

The handoff identifies a real user-visible failure: a vertical `cover` rendering can discard important content from a landscape asset while the current semantic analysis sees only the uncropped input. The proposed work should proceed, but **not in the current form**. Its crop geometry is misstated, its proposed saliency API does not match the actual detector output, and it bypasses the current review-first media workflow. Those issues can yield an incorrect crop, an unintended fallback to `contain`, or a change that never reaches the renderer. [1] [2] [3] [4]

The recommended outcome is a focused, evidence-carrying **crop-decision contract**. It should simulate a candidate crop in the same normalized coordinate system used by the renderer, distinguish `safe`, `unsafe`, and `indeterminate` outcomes, and expose a recommendation in the human-review artifact. For an unsafe crop, the first fallback must be an intentional **framed vertical composition** that preserves the source image in full on a quiet brand matte or a restrained color-derived gradient; it must not default to a blurred duplicate. Only a reviewed patch may place the resulting presentation fields into `scene-data`. This preserves the human approval requirement tracked by Issue #94. [4] [5]

| Review dimension | Assessment | Required disposition |
|---|---|---|
| Problem statement | Sound, but the headline loss percentage is inaccurate for 16:9 → 9:16 `cover`. | Correct the statement and define the target-canvas geometry. |
| Phase 1 crop simulation | Directionally useful, but under-specified and insufficient for a placement decision. | Add a stable result schema, crop-policy inputs, cleanup, and degradation semantics. |
| Phase 2 saliency positioning | **Blocking defect.** The pseudocode consumes fields that the detector does not produce and applies the wrong CSS mapping. | Replace with a tested geometry transform over normalized coordinates. |
| Phase 3 framed fallback | A content-preserving `contain` presentation is needed for unsafe crops, but current rendering provides only a bare `contain`. | Specify an editorial framed composition with a quiet matte/gradient, deliberate spacing, and explicit foreground hierarchy. |
| Blur treatment | A blurred duplicate is visually noisy and should not be the default for landscape media. | Keep it as an explicit, rare last-resort fallback only after framed composition or asset replacement is rejected. |
| Phase 4 padding | A valid product option, not a sequential phase. | Make it a mutually exclusive fallback policy or defer it. |
| Pipeline integration | Incomplete. Current workflow deliberately keeps focus analysis outside copyable `media`. | Route recommendations through the review artifact and add the omitted consumers, validators, and tests. |

## Blocking findings

### 1. The crop calculation and the proposed `object-position` mapping are incorrect

For a 16:9 asset rendered as `cover` into 9:16, the retained source width is `(9/16) ÷ (16/9) = 31.640625%`; the total horizontally discarded width is therefore `68.359375%`, or `34.1796875%` from each side for a centered crop. The handoff’s “~45%” loss description materially understates the failure mode. [1]

More importantly, `focus_detector.py` emits `saliency.centroid` as a **normalized two-element array** such as `[0.5, 0.5]`; it does not emit `centroidX` or `centroidY`, nor should the centroid be divided by image dimensions again. [3] The proposal’s Phase 2 pseudocode would consequently produce `NaN% NaN%` if implemented literally. [1]

A raw source-space centroid is also not a valid CSS `object-position` value for `cover`. CSS must position a scaled image inside the target box, whereas a source coordinate describes the point that should remain visible. Let `r = sourceAspect / targetAspect` when `r > 1`, let `f` be the source-space horizontal focus in `[0, 1]`, and let `p` be the CSS horizontal position in `[0, 1]`. The compatible mapping is:

> `p = clamp((0.5 - f × r + 0.5) / (1 - r), 0, 1)`

The vertical equivalent applies only when the source is taller than the target. This transform must be a pure function with fixture tests; direct centroid-to-percent conversion is not correct.

| Requested change | Current handoff text | Replacement requirement |
|---|---|---|
| Correct the impact statement | “crops ~45% of the content” | State **68.36% of source width is excluded in total** for 16:9 → 9:16 center `cover`; avoid treating a width fraction as a content-importance metric. |
| Replace the Phase 2 API sketch | `const { centroidX, centroidY } = saliencyResult` | Consume `saliency.centroid: [x, y]` only after status and availability checks; retain normalized coordinates throughout the contract. |
| Introduce a transformation seam | Convert centroid directly into CSS percentages | Add `resolveObjectPosition({ sourceAspect, targetAspect, normalizedFocus })`, return clamped CSS coordinates, and test it separately from model inference. |
| Preserve important regions, not just a point | Saliency centroid alone drives placement | Evaluate whether a candidate crop contains required protected regions. A centroid is a soft tie-breaker, not sufficient proof that a face, logo, or edge text remains visible. |

### 2. Phase ordering can choose `contain` before testing a safe non-center crop

Phase 1 simulates only a **center** crop and immediately changes the fit to `contain` if that crop loses content. Phase 2 then proposes moving the crop toward saliency. These phases conflict: an unsafe center crop may become safe when repositioned, so the system should first evaluate candidate `cover` positions and only then select a fallback. [1]

The existing focus implementation already distinguishes protected face rectangles from a soft saliency signal. It returns a normalized frame, normalized `protectedRegions`, a status, and a centroid. That data is suitable for a deterministic candidate-crop evaluator, but it must not be treated as an automatic `contain` verdict. [3]

The handoff should require this decision order:

| Order | Required decision | Evidence and result |
|---|---|---|
| 1 | Normalize the image once. | EXIF-transposed RGB pixels, source dimensions, and a single source coordinate system. |
| 2 | Evaluate `cover` candidates. | At minimum center, protected-region anchors, and a clamped saliency anchor. Record the normalized crop rectangle for each candidate. |
| 3 | Assess preservation. | Deterministically test protected-region intersection/coverage; ask the VLM a narrowly scoped question only when text or semantic importance is unresolved. |
| 4 | Select the policy. | `cover` with a chosen focus when a safe candidate exists; otherwise recommend a framed `contain` composition; prefer a replacement asset when the frame cannot serve the scene; allow blur only as an explicitly approved last resort; return `indeterminate` when analysis degrades. |
| 5 | Present, do not silently apply. | Put the recommendation and evidence in `asset-analysis.json` / `media-patch.json` for human review before scene-data mutation. |

### 3. The proposal contradicts the current scene-data and patch contracts

`MediaField.focus` is deliberately marked deprecated and restricted to `top | center | bottom`. Current asset sourcing stores focus output as `analysis.focusAnalysis` in a patch entry rather than in `media`, while the review formatter intentionally omits `focus` from the copyable media block. [2] [4] The handoff’s instruction that `asset-sourcer` should write arbitrary CSS positions into `media.focus` therefore conflicts with the current contract at three points.

The compatibility-preserving contract is to keep the renderer-independent value normalized and typed, for example `cropFocus: { x: number; y: number }`, rather than persist a CSS string. The renderer can then call the pure transform described above. The proposal must state whether this replaces the deprecated `focus` field or introduces a temporary compatibility bridge, and it must update every serialization and validation boundary together.

| Consumer or boundary | Existing behavior | Required handoff revision |
|---|---|---|
| `remotion/src/types.ts` | Allows `fit`; marks enum `focus` deprecated. [2] | Define the new typed crop-decision and/or normalized-focus fields, their defaults, and migration from legacy `focus`. |
| `asset-sourcer.mjs` | Attaches detector output only under `analysis.focusAnalysis`; does not mutate scene-data. [4] | Write a **recommendation** and evidence to generated artifacts, not directly to `scene-data`. |
| `review-media-patch.mjs` | Prints focus analysis as comments and deliberately excludes `focus` from copyable output. [4] | Show crop recommendation, status, reason, and selected fallback in the human review output. |
| `apply-media-patch.mjs` | Serializes only known legacy fields, including legacy `focus`. [6] | Serialize the new typed field, validate its numeric bounds, and keep unknown/degraded recommendations out of automatic apply. |
| `lib/media-bg.mjs` | Validates only `cover|contain` and `top|center|bottom`. [7] | Update validator constants and tests if the new contract remains shared outside Remotion. |

### 4. A bare `contain` result needs an intentional frame, not a blurred duplicate

The current Remotion component renders one `CanvasImage` or `Video` element with `objectFit: media.fit ?? "cover"` and then a foreground overlay. It has no dedicated framing layer, quiet background treatment, or policy-specific layout behavior. [8] Switching to `contain` alone therefore preserves pixels but leaves an undesigned result; adding a blurred duplicate beneath it would fill space, but would also make an avoidable visual effect the default. [1]

The revised handoff must define a **framed vertical composition** for image assets whose content cannot survive `cover`. It should render an unblurred `contain` foreground within a deliberately spaced 9:16 frame, over either a stable brand matte or a restrained gradient derived from the source palette. The matte, image, overlay, and text-safe areas must have an explicit layer order. Any motion should be limited to the framing system or a subtle foreground scale that never recrops the source. This produces a composed editorial treatment rather than a rescued landscape image.

A blurred, overscanned duplicate may remain available only as a documented **last-resort** policy for a specific scene after the reviewer rejects a clean matte/gradient composition and cannot source a better vertical asset. It must be opt-in, image-only, and absent from the default `contain` behavior. Video behavior should remain out of scope unless separately designed; the current focus detector explicitly does not support video input. [3] [8]

### 5. Crop simulation needs explicit failure, format, and resource semantics

The example crop helper writes a JPEG temporary file but does not show `tempfile`/`os` imports, cleanup on all paths, EXIF orientation normalization, alpha handling, or a well-defined fallback for formats that should not silently become JPEG. The existing focus detector applies `ImageOps.exif_transpose(...).convert("RGB")`, whereas the current VLM resize path reads dimensions without that same coordinate normalization. Implementing the proposal as written would risk comparing crop evidence and focus coordinates from different orientations. [3] [9]

The crop analysis must return an explicit schema, including `status: "safe" | "unsafe" | "indeterminate"`, source/target aspect ratios, the tested normalized crop rectangle, policy recommendation, and a human-readable reason. A timeout, unreadable image, unavailable saliency, or VLM failure must produce `indeterminate`; it must not manufacture a confident `contain` result. The existing VLM worker serializes requests with a 180-second per-asset timeout, so a second VLM inference for each landscape image also requires a budget, cache key, and telemetry field before it becomes the default path. [4]

## Major findings

### Phase 4 must become a presentation-policy hierarchy, not a later implementation phase

The document presents blurred `contain` in Phase 3 and padded preprocessed imagery in Phase 4 as though both should be implemented in sequence. They are different visual products with different provenance and storage costs. The revised scope should use a clear hierarchy: first choose a safe `cover` crop; then preserve the full image in an editorial framed `contain` composition; then replace the asset when the frame cannot serve the scene’s visual intent; and only then allow an explicitly approved blurred treatment. A pre-rendered padded asset should remain deferred until there is a defined destination, cache invalidation strategy, attribution/provenance rule, and an explicit user need for it. [1]

### The VLM should validate semantics, not be the sole crop oracle

A second VLM call can determine whether a rendered candidate crop still communicates the intended subject, but it should receive the **candidate crop and policy context** and return a constrained `safe | unsafe | indeterminate` judgment with a reason. It should not be asked to infer CSS coordinates. Deterministic geometry should protect face rectangles and ensure a selected crop is valid; VLM output should resolve semantic cases such as truncated logos, charts, or UI. This split is consistent with Issue #101’s planned `transformedFocus` seam for converting source coordinates to a target canvas. [3] [10]

### The concrete Alibaba examples need reproducible evidence

The table names three assets and states that text or logos “may be cropped,” but it does not include retained crop rectangles, rendered frames, source dimensions verified by the pipeline, or a pass/fail criterion. Retain the examples as fixtures only after adding source snapshots and expected decisions. A review can then tell whether the chosen crop preserves the named subject and whether the fallback produces a readable result. [1]

## Documentation consistency checks

The repository’s documentation-review rules require cross-section consistency, pointer-target completeness, and file-existence verification. The following checks were applied to the handoff. [11]

| Check | Result | Required correction |
|---|---|---|
| Cross-section consistency | **Fail.** Phase 1 makes a decision from a center crop, while Phase 2 later introduces an alternative crop position; Phase 3 and Phase 4 describe competing fallbacks without precedence. [1] | Reframe as one decision pipeline with one selected fallback policy. |
| Current-contract consistency | **Fail.** Phase 2 proposes writing `media.focus`, while current types and review output intentionally deprecate/omit that field. [2] [4] | Define a new typed field and update all producers, reviewers, appliers, validators, and consumers. |
| Existing-spec consistency | **Fail.** `docs/spec-vlm-fit-focus.md` still describes enum VLM focus and a different VLM action, while the active code uses semantic analysis plus focus artifacts. [12] | State whether this handoff amends, replaces, or supersedes the older spec; maintain one normative implementation contract. |
| Pointer-target completeness | **Partial.** Related issues are named, but their relevant constraints are not incorporated: Issue #94 requires human approval, and Issue #101 defines a coordinate-transform direction. [5] [10] | Link and summarize the binding constraints in the revised decision model. |
| File existence | **Pass with omissions.** The four existing code targets listed in the handoff are present; the optional preprocessor would be new. The list omits contracts and patch-path consumers that must change with the design. [1] [2] [4] [6] [7] [8] | Replace the file table with the complete impact map below. |

## Required modified-files impact map

| File | Required change | Risk and verification |
|---|---|---|
| `scripts/short-video/lib/vlm_analyzer.py` | Normalize static images once; produce/consume crop-candidate analysis; clean temporary artifacts; return an explicit crop-assessment status. | **High.** Python unit fixtures for EXIF rotation, transparent input policy, temp cleanup, malformed/timeout responses. |
| `scripts/short-video/lib/visual-analyzer.mjs` | Version the JS/Python response contract and preserve degraded/indeterminate results. | **High.** Mock IPC tests for success, malformed data, timeout, and backward compatibility. |
| `scripts/short-video/lib/focus_detector.py` | No required algorithm rewrite, but document/use its normalized `centroid` and `protectedRegions` schema. | **Medium.** Fixture tests confirm normalized coordinates and error status propagation. |
| `scripts/short-video/lib/asset-sourcer.mjs` | Build reviewable crop recommendations and avoid direct scene-data mutation. | **High.** Integration tests cover policy selection and no-write behavior. |
| `scripts/short-video/lib/review-media-patch.mjs` | Display crop evidence and the candidate decision in the human-review output. | **Medium.** Snapshot tests for safe, unsafe, and indeterminate recommendations. |
| `scripts/short-video/apply-media-patch.mjs` | Serialize and validate any approved new field, retaining conflict behavior. | **High.** Tests for numeric-bound validation, legacy compatibility, and rejected indeterminate decisions. |
| `scripts/short-video/lib/media-bg.mjs` | Update shared validation only if the revised contract remains cross-renderer. | **Medium.** Validation tests for new fields and legacy `focus`. |
| `scripts/short-video/remotion/src/types.ts` | Add the renderer-independent crop contract and define legacy-field migration. | **Medium.** Typecheck plus fixture compile. |
| `scripts/short-video/remotion/src/components/MediaBackground.tsx` | Add tested object-position resolution and an image-only framed `contain` renderer with a quiet matte/gradient and explicit safe areas; expose blur only as an opt-in last-resort mode. | **High.** Rendered-frame checks for full-content visibility, frame hierarchy, matte/gradient contrast, animation, opt-in blur isolation, and no regression when fields are absent. |
| `scripts/short-video/__tests__/…` | Extend VLM, focus, asset-sourcer, patch, validator, and renderer-adjacent coverage. | **High.** The behavioral matrix below becomes the acceptance suite. |
| `docs/spec-vlm-fit-focus.md` and the reviewed handoff | Consolidate normative decisions and mark superseded design text. | **Medium.** One authoritative contract and no contradictory instructions. |

## Required behavioral acceptance matrix

| ID | Scenario | Expected result |
|---|---|---|
| VC-01 | A 16:9 fixture with the key subject centered. | `cover` remains selected; the default crop is retained and visual output remains unchanged. |
| VC-02 | A 16:9 fixture with the subject safely left or right of center. | The candidate crop shifts only as needed; the protected subject rectangle remains fully visible. |
| VC-03 | A 16:9 fixture with an unavoidably wide logo, chart, or critical edge UI. | No `cover` candidate qualifies; the review artifact recommends a framed `contain` composition with evidence and an asset-replacement option when the frame conflicts with scene intent. |
| VC-04 | Saliency is unavailable or `low_information`, while no protected region exists. | The result is `indeterminate` or a documented center default; no false precision is persisted. |
| VC-05 | VLM times out, returns malformed content, or the worker is unavailable. | The result is `indeterminate`, the source asset remains usable, and human review visibly receives the degradation reason. |
| VC-06 | An EXIF-rotated image. | Focus coordinates, crop simulation, and rendering use the same normalized orientation. |
| VC-07 | A PNG with alpha or a non-JPEG input. | The documented preprocessing policy preserves valid pixels or safely declines simulation; no silent lossy conversion changes the decision. |
| VC-08 | Framed `contain` image rendering. | A quiet brand matte or restrained palette-derived gradient frames the complete, unblurred source; the overlay and text-safe areas remain legible, and no decorative blur appears. |
| VC-08b | Explicit last-resort blur rendering. | Blur activates only for a reviewed opt-in policy; the foreground remains unblurred, and the default framed `contain` path is unaffected. |
| VC-09 | Existing scene-data without the new field. | Output remains `cover + center` and matches the prior renderer behavior. |
| VC-10 | A legacy `focus` value. | Compatibility behavior is explicit and tested until a deliberate migration removes it. |
| VC-11 | Human rejects or leaves an indeterminate recommendation unapproved. | `scene-data` is unchanged; no automatic patch application occurs. |
| VC-12 | Alibaba fixture examples. | Stored source/crop snapshots and an expected disposition make each named case reproducible rather than speculative. |

## Requested handoff revision

The handoff should be revised before implementation with the following changes, expressed in review/track-change style.

| Status | Location | Requested replacement |
|---|---|---|
| **Replace** | Problem, line 5 | Replace “crops ~45%” with the correct 16:9 → 9:16 width-loss calculation and state that visual importance requires separate evidence. |
| **Replace** | Root cause, lines 17–20 | Explain that focus analysis currently lives in a review artifact and that the legacy `focus` field is deprecated; do not imply that merely adding `media.focus` is compatible. |
| **Replace** | Phase 1, lines 39–73 | Define a crop-assessment schema, evaluate candidate crops before deciding fallback, normalize EXIF/color once, and specify cleanup/degradation behavior. |
| **Replace** | Phase 2, lines 74–90 | Remove the `centroidX`/`centroidY` pseudocode. Add a pure normalized-coordinate → CSS-position transform plus protected-region containment checks. |
| **Replace** | Phase 3, lines 92–105 | Specify a framed `contain` image composition: full source preservation, quiet brand matte or palette-derived gradient, layer order, text-safe areas, spacing, animation, and video scope. State that blur is not the default. |
| **Move / defer** | Phase 4, lines 107–137 | Reclassify padded preprocessing as an optional future fallback policy rather than an automatic next phase. |
| **Add** | New “Landscape presentation hierarchy” section | Define the order: safe cover crop → framed contain composition → replacement vertical asset → explicitly approved blur as final fallback. |
| **Expand** | Files to Modify, lines 139–148 | Replace with the complete impact map in this review. |
| **Add** | New “Decision model and acceptance criteria” section | Add the policy-selection order, the full behavioral matrix, VLM budget/cache requirements, review-first semantics, and explicit non-goals. |
| **Reconcile** | Related docs and issues | State the relationship to `spec-vlm-fit-focus.md`, Issue #94, and Issue #101 so one contract governs implementation. |

## Approval gate

This review is ready to approve only after the handoff carries the revised crop-decision contract, reconciles the deprecated focus path, defines the landscape presentation hierarchy with **framed contain before blur**, and includes the acceptance matrix above. The subsequent implementation should follow the repository’s required implementation workflow, including a scenario matrix, tests, a rendered-frame verification, and a final human review of the example assets. [11]

## References

[1]: ../handoffs/handoff-vertical-cropping-pipeline.md "Handoff: Vertical Image Cropping Pipeline Optimization"
[2]: ../../scripts/short-video/remotion/src/types.ts "MediaField type contract"
[3]: ../../scripts/short-video/lib/focus_detector.py "Focus detector normalized focus schema"
[4]: ../../scripts/short-video/lib/asset-sourcer.mjs "Asset sourcing analysis and patch construction"
[5]: https://github.com/0xPabloLI/inside-china-ai/issues/94 "Issue #94: Scene-level visual intent and evidence-media audit"
[6]: ../../scripts/short-video/apply-media-patch.mjs "Media patch application and serialization"
[7]: ../../scripts/short-video/lib/media-bg.mjs "Shared media validation contract"
[8]: ../../scripts/short-video/remotion/src/components/MediaBackground.tsx "Current Remotion media renderer"
[9]: ../../scripts/short-video/lib/vlm_analyzer.py "VLM image preprocessing and IPC"
[10]: https://github.com/0xPabloLI/inside-china-ai/issues/101 "Issue #101: Temporal focus and transformed focus"
[11]: ../DOCS-INDEX.md "Documentation placement and review lifecycle"
[12]: ../spec-vlm-fit-focus.md "Existing VLM-driven fit/focus specification"

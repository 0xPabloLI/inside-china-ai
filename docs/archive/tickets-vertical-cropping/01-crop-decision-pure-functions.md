# 01 — Crop Decision Pure Functions Module

**What to build:** A new `lib/crop-decision.mjs` module with three pure functions that form the deterministic crop-decision contract: `resolveObjectPosition` (normalized source-space focus → CSS `object-position`), `evaluateCropSafety` (protected regions vs candidate crop rectangle), and `selectBestCrop` (orchestrate candidates + select best safe crop). All functions are pure — no I/O, no side effects, fully testable with fixture inputs.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] `resolveObjectPosition({ sourceAspect, targetAspect, normalizedFocus })` implemented: converts `[x, y]` normalized focus into clamped CSS `"xPct% yPct%"` string. Formula: when `r = sourceAspect / targetAspect > 1`, `p = clamp((0.5 - f * r + 0.5) / (1 - r), 0, 1)` for horizontal; vertical when source taller. Returns `"center"` when ratios equal.
- [x] `evaluateCropSafety({ protectedRegions, cropRect })` implemented: tests whether `cropRect` (normalized `[x,y,w,h]`) fully contains all `protectedRegions` (each `{rect: [x,y,w,h], kind}`). Returns `{ safe: boolean, violatedRegions: Region[] }`.
- [x] `selectBestCrop({ sourceAspect, targetAspect, protectedRegions, saliency, frame })` implemented: generates candidate crops (center, saliency-anchored, one per protected-region anchor), evaluates each, selects first safe candidate. Returns `CropDecision` object: `{ status, policy, cropFocus, reason, candidates }`.
- [x] `crop-decision.test.mjs` tests cover all behavioral matrix rows: VC-01 (center, safe), VC-02 (face left, shift), VC-03 (wide logo, unsafe), VC-04 (degraded, indeterminate), VC-18 (resolveObjectPosition formula), VC-19 (same ratio → "center"), VC-20 (vertical crop).
- [x] All tests pass: `npx vitest run scripts/short-video/__tests__/crop-decision.test.mjs` (21 passed)

# Spec: Visual Focus Detection P0/P1 Remediation

> Status: **Draft v1**
> Created: 2026-08-18
> Origin: `docs/handoffs/handoff-visual-focus-detection.md` + `docs/specs/spec-visual-focus-detection-review.md`
> Parent spec: `docs/specs/spec-visual-focus-detection.md` (v7)

## 1. Problem Statement

The Visual Focus Detection feature (Phase 1a) has been implemented and passes 194 tests at the unit level. However, an independent post-implementation review (`spec-visual-focus-detection-review.md`) identified two P0 blockers and three P1 should-fix items that must be resolved before the feature can be declared complete.

**P0-1**: `parseFitResponse()` still requires `fit && focus` to be simultaneously valid, violating the spec §4.8 contract that `fit` is required and `focus` is optional. When the VLM returns `{fit:"cover"}` (no focus) or `{fit:"contain", focus:"left"}` (invalid focus), the valid `fit` is discarded — re-introducing the landscape crop regression the spec explicitly prohibits.

**P0-2**: The smoke test golden fixture uses `shanghai-skyline.jpg` (a city skyline with no human faces) but asserts `minProtectedRegions: 1`. Runtime verification confirmed Haar Cascade detects 10 false-positive "faces" (building windows/signs) on this image. The test passing does not demonstrate face detection quality — it validates false positives.

## 2. Solution

Fix the two P0 blockers and the P1 should-fix items identified in the review.

### 2.1 P0-1: Decouple fit/focus in parseFitResponse + handleResponse

**Modified files:**
- `scripts/short-video/lib/visual-analyzer.mjs` — `parseFitResponse()` + `handleResponse()`
- `scripts/short-video/__tests__/visual-analyzer.test.mjs` — regression tests

**Changes:**

1. `handleResponse()` line ~194: change `if (response.fit && response.focus)` → `if (response.fit)` so that fit alone triggers the parseFitResponse path.
2. `parseFitResponse()`: remove the `if (!focus || !VALID_FOCUSES.includes(focus)) return {}` guard. Instead, only include `focus` in the return object when it's valid (`top|center|bottom`); otherwise omit it.
3. Return shape: `{ fit, reason }` when focus is absent/invalid; `{ fit, focus, reason }` when focus is valid.

**Regression tests:**
- `{fit:"cover"}` → `{fit:"cover", reason:""}`
- `{fit:"contain", focus:"left"}` → `{fit:"contain"}` (focus omitted)
- `{fit:"cover", focus:"top"}` → `{fit:"cover", focus:"top", reason:""}` (unchanged)
- `{fit:null}` → `{}` (fit invalid, still returns empty)
- Integration: `asset.aiFit` written, `asset.aiFocus` NOT written

### 2.2 P0-2: Fix smoke golden assertions for shanghai-skyline.jpg

**Modified files:**
- `scripts/short-video/__tests__/fixtures/focus-golden.json`
- `scripts/short-video/__tests__/focus-smoke.test.mjs`

**Changes:**

Runtime evidence: Haar Cascade detects 10 false-positive faces on `shanghai-skyline.jpg`. The test must not assert `minProtectedRegions: 1` for a skyline image.

1. Update `focus-golden.json` `real-image-ok` case: `minProtectedRegions` → 0, rename to `real-image-ok-no-faces`, test description "returns ok with saliency (no faces expected in skyline)".
2. Update `focus-smoke.test.mjs` test name and assertions to expect zero protectedRegions (faces only — saliency may still be available).
3. **Important**: Since Haar does detect 10 false-positive faces, the smoke test asserting 0 faces will FAIL. This is the correct behavior — it exposes the known Haar false-positive limitation. The test should be marked as `test.skip()` with a comment referencing P1-1 (YuNet replacement in Phase 2), OR the assertion should check `protectedRegions` has no faces with `kind: "face"` — but since all detected regions have `kind: "face"`, the test must skip or the golden must accept false positives as baseline behavior.

**Decision**: Mark the face-count assertion as `test.skip()` with explanation. The saliency and frame assertions remain active. The skip documents the known Haar limitation and will be replaced when YuNet (Phase 2) provides real face ground truth via `fixtures/golden/`.

### 2.3 P1-3a: Integration test assertions for focusAnalysis schema

**Modified files:**
- `scripts/short-video/__tests__/asset-sourcer-visual-integration.test.mjs`

**Changes:**

Add a test that calls `assignAssetsToScenes()` with assets that have `focusAnalysis` set, and asserts:
- `analysis.focusAnalysis` has complete schema: `status`, `errorCode`, `frame`, `protectedRegions`, `saliency`
- `media.fit` is set when `asset.aiFit` is present (landscape asset)
- `media.focus` is NOT set (deprecated, not written by new pipeline)

### 2.4 P1-3b: Rename lib/apply-media-patch.mjs → review-media-patch.mjs

**Modified files:**
- `git mv scripts/short-video/lib/apply-media-patch.mjs scripts/short-video/lib/review-media-patch.mjs`
- `scripts/short-video/__tests__/apply-media-patch.test.mjs` → update import path
- `scripts/short-video/README.md` → update reference

### 2.5 P1-2: Parallel test isolation for real subprocess tests

**Modified files:**
- `vitest.config.ts` (or test-level annotation)

**Changes:**
The existing vitest config has `maxWorkers: 4`. The focus smoke test spawns real Python subprocesses. Add `// @vitest-environment node` annotation is already there. The fix is to add a `describe.serial` block around the real-subprocess tests in `focus-smoke.test.mjs`, or add `fileParallelism: false` for smoke tests via a separate vitest project.

**Decision**: Add `describe.serial` to `focus-smoke.test.mjs` and ensure the `focus_detector.test.mjs` (which also spawns real subprocesses) uses serial execution. This is the lightest fix — no vitest config changes needed.

## 3. Scenario & Risk Verification

### Modified Files Impact

| File | Change | Risk |
|------|--------|------|
| `lib/visual-analyzer.mjs` | `parseFitResponse()` logic + `handleResponse()` condition | Downstream: `asset-sourcer.mjs` calls `analyzeFit()` which uses `parseFitResponse()`. If fit is now preserved when focus is absent, `asset.aiFit` will be set more often. This is the intended behavior. |
| `__tests__/visual-analyzer.test.mjs` | New regression tests + updated existing test expectations | Test "returns empty object for invalid focus value" must change to expect `{fit:"cover"}` instead of `{}`. |
| `__tests__/fixtures/focus-golden.json` | `minProtectedRegions: 0` + rename | Smoke test name/description must match. |
| `__tests__/focus-smoke.test.mjs` | Skip face-count assertion, keep saliency/frame | If Haar false positives are counted, the test fails. Skip documents the limitation. |
| `__tests__/asset-sourcer-visual-integration.test.mjs` | New test for `analysis.focusAnalysis` schema | No risk — additive test. |
| `lib/review-media-patch.mjs` (renamed) | Rename only, no logic change | All imports must update. |
| `__tests__/apply-media-patch.test.mjs` | Import path update | Must match new filename. |
| `README.md` | Update reference | Minor doc change. |

### Behavioral Scenarios

| # | Scenario | Input | Expected Output | Test |
|---|----------|-------|-----------------|------|
| S1 | VLM returns fit only | `{fit:"cover"}` | `{fit:"cover", reason:""}` | Unit |
| S2 | VLM returns fit + invalid focus | `{fit:"contain", focus:"left"}` | `{fit:"contain"}` | Unit |
| S3 | VLM returns fit + valid focus | `{fit:"cover", focus:"top"}` | `{fit:"cover", focus:"top", reason:""}` | Unit |
| S4 | VLM returns invalid fit | `{fit:"invalid"}` | `{}` | Unit (existing) |
| S5 | VLM returns no fit | `{fit:null}` | `{}` | Unit (existing) |
| S6 | handleResponse: response has fit but no focus | `{fit:"cover", error:null}` | Resolves with `{fit:"cover", reason:""}` | Unit |
| S7 | Skyline image face count | shanghai-skyline.jpg | 0 real faces (but Haar detects 10 false positives) → skip assertion | Smoke (skip) |
| S8 | Skyline image saliency | shanghai-skyline.jpg | `saliency.available: true`, `dispersion > 0` | Smoke (active) |
| S9 | Skyline image frame | shanghai-skyline.jpg | `frame.orientation: "portrait"`, `orientationNormalized: true` | Smoke (active) |
| S10 | assignAssetsToScenes: focusAnalysis mapping | asset with `focusAnalysis` | `analysis.focusAnalysis` has full schema | Integration |
| S11 | assignAssetsToScenes: aiFit written, aiFocus not | asset with `aiFit:"cover"` | `media.fit: "cover"`, `media.focus` absent | Integration |
| S12 | review-media-patch import | import from `lib/review-media-patch.mjs` | `formatFocusSummary`, `formatPatchEntry`, `formatMediaPatch` exported | Unit (existing, path updated) |

## 4. Out of Scope

- P1-1: `fixtures/exif/`, `fixtures/benchmark/`, `fixtures/golden/`, `fixtures/baseline/` directories and `focus-detector-benchmark.mjs` — deferred to follow-up task
- Phase 2 candidates (YuNet, slot scoring, video focus detection, Remotion integration)
- VLM optimization (P3-P8 from handoff)

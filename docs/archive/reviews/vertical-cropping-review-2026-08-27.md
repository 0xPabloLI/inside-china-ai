# Code Review: Vertical Cropping Pipeline

> Date: 2026-08-27
> Spec: `docs/spec-vertical-cropping.md`
> Reviewer: Agent (self-review)

## Standards

### Hard Violations

None.

### Judgement Calls

1. **Duplicated validation logic** — `cropFocus` numeric validation appears in both `media-bg.mjs` (warns) and `apply-media-patch.mjs` (throws). Different behavior justifies the duplication; could be extracted to a shared `validateCropFocus()` utility in a future refactor.

### Smell Baseline

- Mysterious Name: ✅ all clear
- Duplicated Code: see judgement call above
- Feature Envy: ✅ none
- Data Clumps: `{ x, y }` appears frequently but is a standard coordinate pair
- Shotgun Surgery: `cropFocus` touches 6 files, but each file changes for one reason (type → validate → render → pipeline → review → patch)
- Speculative Generality: `candidates` array stored for human review — spec explicitly requires this

## Spec

### Missing Requirements

None. All 11 Implementation Decisions implemented. All 20 behavioral scenarios (VC-01 to VC-20) have corresponding tests.

### Scope Creep

None detected.

### Implementation Correctness

- `resolveObjectPosition` formula verified mathematically (center → 50%, left of center → <50%, clamping at 0% and 100%)
- EXIF normalization correctly applied in both `simulate_crop` and `resize_image_if_needed`
- VLM "contain" priority correctly preserved (crop decision does not override VLM's "contain" to "cover")
- Video assets correctly skipped (no crop decision for video)
- Portrait images correctly skipped (no horizontal crop needed)

## Summary

- **Standards:** 0 hard, 1 judgement (acceptable)
- **Spec:** 0 missing, 0 creep
- All 185 tests passing across 5 test files

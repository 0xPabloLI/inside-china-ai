# Tickets: Fix Scene Flicker (Double Fade)

## SF-1: Write failing tests for opacity envelope + video volume + overlay

**Dependencies**: none
**Tracer bullet**: Yes — tests define the contract before implementation

### Checklist

- [x] Create test file `scripts/short-video/__tests__/fix-scene-flicker.test.mjs`
- [x] S1: Test — media opacity envelope has 3 stops (entrance only) for `fade` preset
- [x] S2: Test — media opacity envelope has 3 stops for all non-none presets
- [x] S3: Test — `none` preset has constant opacity 1
- [x] S4: Test — video volume has independent 4-stop envelope with exit fade
- [x] S5: Test — overlay envelope is unchanged (4-stop with exit dim)
- [x] S6: Test — preset-specific transforms reference `outStart` (not removed)
- [x] S7: Test — `outStart` variable still computed
- [x] S8: Test — short scene duration (≤ 2× timing) clamps correctly
- [x] Run tests → 4 fail (red) for actual fix targets, 10 pass for existing contracts

## SF-2: Implement opacity envelope fix + video volume independence

**Dependencies**: SF-1
**Tracer bullet**: Yes — the core fix

### Checklist

- [x] Change media opacity: `[0, inFrames, totalFrames] → [0, 1, 1]` (remove exit ramp)
- [x] Change video volume: independent `interpolate([0, inFrames, outStart, totalFrames], [0, 1, 1, 0], clamp)` × baseVolume
- [x] Update JSDoc header comment to reflect exit opacity removal
- [x] Run tests → all pass (green) — 14/14
- [x] Run `npx vitest run scripts/short-video/__tests__/remotion-media-migration.test.mjs` → existing tests pass (34/34)

## SF-3: Refactor + final verification

**Dependencies**: SF-2
**Tracer bullet**: No — cleanup

### Checklist

- [x] Verify no unused variables (e.g., `outStart` still used by transforms + volume)
- [x] Verify `outFrames` still used (by `outStart` computation and transforms)
- [x] Run full test suite → green (14 pre-existing failures unrelated to this change)
- [x] Run `npx tsc --noEmit` in remotion dir → no type errors

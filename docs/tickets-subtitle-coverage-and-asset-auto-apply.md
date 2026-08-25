# Tickets: Subtitle 100% Coverage + Asset-Sourcer Auto-Apply

Spec: `docs/spec-subtitle-coverage-and-asset-auto-apply.md`

## Ticket A: holdOutExtension — raise threshold + test

- [x] A1: Write red test: `buildCues` with 1.5s inter-cue gap → gap is filled (earlier cue end extended). Scenario #1.
- [x] A2: Write red test: `buildCues` with 2.5s inter-cue gap → gap NOT filled. Scenario #2.
- [x] A3: Change `HOLD_OUT_GAP_THRESHOLD` from `0.6` to `2.0` in `lib/subtitles/cues.mjs`.
- [x] A4: Verify A1 and A2 pass green. (25 tests passed)

Depends on: none.

## Ticket B: Coverage 100% hard gate + test

- [x] B1: Write red test: `buildReport` with coverage gap → `errors > 0` (not just warnings). Scenario #5.
- [x] B2: Write red test: `buildReport` with no gaps → `errors === 0`. Scenario #4.
- [x] B3: Write red test: trailing gap < 2.0s → warning (not error). Scenario #6.
- [x] B4: Write red test: trailing gap >= 2.0s → error. Scenario #7.
- [x] B5: In `lib/verify-subtitles.mjs` `buildReport()`: move `coverage.gaps.length` from warnings to errors. Add trailing-gap exception: if only gap is at video end and duration < 2.0s, keep as warning. Also lowered `COVERAGE_GAP_THRESHOLD` from 1.0 to 0.2 to detect smaller gaps.
- [x] B6: Verify B1–B4 pass green. (33 tests passed)

Depends on: Ticket A (coverage will be 100% after Fix A, so hard gate doesn't break existing pipeline).

## Ticket C: Asset-sourcer auto-apply in main.mjs

- [x] C1: Add Step 1.5c to `main.mjs`: after asset-sourcer block, read `output/<contentDir>/media-patch.json`, filter `status === "assigned"` with `media.path`, apply to `scenes` array in memory (`if (!scene.media) scene.media = patch.media`). Print summary. Scenario #8, #10, #11.
- [x] C2: Add WARNING print when 0 patches assigned. Scenario #9.
- [x] C3: Verify file existence with `resolve(contentDirAbs, patch.media.path)` before applying. Scenario #12.

Depends on: none (independent of Tickets A/B).

## Ticket D: Runtime verify + commit

- [ ] D1: Run `npm run lint && npx tsc --noEmit` (short-video scripts may not be in tsconfig — verify).
- [ ] D2: Run existing test suite: `cd scripts/short-video && npx vitest run`.
- [ ] D3: Re-run `node scripts/short-video/verify-video.mjs --pre --content doubao-work` to confirm no regression.
- [ ] D4: Commit + push.

Depends on: Tickets A, B, C.

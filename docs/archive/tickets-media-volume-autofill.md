# Tickets: Per-scene Volume + Envelope Ducking & Asset-sourcer Auto-fill

> **Spec**: `docs/spec-media-volume-autofill.md`
> **3 tickets, linear dependency chain**

## Ticket V-1: Per-scene volume + envelope ducking

**Depends on**: None (first ticket, no blockers)

**Goal**: Add `volume?: number` to `MediaField`, implement envelope ducking in `MediaBackground.tsx`, add volume validation in `media-bg.mjs`.

**Files to modify**:
- `scripts/short-video/remotion/src/types.ts` — add `volume?: number` to `MediaField`
- `scripts/short-video/remotion/src/components/MediaBackground.tsx` — replace `volume={0.08}` with envelope-ducked `videoVolume`
- `scripts/short-video/lib/media-bg.mjs` — add volume range validation to `validateMedia()`
- `scripts/short-video/__tests__/media-bg.test.mjs` — add volume test cases

**TDD test cases** (from Scenario Matrix rows #1-6, #7-8):
1. `media.volume` undefined → `baseVolume = 0.08` (default behavior preserved)
2. `media.volume = 0` → `videoVolume = 0` (explicit silence, `??` doesn't swallow 0)
3. `media.volume = 0.12` → `videoVolume = 0.12 * opacity` (envelope ducking)
4. `media.volume = 1.5` → `validateMedia()` returns warning (out of range)
5. `media.volume = -0.5` → `validateMedia()` returns warning (negative)
6. `media.type = "image"` + `media.volume = 0.1` → `validateMedia()` does NOT warn (image+volume is harmless)
7. `preset = "none"` + video → `videoVolume = baseVolume * 1 = baseVolume` (no envelope)
8. Short scene (duration < inFrames) → clamped inFrames, volume follows clamped opacity

**Implementation notes**:
- `baseVolume = media.volume ?? 0.08` — nullish coalescing preserves `0`
- `videoVolume = baseVolume * opacity` — computed AFTER opacity, applied to `<Video volume={videoVolume}>`
- `validateMedia()`: `if (media.volume !== undefined && (media.volume < 0 || media.volume > 1))` → warning
- `types.ts`: `volume?: number` after `overlay?: number`

**Completion criteria**:
- All 8 test cases pass (red → green)
- `npx tsc --noEmit` passes (types.ts change doesn't break consumers)
- Existing `media-bg.test.mjs` tests still pass
- `MediaBackground.tsx` renders `<Video volume={videoVolume}>` not `<Video volume={0.08}>`

---

## Ticket V-2: `assignAssetsToScenes()` + `media-patch.json`

**Depends on**: V-1 (volume field must exist in types.ts for patch to include volume)

**Goal**: Batch-assign downloaded assets to scenes, output `media-patch.json` with per-scene media recommendations including volume.

**Files to modify**:
- `scripts/short-video/lib/asset-sourcer.mjs` — add `assignAssetsToScenes()`, call in `main()`, write `media-patch.json`
- `scripts/short-video/__tests__/asset-sourcer.test.mjs` — add `assignAssetsToScenes` test cases

**TDD test cases** (from Scenario Matrix rows #9-16):
9. 0 assets, 3 available scenes → empty patch array
10. 5 assets, 2 available scenes → top-2 assigned, 3 unassigned
11. Image asset → `media.volume` omitted in patch
12. Scene already has `media` → skipped
13. Scene `visualType: "hook"` → skipped
14. Two assets with same `path` → first assigned, second skipped
15. Asset without `path` field → skipped
16. Volume per visualType: narrative+video→0.10, quote+video→0.04, info-card→0.08

**Implementation notes**:
- `assignAssetsToScenes(assets, scenes)` returns `PatchEntry[]`
- Sort assets by `score` descending before greedy matching
- Track assigned scene IDs and assigned paths in Sets
- Volume recommendation map:
  - `narrative` + `video` → `0.10`
  - `quote` + `video` → `0.04`
  - `info-card` + `video` → `0.08` (default)
  - any + `image` → omit `volume` field
- `media-patch.json` written to `output/media-patch.json` (same dir as `asset-report.json`)
- `main()`: call `assignAssetsToScenes()` AFTER attribution building, BEFORE writing report

**Completion criteria**:
- All 8 test cases pass
- `media-patch.json` is valid JSON with correct structure
- Existing `asset-sourcer.test.mjs` tests still pass
- `recommendScene()` retained (not removed — backward compat)

---

## Ticket V-3: `apply-media-patch.mjs` script

**Depends on**: V-2 (needs `media-patch.json` to exist as input)

**Goal**: New standalone script that reads `media-patch.json` and outputs formatted, copy-paste-ready media field code blocks.

**Files to create**:
- `scripts/short-video/apply-media-patch.mjs` (new)
- No test file needed for this ticket (it's a formatting/CLI script, logic is minimal)

**TDD test cases** (from Scenario Matrix rows #17-19):
17. Patch file not found → error + exit(1)
18. Invalid JSON → error + exit(1)
19. Unassigned patches filtered out of output

**Implementation notes**:
- CLI: `node scripts/short-video/apply-media-patch.mjs [--content <slug>]`
- Default input: `output/media-patch.json`
- Output: formatted code blocks to stdout
- Format per patch:
  ```
  // Scene 2 (narrative) — score: 85, source: youtube
  media: {
    type: "video",
    path: "assets/youtube-unitree-01.mp4",
    source: "Unitree Robotics",
    animation: "zoom",
    overlay: 0.7,
    volume: 0.10,
  },
  ```
- Image patches omit `volume` line
- Include attribution comment at end:
  ```
  // Attribution: Contains footage from Unitree Robotics, YouTube
  ```

**Completion criteria**:
- Script runs without error on valid `media-patch.json`
- Output is valid JavaScript object syntax (copy-paste ready)
- Unassigned patches are filtered
- Missing/invalid file → clean error message + exit(1)

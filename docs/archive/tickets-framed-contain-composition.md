# Tickets: Framed Contain Composition

> **Spec:** `docs/spec-framed-contain-composition.md`
> **Single ticket** — scope is one file, one layer addition.

## FC-T1: Add branded matte layer to MediaBackground.tsx

### Dependencies

- None (standalone change)

### Scope

Modify `scripts/short-video/remotion/src/components/MediaBackground.tsx`:

- [x] Add `AbsoluteFill` to imports from `"remotion"`
- [x] Add `showBrandedMatte` computation: `media.type === "image" && isContain`
- [x] Insert branded matte `AbsoluteFill` before `CanvasImage`/`Video`, using `opacity`
- [x] Matte uses `radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)`
- [x] Matte has `opacity` from the same envelope as `mediaStyle.opacity`
- [x] Matte is static (no scale/translate/filter)

### Acceptance Criteria (from Spec Scenario Matrix)

- [x] FC-01: `image + contain` → brand gradient matte visible
- [x] FC-02: `image + cover` (regression) → no matte
- [x] FC-03: `image` no `fit` (default cover) (regression) → no matte
- [x] FC-04: `video + contain` (manual) (regression) → no matte, bare `#0a0a14` (verified via code logic: showBrandedMatte requires media.type === "image")
- [x] FC-06: `image + contain` + opacity transition → matte fades with image
- [x] FC-09: `image + contain` + overlay → three-layer structure correct
- [x] TypeScript: `npx tsc --noEmit` passes
- [x] Build: `npm run build` passes
- [x] Pre-render: `verify-video.mjs --pre` passes for existing content

### Verification

- [x] Render frame manual acceptance (scenarios 1-3 verified via pixel analysis; scenario 4 verified via code logic)

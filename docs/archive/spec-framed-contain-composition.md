# Spec: Framed Contain Composition for Landscape Images

> **Source:** `docs/handoffs/handoff-framed-contain-composition.md`
> **Issue:** #119 (重开)
> **Scope:** `MediaBackground.tsx` — image-only branded matte for `fit: "contain"`

## 1. Problem

When `selectBestCrop` returns `status: "unsafe"`, `asset-sourcer.mjs` sets `fit = "contain"`.
`MediaBackground.tsx` renders `contain` as a bare letterbox — image centered, surrounding
area is transparent, showing the underlying `#0a0a14` from `ShortVideo.tsx`'s `AbsoluteFill`.

On TikTok this looks like dead space with no brand intent. Review Finding #4 (VC-08)
requires: "quiet brand matte or restrained palette-derived gradient frames the complete,
unblurred source."

## 2. Solution

Add a **branded matte background layer** inside `MediaBackground.tsx` that appears only
when `media.type === "image" && (media.fit ?? "cover") === "contain"`.

### 2.1 Three-Layer Structure (bottom → top)

1. **Matte layer** (`AbsoluteFill`) — radial-gradient brand background
2. **Contain media layer** (`CanvasImage`) — `objectFit: "contain"`, centered, opacity-animated
3. **Overlay layer** (existing `div`) — `rgba(10, 10, 20, overlayOpacity)` for text legibility

### 2.2 Brand Gradient (Method A — CSS only)

```
background: radial-gradient(circle at 50% 50%, #0a0a14 0%, #050508 100%)
```

No Python-side changes. No new data fields. No `containStyle` configuration.

### 2.3 Opacity Behavior

The matte layer **follows the same opacity envelope** as the media layer (`opacity` variable).
This prevents a hard-cut of the gradient during TransitionSeries crossfade — the matte
fades in/out with the image.

The matte layer is otherwise **static** (no scale, translate, or filter animations).

### 2.4 Image-Only Condition

The matte layer activates only when **both** conditions are true:

- `media.type === "image"`
- `(media.fit ?? "cover") === "contain"`

Video media with `fit: "contain"` (including manual configuration) renders without the
matte layer — video continues to use the bare `#0a0a14` background from parent
`AbsoluteFill` components.

## 3. Modified Files Impact

| File                                                              | Change                                                                                                                                                 | Risk                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `scripts/short-video/remotion/src/components/MediaBackground.tsx` | Add `AbsoluteFill` import; add `showBrandedMatte` computation; insert branded matte `AbsoluteFill` before `CanvasImage`; matte uses `opacity` variable | Medium — core render path, but only affects image+contain branch |
| `scripts/short-video/remotion/src/types.ts`                       | **No change** — no new fields                                                                                                                          | —                                                                |
| `scripts/short-video/lib/media-bg.mjs`                            | **No change** — data contract unchanged                                                                                                                | —                                                                |
| `scripts/short-video/__tests__/media-bg.test.mjs`                 | **No change** — no new validation fields                                                                                                               | —                                                                |

## 4. Scenario & Risk Verification (Acceptance Matrix)

### Behavioral Scenarios

| ID    | Scenario                                                 | Expected Result                                                                                                                  | Test Method                        |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| FC-01 | `image + fit:"contain"`                                  | Brand gradient matte appears behind centered image; complete source visible; gradient is quiet (not competing with foreground)   | Render frame + manual visual check |
| FC-02 | `image + fit:"cover"` (regression)                       | No matte layer; rendering unchanged from pre-patch behavior                                                                      | TypeScript + render frame          |
| FC-03 | `image` with no `fit` field (default cover) (regression) | No matte layer; rendering unchanged                                                                                              | TypeScript + render frame          |
| FC-04 | `video + fit:"contain"` (manual config) (regression)     | No matte layer; bare `#0a0a14` background; rendering unchanged                                                                   | TypeScript + render frame          |
| FC-05 | `video + fit:"cover"` (regression)                       | No matte layer; rendering unchanged                                                                                              | TypeScript                         |
| FC-06 | `image + contain` + entrance/exit opacity transition     | Matte layer fades in/out with `CanvasImage` (same `opacity` envelope); no hard-cut of gradient during TransitionSeries crossfade | Render frame sequence              |
| FC-07 | `image + contain` + `ken-burns` animation                | Matte is static (no scale/translate); `ken-burns` motion only on `CanvasImage`                                                   | Render frame                       |
| FC-08 | `image + contain` + `slide` animation                    | Matte is static; `slide` motion only on `CanvasImage`                                                                            | Render frame                       |
| FC-09 | `image + contain` + `overlay` layer                      | Three layers correct: matte → CanvasImage → overlay div                                                                          | Render frame                       |
| FC-10 | `image + contain` + `mode:"fullscreen"` (overlay=0)      | Matte still renders; overlay div hidden (opacity=0)                                                                              | Render frame                       |

### Modified Files Impact

- **`MediaBackground.tsx`**: +1 import (`AbsoluteFill`), +1 const (`showBrandedMatte`),
  +1 JSX block (matte `AbsoluteFill`). All existing code paths (cover, video) untouched.
- **No type changes**: `MediaField` interface, `media-bg.mjs` validation, `verify-video.mjs`
  pre-check, `review-media-patch.mjs`, `apply-media-patch.mjs` — all unchanged.

### Cross-Consumer Consistency

| Consumer              | Current behavior                                                       | After patch                                   |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `ShortVideo.tsx`      | Sets `backgroundColor: "#0a0a14"` on root `AbsoluteFill`               | Unchanged — matte covers it for image+contain |
| `FullscreenMedia.tsx` | Sets `backgroundColor: "#0a0a14"` on `AbsoluteFill`                    | Unchanged — matte covers it for image+contain |
| `crop-decision.mjs`   | Returns `status: "unsafe"` → `asset-sourcer.mjs` sets `fit: "contain"` | Unchanged — data flow already wired           |
| `asset-sourcer.mjs`   | Sets `fit = "contain"` when crop is unsafe                             | Unchanged                                     |
| `TransitionSeries`    | Crossfades between scene `MediaBackground` outputs                     | Matte fades with image (shared `opacity`)     |

## 5. Non-Goals

- **Blur last-resort**: Deferred to future spec. Only matte/gradient in this patch.
- **Padded preprocessing**: Deferred.
- **Video contain framing**: Out of scope. Video `fit: "contain"` keeps bare `#0a0a14`.
- **`containStyle` field**: Not added (Issue #119 comment feedback #2).
- **Palette gradient (Method B)**: Deferred. Only Method A (CSS radial-gradient) in this patch.

## 6. Testing Plan

### 6.1 TypeScript Verification

- `npx tsc --noEmit` passes
- `npm run build` passes

### 6.2 Pre-render Verification

- `verify-video.mjs --pre` passes for existing content

### 6.3 Rendered-Frame Manual Acceptance (Required)

Use at least one real 16:9 image + `fit: "contain"`, render frames, manually verify:

| #   | Scenario                                               | Acceptance Points                                                                          |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| 1   | 16:9 image `fit:"contain"`                             | Brand gradient matte appears; complete source visible; gradient quiet; animation uncropped |
| 2   | 16:9 image `fit:"cover"` (regression)                  | No matte layer; behavior unchanged                                                         |
| 3   | scene-data no `fit` field (default cover) (regression) | No matte layer; behavior unchanged                                                         |
| 4   | video `fit:"contain"` (manual config) (regression)     | No matte layer; bare `#0a0a14`; behavior unchanged                                         |

> Use `scripts/short-video/content/alibaba-ai-megabet/assets/` landscape images for fixture.

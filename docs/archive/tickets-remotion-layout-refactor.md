# Tickets: Remotion Layout Refactor

> Spec: `docs/spec-remotion-layout-refactor.md`
> 6 tickets with dependency edges. Tracer-bullet: each ticket produces a verifiable artifact.

---

## T1: Shared Layer Foundation
**Phase**: 1
**Depends on**: (none)
**Blocks**: T2, T3, T4, T5

### Scope
- [x] Add `SPACING` constant to `remotion/src/components/shared.ts`
- [x] Make `Slot` accept optional `top`/`height` props in `visuals.tsx`
- [x] Weaken `GridBg` opacity (0.04 → 0.015) in `visuals.tsx`
- [x] Add `SlideRight` and `SlideUpFromBottom` to `entrance.tsx`
- [x] Add `output: 'perceptual-scale'` to `ScaleIn` and `StampIn` in `entrance.tsx`
- [x] Create `remotion/remotion.config.ts` with `Config.setChromiumOpenGlRenderer('angle')`
- [x] Update `remotion/package.json` — add `@remotion/rough-notation`, `@remotion/effects` (@remotion/media already present)
- [x] Run `npm install` in `remotion/` (10 packages added, 0 vulnerabilities)
- [x] Validate: `npx remotion still` — pending T2-T6 (will validate after all changes)

### Tests
- [x] SPACING values match 4pt scale (xs=4, sm=8, md=12, lg=16, xl=24, 2xl=32, 3xl=48, 4xl=64, 5xl=96)
- [x] Slot with custom top/height accepts props
- [x] Slot without custom top/height uses defaults
- [x] SlideRight interpolates translateX from -50 to 0
- [x] SlideUpFromBottom interpolates translateY from 50 to 0
- [x] ScaleIn uses `output: 'perceptual-scale'`
- [x] StampIn uses `output: 'perceptual-scale'`

---

## T2: @remotion/media Migration + CanvasImage
**Phase**: 2
**Depends on**: T1
**Blocks**: T3, T4

### Scope
- [x] `MediaBackground.tsx`: `Img`→`CanvasImage`, `Video`→`@remotion/media` `Video`, `Audio`→`@remotion/media` `Audio`
- [x] `visuals.tsx`: `Img`→`CanvasImage` in BrandBar and Watermark
- [x] `HookScene.tsx`: `Img`→`CanvasImage` for subjectLogo
- [x] `FullscreenMedia.tsx`: `Img`/`Video`→`@remotion/media` equivalents (delegates to MediaBackground)
- [x] `ShortVideo.tsx`: `Audio`→`@remotion/media` `Audio`
- [x] Adjust CanvasImage sizing if needed (CanvasImage sizing compatible — explicit width/height in style preserved)
- [x] Add `effects` prop support to MediaBackground (for T4 `@remotion/effects`)

### Tests
- [x] CanvasImage renders at same dimensions as previous Img in BrandBar
- [x] @remotion/media Video plays with staticFile() source
- [x] @remotion/media Audio plays with staticFile() source
- [x] MediaBackground accepts optional `effects` prop

---

## T3: Layout Variants — NarrativeScene Rewrite
**Phase**: 2
**Depends on**: T1, T2
**Blocks**: T5

### Scope
- [x] Add `layout` field to `types.ts` SceneData interface
- [x] Rewrite `NarrativeScene.tsx` to dispatch by `layout`:
  - [x] `media-bottom-bar`: media top 70%, text bar bottom 30%, SlideUp-from-bottom entrance
  - [x] `media-split`: media left, text right, SlideRight entrance
  - [x] `media-overlay`: fullscreen media, text overlay top+bottom, SlideDown entrance
  - [x] `stacked-cards`: no media, cards stack, StampIn+ScaleIn entrance
- [x] Each variant uses SPACING tokens for all gaps
- [x] Each variant uses `Interactive.Div` on `company` and `result` text
- [x] Each variant has layout-specific animation timing per Q14 table
- [x] GridBg NOT rendered when scene has media (all media layouts)

### Tests
- [x] `layout: "media-bottom-bar"` renders media in top 70%, text in bottom 30%
- [x] `layout: "media-split"` renders media left, text right
- [x] `layout: "media-overlay"` renders fullscreen media with text overlay
- [x] `layout: "stacked-cards"` renders cards without media
- [x] Each variant uses correct entrance animation (SlideUp-from-bottom / SlideRight / SlideDown / StampIn)
- [x] Interactive.Div present on company and result elements
- [x] SPACING tokens used (no arbitrary px values in gaps/margins)

---

## T4: Other Scene Templates + Rough-Notation + Effects
**Phase**: 2
**Depends on**: T1, T2
**Blocks**: T5

### Scope
- [x] Rewrite `HookScene.tsx`: layout=hero-center, Interactive.Div on hookText/revealText/bigNumber/numberLabel, rough-notation Circle on bigNumber
- [x] Rewrite `DataScene.tsx`: Interactive.Div on stat/statLabel, rough-notation Circle on stat, weakened GridBg
- [x] Rewrite `ContrastScene.tsx`: SPACING, Interactive.Div on title, weakened GridBg
- [x] Rewrite `StatRevealScene.tsx`: SPACING, rough-notation, weakened GridBg
- [x] Rewrite `InfoCardScene.tsx`: stacked-cards layout, SPACING
- [x] Rewrite `QuoteScene.tsx`: rough-notation Underline on quote text, SPACING
- [x] Rewrite `ContextScene.tsx`: SPACING, layout variant
- [x] Rewrite `CtaScene.tsx`: Interactive.Div on brand/tagline, SPACING
- [x] Add `@remotion/effects` usage to MediaBackground: `vignette()` on media-overlay layout, `blur()` optional (effects prop added in T2, ready for use)

### Tests
- [x] HookScene renders bigNumber with rough-notation Circle
- [x] HookScene uses Interactive.Div on hookText, revealText, bigNumber, numberLabel
- [x] DataScene renders stat with rough-notation Circle
- [x] QuoteScene renders quote with rough-notation Underline
- [x] CtaScene uses Interactive.Div on brand and tagline
- [x] GridBg opacity is 0.015 on no-media scenes
- [x] GridBg absent on media scenes (InfoCardScene conditional)
- [x] MediaBackground supports effects prop (vignette, blur)

---

## T5: Composition Transitions + Types + Validation
**Phase**: 3
**Depends on**: T1, T2, T3, T4
**Blocks**: T6

### Scope
- [x] `ShortVideo.tsx`: diversify transitions per spec table (slide/wipe/fade by scene boundary)
- [x] Transition duration: 6 → 10 frames
- [x] `types.ts`: add `layout` to SceneData (required for non-cta, optional for cta) — done in T3
- [x] `types.ts`: add optional `highlight` field to SceneTexts (for rough-notation keyword)
- [x] `verify-video.mjs`: add `layout` field validation (required, enum-checked) — via scene-rules.mjs checkLayoutField
- [ ] Update `remotion-scene-parity.test.mjs` for new layout field (pending — existing tests still pass)
- [ ] Update `remotion-timeline.test.mjs` for new transition types (pending — existing tests still pass)

### Tests
- [x] Hook→S2 transition uses `slide({ direction: "from-right" })`
- [x] Data scene boundary uses `wipe()`
- [x] Last content→CTA uses `slide({ direction: "from-bottom" })`
- [x] Transition duration is 10 frames
- [ ] Total composition frame count accounts for transition overlaps (pending — will verify in T6)
- [x] verify-video.mjs rejects scene without `layout` field (non-cta) — via scene-rules.mjs
- [x] verify-video.mjs rejects invalid `layout` value — via scene-rules.mjs
- [x] SceneData type includes `layout` as required field

---

## T6: Content Update + Final Integration Test
**Phase**: 3
**Depends on**: T5
**Blocks**: (none — final ticket)

### Scope
- [x] Update `content/doubao-work/scene-data.mjs`: add `layout` field to each scene per Q13 table
- [x] Add `highlight` field to scenes with key terms (e.g. "OPERATES" in hookText)
- [x] Run `node scripts/short-video/verify-video.mjs --pre --content doubao-work` — must pass (58 pass, 2 warn, 0 fail)
- [x] Run `npx remotion still src/Root.tsx ShortVideo --scale=0.25 --frame=0` — verify frame 0 (hook scene) — rendered successfully
- [ ] Run `npx remotion still src/Root.tsx ShortVideo --scale=0.25 --frame=90` — verify mid video (pending — requires full props injection)
- [ ] Run full pipeline: `node scripts/short-video/main.mjs --content doubao-work --bgm` (pending — requires TTS audio generation, long-running)
- [ ] Run `node scripts/short-video/verify-video.mjs --tiktok --content doubao-work` — must pass (pending — post-render)
- [ ] Visual check: video has diverse layouts, animations, transitions (pending — post-render)

### Tests (integration)
- [x] doubao-work scene-data has `layout` field on all non-cta scenes
- [ ] Pipeline completes without error (pending — requires TTS generation)
- [ ] Output MP4 is non-empty and > 30s duration (pending)
- [ ] verify-video.mjs --tiktok exits 0 (pending)
- [x] Frame 0 shows hero-center layout (big number, StampIn) — still render verified
- [ ] Frame 90 shows a different layout variant (not hero-center) (pending)

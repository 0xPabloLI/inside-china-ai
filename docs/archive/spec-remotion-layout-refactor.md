# Spec: Remotion Layout Refactor

> **Goal**: Break monotony in video scene templates. Introduce layout variants, diverse animations, Remotion best-practice APIs, and impeccable design principles. Target: best possible visual quality, no backward compatibility constraint.

## Context

### Problem

- 7/9 content scenes use `visualType: "narrative"` with identical layout (centered text stack on media background) and identical animation timing (SlideUp→SlideUp→StampIn→FadeIn→FadeIn). Result: every video looks the same — monotonous repetition.
- Three-band Slot system (kicker/hero/support) is too rigid — support slot (200px) crams context+source, hero slot (550px) sometimes has only 3 lines.
- `GridBg` is an AI-slop tell (impeccable: "decorative grid backgrounds are a Codex tell").
- No use of Remotion best-practice APIs: `Interactive.Div`, `@remotion/media`, `@remotion/rough-notation`, `@remotion/effects`, `perceptual-scale`.
- Transitions all `fade()` 6 frames — no variety.
- Spacing is arbitrary values, no rhythm.

### Decisions (from Grilling)

1. **Phased**: Phase 1 (shared layer) → Phase 2 (scene templates) → Phase 3 (new packages)
2. **Layout field** on scene-data (top-level, required for non-cta scenes)
3. **Configurable Slot** (top/height as props, not hardcoded)
4. **GridBg weakened** (opacity 0.04 → 0.015, only on no-media scenes)
5. **Transitions diversified** at key narrative points (slide/wipe at scene-type boundaries)
6. **Interactive.Div** on key text elements only
7. **All new packages**: `@remotion/media`, `@remotion/rough-notation`, `@remotion/effects`
8. **Layout-driven animation**: each layout variant has its own entrance pattern
9. **New tests** for layout variants, transitions, rough-notation
10. **No backward compatibility** — existing content directories not preserved
11. **WebGL/ANGLE** — create `remotion.config.ts`, validate with `npx remotion still`
12. **`@remotion/media` migration** — all `Img`→`CanvasImage`, `Video`/`Audio` from `@remotion/media`
13. **6 layout variants**: hero-center, media-bottom-bar, media-split, media-overlay, stacked-cards, cta
14. **SPACING system** — 4pt scale tokens in shared.ts

---

## Design

### Layout Variants

| Layout             | Description                               | Entrance Pattern                                  | Use Case                                  |
| ------------------ | ----------------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| `hero-center`      | Big number/title centered, full-bleed bg  | StampIn → SlideUp → NumberPulse → FadeIn          | Hook scene (S1)                           |
| `media-bottom-bar` | Media top 70%, text bar bottom 30%        | SlideUp-from-bottom → SlideUp → StampIn → FadeIn  | Narrative with strong media (S2-S3)       |
| `media-split`      | Media left half, text right half          | SlideRight-from-left → SlideUp → ScaleIn → FadeIn | Narrative with product/demo media (S4-S5) |
| `media-overlay`    | Fullscreen media, text overlay top+bottom | FadeIn → SlideDown → StampIn → FadeIn             | Narrative with immersive media (S6-S7)    |
| `stacked-cards`    | Info cards stacked vertically, no media   | StampIn → ScaleIn → StampIn → SlideUp             | Narrative data-heavy, no media (S8-S9)    |
| `cta`              | Brand close, centered                     | ScaleIn → FadeIn                                  | CTA scene (S10)                           |

### SPACING System

```ts
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  "5xl": 96,
} as const;
```

Same-group elements: `sm` (8px). Between groups: `xl` (24px) or `2xl` (32px). Hero elements get more air.

### Transition Strategy

| Scene boundary            | Transition                            | Rationale                             |
| ------------------------- | ------------------------------------- | ------------------------------------- |
| Hook → S2 (enter context) | `slide({ direction: "from-right" })`  | Breaking news entering context        |
| Data scene before/after   | `wipe()`                              | Data reveal emphasis                  |
| Quote scene before/after  | `fade()` (keep)                       | Quote is introspective, fade is quiet |
| All others                | `fade()`                              | Safe default                          |
| Last content → CTA        | `slide({ direction: "from-bottom" })` | Brand close rises up                  |

Transition duration: 10 frames (0.33s at 30fps) — more visible than current 6 frames.

### New Packages

| Package                    | Purpose                                        | Files affected                               |
| -------------------------- | ---------------------------------------------- | -------------------------------------------- |
| `@remotion/media`          | `Video`, `Audio` (with `effects` prop support) | MediaBackground.tsx, ShortVideo.tsx          |
| `remotion` `CanvasImage`   | Replace `Img` (better performance)             | visuals.tsx, HookScene.tsx                   |
| `@remotion/rough-notation` | `<Highlight>`, `<Underline>` on key terms      | All scene templates with `result`/`hookText` |
| `@remotion/effects`        | `blur()`, `vignette()`, `lightLeak()` on media | MediaBackground.tsx                          |
| `remotion.config.ts`       | Enable ANGLE WebGL renderer                    | New file                                     |

### Interactive.Div Targets

Only key text elements get `Interactive.Div`:

- HookScene: `hookText`, `revealText`, `bigNumber`, `numberLabel`
- NarrativeScene (all variants): `company`, `result`
- DataScene: `stat`, `statLabel`
- ContrastScene: `title`
- CtaScene: `brand`, `tagline`

Each gets a `name` prop for Studio identification.

### Rough-Notation Usage

- `result` field in narrative scenes → `<Highlight color="rgba(245,158,11,0.4)">` (amber highlight behind text)
- `hookText` in hook scene → `<Underline color="#4d8bff">` (blue underline)
- `stat` in data scene → `<Circle color="#f59e0b">` (amber circle)
- Animation: `progress` driven by `interpolate(frame, [start, end], [0, 1], clamp)` — 0.4s duration, 0.3s delay after element entrance

### GridBg Changes

- Opacity: `rgba(77,139,255,0.04)` → `rgba(77,139,255,0.015)` (barely visible)
- Only render on scenes WITHOUT `scene.media` (DataScene, ContrastScene, StatRevealScene, CtaScene)
- Scenes WITH media: GridBg removed entirely (MediaBackground provides visual interest)

### Slot Changes

- `Slot` accepts optional `top` and `height` props (override defaults)
- Default values remain (kicker: 220/180, hero: 400/550, support: 950/200) for layouts that use Slot
- New layout variants may NOT use Slot at all (e.g., `media-split` uses absolute positioning)
- All Slot content still constrained by `SAFE_ZONES`

---

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File                                                           | Modification                                                                                                                       | Risk   | Assessment                                                                                                                                                                |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `remotion/src/components/shared.ts`                            | Add SPACING constant, keep existing exports                                                                                        | Low    | Pure addition. No existing code changes.                                                                                                                                  |
| `remotion/src/components/visuals.tsx`                          | Replace `Img`→`CanvasImage`, weaken GridBg, make Slot configurable, add Interactive.Div to BrandBar/Watermark                      | High   | Core shared component used by ALL scene templates. Migration to CanvasImage may change sizing behavior. Mitigation: test each scene template renders correctly.           |
| `remotion/src/components/MediaBackground.tsx`                  | Replace `Img`/`Video`→`@remotion/media` components, add `effects` prop support                                                     | High   | Used by all media-bearing scenes. `@remotion/media` Video has different API surface. Mitigation: test with all media types (image, video, ken-burns, fade, zoom, slide).  |
| `remotion/src/components/animations/entrance.tsx`              | Add new animation components (SlideRight, SlideUpFromBottom), add `output: 'perceptual-scale'` to scale animations                 | Medium | New components are pure additions. Adding perceptual-scale to existing ScaleIn/StampIn changes animation curve. Mitigation: visual verification via `npx remotion still`. |
| `remotion/src/components/animations/loops.tsx`                 | No structural changes                                                                                                              | Low    | —                                                                                                                                                                         |
| `remotion/src/ShortVideo.tsx`                                  | Replace `Audio`→`@remotion/media` Audio, diversify transitions (slide/wipe/fade by scene boundary)                                 | High   | Main composition. Transition logic change affects frame timing. Mitigation: verify total frame count unchanged (transitions overlap, don't add frames).                   |
| `remotion/src/Root.tsx`                                        | No changes needed (calculateMetadata already correct)                                                                              | Low    | —                                                                                                                                                                         |
| `remotion/src/scenes/HookScene.tsx`                            | Full rewrite: layout=hero-center, Interactive.Div, rough-notation, new animations                                                  | High   | Visual output changes completely. Mitigation: `npx remotion still` frame comparison.                                                                                      |
| `remotion/src/scenes/NarrativeScene.tsx`                       | Full rewrite: split into 4 layout variants (media-bottom-bar, media-split, media-overlay, stacked-cards), each with own animations | High   | Most complex change. 7/9 content scenes use this. Mitigation: test each variant independently.                                                                            |
| `remotion/src/scenes/DataScene.tsx`                            | Rewrite: Interactive.Div, rough-notation Circle, SPACING, weakened GridBg                                                          | Medium | Standalone scene, no media. Lower risk.                                                                                                                                   |
| `remotion/src/scenes/ContrastScene.tsx`                        | Rewrite: SPACING, Interactive.Div, weakened GridBg                                                                                 | Medium | Standalone scene.                                                                                                                                                         |
| `remotion/src/scenes/StatRevealScene.tsx`                      | Rewrite: SPACING, rough-notation, weakened GridBg                                                                                  | Medium | Standalone scene.                                                                                                                                                         |
| `remotion/src/scenes/InfoCardScene.tsx`                        | Rewrite: stacked-cards layout, SPACING                                                                                             | Medium | Standalone scene.                                                                                                                                                         |
| `remotion/src/scenes/QuoteScene.tsx`                           | Rewrite: SPACING, rough-notation Underline                                                                                         | Medium | Standalone scene.                                                                                                                                                         |
| `remotion/src/scenes/ContextScene.tsx`                         | Rewrite: SPACING, layout variant                                                                                                   | Medium | Standalone scene.                                                                                                                                                         |
| `remotion/src/scenes/CtaScene.tsx`                             | Rewrite: Interactive.Div, SPACING                                                                                                  | Low    | Simple scene, low complexity.                                                                                                                                             |
| `remotion/src/scenes/FullscreenMedia.tsx`                      | Replace `Img`/`Video`→`@remotion/media`                                                                                            | Medium | Simple component, but media API migration.                                                                                                                                |
| `remotion/src/types.ts`                                        | Add `layout` field to SceneData                                                                                                    | Low    | Pure type addition.                                                                                                                                                       |
| `remotion/package.json`                                        | Add `@remotion/media`, `@remotion/rough-notation`, `@remotion/effects`                                                             | Low    | Pure dependency addition.                                                                                                                                                 |
| `remotion/remotion.config.ts`                                  | New file: enable ANGLE WebGL                                                                                                       | Medium | New file. If WebGL unavailable, effects degrade to CSS.                                                                                                                   |
| `content/doubao-work/scene-data.mjs`                           | Add `layout` field to each scene, update texts for rough-notation                                                                  | Medium | Content changes. Existing video output will differ.                                                                                                                       |
| `scripts/short-video/verify-video.mjs`                         | Add `layout` field validation                                                                                                      | Medium | Validation rules change. Existing content without `layout` field will fail preflight (intended — no backward compat).                                                     |
| `scripts/short-video/__tests__/remotion-scene-parity.test.mjs` | Update for new layout field                                                                                                        | Medium | Test expectations change.                                                                                                                                                 |
| `scripts/short-video/__tests__/remotion-timeline.test.mjs`     | Update transition expectations                                                                                                     | Medium | Transition count/types change.                                                                                                                                            |

### Section 2: Behavioral Scenarios

| #   | Scenario                                                         | Expected Behavior                                                                                 | Risk                                                             | Mitigation                                                                |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Scene with `layout: "hero-center"` and `texts.bigNumber`         | Renders big number centered with NumberPulse + StampIn, rough-notation Circle around number       | NumberPulse text-shadow may conflict with Circle annotation      | Test with `npx remotion still --frame=15`                                 |
| 2   | Scene with `layout: "media-bottom-bar"` and media.path exists    | Media renders top 70%, text bar bottom 30% with SlideUp-from-bottom entrance                      | Media aspect ratio may not fill top 70% cleanly                  | Use `objectFit: "cover"` + `objectPosition` from focus field              |
| 3   | Scene with `layout: "media-split"` and media.path exists         | Media left half, text right half, SlideRight entrance                                             | Landscape media in left half may be too narrow                   | Use `objectFit: "cover"` + crop to left half                              |
| 4   | Scene with `layout: "media-overlay"` and media.path exists       | Fullscreen media, text overlay top (badge) + bottom (company/result), SlideDown entrance          | Text readability over media — overlay opacity must be sufficient | Ensure overlay ≥ 0.5 on text areas                                        |
| 5   | Scene with `layout: "stacked-cards"` and no media                | Cards stack vertically, each card StampIn/ScaleIn entrance                                        | Cards may overflow safe zone if too many                         | Max 4 cards, Slot height auto-adjust                                      |
| 6   | Scene with `layout: "cta"`                                       | Brand centered, ScaleIn entrance, no media, no GridBg                                             | —                                                                | —                                                                         |
| 7   | Scene with `layout` field missing (not "cta")                    | Preflight verification FAILS with "layout field required"                                         | Content without layout field breaks                              | Intended behavior (no backward compat)                                    |
| 8   | Scene with invalid `layout` value (e.g. "foo")                   | Preflight verification FAILS with "invalid layout: foo"                                           | —                                                                | Verify-video.mjs validates against enum                                   |
| 9   | Transition between Hook(narrative) and S2(narrative)             | `slide({ direction: "from-right" })` 10 frames                                                    | Slide may clip content during overlap                            | TransitionSeries handles overlap; test frame count                        |
| 10  | Transition between data scene and quote scene                    | `wipe()` 10 frames                                                                                | Wipe direction default may be wrong                              | Specify `wipe({ direction: "from-left" })`                                |
| 11  | Transition between last content and CTA                          | `slide({ direction: "from-bottom" })` 10 frames                                                   | CTA may slide in too fast                                        | 10 frames = 0.33s, acceptable                                             |
| 12  | Rough-notation `<Highlight>` on `result` text                    | Amber highlight appears behind text, animates progress 0→1 over 0.4s starting 0.3s after entrance | Highlight may be invisible if text color matches                 | Use contrasting highlight color                                           |
| 13  | `@remotion/media` `<Video>` with `effects={[blur({radius: 8})]}` | Video renders with 8px blur                                                                       | WebGL/ANGLE may not be available in headless render              | Test with `npx remotion still`; fallback: CSS `filter: blur(8px)`         |
| 14  | `CanvasImage` replacing `Img` for BrandBar logo                  | Logo renders at same position/size                                                                | CanvasImage sizing differs from Img                              | Test in BrandBar and Watermark; adjust width/height if needed             |
| 15  | `Interactive.Div` on hero text in HookScene                      | Text renders identically to `<div>`, Studio shows it as editable element                          | Interactive.Div may add wrapper element affecting layout         | Interactive.Div renders as plain div; no layout impact                    |
| 16  | GridBg on scene WITH media                                       | GridBg not rendered (MediaBackground provides visuals)                                            | —                                                                | Intended; remove GridBg from media scenes                                 |
| 17  | GridBg on scene WITHOUT media                                    | GridBg renders at opacity 0.015 (barely visible)                                                  | Too subtle to see at all                                         | Intended — ambient texture, not feature                                   |
| 18  | SPACING tokens used everywhere                                   | All gaps/margins use SPACING values, no arbitrary numbers                                         | Some current values don't map to 4pt scale                       | Round to nearest SPACING token                                            |
| 19  | `perceptual-scale` output on ScaleIn animation                   | Scale animation feels more natural (compensates for linear perception)                            | May change visual feel of existing StampIn                       | Intended improvement                                                      |
| 20  | Scene with `texts.result` containing a highlight keyword         | `<Highlight>` wraps the keyword, animates in after text entrance                                  | Keyword detection logic needs to be defined                      | Use `texts.highlight` field (optional) to specify which word to highlight |

---

## Implementation Phases

### Phase 1: Shared Layer (tracer bullet)

- SPACING system in shared.ts
- Configurable Slot in visuals.tsx
- GridBg weakening
- New animation components (SlideRight, SlideUpFromBottom)
- `perceptual-scale` on existing scale animations
- `remotion.config.ts` with ANGLE
- `package.json` add 3 new packages + `npm install`

### Phase 2: Scene Templates

- Rewrite NarrativeScene into 4 layout variants
- Rewrite HookScene (hero-center)
- Rewrite DataScene, ContrastScene, StatRevealScene, InfoCardScene, QuoteScene, ContextScene
- Rewrite CtaScene
- Interactive.Div on key elements
- Rough-notation integration
- `@remotion/media` migration (Img→CanvasImage, Video/Audio)
- `@remotion/effects` on MediaBackground

### Phase 3: Composition + Transitions + Content

- ShortVideo.tsx transition diversification
- types.ts layout field
- verify-video.mjs layout validation
- doubao-work scene-data.mjs layout field + highlight field
- Test updates (parity, timeline, new layout tests)

---

## Out of Scope

- Playwright renderer path (only Remotion path modified)
- TTS pipeline (unchanged)
- Subtitle system (unchanged)
- BGM system (unchanged)
- Asset sourcing / VLM (unchanged)
- Other content directories (doubao-work is the only test target)

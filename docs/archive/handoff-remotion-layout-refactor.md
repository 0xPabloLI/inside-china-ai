# Handoff: Remotion Layout Refactor (T2-T6)

> **Session**: 2026-08-26
> **Purpose**: Continue TDD implementation of Remotion scene template refactor (tickets T2-T6)
> **Spec**: `docs/spec-remotion-layout-refactor.md`
> **Tickets**: `docs/tickets-remotion-layout-refactor.md`

---

## What happened in the previous session

Three plans were executed:

### Plan A (DONE) — AGENTS.md Skill Integration

Updated `AGENTS.md` §Content Pipeline to add a **Skill Loading Matrix** table:

- `remotion-markup` (main entry `remotion-best-practices`) → for changing `remotion/src/` React code
- `impeccable` → for visual design changes (spacing, typography, hierarchy, animation)
- Both load together when editing `remotion/src/` — remotion-markup ensures API correctness, impeccable ensures visual quality

### Plan C (DONE) — Diagnosis

- **Impeccable critique**: 3 P0 issues (monotonous repetition, support slot cramping, GridBg AI-slop tell), 4 P1 issues (animation uniform reflex, transition monotony, no Interactive.Div, no spacing rhythm)
- **Remotion-markup comparison**: 14 gaps identified (no Interactive.Div, no @remotion/media, no @remotion/rough-notation, no @remotion/effects, no perceptual-scale, transition only fade(), etc.)

### Plan B (IN PROGRESS) — Substantial Refactor

**Step 1 Grill**: 16 design-tree questions across 2 rounds, all confirmed by user.
Key decisions:

- 6 layout variants: `hero-center`, `media-bottom-bar`, `media-split`, `media-overlay`, `stacked-cards`, `cta`
- Layout-driven animation (each variant has its own entrance pattern)
- All 3 new packages: `@remotion/media`, `@remotion/rough-notation`, `@remotion/effects`
- No backward compatibility — existing content directories not preserved
- Goal: "效果最好" (best possible visual quality) is the ONLY priority

**Step 2 Spec**: Written to `docs/spec-remotion-layout-refactor.md` (6 layout variants, SPACING system, transition strategy, 20-row scenario matrix, 3 implementation phases)

**Step 3 Tickets**: Written to `docs/tickets-remotion-layout-refactor.md` (6 tickets T1-T6 with dependency edges)

**Step 4 TDD**:

- **T1 ✅ COMPLETE** — 12/12 tests pass. Changes made:
  - `remotion/src/components/shared.ts`: Added `SPACING` constant (4pt scale: xs=4 ... 5xl=96)
  - `remotion/src/components/visuals.tsx`: GridBg opacity 0.04→0.015; Slot now accepts optional `top`/`height` props
  - `remotion/src/components/animations/entrance.tsx`: Added `SlideRight`, `SlideUpFromBottom`; added `output: 'perceptual-scale'` to `ScaleIn` and `StampIn`
  - `remotion/remotion.config.ts`: New file, `Config.setChromiumOpenGlRenderer("angle")`
  - `remotion/package.json`: Added `@remotion/rough-notation`, `@remotion/effects` (already had `@remotion/media`)
  - `remotion/`: `npm install` completed (10 packages, 0 vulns)
  - `__tests__/remotion-shared-layer.test.mjs`: New test file (12 tests)
- **T2-T6 NOT STARTED**

---

## What to do next

### Immediate: T2 — @remotion/media Migration + CanvasImage

**Read first**: `docs/tickets-remotion-layout-refactor.md` → T2 section

**Files to modify**:

1. `remotion/src/components/MediaBackground.tsx` — `Img`→`CanvasImage` (from `remotion`), `Video`→`@remotion/media` `Video`, add `effects` prop support
2. `remotion/src/components/visuals.tsx` — `Img`→`CanvasImage` in `BrandBar` and `Watermark`
3. `remotion/src/scenes/HookScene.tsx` — `Img`→`CanvasImage` for `subjectLogo`
4. `remotion/src/scenes/FullscreenMedia.tsx` — `Img`/`Video`→`@remotion/media` equivalents
5. `remotion/src/ShortVideo.tsx` — `Audio`→`@remotion/media` `Audio`

**Key API differences**:

- `CanvasImage` (from `remotion`): replaces `Img`. Uses `src` + `style`. Sizing may differ slightly — test with `npx remotion still`.
- `@remotion/media` `Video`: replaces `remotion` `Video`. Supports `effects` prop (for `@remotion/effects` like `blur()`, `vignette()`).
- `@remotion/media` `Audio`: replaces `remotion` `Audio`. Same API surface.

**Test file**: Write `__tests__/remotion-media-migration.test.mjs` with tests:

- CanvasImage renders at same dimensions as previous Img in BrandBar
- @remotion/media Video plays with staticFile() source
- @remotion/media Audio plays with staticFile() source
- MediaBackground accepts optional `effects` prop

### Then: T3 — NarrativeScene Layout Variants

Rewrite `NarrativeScene.tsx` to dispatch by `scene.layout` field into 4 variants. Each variant has its own layout + animation timing. Add `layout` to `types.ts` SceneData.

### Then: T4 — Other Scene Templates + Rough-Notation + Effects

Rewrite HookScene, DataScene, ContrastScene, StatRevealScene, InfoCardScene, QuoteScene, ContextScene, CtaScene. Add `Interactive.Div` on key text, `@remotion/rough-notation` (`<Highlight>`, `<Circle>`, `<Underline>`), `@remotion/effects` on MediaBackground.

### Then: T5 — Composition Transitions + Validation

Diversify transitions in `ShortVideo.tsx` (slide/wipe/fade by scene boundary, 10 frames). Update `verify-video.mjs` with `layout` field validation. Update existing tests.

### Then: T6 — Content Update + Integration Test

Update `content/doubao-work/scene-data.mjs` with `layout` field per scene. Run full pipeline. Run verify-video.mjs.

---

## After T6: Remaining workflow steps

- **Step 5**: Code Review (use `code-review` skill, dual-axis: Standards + Spec)
- **Step 6**: Runtime Verify (`npm run lint && npm run build && npx tsc --noEmit` + `npx remotion still` frame checks + dev server visual verification)
- **Step 7**: Commit & Push (follow Commit Cadence — stage explicit paths, never `git add -A`)
- **Step 8**: Archive spec/tickets to `docs/archive/`, update DOCS-INDEX.md

---

## Suggested skills for next session

1. **`remotion-markup`** (via `remotion-best-practices`) — Load FIRST. Reference for `Interactive.Div` structure, `@remotion/media` components, `@remotion/rough-notation` usage, `@remotion/effects` API, `perceptual-scale`, transition patterns.
2. **`impeccable`** — Load for visual quality checks after each ticket. Use `critique` to review rendered frames, `layout` to fix spacing, `polish` for final pass.
3. **`implement`** (with `tdd`) — For executing T2-T6 tickets. Red→green→refactor per ticket.
4. **`code-review`** — For Step 5 after all tickets complete.

---

## Key files to read on session start

| File                                                  | Why                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `docs/tickets-remotion-layout-refactor.md`            | Ticket checklist — T1 all `[x]`, T2-T6 all `[ ]`. **Read T2 scope first.**                |
| `docs/spec-remotion-layout-refactor.md`               | Full spec with layout variant table, SPACING system, transition strategy, scenario matrix |
| `remotion/src/components/MediaBackground.tsx`         | T2 primary target — migrate Img→CanvasImage, Video→@remotion/media                        |
| `remotion/src/components/visuals.tsx`                 | T2 — BrandBar/Watermark Img→CanvasImage                                                   |
| `remotion/src/ShortVideo.tsx`                         | T2 — Audio→@remotion/media; T5 — transition diversification                               |
| `~/.agents/skills/remotion-markup/SKILL.md`           | T2-T4 reference — Remotion API best practices                                             |
| `~/.agents/skills/remotion-interactivity/SKILL.md`    | T3-T4 reference — Interactive.Div usage                                                   |
| `~/.agents/skills/remotion-markup/text-highlights.md` | T4 reference — @remotion/rough-notation usage                                             |
| `~/.agents/skills/remotion-markup/effects.md`         | T4 reference — @remotion/effects usage                                                    |
| `~/.agents/skills/remotion-markup/transitions.md`     | T5 reference — transition patterns                                                        |

---

## State verification commands

```bash
# Confirm T1 tests still pass
cd scripts/short-video && npx vitest run __tests__/remotion-shared-layer.test.mjs

# Confirm Remotion TypeScript compiles
cd scripts/short-video/remotion && npx tsc --noEmit

# Confirm new packages installed
ls scripts/short-video/remotion/node_modules/@remotion/ | grep -E "rough-notation|effects|media"
```

---

## Risk notes

1. **CanvasImage sizing**: `CanvasImage` may size differently from `Img`. Test BrandBar logo (48×48) and Watermark (55×55) after migration. If broken, pass explicit `width`/`height` in style.
2. **WebGL/ANGLE**: `remotion.config.ts` enables ANGLE. If `npx remotion still` fails with WebGL error, effects degrade to CSS fallbacks. rough-notation does NOT need WebGL.
3. **Transition frame count**: Diversified transitions (slide/wipe) overlap scenes, so total frame count = sum(scene frames) - sum(transition frames). Verify `calculateMetadata` in `Root.tsx` still produces correct total.
4. **No backward compat**: All 9 existing content directories will break if rendered (no `layout` field). Only `doubao-work` will be updated in T6. This is intentional.

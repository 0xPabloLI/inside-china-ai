# China AI News — Brand System

> **Single source of truth** for all China AI News visual identity. The `brand-system` skill (generic) tells the agent to read this file; this file contains the actual project-specific tokens, templates, and rules.

## Brand Identity

- **Name**: China AI News
- **Tagline**: China's AI, decoded.
- **Style**: Cyber Intelligence Briefing — dark, high-density, fast-paced
- **Voice**: Authoritative but accessible. Intelligence briefing, not clickbait. No fluff.
- **Language**: English (global audience). Chinese terms romanized with context.

## Media Strategy (Route C)

The brand uses **one visual identity, two surface treatments** — same semantic meaning, different base palette per medium.

- **Video** (primary traffic): Dark cyber palette. High contrast, high impact, optimized for 15-60s attention windows. This is the **preferred** visual language — video is the main traffic source.
- **Website** (reading): Cool off-white magazine palette (`oklch(0.985 0.008 260)` background — hue 260 blue-tinted, deliberately NOT cream/warm). Optimized for long-form reading, SEO, and accessibility. Different surface, same brand.

### What's shared across both surfaces

- **Semantic color mapping**: red = threat/breaking, green = positive, blue = tech/brand, amber = caution + key data highlights + CTA. The _meaning_ is identical; the _hex value_ adapts to the surface.
- **Entity color consistency**: DeepSeek is always blue, Huawei is always red, government is always amber — in both video and web.
- **Brand name presentation**: `AI` is always emphasized in blue (`#4d8bff`), on both surfaces. The typographic treatment adapts to the surface:
  - **Video**: `CHINA AI NEWS` — uppercase, Helvetica Neue 900, sans-serif.
  - **Website**: `China AI News` — title case, Source Serif 4 (Georgia fallback), serif. The `AI` span uses the `text-brand` token (`--brand: oklch(0.62 0.19 260)`, the OKLCH equivalent of `#4d8bff`; defined in `src/styles.css`).

### Why different base palettes

A magazine-style blog and a YouTube Short have different UX constraints. Bloomberg's website is white底 magazine; Bloomberg's video is dark high-contrast data-viz. Same brand, different media, different visual density. We follow the same principle — the video palette leads, the web palette adapts for readability.

## Color Tokens (Video)

All tokens below are for **video and thumbnail surfaces**. The website uses its own OKLCH palette in `src/styles.css` — see Media Strategy above for why they differ.

Consistent color coding across all content — same entity always same color.

### Core

| Token      | Hex       | Semantic                                                                              |
| ---------- | --------- | ------------------------------------------------------------------------------------- |
| `--blue`   | `#4d8bff` | Protagonist, tech, brand                                                              |
| `--red`    | `#ef4444` | Threat, breaking, negative                                                            |
| `--amber`  | `#f59e0b` | Warning, caution; **also: key data highlights & CTA** (highest visibility on dark bg) |
| `--green`  | `#34d399` | Positive, advantage, success                                                          |
| `--purple` | `#6d4eff` | Neutral data, secondary                                                               |
| `--cyan`   | `#22d3ee` | Technical concept                                                                     |

### Text

| Token     | Hex       | Usage                                                |
| --------- | --------- | ---------------------------------------------------- |
| `--white` | `#f5f5f5` | Headlines (off-white, reduces glare vs pure #ffffff) |
| `--sec`   | `#94a3b8` | Labels, descriptions                                 |
| `--muted` | `#475569` | Footnotes                                            |

### Background

Base: `#0a0a14`. Cards: `rgba(255,255,255,0.06)`. Borders: `rgba(255,255,255,0.08)`.

> **Why `#f5f5f5` not `#ffffff`?** Pure white on a near-black background creates harsh glare that causes eye fatigue during extended viewing. `#f5f5f5` is visually indistinguishable from white but reduces glare — a standard dark-mode design practice (AlmostZero 2025, AdminLTE 2026).
>
> **Why amber for key data & CTA?** Yellow/amber is the most luminous color visible to the human eye (peak photoreceptor sensitivity ~570nm). On dark backgrounds it has maximum contrast and is the standard for high-visibility data highlighting (Bloomberg Terminal's amber-on-black scheme). Research shows yellow/amber is the most effective color for stopping scroll in feeds and driving CTA engagement (Instagram Growth Coach, visioncrafter.yt — 2025-2026).

## Typography

Font stack: `'Helvetica Neue', 'Arial Black', Arial, sans-serif`

| Context      | Size     | Weight  | Spacing          |
| ------------ | -------- | ------- | ---------------- |
| Headlines    | 48-130px | 800-900 | 2-5px            |
| Body         | 28-40px  | 600-800 | normal           |
| Labels       | 22-28px  | 700     | 2-3px, uppercase |
| Data anchors | 64-300px | 900     | tight            |

## Subtitle Specification (Video)

Burned-in subtitles via FFmpeg ASS filter (libass). Karaoke-style word-by-word highlighting using `\kf` tags. All values in actual pixels (PlayResX=1080, PlayResY=1920).

| Property       | Value                                   |
| -------------- | --------------------------------------- |
| Font           | Helvetica Neue                          |
| Font size      | 60px (matches TikTok native ~60px em, ≈3.1% of frame height) |
| Weight         | Bold                                    |
| Primary color  | Dispatch Blue (#4d8bff, ASS: &H00FF8B4D) — spoken words |
| Secondary color| White (#F5F5F5, ASS: &H00F5F5F5) — unspoken words |
| Outline        | Black, 3px (ASS: &H66000000, semi-transparent) |
| Shadow         | 1px                                     |
| Position       | Bottom-center (Alignment=2), in the 62–70% native-caption band |
| Margin from bottom | 570px (cue bottom edge y=1350, above the TikTok caption zone) |
| Max width      | 720px (180px margins L/R → cue right edge x=900, clears the action rail) |
| Max lines      | 2 (single line preferred; worst-case wrap stays inside the reserved lane) |
| Background     | None (transparent, text outline only)  |
| Style          | Karaoke `\kt` + `\kf` (word-by-word highlight, absolute per-word anchors) |
| Timing         | wav2vec2 forced alignment (`text-align.py`), per-word timestamps |
| Generation     | `lib/subtitles/` (JS, see docs/video-workflow.md) |

All subtitle values derive from `SUBTITLE_LANE` in `lib/safe-zones.mjs` (single source of truth) — never hardcode them. The subtitle lane (y≈1188–1350) is structurally separated from the content band (ends y=1150), so burned subtitles can never overlap scene content.

ASS Style line:
```
Style: Default,Helvetica Neue,60,&H00FF8B4D,&H00F5F5F5,&H66000000,&H66000000,-1,0,0,0,100,100,0,0,1,3,1,2,180,180,570,1
```

## Background Layers

Every scene/thumbnail layers these five effects:

1. **Grid** — `linear-gradient` lines, 60px spacing, opacity 0.04
2. **Glow-Red** — radial gradient top-right, `rgba(239,68,68,0.15)`
3. **Glow-Blue** — radial gradient bottom-left, `rgba(77,139,255,0.10)`
4. **Scanlines** — `repeating-linear-gradient`, 3px period, opacity 0.008
5. **Frame Glow** — `position: absolute; inset: 0;` border + inner glow; amber `rgba(245,158,11,0.2)` on content scenes, blue `rgba(77,139,255,0.2)` on CTA. `pointer-events: none`; decorative, not content (safe-zone-exempt)

## Animation Library

All animations: `opacity: 0` initial, `forwards` fill mode. Stagger delays 0.3-0.7s.

| Name        | Duration | Easing                     | Use                   |
| ----------- | -------- | -------------------------- | --------------------- |
| `fadeIn`    | 0.3-0.5s | ease-out                   | Subtle appearance     |
| `slideUp`   | 0.4-0.6s | ease-out                   | Headlines, titles     |
| `slideLeft` | 0.4-0.5s | cubic-bezier(0.16,1,0.3,1) | Cards, list items     |
| `scaleIn`   | 0.5-0.6s | ease-out                   | Big numbers, key data |
| `stampIn`   | 0.3-0.5s | ease-out                   | Verdicts (scale 2→1)  |
| `flashFrame` | 0.4s  | ease-out                   | Hook scene pattern-break flash (opacity 1→0) |

## Color Usage Guide (60-30-10 Principle)

Based on TikTok color best practices research (2025-2026):

| Role           | Ratio | Color                                           | Usage                             |
| -------------- | ----- | ----------------------------------------------- | --------------------------------- |
| **Dominant**   | 60%   | `#0a0a14` (dark bg)                             | Background, negative space        |
| **Supporting** | 30%   | `#f5f5f5` text + blue/red/green semantic colors | Headlines, body, entity colors    |
| **Accent**     | 10%   | `#f59e0b` amber                                 | Key numbers, CTA, data highlights |

- **Red** `#ef4444` → breaking news badges, threat/negative entities, danger stamps
- **Amber** `#f59e0b` → big numbers in Hook, CTA "FOLLOW FOR MORE" (standard end-card action), key data points (Bloomberg amber-on-black pattern)
- **Blue** `#4d8bff` → brand color, tech/protagonist entities, structural elements
- **Green** `#34d399` → positive outcomes, advantages
- **White** `#f5f5f5` → general text, titles (never pure `#ffffff`)

## Subject Visibility (Company Logo & Name Sizing)

> **Rule**: Viewers must be able to identify WHO the video is about within the first 3 seconds. The company logo + name must be large enough to read at thumbnail scale in a feed.

### Sizing Rules

| Context | Logo (SVG container) | Company Name (text) | Weight | Color | Rationale |
|---------|---------------------|---------------------|--------|-------|-----------|
| **Hook scene (Scene 1)** | ≥ 120px | ≥ 80px | 900 | `--white` with brand-color glow | First 3s = 70% of completion. Logo must be readable at feed thumbnail size (~200px wide on phone). 120px on 1080px canvas = ~22px at thumbnail scale — minimum for recognition. |
| **Featured scenes** (company is the topic) | ≥ 100px | ≥ 48px | 800 | `--white` or entity color | Mid-video reinforcement. Slightly smaller is OK since viewer already committed. |
| **Comparison scenes** (company vs another) | ≥ 80px | ≥ 40px | 800 | Entity color | Two logos side by side, each can be slightly smaller. |
| **Channel brand bar** (top-left, all scenes) | 48px | 24px ("CHINA AI NEWS") | 900 | `--white`, "AI" in `--blue` | Channel identity, not subject. Small and consistent — doesn't compete with content. |

### Placement Rules

1. **Hook scene**: Logo + name in a centered row as the first element of the **hero slot** (y 400–950 top; nothing above y 220 — the kicker slot 220–400 holds the badge). Appears at 0.3s (slideUp delay).
2. **Featured scenes**: Logo can be centered or top-aligned, depending on layout. Name below or beside logo.
3. **Never use muted gray** (`--muted` / `#475569`) for the subject company name — use `--white` or the entity's semantic color.
4. **Drop shadow**: Logo SVG gets `filter: drop-shadow(0 0 25-30px rgba(brand-color, 0.3))` for depth on dark background.

### Entity Color Mapping

Same as color tokens — each company has a consistent semantic color:

| Entity | Color | Token |
|--------|-------|-------|
| DeepSeek | Blue | `--blue` `#4d8bff` |
| Huawei | Red | `--red` `#ef4444` |
| Zhipu | Blue | `--blue` `#4d8bff` |
| Baidu | Blue | `--blue` `#4d8bff` |
| Alibaba | Amber | `--amber` `#f59e0b` |
| Tencent | Green | `--green` `#34d399` |

### Compliance Check

`verify-video.mjs` checks subject visibility in `checkSubjectVisibility()` (from `lib/scene-rules.mjs`):
- **Warn** if no known company name appears in Scene 1's on-screen text
- The warning is non-blocking (scene may use logo-only design), but if warned, the logo MUST meet the ≥120px sizing rule above

## Content Patterns

- **Data anchors**: oversized numbers (64-300px) as focal points — amber for Hook, semantic color elsewhere
- **Quotes**: left-border accent color, italic, keyword highlighted
- **Verdicts**: full-width stamp with text-shadow glow
- **Color coding**: consistent — same entity always same color across all scenes

## Layout Safety (Safe Zones & Watermark)

TikTok overlays (caption, like/comment buttons, bottom progress bar) can cover content. All scenes must respect these safe zones — enforced at render time by `scripts/short-video/verify-scene-dom.mjs` (measures real DOM geometry, wired into the pipeline as a FAIL-gate) and guarded at source level by `scripts/short-video/__tests__/scene-drift.test.mjs`.

Calibrated against a real FYP playback screenshot (scaled ×1.875) cross-checked with 2026 research:

| Zone | Inset (px, 1080×1920 canvas) | Content edge | Meaning |
|------|------------------------------|--------------|---------|
| Top | 220 | y ≥ 220 | Below this: top tabs/search overlays stay clear |
| Right | 200 | x ≤ 880 | Right action rail (avatar/like/comment/save/share/music, y≈655–1775) |
| Bottom | 770 | y ≤ 1150 | Bottom UI: caption, progress bar; also clears the subtitle lane |
| Left | 60 | x ≥ 60 | Left margin (no overlay, but content breathes here) |

Content band: **x ∈ [60, 880] (width 820px), y ∈ [220, 1150]**. The subtitle lane sits below it (y≈1188–1350); the TikTok caption UI starts ~y1500.

Second calibration pass (2026-08-08): re-checked against another real FYP screenshot (576×1024, ×1.875, OCR-measured) — top tabs y 91–175, action-rail icons x≈960–1080 with count labels starting x≈930 (y 746–1564), caption UI top y≈1489, bottom tab bar y≥1822. Nothing intrudes the content band; the x≤880 cap keeps a 50px margin from the rail count labels.

Enforcement levels in `verify-scene-dom.mjs`:
- **Top / bottom band crossing → FAIL** (content enters TikTok chrome or the subtitle lane).
- **Right band crossing (x > 880) → FAIL** when the element's bottom is inside the action rail (y > 640); **WARN** only above the rail (top chrome, where nothing occludes).

Reference implementation: `lib/safe-zones.mjs` (SAFE_ZONES / SUBTITLE_LANE / WATERMARK_POS constants — the single source of truth every other layer derives from).

### Watermark Rule

- Channel watermark sits **top-left** (`top: 60px; left: 60px`) inside the brand corner.
- Scenes that already carry the **brand bar** (top-left identity) or a **large brand logo** (CTA close) are skipped — no double identity.
- `baseStyles().withWatermark()` injects the watermark into the final scene HTML; it must never be part of scene source (drift guard).

### Bottom Elements Strategy

- **No content anchor below y = 1150** (`1920 − SAFE_ZONES.bottom`). Critical copy, numbers, CTAs, and labels must sit above it, clear of the subtitle lane.
- If a scene has a bottom slot, use `fadeToBlack(duration)` (shared `fadeOut` keyframe in the base-styles bundle) — not a local footer element.

## Scene Layout Templates

9 layout patterns for **1080×1920 vertical mobile video** scenes. CSS-animated, timed to TTS duration. All scenes must be 9:16 — never horizontal.

> **Slot system (mandatory).** Every scene composes its content into the fixed vertical slots from `lib/scene-layout.mjs` via `sceneFrame({ kicker, hero, support })` — never a hand-rolled full-screen `flex` with `justify-content: space-between` (that pattern stretched scenes into three islands with dead space and pushed content into the subtitle lane). Slots: `kicker` 220–400, `hero` 400–950, `support` 950–1150. Slot edges derive from `SAFE_ZONES`, so a scene either fits the grid or the DOM gate refuses to ship it.

> **Vertical-stacking rule (mandatory for comparisons).** Any comparison / contrast / VS scene must stack its items **vertically** (A on top, VS divider in the middle, B on the bottom) — never place two or more cards **side by side** in a horizontal row. A 1080-wide portrait frame cannot fit a landscape two-column layout without shrinking text to unreadable sizes or overflowing the right safe zone. Reference: `bytedance-distillation` S6/S7/S8. Guarded by `scene-drift.test.mjs` (side-by-side classes banned in migrated content).

### 1. Hook Scene

**Standard: the shared `hookScene` opening card** (`lib/scene-templates.mjs`, spec: `docs/archive/spec-hook-opening-card.md`). Scene 1 of every new video must delegate to `hookScene` — fixed skeleton, data-driven slots, zero hand-written offsets. Old hand-written hooks (deepseek / distillation / restraint) migrate when next revisited.

Slot composition (1080×1920; bands from `lib/scene-layout.mjs` — kicker / hero / support):

```
kicker (220–400)     [badge]    optional red pill (BREAKING) — red urgency
hero   (400–950)     [subject]  optional logo 120px + name 80px/900
                     [focal]    REQUIRED, exactly one of:
                       A number-led: bigNumber (amber 300px glow)
                                     + numberLabel (highlight wraps .hl)
                       B claim-led:  hookText (frame-1, no delay)
                                     + revealText (1.5s stampIn payoff)
support (950–1150)   [stats]    optional stat cards (staggered 1.3s+)
                     [source]   optional source line (2.1s)
```

- Background layers: `grid-bg` + color-tinted glow (semantic color token drives the tint) + `scanlines` + blue `scan-sweep`
- Animation contract: badge 0.3s → subject 0.3s → hookText **frame 1** (thumbnail carries the claim) → bigNumber 0.8s / revealText 1.5s → stats 1.3s+ → source 2.1s
- Amber-dominant numbers + red accent badge follow the 60-30-10 doctrine; `glowPulse` is a blue-only keyframe, so non-blue reveal colors get a static same-color glow instead
- Data contract: `badge` / `subject` / `subjectLogo` (logo registry key into `assets/logos/`) / `bigNumber`+`numberLabel` / `hookText`+`revealText` / `stats[]` / `source` / `color` — see the `hookScene()` docblock. Focal is mandatory and exclusive, enforced FAIL-level by `checkHookContract`
- `withWatermark` skips (brandBar) — no double branding on the channel open

### 2. Timeline Scene

Sequential events. Vertical line, colored dots.

- Title at top (sec, 42px, letter-spacing 3px)
- Vertical gradient line (blue → purple → amber → red)
- Events stagger slideLeft, 0.7-1.2s apart
- Each event: date (colored, 28px) + description (white, 40px)
- Dot color escalates: blue → purple → amber → red(filled)

### 3. Comparison/Contrast Scene

**Vertical stack** (see the vertical-stacking rule). Items stack top-to-bottom across the full content band.

- Title (white, 48px, 900) in the kicker slot
- Items stacked vertically in the hero slot: negative items first (red border), resolution/positive item last (green border)
- Each row: name left, stat right-aligned; stagger slideLeft
- Conclusion / punchline box in the support slot (e.g. a green "CLEAN" stamp)
- Optional quote box: left-border accent (blue), italic, keyword highlighted

### 4. Data Visualization Scene

Bar charts and stats.

- Title (white, 44px, 800)
- Horizontal bars: animated growth (`barGrow` keyframe, `--target` CSS var)
- Bar fills: gradient backgrounds, price label inside
- Stats row below: 3 columns, large numbers (72px) + labels (24px)
- Italic note at bottom with red highlight keyword

### 5. VS Card Scene

Direct comparison. Two entities head-to-head — **stacked vertically** (A on top, VS divider mid, B on bottom), never side by side.

- Title (white, 48px, 900) in the kicker slot
- Card A (top, e.g. green border) → VS divider (mid) → Card B (bottom, e.g. red border), all in the hero slot
- VS divider: 56–80px circle or inline "VS" text (muted)
- Prediction/verdict stamp in the support slot: colored border, stampIn animation

### 6. Staircase/Progression Scene

Steps to a goal. Bottom-to-top.

- Title (white, 44px, 800)
- Steps in `column-reverse`, increasing right margin (0→200px)
- Color-coded status: done (green), current (blue + glow), next (amber), future (muted)
- Badge labels: DONE / NOW / NEXT
- Arrow text below pointing to next bottleneck

### 7. Talent/Flow Scene

People movement. Quote + flow rows.

- Title (white, 48px, 900)
- Quote box at top: red left-border, bold, keyword highlighted
- "CORE RESEARCHERS ALREADY GONE:" label
- Flow rows: person name (400px width) → arrow → company (colored)
- Stagger slideLeft, 0.3s apart
- Conclusion line at bottom (green)

### 8. Three-Factor Scene

Numbered analysis cards.

- Title (white, 48px, 900, centered)
- Three numbered cards, colored left borders (red, amber, purple)
- Each card: large number (80px) + title (40px) + description (30px)
- Stagger slideLeft, 0.7s apart

### 9. CTA Scene

Brand closer — the single shared `ctaScene` template (`lib/scene-templates.mjs`), routed through the slot system. No URL (testing phase).

- **Hero slot (400–950)**: brand logo (130px) → brand name `CHINA AI NEWS` (72px, 900, "AI" in blue) → tagline `CHINA AI, DECODED` (32px, sec)
- **Support slot (950–1150)**: action stamp `FOLLOW FOR MORE →` (amber stampBox) → optional series `topic` teaser
- Fade-to-black at end (0.8s before duration ends)

## Implementation

The CSS implementation of these specs lives in:

- `scripts/short-video/lib/safe-zones.mjs` — **single source of truth** for safe-zone + subtitle-lane + watermark constants. Every other layer (slot layout, subtitle ASS, DOM verifier) derives from these values; never hardcode them elsewhere.
- `scripts/short-video/lib/scene-layout.mjs` — the fixed slot system (`SLOTS`, `slotCss()`, `sceneFrame()`). All scenes compose into kicker/hero/support slots.
- `scripts/short-video/lib/base-styles.mjs` — shared base styles + keyframes bundle (`baseStyles(duration)`, `withWatermark`). Keyframes are single-source here; scenes must not redeclare them (drift guard).
- `scripts/short-video/lib/scene-templates.mjs` — data-only scene building blocks (`brandBar`, `breakingBadge`, `statCard`, `quoteBox`, `titleBlock`, `bigNumberAnchor`, `pointsList`, `stampBox`, `fadeToBlack`) + the shared `hookScene` / `ctaScene` + `templateCss()`. No business copy; the channel constants in `brandBar` are the only hardcoded strings.
- `scripts/short-video/content/{article}/scenes.mjs` — per-video scene HTML/CSS, composed from the templates above; all display copy comes from `scene-data.mjs` via the `t(txt, key)` helper.
- `scripts/youtube-thumbnail.html` — thumbnail HTML/CSS

### Enforcement (how the standard is applied to every video)

1. **Constants single source** — `safe-zones.mjs` values are test-locked (`safe-zones.test.mjs`, `scene-drift.test.mjs`); editing them turns the suite red.
2. **Data-level preflight** — `verify-video.mjs --pre --content <dir>` runs before the pipeline (SKILL.md hard rules) and blocks non-compliant scene data.
3. **Render-level DOM gate** — `verify-scene-dom.mjs` runs automatically as **Step 2.5** in both `main.mjs` and `render-only.mjs`. Any scene whose geometry crosses a safe zone (top / bottom / right action rail), overflows horizontally, renders `undefined`, or breaks a word fails the build **before recording**. Bypass only with `--skip-dom-check` (legacy, non-migrated content).
4. **Source-level drift guards** — `scene-drift.test.mjs` bans side-by-side comparison classes and legacy footer classes in migrated content, and locks the shared hook/CTA templates byte-for-byte.

When changing brand specs, update this file first, then update the implementation files to match.

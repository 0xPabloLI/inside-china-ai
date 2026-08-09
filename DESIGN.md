---
name: China AI News
description: Independent reporting on China's AI industry — frontline dispatches, weekly.
colors:
  brand: "#4d8bff"
  primary: "#2a2f36"
  primary-foreground: "#f8f9fb"
  background: "#f8f9fb"
  foreground: "#1f2226"
  card: "#fcfcfd"
  muted: "#ededf0"
  muted-foreground: "#6b7280"
  accent: "#e2e8f0"
  accent-foreground: "#2a2f36"
  border: "#dfe3e8"
  destructive: "#dc2626"
  chart-1: "#e8652a"
  chart-2: "#2d9eb8"
  chart-3: "#3b5a8c"
  chart-4: "#d4a017"
  chart-5: "#c47d14"
  dark-background: "#1a1d23"
  dark-foreground: "#f5f6f8"
  dark-card: "#22262e"
  dark-primary: "#f5f6f8"
  dark-border: "rgba(255,255,255,0.10)"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "clamp(2.5rem, 6vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.75
  body-large:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
    textTransform: "uppercase"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "#3a3f47"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card-subscribe:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.xl}"
    padding: "32px"
---

# Design System: China AI News

## 1. Overview

**Creative North Star: "The Frontline Dispatch"**

This system designs for a reader who treats their inbox like a news wire — fast scanning, high signal tolerance, zero patience for decoration that doesn't earn its pixels. The aesthetic is a well-set dispatch: serif headlines that carry authority, a sans body that disappears into reading, and a single brand blue that marks territory without shouting.

The system rejects three things explicitly: (1) SaaS landing-page clichés — hero-metric templates, gradient text, glassmorphism, identical card grids; (2) cream/sand/beige warm-neutral backgrounds — the AI default of 2026, avoided by using a cool off-white tinted toward the brand's own blue hue; (3) decorative motion that doesn't convey state. Motion is for feedback and progress, never choreography.

Density is permitted in data widgets (funding charts, keyword clouds) where the user expects information concentration, but the article surface stays generous: 65ch line length, 1.75 line-height, ample section spacing. The tension between dense data viz and spacious prose is intentional — it mirrors the publication's editorial stance of "complex story, clear telling."

**Key Characteristics:**
- Cool off-white background tinted toward brand blue (hue 260), not warm-neutral
- Serif display (Source Serif 4) + sans body (Hanken Grotesk) pairing on a contrast axis
- Restrained color strategy: brand blue ≤10% of any surface, used for identity markers only
- OKLCH color space throughout for perceptual consistency
- 65ch prose column as the typographic anchor
- Flat elevation by default; the only surface shadow is the subscribe card lift (controls/floating layers follow the shadcn baseline)

## 2. Colors: The Dispatch Palette

A cool, blue-tinted neutral foundation with one saturated brand accent. The palette reads as "credible newsroom" not "tech startup."

### Primary

- **Ink Slate** (`oklch(0.28 0.03 260)` / `#2a2f36`): The primary action color — buttons, active nav, published badges. A dark blue-gray that carries authority without being pure black. Chosen over pure black to reduce eye strain in long reading sessions and to harmonize with the blue-tinted neutral palette.

### Brand Accent

- **Dispatch Blue** (`oklch(0.62 0.19 260)` / `#4d8bff`): The single brand accent. Used on the "AI" in the wordmark, the reading progress bar, and as the hover/focus indicator on links. Never used for button backgrounds or large surface fills. This color is shared across web and video surfaces — it is the visual through-line.

### Neutral

- **Cool Paper** (`oklch(0.985 0.008 260)` / `#f8f9fb`): Body background. A near-white with a barely perceptible blue tint (chroma 0.008, hue 260) that ties it to the brand. Deliberately NOT cream/sand/warm — this is the anti-AI-default choice.
- **Card White** (`oklch(0.99 0.005 260)` / `#fcfcfd`): Card and popover background. Slightly lighter than body to create tonal layering without shadows.
- **Muted Gray** (`oklch(0.94 0.015 255)` / `#ededf0`): Muted backgrounds, code blocks, secondary surfaces.
- **Slate Mist** (`oklch(0.48 0.02 255)` / `#6b7280`): Muted foreground — secondary text, labels, metadata. Meets WCAG AA 4.5:1 against Cool Paper.
- **Hairline** (`oklch(0.9 0.015 255)` / `#dfe3e8`): Borders and dividers. Used at full opacity for structural borders, 60% opacity for decorative dividers, 40% for subtle separators.

### Semantic

- **Alert Red** (`oklch(0.55 0.22 27)` / `#dc2626`): Destructive actions only. Never decorative.
- **Chart Palette** (5 colors): `#e8652a` (terracotta), `#2d9eb8` (teal), `#3b5a8c` (slate blue), `#d4a017` (ochre), `#c47d14` (amber). Used in data widgets only, not in UI chrome.

### Dark Mode

- **Dark Ink** (`oklch(0.18 0.015 260)` / `#1a1d23`): Dark mode background. Blue-tinted near-black.
- **Dark Card** (`oklch(0.25 0.02 260)`): Dark mode card surface. ΔL 0.07 from background — above perceptible threshold (was 0.22/ΔL 0.04, cards blended into bg).
- **Dark Muted** (`oklch(0.31 0.02 260)`): Dark mode muted surfaces (code blocks, table headers). ΔL 0.06 from card.
- **Dark Accent** (`oklch(0.35 0.02 260)`): Dark mode accent surfaces.
- **Light Mist** (`oklch(0.78 0.02 255)`): Dark mode muted foreground — secondary text, labels, metadata. Meets WCAG AA 9.41:1 against Dark Ink (was 0.7/7.05:1 — passed mathematically but perceptually dim; impeccable audit identified as dark-mode equivalent of "light gray for elegance").
- **Brand Light** (`oklch(0.78 0.15 260)`): Dark mode brand-foreground text. 9.04:1 against Dark Ink.
- **Dark Hairline** (`oklch(1 0 0 / 20%)`): Dark mode borders — white at 20% opacity. At `/60` modifier (used by most components) yields 12% effective — perceptible (was 10%/6% effective, ratio 1.15:1 — essentially invisible).
- **Dark Status Muted** (`oklch(0.28 0.05 ...)`): Success/warning/danger muted surfaces at L=0.28 — above card (0.25), below muted (0.31), with semantic chroma.

**Dark mode content overrides** (in `src/styles.css`):
- Blockquote text uses `--foreground` (not `--muted-foreground`) — blockquote is content, not metadata.
- Prose `line-height` increases from 1.75 to 1.85 — light text on dark backgrounds needs more breathing room.

**The Dispatch Blue Rule.** Brand blue appears on ≤10% of any given screen. Its rarity is the point. It marks identity (wordmark), progress (reading bar), and attention (link hover) — nothing else. If brand blue covers more than 10% of a surface, the design has failed.

**The Cool-Not-Warm Rule.** All neutral colors are tinted toward hue 260 (blue), never toward hue 40-100 (warm). This is the explicit rejection of the cream/sand AI default. If a new neutral is needed, derive it from the existing hue-260 ramp.

## 3. Typography

**Display Font:** Source Serif 4 (with Georgia, serif fallback)
**Body Font:** Hanken Grotesk (with ui-sans-serif, system-ui fallback)

**Character:** A transitional serif for headlines that carries editorial weight without feeling academic, paired with a geometric sans for UI that stays neutral and readable at small sizes. The pairing works on a contrast axis (serif character vs. sans geometry), not a similarity axis.

### Hierarchy

- **Display** (Source Serif 4, 400, `clamp(2.5rem, 6vw, 3rem)`, 1.2 line-height, -0.02em tracking): Hero headlines on homepage and article pages. Never used in UI chrome.
- **Headline** (Source Serif 4, 400, 1.75rem, 1.2 line-height): Section headings (h2) in articles and the Companies page. Also used for subscribe card title and admin section title.
- **Title** (Hanken Grotesk, 600, 1.25rem, 1.3 line-height): Subsection headings (h3) in articles. Also admin list item titles.
- **Body** (Hanken Grotesk, 400, 1rem, 1.75 line-height, max 65ch): Article prose. The 1.75 line-height is generous for long-form reading; do not reduce it.
- **Body Large** (Hanken Grotesk, 400, 1.125rem, 1.6 line-height): Hero subtitles and article excerpts. Slightly larger than body for emphasis.
- **Label** (Hanken Grotesk, 500, 0.75rem, 0.05em tracking, uppercase): Date stamps, metadata, "Guide" kicker. Used sparingly — not on every section.

**The 65ch Rule.** Article body text is capped at 65 characters per line. This is non-negotiable for readability. Widget text can exceed this (data tables, chart labels) but prose must respect the limit.

**The Serif-For-Headlines Rule.** All headings use Source Serif 4. UI labels, buttons, data, and navigation use Hanken Grotesk. Never use serif for buttons, form labels, or data values — it undermines the editorial hierarchy.

**Font Loading Note.** Source Serif 4 loads `ital,wght@0,400;0,600;0,700;1,400` from Google Fonts in `src/routes/__root.tsx` — semibold/bold headlines render with the intended serif (resolved 2026-08-08; previous note said 600+ fell back to system serif).

## 4. Elevation

This system is **flat by default**. Depth is conveyed through tonal layering (background → card → muted) rather than elevation shadows. The single *surface* exception is the subscribe card, which uses a soft shadow (`shadow-sm`) to lift it above the page surface as a focal CTA.

### Shadow Vocabulary

- **Subscribe Lift** (`box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05)` / `shadow-sm`): The subscribe card — the only surface shadow in the system.
- **Control baseline (shadcn/ui)**: `shadow-sm` on form controls, buttons, switches, toggles, badges from the component-library defaults. Presentational affordance, not elevation.
- **Floating layers**: popovers, dropdowns, context menus, sheets, toasts carry `shadow-md`/`shadow-lg` to separate them from the page (shadcn standard).
- **Widget micro-shadows**: small separation details — timeline/phase dots, callout chips (`shadow-sm`/`shadow-md`). Audited 2026-08-08.

**The Flat-By-Default Rule.** Page surfaces are flat at rest; the only *surface* shadow is the subscribe card. If a new component needs elevation, use a background tint change (card > muted > background) or a border, not a shadow. New decorative elevation shadows require a design review; the shadcn control/floating-layer vocabulary above is the baseline.

## 5. Components

### Buttons

- **Shape:** Gently rounded (`--radius-md`, 6px)
- **Primary:** Ink Slate background, Cool Paper text, 8px/16px padding, `text-sm font-medium`. Hover: slightly lighter (`#3a3f47`). Used for "Subscribe", "Save", "New post", "Export CSV".
- **Outline:** Transparent background, foreground text, 1px Hairline border. Hover: accent background tint. Used for "Edit", secondary actions.
- **Ghost:** Transparent, muted-foreground text. Hover: accent tint. Used for "Delete", "Sign out", "Cancel".
- **States:** All buttons must have default, hover, focus-visible, active, and disabled states. Custom widget buttons carry the `focus-visible:outline-brand` recipe (applied 2026-08-08, guarded by `src/components/widgets/a11y-container-contract.test.ts`).

### Inputs

- **Style:** 1px Hairline border, transparent background, `--radius-md`, 8px/12px padding, Hanken Grotesk 1rem.
- **Focus:** Ring color `oklch(0.6 0.04 255)` — a desaturated blue. 2px ring with 2px offset.
- **Placeholder:** Muted-foreground. Currently meets contrast requirements.

### Widget Keyboard Access

- **Focus-visible:** All interactive widget elements (buttons, toggles, chart bars, keyword chips, accordion triggers) carry `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand` (applied 2026-08-08). Keyboard equivalents exist for hover-only interactions.

### Cards / Containers

- **Subscribe Card:** Card White background, 1px Hairline/70 border, `--radius-xl` (12px), 32px padding, Subscribe Lift shadow. The signature container.
- **Admin List Container:** Card White background, 1px Hairline/60 border, `--radius-lg` (8px), no shadow. Items divided by Hairline/60.
- **Widget Containers:** Outer cards are owned by the route wrapper (no redundant self-containers); inner panels use `bg-muted/30` + `rounded-lg`, no ad-hoc opacity variants or native colors (standardized 2026-08-08, guarded by `src/components/widgets/a11y-container-contract.test.ts` T3).

### Navigation

- **Site Header:** 1px Hairline/60 bottom border, `max-w-4xl`, 16px vertical padding. Logo (favicon + serif wordmark) left, text nav right. Active state: `font-medium` + foreground color. Inactive: muted-foreground. Hover: foreground.
- **Mobile menu:** Below 640px the nav collapses to a theme toggle + hamburger (`aria-label="Open menu"`) opening a right-side Sheet menu (`src/components/header-nav.tsx`), so narrow screens never cramp inline links.

### Chips / Badges

- **Openness Badge** (Companies page): Hairline/60 border, `--radius-full`, 2px/8px padding, 12px uppercase (`text-xs`), muted-foreground text. Neutral by design — openness is data, not status.
- **Publish Status Badge** (Admin): Published = `bg-primary/10 text-primary`; Draft = `bg-muted text-muted-foreground`. Visual weight asymmetry intentional — published is the "live" state.

### Widget Language

- Widgets publish **English-only** (content-pipeline rule); the EN/中文 toggle was removed in the widget tech-debt cleanup.
- Hover-only widget interactions must expose keyboard equivalents: focus reveals / blur hides / click pins (`useHoverPin` in `src/components/widgets/shared/use-hover-pin.ts`, `focus-visible:outline-brand` outlines).

### Reading Progress Bar

- 2px height, fixed top, `z-50`, Dispatch Blue background, `transition-[width] duration-75 ease-out`. Respects `prefers-reduced-motion`. The only fixed-position element on public pages (admin sidebar + modal/drawer overlays are the other fixed chrome).

## 6. Do's and Don'ts

### Do:

- **Do** use OKLCH for all color values. The system is OKLCH-native; hex values in this document are approximate references only.
- **Do** keep article prose at 65ch maximum line length with 1.75 line-height. This is the reading comfort floor.
- **Do** use Source Serif 4 for all headings and Hanken Grotesk for all UI text. The pairing is the editorial voice.
- **Do** tint all neutrals toward hue 260 (blue). This is the anti-cream/sand doctrine.
- **Do** use Dispatch Blue (`#4d8bff`) for brand identity markers only: wordmark "AI", reading progress bar, link hover. Keep it under 10% of any surface.
- **Do** provide skeleton loading states in admin/product UI, not "Loading…" text.
- **Do** label all widget interactive elements with `aria-label` and provide `focus-visible` outlines.
- **Do** use `prefers-reduced-motion` for every animation. The reading progress bar is the reference implementation.

### Don't:

- **Don't** use cream, sand, beige, paper, parchment, linen, ivory, or any warm-neutral background. The system is cool-tinted. This is the single biggest anti-AI-default decision.
- **Don't** use gradient text (`background-clip: text`). Emphasis comes from weight or size, not gradients.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe. Full borders or background tints only.
- **Don't** use glassmorphism (backdrop-blur on translucent surfaces). Rare and purposeful, or nothing.
- **Don't** use decorative elevation shadows on page surfaces — the subscribe card is the single surface exception. Control/floating-layer shadows follow the shadcn baseline; widget micro-shadows are limited to separation details (audited 2026-08-08).
- **Don't** use Tailwind native colors (`blue-500`, `green-600`, `yellow-700`) in widgets. Map all colors to the design token system or the chart palette.
- **Don't** use font sizes below 12px in any user-facing text. Widget labels audited 2026-08-08 — no sub-12px text remains.
- **Don't** use native `confirm()` dialogs. Use shadcn `AlertDialog` for brand consistency.
- **Don't** use display fonts in UI labels, buttons, or data. Serif is for headings only.
- **Don't** use `border-radius` greater than 16px on cards. 12px is the card ceiling; full-pill is for chips/buttons only.

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
- **Website** (reading): Warm off-white magazine palette (`oklch(0.985 0.008 90)` background). Optimized for long-form reading, SEO, and accessibility. Different surface, same brand.

### What's shared across both surfaces

- **Semantic color mapping**: red = threat, green = positive, blue = tech/brand, amber = caution. The *meaning* is identical; the *hex value* adapts to the surface.
- **Entity color consistency**: DeepSeek is always blue, Huawei is always red, government is always amber — in both video and web.
- **Brand name presentation**: `AI` is always emphasized in blue (`#4d8bff`), on both surfaces. The typographic treatment adapts to the surface:
  - **Video**: `CHINA AI NEWS` — uppercase, Helvetica Neue 900, sans-serif.
  - **Website**: `China AI News` — title case, Instrument Serif, serif. The `AI` span uses inline `color: #4d8bff` (the website OKLCH palette has no brand-blue token; the video hex is used directly).

### Why different base palettes

A magazine-style blog and a YouTube Short have different UX constraints. Bloomberg's website is white底 magazine; Bloomberg's video is dark high-contrast data-viz. Same brand, different media, different visual density. We follow the same principle — the video palette leads, the web palette adapts for readability.

## Color Tokens (Video)

All tokens below are for **video and thumbnail surfaces**. The website uses its own OKLCH palette in `src/styles.css` — see Media Strategy above for why they differ.

Consistent color coding across all content — same entity always same color.

### Core

| Token | Hex | Semantic |
|-------|-----|----------|
| `--blue` | `#4d8bff` | Protagonist, tech, brand |
| `--red` | `#ef4444` | Threat, breaking, negative |
| `--amber` | `#f59e0b` | Warning, caution |
| `--green` | `#34d399` | Positive, advantage, success |
| `--purple` | `#6d4eff` | Neutral data, secondary |
| `--cyan` | `#22d3ee` | Technical concept |

### Text

| Token | Hex | Usage |
|-------|-----|-------|
| `--white` | `#ffffff` | Headlines |
| `--sec` | `#94a3b8` | Labels, descriptions |
| `--muted` | `#475569` | Footnotes |

### Background

Base: `#050508`. Cards: `rgba(255,255,255,0.03)`. Borders: `rgba(255,255,255,0.08)`.

## Typography

Font stack: `'Helvetica Neue', 'Arial Black', Arial, sans-serif`

| Context | Size | Weight | Spacing |
|---------|------|--------|---------|
| Headlines | 48-130px | 800-900 | 2-5px |
| Body | 28-40px | 600-800 | normal |
| Labels | 22-28px | 700 | 2-3px, uppercase |
| Data anchors | 64-280px | 900 | tight |

## Background Layers

Every scene/thumbnail layers these four effects:

1. **Grid** — `linear-gradient` lines, 60px spacing, opacity 0.03
2. **Glow-Red** — radial gradient top-right, `rgba(239,68,68,0.12)`
3. **Glow-Blue** — radial gradient bottom-left, `rgba(77,139,255,0.08)`
4. **Scanlines** — `repeating-linear-gradient`, 3px period, opacity 0.008

## Animation Library

All animations: `opacity: 0` initial, `forwards` fill mode. Stagger delays 0.3-0.7s.

| Name | Duration | Easing | Use |
|------|----------|--------|-----|
| `fadeIn` | 0.3-0.5s | ease-out | Subtle appearance |
| `slideUp` | 0.4-0.6s | ease-out | Headlines, titles |
| `slideLeft` | 0.4-0.5s | cubic-bezier(0.16,1,0.3,1) | Cards, list items |
| `scaleIn` | 0.5-0.6s | ease-out | Big numbers, key data |
| `stampIn` | 0.3-0.5s | ease-out | Verdicts (scale 2→1) |

## Content Patterns

- **Data anchors**: oversized numbers (64-280px) as focal points
- **Quotes**: left-border accent color, italic, keyword highlighted
- **Verdicts**: full-width stamp with text-shadow glow
- **Color coding**: consistent — same entity always same color across all scenes

## Scene Layout Templates

9 layout patterns for **1080×1920 vertical mobile video** scenes. CSS-animated, timed to TTS duration. All scenes must be 9:16 — never horizontal.

### 1. Hook Scene

Breaking news opener. Red dominant.

- Breaking news badge at top (red pill, `⚠ BREAKING`)
- Logo + entity name row
- Large two-line headline: context line (sec) + impact line (red, 130px)
- Glitch flash effect (0.4s, red→blue overlay)
- Animation: badge fadeIn → logo fadeIn → line1 slideUp → line2 scaleIn

### 2. Timeline Scene

Sequential events. Vertical line, colored dots.

- Title at top (sec, 42px, letter-spacing 3px)
- Vertical gradient line (blue → purple → amber → red)
- Events stagger slideLeft, 0.7-1.2s apart
- Each event: date (colored, 28px) + description (white, 40px)
- Dot color escalates: blue → purple → amber → red(filled)

### 3. Comparison/Contrast Scene

Two-column analysis. Left vs right.

- Title (white, 48px, 900)
- Two columns, 40px gap
- Left = negative: red border, strikethrough text
- Right = positive: green border
- Items stagger slideLeft per column (left first, then right)
- Quote box at bottom: left-border accent (blue), italic, keyword highlighted

### 4. Data Visualization Scene

Bar charts and stats.

- Title (white, 44px, 800)
- Horizontal bars: animated growth (`barGrow` keyframe, `--target` CSS var)
- Bar fills: gradient backgrounds, price label inside
- Stats row below: 3 columns, large numbers (72px) + labels (24px)
- Italic note at bottom with red highlight keyword

### 5. VS Card Scene

Direct comparison. Two entities head-to-head.

- Title (white, 48px, 900)
- Two cards side by side, colored borders (red vs green)
- VS circle in center (80px, muted border)
- Stats row below (2 stat boxes)
- Prediction/verdict box at bottom: green border, stampIn animation

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

Brand closer. No URL (testing phase).

- Brand name: `CHINA AI NEWS` (72px, 900, "AI" in blue)
- Tagline: `China's AI, decoded.` (32px, sec)
- "Subscribe for more" (64px, 800, white)
- Bottom: "Follow for daily China AI deep dives" (30px, muted)
- Fade-to-black at end (0.8s before duration ends)

## Implementation

The CSS implementation of these specs lives in:
- `scripts/short-video/generate-scenes.mjs` — video scene HTML/CSS
- `scripts/youtube-thumbnail.html` — thumbnail HTML/CSS

When changing brand specs, update this file first, then update the implementation files to match.

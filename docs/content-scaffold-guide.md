# Content Scaffold Guide — 新建视频内容管线

> **创建于**: 2026-08-25
> **被引用**: `docs/video-workflow.md`（创建新 content slug 时加载，非正常渲染时加载）
> **研究依据**: `docs/brand-system.md`（scene templates、color tokens、animation library）

## When to Load This Guide

创建新的视频内容管线时（新话题、新系列）。已有 content dir 的正常渲染不需要加载此文档。

## Directory Structure

### Single video

```
scripts/short-video/content/{article-slug}/
├── meta.mjs         # Pipeline metadata
├── scene-data.mjs   # Scene definitions (voiceover + texts)
├── scenes.mjs       # Visual templates (HTML/CSS per scene)
└── dom-config.mjs   # (optional) DOM verification config — defaults if absent
```

### Multi-part series

```
scripts/short-video/content/{series-slug}/
├── pt1/
│   ├── meta.mjs
│   ├── scene-data.mjs
│   └── scenes.mjs
├── pt2/
│   └── ...
└── pt3/
    └── ...
```

## meta.mjs Template

```javascript
export const meta = {
  pipelineId: "my-article",        // Used for output directory: output/my-article/
  title: "My Article Title",       // Display name
  article: "my-article-slug",      // Website article slug (for reference)
  // For series:
  // seriesId: "my-series",
  // partNumber: 1,
};
```

## scene-data.mjs Template

```javascript
export const scenes = [
  {
    id: 1,
    name: "hook",           // Scene name for logging
    visualType: "hook",     // Visual type (hook, narrative, data, quote, etc.)
    voiceover: "One breath of text. Max 25 words.",  // Drives TTS duration
    texts: {                 // On-screen text (read by scenes.mjs)
      line1: "BIG TEXT",
      line2: "SUPPORTING",
    },
  },
  // ... 6-10 more scenes
  {
    id: N,
    name: "cta",
    visualType: "cta",
    voiceover: "Follow for more.",
    texts: {
      brand: "CHINA AI NEWS",
      brandHighlight: "AI",
      tagline: "CHINA AI, DECODED",
      action: "FOLLOW FOR MORE",
    },
  },
];
```

**Rules** (enforced by `verify-video.mjs`):
- Each `voiceover` ≤ 25 words (one breath)
- No em/en/double dashes (`—`, `–`, `--`)
- No AI vocabulary (leverage, delve, harness, etc.)
- Hook (Scene 1) must have a number or strong word
- ≥2 scenes mention sources
- "China", "AI", and main subject each appear in ≥2 scenes

## scenes.mjs Template

```javascript
import { baseStyles, BRAND_MARK_SVG, withWatermark } from "../../../lib/base-styles.mjs";

// Safe text accessor
function t(texts, key) { return texts?.[key] ?? ""; }

function scene1(scene, duration) {
  const txt = scene.texts || {};
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
${baseStyles(duration)}
.s1 { /* Your scene CSS here */ }
/* Compose into the fixed slot grid — kicker 220-400 / hero 400-950 /
   support 950-1150, x∈[60,880] — via sceneFrame({...}) from lib/scene-layout.mjs.
   Hand-rolled full-screen flex is banned by the DOM gate (verify-scene-dom.mjs).
   Check text width!
   - Content band: 820px wide (x 60-880)
   - At 42px bold: ~25px avg char width → max ~32 chars per 820px line
   - At 56px bold: ~33px avg char width → max ~24 chars per 820px line
   - ALWAYS add `word-break: break-word` as safety net
*/
</style></head><body>
<div class="scene s1">
  <div class="grid-bg"></div><div class="glow-blue"></div><div class="scanlines"></div>
  <!-- Your content here -->
</div></body></html>`;
}

// ... more scene functions

const sceneGenerators = { 1: scene1, /* ... */ };
export function generateScene(scene, duration) {
  const gen = sceneGenerators[scene.id];
  if (!gen) throw new Error(`No scene generator for id ${scene.id}`);
  return withWatermark(gen(scene, duration));  // MUST wrap with withWatermark
}
```

**Reuse the shared scene templates** (`lib/scene-templates.mjs`) for recurring layouts: `brandBar(tag)`, `breakingBadge(text)`, `statCard({num, unit, label})`, `quoteBox({quote, highlight, speaker, source})`, `titleBlock(text, {highlight, fontSize})`, `bigNumberAnchor(num)`, `pointsList(points)`, `stampBox({text, sub, color})`, `fadeToBlack(duration)`, and `ctaScene(scene, duration)` — the **standard CTA end card**. Never write a bespoke CTA scene: delegate to `ctaScene`, and `scene-rules.mjs` `checkCTAActionContract` fails preflight when the last scene's `texts.action` is missing (contract: `{ brand, brandHighlight, tagline, action, topic? }`).

```javascript
import { templateCss } from "../../../lib/scene-templates.mjs";
// ...compose: `${baseStyles(duration)}\n${templateCss()}\n.s1 { /* scene-specific */ }`
```

All display copy must come from `scene.texts` via the `t()` accessor — the template layer and `scenes.mjs` must not hardcode business copy (channel constants `CHINA AI NEWS` / `INTELLIGENCE BRIEFING` are the only exceptions, in `brandBar`).

## CSS Overflow Checklist

| Font size | Max chars per 820px line | Max chars per 360px card |
|-----------|--------------------------|------------------------|
| 32px bold | ~43 chars | ~19 chars |
| 42px bold | ~32 chars | ~14 chars |
| 48px bold | ~28 chars | ~12 chars |
| 56px bold | ~24 chars | ~10 chars |
| 72px bold | ~19 chars | ~8 chars |

- For flex columns with `gap: 40px`: each column = `(available - 40) / 2`
- For cards with padding: text area = `card_width - padding * 2`
- Always add `word-break: break-word` as safety net
- Test at thumbnail size (240×426) — if text is unreadable, it's too small

## Visual Style Flexibility

Each video can have a different visual DNA while sharing the same brand system:

| Video type | Color dominance | Animation style | Logo usage |
|------------|----------------|-----------------|------------|
| Breaking news | Red, urgent | Glitch, stamp-in | Brand bar at top |
| Deep analysis | Blue, authoritative | Slide, fade | Watermark only |
| Data reveal | Amber, focused | Number pulse, bar grow | Minimal |
| Explainer | Blue + cyan | Sequential reveal | Brand at CTA |

**Mandatory across all styles:**
- Use CSS variables from `base-styles.mjs` (`var(--blue)`, `var(--red)`, etc.) — never hardcode hex
- Call `withWatermark()` on every scene's HTML
- Use `baseStyles(duration)` as the CSS foundation
- Brand logo appears in CTA scene at 130px+

## Run and Verify

```bash
# Run pipeline (ALWAYS in background)
node scripts/short-video/main.mjs --content my-article --bgm 2>&1 | tee /tmp/my-article.log &

# After completion, verify
node scripts/short-video/verify-video.mjs --tiktok --content my-article
```

Fix all FAIL items before presenting to user. WARN items are acceptable.

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| Brand visual identity | `docs/brand-system.md` (L1) | Color tokens, typography, animation library, 9 scene templates |
| Video production workflow | `docs/video-workflow.md` (L1) | TTS engines, rendering, publishing strategy, file paths |

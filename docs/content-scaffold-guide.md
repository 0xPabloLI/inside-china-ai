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
└── scene-data.mjs   # Scene definitions (voiceover + texts)
```

### Multi-part series

```
scripts/short-video/content/{series-slug}/
├── pt1/
│   ├── meta.mjs
│   └── scene-data.mjs
├── pt2/
│   └── ...
└── pt3/
    └── ...
```

## meta.mjs Template

```javascript
export const meta = {
  pipelineId: "my-article", // Used for output directory: output/my-article/
  title: "My Article Title", // Display name
  article: "my-article-slug", // Website article slug (for reference)
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
    name: "hook", // Scene name for logging
    visualType: "hook", // Visual type (hook, narrative, data, quote, etc.)
    voiceover: "One breath of text. Max 25 words.", // Drives TTS duration
    texts: {
      // On-screen text (read by the Remotion scene components)
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

## Scene Visuals (Remotion)

内容包只提供数据（`meta.mjs` + `scene-data.mjs`）；视觉渲染完全由 `scripts/short-video/remotion/src/` 的 React 场景组件承担（Remotion 是唯一渲染器——HTML/Playwright 路径已于 2026-09-01 退役，决策 59，冻结归档在 `scripts/short-video/retired-html-path/`）。

新内容包的视觉工作 = 选对 `visualType`，让场景调度器分发到正确的组件（`hook` → HookScene、`cta` → CtaScene、其余 → 叙事/数据组件）。需要新视觉类型时才改 `remotion/src/`（走 Substantial 工作流），不要在内容包里写一次性视觉代码。

- 文案契约：所有展示文案来自 `scene-data.mjs` 的 `texts`，组件与模板不硬编码业务文案（品牌常量 `CHINA AI NEWS` / `INTELLIGENCE BRIEFING` 是唯一例外）。
- CTA 结尾卡是标准组件，禁止自造：`scene-rules.mjs` `checkCTAActionContract` 会在 preflight 拦截缺 `texts.action` 的末场景（契约：`{ brand, brandHighlight, tagline, action, topic? }`）。
- 几何约束（安全区、溢出、换词）由 TextGate（`remotion/src/` + `lib/text-geometry.mjs`）在渲染前强制，手搓全屏布局会被拦截。
- 文本宽度预算：内容带 820px 宽（x 60–880），42px bold 约 32 字符/行、56px bold 约 24 字符/行（见下方 CSS Overflow Checklist）。

## CSS Overflow Checklist

| Font size | Max chars per 820px line | Max chars per 360px card |
| --------- | ------------------------ | ------------------------ |
| 32px bold | ~43 chars                | ~19 chars                |
| 42px bold | ~32 chars                | ~14 chars                |
| 48px bold | ~28 chars                | ~12 chars                |
| 56px bold | ~24 chars                | ~10 chars                |
| 72px bold | ~19 chars                | ~8 chars                 |

- For flex columns with `gap: 40px`: each column = `(available - 40) / 2`
- For cards with padding: text area = `card_width - padding * 2`
- Always add `word-break: break-word` as safety net
- Test at thumbnail size (240×426) — if text is unreadable, it's too small

## Visual Style Flexibility

Each video can have a different visual DNA while sharing the same brand system:

| Video type    | Color dominance     | Animation style        | Logo usage       |
| ------------- | ------------------- | ---------------------- | ---------------- |
| Breaking news | Red, urgent         | Glitch, stamp-in       | Brand bar at top |
| Deep analysis | Blue, authoritative | Slide, fade            | Watermark only   |
| Data reveal   | Amber, focused      | Number pulse, bar grow | Minimal          |
| Explainer     | Blue + cyan         | Sequential reveal      | Brand at CTA     |

**Mandatory across all styles:**

- Use the brand color tokens from `docs/brand-system.md` (implemented in `remotion/src/`) — never hardcode hex
- Watermark + brand chrome come from the shared Remotion components — every scene includes them
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

| Topic                     | Reference                     | Content                                                        |
| ------------------------- | ----------------------------- | -------------------------------------------------------------- |
| Brand visual identity     | `docs/brand-system.md` (L1)   | Color tokens, typography, animation library, 9 scene templates |
| Video production workflow | `docs/video-workflow.md` (L1) | TTS engines, rendering, publishing strategy, file paths        |

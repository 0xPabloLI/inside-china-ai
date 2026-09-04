# 04 — 场景组件 + MediaBackground（HookScene/CtaScene/MediaBackground）

**What to build:** 三个场景级 React 组件，消费 `scene-data.mjs` 的数据结构，组合 T3 的动画和视觉组件。`MediaBackground` 组件支持另一个 session 已定义的 `media` 字段（5 种动画预设，image/video 两种类型）。

**Blocked by:** 03 — 动画 + 视觉组件

**Status:** ready-for-agent

组件：

- `HookScene.tsx` — 消费 scene.texts（badge, subject, subjectLogo, bigNumber, hookText, revealText, stats, source），忽略 media 字段。首帧 background 全 opacity=1（grid/glow/scanlines），focal 元素 scaleIn。slot 布局：kicker(220-400) / hero(400-950) / support(950-1150)。
- `CtaScene.tsx` — 消费 scene.texts（brand, brandHighlight, tagline, action, topic），忽略 media 字段。brand logo + name + tagline + action box + topic。
- `MediaBackground.tsx` — 消费 scene.media（type, path, source, animation, overlay）。image 用 `<Img>`，video 用 `<Video>`。5 种预设用 `interpolate()`：fade/ken-burns/slide/zoom/none。文件不存在 → warn + null。ken-burns + video → 降级为 fade。

- [ ] HookScene 渲染 `_test-fixtures/hook-standard` 的 scene 1 (hook-claim) 和 scene 2 (hook-number)，视觉与现有 Playwright 输出一致
- [ ] CtaScene 渲染 scene 3 (cta)，视觉与现有一致
- [ ] MediaBackground 5 种预设各有 snapshot（给定 frame，验证 opacity/scale/translate）
- [ ] MediaBackground type=image 用 `<Img src={staticFile(...)}>`
- [ ] MediaBackground type=video 用 `<Video src={staticFile(...)}>`
- [ ]) 文件不存在时 console.warn + 不崩
- [ ] ken-burns + video 自动降级为 fade
- [ ] Hook/CTA 场景有 media 字段时忽略（visualType 检查）
- [ ] inDuration + outDuration > duration 时按比例缩放

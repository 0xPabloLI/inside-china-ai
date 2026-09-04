# 03 — 动画 + 视觉组件（12 keyframe + 8 视觉组件）

**What to build:** 将 `base-styles.mjs` 的 12 种 CSS keyframe 逐个封装为 React 动画组件，用 `useCurrentFrame()` + `interpolate()` + `Easing`。将 `scene-templates.mjs` 和 `scene-layout.mjs` 的共享视觉元素封装为 React 视觉组件，用 `safe-zones.mjs` 常量做绝对定位。

**Blocked by:** 02 — Remotion 项目脚手架 + assets symlink

**Status:** ready-for-agent

动画组件（`src/components/animations/`）：

- FadeIn, SlideUp, SlideLeft, ScaleIn, StampIn, SlideDown — 入场动画，props: `delay`（秒）、`duration`（秒）、`children`
- PulseDot, NumberPulse, LogoPulse — 循环动画，props: `interval`（秒）、`children`
- ScanSweep — 扫描线，props: `duration`（秒）
- GlitchFlash — 多段 keyframe，用 `interpolate()` 的 `outputRange` 数组映射 0%→10%→20%→30%→40%→100%

视觉组件（`src/components/`）：

- BrandBar — 品牌栏（top:140, left:60, right:200，import BRAND_MARK_SVG via staticFile）
- BreakingBadge — BREAKING 徽章 + 脉冲点
- StatCard — 统计卡片（flex:1, border-top 色彩, slideUp 入场）
- GridBg — 网格背景（60px grid, rgba(77,139,255,0.04)）
- Glow — 辉光效果（props: color, position）
- Scanlines — 扫描线纹理
- Watermark — 频道水印（top:60, left:60）

所有组件 import `{ CANVAS, SAFE_ZONES, WATERMARK_POS }` from `../../lib/safe-zones.mjs` 和 `{ FPS }` from `../../lib/timeline.mjs`。

- [ ] 12 个动画组件各有 snapshot 测试（给定 frame 值，验证 style 输出）
- [ ] 8 个视觉组件在 Remotion Studio 中渲染正确
- [ ] 帧转换公式正确：`delay_seconds * FPS = delay_frames`（0.3s = 9 帧 at 30fps）
- [ ] `extrapolateRight: 'clamp'` 在所有 interpolate 调用上设置

# Tickets: TikTok 视频色调优化 — Feed 分离度增强

> **Spec**: `docs/specs/spec-color-scheme-optimization.md`
> **调研报告**: `docs/research/tiktok-color-scheme-research.md`
> **Handoff**: `docs/handoffs/video-layout-standard.md`
> **创建日期**: 2026-08-08

## 依赖图

```
T1 ─┬─→ T2 ──→ T8
     │
T3 ─┼─→ T4 ──→ T5 ──→ T6 ──→ T7
     │              │
     └──────────────┴─────→ T9
```

## Tickets

### T1: base-styles — 背景微调 + glow/grid 透明度 + frame-glow CSS + flashFrame keyframe
- **依赖**: 无
- **文件**: `scripts/short-video/lib/base-styles.mjs`
- **改动**:
  1. `background: #050508` → `#0a0a14`
  2. `.grid-bg` 透明度 `0.03` → `0.04`
  3. `.glow-red` 透明度 `rgba(239,68,68,0.12)` → `rgba(239,68,68,0.15)`
  4. `.glow-blue` 透明度 `rgba(77,139,255,0.08)` → `rgba(77,139,255,0.10)`
  5. 新增 `.frame-glow` / `.frame-glow.blue` CSS 类
  6. 新增 `@keyframes flashFrame`
- **验证**: `npx vitest run scripts/short-video/__tests__/base-styles.test.mjs`（预期红——expected output 变了，T6 修）

### T2: base-styles — withWatermark() 注入 frame-glow div
- **依赖**: T1
- **文件**: `scripts/short-video/lib/base-styles.mjs`
- **改动**:
  1. `withWatermark(html)` 注入 `<div class="frame-glow"></div>` 到所有场景
  2. CTA 场景（检测 `class="brand-logo-large"`）注入 `<div class="frame-glow blue"></div>`
- **验证**: 检查 hook preview HTML 含 frame-glow div

### T3: scene-templates — focal-number + badge-pill + statCard + bigNumberAnchor + fadeToBlack
- **依赖**: 无
- **文件**: `scripts/short-video/lib/scene-templates.mjs`
- **改动**:
  1. `focal-number` fontSize `260px` → `300px`（templateCss 第 92 行）
  2. `badge-pill` padding `12px 32px` → `16px 48px`（templateCss 第 85 行）
  3. `stat-card` border-top `4px solid` → `5px solid`（templateCss 第 53 行）
  4. `stat-card` background `rgba(255,255,255,0.04)` → `rgba(255,255,255,0.06)`（templateCss 第 53 行）
  5. `bigNumberAnchor` 默认 fontSize `260` → `300`（函数第 199 行）
  6. `fadeToBlack()` background `#050508` → `#0a0a14`（第 246 行）
- **验证**: `npx vitest run scripts/short-video/__tests__/scene-templates.test.mjs`（预期红）

### T4: scene-templates — hookScene() 内部注入 flash-frame div
- **依赖**: T1, T3
- **文件**: `scripts/short-video/lib/scene-templates.mjs`
- **改动**:
  1. `hookScene()` 返回的 HTML 中，在 `grid-bg` 之前注入 `<div class="flash-frame"></div>`
- **验证**: hook preview HTML 含 flash-frame div 作为首个子元素

### T5: verify-scene-dom — EXEMPT_SELECTORS 新增
- **依赖**: T1, T4
- **文件**: `scripts/short-video/verify-scene-dom.mjs`
- **改动**:
  1. `EXEMPT_SELECTORS` 数组新增 `".frame-glow"` 和 `".flash-frame"`
- **验证**: `node scripts/short-video/verify-scene-dom.mjs --content _test-fixtures/hook-standard`

### T6: 测试 — 更新 scene-drift.test.mjs hook/CTA expected output
- **依赖**: T1-T5
- **文件**: `scripts/short-video/__tests__/scene-drift.test.mjs`
- **改动**:
  1. 更新 hook/CTA byte-identical expected output（focal-number/badge-pill/fadeToBlack/flash-frame/frame-glow 变更）
  2. 确认 `@keyframes flashFrame` 不与现有 keyframes 冲突
- **验证**: `npx vitest run scripts/short-video/__tests__/scene-drift.test.mjs`

### T7: 验证 — verify-scene-dom.mjs safe zone 合规
- **依赖**: T1-T5
- **文件**: 无（运行验证脚本）
- **验证**:
  1. `node scripts/short-video/verify-scene-dom.mjs --content _test-fixtures/hook-standard`
  2. `node scripts/short-video/verify-scene-dom.mjs --content bytedance-distillation`
  3. 确认 focal-number 300px + badge-pill 新尺寸不超出 safe zone
  4. 确认 frame-glow / flash-frame 豁免不误报

### T8: CTA 场景 frame-glow.blue 验证
- **依赖**: T2
- **验证**: 确认 ctaScene 输出含 `<div class="frame-glow blue">`

### T9: brand-system.md 同步更新
- **依赖**: T1-T8
- **文件**: `docs/brand-system.md`
- **改动**: 按 Spec §5 同步表更新 8 个值
- **验证**: git diff 确认所有旧值已替换

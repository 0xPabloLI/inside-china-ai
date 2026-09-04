# Spec: TikTok 视频色调优化 — Feed 分离度增强

> **调研报告**: `docs/research/tiktok-color-scheme-research.md`
> **Handoff 文档**: `docs/handoffs/video-layout-standard.md`（safe zone / 槽位系统 / 强制执行链）
> **创建日期**: 2026-08-08
> **状态**: Draft — 待 Grill 确认

## 1. 问题陈述

### 1.1 现象

China AI News 的 TikTok 视频使用暗色 Cyber Intelligence Briefing 风格（背景 `#050508`）。用户观察到大部分 TikTok 创作者使用亮色调，质疑暗色调是否影响吸引力。

### 1.2 调研结论

Deep Research（12 个信息源，2025-2026 数据）确认：

- **暗色调本身不是问题** — 暗色背景在高端/数据可视化/科技内容领域有明确优势
- **核心问题是 Feed 分离度不足** — TikTok UI 本身是暗色，`#050508` 背景与之过于接近，视频在 Feed 中"隐形"
- **TikTok 奖励色彩大胆** — 需要更高的饱和度和更大的强调色面积，而非切换到亮色背景
- **趋势时机有利** — dopamine color fatigue 预计 late 2026 到来，暗色差异化将成为优势

### 1.3 不做什么

- ❌ **不切换到亮色背景** — 破坏品牌身份 + 可能赶上 dopamine 衰退期
- ❌ **不降低色彩饱和度** — 会被 TikTok 判定为 "corporate"
- ❌ **不照搬其他 TikTok 频道的亮色风格** — 内容类型不同

## 2. 方案设计

### 2.1 核心策略：三层分离增强

```
Layer 1: Frame Glow（帧级发光） — 视频边缘的彩色发光边框，解决 Feed 伪装
Layer 2: Flash Hook（闪帧钩子） — 前 0.3-0.5s 高饱和度全屏闪帧，解决 0-0.5s 微留存
Layer 3: Accent Boost（强调色增强） — 扩大强调色面积/饱和度，解决整体视觉冲击力
```

### 2.2 Layer 1: Frame Glow（帧级发光边框）

#### 设计

在所有场景的视频帧边缘添加一个微妙的彩色发光边框，使暗色视频在 TikTok 暗色 UI 中呈现"发光矩形"效果。

#### 规格

| 属性         | 值                                                  | 说明                                   |
| ------------ | --------------------------------------------------- | -------------------------------------- |
| 位置         | `position: absolute; inset: 0; z-index: 99;`        | 覆盖全帧，置于内容之上、watermark 之下 |
| 边框         | `border: 3px solid rgba(245,158,11,0.2);`           | 琥珀色，低透明度，不抢内容             |
| 内发光       | `box-shadow: inset 0 0 40px rgba(245,158,11,0.08);` | 从边缘向内 40px 的柔和发光             |
| 动画         | 无（静态）                                          | 发光始终存在，不需要动画               |
| CTA 场景例外 | CTA 场景使用蓝色发光 `rgba(77,139,255,0.2)`         | 品牌收尾场景用蓝色而非琥珀色           |

#### CSS 实现

```css
.frame-glow {
  position: absolute;
  inset: 0;
  border: 3px solid rgba(245, 158, 11, 0.2);
  box-shadow: inset 0 0 40px rgba(245, 158, 11, 0.08);
  z-index: 99;
  pointer-events: none;
}
.frame-glow.blue {
  border-color: rgba(77, 139, 255, 0.2);
  box-shadow: inset 0 0 40px rgba(77, 139, 255, 0.08);
}
```

#### Safe Zone 关系

Frame-glow 是 `pointer-events: none` 的**装饰层**，不携带可读内容。Safe zone 约束的是 **content**（需要被观众读到的文字/数据），不是 decorative effects。因此 frame-glow 可以 `inset: 0` 覆盖全帧（包括 TikTok UI 遮挡区）而不违反 safe zone 原则。

#### 注入点

在 `baseStyles()` 中添加 `.frame-glow` / `.frame-glow.blue` CSS 类。在 `withWatermark(html)` 函数中，将 `<div class="frame-glow"></div>`（CTA 场景为 `<div class="frame-glow blue"></div>`）注入到每个场景 HTML 中（与 watermark 注入逻辑并行，但 frame-glow 注入到 **所有** 场景，包括已有 brand-bar 的场景）。

> **DOM 校验豁免**：`verify-scene-dom.mjs` 的 `EXEMPT_SELECTORS` 数组必须新增 `".frame-glow"`，否则其 `inset: 0`（覆盖 y<220 和 y>1150 区域）会触发 safe zone FAIL。这与现有豁免条目（`.grid-bg` / `.glow-blue` / `.scanlines` / `.fade-to-black` 等）的原理一致——背景/装饰层不受 content band 约束。

### 2.3 Layer 2: Flash Hook（闪帧钩子）

#### 设计

Hook 场景（Scene 1）的前 0.3-0.5 秒显示一个高饱和度全屏色彩帧，然后快速过渡到暗色场景。这创造了一个 "pattern break" — 在 0-0.5s 微留存窗口中最大化视觉冲击。

#### 规格

| 属性     | 值                                                 | 说明                     |
| -------- | -------------------------------------------------- | ------------------------ |
| 出现场景 | 仅 Hook 场景（Scene 1）                            | 其他场景不需要           |
| 色彩     | `var(--amber)` `#f59e0b`                           | 琥珀色 — 最高视觉可见度  |
| 初始状态 | `opacity: 1; background: var(--amber);`            | 全屏覆盖                 |
| 动画     | `animation: flashFrame 0.4s ease-out 0s forwards;` | 0.4s 内从 opacity 1 → 0  |
| 结束状态 | `opacity: 0; pointer-events: none;`                | 完全透明，不影响后续内容 |
| z-index  | `z-index: 200;`                                    | 在所有其他元素之上       |
| 尺寸     | `position: absolute; inset: 0;`                    | 全屏覆盖                 |

#### CSS 实现

```css
@keyframes flashFrame {
  0% {
    opacity: 1;
  }
  60% {
    opacity: 0.3;
  }
  100% {
    opacity: 0;
    pointer-events: none;
  }
}
.flash-frame {
  position: absolute;
  inset: 0;
  background: var(--amber);
  z-index: 200;
  pointer-events: none;
  animation: flashFrame 0.4s ease-out 0s forwards;
}
```

#### 注入点

在共享模板 `hookScene()` 函数内部注入 `<div class="flash-frame"></div>` 作为 scene HTML 的第一个子元素（在 `grid-bg` 之前）。这样所有委托 `hookScene` 的 content 自动获得闪帧，无需逐个修改各 content `scenes.mjs`。

> **老 content 兼容**：`deepseek` / `distillation/pt1` / `restraint/pt1` 等未迁移的 hand-written Hook 场景不使用 `hookScene()`，它们在迁移到共享模板前不会获得 flash-frame——这是预期行为（迁移后自动获得）。
>
> **DOM 校验豁免**：`verify-scene-dom.mjs` 的 `EXEMPT_SELECTORS` 必须新增 `".flash-frame"`。虽然 `verify-scene-dom.mjs` 会禁用动画后测量（`animation: none !important`），flash-frame 在动画禁用后 opacity 回到初始值 1（全屏覆盖），会被扫描到 y<220 和 y>1150。加入豁免列表后不会误报。`pointer-events: none` 确保它不阻挡交互。

### 2.4 Layer 3: Accent Boost（强调色增强）

#### 2.4a 背景微调

| 属性                           | 旧值                | 新值      | 原因                                                               |
| ------------------------------ | ------------------- | --------- | ------------------------------------------------------------------ |
| `background`（`baseStyles()`） | `#050508`           | `#0a0a14` | 减轻 OLED halation，加蓝调倾向增强赛博感                           |
| `fadeToBlack()` background     | `#050508`（硬编码） | `#0a0a14` | CTA 结尾淡出颜色必须与新背景一致，否则淡出终止帧与场景背景色不匹配 |

> **注意**：`fadeToBlack()` 在 `lib/scene-templates.mjs` 第 246 行硬编码了 `background: #050508`。此值必须同步更新为 `#0a0a14`，否则 CTA 场景（和任何使用 fadeToBlack 的场景）的结尾淡出会闪现旧背景色。

#### 2.4b 强调色面积扩大

| 元素                                 | 旧值        | 新值        | 原因                                       |
| ------------------------------------ | ----------- | ----------- | ------------------------------------------ |
| `focal-number` fontSize（hookScene） | `260px`     | `300px`     | Hook 场景数据锚点更大 = 更多琥珀色可见面积 |
| `bigNumberAnchor` 默认 fontSize      | `260px`     | `300px`     | 模板函数默认值同步（供手写场景调用）       |
| `badge-pill` padding（hookScene）    | `12px 32px` | `16px 48px` | Hook 场景 badge 略大                       |

> **`breaking-badge` 不改**：遗留组件 `breaking-badge`（`top: 210px` 绝对定位）已在 safe zone 之上 10px（handoff §9 遗留问题），增大 padding 会加剧越界。`breaking-badge` 仅老 `deepseek` content 使用；共享 `hookScene` 用的是 `badge-pill`（kicker slot 220–400 内），不受此问题影响。本次只改 `badge-pill`，不动 `breaking-badge`。
> | `stat-card` border-top | `4px solid` | `5px solid` | 卡片顶部强调色更宽 |
> | 卡片背景透明度 | `rgba(255,255,255,0.04)` | `rgba(255,255,255,0.06)` | 略微提高可见度 |

#### 2.4c 低透明度元素审计

| 元素                       | 旧值                    | 新值                    | 原因                       |
| -------------------------- | ----------------------- | ----------------------- | -------------------------- |
| `.grid-bg` 线条透明度      | `0.03`                  | `0.04`                  | 略微提高网格可见度         |
| `.glow-red` 透明度         | `rgba(239,68,68,0.12)`  | `rgba(239,68,68,0.15)`  | 红色发光更可见             |
| `.glow-blue` 透明度        | `rgba(77,139,255,0.08)` | `rgba(77,139,255,0.10)` | 蓝色发光更可见             |
| `.scanlines` 透明度        | `0.008`                 | 保持                    | scanlines 是纹理，不需提高 |
| `.brand-watermark` opacity | `0.35`                  | `0.35`                  | 保持不变                   |

## 3. 修改影响评估

### Section 1: Modified Files Impact

| 文件                                                        | 修改内容                                                                                                                                                                                                                                                                                               | 风险等级 | 评估                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/short-video/lib/base-styles.mjs`                   | (1) `background: #050508` → `#0a0a14`; (2) 新增 `.frame-glow` / `.frame-glow.blue` CSS 类; (3) 新增 `@keyframes flashFrame`; (4) 调整 glow/grid 透明度                                                                                                                                                 | Medium   | 修改了 `baseStyles()` 函数的返回值，所有视频场景都消费此函数。风险：已有场景的视觉一致性可能微变。缓解：所有变更都是增量（新增 CSS 类）或微调（透明度 +0.02），不影响布局结构。                                                                                           |
| `scripts/short-video/lib/scene-templates.mjs`               | (1) `focal-number` fontSize 260→300; (2) `badge-pill` padding 12px 32px → 16px 48px; (3) `statCard` border-top 4px→5px; (4) `bigNumberAnchor` 默认 fontSize 260→300; (5) `fadeToBlack()` background #050508→#0a0a14; (6) `hookScene()` 内部注入 flash-frame div; (7) `ctaScene()` frame-glow.blue 注入 | Medium   | 修改了模板函数参数和输出。`focal-number` 300px 在 hero slot (400–950) 有充足空间。`badge-pill` 在 kicker slot (220–400) 居中，加大后仍 fit。`fadeToBlack` 背景色同步是必须的。flash-frame 注入到 `hookScene()` 内部使所有委托的 content 自动获得。需验证 safe zone 合规。 |
| `scripts/short-video/lib/base-styles.mjs` `withWatermark()` | 新增 `frame-glow` div 注入逻辑（所有场景）                                                                                                                                                                                                                                                             | Low      | 纯追加 — 在现有 HTML 注入逻辑中新增一个 div，不修改 watermark 行为。CTA 场景需检测 `class="brand-logo-large"` 并注入 `.frame-glow.blue` 变体。                                                                                                                            |
| `scripts/short-video/verify-scene-dom.mjs`                  | `EXEMPT_SELECTORS` 新增 `".frame-glow"` + `".flash-frame"`                                                                                                                                                                                                                                             | Low      | 纯追加豁免条目。frame-glow / flash-frame 是 `pointer-events: none` 装饰层，`inset: 0` 覆盖全帧（含 y<220 / y>1150）。不加入豁免会触发 safe zone FAIL。与现有豁免（`.grid-bg` / `.glow-blue` / `.scanlines` / `.fade-to-black`）同理。                                     |
| `scripts/short-video/__tests__/scene-drift.test.mjs`        | 更新 hook/CTA expected output（模板参数变了，byte-identical 锁需同步）                                                                                                                                                                                                                                 | Medium   | `scene-drift.test.mjs` 锁定 `hookScene` / `ctaScene` 输出 byte-identical。改 `focal-number` / `badge-pill` / `fadeToBlack` / flash-frame 注入会改变输出字节。必须同步更新 expected output——这不是 bug，而是有意变更。                                                     |

### Section 2: Behavioral Scenarios

| #   | Scenario                                   | Expected Behavior                                                                                                                                                 | Risk   | Mitigation                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 暗色 UI 用户浏览 For You Feed              | frame-glow 边框使视频边缘可见，与暗色 UI 形成分离                                                                                                                 | Low    | frame-glow 透明度仅 0.2，不会过度抢眼                                                                                                                                                                                                                           |
| 2   | 亮色 UI 用户浏览 For You Feed              | frame-glow 在亮色 UI 上几乎不可见（暗色边框对亮色背景）                                                                                                           | Low    | frame-glow 设计为暗色 UI 优化；亮色 UI 用户占少数，不影响体验                                                                                                                                                                                                   |
| 3   | Hook 场景 0-0.5s 闪帧播放                  | 琥珀色全屏 flash 在 0.4s 内淡出，不影响后续动画序列                                                                                                               | Medium | flashFrame z-index 200 在所有内容之上，但 pointer-events:none 不阻挡交互                                                                                                                                                                                        |
| 4   | Hook 场景 0.5-1.0s 动画序列                | Breaking badge (0.3s) 和 big number (0.4s) 动画正常播放，不受闪帧影响                                                                                             | Low    | 闪帧在 0.4s 完成，badge/number 动画延迟从 0.3s/0.4s 开始，时序上有 0.1s 重叠但视觉上是自然过渡                                                                                                                                                                  |
| 5   | CTA 场景渲染                               | CTA 场景使用蓝色 frame-glow 而非琥珀色                                                                                                                            | Low    | CTA 场景已有 brand-logo-large 蓝色发光，frame-glow.blue 与之一致                                                                                                                                                                                                |
| 6   | OLED 设备渲染                              | `#0a0a14` 背景比 `#050508` 略亮，减少 halation；accent colors 在 OLED 上更鲜艳                                                                                    | Low    | 仅正向影响                                                                                                                                                                                                                                                      |
| 7   | safe zone 合规检查（verify-scene-dom.mjs） | `focal-number` 300px + `badge-pill` 16px 48px 不超出 safe zone；`frame-glow` / `flash-frame` 在 EXEMPT_SELECTORS 中不触发 FAIL                                    | Medium | `focal-number` 在 hero slot (400–950) 有 550px 高度，300px 字 + 48px label ≈ 348px，理论 fit。`badge-pill` 在 kicker slot (220–400) 居中。frame-glow / flash-frame 是装饰层（`pointer-events: none`），已加入豁免列表。需运行 `verify-scene-dom.mjs` 实测验证。 |
| 8   | scene-drift 测试                           | `hookScene` / `ctaScene` 输出字节变化（focal-number / badge-pill / fadeToBlack / flash-frame / frame-glow）；新增 `@keyframes flashFrame` 不与现有 keyframes 冲突 | Medium | `scene-drift.test.mjs` 锁定 hook/CTA byte-identical。模板参数变更后 expected output 必须同步更新——有意变更，不是 bug。flashFrame 是新名称，不与现有 keyframes 重名。                                                                                            |
| 9   | 已有视频内容重新渲染                       | 使用新 baseStyles 重新渲染已有视频会改变外观（背景色、发光、尺寸）                                                                                                | Medium | 已有视频不需要重新渲染。新参数仅应用于新视频。老 content（deepseek/distillation/restraint）未迁移到 hookScene，不会被 flash-frame 影响——迁移后自动获得。                                                                                                        |
| 10  | TikTok 算法内容分类                        | 闪帧 + 发光边框可能影响 TikTok 内容分析系统对视频的分类                                                                                                           | Low    | TikTok 算法主要基于行为信号（retention/interaction），视觉特征影响较小                                                                                                                                                                                          |
| 11  | CTA 场景 fadeToBlack 颜色一致性            | `fadeToBlack()` background 从 `#050508` → `#0a0a14`，与 `baseStyles()` 背景同步                                                                                   | Low    | 不同步会导致 CTA 结尾淡出终止帧与场景背景色不匹配（肉眼可见的色差闪现）。同步后完全一致。                                                                                                                                                                       |
| 12  | `breaking-badge` 遗留组件不受影响          | 本次只改 `badge-pill`（hookScene 内），不动 `breaking-badge`（遗留绝对定位组件）                                                                                  | Low    | `breaking-badge` 的 `top: 210px` 已越界 safe zone 10px（handoff §9），增大 padding 会加剧。本次不触碰它；它仅老 deepseek 使用，迁移后自然消失。                                                                                                                 |

## 4. 实施计划

### 4.1 Ticket 拆分

| Ticket | 描述                                                                                                                                                                                          | 依赖   | 预计工时 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| T1     | base-styles: 背景微调 `#050508`→`#0a0a14` + glow/grid 透明度提升 + frame-glow/frame-glow.blue CSS 类 + `@keyframes flashFrame`                                                                | 无     | 30 min   |
| T2     | base-styles: `withWatermark()` 注入 frame-glow div（所有场景，CTA 用 blue 变体）                                                                                                              | T1     | 15 min   |
| T3     | scene-templates: `focal-number` 260→300 + `badge-pill` padding 12px 32px → 16px 48px + `statCard` border-top 4→5px + `bigNumberAnchor` 默认 260→300 + `fadeToBlack()` background 同步 #0a0a14 | 无     | 25 min   |
| T4     | scene-templates: `hookScene()` 内部注入 `<div class="flash-frame"></div>`（共享模板级，非 per-content）                                                                                       | T1, T3 | 15 min   |
| T5     | verify-scene-dom: `EXEMPT_SELECTORS` 新增 `".frame-glow"` + `".flash-frame"`                                                                                                                  | T1, T4 | 10 min   |
| T6     | 测试: 更新 scene-drift.test.mjs hook/CTA expected output（模板参数变更）+ base-styles.test.mjs                                                                                                | T1-T5  | 35 min   |
| T7     | 验证: verify-scene-dom.mjs safe zone 合规（focal-number 300px + badge-pill 新尺寸）                                                                                                           | T1-T5  | 15 min   |
| T8     | CTA 场景: frame-glow.blue 变体验证（ctaScene 内的 frame-glow.blue 注入由 T2 覆盖）                                                                                                            | T2     | 5 min    |
| T9     | brand-system.md 同步更新（§5 章节：背景色 / 透明度 / bigNumber 300px / frame-glow 层 / flashFrame 动画）                                                                                      | T1-T8  | 20 min   |

### 4.2 验证清单

- [ ] `npm run lint` 通过
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run build` 通过
- [ ] `vitest run` 全绿（含更新的 scene-drift hook/CTA expected output + base-styles 测试）
- [ ] `verify-scene-dom.mjs` safe zone 合规（focal-number 300px + badge-pill 新尺寸 + frame-glow/flash-frame 豁免）
- [ ] Hook 场景 DOM 检查：flash-frame 在 0.4s 后 opacity=0
- [ ] frame-glow 在所有场景中渲染（截图验证）
- [ ] CTA 场景使用蓝色 frame-glow.blue
- [ ] `fadeToBlack()` background 已同步为 `#0a0a14`（CTA 结尾无色差闪现）
- [ ] 背景色 `#0a0a14` 在 OLED 设备上无 halation（肉眼检查）
- [ ] `breaking-badge` 遗留组件未被修改（仅 `badge-pill` 改动）
- [ ] `docs/brand-system.md` 已同步更新（§5 章节：背景色 / 透明度 / bigNumber 300px / frame-glow 层 / flashFrame 动画）

## 5. Brand System 同步更新

> brand-system.md 第 347 行规则："When changing brand specs, update this file first, then update the implementation files to match."

本 Spec 的变更会让 `docs/brand-system.md` 的多个章节过时。实施时必须**同步更新** brand-system.md 以下章节：

| brand-system.md 章节                                                                  | 当前值        | 新值                                    | 对应 Spec 章节 |
| ------------------------------------------------------------------------------------- | ------------- | --------------------------------------- | -------------- |
| §Background: "Base: `#050508`"                                                        | `#050508`     | `#0a0a14`                               | §2.4a          |
| §Background: "Cards: `rgba(255,255,255,0.03)`"                                        | `0.03`        | `0.06`                                  | §2.4b          |
| §Background Layers: "these four effects" + grid 0.03 / glow-red 0.12 / glow-blue 0.08 | 4 层          | 5 层（+frame-glow）+ 0.04 / 0.15 / 0.10 | §2.2 + §2.4c   |
| §Color Usage Guide: "Dominant 60%: `#050508`"                                         | `#050508`     | `#0a0a14`                               | §2.4a          |
| §Typography: "Data anchors: 64-280px"                                                 | 64-280px      | 64-300px                                | §2.4b          |
| §Content Patterns: "oversized numbers (64-280px)"                                     | 64-280px      | 64-300px                                | §2.4b          |
| §1. Hook Scene: "bigNumber (amber 260px glow)"                                        | 260px         | 300px                                   | §2.4b          |
| §Animation Library: 5 keyframes                                                       | 无 flashFrame | 新增 `flashFrame` (0.4s, ease-out)      | §2.3           |

> **注意**：brand-system.md 的颜色 token（`--blue` `#4d8bff` / `--amber` `#f59e0b` / `--red` `#ef4444` 等）不变——本次只改背景基色和透明度参数，不改品牌色 token 的 hex 值。

## 6. 不在范围内

- **全盘切换到亮色背景** — 调研结论明确不建议
- **品牌色 token 变更** — `--blue`, `--amber`, `--red` 等 hex 值不变
- **网站配色调整** — 网站使用独立的 OKLCH 调色板，不在本次范围
- **TikTok 发布策略变更** — 发布时间、频率、标签策略不变
- **TTS/字幕/音频变更** — 仅视觉层变更
- **A/B 测试基础设施** — 本次直接实施优化，A/B 测试作为后续可选项

## 7. 后续可选方向（不在本次 Spec 范围内）

1. **A/B 测试**：制作暗色版 vs 亮色版 Hook 场景，对比 3s retention
2. **动态 frame-glow**：frame-glow 颜色跟随场景语义色变化（红色场景 → 红色 glow）
3. **Hook 闪帧色彩 A/B**：测试琥珀色闪帧 vs 蓝色闪帧 vs 红色闪帧的留存率差异
4. **retention curve 分析**：分析已发布视频的留存曲线，定位精确的 drop-off 时间点

## 8. 参考资料

- 调研报告：`docs/research/tiktok-color-scheme-research.md`
- 品牌系统：`docs/brand-system.md`
- Handoff 文档（safe zone / 槽位系统 / 强制执行链）：`docs/handoffs/video-layout-standard.md`
- 暗色模式设计指南：FallingBrick Dark Mode Design 2026 [5]
- 色彩心理学 2026：Jasmine Directory [2]
- TikTok Hook 策略：HypeNest 2026 [7]

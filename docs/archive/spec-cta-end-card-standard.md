# Spec: 标准 CTA 结尾页（CTA End Card Standard）

> Status: active (implementation in progress)
> Date: 2026-08-07
> Grill: 已完成（用户确认：amber stampBox 主 CTA、全量迁移、布局固定 + 数据槽位、新增契约检查、evergreen 用 `FOLLOW FOR MORE`）

## 1. 问题

每个视频的 CTA 结尾页（最后一帧）已 drift 成 5 套互不相同的手写实现：

| 视频 | Logo | 品牌名 AI 高亮 | Action 元素 | 结尾淡出 | 数据字段形状 |
|---|---|---|---|---|---|
| bytedance-distillation | 120px 无脉冲 | ❌ 未应用 | 蓝色 stampBox | ❌ 无 | `action`+`topic` |
| deepseek | 130px 脉冲 | ✅ | amber 大字 | 内联复制 | `line1` |
| distillation pt1 | 130px 脉冲 | ✅ | amber 大字 | 内联复制 | `line1` |
| restraint pt1 | 130px 脉冲 | ✅ | amber 大字 | 共享 helper | `action`+`topic` |
| evergreen ×5 / batch-generate | — | — | — | — | `title`（第三种形状） |

问题：
1. 数据契约 3 种形状（`action+topic` / `line1` / `title`），新视频只能复制旧代码再改
2. bytedance 版品牌名未应用 `brandHighlight`，"AI" 非蓝色，违反 brand-system.md 硬性规则
3. tagline 大小写不统一（`China's AI, decoded.` vs `CHINA AI, DECODED`）
4. fade-to-black 有的有、有的没有
5. 每个新视频重写 ~30 行 CSS，drift 持续扩大

## 2. 设计（已锁定）

**布局始终固定，文案槽位数据驱动。** 观众看到的画面永远一致，只有字在变。

```
┌─────────────────────┐
│  [大 Logo 130px]     │  ← scaleIn + logoPulse 脉冲光晕
│  CHINA AI NEWS      │  ← 72px/900，AI 恒为蓝色 (.hl)
│  CHINA AI, DECODED  │  ← 统一大写 tagline
│                     │
│  [FOLLOW FOR MORE]  │  ← amber stampBox 主 CTA（品牌规则色 + → 图标）
│  (可选 topic 行)     │  ← 系列视频下集预告槽位
│  + fadeToBlack 收尾  │
└─────────────────────┘
```

- 背景层：`grid-bg` + `glow-blue` + `scanlines`（与其他场景一致）
- `withWatermark` 因 `class="brand-logo-large"` 自动跳过（无双重品牌，复用现有机制）
- 动画只用 `baseStyles()` 已内置 keyframes（`scaleIn`/`logoPulse`/`fadeIn`/`stampIn`/`fadeOut`），不新增
- 垂直居中布局，整块高度 ~500px < 底部安全区（bottom 1470px 边界内）
- bytedance 版修复：AI 蓝色高亮 + fade 补齐；topic 槽位语义改为"系列下集预告"，独立视频不再用（bytedance 是独立视频 → 移除 topic）

## 3. 数据契约（唯一形状）

```js
texts: {
  brand: "CHINA AI NEWS",      // 显示文本
  brandHighlight: "AI",        // 包在 <span class="hl"> 内（品牌蓝）
  tagline: "CHINA AI, DECODED",// 统一大写
  action: "FOLLOW FOR MORE",   // 必填 — amber stampBox 文案
  topic: "PRICING STRATEGY",   // 可选 — 系列下集预告槽位
}
```

内容类型 → action 取值约定（copy 仍属内容层，模板零文案）：

| 内容类型 | action | topic |
|---|---|---|
| 独立视频 | `FOLLOW FOR MORE` | 无 |
| 系列中间集 | `FOLLOW FOR PART N` | 下集钩子（可选，见注） |
| 系列完结集 | `FOLLOW FOR MORE` | 无 |

> 注（review 后澄清）：`topic` 槽位整体可选。若该集已有独立 teaser 场景承载下集钩子（如 distillation pt1 S7），CTA 的 topic 可省略，避免画面重复；restraint pt1 无独立 teaser 场景，因此 CTA 携带 `topic: "PRICING STRATEGY"`。槽位的活消费者以 restraint pt1 为准。

## 4. 实施形态

- `lib/scene-templates.mjs` 新增共享 `ctaScene(scene, duration)` 完整场景生成器（data-only，零业务文案，与既有模板规约一致）+ `templateCss()` 追加 `.s-cta` 样式
- 各 content `scenes.mjs` 的 CTA 场景函数委托 `ctaScene`（bytedance S9 / deepseek S12 / restraint S11 / distillation pt1 S8）
- 各 content `scene-data.mjs` 迁移到新契约
- `lib/scene-rules.mjs` 新增 `checkCTAActionContract`（fail 级）并注册进 `runAllSceneDataChecks`
- 数据生产者迁移：`evergreen-templates/*.mjs` ×5 + `batch-generate.mjs` 脚手架
- 测试夹具同步：`_test-fixtures/overlimit`、`scene-rules.test.mjs` validScenes 补 `action`
- 漂移守卫：`scene-drift.test.mjs` 新增"每个 content 的 CTA 场景输出与 `ctaScene` 字节级一致"

> 注：pt2/pt3 的 `scenes.mjs` 是未实现 stub（throw），只迁移其 scene-data 契约。

## 5. Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact（修改影响评估）

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| scripts/short-video/lib/scene-templates.mjs | 新增 `ctaScene()` + `.s-cta` CSS | Low | 纯追加；为引入 `baseStyles` 形成与 base-styles.mjs 的循环 import（ESM，只用函数级绑定，模块顶层不调用，安全）；既有导出不动 |
| scripts/short-video/lib/base-styles.mjs | 无改动 | — | 依赖其已导出的 keyframes/watermark 机制 |
| scripts/short-video/content/bytedance-distillation/scenes.mjs | scene9 委托 ctaScene | Medium | 结尾视觉变化（蓝→amber、AI 高亮、补 fade）；只影响未来渲染，已发布视频不受影响；下游：main.mjs/render-only.mjs 走 generateScene，签名不变 |
| scripts/short-video/content/deepseek/scenes.mjs | scene12 委托 ctaScene | Medium | 同上；scene12 的 `brandHighlight` 替换逻辑移入共享模板 |
| scripts/short-video/content/distillation/pt1/scenes.mjs | scene8 委托 ctaScene | Medium | 同上；断言测试随数据契约更新 |
| scripts/short-video/content/restraint/pt1/scenes.mjs | scene11 委托 ctaScene | Medium | 同上；restraint 已几乎符合新契约 |
| scripts/short-video/content/deepseek/scene-data.mjs | cta texts: `line1`→`action`，tagline 大写 | Medium | 数据契约迁移；检查：场景 html 单测 + drift 等值测试 |
| scripts/short-video/content/distillation/pt1/scene-data.mjs | 同上 | Medium | 同上 |
| scripts/short-video/content/distillation/pt2/scene-data.mjs | 同上（scenes.mjs 是 stub） | Low | 只有数据，无渲染消费方 |
| scripts/short-video/content/distillation/pt3/scene-data.mjs | 同上 | Low | 同上 |
| scripts/short-video/content/bytedance-distillation/scene-data.mjs | 移除冗余 `topic` | Low | 独立视频，topic 槽位语义为系列预告 |
| scripts/short-video/content/restraint/pt1/scene-data.mjs | 无改动（已符合契约） | — | 确认即可 |
| scripts/short-video/evergreen-templates/*.mjs ×5 | `title: "SUBSCRIBE"` → 新契约全字段 | Low | 数据模板，未被管线消费（仅 roadmap 提及）；检查：新增测试断言 |
| scripts/short-video/batch-generate.mjs | 脚手架 CTA texts → 新契约 | Low | 只影响未来生成的草稿 |
| scripts/short-video/lib/scene-rules.mjs | 新增 `checkCTAActionContract` 并注册 | Medium | fail 级新规则影响 preflight 退出码 → 必须同步所有夹具，否则 verify-guard-cli 测试会挂 |
| scripts/short-video/content/_test-fixtures/overlimit/scene-data.mjs | cta texts 补 `action` | Low | 测试夹具，保持所有规则合规 |
| scripts/short-video/__tests__/scene-rules.test.mjs | validScenes cta 补 `action` + 新检查测试 | Low | fixture 更新 + 追加 |
| scripts/short-video/__tests__/scene-templates.test.mjs | ctaScene 测试块 | Low | 追加 |
| scripts/short-video/__tests__/scene-drift.test.mjs | CTA 等值漂移守卫 + evergreen 契约断言 | Low | 追加 |
| scripts/short-video/__tests__/distillation-pt1-scenes.test.mjs | scene8 断言更新 | Low | 随数据契约更新 |
| docs/video-workflow.md | "CTA scene: Logo at 200px" → 130px + ctaScene 引用 | Low | 文档对齐代码 |

### Section 2: Behavioral Scenarios（行为场景矩阵）

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 完整 texts 渲染 | 结构齐全：logo 130px + brand(AI 高亮) + tagline + amber stampBox action + fade | 视觉回归 | 单测断言各元素 + amber class |
| 2 | `topic` 缺失（独立视频） | 不渲染 topic 元素 | 条件渲染 bug | 单测断言 topic 块不存在 |
| 3 | `action` 缺失 | 不渲染 stampBox；不输出 undefined | 降级路径 | 单测 |
| 4 | `texts: {}` 全空 | 输出空品牌名场景，无 undefined、无业务文案 | 降级路径 | 单测 + copy-free 断言 |
| 5 | `brandHighlight` 不在 brand 内 | 原样输出 brand，无高亮替换（不报错） | 数据不一致 | 单测 |
| 6 | `withWatermark` 注入 | 因 `brand-logo-large` 跳过，无双重品牌 | 双重品牌 | 既有 withWatermark 测试 + 等值测试 |
| 7 | content generateScene(cta) 输出 | 与 `ctaScene` 输出字节级一致（每个已实现视频） | drift 回归 | scene-drift 等值守卫 |
| 8 | 最后一帧 cta 且有 action | `checkCTAActionContract` → pass | 规则误报 | 单测 |
| 9 | 最后一帧 cta 无 action | → fail（detail + fix 提示） | 漏检 | 单测 |
| 10 | 最后一帧 cta 且 action 空串 | → fail | null/empty 边界 | 单测 |
| 11 | `texts` 缺失 | → fail（`texts?.action` 安全访问，不 crash） | 降级 | 单测 |
| 12 | 模板层 copy-free | `ctaScene({texts:{}})` 无裸大写业务文案 | 文案泄漏 | assertNoBusinessCopy |
| 13 | keyframes 唯一性 | ctaScene 不声明任何 @keyframes | drift | 既有 drift 测试 |
| 14 | preflight 夹具 | overlimit（补 action 后）T1-10/11/12 退出码不变 | 规则破坏 CI | verify-guard-cli 测试 |
| 15 | pt1 场景测试 | scene8 断言更新后全绿（`CHINA AI, DECODED` / `FOLLOW FOR PART 2` / fade / 无 subscribe 死区） | 断言陈旧 | 更新测试 |
| 16 | evergreen 数据 | 每个模板末帧 texts 含非空 `action` | 漏迁移 | 新增断言 |
| 17 | batch-generate 脚手架 | 生成模板 cta texts 用 `action` 字段 | 生产者漏改 | 新增断言（或行内检查） |
| 18 | 无 undefined 渲染 | 各迁移场景输出不含 "undefined" | 渲染 bug | pt1 全场景循环测试已覆盖 |
| 19 | 编译/构建 | lint + tsc + build 通过 | CI | Runtime Verify |

## 6. 测试映射

矩阵 #1-6、#12-13 → `scene-templates.test.mjs`；#7 → `scene-drift.test.mjs`；#8-11 → `scene-rules.test.mjs`；#14 → `verify-guard-cli.test.mjs`（既有，夹具更新）；#15 → `distillation-pt1-scenes.test.mjs`；#16-17 → `scene-drift.test.mjs`；#18 → 既有循环测试；#19 → CLI 验证。

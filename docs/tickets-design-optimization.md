# Tickets: 设计系统优化

> Spec: `docs/spec-design-optimization.md`。每个 ticket 为原子提交单元，完成即 commit（Commit Cadence 规则）。
> 图例：`→` 依赖（前置必须完成并验证）。

## 依赖图

```
T1 共享层(safe-zones+scene-templates+base-styles) ──┬→ T3 restraint 迁移 ─┬→ T5 视频矩阵验证
T2 冗余规则(THRESHOLDS+checkBodyTextVoRedundancy) ──┘                      │
T4 deepseek/distillation 修复（独立，可并行）───────────────────────────────┘
T6 drift 测试（依赖 T1/T2 产物，T4 完成后跑通）──→ T5
W1 移动导航 ──┐
W2 widget 字号/颜色 ──┼──→ W4 网站矩阵验证（lint+build+tsc+Playwright）
W3 样式规范 ──┘
T7/W5 文档同步（brand-system.md + video-workflow.md）──→ 收尾（code-review, push）
```

## T1 — 视频共享层：safe-zones + scene-templates + base-styles 水印/动画

**前置**：无（spec §批次 V1）

- [ ] 新建 `lib/safe-zones.mjs`（SAFE_ZONES + WATERMARK_POS + JSDoc）
- [ ] 新建 `lib/scene-templates.mjs`（brandBar/breakingBadge/statCard/quoteBox/titleBlock/bigNumberAnchor/pointsList/stampBox/fadeToBlack + SHARED_KEYFRAMES）
- [ ] `base-styles.mjs`：withWatermark 左上注入 + brand-bar 跳过；迁出组件 re-export；keyframes 归集
- [ ] 单测：withWatermark 两种分支 + 常量 sanity（先写后实现，red→green）

**验证**：`npx vitest run scripts/short-video/__tests__/scene-drift.test.mjs`（T6 全部写完前先跑新增子集）

## T2 — 冗余规则：checkBodyTextVoRedundancy

**前置**：无（spec §批次 V4）

- [ ] `tiktok-rules.mjs` THRESHOLDS 追加 `bodyTextDuplicateMinWords: 3`（先核对 sync 测试无 key 穷举）
- [ ] 先写 `scene-rules-redundancy.test.mjs`（矩阵 V4 全行）→ red
- [ ] `scene-rules.mjs` 实现 `checkBodyTextVoRedundancy` → green
- [ ] 三个 pipeline `verify-video.mjs --pre` 确认无新增 fail（warn 可见即通过）

**验证**：`npx vitest run scripts/short-video/__tests__/scene-rules-redundancy.test.mjs` + preflight

## T3 — restraint/pt1 迁移 + 缺陷修复

**前置**：T1

- [ ] `scene-data.mjs` 新增全部字段（spec 批次 V2 清单）
- [ ] `scenes.mjs` 迁移到 scene-templates；删底部脚注；S3 断词修复；S4 去重
- [ ] preflight 全绿；帧抽验 S1/S3/S4/S6/S9/S11

**验证**：`verify-video.mjs --pre` + render-only 帧对比（录制需 TTS 音频可用；如不可用则用现有 audio/ 产物按场景时长重渲染）

## T4 — deepseek / distillation 数据化 + 底注移除

**前置**：无（spec §批次 V3；与 T3 并行）

- [ ] deepseek：S1 source-badge、S12 subscribe 行移除（scene-data 同步清理引用）
- [ ] distillation：全部硬编码大写文案数据化；底注移除
- [ ] 两 pipeline preflight 全绿

**验证**：`verify-video.mjs --pre --content deepseek --content distillation/pt1`（分两次）+ 帧抽验

## T6 — 视频 drift 测试

**前置**：T1、T2；T4 完成后跑通

- [ ] `__tests__/scene-drift.test.mjs`：裸文案扫描、bottom 锚点扫描、常量 sanity、withWatermark 分支、模板零业务文案
- [ ] T2 的 redundancy 测试保持独立文件或并入既有 scene-rules 测试（视既有结构）

**验证**：`npx vitest run scripts/short-video/__tests__`

## T5 — 视频矩阵验证

**前置**：T3、T4、T6

- [ ] 全量视频测试套件（`npx vitest run scripts/short-video`）
- [ ] 三 pipeline preflight +（可行的）帧对比验收，产出截屏证据
- [ ] 确认既有视频组装/字幕测试未受影响

## W1 — 移动端导航（HeaderNav 抽取）

**前置**：无

- [ ] 新建 `header-nav.tsx`（桌面横排 / <640px 汉堡 + Sheet 或 disclosure）
- [ ] `header-nav.test.tsx`（静态渲染矩阵 W1-W5）
- [ ] `site-header.tsx` 消费 HeaderNav（桌面视觉不变）
- [ ] Playwright：375px 交互 + 1280px 桌面快照

**验证**：`npx vitest run src` + Playwright

## W2 — widget 字号 / 原生色 / focus-visible

**前置**：无

- [ ] grep 枚举 `text-[10px]`/`text-[11px]` 出现位置 → 受控替换 text-xs（widgets + companies.tsx）
- [ ] 原生 Tailwind 色 → 语义 token（spec 映射表）
- [ ] pricing-view 模式切换按钮 focus-visible
- [ ] drift 单测：widgets 目录零 text-[10px]/[11px] 与零原生色类

**验证**：`npx vitest run src` + lint/build

## W3 — 网站样式规范落地

**前置**：无

- [ ] posts.$slug.tsx：widget 统一卡片壳 + 正文 body-large token（widgetWrapperClass helper + 单测）
- [ ] styles.css：blockquote 1px+tint、全局 prefers-reduced-motion
- [ ] subscribe-form border /70
- [ ] companies.tsx：URL / badge / FAQ h3

**验证**：`npx vitest run src` + lint/build + dev 截屏（文章页 / companies / 暗色）

## W4 — 网站矩阵验证

**前置**：W1、W2、W3

- [ ] `npm run lint && npx tsc --noEmit && npm run build`
- [ ] dev server + Playwright：首页/文章页/companies（桌面 + 375 移动 + 暗色）截屏；汉堡交互
- [ ] 全量 `npx vitest run`（确认无非环境性回归）

## T7/W5 — 文档同步

**前置**：T3、T4 通过验证

- [ ] `docs/brand-system.md`：实施路径、网站语言、Safe Zones、模板原语、水印规则、底部元素策略
- [ ] `docs/video-workflow.md`：过期引用修正
- [ ] `docs/content-pipeline.md` 如有视频相关描述需同步（grep 核对）

## 收尾

**前置**：T5、W4、T7/W5

- [ ] code-review 双轴（Standards + Spec）
- [ ] 原子提交汇总核对（git status 只含本 session 文件）
- [ ] commit + push（普通 push，禁止改写历史）
- [ ] Linear：MCP 未认证 → 显式跳过并注明原因
- [ ] Session 结束自查清单（AGENTS.md Step 1-8）

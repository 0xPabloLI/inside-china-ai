# Spec: 设计系统优化 —— 视频视觉 + 网站 UI 一致性

> 来源：设计审查报告（2026-08-06）。用户确认「一块落」后按 AGENTS.md 工作流固化。
> 四个决策点已经用户逐项确认（见「决策记录」）。

## 目标

1. 止住视频管线「共享层被绕过 + 硬编码文案」的架构漂移，让 `verify-video.mjs --pre` 覆盖全部上屏文字。
2. 修复实测帧缺陷：S3 断词、S4 重复标签、底部死区元素（source 脚注 / CTA 静音行）、水印被 TikTok UI 遮挡。
3. 网站侧：widget 字号 <12px、Tailwind 原生色、移动端导航、blockquote 边框、widget 容器不统一等 DESIGN.md 违规项清零。

## 决策记录（用户确认）

| #   | 决策点                                                   | 确认结果                                                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| D1  | 底部死区元素（bottom:120px 的 source 脚注 + CTA 静音行） | **移除**（内容 VO 已覆盖 / 与琥珀色主 CTA 重复）                                           |
| D2  | 共享模板层迁移范围                                       | **restraint 全量迁移**；deepseek/distillation 只做硬编码文案数据化 + 安全区修复            |
| D3  | 水印位置                                                 | **左上角 top:60 left:60**，且场景已含品牌栏时跳过注入                                      |
| D4  | 网站 widget 容器                                         | **文章页渲染点统一包卡片**（非 breakout 用 max-w-prose，全部包 rounded-lg border bg-card） |

## 变更设计

### 批次 V1 — 视频共享层（新文件 + base-styles）

- `scripts/short-video/lib/safe-zones.mjs`（新）：`SAFE_ZONES = { top: 220, right: 160, bottom: 450, left: 60 }`（1080×1920 画布上内容安全区；450 与字幕 margin 一致）+ `WATERMARK_POS = { top: 60, left: 60 }` + JSDoc 说明 TikTok UI 布局依据。
- `scripts/short-video/lib/scene-templates.mjs`（新）：共享场景原语
  - `brandBar({ logoSize, tag = "INTELLIGENCE BRIEFING" })` —— 替代各场景内联 brand bar（统一 48px logo/24px 字）
  - `breakingBadge(text)`、`statCard({ num, unit, label, color })`（从 base-styles 迁入）
  - `quoteBox({ quote, highlight, color, speaker, source, fontSize })`（no hardcoded copy，全由调用方传）
  - `titleBlock(text, { highlight, fontSize })`
  - `bigNumberAnchor(num, { color })`（共享 numberPulse keyframes）
  - `pointsList(points, { minWords })`、`stampBox(text, { color, sub })`、`fadeToBlack(duration)`
  - `SHARED_KEYFRAMES` —— slideDown / numberPulse / glowPulse / logoPulse / scanSweep / hookIn 等此前逐场景复制的 keyframes
  - 所有函数只接收数据，**内部不出现业务文案**
- `scripts/short-video/lib/base-styles.mjs`
  - `withWatermark`：注入位置由固定 bottom/right 改为 `WATERMARK_POS`（左上），**html 含 `brand-bar` class 时跳过注入**（避免与品牌栏重叠）
  - `brandBar/breakingBadge/statCard/fadeToBlack` 迁移到 scene-templates 后从该模块 re-export（保持公共 API 兼容，已有零调用方，纯保险）
  - 共享动画补齐到基础 CSS（slideDown 等）

### 批次 V2 — restraint/pt1 迁移 + 缺陷修复

- `scene-data.mjs`：新增字段承接全部硬编码文案：
  - S1: `sourceTag`（原 `SOURCE: LIANG WENFENG INVESTOR MEETING` → 现 source 字段保留，脚注移除）
  - S2: `meetingDuration: "3.5h"`、`meetingLabel: "INVESTOR MEETING"`、`appearanceTag`（原 `RARE PUBLIC APPEARANCE`，**移除**，VO 已覆盖 —— 如保留则并入其它结构，见 D1）
  - S3: `title: "THE ORIGIN"`、`beforeLabel: "STARTED AS"`、`afterLabel: "BECAME"`、`note`、`noteHighlight`
  - S4: 移除硬编码重复 label `PRICE CUT`（context 已显示）；`source` 字段移除（VO 已说）+ 修复 S3 断词（卡片文字 36px→30px，`word-break: normal` 整词换行）
  - S6: `title: "VISION IS NOT"`、`note`/`noteHighlight`（原硬编码 note）
  - S7: `refLabel: "LIANG CITES"`、`contextText`/`contextHighlight`（原 `Got most things wrong, but nailed this`）、`attribution`（**移除**脚注）
  - S9: `title: "BOTH"`、`titleHighlight: "OPEN SOURCE"`、`insight`/`insightHighlight`
  - S10: `title: "DEEPSEEK'S"`、`titleHighlight: "PLAYBOOK"`、`teaserWhen: "TOMORROW"`
  - S11: `subscribe` 静音行 **移除**（琥珀色 action 已承担 CTA）
- `scenes.mjs`：全部 11 个场景改用 scene-templates 原语；底注 footer（bottom:120px）全部移除；移除所有硬编码大写文案（仅保留 `CHINA AI NEWS` / `INTELLIGENCE BRIEFING` / `DEEPSEEK` 品牌恒量，由 brandBar 承担）；S11 CTA 的 `SUBSCRIBE FOR MORE` 行移除。
- 视觉基调不变：蓝主光、amber 数据锚、glow 层、scanlines、stagger 动画节奏与现版本一致（用帧对比验证）。

### 批次 V3 — deepseek / distillation 修复（不迁移）

- `content/deepseek/scenes.mjs`：
  - S1 移除 `.source-badge` 底注；S12 移除 `.subscribe` 静音行（`t(txt,"subscribe")` 渲染移除）
  - 其余不动（场景数据已全部走 texts）
- `content/deepseek/scene-data.mjs`：如 `subscribe` key 不再被引用且无下游消费者则删除（先 grep 确认）。
- `content/distillation/pt1/scenes.mjs` + `scene-data.mjs`：硬编码文案全部数据化：
  - S1 `DISTILLATION ALERT` → texts.badge；S2 `NOT JUST COPYING ANSWERS` → texts.title；`SURFACE LEVEL`/`WHAT THEY STOLE` → texts.leftTitle/rightTitle；S3 `THE CRACK SEQUENCE` → texts.title；S4 `INDEPENDENTLY CONFIRMED` → texts.verifiedLabel；S5 `SELECTIVE ACCUSATIONS` → texts.title；S6 `COMING NEXT` → texts.nextLabel；`SUBSCRIBE TO NOT MISS IT` / `SUBSCRIBE FOR MORE` 底注按 D1 **移除**
  - scenes.mjs 内部保留 `DISTILLATION ALERT` 等零文案（除品牌恒量）

### 批次 V4 — 规则与校验（TDD）

- `lib/tiktok-rules.mjs`：`THRESHOLDS` 新增 `bodyTextDuplicateMinWords: 3`。
- `lib/scene-rules.mjs`：新增 `checkBodyTextVoRedundancy(scenes)`：
  - 范围：scene 2..n-1（跳过 hook 与 CTA）
  - 归一化：小写、去标点/符号/空白塌缩
  - 判定：任一 VO 碎片（≥3 词，词边界）以归一化形式出现在该场景 texts 拼接串中 → `warn`（非阻塞）；说明书"正文 ≠ 字幕 ≠ VO"三层重复原则
  - 返回 `{ level: "warn", category: "De-AI", check: "...", detail, fix }` 或 pass
- 新规则经 `runAllSceneDataChecks` 自动进入 preflight 与 post-render 报告（verify-video.mjs 无需改）。

### 批次 V5 — 视频 drift 测试（TDD）

新增 `scripts/short-video/__tests__/scene-drift.test.mjs`：

1. **硬编码文案扫描**：读 `content/*/*/scenes.mjs`（含 pt1 子目录），正则找模板内的裸大写句子（`>[A-Z0-9 .,'%:&!()-]{8,}<` 及 `>[A-Z][^<]{12,}<`），白名单仅：`CHINA AI NEWS`、`INTELLIGENCE BRIEFING`、`DEEPSEEK`、`VS`、`DONE`、`NOW`、`NEXT`、`STEP`、`PART`、`✓`、`✗`、`→` 结构符号 → 期望零命中。
2. **底部死区锚点扫描**：`bottom: 1[0-9][0-9]px`（100-199px）零命中。
3. **safe-zone 常量 sanity**：`SAFE_ZONES.top < right < bottom`、`WATERMARK_POS` 在文档声明区间、数值均 > 0。
4. **withWatermark 行为**：含 `brand-bar` 的 html → 无注入；无 → 注入且含 `WATERMARK_POS` 的 top/left（base-styles 实际使用常量而非硬编码）。
5. **模板函数零业务文案**：brandBar/breakingBadge/quoteBox/stampBox/bigNumberAnchor 输出中不含大写句子（除品牌恒量）。

新增 `scripts/short-video/__tests__/scene-rules-redundancy.test.mjs`（或并入既有 scene-rules 测试文件，先查）：`checkBodyTextVoRedundancy` 矩阵行全覆盖。

### 批次 W1 — 网站：移动端导航（提取可测 seam）

- `src/components/header-nav.tsx`（新）：纯展示组件 `HeaderNav({ pathname, isAdmin, onArticlesClick })`，桌面（≥640px）横排链接；移动（<640px）汉堡按钮（`aria-label="Open menu"`）+ 下拉菜单（shadcn `Sheet` 或轻量 disclosure，用已有 `ui/sheet.tsx`）。
- `src/components/header-nav.test.tsx`（新）：`renderToStaticMarkup` 断言——桌面含 Articles/Companies 链接、`isAdmin` 时含 Admin、移动含 aria-label 按钮、onArticlesClick 传递。
- `src/components/site-header.tsx`：改为消费 `HeaderNav`，保留 `handleArticlesClick` 滚动逻辑作为 prop。
- 交互验证走 Playwright（375px viewport 点汉堡 → 菜单出现）。

### 批次 W2 — 网站：widget 字号/颜色/focus-visible

- 全部 `text-[10px]`/`text-[11px]` → `text-xs`（widgets 目录 + `companies.tsx` openness badge），逐一 grep 核对后用受控替换，逐文件 git diff 审查。
- `pricing-view.tsx`/`talent-view.tsx`（及 grep 发现的其他文件）Tailwind 原生色 → token 语义色：
  - `text-green-600` → `text-success-foreground`
  - `text-amber-600/700` → `text-warning-foreground`
  - `text-red-500` → `text-danger-foreground`
  - `bg-amber-500/10` → `bg-warning-muted`；`bg-amber-700/5` → `bg-warning-muted/60` 等按实际上下文映射
- `pricing-view.tsx` 模式切换按钮补 `focus-visible` 样式（与 lang-toggle 一致）。

### 批次 W3 — 网站：样式规范落地

- `src/routes/posts.$slug.tsx`：
  - widget 渲染统一包卡片：`rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6`；breakout 保持 `max-w-none`（仍在卡片内）；unknown widget 占位样式不变
  - 正文容器 `text-[17px] leading-relaxed` → `text-lg leading-[1.6]`（body-large token）
- `src/styles.css`：
  - `blockquote`：`border-left: 3px` → `1px` + `background: color-mix(in oklch, var(--color-muted) 40%, transparent)` + 保持缩进（DESIGN.md 禁令修复）
  - `prefers-reduced-motion` 全局规则：`*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`（widget 动画一并受控）
- `src/components/subscribe-form.tsx`：`border-border/60` → `border-border/70`（spec 对齐）
- `src/routes/companies.tsx`：canonical/OG URL → `https://chinaai.news/companies`；openness badge `text-[11px]` → `text-xs`；FAQ h3 `font-serif` → sans（`text-xl font-semibold` 去 serif）

### 批次 V6/W4 — 文档同步

- `docs/brand-system.md`：修实施路径（`generate-scenes.mjs` → `content/{article}/scenes.mjs` + `lib/base-styles.mjs` + `lib/scene-templates.mjs`）；网站语言修正（Source Serif 4 + Hanken Grotesk，oklch hue-260 冷白，非 Instrument Serif/暖白）；新增 Safe Zones 章节、模板原语章节、水印规则（左上 + 品牌栏跳过）、底部元素策略（无 <450px 锚点元素）。
- `docs/video-workflow.md`：grep 过期路径引用并更新。

## Section 1: Modified Files Impact（修改影响评估）

| 文件                                                                                 | 修改内容                                       | 风险   | 评估                                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| scripts/short-video/lib/safe-zones.mjs                                               | **新建**，纯常量                               | Low    | 无消费者风险；drift 测试锁定                                                                                 |
| scripts/short-video/lib/scene-templates.mjs                                          | **新建**，场景原语                             | Low    | 首批消费者仅 restraint（V2 同批验收）                                                                        |
| scripts/short-video/lib/base-styles.mjs                                              | 水印位置/注入逻辑 + keyframes 归集 + re-export | Medium | 影响全部 3 个 pipeline 的渲染输出；用帧对比 + withWatermark 单测缓解。最坏后果：水印错位 —— 视觉瑕疵，可回滚 |
| scripts/short-video/lib/tiktok-rules.mjs                                             | THRESHOLDS 追加 1 key                          | Low    | 纯追加；确认 tiktok-rules-sync.test.mjs 无 key 穷举断言（implement 时核对）                                  |
| scripts/short-video/lib/scene-rules.mjs                                              | 追加 checkBodyTextVoRedundancy                 | Medium | 进入所有 preflight 报告；仅 warn 不阻塞；先跑 3 个 pipeline preflight 确认零 fail 新增                       |
| content/restraint/pt1/scene-data.mjs                                                 | 新增 texts 字段                                | Medium | verify-video --pre 必须全绿；字段缺失时 t() 回退空串不崩                                                     |
| content/restraint/pt1/scenes.mjs                                                     | 迁移模板 + 删脚注 + 修复断词                   | Medium | 视觉回归风险最高；帧对比验收（S1/S3/S4/S6/S9/S11）                                                           |
| content/deepseek/scenes.mjs + scene-data.mjs                                         | 删 S1/S12 底注                                 | Low    | 视觉删减；帧抽验 S1/S12                                                                                      |
| content/distillation/pt1/scenes.mjs + scene-data.mjs                                 | 文案数据化 + 删底注                            | Medium | 布局元素增减；post-render 校验 + 帧抽验                                                                      |
| scripts/short-video/**tests**/scene-drift.test.mjs                                   | **新建**                                       | Low    | 纯测试                                                                                                       |
| scripts/short-video/**tests**/scene-rules-redundancy.test.mjs                        | **新建**（或并入既有文件）                     | Low    | 纯测试                                                                                                       |
| docs/brand-system.md                                                                 | 实施路径/网站语言/Safe Zones/模板章节          | Low    | 文档，无代码影响；brand-system skill 消费它                                                                  |
| docs/video-workflow.md                                                               | 过期引用修正                                   | Low    | 文档                                                                                                         |
| src/components/header-nav.tsx + .test.tsx                                            | **新建**                                       | Low    | 新组件，SiteHeader 消费                                                                                      |
| src/components/site-header.tsx                                                       | nav 抽离为 HeaderNav                           | Medium | 全站 header 视觉不变（桌面路径不变）；Playwright 桌面+移动验收；最坏：导航布局回归，快速回滚                 |
| src/components/widgets/**（字号/颜色）                                               | text-[10px]/[11px]→text-xs，原生色→token       | Medium | 视觉批量微调；lint+build+tsc + 文章页截屏抽验；token 语义在 light/dark 均有定义                              |
| src/routes/posts.$slug.tsx                                                           | widget 卡片包装 + 正文 token                   | Medium | 文章页布局变化；breakout 宽度不受影响；dev server 截屏对比                                                   |
| src/styles.css                                                                       | blockquote + global reduced-motion             | Medium | 全局 CSS；prose-article 引用块视觉变化（符合 design 意图）；reduced-motion 规则业内标准写法                  |
| src/components/subscribe-form.tsx                                                    | border 透明度                                  | Low    | 像素级差异                                                                                                   |
| src/routes/companies.tsx                                                             | URL/字号/FAQ h3                                | Low    | canonical/OG 变更对外可见（指向正式域名，正确方向）；无 SEO 风险                                             |
| docs/specs/spec-design-optimization.md / docs/tickets/tickets-design-optimization.md | **新建**                                       | Low    | 文档                                                                                                         |

## Section 2: Behavioral Scenarios（场景矩阵 → 测试用例）

| #   | 场景                                   | 预期行为                                                              | 风险   | 缓解                                             |
| --- | -------------------------------------- | --------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| V1  | scene-data 某 texts 字段缺失/undefined | t() 回退空串，场景正常渲染                                            | Low    | 既有 t() 模式；V2 全字段过 preflight             |
| V2  | withWatermark 输入含 brand-bar         | 不注入水印                                                            | Low    | 单测                                             |
| V3  | withWatermark 输入无 brand-bar         | 注入左上角（WATERMARK_POS）水印                                       | Low    | 单测 + 帧验证                                    |
| V4  | 正文文本含 ≥3 词归一化 VO 碎片         | warn（非阻塞）                                                        | Low    | 单测（多行：短碎片/pass/空 texts/hook/CTA 跳过） |
| V5  | 3 个 pipeline 跑 verify --pre          | 全部 pass，新 warn 可见但不阻塞                                       | Medium | 实施后立即执行                                   |
| V6  | scenes.mjs 出现裸大写文案              | drift 测试 fail                                                       | Low    | 单测白名单                                       |
| V7  | scenes.mjs 出现 bottom:1xxpx 锚点      | drift 测试 fail                                                       | Low    | 单测                                             |
| V8  | SAFE_ZONES/WATERMARK_POS 常量          | 顺序/正值 sanity                                                      | Low    | 单测                                             |
| V9  | restraint S3 长词卡片                  | 整词换行，无 mid-word 断词                                            | Medium | 帧抽验 14s 附近                                  |
| V10 | restraint S4                           | "PRICE CUT" 只出现一次                                                | Medium | 帧抽验                                           |
| V11 | 全部视频渲染管线                       | 组装/字幕/验证步骤不受模板层影响                                      | Medium | 全量视频测试套件 + render-only 帧抽验            |
| V12 | distillation 文案数据化后              | S1-S6 同帧信息不变（除移除项）                                        | Medium | 帧抽验 + preflight                               |
| W1  | 桌面 viewport                          | HeaderNav 横排链接，无汉堡                                            | Low    | 静态渲染单测 + Playwright                        |
| W2  | 移动 viewport                          | 汉堡可见，点击展开菜单，链接可达                                      | Medium | Playwright                                       |
| W3  | isAdmin=false                          | 无 Admin 链接                                                         | Low    | 单测                                             |
| W4  | isAdmin=true                           | Admin 链接可见                                                        | Low    | 单测                                             |
| W5  | 首页点 Articles                        | 触发 onArticlesClick（滚动）                                          | Low    | 单测（prop 透传）                                |
| W6  | widget 渲染                            | 非 breakout 限 max-w-prose；全部有统一卡片壳；unknown widget 占位不变 | Medium | 静态类断言（widgetWrapperClass 单测）+ dev 截屏  |
| W7  | widgets 目录扫描                       | 无 text-[10px]/[11px]、无 Tailwind 原生色类                           | Low    | drift 单测                                       |
| W8  | prefers-reduced-motion                 | 全局动画/过渡禁用                                                     | Low    | CSS 存在性 + 人工检查                            |
| W9  | 文章正文渲染                           | body-large token（1.125rem/1.6），prose 段 line-height 1.75 不变      | Low    | dev 截屏                                         |
| W10 | companies 页                           | canonical/OG = chinaai.news/companies；badge 12px；FAQ h3 sans        | Low    | 静态断言/人工检查                                |

## 验证计划

1. 每批次：`npx vitest run <相关路径>`（视频与 web 分开跑）
2. 批次间：`node scripts/short-video/verify-video.mjs --pre --content <each>` 三 pipeline
3. 全量：`npm run lint && npx tsc --noEmit && npm run build`
4. 视频视觉：`render-only.mjs`（如支持无 TTS）或直接抽已有音频场景，帧抽验 S1/S3/S4/S6/S9/S11/S12
5. 网站视觉：dev server + Playwright（桌面 1280 / 移动 375 + 暗色），截屏对比关键页面
6. 收尾：code-review 双轴 → commit & push（原子批次）→ 文档同步 → 结束自查

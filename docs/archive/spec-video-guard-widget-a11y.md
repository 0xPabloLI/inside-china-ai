# Spec: Video Guard 固化 + Widget A11y + 容器统一

> 工作流: Grill → Spec → Tickets → TDD → Review → Verify → Commit
> 决策来源: 用户 2026-08-07 确认 — (1) FAIL + `--long-form` 豁免旗; (2) 外层统一 bg-card; (3) 内层统一 bg-muted/30 + rounded-lg。

## 背景

- **T1 事故根因**: deepseek(12 场景/359 词) 超限只报 WARN，preflight 不阻断 → 150s 视频被渲染。固化: 场景数/词数违反时默认 FAIL（阻断渲染），显式 `--long-form` 降回 WARN。
- **T2**: DESIGN.md 要求 widget 交互元素带 `aria-label` / `focus-visible` / 状态属性; 审计发现 5 个 widget 交互控件缺失。
- **T3**: DESIGN.md "Widget Containers 需标准化" — 4 个 widget 外层未按 W3 配方(bg-card)，内层 opacity 变体混杂(/30 /40 /50 bg-background/40 rounded-xl)，遗留 native 色 `border-purple-500/30`。
- **T4**: compare 路由 lint 债 — 经核实 `npx eslint` 已 0 问题（5a39b27 已清），本 spec 只做回归核实，不改代码。

## 变更设计

### T1: scene-rules 严格化 + --long-form

- `checkSceneCount(scenes, opts)` / `checkVoiceoverWordCount(scenes, opts)`: `opts.longForm` 为 false/缺省时超限 → `level: "fail"`；`opts.longForm === true` 时超限 → `level: "warn"`（原行为）。fix 文案建议拆分 `content/<dir>/pt1..ptN`。
- `runAllSceneDataChecks(scenes, seriesMeta, opts)` 透传。
- `verify-video.mjs` 新增 `--long-form` 参数（`const longForm = args.includes("--long-form")`），传入 `runAllSceneDataChecks(scenes, seriesMeta, { longForm })`；更新文件头 Usage 注释。
- `main.mjs` 门禁不变（exit code 0/1 契约自动生效）。
- THRESHOLDS 值不变（tiktok-rules.mjs 不动，sync 测试不受影响）。

### T2: widget a11y（5 个文件）

| 组件                                      | 现状                           | 修改                                                                             |
| ----------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| deepseek/funding-view.tsx                 | bar button 有 focus-visible    | 加 `aria-pressed={selectedRound === i}`                                          |
| deepseek/companies-view.tsx               | 手风琴按钮无焦点样式/状态      | 加 `aria-expanded={isExpanded}` + focus-visible 类                               |
| distillation/news-coverage-view.tsx       | 圆点按钮仅 title（非可访问名） | 加 `aria-label={ev.headline}` + `aria-pressed={selected === ev}` + focus-visible |
| distillation/moonshot-funding-view.tsx    | bar button 无焦点样式/状态     | 加 `aria-pressed={isSelected}` + focus-visible                                   |
| deepseek-api-pricing/api-pricing-view.tsx | 公司切换按钮无状态/焦点        | 加 `aria-pressed={...}` + focus-visible                                          |

统一 focus-visible 配方（与 LangToggle/W2 一致）: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`。

### T3: 容器统一

- **外层**: 实测 posts.$slug 路由层已为每个 widget 提供统一卡片
  (`my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6`)。
  用户第二轮确认(2026-08-07)：**整个删除** 4 个 widget(api-pricing / agi-roadmap /
  oss-comparison / vision-keywords) 自带的冗余内层容器 `my-6 rounded-lg border
border-border/60 bg-muted/30 p-6`，改用 Fragment 包裹多根节点，视觉与其它
  widget 完全一致（单层 bg-card 卡片）。垂直间距由路由 wrapper 的 my-10 提供
  （Playwright T3-1 同时断言 wrapper 存在性）。
- **内层面板配方**: `rounded-lg border border-border/60 bg-muted/30`
  - funding-view:125 `bg-muted/50` → `bg-muted/30`
  - companies-view 卡片: `border-border/40 bg-background/40` → `border-border/60 bg-muted/30`
  - talent-view:33 `rounded-xl border-border/60 bg-background/60` → `rounded-lg border-border/60 bg-muted/30`; :101 `rounded-xl` → `rounded-lg`
  - identity-bleed-view:131 `bg-muted/40` → `bg-muted/30`
  - news-coverage-view 详情面板 `border-purple-500/30` → `border-border/60`（政治类改中性边框，消除 native 色）
- **排除项**: 分段控件（pricing 模式切换 / shared LangToggle）保持 `bg-muted/40`（共享模式）；行 hover 态 `bg-muted/20` 保留（hover 反馈非容器）。

### T4: compare lint

- 只跑 `npx eslint src/routes/compare.deepseek-vs-qwen-vs-glm-4.tsx` 回归，预期 0。若有问题则修复（不在本 spec 预设）。

## Section 1: Modified Files Impact

| 文件                                                                                        | 修改内容                                | 风险   | 评估                                                                                                                             |
| ------------------------------------------------------------------------------------------- | --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| scripts/short-video/lib/scene-rules.mjs                                                     | 两个 check 的 level 提级 + opts 参数    | Medium | 改变现有函数返回值，下游 verify-video.mjs 行为变化是预期意图；全部调用点已核查（runAllSceneDataChecks 唯一消费者），测试同步更新 |
| scripts/short-video/verify-video.mjs                                                        | 解析 --long-form 并透传 + 注释          | Low    | 纯新增参数，缺省行为 = 原路径 + 提级（预期）                                                                                     |
| scripts/short-video/**tests**/scene-rules.test.mjs                                          | 3 处断言 warn→fail + 新增 longForm 用例 | Low    | 断言随规格更新                                                                                                                   |
| src/components/widgets/deepseek/funding-view.tsx 等 11 个 view                              | aria 属性 / focus-visible / 容器类      | Low    | 纯 presentational 变更，无数据流影响；Playwright 回归点击行为                                                                    |
| scripts/verify-widget-a11y.mjs                                                              | 新建验证脚本                            | Low    | 新增文件，无下游                                                                                                                 |
| scripts/short-video/**tests**/verify-guard-cli.test.mjs + content/_test-fixtures/overlimit/ | 新建 CLI 契约测试 + fixture             | Low    | fixture 位于 content/ 下，无枚举消费方（已核查）；--pre 模式不产出文件                                                           |
| src/components/widgets/a11y-container-contract.test.ts                                      | 新建静态契约测试                        | Low    | 新增文件，无下游                                                                                                                 |
| src/routes/compare.deepseek-vs-qwen-vs-glm-4.tsx                                            | 无（仅核实）                            | —      | —                                                                                                                                |

不触碰: 4 个 parallel-session 修改的数据文件（_/data/_.ts）、docs/video-workflow.md（parallel M）、articles/bytedance-*.md（untracked，parallel）。

## Section 2: Behavioral Scenarios

### T1 场景矩阵（每行 = 1 测试用例）

| #     | Scenario                                   | Expected                  | Risk   | Mitigation                                                    |
| ----- | ------------------------------------------ | ------------------------- | ------ | ------------------------------------------------------------- |
| T1-1  | 场景数 6-10                                | pass                      | Low    | 回归                                                          |
| T1-2  | 场景数 5（<6）                             | fail + fix 建议           | Medium | 语义变化，测试提级                                            |
| T1-3  | 场景数 11（>10）                           | fail + fix 建议拆分       | Medium | 同上；restraint/pt1(11) 将被阻断 → 需合并场景或用 --long-form |
| T1-4  | 词数 180                                   | pass（边界）              | Low    | 边界用例                                                      |
| T1-5  | 词数 181                                   | fail + fix 建议拆分       | Medium | 同上                                                          |
| T1-6  | --long-form + 11 场景                      | warn（降级）              | Low    | 豁免旗显式声明                                                |
| T1-7  | --long-form + 181 词                       | warn（降级）              | Low    | 同上                                                          |
| T1-8  | --long-form + 合规内容                     | pass                      | Low    | 不误伤合规                                                    |
| T1-9  | runAllSceneDataChecks 聚合                 | fail 桶含上述项           | Medium | 下游 exit 1                                                   |
| T1-10 | verify --pre 含 fail → exit 1              | 阻断渲染（main.mjs 契约） | Medium | --skip-preflight 仍是显式人工出口                             |
| T1-11 | verify --pre --long-form + 超限 → exit 0   | 允许渲染（WARN 保留）     | Medium | 显式声明即放行                                                |
| T1-12 | 合规内容无 flag（distillation/pt1 8 场景） | 0 fail 不变               | Low    | 回归                                                          |

### T2 场景矩阵

| #    | Scenario             | Expected                                      | Risk | Mitigation            |
| ---- | -------------------- | --------------------------------------------- | ---- | --------------------- |
| T2-1 | funding bar 选中态   | aria-pressed=true 且仅 1 个                   | Low  | 点击后断言            |
| T2-2 | companies 手风琴展开 | aria-expanded=true + 面板可见                 | Low  | 键鼠均可触发          |
| T2-3 | news-coverage 圆点   | aria-label=headline；点击后 aria-pressed=true | Low  | title 保留作 tooltip  |
| T2-4 | moonshot bar         | aria-pressed 跟随选中                         | Low  | —                     |
| T2-5 | api-pricing 公司按钮 | aria-pressed 跟随选中（默认 DeepSeek）        | Low  | —                     |
| T2-6 | Tab 键盘可达         | 每个控件可聚焦且有可见焦点环                  | Low  | Playwright focus 断言 |
| T2-7 | 点击行为回归         | 原交互不变                                    | Low  | Playwright 点击断言   |

### T3 场景矩阵

| #    | Scenario                    | Expected                                      | Risk                    | Mitigation                         |
| ---- | --------------------------- | --------------------------------------------- | ----------------------- | ---------------------------------- |
| T3-1 | 4 个外层容器                | computed bg = card token，含响应式 padding 类 | Low                     | 样式断言                           |
| T3-2 | funding 高瓴提示条          | bg = muted/30                                 | Low                     | computed style                     |
| T3-3 | companies 卡片              | bg = muted/30, border = border/60             | Low                     | computed style                     |
| T3-4 | talent 两处                 | radius 8px (rounded-lg) + muted/30            | Low                     | —                                  |
| T3-5 | news-coverage 政治面板      | 无 purple 残留                                | Low                     | grep + computed                    |
| T3-6 | identity-bleed 提示条       | muted/30                                      | Low                     | —                                  |
| T3-7 | 全局 grep                   | 无 bg-muted/40                                | /50 或 bg-background/40 | /60 残留于内层面板（分段控件除外） | Low | 静态检查 |
| T3-8 | LangToggle/pricing 分段控件 | 保持 bg-muted/40                              | Low                     | 排除项回归                         |

### T4 场景矩阵

| #    | Scenario            | Expected                                         | Risk | Mitigation |
| ---- | ------------------- | ------------------------------------------------ | ---- | ---------- |
| T4-1 | eslint compare 路由 | 0 problems                                       | Low  | 回归核实   |
| T4-2 | 全量 lint           | 0 problems（如 parallel 文件引入问题则记录不修） | Low  | 边界说明   |

## 测试接缝（Seams）

- T1 单元: `scripts/short-video/__tests__/scene-rules.test.mjs`（vitest，已有）— 改 3 断言 + 新增 7 用例（含 runAllSceneDataChecks 聚合）
- T1 CLI（T1-10/11/12 exit-code 行）: `scripts/short-video/__tests__/verify-guard-cli.test.mjs` — spawn verify-video.mjs，fixture `content/_test-fixtures/overlimit`（11 场景但其余规则全部合规，隔离场景数降级行为）
- T2/T3 运行时: `scripts/verify-widget-a11y.mjs`（Playwright）— 页面存在性探测，缺失即 SKIP。实测 DB 只有 deepseek 文章已发布（funding/companies/pricing/agi 在线）；distillation/restraint 两篇未发布 → news-coverage/moonshot/api-pricing/oss/vision 由静态契约覆盖
- T2/T3 静态契约（未发布 widget 的防回归守卫）: `src/components/widgets/a11y-container-contract.test.ts`（10 用例）
- T4: eslint CLI。

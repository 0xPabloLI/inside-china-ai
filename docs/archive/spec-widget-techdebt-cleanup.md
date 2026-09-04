# Spec: Widget 技术债清理 — English-only + hover 键盘等价物

> 日期：2026-08-08。依据：content-pipeline.md「Widget 统一使用英文，EN/中文 toggle 后续移除」+ GitHub issue #20 记录的 follow-up（6 个 hover-only widget 键盘等价物）。
> 决策（用户确认）：**彻底 English-only**（删 toggle + 所有 lang prop/zh 分支 + i18n zh 文案 + 数据 zh 字段 + registry 类型/调用点）；键盘等价采用 **hover/focus 显示 + click 固定** 三通道模型。

## 范围

**A. English-only（技术债 1）**

- 删除 `src/components/widgets/shared/lang-toggle.tsx`
- 5 个带 toggle 的 view：`deepseek/{pricing,cloud,talent,companies,funding}-view.tsx` 移除 lang state、LangToggle、isZh 分支
- 4 个带 `lang?: "en"|"zh"` prop 的 view：`deepseek-api-pricing/api-pricing-view.tsx`、`deepseek-oss-comparison/oss-comparison-view.tsx`、`deepseek-agi-roadmap/agi-roadmap-view.tsx`、`deepseek-vision/vision-keywords-view.tsx` 移除 prop + zh 分支
- `deepseek/i18n.ts` 拍平为 en-only；zh 数据字段从 6 个含 zh 的数据文件移除（`nameZh/nameEn → name` 等重命名）；oss/api-pricing/agi 数据无 zh 字段（条件行满足，未改动）
- `registry.ts` 类型 `ComponentType<{ lang: "en"|"zh" }>` → `ComponentType`；`posts.$slug.tsx`、`widgets.$name.tsx` 调用点 `<Widget lang="en">` → `<Widget />`
- 两个路由的 widget wrapper 增加 `data-widget={segment.name}`（review follow-up：verify 脚本探针的测试支撑设施，配对 `widgetScoped` 选择器，防止文章正文文案与探针 marker 冲突）

**B. hover 键盘等价物（技术债 2）**

- 6 个 hover-only widget：`distillation/{benchmark-controversy,identity-bleed,minimax-stock}-view.tsx`、`deepseek-vision/vision-keywords-view.tsx`、`deepseek-agi-roadmap/agi-roadmap-view.tsx`、`deepseek-oss-comparison/oss-comparison-view.tsx`
- 模型：`tabIndex={0}` + `onFocus/onBlur`（显示/隐藏详情）+ `onClick` 固定切换（触屏）+ `aria-expanded` + `focus-visible` 类；benchmark/identity/agi 行 → 真 `<button>`；minimax SVG circle、vision span、oss tr 保持元素 + tabIndex
- `deepseek/cloud-view.tsx` 词云补齐 onFocus/onBlur + click（已有 role=button+tabIndex 但功能不生效）
- `scripts/verify-widget-a11y.mjs`：`probeKeyboard` 泛化支持非 button focusable；7 个新 per-widget probe（6 hover + cloud）断言 focus 显示/blur 隐藏/click 固定；preview SKIP → 0；探针全部限定 `[data-widget]` 作用域并加 settle 等待（React 状态提交时序）
- **共享实现（review follow-up）**：`src/components/widgets/shared/use-hover-pin.ts` 抽取 `useHoverPin<T>()`（active/pinned/current/anyActive/isActive + onEnter/onLeave/onFocus/onBlur/onToggle），7 个视图复用同一三通道状态模型，消除重复
- `a11y-container-contract.test.ts`：新增静态契约（无 LangToggle/lang prop/zh 分支；6 文件含键盘模式）

## Section 1: Modified Files Impact

| 文件                                                                                                                 | 修改内容                                                                     | 风险   | 评估                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| shared/lang-toggle.tsx                                                                                               | 删除                                                                         | Low    | 唯一消费者为 5 个 deepseek view（同批修改）；git 历史可恢复                                                              |
| deepseek/i18n.ts                                                                                                     | 移除 Lang 类型 + zh record，拍平为 en-only 对象                              | Medium | 4 个 view 消费（同批改）；无其他消费者（已 grep 验证）                                                                   |
| deepseek/{pricing,cloud,talent,companies,funding}-view.tsx                                                           | 移除 toggle/lang 状态/isZh 分支，en-only                                     | Medium | 生产渲染路径 `<Widget lang="en">` 恒定 en，行为等价；a11y 静态断言（aria-pressed/expanded + focus 类）保持不变，测试守护 |
| deepseek-api-pricing/api-pricing-view.tsx                                                                            | 移除 lang prop + zh 三元                                                     | Low    | 无 toggle，en 为默认值，行为不变                                                                                         |
| deepseek-oss-comparison/oss-comparison-view.tsx                                                                      | 同上 + 键盘等价                                                              | Low    | 同上                                                                                                                     |
| deepseek-agi-roadmap/agi-roadmap-view.tsx                                                                            | 同上 + 键盘等价                                                              | Low    | 同上                                                                                                                     |
| deepseek-vision/vision-keywords-view.tsx                                                                             | 同上 + 键盘等价                                                              | Low    | 同上                                                                                                                     |
| deepseek/data/{pricing,people,keywords,funding,companies}.ts                                                         | zh 字段删除 + en 字段去后缀重命名                                            | Medium | 消费者仅各自 view（同批改）；其余 zh 文案属数据残留，无外部引用                                                          |
| deepseek-vision/data/keywords.ts                                                                                     | 删除 zh 字段                                                                 | Low    | 消费者仅 vision-keywords-view（同批改）                                                                                  |
| deepseek-oss-comparison/data/companies.ts、deepseek-api-pricing/data/pricing.ts、deepseek-agi-roadmap/data/phases.ts | 如有 zh 字段一并清理                                                         | Low    | 同上，实施时逐一核对                                                                                                     |
| registry.ts                                                                                                          | `WidgetComponent = ComponentType`（去 lang）                                 | Medium | 2 个调用点同批改；`ComponentType<{}>` 拒绝未知 props，TS 编译守护                                                        |
| src/routes/posts.$slug.tsx                                                                                           | `<Widget lang="en">` → `<Widget />`；wrapper 加 `data-widget={segment.name}` | Medium | 文章渲染核心路径；TS 编译 + 文章模式 Playwright 回归守护                                                                 |
| src/routes/widgets.$name.tsx                                                                                         | 同上                                                                         | Low    | dev-only；preview 模式回归守护                                                                                           |
| shared/use-hover-pin.ts                                                                                              | 新增 `useHoverPin<T>()` 共享 hook（review follow-up 抽取）                   | Low    | 7 个视图同批改；静态测试断言各视图交互字符串仍在（onFocus/onBlur/tabIndex/focus-visible），hook 文件独立                 |
| distillation/{benchmark-controversy,identity-bleed}-view.tsx、distillation/minimax-stock-view.tsx                    | 行/circle 加 tabIndex+onFocus/onBlur+click+aria-expanded；前两者行转 button  | Medium | 新交互不改默认渲染（未激活时 DOM 相同）；静态测试 + preview 断言守护                                                     |
| scripts/verify-widget-a11y.mjs                                                                                       | probeKeyboard 泛化 + 6 个新 probe                                            | Medium | 脚本自身无下游；新旧断言在 CI 前全量运行                                                                                 |
| a11y-container-contract.test.ts                                                                                      | 新增 English-only + 键盘静态断言；3 文件加入 button 配方列表                 | Medium | 测试文件，红→绿驱动实现                                                                                                  |

## Section 2: Behavioral Scenarios

| #   | Scenario                            | Expected Behavior                                                                                        | Risk | Mitigation                                                                     |
| --- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| 1   | 5 个带 toggle view 首次渲染（SSR）  | 无 toggle DOM；英文文案直接渲染（原 en 默认路径）                                                        | L    | vitest 静态断言 + preview 全量                                                 |
| 2   | 用户点 toggle 位置                  | DOM 无此按钮；无 zh 渲染路径                                                                             | L    | probeFunding/Companies 的 aria 断言不含 toggle 文本（BAR_TEXT 不匹配 中文/EN） |
| 3   | registry 类型收紧后调用点编译       | `<Widget />` 编译通过；错误传参报 TS 错误                                                                | M    | tsc --noEmit 全量                                                              |
| 4   | 已发布文章页（3 个 PAGES）渲染      | 文章模式 15 PASS 不变：funding bars/companies accordion 等 probe 全过                                    | M    | verify-widget-a11y.mjs 文章模式回归                                            |
| 5   | hover 详情（原功能）                | mouseenter 显示、mouseleave 隐藏                                                                         | L    | 保留 onMouseEnter/Leave，preview probe 覆盖                                    |
| 6   | keyboard Tab 到详情目标             | focus 显示详情、blur 隐藏                                                                                | L    | 6 个新 per-widget probe 断言显示/隐藏                                          |
| 7   | click 固定详情                      | click 固定（blur 不隐藏）；再 click 取消                                                                 | L    | probe 断言 pinned 行为                                                         |
| 8   | 无交互元素页面探针                  | preview 模式 6 SKIP 归零（全部有可焦点交互元素）                                                         | L    | probeKeyboard 泛化 + 列表断言                                                  |
| 9   | minimax SVG circle 聚焦             | circle tabIndex=0 + aria-label；焦点环可见（Chromium SVG outline）                                       | M    | preview probe 断言 aria-expanded 状态 + 详情卡显示                             |
| 10  | oss tr 聚焦                         | tr tabIndex=0 + focus 类；行高亮与 hover 一致                                                            | M    | probe 断言 className 含 bg-background/80                                       |
| 11  | 未知 id 预览                        | 仍 404 UI                                                                                                | L    | 既有 probe 保持                                                                |
| 12  | zh 文案残留扫描                     | 组件目录无 `LangToggle`/`"zh"` 分支/lang prop                                                            | L    | 静态测试逐文件断言                                                             |
| 13  | 数据 zh 字段残留                    | 数据文件无 `\w+Zh` 字段                                                                                  | L    | 静态测试（if 清理范围含数据文件）                                              |
| 14  | cloud-view 词云                     | 补齐 onFocus/onBlur + click 后 SKIP 消失、功能生效                                                       | L    | preview 断言                                                                   |
| 15  | 内部面板配方（T3）                  | 改动不引入 bg-muted/40 等违规 token                                                                      | L    | 既有 T3 静态测试覆盖 12 文件                                                   |
| 16  | 文章页探针 marker 与正文撞词        | 探针文本/元素全部限定在 `[data-widget]` 容器内，正文 prose 不干扰断言                                    | M    | 文章模式回归（Benchmark/Identity/Vision 曾因撞词/撞 header 按钮失败，已修复）  |
| 17  | 固定 + 悬停另一行（identity-bleed） | 两行高亮、底部详情跟随悬停（`current = active ?? pinned`），移走后回到固定行详情；与 vision/cloud 同模型 | L    | 设计决策（详情跟随最近交互），preview probe 覆盖主路径                         |

矩阵全部行 → 测试用例（静态 vitest + 运行时 verify 脚本）。

## Code Review Follow-ups（双轴 review 后落实）

- **Standards #1（已修）**：DESIGN.md「Widget LangToggle」章节引用了已删除文件 → 替换为 English-only + keyboard 等价物说明。
- **Standards #2（已修）**：7 个视图重复 hover/pin 三态 → 抽取 `useHoverPin<T>()`。
- **Standards #3（已修）**：minimax 状态命名 `hovered` 已随抽取统一为 hook 语义。
- **Standards #4（不修，记录）**：`aria-expanded` 用于非 disclosure 控件（span/circle）与 `outline-brand` 焦点色——spec 显式选定 + 仓库既有 convention，属 AT 语义风险记录非违规。
- **Spec #1（已补记）**：`data-widget` 为探针测试支撑设施，非 spec 原始范围 —— 已回补本 spec + 路由影响行。
- **Spec #2（不修，记录）**：identity-bleed 固定+悬停双高亮时详情跟随最近交互（`active ?? pinned`），与 vision-keywords/cloud 同模型，见场景 17。

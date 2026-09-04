# Spec: Widget 隔离预览路由（dev-only）+ 验证脚本 --preview 模式

> 工作流: Grill(AskUser 确认) → Spec → Tickets → TDD → Review → Verify → Commit
> 决策: 用户 2026-08-07 — (1) 立即实现; (2) 仅开发环境可用（生产 404）。

## 背景与动机

运行时验证缺口：`posts.$slug.tsx` 从 Supabase 读文章，未发布文章 404 → 其中嵌入的
widget 永远无法在运行时被 Playwright 验证（a11y / 容器契约 / 点击行为）。当前只有
deepseek 一篇文章已发布，news-coverage / moonshot / api-pricing / oss / agi / vision /
cloud / talent / benchmark / identity / minimax 等 11 个 widget 只能靠静态文本断言兜底。

**目标**：任何已注册 widget 都能在 dev server 独立渲染并被运行时验证，不依赖文章发布。
以后新增 widget 注册即自动获得运行时验证。

## 变更设计

### R1: `/widgets` 列表路由（`src/routes/widgets.tsx`，新建）

- `import.meta.env.DEV` 为 false 时 `throw notFound()`（生产构建静态替换为 false → 404，无泄漏）
- 列出 `getWidgetNames()` 全部 widget，`<Link to="/widgets/$name">`
- 复用文章页 main 容器（`mx-auto max-w-4xl px-6 pt-12 pb-24`）

### R2: `/widgets/<name>` 预览路由（`src/routes/widgets.$name.tsx`，新建）

- 非 DEV → notFound；`!isRegisteredWidget(name)` → notFound
- 渲染：返回链接 + DEV 徽标 + widget 名 h1（font-serif）
- **复用 posts.$slug 的卡片 wrapper 原样**：
  `my-10 rounded-lg border border-border/60 bg-card px-4 py-5 sm:px-6 sm:py-6` +
  `isBreakoutWidget(name) ? "max-w-none" : "max-w-prose"` + Suspense fallback
- `<Widget lang="en" />`（与文章页一致）

### R3: `verify-widget-a11y.mjs` 增加 `--preview` 模式

- `--preview` 时：GET `/widgets` 抓取全部 widget id（`a[href^="/widgets/"]`）
- 逐个访问 `/widgets/<id>`，运行：
  - **专属 probe 映射**（按 id）：deepseek-funding→probeFunding、deepseek-companies→probeCompanies、
    distillation-news-coverage→probeNewsCoverage、moonshot-funding-timeline→probeMoonshot、
    deepseek-api-pricing→probeApiPricing；其余 widget 无专属 probe
  - **通用容器 probe**（probeContainers：wrapper=bg-card+my-10、无冗余 my-6、内层配方、
    purple 残留）对**每个** widget 运行
  - **键盘 probe**（probeKeyboard）对每个 widget 运行
- 预览模式下无 SKIP（所有 registry widget 都被访问）；断言访问数 === 列表数
- 文章模式行为完全不变（回归）

## Section 1: Modified Files Impact

| 文件                                                                     | 修改内容            | 风险   | 评估                                                       |
| ------------------------------------------------------------------------ | ------------------- | ------ | ---------------------------------------------------------- |
| scripts/verify-widget-a11y.mjs                                           | 增加 --preview 分支 | Medium | 修改已有验证脚本；文章模式路径不变（回归验证），仅新增分支 |
| src/routes/widgets.tsx                                                   | 新建                | Low    | 新路由，无下游；route 名 /widgets 无冲突（已核查）         |
| src/routes/widgets.$name.tsx                                             | 新建                | Low    | 同上；只 import registry 现有导出                          |
| docs/spec-widget-preview-route.md / docs/tickets-widget-preview-route.md | 新建                | Low    | 文档                                                       |

不触碰: 文章路由、registry、任何 widget 组件、parallel session 文件。

## Section 2: Behavioral Scenarios

| #   | Scenario                            | Expected                                                                    | Risk   | Mitigation                       |
| --- | ----------------------------------- | --------------------------------------------------------------------------- | ------ | -------------------------------- |
| R1  | GET /widgets (dev)                  | 200 + 14 个 widget 链接                                                     | Low    | Playwright 断言                  |
| R2  | GET /widgets/deepseek-funding (dev) | 200 + bg-card wrapper + max-w-none（breakout）                              | Low    | Playwright                       |
| R3  | GET /widgets/deepseek-talent (dev)  | 200 + max-w-prose（非 breakout）+ 容器检查过                                | Low    | Playwright                       |
| R4  | GET /widgets/not-a-widget (dev)     | 404 (notFound)                                                              | Low    | Playwright 断言 status           |
| R5  | 生产构建访问 /widgets*              | 404（import.meta.env.DEV=false 静态替换）                                   | Medium | 构建产物 SSR；逻辑一行，评审确认 |
| R6  | 14 个 widget 逐个预览               | 容器 probe 全过（bg-card+my-10+px-4 sm:px-6、无 my-6、内层配方、无 purple） | Low    | --preview 模式全量跑             |
| R7  | 5 个交互 widget 预览                | a11y probe 全过（aria + 点击切换 + focus）                                  | Low    | 专属 probe 映射                  |
| R8  | 键盘可达                            | 每个预览页 Tab 到带 focus-visible 的控件                                    | Low    | probeKeyboard                    |
| R9  | 预览访问数                          | visited === 列表数（0 漏）                                                  | Low    | 脚本结束断言                     |
| R10 | 文章模式回归                        | 15P/0F 不变                                                                 | Medium | 全量重跑两种模式                 |
| R11 | lint/tsc/build                      | 0 error                                                                     | Low    | 工作流 Step 6                    |

## 测试接缝

- 运行时: `scripts/verify-widget-a11y.mjs --preview`（dev server :8083）— TDD red→green
- 回归: 同脚本无 --preview（文章模式）
- 单元: 无新纯逻辑（路由为声明式；notFound 分支由 R5 评审 + R4 运行时覆盖）

## 实施中发现并修复的问题（预览路由暴露的潜伏 bug）

1. **TanStack 扁平路由陷阱**: 最初 `widgets.tsx` + `widgets.$name.tsx` 会让 `widgets.tsx`
   成为 **layout 路由**（无 `<Outlet/>` → 子路由内容不渲染）。修复: `widgets.index.tsx` +
   `widgets.$name.tsx`（改完后 dev server 需重启以重新生成 routeTree.gen.ts，否则残留
   `WidgetsRoute` 悬挂引用导致 404）。
2. **双重 lazy bug（registry）**: `deepseek-vision/agi-roadmap/oss-comparison/api-pricing`
   的 index.ts barrel 已 `lazy()` 包装组件，registry 再 `lazy(() => import("./<pkg>"))`
   → `lazy(lazy())` → 客户端 hydration 报 "Element type is invalid... wrap in
   React.lazy() more than once" → 预览页 ErrorComponent。包含这 4 个 widget 的文章
   均未发布，故此前从未暴露。修复: registry 直接 import view 文件并删除 4 个 barrel。
3. **moonshot 点击断言语义**: 点击「已选中」bar = 取消选择 = 0 selected（合法行为），
   断言改为确定性点击「非选中」bar。
4. **dev 下 notFound 状态码**: dev server 对 notFound 返回 200 + 客户端水合 404 UI；
   生产构建 `import.meta.env.DEV` 静态替换 false → 死代码消除为 `throw notFound()`，
   保证 404（构建产物已确认）。
5. **SKIP 语义**: benchmark/identity-bleed/minimax/vision/agi/oss 无任何可交互元素
   （纯 hover 展示）→ 键盘 probe 合法 SKIP。后续可选项: 为 hover-only 交互加
   tabIndex + onFocus/onBlur 键盘等价物（记录为 follow-up，不在本批）。

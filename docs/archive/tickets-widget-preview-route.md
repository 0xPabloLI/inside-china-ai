# Tickets: Widget 隔离预览路由（dev-only）+ 验证脚本 --preview 模式

依赖边: R1 → R2（列表为 R2 入口）→ R3（脚本依赖路由）；R3 完成前不 commit。单次 commit。

状态: **全部完成 2026-08-07**。实施中发现并修复: (1) TanStack 扁平路由 layout 陷阱
(widgets.tsx → widgets.index.tsx + 重启 dev server 重新生成 routeTree); (2) registry
双重 lazy bug（4 个 index barrel 已删，registry 直接导入 view 文件）; (3) moonshot
点击断言改为点非选中 bar; (4) dev notFound 返回 200+客户端 404 UI，生产构建静态
`throw notFound()`（产物已核验）。

## R1. /widgets 列表路由

- [x] `src/routes/widgets.index.tsx`：非 DEV → `throw notFound()`；列出 getWidgetNames() 全部链接
- [x] 复用文章 main 容器类

## R2. /widgets/<name> 预览路由

- [x] `src/routes/widgets.$name.tsx`：非 DEV / 未知 id → notFound
- [x] 复用 posts.$slug wrapper 原样（bg-card + my-10 + px-4 sm:px-6 + breakout 逻辑 + Suspense）— 逐字符一致
- [x] `<Widget lang="en" />` + DEV 徽标 + 返回链接

## R3. verify-widget-a11y.mjs --preview 模式

- [x] 解析 --preview；从 /widgets 抓 id 列表
- [x] 专属 probe 映射（5 个交互 widget）+ 每页跑 probeContainers + probeKeyboard
- [x] 每页断言 HTTP 200 + wrapper 宽度类（breakout=max-w-none / 其他=max-w-prose）
- [x] 访问数 === 列表数断言；未知 widget → 404 UI 断言；文章模式不变
- [x] 验收: 先红（路由未建 → 404）→ 实现后绿：**preview 112 PASS / 0 FAIL / 6 SKIP**
      （6 SKIP = 无交互元素的 widget 键盘 probe）; 文章模式回归 15 PASS / 0 FAIL / 16 SKIP

## R4. 全量验证 + 提交

- [x] lint（本 session 文件）+ tsc + build 全过（产物确认生产 `throw notFound()`）
- [x] code-review 双轴（无 hard 违规；2 个 minor 已修：宽度断言 + 200 断言 + 列表数 ≥14）
- [x] vitest 857/861（4 个 pre-existing supabase env 失败，与本批无关）
- [x] commit + push + 文档 + issue

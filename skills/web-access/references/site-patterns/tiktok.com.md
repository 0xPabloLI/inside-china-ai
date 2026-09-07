---
domain: tiktok.com
aliases: [TikTok, tiktok, TT]
updated: 2026-08-26
---

## 平台特征

- CSI (Creator Search Insights) 桌面版 URL: `tiktok.com/inspiration` → 重定向到 `tiktok.com/csi`
- 话题详情页 URL: `tiktok.com/csi/detail/{topicId}`（topicId 是纯数字）
- Search Analytics URL: `tiktok.com/csi/analytics`（2026-08-26 显示"即将在电脑端上线"，暂不可用）
- 页面语言跟随用户账号设置（中文/英文）
- 需要登录态，未登录会显示登录页面
- 页面为 SPA（单页应用），导航后需要等待动态内容加载
- AI Outline 功能仅在移动端 App 内可用，桌面版 CSI 无此功能
- TUXText 是 TikTok 的设计系统组件类名前缀

## 有效模式

### CSI 话题列表 DOM 结构

话题列表是 HTML `<table>` 结构：

- 每行是一个 `<tr>`，含 4 个 `<td class="...TdCell">`：
  - `tds[0]`: 话题名（纯文本，如 "starters ai"）
  - `tds[1]`: 搜索热度 + 增长率（合并文本，如 "148K1000%+"）
  - `tds[2]`: AI 小技巧状态（"--" 表示无 tips）
  - `tds[3]`: 操作按钮（"上传"）

### 正则分离搜索热度和增长率

从 `tds[1].textContent`（如 "148K1000%+"）中分离：

- 搜索热度: `/^(\d[\d.]*[KM]?)/` → "148K"
- 增长率: `/(\d[\d.]*%\+?)$/` → "1000%+"

注意：某些话题没有增长率数据（只有搜索热度），增长率匹配会为空。

### Content Gap 过滤器

"内容缺口" chip 的 class 含 `Chip`，文本是"内容缺口"（中文）或"Content gap"（英文）。
点击后等 3 秒让过滤结果加载。

### 话题详情页

话题详情页含：搜索热度、增长率、地区分布（百分比）、人口统计（年龄/性别）、相关视频、相关话题。
数据在 `document.body.innerText` 中以 `\n` 分隔。

### 导航

导航栏元素是 `span.HeaderTuxText`（在 `div` 内，不在 `a` 标签内）。
点击需点击父 `div` 而非 `span` 本身。

### 话题链接

话题名 cell 内可能有 `<a href="/csi/detail/{topicId}">` 链接。
从 href 中提取 topicId: `href.split("/csi/detail/")[1]?.split("?")[0]`

## 已知陷阱

- `CellContainerDiv` class 只包含话题名文本，不包含搜索热度数据。搜索热度在 `<td>` 层级。
- 模板字符串中的 `\t` 和 `\n` 会被 JS 解释为实际 tab/newline 字符，而非正则转义序列。在 `.mjs` 文件的模板字符串中，需要用 `\\t` 和 `\\n` 来生成浏览器端 JS 中的 `\t` 和 `\n`。
- CDP `eval` 的返回值如果是非 JSON 字符串（如 "not found"），直接 `JSON.parse()` 会报错。需要 try/catch 降级为原始字符串。
- 话题行可能有 21 行（20 个话题 + 1 行表头），表头行 `tds[0]` 文本是"搜索主题"或"Search topic"。
- Search Analytics 页面显示"即将在电脑端上线"——不是 bug，是功能尚未上线。
- （2026-09-07）在全新 profile 的 Chrome 实例上，`/csi` 页 `document.body.innerText` 返回空串（analytics studio 页正常），但数据已渲染在 `#app` 容器里——用 `document.getElementById("app").innerText` 或直接查 `tr/td` 提取。`tiktok-csi.mjs` 因此抓 0 条。
- （2026-09-07）TikTok 登录风控：常规/CDP profile 登录可能被拒，全新 profile（等效无痕）可登录。登录态保留在该 profile，配合 `WEB_ACCESS_CDP_PORT` env 让 proxy 指向该实例（如 9229）。analytics studio 抓取在该实例上工作正常。
- （2026-09-07）Studio SPA 偶发崩溃白屏：`Unexpected Application Error! window.t is not a function`（creator-center bundle 的 i18n 全局竞态），非登录/风控问题。`location.reload()` 一次即恢复数据。scraper 必须检测 `Unexpected Application Error` 字样并自动 reload 后重试。
- （2026-09-07）Studio 快速导出（已验证全链路）：Overview/Content 页头部 `Download data` 按钮（TUXButton）→ 弹窗选 XLSX/CSV → Download → **ZIP 落 `~/Downloads/`**（`Overview_<日期>_<id>_chinaainews.zip` / `Content_chinaainews.zip`）。`Browser.setDownloadBehavior` 的 downloadPath 覆盖未生效（仍落默认 Downloads，待查 browserContextId/页面级参数）。Overview.csv = 账号级按日（Date/Video Views/Profile Views/Likes/Comments/Shares）；Content.csv = per-video（Time/Video title/Video link/Post time/Total likes/comments/shares/views）——**两者都无完成率/收藏/观看时长**。导出是异步的：点击后弹窗关闭，文件 10-20s 后落盘。
- （2026-09-07，已验证）**per-video 完整指标页**：`tiktokstudio/analytics/<videoId>/overview`，字段含 Video views / Total play time / **Average watch time** / **Watched full video %（完播率）** / New followers / **Retention rate 文字洞察**（"Most viewers stopped watching at 0:01"）/ 单条视频 Traffic source 拆分。videoId 从 `tiktokstudio/content` 列表页 `a[href*="/video/"]` 提取。**比快速导出 CSV 更全，completion rate 无需 CSV**。
- （2026-09-07，已验证）**重页挂起真因与规避**：`analytics/content` 等重渲染页在首绘期间收到 Runtime.evaluate 会间歇性挂死渲染进程（eval/screenshot 全超时）。规避：navigate 后**静默等 40-45s（期间零 eval）**再首次 eval，之后正常。
- （2026-09-07）`analytics.tiktok.com` 老门户已下线（根路径与 /content 均 nginx 404）。manual-ops 中"老门户导出含完成率的 CSV"说明已过时，全字段走 per-video 详情页。

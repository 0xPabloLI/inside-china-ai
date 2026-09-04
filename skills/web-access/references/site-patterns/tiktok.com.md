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

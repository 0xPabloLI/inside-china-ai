# Handoff: SVE Media Extraction (图片/视频同时提取 + Logo 排除 + Metadata)

> Created: 2026-08-20
> Parent discussion: `docs/research/pipeline-simplification-discussion.md` (Topic 4)
> Trigger: User wants Single-Visit Extraction — one CDP visit extracts articles + images + videos simultaneously

## Context

当前管线中，同一个 URL 会被多次访问：

```
Stage 0: search-sources 打开 jiqizhixin.com → 提取文章 → 关闭
Stage 3: asset-sourcer 打开 jiqizhixin.com → 提取图片 → 关闭
         ↑ 同一个网站被 CDP 打开了两次
```

用户要求实现 **Single-Visit Extraction (SVE)**：每个 URL 只用 CDP 访问一次，提取所有资源类型并持久化缓存。**无论什么模式**（trend / research），都要缓存图片和视频。

## What exists already

### search-sources.mjs
- `collectFromCdp(source, keyword)` — 打开 CDP tab → 提取文章 → `enrichWithImages(tabId, articles)` 提取图片 → 关闭 tab
- `enrichWithImages(tabId, articles)` — 在已打开的 tab 上 eval 一次 imageScript，把 imageUrl 关联到文章
- **限制**：只提取文章列表页的缩略图 URL，不提取内嵌视频、不提取大图、不提取 metadata
- Fallback 链：`apiSearch → CDP(extractScript) → cdpFallback(Google site:) → mcpFallback(Grok)`

### asset-sourcer.mjs
- `loadCachedImages(filePath, keywords)` — 从 `trending-topics.json` 读缓存的图片 URL，按 keyword 匹配
- `isLogoOrIcon(url)` — 正则过滤 `logo|avatar|icon|placeholder|spinner|favicon|badge|button|sprite`
- `preFilterCandidate(candidate, keyword)` — 下载前技术评分（分辨率、标题匹配等）
- `downloadAsset(url, destPath)` — 下载图片
- `downloadYtdlp(url, destPath)` — yt-dlp 下载视频

### source-registry.mjs
- `CDP_IMAGE_CAPABILITIES` — per-site 图片提取脚本（ithome, jiqizhixin, google_news 等 7 个源）
- `YTDLP_VIDEO_CAPABILITIES` — per-site 视频提取配置（bilibili, douyin, xhs, weibo, youtube）
- `STOCK_API_SOURCES` — Pexels, Unsplash, Coverr, Pixabay（API 图片/视频搜索）
- `SOURCE_ATTRIBUTIONS` — per-source 归属信息

## What's missing (the gap)

### 1. `enrichWithMedia` 替代 `enrichWithImages`
- 现有 `enrichWithImages` 只提取文章列表页缩略图
- 需要升级为 `enrichWithMedia`，同时提取：
  - **图片**：文章缩略图 + 页面大图（`<img>` with naturalWidth > 400）
  - **视频**：内嵌 `<video>` 标签的 src + `<iframe>` 视频 URL（YouTube/B站/抖音 embed）
  - **Metadata**：`<meta og:image>`, `<meta og:title>`, `<meta og:description>`, `<meta article:published_time>`
- 所有媒体都带上 `sourceUrl`（来源页面 URL）和 `sourceTitle`（来源文章标题）

### 2. Logo/Icon 排除增强
- 现有 `LOGO_ICON_REGEX`：`/logo|avatar|icon|placeholder|spinner|favicon|badge|button|sprite/i`
- 需要增加的过滤模式：
  - 尺寸过滤：`naturalWidth < 200 || naturalHeight < 200`（太小的图通常是 icon）
  - 路径模式：`/loading|blank|default|skeleton|placeholder/i`
  - SVG data URI：`data:image/svg+xml`
  - 广告类：`/ad-|advert|sponsor/i`
  - 平台 UI 图标：`/emoji|reaction|clap|heart|share|comment/i`

### 3. 视频提取脚本
- `enrichWithMedia` 的视频提取部分需要处理：
  - `<video src>` 或 `<video><source src>`
  - `<iframe src*="youtube.com/embed"]>` → 提取 video ID → 转为标准 URL
  - `<iframe src*="player.bilibili.com"]>` → 提取 BV 号
  - 抖音/小红书的 `<video>` 标签（CDP 已加载）
- 视频候选需带上 `duration`（从 `<video>` 元素的 `.duration` 属性获取）和 `poster`（封面图 URL）

### 4. 缓存结构升级
- 当前 `trending-topics.json` 结构：
  ```json
  { "topics": { "category": [{ "title": "...", "url": "...", "imageUrl": "..." }] } }
  ```
- 目标结构：
  ```json
  {
    "topics": {
      "category": [{
        "title": "...",
        "url": "...",
        "images": [{ "url": "...", "width": 800, "alt": "...", "sourceArticle": "..." }],
        "videos": [{ "url": "...", "duration": 30, "poster": "...", "platform": "bilibili" }],
        "metadata": { "og:image": "...", "og:title": "...", "publishedAt": "..." }
      }]
    }
  }
  ```

### 5. Trend 模式也缓存媒体
- 当前 `enrichWithImages` 只在 CDP 成功时调用
- 需要在所有提取路径（CDP、Jina fallback、API）成功后都调用 `enrichWithMedia`
- Jina 的 `X-With-Images-Summary: true` header 可一次性返回文章 + 图片 URL（不需要额外 CDP 请求）
- API 路径返回的 JSON 通常不含图片 URL（arXiv、Reddit 等），这些源的图片只走 asset-sourcer 的独立搜索

## Implementation Scope

### 改动文件
1. `scripts/short-video/search-sources.mjs`
   - `enrichWithImages()` → `enrichWithMedia()` — 升级提取逻辑
   - `collectFromCdp()` — 调用 `enrichWithMedia` 代替 `enrichWithImages`
   - `collectFromApi()` — API 成功后也尝试 `enrichWithMedia`（如果有 CDP tab 可用）
   - `collectFromSource()` — 在 fallback 链每层成功后都 enrich
   - Trend 模式输出 — `trending-topics.json` 结构升级

2. `scripts/short-video/lib/asset-sourcer.mjs`
   - `loadCachedImages()` → `loadCachedMedia()` — 同时读图片和视频
   - `LOGO_ICON_REGEX` — 扩展过滤模式
   - `isLogoOrIcon()` — 增加尺寸判断参数

3. `scripts/short-video/lib/source-registry.mjs`
   - `CDP_IMAGE_CAPABILITIES` → `CDP_MEDIA_CAPABILITIES` — 合并图片和视频提取脚本
   - 新增 `VIDEO_IFRAME_PATTERNS` — iframe 视频解析规则

4. 测试文件：
   - `__tests__/search-sources.test.mjs`（如果存在）或新建
   - `__tests__/asset-sourcer.test.mjs` — `loadCachedMedia` 测试 + `isLogoOrIcon` 新模式测试

### 不改动的文件
- `lib/cdp-client.mjs` — CDP 传输层不变
- `lib/mcp-client.mjs` — MCP 传输层不变
- `STOCK_API_SOURCES` — Pexels/Unsplash 等仍走独立 API
- `YTDLP_VIDEO_CAPABILITIES` — yt-dlp 视频下载仍走独立路径

## Suggested Skills

- `implement` skill — 标准 TDD 实施
- `tdd` skill — red → green → refactor
- `writing-for-agents` skill — 如果需要更新 `docs/content-pipeline.md` 中的 SVE 描述

## Key References

- 源文件：`scripts/short-video/search-sources.mjs` 第 119-212 行（`enrichWithImages` + `collectFromCdp`）
- 源文件：`scripts/short-video/lib/asset-sourcer.mjs` 第 1227-1304 行（`LOGO_ICON_REGEX` + `loadCachedImages`）
- 源文件：`scripts/short-video/lib/source-registry.mjs` 第 2345-2605 行（`CDP_IMAGE_CAPABILITIES`）
- 讨论：`docs/research/pipeline-simplification-discussion.md` Topic 4
- Pipeline 文档：`docs/content-pipeline.md`

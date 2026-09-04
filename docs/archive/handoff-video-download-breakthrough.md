# Handoff: Video Download Breakthrough Research

> Created: 2026-08-26
> Related Issues: #75 (替代下载方案+视频源标注), #77 (source type labeling audit)
> Related Docs: `docs/research/asset-source-quick-reference.md`, `docs/research/reference-video-extraction.md`
> Status: Ready for implementation — all methods verified

## Problem

yt-dlp 只支持 YouTube 和 B站 两个平台的视频下载。中国 AI 新闻内容经常涉及抖音、小红书、微博、TikTok 上的视频素材，这些平台 yt-dlp 全部无法处理。除了**专用平台方案**（每个平台一个工具），还需要**通用下载方法**覆盖任意未知平台的 URL。

| 平台    | yt-dlp 状态 | 原因                                                     |
| ------- | ----------- | -------------------------------------------------------- |
| YouTube | ✅ 可用     | yt-dlp 原生支持                                          |
| B站     | ✅ 可用     | yt-dlp + Firefox cookies                                 |
| 抖音    | ❌ 不可用   | 缺少 `a_bogus` 签名算法（issue #9667, PR #15627 closed） |
| 小红书  | ❌ 不可用   | 需要登录态 + 反爬                                        |
| 微博    | ❌ 不可用   | 需要访客 cookie 系统                                     |
| TikTok  | ❌ 不可用   | JS challenge 需要 JS 执行环境                            |

当前 `source-registry.mjs` 中只有 4 个源有 `capabilities.videos`，51 个有 `articles` 但没有 `videos` 的源从未被调研。

## 已验证的替代方案（全部不需要 yt-dlp）

### 1. TikTok — CDP `item/detail` API（已验证 2026-08-24）

**核心思路**：用 CDP 在浏览器内执行 `fetch()`，浏览器自带所有 cookies + 签名 headers。

```js
// 1. 获取视频元数据
const detail = await fetch(
  "https://www.tiktok.com/aweme/v1/web/item/detail/?itemId=VIDEO_ID&aid=1988",
  { credentials: "include" },
).then((r) => r.json());
// 2. 提取 playAddr
const playAddr = detail.itemInfo.item.video.playAddr;
// 3. 下载视频
const blob = await fetch(playAddr, { credentials: "include" }).then((r) => r.blob());
```

**优势**：无需逆向签名、无需第三方服务、低 ban 风险（同一浏览器 session）。
**限制**：需要非 HK 代理（Clash HK 节点被 TikTok 区域限制）。
**详细文档**：`docs/research/reference-video-extraction.md` TikTok section。

### 2. 抖音 — `iesdouyin.com/share/video/` 端点（chubbyskills 方案）

**核心思路**：抖音移动端分享页面有一个端点不需要 `a_bogus` 签名。

- URL: `https://www.iesdouyin.com/share/video/{VIDEO_ID}/`
- 使用移动端 User-Agent
- **无需 cookie / 登录**
- 返回 JSON 含 `video.play_addr` 直接下载地址
- 无水印

**实现**：[chubbyskills](https://github.com/chubbyguan/chubbyskills) 已封装此方法（616 stars），13 skills 覆盖抖音/B站/小红书/公众号/X/播客。

**备选**：[Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API)（19K stars），本地部署 FastAPI，自己实现 `a_bogus` 签名算法。功能更全但更重。

### 3. 小红书 — RedNote-MCP（已测试 2026-08-14）

**核心思路**：MCP server 通过 Playwright 浏览器自动化，复用用户登录态。

- `npm install -g rednote-mcp`
- `rednote-mcp init`（打开浏览器，手动登录，cookies 存 `~/.mcp/rednote/cookies.json`）
- `search_notes` 工具搜索笔记
- `get_note` 工具获取笔记详情（含图片/视频 URL）

**备选**：[XHS-Downloader](https://github.com/JoeanAmier/XHS-Downloader)（12K stars），纯 Python，CLI 工具。

### 4. 微博 — weibo-downloader-skill（已测试 2026-08-14）

**核心思路**：微博有访客 cookie 系统，无需登录。

- `passport.weibo.com/visitor/genvisitor2` → 获取访客 ticket
- `passport.weibo.com/visitor/visitor?a=confirm` → 确认访客身份
- `weibo.com/ajax/statuses/show?id=STATUS_ID` → 获取微博详情（含视频 URL）
- 纯 Python + requests，无依赖

**搜索**：微博搜索需要登录（CDP），但下载不需要。

### 5. B站 — bilibili-api-python（已测试）

已有方案：`bilibili-api-python` 搜索 + `yt-dlp --cookies-from-browser firefox` 下载。搜索比 `yt-dlp bilisearch:` 更可靠（避免 412 错误）。

### 6. 通用下载方案（跨平台，覆盖未知 URL）

专用方案解决「知道是哪个平台」的情况。但实际管线中经常遇到**来源不明的 URL**——新闻文章内嵌的视频、聚合页面（Google News → 某新闻站）的 iframe 视频、或用户新给的平台 URL。需要一个通用 fallback 层。

#### 6a. Cobalt 自部署 HTTP API（通用 fallback，推荐 P0）

**核心思路**：自部署一个 Cobalt 实例，所有下载请求走统一 HTTP API。

- GitHub: [imputnet/cobalt](https://github.com/imputnet/cobalt)（39.7K stars）
- 支持 **30+ 平台**：YouTube, TikTok, **Douyin (抖音)**, **Bilibili (B站)**, Instagram, Twitter/X, Reddit, SoundCloud, Vimeo, Pinterest, Twitch, VK, Tumblr 等
- **抖音无水印下载**：原生支持
- API 格式：
  ```bash
  curl -X POST https://your-cobalt.example.com/ \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json' \
    -d '{"url": "https://www.douyin.com/video/xxx"}'
  # → {"status": "tunnel", "url": "https://...mp4", "filename": "...mp4"}
  ```
- 自部署：Docker 一行命令，无追踪/广告/日志
- 公共实例 `api.cobalt.tools` 2025 年起被 YouTube 屏蔽，需自部署
- Railway 一键部署模板可用
- **Python 封装**：`pybalt`（PyPI, `pip install pybalt`），CLI + Python module

**优势**：一个 API 覆盖 30+ 平台，无 JS 逆向，统一接口。
**劣势**：需要部署维护一个 Docker 服务。但本地实例即可，不需要公网。

#### 6b. CDP 通用视频提取（零依赖 fallback）

**核心思路**：用已有的 CDP 浏览器，对任意 URL 做通用视频提取。

1. CDP 打开 URL → 等待页面加载
2. 扫描 `performance.getEntriesByType("resource")` 找 video stream URL
3. 或扫描 `<video>` 标签的 `src` / `currentSrc`
4. 或监听 network 请求过滤 video MIME type
5. 拿到 URL 后 CDP `fetch()` 下载

**优势**：零依赖，复用已有 CDP 基础设施。能处理新闻网站内嵌的第三方播放器视频。
**劣势**：依赖页面 JS 渲染，MSE blob URL 不稳定，部分网站需要登录态。

#### 6c. gallery-dl（图片/视频批量抓取，已有生态）

- GitHub: [mikf/gallery-dl](https://github.com/mikf/gallery-dl)
- 支持：B站、TikTok、微博、YouTube 等数百站点
- **不支持**：抖音、小红书
- 主要用于图片抓取，视频支持有限
- 适合做图片素材的通用 fallback

#### 6d. MediaCrawler（中国平台全爬，研究级）

- GitHub: [NanmiCoder/MediaCrawler](https://github.com/NanmiCoder/MediaCrawler)（52K+ stars）
- 支持 **7 个中国平台**：小红书、抖音、快手、B站、微博、贴吧、知乎
- 基于 Python + Playwright 浏览器自动化，不做 JS 逆向
- 支持搜索 + 内容爬取 + 评论 + 媒体下载
- 有 WebUI + API
- **劣势**：偏重（Python 3.11+，Node.js 16+，Playwright），适合批量爬取不适合单 URL 快速下载
- **Pro 版**加了 AI Agent 集成、多账号路由、代理 IP 池

#### 通用方案对比矩阵

| 方案              | 覆盖平台                      | 部署成本               | API 接口             | 适合场景                               |
| ----------------- | ----------------------------- | ---------------------- | -------------------- | -------------------------------------- |
| **Cobalt 自部署** | 30+（含抖音/B站/TikTok/微博） | Docker 一行            | HTTP POST → 下载 URL | **通用 fallback，所有未知 URL 先走这** |
| **CDP 通用提取**  | 任意 URL                      | 零（已有 CDP）         | CDP eval JS          | Cobalt 不支持的平台，新闻内嵌视频      |
| **gallery-dl**    | 数百站点（不含抖音/小红书）   | pip install            | CLI                  | 图片批量抓取                           |
| **MediaCrawler**  | 7 个中国平台                  | Python+Node+Playwright | Python API / WebUI   | 批量深度爬取（搜索+评论+元数据）       |

### 7. 全方案对比

| 方案                           | 类型              | 覆盖平台                                              | 部署                           | 优势                                | 劣势                          |
| ------------------------------ | ----------------- | ----------------------------------------------------- | ------------------------------ | ----------------------------------- | ----------------------------- |
| **yt-dlp**                     | CLI               | YouTube/B站                                           | 已有                           | 原生支持                            | 不支持抖音/小红书/微博/TikTok |
| **CDP item/detail**            | 内置              | TikTok                                                | 已有                           | 无需额外依赖                        | 仅 TikTok                     |
| **chubbyskills**               | npm 工具          | 抖音/B站/小红书/公众号/X/播客                         | npm install                    | 全渠道                              | 616 stars，社区维护           |
| **Douyin_TikTok_Download_API** | 本地 API          | 抖音/TikTok/B站/快手                                  | Docker/FastAPI                 | 19K stars，功能全                   | 需要实现签名算法              |
| **Cobalt 自部署**              | HTTP API          | 30+ 平台（含抖音/B站/TikTok/微博/Instagram/X/Reddit） | Docker 一行                    | **通用 fallback**，统一接口，无水印 | 需要部署维护 Docker 服务      |
| **CDP 通用提取**               | 内置              | 任意 URL                                              | 零（已有 CDP）                 | 零依赖，复用已有基础设施            | MSE blob 不稳定，部分需登录   |
| **RedNote-MCP**                | MCP server        | 小红书                                                | npm install                    | 官方 MCP 协议                       | 需要手动登录                  |
| **weibo-downloader-skill**     | Python 脚本       | 微博                                                  | pip install                    | 纯 requests，无依赖                 | 仅微博                        |
| **XHS-Downloader**             | Python CLI        | 小红书                                                | pip install                    | 12K stars                           | 仅小红书                      |
| **gallery-dl**                 | CLI               | 数百站点（不含抖音/小红书）                           | pip install                    | 图片批量抓取                        | 视频支持有限                  |
| **MediaCrawler**               | Python+Playwright | 7 个中国平台                                          | Python 3.11+Node 16+Playwright | 批量深度爬取                        | 偏重，不适合单 URL 快速下载   |

## 实施建议（给 #75 的 sub-agent）

### 优先级排序

#### 专用方案（已知平台）

1. **P0: Cobalt 自部署** — Docker 一行部署，30+ 平台统一 API。**作为通用 fallback 层**：所有 URL 先走 Cobalt，不支持再走专用方案。覆盖抖音/TikTok/微博/B站/Instagram/X/Reddit 等绝大多数场景
2. **P1: chubbyskills** — Cobalt 不支持的平台（小红书/公众号），npm install，全渠道
3. **P2: weibo-downloader-skill** — 如果 Cobalt 微博下载不稳定，用专用方案兜底
4. **P3: TikTok CDP method A** — Cobalt TikTok 不稳定时的 fallback
5. **P4: RedNote-MCP** — 小红书替代方案

#### 通用 fallback 层（未知平台/新闻内嵌视频）

1. **G0: Cobalt** — 未知 URL 统一走 Cobalt API，30+ 平台自动识别
2. **G1: CDP 通用视频提取** — Cobalt 不支持的平台，用 CDP 打开页面扫描 video 标签/resource entries
3. **G2: yt-dlp** — YouTube/B站 专用（Cobalt 也支持但有 cookies 需求）

#### 下载链路（asset-sourcer.mjs 逻辑）

```
URL → Cobalt API (通用)
  → 成功 → 下载
  → 失败/不支持 → 检测平台
    → YouTube/B站 → yt-dlp --cookies
    → 抖音 → chubbyskills (iesdouyin 端点)
    → 小红书 → RedNote-MCP
    → 微博 → weibo-downloader-skill
    → TikTok → CDP item/detail API
    → 未知平台 → CDP 通用视频提取（扫描 <video>/resource entries）
    → 全部失败 → 记录日志，跳过
```

### source-registry.mjs 标注建议

```js
// 抖音 — chubbyskills 方案
douyin: {
  capabilities: {
    videos: { method: 'cdp' }, // CDP 搜索 + chubbyskills 下载
  }
}

// 小红书 — RedNote-MCP 方案
xhs: {
  capabilities: {
    videos: { method: 'cdp' }, // CDP 搜索 + RedNote-MCP 下载
  }
}

// 微博 — weibo-downloader-skill 方案
weibo_hot: {
  capabilities: {
    videos: { method: 'cdp' }, // CDP 搜索 + weibo-downloader 下载
  }
}

// TikTok — CDP item/detail API 方案
tiktok_creator: {
  capabilities: {
    videos: { method: 'cdp' }, // ScrapeCreators 搜索 + CDP item/detail 下载
  }
}
```

### asset-sourcer.mjs 下载逻辑

```js
// 下载链路：Cobalt 通用 → 专用 fallback → CDP 通用提取 → 失败跳过
// 不需要 downloadable 字段——有 videos capability 就尝试下载

const COBALT_URL = process.env.COBALT_API_URL || "http://localhost:3000";

async function downloadVideo(source, url) {
  // G0: Cobalt 通用 fallback（覆盖 30+ 平台）
  try {
    return await downloadViaCobalt(url);
  } catch (e) {
    console.log(`[downloadVideo] Cobalt failed for ${url}: ${e.message}`);
  }

  // 专用 fallback：Cobalt 不支持或失败
  switch (source) {
    case "youtube":
    case "bilibili":
      return await searchYtdlp(url); // yt-dlp + Firefox cookies
    case "douyin":
      return await downloadViaChubbyskills(url); // iesdouyin 端点
    case "xhs":
      return await downloadViaRedNoteMcp(url); // MCP 工具
    case "weibo_hot":
      return await downloadViaWeiboDownloader(url); // 访客 cookie
    case "tiktok_creator":
      return await downloadViaCdpItemDetail(url); // CDP fetch
    default:
      // G1: CDP 通用视频提取（未知平台/新闻内嵌视频）
      return await downloadViaCdpGeneric(url); // 扫描 <video>/resource entries
  }
}

async function downloadViaCobalt(url) {
  const resp = await fetch(COBALT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, videoQuality: "1080" }),
  });
  const data = await resp.json();
  if (data.status === "tunnel" || data.status === "redirect") {
    const videoResp = await fetch(data.url);
    return await videoResp.arrayBuffer();
  }
  throw new Error(`Cobalt status: ${data.status}`);
}
```

## 关键文件

- `source-registry.mjs` — 源定义 + capabilities 标注
- `asset-sourcer.mjs` — 下载逻辑入口
- `docs/research/asset-source-quick-reference.md` — 全量源对照表
- `docs/research/reference-video-extraction.md` — TikTok CDP 下载详细 JS 代码

## 与 #77 的分工

- **#77**：审计现有 59 个源的标注是否正确 + 调研哪些源应该新增 video capability
- **#75**（本 handoff 接续）：实现标注 + 集成下载器代码
- **执行顺序**：#77 调研 → #75 实现。但两者可以重叠——#77 调研高优先级源的同时，#75 可以先集成 chubbyskills（抖音方案已确定）

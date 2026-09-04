# Asset Source Quick Reference

> Status: Active — last updated 2026-09-04
> Scope: Human-readable quick reference for all content sources — both **multimedia assets** (images, videos, audio for video production) and **text content** (articles, news, trending topics for trend discovery and script writing).
>
> **When to use this doc**: When deciding which sources to use for a new content piece, checking which API keys are needed, or evaluating a new source for integration. Not for pipeline consumption — pipeline reads `asset-sourcer.mjs` and `source-registry.mjs` source definitions directly.

## Quick Status Table

| #   | Source                | Type         | API Key Needed?          | Auth Method                                                                                                                               | Status                          | Best For                                  |
| --- | --------------------- | ------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| 1   | **YouTube**           | Video        | ❌ No                    | Firefox cookies (`--cookies-from-browser firefox`)                                                                                        | ✅ Working                      | Product demos, company videos             |
| 2   | **B站 (Bilibili)**    | Video        | ❌ No                    | `bilibili-api-python` (search) + `yt-dlp --cookies-from-browser firefox` (download)                                                       | ✅ **Search + Download tested** | Chinese tech content, UP主 videos         |
| 3   | **抖音 (Douyin)**     | Video        | ❌ No                    | [Douyin_TikTok_Download_API](https://github.com/Evil0ctal/Douyin_TikTok_Download_API) (19K stars)                                         | ✅ CDP download verified 2026-09-03 | Chinese viral content, short clips        |
| 4   | **小红书 (XHS)**      | Image/Video  | ❌ No                    | [RedNote-MCP](https://github.com/iFurySt/RedNote-MCP) (npm) or [XHS-Downloader](https://github.com/JoeanAmier/XHS-Downloader) (12K stars) | ✅ Search verified 2026-09-04 (rednote-mcp) | Product photos, lifestyle shots           |
| 5   | **微博 (Weibo)**      | Image/Video  | ❌ No                    | [weibo-downloader-skill](https://github.com/belingud/weibo-downloader-skill) (visitor cookie, no login)                                   | ✅ API tested                   | News clips, trending topics               |
| 6   | **Pexels**            | Image+Video  | ✅ `PEXELS_API_KEY`      | `Authorization: KEY` header                                                                                                               | ✅ Working                      | Generic B-roll, abstract backgrounds      |
| 7   | **Unsplash**          | Image        | ✅ `UNSPLASH_ACCESS_KEY` | `Authorization: Client-ID KEY`                                                                                                            | ✅ Working                      | High-quality photos, city/buildings       |
| 8   | **Pixabay**           | Image+Video  | ✅ `PIXABAY_API_KEY`     | `key` query param                                                                                                                         | ✅ Working                      | Tech B-roll, Chinese keyword search       |
| 9   | **Coverr**            | Video        | ✅ `COVERR_API_KEY`      | `Authorization: Bearer KEY`                                                                                                               | ✅ Working                      | Vertical stock video, AI tools            |
| 10  | **Wikimedia Commons** | Image/Video  | ❌ No                    | User-Agent header                                                                                                                         | ✅ Working                      | Company HQ, historical photos, PD content |
| 11  | **Flickr**            | Image        | ✅ `FLICKR_API_KEY`      | `api_key` query param                                                                                                                     | 📋 Researched, not integrated   | Niche product photos, CC-licensed         |
| 12  | **Mixkit**            | Video        | ❌ No                    | CDP scraping                                                                                                                              | 📋 Researched, not integrated   | Free vertical videos, no API              |
| 13  | **Internet Archive**  | Video/Image  | ❌ No                    | None                                                                                                                                      | 📋 Researched, not integrated   | Archival footage, public domain           |
| 14  | **Google News**       | Article URLs | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Finding articles with images              |
| 15  | **Bing News**         | Article URLs | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Alternative news search                   |
| 16  | **IT之家**            | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Chinese AI product news images            |
| 17  | **机器之心**          | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | AI-specific cover images                  |
| 18  | **新华网**            | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Official event photos                     |
| 19  | **澎湃新闻**          | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Mainstream news images                    |
| 20  | **雷锋网**            | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | Tech media images                         |
| 21  | **新智元**            | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | AI media images                           |
| 22  | **智东西**            | Image        | ❌ No                    | CDP                                                                                                                                       | ✅ Working (in pipeline)        | AI media images                           |

## API Keys

Store all keys in `.env.local` (gitignored, not in Git):

```bash
# .env.local
PEXELS_API_KEY=...
UNSPLASH_ACCESS_KEY=...
PIXABAY_API_KEY=...
COVERR_API_KEY=...
# FLICKR_API_KEY=...  (not yet integrated)
```

No key needed for: YouTube, B站, Wikimedia Commons, Mixkit, Internet Archive, all CDP/news sources.

### Rate Limits

| Source       | Free Tier Limit                | Renewal          | Notes                                                            |
| ------------ | ------------------------------ | ---------------- | ---------------------------------------------------------------- |
| **Pexels**   | 200 req/hour, 20,000 req/month | Hourly + Monthly | Unlimited if platform eligible (contact api@pexels.com)          |
| **Unsplash** | 50 req/hour (demo mode)        | Hourly           | 5,000 req/hour after production approval                         |
| **Pixabay**  | 100 req/60s                    | Per 60s          | No daily/monthly cap documented; 5,000 req/hour per some sources |
| **Coverr**   | Undocumented                   | Unknown          | API has "downloads quota" but no public rate limit info          |

## License & Attribution Summary

| Source                  | License                      | Attribution Required?        | Logo Required?               | TikTok Credits?                     |
| ----------------------- | ---------------------------- | ---------------------------- | ---------------------------- | ----------------------------------- |
| YouTube/B站/抖音/微博   | Creator copyright            | Yes (fair use)               | No                           | Internal only                       |
| Pexels                  | Pexels License               | Optional                     | No                           | Internal only                       |
| Unsplash                | Unsplash License             | Optional                     | No                           | Internal only                       |
| **Pixabay**             | Pixabay Content License      | **Yes (API terms)**          | **Yes**                      | **✅ Shows in TikTok**              |
| Wikimedia Commons       | Varies (CC-BY, CC-BY-SA, PD) | **Dynamic per-file**         | No (but license text for CC) | Dynamic — CC-BY/CC-BY-SA yes, PD no |
| Coverr                  | Coverr License               | Optional                     | No                           | Internal only                       |
| Mixkit                  | Mixkit/Envato License        | Optional                     | No                           | Internal only                       |
| Internet Archive        | Varies (PD, CC, custom)      | **Per-item check**           | No                           | If CC-BY → yes, if PD → no          |
| **Flickr**              | CC licenses (filterable)     | **Yes for CC-BY/CC-BY-SA**   | No                           | If used → yes (license-dependent)   |
| CCTV                    | CCTV copyright               | Yes (editorial)              | No                           | Internal only                       |
| Chinese news sites      | News copyright               | Yes                          | No                           | Internal only                       |
| Google News / Bing News | Varies (depends on source)   | Yes (follow original source) | No                           | Internal only                       |

> **Rule**: Only sources with `logoRequired=true` (Pixabay) OR `attributionRequired=true` (Wikimedia CC-BY/CC-BY-SA) appear in TikTok video description credits.
> All other sources are tracked internally in `output/asset-report.json` with full attribution metadata.
> **Wikimedia**: License is fetched per-file via `fetchWikimediaLicense()`. The `dynamicAttribution` flag in `SOURCE_ATTRIBUTIONS.wikimedia` enables per-file license checking — CC-BY and CC-BY-SA licenses set `attributionRequired=true` (appears in TikTok credits), while Public Domain and CC0 set `attributionRequired=false` (no credits needed).

## Source Categories

### Stock Media (Generic B-roll)

- **Pexels** — Best stock video quality, portrait orientation
- **Unsplash** — Highest quality images, no video
- **Pixabay** — Chinese keyword support, images + videos
- **Coverr** — Vertical stock video + AI creative tools
- **Mixkit** — No API, CDP scraping needed
- **Flickr** — CC-licensed photos, license filter critical

### Encyclopedia (Factual)

- **Wikimedia Commons** — 100M+ files, mixed licenses, per-file check
- **Internet Archive** — Archival footage, public domain

### Chinese Video Platforms — Search + Download Strategy

搜索方法 = `search-sources.mjs` 如何发现内容；下载方法 = `asset-sourcer.mjs` 如何获取媒体文件。

| Platform    | Search Method                                    | Download Method                                                           | Login?                     | Status                                  |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------- | --------------------------------------- |
| **YouTube** | MCP fallback (search)                            | `yt-dlp --cookies-from-browser firefox`                                   | No                         | ✅ Download re-verified 2026-09-04      |
| **B站**     | `bilibili-api-python` (search) + CDP fallback    | `yt-dlp --cookies-from-browser firefox`                                   | No                         | ✅ Search + Download re-verified 2026-09-04 |
| **抖音**    | CDP (needs login) → MCP fallback                 | CDP `iesdouyin.com/share/video/` → `video.currentSrc` → curl with Referer | Search: yes, Download: yes | ✅ Download verified 2026-09-03         |
| **小红书**  | CDP (needs login) → MCP fallback (RedNote-MCP)   | RedNote-MCP or XHS-Downloader                                             | Yes (both)                 | ✅ search_notes verified 2026-09-04; download untested |
| **微博**    | CDP (search needs login) → Google site: fallback | weibo-downloader-skill (visitor cookie, no login)                         | Search: yes, Download: no  | ✅ Download API tested                  |
| **TikTok**  | ScrapeCreators API (primary, no login)           | CDP `item/detail` API (default) → manual (fallback)                       | No (search)                | ✅ Search + Download verified           |

> **抖音下载** (verified 2026-09-03) — CDP 访问 `https://www.iesdouyin.com/share/video/{video_id}`（无需 cookie/登录），从 `<video>` 元素的 `currentSrc` 提取 CDN 下载链接，用 `curl -H "Referer: https://www.douyin.com/"` 下载。注意：chubbyskills 的 SSR 方案（从 `window._ROUTER_DATA` 提取 `videoInfoRes`）已失效——页面结构变化，`videoInfoRes` 不再存在；但 CDP 方案（客户端 JS 渲染后从 video 元素提取）可用。测试样本：video ID `7680095489249536842`（滴滴自动驾驶 R2），下载 327KB MP4 成功。

> **TikTok 下载** (verified 2026-08-24) — CDP `item/detail` API 是默认方法：浏览器内 `fetch('/aweme/v1/web/item/detail/?itemId=ID&aid=1988')` → `playAddr` → `fetch(playAddr, {credentials:'include'})` → Blob → base64 分块下载。无需逆向签名、无需第三方服务。详细 JS 代码见 `docs/research/reference-video-extraction.md` TikTok section。第三方方案对比（TikTokApi, Cobalt, Douyin_TikTok_Download_API, tiktok-api-dl, yt-dlp）也见该文档。

> **下载方法验证日志** (issue #181, 2026-09-04) — 固定公开样本实测记录：
>
> - **YouTube** (yt-dlp + Firefox cookies): `aircAruvnKk` → mp4，1119.9s，9,419,342 B，合并成功 ✅
> - **B站** (yt-dlp + Firefox cookies): `BV1DPbc68EjK` → mp4，163.1s，8,977,576 B（bv+ba 合并）✅；搜索 API `api.bilibili.com/x/web-interface/search/all/v2` 无登录可用（code 0）✅
> - **小红书** (rednote-mcp `--stdio` + `search_notes`): 2026-08-21 的 cookies 仍有效，`{"keywords": "人工智能", "limit": 3}` 返回 3 条完整笔记（标题/正文/点赞/链接）✅。注意：bin 必须以 `rednote-mcp --stdio` 启动（无标志会进 CLI help），参数名是复数 `keywords`
> - **Cobalt v11.7.1** (localhost:9000): YouTube 返回 tunnel URL 但拉流 0 字节（HTTP 200 空 body、无 content-type）——较上次 smoke（tunnel ✅）降级；TikTok `error.api.fetch.fail`；抖音 `error.api.link.invalid`（douyin 不在 services 列表）。维持「不作为核心依赖」结论
> - **TikTok** CDP `item/detail`（✅ 2026-08-24）与**抖音** iesdouyin CDP share page（✅ 2026-09-03，327KB MP4）沿用上文已记录证据，本次未重跑（需 CDP 浏览器会话）

### Video Download Layer (VDL) — Unified adapter registry

> Implemented: 2026-08-26 (commit a99e14c, issue #75)
> Spec: `docs/archive/spec-video-download-layer.md`

统一视频下载层 `scripts/short-video/lib/video-downloaders.mjs`，策略选择器路由到 adapter：

| Adapter ID    | 覆盖平台                                   | 状态                                                                                                                                                                                                                                             | 备注                          |
| ------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `direct-http` | 直接媒体 URL（`.mp4`、已知 CDN）           | ✅ Working                                                                                                                                                                                                                                       | 包装 HTTP fetch               |
| `ytdlp`       | YouTube、B站                               | ✅ Working                                                                                                                                                                                                                                       | 包装 yt-dlp + Firefox cookies |
| `cobalt`      | 30+ 平台（含抖音/TikTok/微博/Instagram/X） | ⚠️ Adapter ready, Cobalt 已部署（v11.7.1, localhost:9000, Watchtower 自动更新）。2026-09-04 复测：YouTube 返回 tunnel URL 但拉流 0 字节、TikTok `error.api.fetch.fail`、抖音 `error.api.link.invalid`（不在 services）——传输层失效。**不作为核心依赖**，有 ytdlp + direct-http fallback |

**DownloadResult 契约**：所有 adapter 返回统一 `DownloadResult` 对象（status / strategy / buffer / mimeType / byteLength / provenance / retryable）。

**Cobalt 状态机**：`tunnel`→下载、`redirect`→下载、`picker`→needs-selection、`local-processing`→unsupported、`error`→分类（retryable/non-retryable）。

**后续扩展**（留在 issue 追踪：#75 第二批 + #115 集成 + #77 schema 更新）：

- 平台 adapter：douyin-share、tiktok-cdp-detail、weibo-visitor-api、rednote-mcp、cdp-generic（#75 第二批）
- `asset-sourcer.mjs` 集成 `downloadVideo()`（#115）
- `source-registry.mjs` schema 拆分 discovery + download adapter（#77）

### Chinese News Media (CDP)

- **IT之家** — Best for Chinese AI product news
- **机器之心** — AI-focused cover images
- **新华网** — Official state event photos
- **澎湃新闻** — Mainstream news
- **雷锋网** — Tech media
- **新智元** — AI media
- **智东西** — AI media

### Search Engines (CDP)

- **Google News** — International news search
- **Bing News** — Alternative news search

## Text Content Sources (Trend Discovery)

Text sources collect article titles + URLs for trend discovery and script writing. Defined in `source-registry.mjs`, used by `search-sources.mjs`. Separate from multimedia asset sources above.

### News Media (CDP, no auth)

| #   | Source                    | Type         | Auth? | Status     | Best For                  |
| --- | ------------------------- | ------------ | ----- | ---------- | ------------------------- |
| T1  | **量子位** (qbitai)       | Article URLs | No    | ✅ Working | Chinese AI news           |
| T2  | **机器之心** (jiqizhixin) | Article URLs | No    | ✅ Working | AI-focused articles       |
| T3  | **36氪** (36kr)           | Article URLs | No    | ✅ Working | Tech/startup news         |
| T4  | **TechCrunch AI**         | Article URLs | No    | ✅ Working | English AI news           |
| T5  | **Bloomberg Tech**        | Article URLs | No    | ✅ Working | Finance/tech news         |
| T6  | **观察者网** (guancha)    | Article URLs | No    | ✅ Working | Mainstream Chinese news   |
| T7  | **IT之家** (ithome)       | Article URLs | No    | ✅ Working | Chinese tech product news |

### Self-Media & Social (CDP)

| #   | Source                      | Type         | Auth?       | Status              | Best For                          |
| --- | --------------------------- | ------------ | ----------- | ------------------- | --------------------------------- |
| T8  | **小红书** (xhs)            | Article URLs | Yes (login) | ⚠️ Needs login      | Trending topics, product buzz     |
| T9  | **搜狗微信** (sogou_weixin) | Article URLs | No          | ✅ Working          | WeChat公众号文章搜索              |
| T10 | **微博热搜** (weibo_hot)    | Hot topics   | No          | ✅ Working          | Trending topics, public sentiment |
| T11 | **B站搜索** (bilibili)      | Video URLs   | No          | ⚠️ 412 intermittent | Tech video search                 |
| T12 | **抖音搜索** (douyin)       | Video URLs   | Yes (login) | ⚠️ Needs login      | Viral content discovery           |
| T13 | **TikTok Creator**          | Video URLs   | Yes (login) | ⚠️ Needs login      | International TikTok trends       |
| T14 | **知乎** (zhihu)            | Q&A URLs     | No          | ✅ Working          | Deep-dive discussions             |
| T15 | **X (Twitter)**             | Posts        | Yes (login) | ⚠️ Needs login      | International AI discourse        |

### WeChat Official Accounts

| #   | Source                     | Type         | Auth? | Status     | Best For                     |
| --- | -------------------------- | ------------ | ----- | ---------- | ---------------------------- |
| T16 | **搜狗微信** (republished) | Article URLs | No    | ✅ Working | 公众号文章 via Google search |

> **Note**: WeChat Platform API (direct account crawling) is disabled — `appmsg?action=list_ex` endpoint was blocked by WeChat. Use 搜狗微信 (Google search for republished articles) instead. See `source-registry.mjs` → `WECHAT_API_CONFIG` for details.

## Deep Research References

- **Full strategy**: `docs/archive/media-asset-strategy.md` — 1000+ lines, covers pipeline integration, animation presets, overlay strategy, BGM, audio mixing
- **Video splitting**: `docs/research/multi-video-splitting-best-practices.md` — 15 sources, TikTok algorithm analysis
- **Script writing**: `docs/research/short-video-script-writing-best-practices.md` — 15+ sources
- **Pipeline docs**: `docs/content-pipeline.md`, `docs/video-workflow.md`
- **Asset management**: `docs/media-asset-management.md` — directory structure rules

## Design Decisions & References

- **Firefox over Chrome**: Chrome v127+ cookie encryption broken on macOS. Firefox SQLite cookies work with `--cookies-from-browser firefox`.
- **B站 search via bilibili-api-python**: `pip install bilibili-api-python`, use `search.search_by_type(keyword=..., search_type=SearchObjectType.VIDEO)`. Returns title/BV号/av号/duration/play count. Works with Chinese AND English, single AND multi-word. Far superior to `yt-dlp bilisearch:` (412 errors). Download via `yt-dlp --cookies-from-browser firefox` with BV号.
- **Douyin a_bogus**: yt-dlp issue #9667, PR #15627 closed. Not a cookie problem — yt-dlp lacks the signature algorithm. Alternative: `Douyin_TikTok_Download_API` (19K stars, handles a_bogus). Also supports Bilibili.
- **B站 av号 vs BV号**: `BV`号 sometimes triggers `KeyError('bvid')` (yt-dlp bug). `av`号 always works. Use `bilibili-api-python` search to get both.
- **小红书 via RedNote-MCP**: `npm install -g rednote-mcp`. MCP server with `search_notes` tool. Requires `rednote-mcp init` (opens browser, manual login, saves cookies to `~/.mcp/rednote/cookies.json`). ✅ MCP protocol tested.
- **Weibo via weibo-downloader-skill**: Pure Python, only `requests`. Visitor cookie system (no login needed, 365-day validity). `passport.weibo.com/visitor/genvisitor2` → `weibo.com/ajax/statuses/show?id=STATUS_ID`. ✅ Cookie acquisition tested. Search needs CDP (微博 search requires login), download doesn't.
- **全渠道 Skill**: [chubbyskills](https://github.com/chubbyguan/chubbyskills) (616 stars) — 13 skills for 抖音/B站/小红书/公众号/X/播客 collection.
- **通用下载器**: [res-downloader](https://github.com/putyy/res-downloader) (19K stars, GUI only) — supports 抖音/小红书/快手/视频号 but no CLI/API, not suitable for pipeline.
- **Pixabay logo**: Pixabay API terms require showing logo when search results are displayed. Only source with `logoRequired=true`.
- **Wikimedia per-file license**: Each file on Commons has its own license (CC-BY, CC-BY-SA, PD, etc.). `fetchWikimediaLicense()` queries the imageinfo API for `extmetadata.LicenseShortName`. The `dynamicAttribution` flag enables per-file license checking — CC-BY/CC-BY-SA set `attributionRequired=true` (shows in TikTok credits), PD/CC0 set `attributionRequired=false`. If the API doesn't set `AttributionRequired`, it's inferred from the license name string.

# Source-Chain 逐源审计报告（静态部分）— #309

> **Issue**: [#309](https://github.com/0xPabloLI/inside-china-ai/issues/309) · **日期**: 2026-09-15 · **Session-Id**: `20260915-fix-308-401670`（静态部分）/ `20260916-probe309-live`（live 探针 + 新闻契约实施，§F）
> **范围**: 静态逐源链路审计（62 源 × 两条契约 × fallback 层）+ live 探针（§F：Jina 配额/date、weibo yt-dlp 真实样本、引擎排序对比、video capability 14 源实测下载）。
> **方法**: 全读 `source-registry.mjs`（3557 行）+ 交叉核对 `search-sources.mjs` / `lib/search-pool.mjs` / `lib/progressive-search.mjs` / `lib/video-downloaders.mjs` / `lib/asset-sourcer.mjs`。每条结论带 file:line 锚点。

**实际计数（与预期核对）**：`ALL_SOURCES` = **62 源**：NEWS 12 + SELF_MEDIA 8 + INTERNATIONAL 10 + GENERAL 5 + LAST30DAYS 5 + WECHAT_ACCOUNT 1 + WECHAT_RSS 12 + TELEGRAM 1 + STOCK_MEDIA 8。articles-capable = 54（stock 8 个 `articleScript: ""` 为 falsy）。`capabilities.videos` = **14 源**（§E）。⚠️ `search-sources.mjs:19` 头注释仍写 "65 sources total"——文档漂移（§D-7）。

## 逐源审计表

链路列按 `collectFromSource`（search-sources.mjs:601）分层：apiSearch → CDP（同 URL 跳过）→ googleSiteFallback（显式或 #88 autogen）→ apiFallback（Bigsong，仅 x_search）→ pool（仅 `isPoolEligible`，search-pool.mjs:163-167 = `mcpFallback.toolName === "web_search"`）或专属 MCP。autogen site: 共 **13 源**（判据：有 articleScript、无 apiSearch/mcpFallback/apiFallback/显式 site:、不在 `AUTOGEN_EXCLUDED_SOURCES`（source-registry.mjs:3388））。

| # | Source | Access chain | Pool-eligible? | Main contract | Chain serves contract? | publishedAt | Videos/Images |
|---|--------|--------------|----------------|---------------|------------------------|-------------|---------------|
| 1 | qbitai | CDP → site:qbitai.com (autogen) | ❌ | news | ✅（CDP+site: 均无日期） | absent-CDP-DOM | videos✅(cdp) images✅(cdp) |
| 2 | jiqizhixin | CDP → site:jiqizhixin.com (autogen) | ❌ | news | ✅ | absent-CDP-DOM | videos✅ images✅ |
| 3 | 36kr | CDP → site:36kr.com (autogen) | ❌ | news | ✅ | absent-CDP-DOM | — |
| 4 | techcrunch | CDP → site:techcrunch.com (autogen) | ❌ | news | ✅ | absent-CDP-DOM | — |
| 5 | bloomberg | CDP → site:bloomberg.com (autogen) | ❌ | news | ✅（paywall 风险） | absent-CDP-DOM | — |
| 6 | guancha | CDP → site:guancha.cn (autogen) | ❌ | news | ✅ | absent-CDP-DOM | — |
| 7 | ithome | CDP → site:ithome.com (autogen) | ❌ | news | ✅ | absent-CDP-DOM | videos✅ images✅ |
| 8 | xinhua | CDP → site:news.cn (autogen) | ❌ | news | ✅ | absent-CDP-DOM | videos✅ images✅ |
| 9 | thepaper | CDP → site:thepaper.cn (autogen) | ❌ | news | ✅ | absent-CDP-DOM | videos✅ images✅ |
| 10 | leiphone | CDP → site:leiphone.com (autogen) | ❌ | news | ✅ | absent-CDP-DOM | videos✅ images✅ |
| 11 | zhidx | API (wp-json) → CDP | ❌ | news | ⚠️ API 层有日期，CDP 兜底层无日期且无 site:/pool 兜底 | have (API `p.date`) / absent-CDP | videos✅ images✅ |
| 12 | bing_news | CDP only（`AUTOGEN_EXCLUDED_SOURCES`） | ❌ | news | ✅（单层；URL 自带 7 日窗 `qft=interval"7"`） | absent-CDP-DOM | videos✅ images✅ |
| 13 | xhs | CDP (needsAuth) → site:xiaohongshu.com (autogen) | ❌ | material/dual | ⚠️ Google 对小红书索引差，site: 兜底接近恒空 | absent-CDP-DOM | — |
| 14 | sogou_weixin | CDP（captcha 风险）→ MCP (`search_wechat_articles`) | ❌（专属 MCP） | news | ✅ MCP 平台忠实 | absent-CDP-DOM | — |
| 15 | weibo_hot | API (60s.viki.moe) → CDP → MCP (`get_hot_search`) | ❌ | env-signal / fact-check | ✅ 热榜语义 | **absent（API parser 无 publishedAt）** | — |
| 16 | bilibili | CDP → MCP (`search_videos`) | ❌（专属 MCP） | material | ✅ MCP 返回视频，平台忠实 | absent-CDP-DOM | videos✅(ytdlp) |
| 17 | douyin | CDP (needsAuth) → site:douyin.com (autogen) | ❌ | material | ⚠️ site: 兜底**恒空**（Google 不索引抖音，#77 在案） | absent-CDP-DOM | —（下载走 selectStrategy→douyin-cdp） |
| 18 | tiktok_creator | API (ScrapeCreators, paidApi, 默认跳过) → CDP (Creator Center 首页, needsAuth) | ❌ | material | ⚠️ CDP 兜底是首页抓取非搜索（`supportsKeyword: true` 但 top-level `url` 忽略 keyword） | **absent（`create_time` 未映射）** | — |
| 19 | zhihu | CDP → site:zhihu.com (autogen) | ❌ | news/dual | ✅ | absent-CDP-DOM | — |
| 20 | x_search | CDP (needsAuth) → site:x.com (显式) → Bigsong apiFallback | ❌（#292 裁决排除） | fact-check / dual | ✅ 全链平台忠实 | **have（CDP DOM `time[datetime]`，唯一带日期的 CDP 源）** | — |
| 21 | youtube_search | CDP → **pool** → MCP (Grok web_search) | ✅（web_search） | **material** | ⚠️ pool/Grok 返回网页文章——素材契约要视频（裁决：改 site: 链） | dropped-at-pool | videos✅(ytdlp) |
| 22 | arxiv_search | API (Atom) → CDP → **pool** → MCP (Grok) | ✅ | research/material (papers) | ⚠️ pool 层返回通用网页文章非论文对象 | have (API) / **dropped-at-pool** | — |
| 23 | github_search | API → CDP → **pool** → MCP (Grok) | ✅ | research/material (repos) | ⚠️ 同上；**API parser 未映射 `pushed_at`** | **absent（API 层即无）** | — |
| 24 | threads_search | CDP（弱）→ **pool** → MCP (Grok，实际主力) | ✅ | dual | ⚠️ pool 返回通用文章非 Threads 帖；**无 Google 索引，site: 链不可用** | dropped-at-pool | — |
| 25 | datacube_ai | API (RSS) → CDP（excluded 不 autogen） | ❌ | news (env-signal) | ✅ | have (`<updated>`) | — |
| 26 | gnews | API (GNEWS_API_KEY) → CDP | ❌ | news | ⚠️ 缺 key 无运行时 gate，401 才落 CDP | have (API) / absent-CDP | — |
| 27 | core_search | API → CDP | ❌ | research (papers) | ✅ | have (API) / absent-CDP | — |
| 28 | openalex_search | API → CDP | ❌ | research (papers) | ✅ | have (API) / absent-CDP | — |
| 29 | currents | API (CURRENTS_API_KEY) → CDP | ❌ | news | ⚠️ 同 gnews | have (API) / absent-CDP | — |
| 30 | noozra_search | API → CDP | ❌ | news | ✅ | have (API) / absent-CDP | — |
| 31 | google_search | CDP (tbm=nws, qdr:w) → **pool** → MCP (Grok) | ✅ | news（通用发现） | ✅ pool 对通用发现源合法（裁决保留） | dropped-at-pool | videos✅ images✅ |
| 32 | baidu_search | CDP only | ❌ | news (zh) | ✅（单层） | absent-CDP-DOM | videos✅(cdp, tn=vsearch) images✅ |
| 33 | duckduckgo_search | CDP only（html 端点） | ❌ | news (通用发现) | ✅ | absent-CDP-DOM | — |
| 34 | searxng_search | API (localhost:8888 JSON) → CDP | ❌ | news (通用发现) | ✅ | have 但**常为空**（引擎多不带 publishedDate） | — |
| 35 | mcp_grok_search | **API（Bigsong searchX 直连，#307）**（url 为空，CDP 层 no-op） | ✅ | fact-check / 通用发现 | ❌ 不进 pool（#307 用户签字：独立源语义，pool 先行会埋掉 Grok 结果） | dropped-at-pool | — |
| 36 | reddit_search | API (.json) → CDP **跳过**（同 URL） | ❌ | news/discussion | ✅ 实际单层 API | have (`created_utc`) | — |
| 37 | hackernews_search | API (Algolia) → CDP **跳过**（同 URL） | ❌ | news | ✅ 实际单层 API | have (`created_at_i`) | — |
| 38 | polymarket_search | CDP only | ❌ | env-signal | ✅ | absent-CDP-DOM | — |
| 39 | digg_search | CDP only | ❌ | news | ✅ | absent-CDP-DOM | — |
| 40 | techmeme_search | CDP（**primary 即 Google site:techmeme.com**） | ❌ | news | ✅ site: 即主链（site: 推广先例） | absent-CDP-DOM | — |
| 41 | wechat_dongchabeating | CDP（Google 搜转载） | ❌ | env-signal (tracked-adjacent) | ✅ | absent-CDP-DOM | — |
| 42–53 | wechat2rss_geekpark / bytedance_tech / meituan_tech / jiqizhixin / zhinengyuan / qbitai / ai_cv / datawhale / tencent_tech / xiaomi_tech / alicloud_dev / alibaba_tech | API (RSS) → CDP **跳过**（同 URL） | ❌ | news (tracked-feed-context) | ✅ 实际单层 RSS | **have (`pubDate`，`parseWechatRss`)** | — |
| 54 | telegram_aipost | API (t.me/s/aipost HTML) → CDP **跳过**（同 URL） | ❌ | news (tracked-feed-context) | ✅ | have (`<time datetime>`) | — |
| 55 | pexels | API (PEXELS_API_KEY) | ❌ | material (images) | ✅ | N/A | images✅(api) |
| 56 | pexels-video | API (PEXELS_API_KEY) | ❌ | material (videos) | ✅ 直链 mp4 → direct-http | N/A | videos✅(api) |
| 57 | unsplash | API (UNSPLASH_ACCESS_KEY) | ❌ | material (images) | ✅ | N/A | images✅(api) |
| 58 | wikimedia | API (无 key) | ❌ | material (images) | ✅ | N/A | images✅(api) |
| 59 | coverr | API (COVERR_API_KEY) | ❌ | material (videos) | ✅ CDN mp4+token → direct-http | N/A | videos✅(api) |
| 60 | pixabay | API (PIXABAY_API_KEY) | ❌ | material (images) | ✅ | N/A | images✅(api) |
| 61 | brave_image | API (BRAVE_SEARCH_API_KEY) | ❌ | material (images, 版权未核) | ✅ | N/A | images✅(api) |
| 62 | searxng_image | API (localhost:8888) | ❌ | material (images, 版权未核) | ✅ | N/A | images✅(api) |

## A. site: 推广清单（pool 退出 + site: 保真链）

裁决：素材/研究源退出通用 pool，改走 site: 保真链（默认窗 `tbs=qdr:y`；news 角色可另配 `qdr:w`）。

> **✅ 已实施（2026-09-19，commit `4d30d46`）**：youtube/arxiv/github/bilibili/sogou_weixin（`site:mp.weixin.qq.com`——微信文章实体域）/tiktok_creator 六源显式 `googleSiteFallback`（共享 h3 脚本 + `SITE_FALLBACK_WINDOW=qdr:y`）；youtube/arxiv/github/threads 四源 Grok web_search fallback 退役（grilling 裁决 5），**pool-eligible 6→2**（google_search + mcp_grok_search）；threads 入 `AUTOGEN_EXCLUDED_SOURCES`（无 Google 索引，防 douyin 式死层），链止于 CDP——live 探针判定 CDP 层无登录墙、本就可用，弱因是旧脚本不提取 URL/日期（已重写：perma-link + `time[datetime]` + handle）。下表为开票时的建议清单，保留作决策依据。

| Source | 现状 | 建议 site: 域 | 默认窗 |
|---|---|---|---|
| `youtube_search` | pool-eligible，pool 返回网页文章与视频契约冲突 | `site:youtube.com` | `qdr:y` |
| `arxiv_search` | pool-eligible，pool 结果非论文对象 | `site:arxiv.org` | `qdr:y` |
| `github_search` | pool-eligible，pool 结果非 repo 对象 | `site:github.com` | `qdr:y` |
| `threads_search` | pool-eligible | **⚠️ 单列：无 Google 索引，site: 不可行**——需独立方案（Grok MCP 实为唯一有效层；是否保留 pool 待裁决） | — |
| `bilibili` | 非池；链 CDP→专属 MCP | `site:bilibili.com` 可作 MCP 前中间保真层（可选） | `qdr:y` |
| `xhs` / `douyin` | 已有 autogen site:，但 xhs 索引差、**douyin 恒空** | 素材化需显式评估替代（douyin 实际靠 CDP 登录搜索 + douyin-cdp 下载） | — |
| `zhihu` / `sogou_weixin` / `tiktok_creator` | zhihu 已有 autogen site:；后两者无 site: 层 | 视裁决决定是否补 | — |

Pool 保留对象（裁决后）：`google_search`、`mcp_grok_search`（+ 视 threads 裁决）。**pool-eligible 从 6 → 2**。（#307 实施后 **2 → 1**：mcp_grok_search 转 Bigsong 直连独立源、退出 pool——用户签字；google_search 是唯一 pool-eligible 源，链止于 pool。）

## B. publishedAt 缺口分层

**违反 fail-closed 新闻契约（API/RSS/pool 族缺日期映射）——需修：**
- `github_search`：API parser 无 `publishedAt`（GitHub API 自带 `pushed_at` 未映射）— source-registry.mjs:1155-1165
- `weibo_hot`：API parser 无 `publishedAt`（仅有 hot_value）— source-registry.mjs:536-551
- `tiktok_creator`：API parser 无 `publishedAt`（`aweme_info.create_time` 未映射）— source-registry.mjs:655-712
- **pool 族 6 源**：`toArticle`（search-pool.mjs:47-56）只保留 title/url/snippet，日期在 pool 层被丢弃；pool 引擎无 news 参数（Serper 无 `tbs`、Tavily 无 `topic:news`/`days`、Brave 无 `freshness`）
- `searxng_search`：映射 `r.publishedDate` 但 SearXNG JSON 常缺 → 实际经常为空

**CDP-DOM 降级（无日期断言，短期可接受）**：qbitai、jiqizhixin、36kr、techcrunch、bloomberg、guancha、ithome、xinhua、thepaper、leiphone、bing_news、xhs、sogou_weixin、bilibili、douyin、zhihu、threads_search、polymarket_search、digg_search、techmeme_search、baidu_search、duckduckgo_search、wechat_dongchabeating。注：`enrichWithMedia`（search-sources.mjs:160-243）已采 `article:published_time` 进 `metadata.publishedTime`，但**不提升为顶层 `publishedAt`**——现成的补齐入口。

**合格**：zhidx（API）、datacube_ai、gnews、core_search、openalex_search、currents、noozra_search、reddit_search、hackernews_search、wechat2rss×12、telegram_aipost、x_search。

## C. research "16 源" 核实（裁决执行的关键修正）

`groupSourcesByEvidenceRole`（search-sources.mjs:885-918）+ research 选择逻辑：

- **environmentalSignals 组 = 3 源**（非 16）：`weibo_hot`、`datacube_ai`、`wechat_dongchabeating`
- **trackedFeedContext 组 = 13 源**：12×`wechat2rss_*` + `telegram_aipost`
- **3 + 13 = 16**——裁决的"16 环境信号源"对应两个 background 组之和；严格语义下 environmental-signal 仅 3 源。
- **关键机制**：research 模式**只抓取** directEvidence (38) + trackedFeedContext (13) = 51 源；3 个 environmentalSignals **注册不抓取**（main 注释 "registered in the artifact as background only and never fetched here"）。**裁决落地 = 让 3 个 environmentalSignals 在 research 真实抓取**，其余 13 个已在抓。

## D. 异常清单

1. **CSE 死代码**：`searchGoogleCse`（search-pool.mjs:115-134）+ `GOOGLE_CSE_ID` 全仓零消费者——✅ 已随本审计删除（commit 见票）。
2. **weibo ↔ yt-dlp 白名单错位**：`selectStrategy`（video-downloaders.mjs:294）路由 weibo → ytdlp adapter（含 `WEIBO_COOKIE` 管线 :452-491），但 `SUPPORTED_YTDLP_PLATFORMS = new Set(["bilibili","youtube"])`（source-registry.mjs:3011）与 asset-sourcer 私有 gate `SUPPORTED_PLATFORMS`（asset-sourcer.mjs:1722）均不含 weibo。两 gate 管的是 yt-dlp **搜索**非下载（不炸）；且 registry 导出版**零生产消费者**（真 gate 是私有副本）——双份维护风险（#77 P2 在案）。`weibo_hot` 无 `capabilities.videos`，weibo 下载分支当前**无搜索入口可触达**。
3. **`collectFromBigsong` 的 searchXhs 死分支**：search-sources.mjs:451 `source.name === "xhs" ? searchXhs : searchX`——xhs apiFallback 已随 #213 退役，现仅 x_search 携带 apiFallback，`searchXhs` 分支生产不可达。
4. **死字段**：x_search `apiFallback.type` 无任何读取方（#77 在案）。
5. **过期注释**：SOURCE_ATTRIBUTIONS "R3: Keys match yt-dlp source names in capabilities.videos (xhs, weibo_hot)"（source-registry.mjs:3131 附近）——T2 已把 xhs/weibo_hot 移出 `YTDLP_VIDEO_CAPABILITIES`（:2994-2996），注释与代码矛盾。
6. **douyin autogen site: 恒空**：永不生效的 fallback 层（#77 在案，仍在）。
7. **文档漂移**：search-sources.mjs:19 头注释 "65 sources total"，实际 62。
8. **API key 无运行时 gate**：gnews/currents/tiktok_creator `authRequired: true`，但 `collectFromApi` 不预检 key，缺 key 直接 401 消耗一轮。
9. **tiktok_creator 关键词声明不实**：`supportsKeyword: true` 但 CDP 兜底层实际 homepage-only。
10. **progressive-search 游离引擎**：Tier 3 的 `google_images`/`bing_images`/`duckduckgo_images`/`tavily_images` 不在 registry（`IMAGE_SEARCH_ENGINES` 独立维护，progressive-search.mjs:690-738）——#77 P2 在案。
11. **新闻窗先例**：bing_news URL 自带 7 日窗（`qft=interval"7"`）、google_search `tbs=qdr:w`——全仓唯二自带新闻窗的 CDP 源；pool/API 加 news 参数可循此先例。

## E. video capability 14 源清单

| Source | method | 声明的下载路径 |
|---|---|---|
| `bilibili` | ytdlp (platform: bilibili, :2995-2998) | `searchYtdlp`（bilisearch:，gate asset-sourcer.mjs:1722）→ `downloadYtdlpAdapter`（--cookies-from-browser firefox, ≤720p, 8s 截段, 20M 上限） |
| `youtube_search` | ytdlp (platform: youtube, :3003-3006) | `ytsearch10:` → 同上 |
| `baidu_search` | cdp（`tn=vsearch` 垂直页, #249） | `searchCdpVideoSource`（共享 `CDP_VIDEO_SCRIPT`）→ `normalizeCdpVideoCandidates` → bilibili/youtube embed 转 watch URL → selectStrategy ytdlp；直链 mp4 → direct-http |
| `qbitai` / `ithome` / `jiqizhixin` / `google_search` / `bing_news` / `xinhua` / `thepaper` / `leiphone` / `zhidx` | cdp | 同上 |
| `pexels-video` | api (PEXELS_API_KEY) | 直链 mp4 → `downloadDirectHttp` |
| `coverr` | api (COVERR_API_KEY) | CDN mp4+token → `downloadDirectHttp` |

CDP 10 源共享 `CDP_VIDEO_SCRIPT`（self-hosted `<video>` + bilibili/youtube embed，:2745-2770 附近），候选归一为 bilibili/youtube/direct 三类，下载收敛到 `selectStrategy`（video-downloaders.mjs:281）。live "能不能真拿到" 验证另行执行。

---

## F. Live 探针结果（2026-09-16，#309 执行轮）

探针脚本留档 `scripts/short-video/output/probe-309/`（gitignored）：`probe-engines.mjs`（引擎对比 + Jina）、`probe-video.mjs`（14 源实测）、`probe-weibo.mjs`（weibo 下载）、原始 JSON 与本文档同目录同名。

### F.1 探针 1 — 引擎新闻参数对比（3 关键词 × 3 引擎，同查询集）

| 引擎 | news 参数 | 结果/词 | 日期字段覆盖 | 质量判读 |
|---|---|---|---|---|
| Serper | `tbs=qdr:w` | 9 | **100%**（`date`，相对串 "1 day ago"） | 混合：Reuters/AlJazeera 新闻 + YouTube/reddit/文档页 |
| Tavily | `topic:news` + `days:7` | 9 | **100%**（`published_date`，RFC2822） | **最好**：VentureBeat/Register/SCMP/NPR/36kr 全新闻 |
| Brave | `freshness=pw` | 19–20 | **100%**（`page_age` ISO + `age` 相对） | 混合：题材词命中 NYT/SCMP；产品词（"Qwen"）混 Wikipedia/文档/市场页 |

**参数映射定案**：三引擎参数全部启用；引擎优先级不变（配额经济：Serper 2500 > Brave 2000 > Tavily 1000 /月）；日期在 pool `toArticle` 归一化 ISO（相对串/RFCC2822/month-name 全支持，不可解析 → 无 publishedAt，fail-closed 下游丢弃）。

**网络环境发现（推翻 #281 结论）**：Brave 从本机 **Node fetch 直连再次失败**——DNS 污染复发（`api.search.brave.com` → 66.220.147.11、`s.jina.ai` → 31.13.95.33，均 Facebook 网段污染记录），curl 直连同样 HTTP 000；**走本地代理（127.0.0.1:7897）恢复**。#281 的"未复现"结论只代表当时；pool 的 Brave/Jina 链路在本机需要代理路由（`search-pool.mjs` 头注的已知环境约束条款继续有效）。

### F.2 探针 2 — Jina s.jina.ai 实测（判决输入）

- **date 字段：存在但仅 62.5%**（8 条中 5 条），且格式模糊（"8 days ago" / "Aug 9, 2025" / "1 year ago"）——不满足 fail-closed 新闻契约的每条必有日期。
- **配额经济学：单次 `x-usage-tokens: 58958`**（约烧掉 1M/月免费配额的 ~6%）——作为第 4 备胎引擎成本过高。
- 质量差：返回博客索引页（"DeepSeek AI Blog (2026)"）与一年旧文，无新闻垂直。
- **判决（按裁决框架）**：Jina **退出 fail-closed 新闻链**（news 模式跳过，attempts 留 `fail-closed` 记录）；通用链保留原位。已实施（`newsCapable: false`）。

### F.3 探针 3 — weibo yt-dlp 真实样本（复测成功）

- 样本：weibo 首页 feed 实抓 4 条真实帖 URL（CDP 代理，登录态正常）。
- 首测：**4/4 失败**——`ERROR: [Weibo] ...: Failed to parse JSON (JSONDecodeError)`（extractor 的 JSON metadata 步骤拿到非 JSON，登录墙/验证页 HTML；firefox 524 cookies 不够）。
- **复测（用户授权从 Chrome 会话取 cookie）**：`WEIBO_COOKIE` env 通道仍未行使；改走 `--cookies-from-browser chrome`（Keychain 静默授权，978 cookies 解出）→ 登录墙破（JSON metadata 正常返回）。随后仍 `No video formats found`——根因是**选样**：随手抓的 feed 帖在 `ajax/statuses/show` 响应里没有 `page_info.media_info.playback_list`（非视频帖）。CDP 在登录页上下文对 6 个候选逐一 fetch 验证，锁定真视频帖 `Ri5ajjFK0` → **live-fire 下载成功：517,603 bytes / 8.00s mp4**（证据归档 `scripts/short-video/experiments/probe-309/weibo/weibo-livefire.mp4`，gitignored）。
- **判决：路由成，可进白名单**，条件：(1) 有效 cookie 源——Chrome cookie 通道已实证，或完整 `WEIBO_COOKIE`（注意页面 `document.cookie` 拿不到 HttpOnly 的 `SUB`，env 通道需从 DevTools 请求头复制完整 Cookie 串）；(2) 选样前置视频判定（`playback_list` 存在性），weibo extractor 对非视频帖只报 `No video formats found`，不区分"非视频"与"不可下"。
- 附带发现：**weibo_hot 主 API（60s.viki.moe）全程 429**（直连 + 代理都限流）——该源 API 层当前不可用，#140 P5 的"第三方生存风险"注释应验。

### F.4 探针 4 — video capability 14 源逐源实测（验收：拿到 ≠ 搜到）

**2/14 拿到**。逐源：

| 源 | 结果 | 证据/根因 |
|---|---|---|
| `baidu_search` | ✅ 拿到 | CDP `tn=vsearch` 真视频垂直页 → bdstatic 直链 mp4（2.3MB）。**唯一下单层即视频垂直的 CDP 源** |
| `pexels-video` | ✅ 拿到 | API 10 候选 → 1080p mp4（53MB）。⚠️ 超 20M cap——管线直连路径（`downloadDirectHttp` 的 `exceeds-size-limit`）会 skip；探针用无 cap 的 `downloadAsset` 才落盘 |
| `bilibili` | ❌→✅* | 直连 **SSL EOF**（网络层，yt-dlp→bilibili 被掐）；`--proxy 7897` 后 **搜索+下载全通**（8s mp4 143KB）——能力成立，本机路由问题。管线 execSync 无代理配置，当前环境实际拿不到。**后记（同日稍后）**：代理出口触发 bilibili 搜索限流（HTTP 412；直连亦然、yt-dlp 2026.07.04↔2026.08.19 无差、cookie 与否无差）——探测频次触发的临时反爬，非升级回归；管线 bilisearch 低频直连不受影响，冷却即恢复。**yt-dlp 2026.08.19 已于 2026-09-19 验证通过**（真实 bilisearch 输出过真实 parser：tab 分隔/标题/时长全对；weibo live-fire 本就在 08.19 上跑通）——pin 从 2026.07.04 升至 2026.08.19。另：**持久 412 退避 guard 已落地**（`lib/ytdlp-guard.mjs`：指数 1h→24h + 状态落盘跨 session + 浏览器 UA，commits `319dd8c`/`78a7952`） |
| `youtube_search` | ❌ | `ytsearch10` 搜到 10 条，下载全部 **bot-check**（"Sign in to confirm you're not a bot"；`--cookies-from-browser firefox` 的 cookies 无效/无 YouTube 登录态） |
| 其余 9 个 CDP 新闻源（qbitai/jiqizhixin/ithome/xinhua/thepaper/leiphone/zhidx/bing_news/google_search） | ❌ 0 候选 | **结构性弱项**：`CDP_VIDEO_SCRIPT` 扫**搜索结果页**本身的自托管 `<video>` + B站/YT embed——新闻站搜索页不嵌播放器（视频在文章页内）；qbitai 的 video URL 甚至只是**首页**（手动验证：0 video / 0 iframe）。唯 baidu（真视频垂直）例外 |
| `coverr` | ❌ | 搜索 API 活着（`query=technology` 27 页）但 **DeepSeek 0 库存**（题材词问题非链路问题）；**下载链漂移**：`data.params.userToken` 现为字符串非对象（parser 取不到 token）且旧 CDN URL `cdn.coverr.co/videos/{base}/mp4?token=` 对正确 token 也 404——hit 内 `playback_id` 表明已迁 Mux 托管（`stream.mux.com` 直链 403/404，需签名）→ **需要修 parser + 换下载模式，建议另开小票** |

**结论**：`capabilities.videos` 的声明与实得差距大——CDP 10 源中 9 个的"视频能力"实为"搜索页偶见 embed"，架构上不满足素材契约的定向获取；真正可靠的拿到路径 = baidu vsearch（垂直页）、pexels（API）、bilibili（需代理路由修复）。site: 推广与素材库体系（#310）设计时应以此为基线。

### F.5 新闻契约最短路径实施（本轮 commit）

- **三个 parser 映射**：`github_search.pushed_at`（raw ISO）、`tiktok_creator.create_time`（unix 秒 → ISO）、`weibo_hot`（fetch 时间戳——热榜语义：条目有效期 = 在榜时间）。
- **pool `toArticle` 日期保留**：`normalizePublishedDate`（相对串/ISO/RFC2822/month-name → ISO；不可解析 → 省略字段）；`parseArticles` 采集 `published_date`/`page_age`/`date`/`age`。
- **引擎 news 参数**：`opts.news`（`true` → 7 天默认；`{days:N}` 显式窗口；bucket 1→d/pd、7→w/pw、30→m/pm、else→y/py）→ Serper `tbs` / Brave `freshness` / Tavily `topic:news`+`days`；Jina `newsCapable: false` news 模式跳过（F.2 判决）。
- **接线**：`search-sources.mjs` pool 调用传 `{ news: { days: 7 } }`（裁决默认窗；空结果照旧落 Grok MCP 兜底）。
- **验证**：TDD red 17 → green；受影响 8 测试文件 326/326 + 关联 6 文件 434/434 全绿（vitest）；改动文件 eslint 清零（`search-sources.mjs:328` 一处 prettier 报错属 #308 既有代码，不动）。

### F.6 site: 推广实施 + threads 判决 + CDP-DOM 日期两档制（2026-09-19，commit `bc34f67`）

- **site: 推广**（§A 清单 + 用户"全部补齐"裁决）：六源显式 `googleSiteFallback`（`makeGoogleSiteFallback(domain)` 工厂 + `SITE_FALLBACK_WINDOW="qdr:y"` + 共享 h3 脚本）。域选定注：sogou_weixin 取 `site:mp.weixin.qq.com`（微信文章实体域，源自身 articleScript 亦过滤 `mp.weixin` 链接），非 sogou.com；tiktok_creator 由此首次获得真实关键词层（CDP 层是忽略关键词的 Creator Center 首页，§D9）。
- **Grok fallback 退役 + pool 收缩**：youtube/arxiv/github/threads 四源 `mcpFallback`（web_search）删除——pool/Grok 返回网页文章，违反素材契约（grilling 裁决 5）。**pool-eligible 6→2**（google_search + mcp_grok_search）；"仅 x_search 携带 apiFallback"不变量不变。
- **threads 判决**（用户 2026-09-19："fallback 到其他 search 没有意义……你要看清楚它为什么不可用"）：live 探针（threads.net 搜索页 ×2 关键词）判定——**无登录墙、无 anti-bot、页面正常渲染**，"CDP 弱"的根因是旧 articleScript 不提取 URL（恒空）与日期；已重写为 perma-link（`a[href*="/post/"]`，quoted-post 去重）+ `time[datetime]` ISO + handle（自 perma-link 解析，DOM 锚点序不可靠）。链止于 CDP（无 Google 索引，入 `AUTOGEN_EXCLUDED_SOURCES` 防 douyin 式死层）；`mcpFallback` 删除。smoke：20 条全带 permalink + ISO 日期。相关性观察：Threads 搜索对冷词返回近期热门贴（非严格匹配）——按 #286 裁决归 Stage 1 语义层，不在此修。
- **CDP-DOM 日期两档制落地**（`search-sources.mjs` `applyCdpPostGuards` = relevance guard → `markCdpDomDateSemantics`，两处 CDP 结果统一走此组合）：articleScript 日期不动（x_search/threads 真实 DOM 断言）→ og-meta `article:published_time`（enrichWithMedia 已采）经 `normalizePublishedDate` 提升为顶层 `publishedAt`（页面自 assert 的真实日期，审计 §B"现成的补齐入口"）→ 仍无日期打 `dateDegraded: true`（fail-closed 不造日期，"不参与时效断言"显式化）。
- **验证**：TDD red 8 → green；受影响 4 测试文件 215/215 + 全量 3919/3919（rate-limiter 计时用例为套件负载下墙钟 flake，隔离重跑绿）+ eslint 清零；live smoke 双通过（threads 20 条/permalink/日期；`site:youtube.com` qdr:y 命中 9/9 真实视频 URL，同 x_search smoke 先例量级）。code-review 双轴无阻塞 finding；采纳 3 项小修（fallback 工厂收敛、post-guard 组合去双写、threads publishedAt 条件输出）。
- **#309 剩余**（本票保持 open）：research 模式让 3 个 environmentalSignals（weibo_hot/datacube_ai/wechat_dongchabeating）真实抓取（§C 裁决项，未实施）；#307 已交付（§F.7）；#285 依串行规则随后。

### F.7 Grok MCP 桥退役——Bigsong 直连 + 显式 pool 资格（2026-09-19，commit `2f97be9`，#307 闭票）

- **mcp_grok_search 转直连**：`mcpFallback`（mcp-search-bridge 子进程）→ `apiFallback`（`searchX` 纯 HTTP，同 grok-chat-fast 上游/env，#90 模式第二例）。查询模板入 registry per-source 字段 `promptTemplate.buildQuery`（grilling 裁决 3 四要素：显式 7 天窗 + 强制日期输出 + 排除 Wikipedia/评测站 + 去 China-AI 限定），插值在 `collectFromBigsong`（`today` 由调用方注入）；x_search 保持裸关键词（平台查询即关键词）。accessMethod 改 `primary: "api"`。
- **google_search Grok 退役**（裁决 5 同逻辑 + 用户同日质疑「Grok 不需要都做 fallback」）：`mcpFallback` 删除，链止于 REST pool；入 `AUTOGEN_EXCLUDED_SOURCES`（search engine 无自有域）。
- **pool 资格显式化**：`isPoolEligible` 改读显式 `poolEligible: true` 声明（cap 优先），`mcpFallback.toolName === "web_search"` 派生删除——两机制解耦（#292 派生的存在前提 = 桥本身，已退役）。pool 门从 mcpFallback 分支内提升为独立链层：apiFallback → pool → 专属 MCP。**mcp_grok_search 不进 pool 经用户签字**（OQ3 六源配额经济学前提消失；pool 先行会让 Grok 结果几乎总被 Serper 埋掉）。终态：apiFallback 载体 = x_search + mcp_grok_search；pool-eligible = google_search 仅一源。
- **常量清理**：`MCP_SEARCH_BRIDGE_SERVER`/`NODE_BIN` 移除（零消费者）；`mcp-client.mjs` 保留（头注例外条款：Bigsong 支持 toolcall 时 tools/call 派发重新有用）。
- **验证**：TDD red 15 正中目标 → green；受影响 4 测试文件 222/222 + 全量 3926 绿 + eslint 清零；code-review 双轴（baseline `27f584a`）Standards 4 判断 + Spec 无阻塞，采纳 4 项修复（CONTEXT.md Collection Layer 定义同步、isPoolEligible 双 JSDoc 去叠、Step 3.5 注释引用组合测试、链序测试绑定真实源命名）。
- **运行时观察**（smoke，2026-09-19）：Bigsong live-search 上游对新旧查询一律 90s+ 超时（纯 chat 4.2s 正常）——上游降级，与本次改动无关（MCP 桥同受累）；fail-closed 语义返回空数组。复测建议随 #281 类引擎复测轮进行。

---

**Coverage: 62/62 sources classified**（链路、契约、pool 资格、publishedAt、media caps 五列全填；pool-eligible 实测 6→**#309 后 2**→**#307 后 1**（google_search）、videos 声明 14、环境信号严格 3 + tracked-feed 13 = 16）。

# Source-Chain 逐源审计报告（静态部分）— #309

> **Issue**: [#309](https://github.com/0xPabloLI/inside-china-ai/issues/309) · **日期**: 2026-09-15 · **Session-Id**: `20260915-fix-308-401670`
> **范围**: 静态逐源链路审计（62 源 × 两条契约 × fallback 层）。live 探针（Jina 配额/date、weibo yt-dlp 真实样本、引擎排序对比、video capability 实测下载）另行执行后补挂票。
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
| 35 | mcp_grok_search | MCP only（url 为空，CDP 层 no-op） | ✅ | fact-check / 通用发现 | ✅（#307：Grok 独立源，fallback 退役待执行） | dropped-at-pool | — |
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

| Source | 现状 | 建议 site: 域 | 默认窗 |
|---|---|---|---|
| `youtube_search` | pool-eligible，pool 返回网页文章与视频契约冲突 | `site:youtube.com` | `qdr:y` |
| `arxiv_search` | pool-eligible，pool 结果非论文对象 | `site:arxiv.org` | `qdr:y` |
| `github_search` | pool-eligible，pool 结果非 repo 对象 | `site:github.com` | `qdr:y` |
| `threads_search` | pool-eligible | **⚠️ 单列：无 Google 索引，site: 不可行**——需独立方案（Grok MCP 实为唯一有效层；是否保留 pool 待裁决） | — |
| `bilibili` | 非池；链 CDP→专属 MCP | `site:bilibili.com` 可作 MCP 前中间保真层（可选） | `qdr:y` |
| `xhs` / `douyin` | 已有 autogen site:，但 xhs 索引差、**douyin 恒空** | 素材化需显式评估替代（douyin 实际靠 CDP 登录搜索 + douyin-cdp 下载） | — |
| `zhihu` / `sogou_weixin` / `tiktok_creator` | zhihu 已有 autogen site:；后两者无 site: 层 | 视裁决决定是否补 | — |

Pool 保留对象（裁决后）：`google_search`、`mcp_grok_search`（+ 视 threads 裁决）。**pool-eligible 从 6 → 2**。

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

**Coverage: 62/62 sources classified**（链路、契约、pool 资格、publishedAt、media caps 五列全填；pool-eligible 实测 6、videos 声明 14、环境信号严格 3 + tracked-feed 13 = 16）。

# Source Capabilities 标注审计（Issue #77）

> 审计日期：2026-09-06（第十八 session）。审计对象：`scripts/short-video/lib/source-registry.mjs`（64 源）+ 消费方 `scripts/short-video/search-sources.mjs`、`lib/asset-sourcer.mjs`、`lib/progressive-search.mjs`。结论供 #75（capabilities.videos 补录 + 下载器集成）做基线。
>
> 前身：`docs/reviews/source-registry-capability-audit-2026-08-19.md`（#77 首轮审计，59 源、#67 schema 落地前时代）。该轮的 P0（xhs/douyin/weibo_hot ytdlp 误标）与 P1（google_news/bing_news 图片混入文本候选）已在此后修复；本轮为 schema 落地 + #92/#65 增源后的全面复核，覆盖面取代旧报告。

## 0. 总体结论

- **capabilities 体系与三个消费方基本对齐**：articles 由 `enrichWithCapabilities()` 统一推导（source-registry.mjs:3393-3448）、stock 源显式声明、CDP/YTDLP 映射合并注入；文章链（collectFromSource 六层）、图片链（asset-sourcer CDP_SOURCES + prog-search 引擎池）、视频链（CDP_VIDEO_SOURCES + ytdlp + stock API）均有真实消费路径。
- **yt-dlp 白名单与 videos 标注当前一致**：`YTDLP_VIDEO_CAPABILITIES`（source-registry.mjs:2904-2919，bilibili/youtube_search）= `SUPPORTED_YTDLP_PLATFORMS`（:2921）= asset-sourcer 私有 gate（asset-sourcer.mjs:1667）；xhs/douyin/weibo_hot 的误标已按 T2 移除，无残留。
- **发现 11 个标注/实现不一致疑点**（下文 §2），其中 1 个实质矛盾（baidu_news 缺 CDP 媒体 entry）、3 个 drift 风险、其余为死字段/名义能力。
- **video capability 调研定论**（§4）：#75 应补录的 videos 标注 = baidu_news（随疑点 1 修复）+ xhs/douyin/weibo_hot（随下载器集成一起）+ tiktok_creator（待查 API）；36kr/guancha 经 live 抽样**不建议标注**；其余 44 个 articles-only 源全部给出不标注依据。

## 1. 全源盘点（64 源）

能力覆盖统计（脚本枚举 `ALL_SOURCES` 实测）：

| 能力 | 源数 | 明细 |
| --- | --- | --- |
| articles | 56 | method=api 20 / cdp 33 / mcp 1（mcp_grok_search）+ wechat2rss 11 为 tracked-feed-context |
| images | 16 | cdp 10（qbitai/jiqizhixin/ithome/xinhua/thepaper/leiphone/xinzhiyuan/zhidx/google_news/bing_news）+ api 6（pexels/unsplash/wikimedia/pixabay/brave_image/searxng_image） |
| videos | 14 | cdp 10（同上新闻源，共享 `CDP_VIDEO_SCRIPT` source-registry.mjs:2548）+ ytdlp 2（bilibili/youtube_search）+ api 2（pexels-video/coverr） |
| articles 但无 videos | 44 | 明细见 §4 调研表 |

fallback 链覆盖（apiSearch → googleSiteFallback → apiFallback(Bigsong) → search pool → mcpFallback 的配置面）：

- **17 源零 fallback**。其中 8 个 stock/media 源（pexels/pexels-video/unsplash/wikimedia/coverr/pixabay/brave_image/searxng_image）由 asset-sourcer 直接 API 消费、不走文章链，无 fallback 是设计内。
- **9 个文章源零 fallback**：google_news、bing_news、baidu_news、baidu_search、duckduckgo_search、polymarket_search、digg_search、techmeme_search、wechat_dongchabeating。这 9 个正是 `AUTOGEN_EXCLUDED_SOURCES`（source-registry.mjs:3308）的显式排除对象——设计意图是聚合器自身即搜索兜底页。**observation 而非 bug**：CDP 主路径失败时这些源静默计入 failedSources，无二次机会；若未来某聚合器反爬升级，只能整源失效。
- 其余 47 源均有 ≥1 层 fallback；autogen googleSiteFallback 实收 13 源（source-registry.mjs:3348-3391）。

## 2. 疑点清单（标注 vs 实现）

按严重度排序；行号以 2026-09-06 HEAD（96d8ff3）为准。

### P1 — 实质矛盾

**疑点 1：baidu_news 缺 CDP 媒体能力 entry（三处自相矛盾）**
- 区块注释声称「These sources have CDP_MEDIA_CAPABILITIES entries」（source-registry.mjs:317-319）；
- baidu_news 的 accessMethod.notes 写「Articles + images from same DOM」（:511-513），articleScript 实际提取 `imageUrl`（:524-540）；
- 但 `CDP_MEDIA_CAPABILITIES`（:2569-2897）无 `baidu_news` key → enrich 后无 images/videos 能力 → asset-sourcer 的 CDP_SOURCES/CDP_VIDEO_SOURCES 不收录它。
- **建议**：#75 补录 videos 标注时一并补 entry（images + videos 同 DOM）。**修复归 #75**。

### P2 — drift 风险

**疑点 2：yt-dlp 白名单双份维护**
`SUPPORTED_YTDLP_PLATFORMS`（source-registry.mjs:2921，导出）零生产消费者；真正的 gate 在 asset-sourcer.mjs:1667 私有 `SUPPORTED_PLATFORMS`。当前一致，但新增 ytdlp 平台时改一处漏一处即产生误标回归（本票的 P4 修复对象正是上一轮这种漂移）。

**疑点 3：AUTOGEN_EXCLUDED_SOURCES 拼写错误**
`"pexels_video"`（source-registry.mjs:3321）实际源名为 `"pexels-video"`（:2270）。当前无影响（stock 源 articleScript 为空、enrich 已跳过），但属死条目——若未来 stock 源获得 articleScript，该排除会静默失效。

**疑点 4：图片引擎池游离于 registry 之外**
prog-search `IMAGE_SEARCH_ENGINES`（progressive-search.mjs:635-681）含 google_images/bing_images/duckduckgo_images/tavily_images 四个引擎，registry 无对应条目；brave_image/searxng_image 则 registry（:2460-2536）与引擎池（:637-655）**双份定义**，靠名字人工对齐。#75 若动图片能力，这是 schema 收口的候选。

### P3 — 死字段 / 名义能力 / 风格

5. **articles 级 `requiresApiKey`/`apiKeyEnv` 为准死字段**：enrich 写入（source-registry.mjs:3417-3418，经 `API_KEY_ENV_MAP` :3276），生产零消费者（仅测试）。且 `apiSearch.authRequired` 纯声明性——`collectFromApi`（search-sources.mjs:266-300）不检查 key 存在性，gnews/currents 的 key 缺失时带空 `apikey=` 发请求吃 401 而非提前 skip。
6. **mcp_grok_search 名义 articles 能力**：`url: () => ""` + `articleScript: "return [];"`（source-registry.mjs:1793-1795）→ collectFromSource 的 CDP 步骤每次对空 URL 空跑一轮才落 pool/mcpFallback（search-sources.mjs:403-410 无空 URL 短路）。轻微浪费，非错误。
7. **douyin 的 autogen `site:douyin.com` fallback 大概率恒空**：Google 对抖音收录极差，且 douyin needsAuth=true 主路径常被登录墙挡。
8. **searxng_search 两处静态绑定**：apiSearch 硬编码追加 `" China AI"`（source-registry.mjs:1748-1749）、articleScript 绑 SearXNG simple theme 选择器（:1766-1780）。已知设计决策（#92），记录在案。
9. **wechat2rss 空 articleScript**（:2131）：行为正确——`shouldSkipCdpOnApiFail`（search-sources.mjs:369-386）因 API/CDP 同 URL 跳过空跑；但破坏「有 articleScript ⇒ 可 CDP 抓文章」的通用假设，enrich 推导逻辑的隐式特例。
10. **locale 标注不一致**：约半数源无 `locale` 字段。唯一功能消费者是 ytdlp 源的中文关键词路由（asset-sourcer），其余纯风格。不修。
11. **x_search `apiFallback.type` 死字段**：`collectFromBigsong` 只消费 `resultMapper`；xhs 显式 `model: "dots-chat"` 而 x_search 依赖 SEARCH_MODEL 默认值，行为正确但不对称。

## 3. Fallback 链实现核验

`collectFromSource`（search-sources.mjs:389-473）实际链序与 registry 头注释（source-registry.mjs:34-39）一致：

```
apiSearch → CDP（shouldSkipCdpOnApiFail 同 URL 短路）→ googleSiteFallback
  → apiFallback(Bigsong) → search pool（仅 pool-eligible 通用 web_search 源）→ mcpFallback
```

- 每层仅在上一层 0 结果时触发，无「失败即静默丢弃」的已配置层（配置了就会被走）。
- pool 与 mcpFallback 的分支正确：pool 空结果才落 Grok 桥（:438-455），平台专用 MCP 不进 pool。
- **实现核验发现 2 个链级疑点**（并入上 §2 疑点 5/6）：authRequired 无运行时 gate（层 0 的 401 浪费一次网络往返）；mcp_grok_search 空 URL 空跑 CDP。

## 4. Video Capability 调研（#77 → #75 交接基线）

44 个 articles-only 源逐一定论。**标注原则**：标了 `capabilities.videos` 的源会被 asset-sourcer 的 CDP_VIDEO_SOURCES/搜索分配直接消费——「应不应该标」以「标注后管线能实际产出可用视频」为准，不以「页面理论上可能有视频」为准。

### 4.1 应补录（#75 工作清单）

| 源 | 建议标注 | 前置条件 | 依据 |
| --- | --- | --- | --- |
| baidu_news | images:cdp + videos:cdp（补 CDP_MEDIA_CAPABILITIES entry） | 无——实现侧已就绪（CDP_VIDEO_SCRIPT 共享脚本） | 疑点 1 三处自相矛盾；notes 自声明 images from same DOM |
| xhs / douyin / weibo_hot | videos（method 待定：cdp 或 api） | **与下载器集成绑定**（RedNote-MCP / chubbyskills / weibo-downloader，#75 主体） | 内嵌视频概率高；但 CDP_VIDEO_SCRIPT 抽 `<video>` 标签对登录墙+懒加载平台基本无效，标注必须在下载器可用后同步落地，避免重蹈 P4 误标 |
| tiktok_creator | videos:api（待确认） | 查 ScrapeCreators API 响应是否含 video 字段（paidApi，付费配额） | issue 高优先级表遗留项 |

### 4.2 不标注（live 抽样定论）

| 源 | 证据 | 结论 |
| --- | --- | --- |
| **guancha** | live 抽样 4 篇 2026-09 文章页（/politics/2026_09_*）：`<video>` 0、`.mp4` 0、bilibili 0 | 文章页无内嵌视频，**不标注** |
| **36kr** | live 抽样文章页（/p/3969755274883328）无 video 标记；视频内容在独立频道页（information/video），不在普通文章 DOM | **不标注**；如未来要视频，走频道页新 script 而非复用 CDP_VIDEO_SCRIPT |

### 4.3 不标注（结构性依据）

| 组 | 源 | 依据 |
| --- | --- | --- |
| 聚合搜索 | google_search、baidu_search、duckduckgo_search、google_news、bing_news、mcp_grok_search、searxng_search | 聚合链接跳转目标页，本身无视频载荷；issue 低优先级表定论沿用 |
| 学术/代码 | arxiv_search、github_search、core_search、openalex_search | 无视频 |
| 社交（不可靠） | x_search、threads_search、reddit_search、hackernews_search | 偶有视频但不可稳定提取；issue 定论「暂不标注」沿用 |
| 新闻 API | gnews、currents、noozra_search、datacube_ai | GNews/Currents API schema 无视频字段（公开文档）；datacube_ai/noozra 未查证 API schema，低置信——若 #75 想覆盖，先查响应字段再标 |
| WeChat RSS | wechat2rss_*（11 源） | RSS 载荷无视频；文章内嵌腾讯视频 iframe 需 mp.weixin 二次抓取，属新能力而非标注 |
| 英文付费墙 | techcrunch、bloomberg | 不在 #75 国内平台范围；bloomberg 付费墙（#85 另案） |
| 其他 | zhihu、sogou_weixin、wechat_dongchabeating、polymarket_search、digg_search、techmeme_search | 文章型/聚合型，无稳定视频载荷；zhihu 视频在独立回答/视频页，复用文章 script 无效 |

## 5. 测试覆盖盘点

**已有**（`scripts/short-video/__tests__/`）：
- schema presence 全量守卫（source-registry-capabilities.test.mjs:26-58）+ articles.method == accessMethod.primary（:397-400）；
- CDP_VIDEO_SOURCES ≥10 回归 + bilibili 不在其中（asset-sourcer.test.mjs:2596-2607）；
- ytdlp 白名单守卫（T2 交付）、evidence 分组、skip-cdp 同 URL 短路（search-sources-skip-cdp.test.mjs）。

**缺口**（issue §4 要求 vs 现状）：
1. **collectFromSource 全链降级行为无集成测试**：六层顺序与短路逻辑（googleSiteFallback 构造合成 source、pool 空结果才落 mcp、useCleanTitle 后置）零直接覆盖，仅 skip-cdp 单点被测。mock 各层 collector 的顺序断言测试是最有价值的补测。
2. **CDP_MEDIA_CAPABILITIES 完整性守卫缺失**：「notes 声称 images/videos from same DOM 的源必须有 entry」这类断言可直接拦住疑点 1——审计即证明其缺位。
3. **无 fallback 文章源显式清单测试**：9 源零 fallback 是设计内，但无测试锁定清单——未来新增源若意外落入零 fallback 组不会被发现。

补测实施归 #75 或独立小票（本票为审计，不改代码）。

## 6. 交接 #75 的行动清单

1. baidu_news 补 CDP_MEDIA_CAPABILITIES entry（images+videos）；
2. xhs/douyin/weibo_hot videos 标注与各自下载器集成同 PR 落地（method 按下载器实际形态定：MCP→api、CDP 网页→cdp）；
3. tiktok_creator 先查 ScrapeCreators video 字段再决定标注；
4. 顺手项：`pexels_video` typo（疑点 3）、yt-dlp 白名单单一事实源（疑点 2，可让 registry 导出被 asset-sourcer 消费或删导出）、mcp_grok_search 空 URL 短路（疑点 6）；
5. 图片引擎池收口（疑点 4）建议单独立票，不塞进 #75。

## 相关

- Issue #75（实现方）、#67（schema）、#76（SSOT 审计）、#88 Part 2（googleSiteFallback autogen）
- ADR-0013（三层采集架构）、ADR-0016（级联过滤）
- P4 误标修复（xhs/douyin/weibo_hot videos 移除）为本票直接前身

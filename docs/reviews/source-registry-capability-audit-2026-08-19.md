# Source Registry Capability 标注核查报告

**核查时间：** 2026-08-19（GMT+8）  
**范围：** `scripts/short-video/lib/source-registry.mjs` 运行时导出的全部 **59 个信源**。  
**结论：** **并非全部正确。** 注册表能够完整加载，基础结构测试也全部通过；但发现 **5 个会导致素材来源或素材类型失真的实质性错误**，以及覆盖全部 **53 个文章信源** 的 capability schema / 单一事实来源不完整问题。

> 本报告将“能力”严格定义为**本项目当前实际可调用的采集能力**，而不是目标网站客观上拥有的功能。比如网站本身有视频内容，并不自动构成本项目的 `videos` capability。

## 核查方法与覆盖

我以运行时 `ALL_SOURCES` 为准，而非仅靠静态文本扫描。实际 registry 含 **59** 项：53 个文章信源、13 个图片信源和 7 个视频信源（部分信源具有多种能力）。核查包括能力注入、文章与媒体采集调用链、对应测试，以及针对每一项运行时信源生成的矩阵。[1] [2] [3]

| 检查项 | 结果 | 说明 |
|---|---:|---|
| `ALL_SOURCES` 运行时数量 | 59 | 含 12 个 `wechat2rss_*` 信源；静态首轮名称扫描若只匹配普通对象缩进会遗漏它们。 |
| `capabilities` 对象存在 | 59 / 59 | 运行时均有非空对象。 |
| `articles` capability | 53 | 所有非 `stock_api` 信源均具有文章能力。 |
| `images` capability | 13 | 4 个 stock image API + 9 个 CDP 图片来源。 |
| `videos` capability | 7 | 2 个 stock video API + 5 个 `yt-dlp` 来源。 |
| 相关回归测试 | 322 / 322 通过 | 3 个测试文件均通过，但这些测试没有覆盖下述跨实现语义错误。 |

## 总体判断

当前标注可分为三个层次。**基础存在性正确**：所有 59 个对象都能导入，也没有出现 capability 为空的信源。**媒体 API 结构大体正确**：Pexels、Unsplash、Wikimedia、Coverr、Pixabay 的 method 与 key 字段均与其 collector 配置吻合。**但是语义完整性不足**：`capabilities.articles` 并不是代码宣称的“complete source of truth”，并且 5 个媒体能力在实际执行时会产生错误来源或错误类型的候选项。

| 风险级别 | 数量 | 受影响信源 | 判定 |
|---|---:|---|---|
| P0 | 3 | `xhs`、`douyin`、`weibo_hot` | `videos.method: "ytdlp"` 的平台标注与实际搜索实现不一致，可能把 YouTube 视频错误归因给小红书、抖音或微博。 |
| P1 | 2 | `google_news`、`bing_news` | `images.method: "cdp"` 的脚本会输出无图片的文章 URL，后续仍按 `.jpg` 下载。 |
| P1 | 53 | 所有含 `articles` 的非 stock 信源 | `articles` 未携带 method / API 凭据 / fallback；运行时消费仍依赖 top-level 字段，违反“articles 为完整能力事实来源”的注释承诺。 |
| P1 | 3 | `tiktok_creator`、`gnews`、`currents` | API key、付费或认证限制没有表达在 `capabilities.articles` 内；其中 TikTok 的关键词能力更是仅在付费 API 可用时才成立。 |

## 实质性错误

### P0：三个 `yt-dlp` 视频 capability 会错误标记来源

Registry 将 `xhs`、`douyin`、`weibo_hot` 分别声明为 `platform: "xiaohongshu"`、`"douyin"`、`"weibo"` 的 `yt-dlp` 视频来源。[1] 但 `searchYtdlp()` 只对 `bilibili` 使用 `bilisearch:`；**所有其他 platform** 一律调用 `ytsearch10:`，并且一律构建 `youtube.com/watch?v=...` URL。[2] 素材主循环随后把该候选项的 `source` 覆盖为原声明信源并套用相应 attribution。[2]

| 声明信源 | registry 声明 | 实际搜索 | 影响 | 最小修正 |
|---|---|---|---|---|
| `xhs` | `ytdlp / xiaohongshu` | YouTube `ytsearch10` | 错误来源标记与版权归因 | 暂时移除 `videos` capability，或实现小红书专用搜索 URL / extractor。 |
| `douyin` | `ytdlp / douyin` | YouTube `ytsearch10` | 错误来源标记与版权归因 | 暂时移除 `videos` capability，或实现抖音专用搜索 URL / extractor。 |
| `weibo_hot` | `ytdlp / weibo` | YouTube `ytsearch10` | 错误来源标记与版权归因 | 暂时移除 `videos` capability，或实现微博专用搜索 URL / extractor。 |

`bilibili` 和 `youtube_search` 的 `videos` 标注与当前函数分支一致，因此该项不建议改动。`cookieRequired` 字段目前会正确传递到扁平化配置，但搜索实现是无条件使用 Firefox cookies 的，后续可作为单独的清理项处理。

### P1：Google News 与 Bing News 的图片能力混入文本候选项

`google_news` 和 `bing_news` 都注册为 CDP 图片能力；它们的 primary script 在没有 `img` 时仍返回 `{ type: "text", url: link.href }`。[1] 随后的 CDP 图片下载循环只检查 `candidate.url`，而不检查 `candidate.type`，因而可能把网页文章 URL 下载为 `.jpg`。[2]

| 信源 | 当前错误路径 | 影响 | 最小修正 |
|---|---|---|---|
| `google_news` | 无图片结果仍以 `type: "text"` 返回，并进入图片下载循环 | HTML / 跳转页被错误作为图片下载 | primary script 仅在存在 `img` 时 push；文章结果另走 `articles` 流。 |
| `bing_news` | 同上 | HTML / 跳转页被错误作为图片下载 | 同上；保留 image fallback 仅返回图像 URL。 |

## 系统性不完整：`articles` capability 仍不是事实来源

`enrichWithCapabilities()` 从 top-level `source` 字段复制 `supportsKeyword`、`url`、`extractScript`、`loginCheckScript`、`needsAuth` 和 `useCleanTitle` 到 `capabilities.articles`。[1] 该复制本身没有发现值不一致；也就是说，**现有标注没有发现“复制错值”问题**。

问题在于实际 `search-sources.mjs` 虽用 `capabilities.articles` 来筛选信源，却在后续执行时继续读取 `source.url`、`source.extractScript`、`source.needsAuth`、`source.apiSearch` 和 `source.cdpFallback`。[3] 因此只更新 capability 不会改变真实行为；同时，对 API 文章源而言，`method`、API 凭据、付费标记、API parser 和回退策略都没有在 articles capability 内显式标注。

| 受影响范围 | 当前情况 | 风险 | 建议 schema |
|---|---|---|---|
| 53 个文章信源 | `capabilities.articles` 没有 `method` | consumer 无法只凭 capability 区分 CDP、API、MCP | `method: "cdp" | "api" | "mcp"` |
| 29 个 API primary 信源 | API 配置停留在 top-level `apiSearch` | 无法从 articles capability 判断可执行路径 | `api: { authRequired, paidApi, apiKeyEnv, request, parser }` |
| 有 fallback 的文章信源 | fallback 类型和配置停留在 top-level | capability 不足以表达真实降级链 | `fallbacks: [...]`，或在方法对象中内嵌 fallback 配置 |
| 3 个有 API 凭据限制的来源 | `tiktok_creator`、`gnews`、`currents` 的 API 限制未进入 articles capability | 关键词“支持”被误读为无需条件即可用 | 显式 `requiresApiKey`、`apiKeyEnv`、`paidApi` 和 `keywordSearchAvailability` |

其中 `tiktok_creator` 的问题最明显：标注为 `supportsKeyword: true`，但该关键词检索依赖需要 `SCRAPECREATORS_API_KEY` 且标注为 paid 的 API；其 CDP fallback 是不接收关键词的 Creator Center 首页。因此它应写成“**关键词搜索：仅在 API key / paid API 可用时**”，而不是无条件 true。[1] [3]

## 全量信源核查结果

完整的一行一信源核查矩阵见附件 `source_capability_audit_matrix.csv`。下表按类别汇总，列出的每个 source 均已在运行时 registry 中验证。

| 类别 | 全量信源 | Capability 结论 |
|---|---|---|
| 新闻（14） | `qbitai`、`jiqizhixin`、`36kr`、`techcrunch`、`bloomberg`、`guancha`、`ithome`、`xinhua`、`thepaper`、`leiphone`、`xinzhiyuan`、`zhidx`、`google_news`、`bing_news` | 14 个文章标注均结构不完整；9 个图片标注中 `google_news` 与 `bing_news` 有实质错误，其余 7 个与当前 CDP collector 对齐。 |
| 自媒体（8） | `xhs`、`sogou_weixin`、`weibo_hot`、`bilibili`、`douyin`、`tiktok_creator`、`zhihu`、`x_search` | 全部文章标注结构不完整；视频标注中 `xhs`、`douyin`、`weibo_hot` 错误，`bilibili` 对齐；TikTok 的 keyword 条件缺失。 |
| 西方信源（8） | `youtube_search`、`arxiv_search`、`github_search`、`threads_search`、`datacube_ai`、`gnews`、`core_search`、`openalex_search` | 全部文章标注结构不完整；YouTube 视频标注与当前 search 分支对齐；GNews API key 限制未被 articles capability 表达。 |
| 通用搜索（5） | `google_search`、`baidu_search`、`mcp_grok_search`、`currents`、`noozra_search` | 全部文章标注结构不完整；Currents API key 限制未在 articles capability 表达。 |
| 近 30 日（5） | `reddit_search`、`hackernews_search`、`polymarket_search`、`digg_search`、`techmeme_search` | 5 个文章标注结构不完整；未发现独立图片或视频 capability 错配。 |
| 微信（13） | `wechat_dongchabeating`、`wechat2rss_geekpark`、`wechat2rss_bytedance_tech`、`wechat2rss_meituan_tech`、`wechat2rss_jiqizhixin`、`wechat2rss_zhinengyuan`、`wechat2rss_qbitai`、`wechat2rss_ai_cv`、`wechat2rss_datawhale`、`wechat2rss_tencent_tech`、`wechat2rss_xiaomi_tech`、`wechat2rss_alicloud_dev`、`wechat2rss_alibaba_tech` | RSS / CDP 文章路径可加载；13 个文章标注同样缺少 access method 与 fallback / API 语义。未发现错误的媒体 capability。 |
| Stock API（6） | `pexels`、`pexels-video`、`unsplash`、`wikimedia`、`coverr`、`pixabay` | `images` / `videos` 的 method、key 字段和 asset-sourcer flattening 对齐；没有 articles capability 是正确设计。 |

## 推荐修复顺序

| 优先级 | 修改 | 验收标准 |
|---|---|---|
| P0 | 修正或下线 `xhs`、`douyin`、`weibo_hot` 的 ytdlp 视频搜索 capability。 | 对每个视频 source 的候选 URL hostname 与 capability platform 一致；归因 source 与实际 host 一致。 |
| P1 | 让 Google / Bing 的 CDP 图片 primary script 只产出可下载图片。 | CDP image pipeline 不会将 `type !== "image"` 的 URL 写入 `.jpg`；新增模拟 DOM 的测试。 |
| P1 | 定义并迁移 `ArticleCapability`，把方法、API 限制和 fallback 放入 capability。 | `search-sources.mjs` 仅通过 `capabilities.articles` 执行 article collector；top-level 字段只作为明确的兼容层。 |
| P1 | 为 TikTok、GNews、Currents 补充凭据 / 付费标注。 | 用户或调用方可在不读取 top-level `apiSearch` 的情况下判断 keyword 搜索是否可用。 |
| P2 | 增加语义测试，而不止字段存在性测试。 | 覆盖 URL host、候选 `type`、认证条件、fallback 和 attribution 一致性。 |

## 验证记录与工作区状态

已执行：

```text
npm test -- scripts/short-video/__tests__/source-registry-capabilities.test.mjs \
  scripts/short-video/__tests__/source-registry.test.mjs \
  scripts/short-video/__tests__/asset-sourcer.test.mjs

3 test files passed; 322 tests passed.
```

现有测试通过并不否定上述发现：测试主要验证 capability 的存在、少量字段和集合数量，未执行 ytdlp platform → URL 映射，也未断言 CDP image candidate 只能是 image。核查过程**没有修改项目源码、测试或 git 工作区文件**；工作区在核查开始前已经存在大量与本任务无关的修改，且 `source-registry.mjs` 不在本次状态输出的变更文件中。

## References

[1]: https://github.com/0xPabloLI/inside-china-ai/blob/main/scripts/short-video/lib/source-registry.mjs "Source registry definitions and capability enrichment"
[2]: https://github.com/0xPabloLI/inside-china-ai/blob/main/scripts/short-video/lib/asset-sourcer.mjs "Asset collector capability consumers"
[3]: https://github.com/0xPabloLI/inside-china-ai/blob/main/scripts/short-video/search-sources.mjs "Article source collection flow"

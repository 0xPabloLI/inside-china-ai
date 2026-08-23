# Unified Source Registry 实现审查报告

**审查日期：**2026-08-19  
**审查范围：**提交 `2861e28`（`feat: unified source registry — capabilities, cross-stage image caching, cascade order fix`）及其对应需求文档 `docs/handoffs/handoff-unified-source-registry.md`。  
**审查方式：**只读代码审查、规格与调用链核对，以及定向测试；未修改实现代码。

## 结论

> **结论：需要修复后再合入。**

该提交已将多数素材来源定义汇聚到 `source-registry.mjs`，并实现了预下载过滤与“预过滤先于 Focus 检测”的级联顺序调整。目标测试均通过，但两个 P1 问题使“跨阶段图片缓存”和“趋势发现自然跳过 stock API 来源”这两个核心验收目标无法成立。此外，视频来源归因键发生失配，且 capability 的文章配置仍是顶层配置的部分镜像，后续维护仍有分叉风险。

| 结论 | 数量 |
|---|---:|
| P1 高优先级问题 | 2 |
| P2 中优先级问题 | 2 |
| 已通过的定向测试 | 384 |
| 未完成的检查 | 全量 lint |

---

## 审查发现

### R1 — P1：跨阶段图片缓存链路没有接通

**涉及位置：**`scripts/short-video/lib/source-registry.mjs`、`scripts/short-video/lib/trends-utils.mjs:301-310`、`scripts/short-video/lib/asset-sourcer.mjs:1267-1303`、`scripts/short-video/lib/asset-sourcer.mjs:1542-1555`。

规格要求趋势发现的 `extractScript` 在一次既有 CDP 请求中同时返回文章标题、文章 URL 与图片 URL；`buildOutputJson()` 将这些图片写入 `trending-topics.json`；资产抓取的主流程在新的搜索请求前读取、过滤并下载缓存图片。当前实现只完成了中间的纯函数与 JSON 写入分支，没有完成上下游接线。

`source-registry.mjs` 中文章 `extractScript` 仍返回 `{ title, url }`，没有任何 `imageUrl` 或 `hasImage` 的产出。`buildOutputJson()` 虽然会在输入文章已有 `imageUrl` 时产生 `images` 字段，但真实趋势采集无法提供该字段。另一方面，`loadCachedImages()` 已实现关键词和 logo/icon URL 过滤，但 `main()` 初始化 `allAssets` 后立即进入 API 来源循环，未调用该函数。因此资产抓取仍会执行原有来源搜索，既不会消费缓存图片，也无法减少重复 CDP 请求。

**影响：**规格中“同一 CDP 请求产出文章与图片信号”以及“Stage 4 优先使用缓存图片”的核心收益均未落地。当前功能的测试会通过，是因为趋势聚合测试直接构造了带 `imageUrl` 的输入，缓存测试也只测试加载函数，而没有覆盖真实调用链。

**建议修复：**

1. 对支持文章与图片的来源，在每个文章提取脚本内从同一条目节点取得缩略图，并返回 `imageUrl` 和 `hasImage`。
2. 在去重阶段保留同一主题下所有文章对应的图片，而非仅依赖单个合并后文章的字段。
3. 在 `asset-sourcer.mjs` 主流程的 API/CDP 搜索前加入 Phase 0：读取 `trending-topics.json`、按关键词和 URL 规则过滤、执行预下载过滤、下载成功后写入 `allAssets`。
4. 增加一项端到端回归测试，覆盖 `extractScript` 返回图片、趋势 JSON 持久化、缓存加载，以及主流程在无新 CDP 请求时采用缓存图片的完整路径。

### R2 — P1：仅具图片或视频能力的 stock API 来源仍会被趋势发现执行

**涉及位置：**`scripts/short-video/search-sources.mjs:279`、`scripts/short-video/search-sources.mjs:72-76`、`scripts/short-video/lib/source-registry.mjs:2044-2259`。

统一注册表新增的 Pexels、Unsplash、Wikimedia、Pixabay、Coverr 等 `stock_api` 来源只有 `images` 或 `videos` capability。规格明确要求它们不具备 `articles` capability，从而被趋势发现自然跳过。但 `search-sources.mjs` 的非 research 模式仍直接使用 `ALL_SOURCES`，没有先筛选 `capabilities.articles`。

之后 `collectFromCdp()` 会在开始阶段调用 `source.url(...)`。这些 stock API 来源的请求配置位于 `capabilities.images.searchUrl` 或 `capabilities.videos.searchUrl`，没有顶层 `url`；调用会抛错，再被外层循环捕获并记录为失败来源。

**影响：**每次普通趋势发现都会为 stock API 来源写入无意义的失败记录，违反“趋势发现跳过 stock API 来源”的规格场景，也会干扰失败率监控和操作排障。

**建议修复：**先通过 `ALL_SOURCES.filter((source) => source.capabilities?.articles)` 构建趋势发现来源集，再在 research 模式中以 `capabilities.articles.supportsKeyword` 做二次过滤。新增回归测试，断言所有 `stock_api` 来源不会传递至 `collectFromSource()` 或 CDP 客户端。

### R3 — P2：三个视频来源的归因配置因注册表名称迁移而失配

**涉及位置：**`scripts/short-video/lib/asset-sourcer.mjs:1138-1170`、`scripts/short-video/lib/asset-sourcer.mjs:1642-1672`、`scripts/short-video/lib/source-registry.mjs:2595-2619`。

yt-dlp 派生来源现在采用统一注册表中的名称：`xhs`、`weibo_hot`、`youtube_search`。下载后的资产也以这些名称写入 `asset.source`。但 `SOURCE_ATTRIBUTIONS` 仍使用合并前的 `xiaohongshu`、`weibo`、`youtube` 键。`buildAttribution()` 以资产的来源名称直接索引归因表，因此这三类视频得到 `null` 归因。

**影响：**来自小红书、微博和 YouTube 的资产会在资产报告中丢失来源、许可证与归因元数据。即使当前三个归因条目的 `logoRequired` 均为 `false`，来源元数据的完整性仍是素材治理与人工复核的基础。

**建议修复：**统一 capability、下载资产与归因表使用的规范来源名称；或在 video capability 中定义明确的 `attributionSource`，由扁平化适配器带入候选资产。增加对所有 yt-dlp 来源调用 `buildAttribution()` 的参数化测试。

### R4 — P2：文章 capability 未承载完整消费配置，统一来源注册仍保留双层契约

**涉及位置：**`scripts/short-video/lib/source-registry.mjs:2669-2724`、`scripts/short-video/search-sources.mjs`、`scripts/short-video/lib/asset-sourcer.mjs:1073-1178`。

`enrichWithCapabilities()` 对文章来源只向 `capabilities.articles` 写入 `supportsKeyword`，而 `url`、`extractScript`、`loginCheckScript`、`useCleanTitle` 等仍由趋势发现从顶层读取。资产来源则通过导出的 `API_SOURCES`、`YTDLP_SOURCES`、`CDP_SOURCES` 适配列表消费 capability；这些列表虽然已经由 `ALL_SOURCES` 派生，不构成第二份静态来源真相，但仍延续了旧的三类来源接口。

**影响：**当前结构不会立即导致来源列表漂移，但“消费者通过 capability 查询并读取其配置”的规格约束尚未统一落实。此后修改文章抓取字段时，维护者仍可能不清楚字段应位于顶层还是 capability 内，重新产生双层分叉。

**建议修复：**将文章消费所需的 URL、提取脚本和登录/清洗配置完整迁入 `capabilities.articles`，并使趋势发现只通过 capability 读取它们。若保留旧数组适配器以降低迁移风险，应使其成为内部实现，并以测试约束“所有消费者从 capability 派生配置”。

---

## 已验证的实现点

预下载门控在 API、yt-dlp 和 CDP 候选下载前均调用 `preFilterCandidate()`，并在 `technicalScore < 20` 时写入 `skipped` 而不下载候选。`analyzeAssets()` 也已将免费预过滤置于 `detectFocus()` 之前，并只将通过预过滤的资产送往 Focus 检测和 VLM 分析。这两项调整与规格中的成本级联方向一致。

来源注册表已成为 API、CDP 图片与 yt-dlp 视频配置的派生基础；删除 Lorem Picsum 后，旧的随机无关图片来源不再出现在派生 API 列表中。上述改动是正确方向，但不足以抵消 R1 与 R2 对关键验收目标的影响。

---

## 验证结果

| 检查 | 结果 | 备注 |
|---|---:|---|
| `source-registry-capabilities.test.mjs` | 通过 | capability 结构的定向测试。 |
| `source-registry.test.mjs` | 通过 | 来源注册表的定向测试。 |
| `asset-sourcer.test.mjs` | 通过 | 178 项测试；缓存部分只覆盖纯加载函数。 |
| `asset-sourcer-visual-integration.test.mjs` | 通过 | 验证预过滤在 Focus/VLM 之前执行。 |
| `trends-utils.test.mjs` | 通过 | 对 `imageUrl` 使用人工构造的输入，未覆盖提取脚本产出。 |
| 五个目标测试合计 | **384 passed** | 不能覆盖 R1、R2 的真实调用链问题。 |
| `npm run lint` | 未完成 | 两个 30 秒等待窗口内没有输出，已停止以避免占用当前含大量非本需求未提交改动的工作区。 |

---

## 建议修复顺序

1. **优先修复 R1。**先让趋势提取真实产生图片 URL，并让 asset-sourcer 的主流程在新来源搜索前消费缓存图片；随后加入跨阶段端到端测试。
2. **修复 R2。**趋势发现必须按 `capabilities.articles` 选择来源，确保 stock API 不进入文章采集链路。
3. **修复 R3。**统一 yt-dlp 来源名称与归因表索引，恢复素材报告的完整来源元数据。
4. **收敛 R4。**完成文章 capability 的配置迁移，并逐步隐藏旧数组接口，使 source registry 的 capability 成为所有消费者的唯一契约。
5. 修复后重新运行目标测试，并补充全量测试与可完成的静态检查记录。

## 参考

[1] `docs/handoffs/handoff-unified-source-registry.md` — 需求决策、验收方向与执行顺序。  
[2] `docs/archive/spec-unified-source-registry.md` — 规格、行为场景与测试要求。  
[3] `scripts/short-video/lib/source-registry.mjs` — 统一来源注册表、capability 与归因配置。  
[4] `scripts/short-video/search-sources.mjs` — 趋势发现的来源选择与 CDP 采集链路。  
[5] `scripts/short-video/lib/trends-utils.mjs` — 趋势主题聚合及图片字段输出。  
[6] `scripts/short-video/lib/asset-sourcer.mjs` — 缓存图片加载、候选下载与级联分析主流程。  
[7] `scripts/short-video/__tests__/source-registry-capabilities.test.mjs`、`asset-sourcer.test.mjs`、`asset-sourcer-visual-integration.test.mjs`、`trends-utils.test.mjs` — 定向验证覆盖。

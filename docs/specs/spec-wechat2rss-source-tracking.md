# 规格：Wechat2RSS 第三方公众号追踪接入

## 目标

将经实际验证的第三方 Wechat2RSS 公开 Feed 作为正式的 **Wechat RSS Source** 加入 China AI News 的 Source Registry。趋势发现仅消费其标题、原文链接、发布时间和最多 200 字摘要；它不登录微信、不运行公众号抓取器、不拉取文章全文，也不自动写入 RAG。

本版本的来源集合由实测筛选决定，而不是为了凑数量：从公开目录的 395 个源中，21 个名称相关候选经过逐源访问、近 14 天时效与最近标题核验后，只有 12 个同时满足条件。可选扩展的 PaperWeekly 与集智俱乐部保留在研究记录中，不进入初始高信号集合。

## 范围

| 包含 | 不包含 |
|---|---|
| 12 个经验证来源的静态 Source Registry 配置。 | 自建微信公众号抓取、扫码登录或微信读书会话。 |
| RSS 2.0 `<item>` 解析及元数据输出。 | 文章全文抓取、媒体提取、RAG 自动写入或跨运行的原始文章收件箱。 |
| 仅对这类 Wechat RSS Source 执行 14 天窗口过滤。 | 改造新闻、社媒或多媒体素材来源。 |
| 单个 Feed 故障时的独立降级与趋势运行验证。 | 将公开目录全部 395 个源加入默认趋势扫描。 |

## 领域模型与数据契约

**Wechat RSS Source** 指 Source Registry 中由第三方公共 RSS 输出提供文章列表的来源。它是 `category: "wechat"`、`accessMethod.primary: "api"` 的来源，不具有关键词检索、官方 API 或稳定性保证。

每个来源保留既有注册表的通用字段，并新增明确的追踪元数据。

| 字段 | 值或格式 | 用途 |
|---|---|---|
| `name` | 稳定 ASCII 标识，例如 `wechat2rss_jiqizhixin` | 统计、去重来源标签与测试断言。 |
| `label` | 公众号可读名称 | 日志和趋势输出。 |
| `category` | `wechat` | 语义分类。 |
| `supportsKeyword` | `false` | 研究模式不请求这些固定 Feed。 |
| `accessMethod.primary` | `api` | 复用现有无认证 HTTP 拉取路径。 |
| `apiSearch.url` | 固定的 `https://wechat2rss.xlab.app/feed/*.xml` | 指向公共 RSS 输出。 |
| `apiSearch.parser` | RSS 2.0 解析器 | 产出 `{ title, url, snippet, publishedAt }`。 |
| `tracking.provider` | `wechat2rss` | 记录第三方提供者。 |
| `tracking.access` | `public-rss` | 表明项目只消费公共输出。 |
| `tracking.official` | `false` | 避免误解为公众平台官方 API。 |
| `tracking.freshnessWindowDays` | `14` | 仅用于该来源的近期过滤。 |
| `tracking.stability` | `third-party` | 表明上游可能变更或失效。 |

RSS 解析器必须读取每个 `<item>` 的 `<title>`、`<link>`、`<description>`/`<content:encoded>` 和 `<pubDate>`；标题和摘要需移除 CDATA/XML 包装，摘要最多 200 字。空标题或空链接的条目不进入后续处理。

## 初始来源集合

| `name` | `label` | RSS 地址 | 验证的最新日期 |
|---|---|---|---|
| `wechat2rss_geekpark` | 极客公园 | `https://wechat2rss.xlab.app/feed/1a5aec98e71c707c8ca092bc2c255b9d4bac477d.xml` | 2026-08-17 |
| `wechat2rss_bytedance_tech` | 字节跳动技术团队 | `https://wechat2rss.xlab.app/feed/4025ea55575daf8bfd8227e68b28d9638b073267.xml` | 2026-08-18 |
| `wechat2rss_meituan_tech` | 美团技术团队 | `https://wechat2rss.xlab.app/feed/eb4d04149424a874693a51c6fdda0dba8673f5e4.xml` | 2026-08-13 |
| `wechat2rss_jiqizhixin` | 机器之心 | `https://wechat2rss.xlab.app/feed/51e92aad2728acdd1fda7314be32b16639353001.xml` | 2026-08-18 |
| `wechat2rss_zhinengyuan` | 新智元 | `https://wechat2rss.xlab.app/feed/ede30346413ea70dbef5d485ea5cbb95cca446e7.xml` | 2026-08-18 |
| `wechat2rss_qbitai` | 量子位 | `https://wechat2rss.xlab.app/feed/7131b577c61365cb47e81000738c10d872685908.xml` | 2026-08-18 |
| `wechat2rss_ai_cv` | 我爱计算机视觉 | `https://wechat2rss.xlab.app/feed/b81ffcfff1107b5265cd7e39de610dc7ca72caf4.xml` | 2026-08-17 |
| `wechat2rss_datawhale` | Datawhale | `https://wechat2rss.xlab.app/feed/4d620d988cb21cfeefd2263207221f0dc70df9ff.xml` | 2026-08-17 |
| `wechat2rss_tencent_tech` | 腾讯技术工程 | `https://wechat2rss.xlab.app/feed/9685937b45fe9c7a526dbc32e4f24ba879a65b9a.xml` | 2026-08-18 |
| `wechat2rss_xiaomi_tech` | 小米技术 | `https://wechat2rss.xlab.app/feed/20bc9c3251b3c4f73d3b53aa1f1ab853d05d4cbc.xml` | 2026-08-17 |
| `wechat2rss_alicloud_dev` | 阿里云开发者 | `https://wechat2rss.xlab.app/feed/c74ed6db00cfbf16f2a048a165b4453f982681f0.xml` | 2026-08-17 |
| `wechat2rss_alibaba_tech` | 阿里技术 | `https://wechat2rss.xlab.app/feed/6e1f9b775f7a5841ac1a94310f0478b45a02ec01.xml` | 2026-08-17 |

## 行为

趋势模式将这些固定 Feed 与现有来源一起通过既有 `apiSearch` 路径拉取。解析后的 Wechat RSS 文章仅在 `publishedAt` 可解析且不早于执行时刻前 14 天时进入中国 AI 过滤、分类和标题去重。其他来源不受该规则影响。研究模式仍只选择 `supportsKeyword: true` 的来源，故不拉取这组固定 Feed。

每次趋势运行会重新读取最近 14 天的公开 Feed；现有趋势脚本没有跨运行的文章状态库，因此本规格不承诺“只读取自上次运行以来的新文章”。同一次运行内继续复用既有标题相似度去重。建立跨运行原始收件箱是独立功能，需在未来需求中单独设计。

单个 Feed 发生网络错误、返回非 2xx 状态、无法解析或没有近期条目时，该来源返回空文章；其它来源继续运行，最终输出仍会生成。

## 测试接缝

测试只覆盖两个经确认的公共接缝：Source Registry 导出的 Wechat RSS 配置，以及趋势采集器对这种来源的近期过滤/故障降级输出。测试不依赖真实网络或公众号账号。

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|---|---|---|---|
| `scripts/short-video/lib/source-registry.mjs` | 新增 RSS 解析辅助函数、12 个 Wechat RSS 来源并并入 `ALL_SOURCES`。 | Medium | 注册表被趋势和研究流程共享；固定来源标记为不支持关键词，测试确保研究模式不受影响。 |
| `scripts/short-video/search-sources.mjs` | 对带 `tracking.freshnessWindowDays` 的来源执行来源局部的日期过滤。 | Medium | 改变新增来源的结果集，不改变其他来源；测试验证无追踪标记来源不受过滤。 |
| `scripts/short-video/__tests__/source-registry.test.mjs` | 覆盖 12 源、追踪元数据和 RSS 解析。 | Low | 测试仅锁定公开注册表契约。 |
| `scripts/short-video/__tests__/search-sources.test.mjs`（如缺失则新建） | 覆盖近期、过期、无效日期和单源失败的趋势行为。 | Medium | 测试公共采集器行为，避免日期过滤影响现有来源。 |
| `docs/content-pipeline.md` | 在来源说明中指向 Source Registry 的 Wechat RSS 接入与 14 天窗口。 | Low | 文档变更不改变运行时。 |
| `docs/research/wechat-rss-tracking-mechanisms.md` | 保存第三方/开源机制及风险证据。 | Low | 研究资料与执行规格分离。 |

### Section 2: Behavioral Scenarios

| # | 场景 | 预期行为 | 风险 | 缓解 |
|---:|---|---|---|---|
| 1 | 读取 Source Registry | 导出恰好 12 个 `wechat2rss_*` 来源，均具有公共 RSS、非官方与第三方稳定性标记。 | Medium | 配置测试验证名称唯一、URL 完整、元数据齐全。 |
| 2 | 有效 RSS 条目 | 解析标题、原文链接、摘要和发布时间；摘要不超过 200 字。 | Medium | 使用 CDATA 与普通 XML 的固定夹具测试。 |
| 3 | 条目在 14 天内 | 条目进入现有中国 AI 过滤、分类与去重。 | Medium | 以固定时钟测试边界日期。 |
| 4 | 条目早于 14 天或日期无效 | 该条目不进入趋势输出。 | Medium | 来源局部日期过滤，避免旧文反复成为热点。 |
| 5 | 非 Wechat 来源没有新追踪标记 | 不执行新增日期过滤，保持现有行为。 | High | 回归测试已有 API 来源的结果。 |
| 6 | 某个 Feed 超时/5xx/XML 损坏 | 该源返回空集；其余来源与最终输出继续产生。 | Medium | 沿用既有 `collectFromApi` 错误捕获并添加故障测试。 |
| 7 | 多个来源报道同一主题 | 标题相似度去重合并来源与 URL，保持现有主题输出结构。 | Medium | 集成夹具验证来源合并。 |
| 8 | 研究模式运行 | 固定 Wechat Feed 不会被拉取。 | Low | 断言 `supportsKeyword: false` 的既有筛选行为。 |

## 非目标与后续

本次不建立 RAG 收件箱，不抓取公众号全文，不读取图片/视频，也不改造其它网站的来源或素材复用。若后续需要跨运行增量归档，应另行引入持久化的 `SourceDocument` / 原始 RSS 收件箱，并将其与 RAG 精选素材分开。

## Design Decisions & References

- 公开目录和单源验证：`/home/ubuntu/verify_wechat_rss_candidates.csv`（执行时生成的研究证据，不作为运行时输入）。
- 第三方公共服务：<https://wechat2rss.xlab.app/list/all>。
- 机制与风险研究：`docs/research/wechat-rss-tracking-mechanisms.md`。
- Source Registry 是本项目来源定义的单一真源；RSS 接入复用 DataCube 等现有无认证 HTTP API 模式。

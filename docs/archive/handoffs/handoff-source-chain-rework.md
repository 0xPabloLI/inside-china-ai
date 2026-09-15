# Handoff: 搜源链路重捋（用途定链 + 新闻性保证 + 报警地基）

> **状态**：✅ Grilling 完成（2026-09-15，七项议程全部裁决，见 §3 各条"裁决"）。#308 已交付（commit `263d9f6`）。后续执行：#309 审计 → #307 改写范围 → URL 层 → #269 Phase 2；素材库体系新票并行。本文件随即归档。

**来源**：2026-09-15 session（Session-Id: 20260915-pool-before-grok-29496e，#292 challenge 三轮交付 + 六源用途语义裁决）。逐票详情见各 issue 正文与评论（票正文 write-once，状态在评论）。

## 1. 现状证据（2026-09-15 实测）

**Fallback 到 pool 时关键词不变形**：`collectFromSource` pool 路径把**原始 keyword 原样**传给 `searchPoolFn(keyword)`——不加 `site:`、不加新闻垂直参数、不加时效过滤（adapters 全文无 `freshness`/`topic:news`/`tbs`/`qdr` 等参数）。

**搜出来的不保证是新闻**（#292 smoke 实证：`DeepSeek` 查询返回 Wikipedia 词条 + TechRadar 评测页）。逐层新闻性保证：

| 层 | 新闻保证 | 机制 |
|---|---|---|
| API 层（apiSearch） | 结构化产出（论文/仓库/平台内容），非新闻但**用途对** | 各 API 垂直搜索 |
| CDP 层 | 有——继承源页面性质（新闻站=新闻；Google News 垂直 tbm=nws&qdr:w=一周内新闻） | 源页面本身 |
| googleSiteFallback | 半保证——site: 保平台，**无时间过滤**（tbs=qdr 未用） | Google 普通搜索 |
| **pool fallback** | **无**——通用网页，无新闻性、无时效、**无 publishedAt**（toArticle 只填 title/url/snippet，下游 `filterRecentTrackedArticles` 等时效过滤对其失效） | Serper/Brave/Tavily/Jina 通用 web 搜索 |
| mcp_grok_search | 无新闻性保证；#307 拟转 Bigsong API | — |

**结论**：目前**没有任何一层在系统级保证"每个源搜出来都是新闻"**。保证只存在于继承源页面性质的层；pool/mcp 层结构性绕过新闻性与时效性。相关性护栏（`applyRelevanceGuard`）只作用于 CDP/fallback 结果，pool/mcp 结果跳过（#286 相关性护栏票的管辖范围）。

## 1.5 两条契约（用户定案框架，2026-09-15）

> 用户裁决："把 search source 作为专门搜新闻的 source"；管线天然分两步：前期**新闻收集**、后期**视频素材**。素材"可能会有一些前面的缓存，也会自己去找一些"。

Root cause：现状所有源共用一个"search source"抽象、一条 keyword 路径（`collectFromSource` 单关键词流），两类需求被塞进同一契约——"YouTube 切 pool 搜出网页文章"是这条单一契约的必然产物。

| | 新闻契约 | 素材契约 |
|---|---|---|
| 输入 | 关键词/趋势 | **新闻管线选定的题目**（非裸关键词）+ 缓存复用 + 自主发现 |
| 输出 | 带 publishedAt 的新闻条目 | 平台物：视频/论文/repo/资产文件 |
| 保证 | 新闻性 + 时效 | 平台保真 + capability 路由（yt-dlp 等） |
| 管线角色 | 发现（前端） | 获取（后端，串联在题目确定之后） |

- **串联非并列**：新闻源发现 → 产出题目 → 素材源按题目取物。
- **同一底层源可双役**（Google 搜新闻 / `site:youtube.com` 找素材线索），按**查询角色**走不同契约，不复制两套源。
- 素材管线三个输入来源（grilling 逐项定）：① 前期新闻阶段已抓取并缓存的素材（衔接 `docs/media-asset-management.md` 生命周期）② 按题目定向搜索 ③ 素材源自主发现（范围与触发条件待定）。

**错误可见性**：脚本错误全链静默（#308），#292 googleSiteFallback 死层数周无人知为实证。

## 2. 票图与拟议顺序

| 序 | 票 | 角色 | 依赖 |
|---|---|---|---|
| 1 | **#308** 脚本错误显性化（报警地基） | 小票先行——没有信号，后续全是盲修 | 无 |
| 2 | **Grilling 会**（#292+#269+#200 联合） | 定裁决，§3 议程 | #309 审计报告作输入 |
| 3 | **#309** 62 源逐源审计（用途定链） | grilling 裁决后按定案执行 | 1、2 |
| 4 | **#307** Grok→Bigsong 转换 | 范围取决于 grilling 对 Grok 的定位（若定案为独立事实核查源，#307 范围改变） | 2 |
| 5 | **URL search 层**（API→纯 HTTP→CDP，#66 复活 + #307 转换联动） | 票已批准开立，走 proposal-review | 2 |
| 6 | **#269** Phase 2 自动修复 | 消费 #308 信号 + #309 审计证据 | 1、3 |
| 7 | 卫星：**#286**（trend 相关性护栏——与"新闻性保证"直接相关，若 grilling 决定给 pool 加新闻参数则并入 #309 执行）、#285、#284、#276 | 独立小票，穿插执行 | 各自标注 |

**历史语境**（已交付，只读参考）：#65 pool 原始设计 handoff 已归档；#90 模板先例（#307 推广其模式）；#200 轨迹机制已上线。

## 3. Grilling 议程（裁决记录，2026-09-15）

### A. 契约划分（§1.5 框架落地）

1. **新闻契约定义** — **裁决：(b)+(a) 组合**。pool 调用加新闻参数（Serper `tbs`、Tavily `topic:news`+`days`、Brave `freshness`——参数已存在未用）并补 publishedAt 映射；同时把素材/平台源退出 pool 走 site: 保真层（x_search 模式推广）。**recency：默认 7 天**，长周期源（月报类）30 天。**publishedAt 两档制**：API/RSS/pool 族 fail-closed 必备；CDP DOM 源在补 selector 前降级标记（不参与时效断言）——覆盖审计：62 源约 24 个有 publishedAt（API/RSS 族），search-pool `toArticle` 现丢弃引擎日期字段（`date`/`age`/`publishedDate`），需补映射。Jina 无 date 字段，#309 实测配额+date 可得性后定去留。
2. **素材契约定义** — **裁决**：题目输入 = **contentId**（内容目录 slug，1:N 关键词，slug 本身不进搜索）；保真层 = **site: fallback 推广**（默认 `tbs=qdr:y` 一年窗，可组合）+ capability 路由（yt-dlp/cobalt/直链/CDP adapter）；threads 无 Google 索引不建素材通道。Grok promptTemplate 化（入 source registry per-source）：显式 7 天窗 + 强制日期输出 + 排除 wiki/评测 + 去掉 "Chinese AI industry focus" 限定。

### B. 管线衔接（素材三路输入）

3. **素材缓存** — **裁决**：沿用现有双层缓存（search-results-cache 24h TTL + URL 级去重），cache key 从 keyword-scoped 改 **contentId-scoped**，复用衔接 `docs/media-asset-management.md` 生命周期。发现层与素材层关键词通常不同，缓存命中是兜底非设计依赖。
4. **素材自主发现** — **裁决**：保留，触发 = 题目候选不足（tier-3）；输出过 Relevance Gate（VLM 60 fail-closed）不入人审；关键词生成机制归 #295 延伸，不阻塞主线。
5. **Grok 定位** — **裁决**：**独立事实核查/发现源保留 + fallback 角色退役**；mcp_grok_search 转 Bigsong 直连（#90 模式：raw keyword + 固定 system prompt），MCP 形态退役为纯 agent 交互工具。#307 范围改写（见票评论）。
6. **URL search 层次序** — **裁决**：**#309 审计先行**，URL 层设计并行、实施后置；素材缓存（第 3 项）与 URL 层解耦，不互为前置。

### C. 治理 + 收口增补

7. **报警汇合点** — **裁决**：统一进 source-health.json（streak/trajectory/quarantineReason 单一事实源），仪表可视化后置独立小票；#308 的 `script-error` reason 已入轨道。

**收口增补裁决**（grilling 追问定案）：
- **research 模式纳入 16 个 environmental-signal 源**（weibo_hot、datacube_ai、wechat_dongchabeating、12×wechat2rss、telegram_aipost）——抓全文/热榜 + 关键词匹配；trend 不变。
- **CSE 死代码全删**：`searchGoogleCse` 无消费者、`GOOGLE_CSE_ID` 未用，#309 执行。
- **评测站排除分模式**：wiki 永远排除；**评测 trend 与 research 都排除**（用户终裁"排"——证据池靠 claim-auditor 引用环节标注，收集层直接排除）。
- **视频优先双轨成文**：同一 brief 事实单源，文章与视频口播稿**各自成文**（视频稿按口播规范直写，不从文章改写）；视频为主、文章附属；一个内容包试点，不行再改回（视频质量是综合问题，不只此一项）。
- **素材库体系新票**：统一素材库 + 文字描述索引（VLM 打标、bge-m3 向量复用 RAG 基建）+ **收获率搜索 log 作第一交付物**（每次素材搜索记录 source/keyword/命中数/入库率）+ 素材关键词体系；#288/#301 并入。已授权开票。
- **weibo yt-dlp 路由**：#75 Batch 2 交付（cookie 管线 + 单测）但无真实样本下载证据，#309 补实测后定去留。

## 4. 完成判据

- [x] Grilling 会召开，§3 七项逐一有裁决（裁决记录进对应票评论）
- [ ] #309 审计报告产出并挂票
- [x] 各票按 §2 顺序执行，本文件更新后归档至 `docs/archive/handoffs/`

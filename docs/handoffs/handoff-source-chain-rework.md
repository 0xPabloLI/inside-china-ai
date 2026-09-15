# Handoff: 搜源链路重捋（用途定链 + 新闻性保证 + 报警地基）

> **状态**：待 grilling（#292/#269/#200 联合会，用户已约定下一 session）。
> 本文是会前准备包：现状证据、票图、拟议顺序、待裁决问题。裁决后本文件更新，随后由各票执行。

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

## 3. Grilling 议程（待裁决）

1. **用途分类学**：素材/研究源（youtube→yt-dlp、arxiv→论文、github→repo、threads→帖）vs 通用发现源（google_search=Google News 垂直、mcp_grok_search）。用户六源 challenge 已确立方向，62 源全量归类由 #309 执行，会前确认框架。
2. **pool 的新闻性**：三选一——(a) pool 收缩到通用发现源，平台/素材源用 site: fallback（x_search 模式推广）；(b) 给 pool 调用加新闻参数（Serper `tbs`/Tavily `topic:news`+`days`/Brave `freshness`，参数已存在但 adapters 未用）+ 补 publishedAt；(c) (a)+(b) 按源类型分流。**本 handoff §1 证据是会前输入。**
3. **Grok 定位**：独立事实核查源 vs 兜底 fallback（用户倾向前者，"Grok Search 可以单独做事实源核查，但就不需要再 fallback 了"）。定案直接改写 #307 范围。
4. **URL search 层次序**：与 #309 新链的整合顺序（先审计后建层，还是并行）。
5. **threads 特殊处理**：无 Google 索引，site: 不可用，需单独方案。
6. **报警与用途审计的汇合点**：#308 的 streak 信号 + #209 doctor 探针 + #309 用途分类，是否统一进 source-health 仪表（#269 Phase 2 范围）。

## 4. 完成判据

- [ ] Grilling 会召开，§3 六项逐一有裁决（裁决记录进对应票评论）
- [ ] #309 审计报告产出并挂票
- [ ] 各票按 §2 顺序执行，本文件更新后归档至 `docs/archive/handoffs/`

# 搜索信源正交性试点（#457）

> **调研日期**：2026-11-13
> **目标**：用边际新增（而非两两重合）判断广度层该同时打哪几档信源；先跑 5 条分层查询验证指标、成本与现有 `FAMILIES` 是否站得住。
> **核心结论**：指标与成本模型可跑通，5 条样本**不足以**定「意图 × 推荐信道集」；池内三族（serper / brave / tavily）在本批样本上确实是三条低重合通道，而 `FAMILIES` 注释里「Jina 与 Serper 100% 重合」的前提**未被复现**——Jina 应继续不入族，但理由要改成成本（单次约 9.1 万 token）与时延（p50 20s），不是镜像。
> **下游票**：#1276（每层 10–15 条铺满 + 按意图推荐信道集 + `FAMILIES` / `SKILL.md` 重写）

---

## 1. 方法与可复现性

harness 在 `scripts/short-video/bench/search-orthogonality/`（照 `bench/keyframe/` 的形状：分层取样、预算上限、产物与分数按文件名对应）。它不重新实现抓取：池引擎走 `scripts/short-video/lib/search-pool.mjs` 的 `opts.engines` 测试缝，vertical 六源走 `web-access` 的 `searchOne`，SearXNG 走本地 JSON API 的 `&engines=<name>` 单引擎模式。

```bash
# 全量试点（5 条查询 × 13 信道，20 次计费调用）
node scripts/short-video/bench/search-orthogonality/run-pilot.mjs \
  --run-id 20261113-pilot --max-metered-calls 20
# 仅重跑传输失败的通道（Brave / Jina / Wikipedia 必须走宿主代理）
node scripts/short-video/bench/search-orthogonality/run-pilot.mjs \
  --run-id 20261113-pilot --channels pool:brave,pool:jina,vertical:wikipedia \
  --proxy http://127.0.0.1:<port> --max-metered-calls 10
# 从已落盘的原始产物重算报告（不联网）
node scripts/short-video/bench/search-orthogonality/run-pilot.mjs --replay <run-dir>
```

- 每次 (查询, 信道) 一条 `raw/<query>__<channel>.json`；`report.json` 的每行带 `file` 字段指回原始产物。
- **确定性**：同一 run 连续两次 `--replay`，`report.json` 与 `summary.md` 的 SHA-256 完全一致。线上搜索结果本身不可复现，可复现的是指标层——这是本试点对「重跑一致率 100%」的落地口径。
- 两套去重键分开报，不合并成一个数：URL 级（广度）与发布域级（独立性，Phase 4 三角验证的单位）。
- 主指标是对候选信道做贪心，每步取 `Δ唯一键 / Δ额度份额`。额度份额 = 单次调用占该信道月额度的比例（Serper 1/2500、Brave 1/2000、Tavily 1/1000、Jina 58.9k/1M tokens 锚点），未计费信道记 0，因此免费信道按 `Δ` 排序、用时延 p95 破平。
- 对题率用便宜启发式（标题 + 摘要的查询词覆盖率，中文按二元组），不用 LLM 裁判；并按票面要求人工抽查了唯一贡献域。
- 所有信道统一截断到 top 10，避免「返回 20 条的信道看起来更正交」。

## 2. 样本与成本

5 条查询各一层意图：新闻 / 技术文档 / 学术 / 中文 / 社区；13 个候选信道（池 4 引擎 + SearXNG 3 引擎 + vertical 6 源）。

| 项               | 数值                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| 总调用           | 65（含传输失败后重跑）                                                                  |
| 计费调用         | 20（Serper 5 / Brave 5 / Tavily 5 / Jina 5）                                            |
| 月额度占用       | Serper 0.2% / Brave 0.25% / Tavily 0.5% / **Jina 29.5%（按 58.9k 锚点）**               |
| Jina 实测        | 单次探针 **91,202 tokens**（10 条结果）；5 次成功调用约 0.3–0.46M / 1M 月额度           |
| harness 侧 token | 每次约 565（title+snippet），比 provider 侧小两个数量级——池接缝把 snippet 截到 200 字符 |

Jina 的 58.9k 锚点与实际同量级（91.2k，1.55×），但**harness 记的 payload token 不是 provider 账单 token**：`search-pool.mjs` 在 `toArticle` 截断 snippet，原始响应里的 `usage.tokens` 在接缝处丢失。本票按裁决不动 `search-pool.mjs`，所以报告分两列写清；铺满前若仍要留 Jina，得先补一个采集接缝（归 #1276）。

## 3. 结果

### 3.1 每信道总量（5 条查询合计）

| 信道                   | 条数 | 唯一发布域 | 对题率 | p50 ms | p95 ms |
| ---------------------- | ---- | ---------- | ------ | ------ | ------ |
| pool:serper            | 49   | 37         | 63%    | 2350   | 2692   |
| pool:brave             | 50   | 38         | 71%    | 1307   | 1401   |
| pool:tavily            | 50   | 41         | 66%    | 2802   | 3715   |
| pool:jina              | 50   | 37         | 48%    | 19957  | 23072  |
| searxng:google         | 50   | 46         | 62%    | 19886  | 19897  |
| searxng:brave          | 50   | 39         | 56%    | 19840  | 19894  |
| searxng:tavily         | 50   | 46         | 59%    | 18668  | 19903  |
| vertical:openalex      | 37   | 2          | 31%    | 772    | 2135   |
| vertical:arxiv         | 40   | 1          | 29%    | 1480   | 1709   |
| vertical:hn            | 0    | 0          | —      | 823    | 2279   |
| vertical:stackoverflow | 1    | 1          | 0%     | 709    | 749    |
| vertical:wikipedia     | 20   | 1          | 36%    | 708    | 1293   |
| vertical:github        | 1    | 1          | 100%   | 597    | 978    |

### 3.2 相对现有三族的边际新增（域级 / URL 级）

| 查询     | jina    | searxng:google | searxng:brave | searxng:tavily | openalex | arxiv    |
| -------- | ------- | -------------- | ------------- | -------------- | -------- | -------- |
| 新闻     | 2d / 2u | 7d / 9u        | 8d / 9u       | 7d / 9u        | 1d / 10u | 1d / 10u |
| 技术文档 | 0d / 1u | 5d / 7u        | 5d / 8u       | 4d / 6u        | 1d / 3u  | 1d / 10u |
| 学术     | 2d / 3u | 5d / 7u        | 4d / 7u       | 4d / 7u        | 1d / 10u | 0d / 10u |
| 中文     | 0d / 3u | 9d / 10u       | 7d / 10u      | 8d / 9u        | 2d / 10u | 0d / 0u  |
| 社区     | 0d / 1u | 2d / 4u        | 6d / 7u       | 6d / 7u        | 1d / 4u  | 1d / 10u |

HN / Stack Overflow / GitHub / Wikipedia 在多数查询上为 0，原因见 §4.3，不作为「无边际新增」的证据。

### 3.3 两两包含度（跨 5 条查询的 min / median / max）

URL 级：

| 对                              | 包含度        |
| ------------------------------- | ------------- |
| serper × brave                  | 0 / 11 / 50%  |
| serper × tavily                 | 22 / 40 / 50% |
| brave × tavily                  | 0 / 0 / 40%   |
| serper × jina                   | 30 / 50 / 90% |
| tavily × jina                   | 40 / 60 / 60% |
| searxng:google × searxng:tavily | 30 / 80 / 90% |
| searxng:google × searxng:brave  | 30 / 60 / 80% |
| serper × searxng:google         | 0 / 20 / 40%  |

域级：`serper × jina` 62/71/100%，`searxng:google × searxng:tavily` 40/88/90%，`serper × brave` 14/25/40%。

跨查询摆动依然很大（例如 `serper × brave` 从 0% 到 50%），与票面记录的 73/33/54% 属同一现象：**「哪两档算同族」是查询类型相关的**，一条常数撑不住。

## 4. 对 `FAMILIES` 的裁决

| 现状断言                                | 试点结论                             | 依据                                                                                                                               |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 三族（serper / brave / tavily）互相独立 | **被支持**                           | 三对 URL 包含度中位数 11% / 40% / 0%，均远低于当初促成「合并镜像」的 73%                                                           |
| Jina 与 Serper 100% 重合，所以不入族    | **未被复现**（结论仍保留，理由要改） | URL 包含度中位数 50%（30–90%），域级 71%；边际新增 0–2 个发布域，但单次约 9.1 万 token、p50 20s ⇒ 按成本/时延排除，不按镜像排除    |
| Tavily 是唯一近正交的（与其他 11–43%）  | **方向一致，数值偏更高**             | serper×tavily 40%、brave×tavily 0%（URL 中位数）                                                                                   |
| Google×Serper 73/33/54%                 | **本轮无法检验**                     | 试点没有 CDP Google 通道；`searxng:google` 是另一条通路（与 serper URL 包含度中位数 20%）                                          |
| 扇出「每族一个」                        | **对池三族成立，对 SearXNG 过宽**    | SearXNG 三引擎互为镜像（URL 中位数 60–80%、域级 62–88%），同时打三档只多买到 0–1 个域；它们作为**一层**相对池三族仍有 2–9 个新增域 |

因此本轮不修改 `cached-search.mjs` 的 `FAMILIES`，也不改 `web-deep-research/SKILL.md` 第 3 步——按裁决这两处属于 #1276。**5 条样本的合法产出是「无结论」与「前提修正」**，不是新族表。

## 5. 失败模式与观测（都会误导结论，必须先排掉）

1. **代理端口漂移让 SearXNG 整体判死**：容器 `outgoing.proxies` 写死 `192.168.5.2:7890`，宿主当前端口已变；`unresponsive_engines` 全是 `HTTP connection error`。按 `docs/tools-catalog.md` 的运维路径改成当前端口并重启容器后恢复（单引擎 `engines=google` 返回 208 条）。这是环境故障，不是源死亡。
2. **Node 全局 fetch 不读 `HTTP(S)_PROXY`**：Brave、Jina、Wikipedia 直连均 `UND_ERR_CONNECT_TIMEOUT`；按仓内既有约定用 `--use-env-proxy`（Node ≥ 22.15，见 `docs/selector-auto-healing.md`）后全部恢复（Brave 1.3s、Jina 20s、Wikipedia 0.7s）。**不加代理跑出来的「Brave/Jina 边际新增为 0」是假阴性**，正是票面警告的那类误判。harness 的 `--proxy` 会用该 flag 重新执行自身一次（启动参数无法在运行期补上）。
3. **HN / Stack Overflow / GitHub 的 0 是查询形态**：HN 对 `mixture of experts` 有 1593 命中，对完整自然语言长句只 1 命中（Algolia 全词匹配）。这批查询对社区源不公平，不能据此判死；铺满时应给社区层配短实体查询。
4. **Wikipedia 的 0**：默认 `en.wikipedia`，中文查询与专有技术名词（TanStack Start）无条目，属预期；`--lang zh` 是铺满时的必要参数。
5. **池内三族与 SearXNG 的时间尺度差一个量级**：SearXNG 单引擎 p50 18–20s，`cached-search --fanout` 的单族 60s 硬超时对它是勉强够用；这决定了「SearXNG 进扇出」买的是零额度广度而不是低延迟。
6. **`cached-search` 的 `normArticleUrl` 仍丢 query**（`host+pathname`）：`youtube.com/watch?v=A` 与 `?v=B`、HN 的 `?id=1` 与 `?id=2` 会在合并阶段被判成重复。本试点的 URL 级去重用了保留 query 的实现（见 `metrics.mjs`），所以数据不受影响；但生产扇出的合并仍带着这个缺口，铺满票要一并处理。

## 6. 边界与下一步

- 5 条查询不能外推到「按意图分层」的推荐表：本次跨查询摆动（0–50%）足以说明需要每层 10–15 条。
- 完整测量要动真实额度，且 Jina 是 token 计费的（试点已用掉约三成月额度），预算裁决归 #1276。
- 「库内 `mode:"parallel"` 要不要上 CLI」的答案：**暂时不要**。`cached-search --fanout` 已经用三族并发子进程 + 60s 单族超时 + 10MB 输出上限 + 凭据脱敏覆盖了池内并发；库内并行模式缺这三样防护，暴露出 CLI 只会多一条无超时、无脱敏的执行路径。真正缺的是「按意图选信道 + 共享预算」的扇出策略，那是 #1276 的产出。

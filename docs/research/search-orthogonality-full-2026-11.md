# 搜索信源正交性铺满测量（#1276）

> **调研日期**：2026-11-14
> **目标**：把 #457 试点（5 条分层查询）扩到每层 10–15 条，产出「意图 × 推荐信道集」表，并把结论回写 `cached-search.mjs` 的 `FAMILIES` 注释与 `web-deep-research/SKILL.md` Phase 3 第 3 步。
> **下游票**：无下游：生产侧改动只有票面第 3 项的两处（`FAMILIES` 注释与 SKILL.md Phase 3 第 3 步），随本轮 PR 一并交付；`normArticleUrl` 保留 query 是试点 §5.6 指派给本票的承接项，同样在本轮交付。
> **裁决记录**（用户 2026-11-14）：Jina 移出每层矩阵（单次实测 ≈91k token，铺满会击穿 1M/月额度），改为对推荐信道集做 2–3 次小样本验证。

---

## 1. 方法与可复现性

沿用 #457 试点 harness（`scripts/short-video/bench/search-orthogonality/`），本轮扩展（均为研究产物，不进生产调用路径）：

- `queries-full.mjs`：5 层意图 × 12 条（news / docs / academic / zh / community），一半仓内邻近（AI 基建、短视频研究）、一半普通技术查询，按试点采样规则。community 层用短实体查询（试点教训：HN/Algolia 全词匹配，自然语言长句只 1 命中）。
- `run-pilot.mjs --set full`：铺满查询集入口；zh 层查询把 `lang=zh` 透传给 vertical 通道（wikipedia 走 zh.wikipedia，试点 §5.4 的必要参数）。
- `channels.mjs`：新增 `searxng:aggregate` 信道（不带 engines 参数的默认引擎聚合）——这是 `docs/tools-catalog.md` 里「零额度一次调用广度」的真实用法。
- `report.mjs`：新增 per-intent band summary——每层汇总的贪心序 + 相对池三族的边际新增（域级 / URL 级），跨层不出均值（试点已证明逐查询摆动淹没均值）。

```bash
# 全量（60 查询 × 12 信道，180 次计费调用）
node scripts/short-video/bench/search-orthogonality/run-pilot.mjs --set full \
  --proxy http://127.0.0.1:<port> --max-metered-calls 200 --run-id 20261114-full
# 从已落盘产物重算（不联网）
node scripts/short-video/bench/search-orthogonality/run-pilot.mjs --replay <run-dir>
```

## 2. 环境故障与前置修正（2026-11-14 实测，都会改变结论读法）

1. **SearXNG 容器又死了**：容器 9 小时前 `Exited (0)`（watchtower 更新后未重启），且出站代理写死的端口 `192.168.5.2:49967` 已漂移。按 `docs/tools-catalog.md` 运维路径改到当前端口重启。**教训与试点 §5.1 相同：SearXNG「整体判死」永远是先查代理端口。**
2. **`searxng:tavily` 从来不是单引擎——试点数据有效性修正**：当前镜像（2026-10-10 build）没有内建 tavily 引擎，`engines=tavily` 让 SearXNG 丢弃整个 engines 参数、跑默认引擎聚合（证据：返回 149 条 + 16 个未请求引擎的 unresponsive 列表）。**试点「SearXNG 三引擎互为镜像」的结论要部分重算**：`searxng:google × searxng:tavily` 60–80% 的高重合有一部分是「聚合包含 google」的 artifact；本轮用真实单引擎（bing / yandex）+ 显式 aggregate 信道重测。
3. **searxng:google / duckduckgo / qwant 今日被出口 IP 拒**（access denied / CAPTCHA）；brave 被 too many requests 限流挂起。这是上游按出口 IP reputation 拒绝，属环境故障而非源死亡——试点（11-13）google 单引擎有 50 条/查询的有效数据，本轮沿用。
4. 试点 §5.2 的「Node fetch 不读 `HTTP(S)_PROXY`」依旧成立：本轮全程带 `--proxy`（宿主代理 + `--use-env-proxy` 重执行），`NO_PROXY=localhost,127.0.0.1` 保 SearXNG 直连。

## 3. 样本与成本

60 查询（5 层 × 12）× 12 信道 = 720 次调用，全部 50m41s 内串行完成、零传输失败（wikipedia 一次空结果非错误）；两次 replay 的 `report.json`/`summary.md` SHA-256 一致。Jina 小样本 3 次（news / academic / zh 各 1）追加进同一 run。

| 项 | 数值 |
| --- | --- |
| 计费调用 | Serper 60（月额度 2.4%）/ Brave 60（3%）/ Tavily 60（6%）/ Jina 3（≈27%，91k token/条） |
| 信道总量 | 见 §4 各层表；池三族 553–600 条、SearXNG 三通道各 600 条（top-10×60）、verticals 129–548 条 |
| 对题率（启发式） | 池三族 72–78%，SearXNG 68%，verticals 34–84% |
| 时延 | 池 1.3–2.3s；searxng:aggregate p50 3.5s（本轮多数引擎被拒，只剩 bing/yandex 快速应答）；searxng:bing p50 20s；verticals <2.5s |

## 4. 结果：按意图推荐信道集

每层汇总（pooled，top-10/信道/查询）。贪心序 = 免费信道按 Δ 唯一域在前，计费信道按 `Δ/月额度份额`；**跨层不出均值**（逐查询摆动 0–100% 会淹没它）。

| 层 | SearXNG aggregate 对三族边际 | 池三族贪心序（新增域） | vertical 亮点 |
| --- | --- | --- | --- |
| news | 51d / 99u | serper(+52) → brave(+49) → tavily(+30) | hn 2d/5u；verticals 整体弱 |
| docs | 36d / 98u | brave(+48) → serper(+25) → tavily(+26) | hn 6d/7u；stackoverflow 38u |
| academic | 31d / 105u | serper(+45) → tavily(+22) → brave(+16) | openalex/arxiv 是 Tier-1 主力（域少但带元数据）；hn 意外 +7d |
| zh | 47d / 112u | serper(+36) → brave(+34) → tavily(+23) | wikipedia-zh 内容级有用（75u）但域级 0d |
| community | 35d / 91u | brave(+31) → tavily(+36) → serper(+5) | **hn 34d/80u——community 层的主力**；stackoverflow 106u |

两两包含度（60 条查询的 min / median / max，URL 级）：

| 对 | 包含度 | 读法 |
| --- | --- | --- |
| searxng:bing × searxng:yandex | 40 / 80 / 100% | SearXNG 层内互为镜像（域级中位 100%）——**层内打一档** |
| searxng:bing × searxng:aggregate | 40 / 80 / 100% | aggregate ≈ bing+yandex 合并排序，单次调用即可代表整层 |
| serper × tavily | 0 / 44 / 70% | 池三族独立性维持（低于 73% 合并阈值），但摆动比试点更大 |
| serper × brave | 0 / 30 / 100% | 同上 |
| brave × tavily | 0 / 30 / 86% | 同上 |
| serper/brave/tavily × searxng:aggregate | 0 / 5–10 / 50% | **SearXNG 层对池三族近正交**，零额度广度层成立 |

Jina 小样本（3 条，相对「三族 + SearXNG aggregate + verticals」推荐集）：每条 +4–6 个新增 URL（7 条中 7–10% 边际），其中确有官方一手源（bis.gov PDF、arxiv abs、deepseek.com 官宣）；对三族 URL 重合 14–43%——**近正交但按成本排除**（单次 ≈91k token ≈ 9% 月额度、p50 9–20s）。

**推荐信道集（按意图）**：

1. **所有层**：verticals 先行（免费 + Tier-1 元数据；按意图选源）→ `cached-search --fanout`（池三族）→ 加一次 **searxng:aggregate**（免费、近正交、+27–51 域/层）。
2. **community**：`hn` 是主力垂直源，stackoverflow 补 URL 广度；计费侧 tavily/brave 优先于 serper（实体短查询 serper 只 +5 域）。
3. **academic**：openalex + arxiv 为主，hn 补讨论面；计费侧 serper 优先。
4. **news**：计费侧 serper 优先（+52 域/层）；SearXNG aggregate 对新闻层边际最大（51d）。
5. **zh**：wikipedia 带 `--lang zh`（内容级）；计费侧 serper/brave 优先，tavily 第三。
6. **Jina**：不入矩阵；当推荐集仍缺某个难直达页面（官方 PDF、被反爬页）时做**定向单条**深读，不做扇出。

## 5. 对 `FAMILIES` 与 SKILL.md 的裁决

| 断言 | 铺满结论 | 依据 |
| --- | --- | --- |
| 池三族互相独立 | **维持** | URL 中位 30/30/44%，全部低于 73% 合并阈值；但摆动 0–100% 印证「同族判定是查询相关的」，推荐表按层给序而非改族结构 |
| Jina 不入族（旧理由「与 Serper 100% 镜像」） | **理由改为成本/时延** | 镜像断言仍未复现（对三族 URL 重合 14–43%，对推荐集 +7–10% URL）；排除理由 = 91k token/条 + 9–20s |
| SearXNG 三引擎互为镜像 | **维持并加强，但试点数据要修正** | 试点 `searxng:tavily` 实为默认聚合（无内建 tavily 引擎，§2.2）；真实单引擎（bing/yandex）× aggregate URL 中位 80%、域级 100%——层内打一档 |
| SearXNG 作为一层相对池三族有 2–9 个新增域（试点） | **大幅上调** | 每层 27–51 个新增域；URL 级近正交（0–10% 中位） |

生产侧回写（本轮 PR 交付）：

1. `cached-search.mjs` `FAMILIES`：数组形状不变（google/serper、brave/brave、tavily/tavily），注释替换为铺满实测数字与 Jina/SearXNG 的新裁决。
2. `web-deep-research/SKILL.md` Phase 3 Breadth Fan-out：删除未复现的旧数字（Serper×Jina 100%、Google×Serper 73/33/54%），改为铺满数字 + 上面的按意图推荐表。
3. `cached-search.mjs` `normArticleUrl` 保留非追踪 query（试点 §5.6 指派的缺口，随本轮修复，见 PR 内独立 commit）。

## 6. 边界与遗留

- SearXNG 出口 IP 被上游拒绝期间（google/duckduckgo/qwant access denied、brave 限流），aggregate ≈ bing+yandex；引擎恢复后 aggregate 覆盖只会更宽，「层内打一档」结论不变。
- 试点（#457）文档的 `searxng:tavily` 数据按 §2.2 修正读法，试点文档本身不改（write-once 修正记录在本篇 + 票评论）。
- 测量产物在 `output/20261114-full/`（gitignored），报告可从 raw 全量重算（SHA 一致）。
- 遗留：searxng:brave 解禁后可对 brave 单信道子集补跑（harness 按 (query, channel) 合并），不阻塞本轮结论。

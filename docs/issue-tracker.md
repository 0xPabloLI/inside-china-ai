# Issue Tracker — Open Issues Roadmap

GitHub Issues 依赖关系 + 执行顺序 + 父子分组 + 状态追踪。每次 triage 后更新。

Last inventory: 2026-08-28 - #63 CLOSED (URL dedup, dedupByUrl() in trends-utils.mjs reuses canonicalizeUrl(), 12 tests, commit 80f5a13). #115 CLOSED (downloadCandidate helper extraction, lib/download-candidate.mjs + VDL extended to images, 5 download blocks replaced, 67 new tests, commit cc699e6). #112 hard blocker (#115) now satisfied. Previous: #116 CLOSED (CDP proxy auto-start), #114 CLOSED (SVE runtime verified), #128 created, #120-#126 all CLOSED, #127 created, #119 fully closed, #75 promoted to Tier 2, #117 created, #113 VLM image preprocessing, #63 split into #63+#114, #65 renamed, #110 closed, #112 added, #109 merged into #65, #67/#78/#83/#81/#22/#62/#70/#51 Closed).

**Tracker review**: `docs/research/issue-tracker-review.md` — 2026-08-26 全量逐项审阅（38 open issues），19 项通过 / 19 项 Comment（8 P1 + 11 P2）。本轮已修复全部 P1 和大部分 P2。

---

## Parent–Child Issue Groups

GitHub 已支持原生 sub-issues（2025-01 公测）；本仓库当前尚未建立原生层级。以下 `Parent →` 为临时 triage 视图。

| Parent | Children | Relationship |
|--------|----------|--------------|
| **#89** Anti-bot scraping | → #91 (DuckDuckGo), → #92 (SearXNG) | #91/#92 是 #89 P3 的子任务——rate limiter (#89 P0) 完成后才加新搜索引擎 |
| **#94** Scene visual intent | → #101 (P8b Temporal Focus) | #101 为 #94 的动态媒体场景提供 temporal focus 数据 |
| **#103** Docs offload/split | #95 ✅ closed (PR #104 merged) | #103 依赖 #95 确立的 dual-track 时序。#106 已提供 review baseline |
| **#65** Unified search pool | → #109 (merged in) | #109 合并进 #65：#65 做 REST API pool + MCP 封装层，#109 的目标（替换 Brave MCP）由 #65 完成后自动实现 |
| ~~**#120** Subtitle AIL Gate~~ ✅ | → #121 (T1 baseline), → #122 (T2 timing format), → #123 (T3 canonical-text), → #124 (T4 gate 1), → #125 (T5 repair), → #126 (T6 gate 2) — **all CLOSED** | #120 是 spec parent，#121-#126 是线性 ticket 序列。全部已关闭 |

**不需要引入父子概念的情况**：#98/#99/#100/#101 是 P5-P8b 的线性序列（有显式 `依赖与关联` 章节），不是父子关系——它们是视频管线的线性阶段，用 P5-P8b 编号追踪即可（见 Tier 3）。#121-#126 虽然有 parent #120，但 ticket 之间是严格线性序列，用 T1-T6 编号追踪。**#120-#126 全部已 CLOSED**。

---

## Duplicate & Conflict Notes

| Issue | Duplicate of | Action |
|-------|-------------|--------|
| #93 | #94 | ✅ Closed (dup) |
| #96 | #97 | ✅ Closed (dup) |
| #79, #80 | #78 | ✅ Closed (dup) |
| #82 | #81 | ✅ Closed (superseded) |

**有先后顺序的 issue 组合**（不是重复，但有编辑顺序约束）：

| Sequence | Why |
|----------|-----|
| #83 done -> #88 | #83 done, #88 ready. Both change source-registry.mjs field names |
| #67 ✅ → #66 | #66 auto-fallback 需要 #67 的 method/fallback 字段——#67 已完成，#66 unblocked |
| #67 ✅ → #76, #77, #68, #87 | 审计类全部依赖 capabilities schema 完整——#67 已完成，全部 unblocked |
| #89 P0 → #91 (hard), #92 (soft) | #91 DDG 需 rate limiter；#92 SearXNG 自身不需要，但 backend engines 可能需要 |
| #98 → #99 | P5 ASR → P6 timeline fusion（#99 显式依赖 #98） |
| #100 可与 #98, #99 并行 | P7 cache 不改分析语义，只管执行和复用 |
| #101 依赖 #69 ✅, 推荐接 #100 | P8b temporal focus 需要 P4 window + 推荐 P7 cache |
| #111 -> #21 (推荐顺序) | #111 先做文本 RAG 管线集成，#21 后做多模态。#111 设计好集成接口后 #21 扩展即可，无阻塞依赖 |
| #109 merged into #65 | #109 的目标（替换 Brave MCP → 统一搜索 pool）合并进 #65 scope。#65 完成后 #109 自动关闭 |
| #112 depends on #91, ~~#103~~ ✅, ~~#115~~ ✅ | DuckDuckGo Images needs #91 shared CDP infra; ~~#103 docs done~~; ~~**#115 hard blocker resolved**~~ — `lib/download-candidate.mjs` extracted, #112 can call it directly. **Only #91 remains** |
| #121 → #122 → #123 → #124 / #125 → #126 | ✅ Subtitle AIL Gate ticket sequence — all CLOSED. T1 baseline → T2 timing format → T3 canonical-text validator → T4 gate 1 integration / T5 repair strategy → T6 gate 2 repairFn |

**共享模块依赖关系**：

| 模块 | 产出 issue | 消费 issue | 依赖类型 |
|------|-----------|-----------|---------|
| `lib/search-pool.mjs`（统一搜索 pool round-robin，try-catch 链，不做配额追踪） | #65（产出） | #112（图片 pool 可参考 text pool 的调度模式） | Soft — 架构参考，非代码复用（text pool 是 REST API，image pool 是 API+CDP 混合） |
| `lib/download-candidate.mjs`（统一下载逻辑 helper，从 5 个下载块提取 7 步模式） | ~~#115~~ ✅（产出） | #112（新增的 CDP image sources 也需要下载逻辑） | Hard — ✅ #115 已完成（commit cc699e6），#112 可直接调用 `lib/download-candidate.mjs` |

> ~~`lib/quota-tracker.mjs`~~ — 暂不提取。配额超限由 API 返回 429/403，代码 catch 后继续 fallback。pool 调用频率低（Layer 3 兜底），不值得做配额追踪。

**#65 pool 在 fallback chain 中的位置**：

```
collectFromSource() 层次：
  Layer 0: apiSearch (源专用 API，如 arXiv/GitHub/Currents) ← pool 不替换
  Layer 1: CDP (主路径，打开 Chrome 搜索页面) ← pool 不替换
  Layer 2: googleSiteFallback (Google site: 搜索) ← pool 不替换
  Layer 3: mcpFallback → #65 pool 替换此层
```

**mcpFallback 分两类**：

| 类型 | 源 | mcpFallback 指向 | #65 pool 替换？ |
|------|------|-------------------|----------------|
| 专用 MCP | xhs, sogou_weixin, weibo_hot, bilibili, douyin | 平台专用 MCP (rednote-mcp, weixin-mcp, etc.) | ❌ 不替换 — 搜的是特定平台数据 |
| 通用 web_search | x_search, youtube, arxiv, github, threads, google, mcp_grok_search | mcp-search-bridge/Grok `web_search` | ✅ 替换 — 从"只调 Grok"变成 round-robin (Brave → Tavily → Jina → ... → Grok) |

**#65 pool 不替换专用 API**（arXiv、GitHub、Currents、GNews、OpenAlex 等）。这些源有自己的 `apiSearch`，返回结构化精确数据（论文标题/URL/摘要）。pool 成员（Brave/Tavily/Jina）返回通用网页结果，不会精确匹配学术论文。pool 只在 Layer 0-2 全部失败后作为最终兜底。

**#65 pool 设计方案（精简，2026-08-25 确定）**：try-catch 串行链，不做配额追踪。每个引擎直接调，返回空或 429 就 fallback 到下一个。不做持久化、不做月/日重置。

---

## Recommended Execution Order

**每个 session 做一个 issue。** 从最早未完成的 Wave 中选取无 hard blocker 的 issue；同 Wave 内优先选 Tier 1。并行前必须查 Conflict Risk Matrix——Wave 中的并行文字只是初筛。

| Wave | Shared context | Session candidates (Tier) | Dependencies | Parallel rules |
|---|---|---|---|---|
| **W0 — 决策与基线** | `source-registry.mjs` schema 基线 + `content-pipeline.md` 文档结构 + RAG 查询接口 | **#103** ✅ done · **#111** (T1) text RAG integration · **#88** (T1) Part 1 ✅ done (field rename), Part 2 pending (universal auto-gen) | #67 ✅ 已完成（commit 0f75cdb），#66/#68/#76/#77/#87 全部 unblocked；#111 与 #21 只有推荐顺序 | #103 ✅ done；#111 独占 `content-pipeline.md`，#88 独占 `source-registry.mjs` |
| **W1 — 搜索/素材核心链** | `source-registry.mjs` + `search-sources.mjs` fallback chain + `asset-sourcer.mjs` media search + `cdp-client.mjs` retry | ~~**#63**~~ ✅ closed (URL dedup, commit 80f5a13) · **#113** (T2) VLM image preprocessing (独立于搜索链, 可并行) · ~~**#114**~~ ✅ closed (SVE + runtime verified) · ~~**#115**~~ ✅ closed (downloadCandidate, commit cc699e6) · **#89** (T2) P0 rate limiter · **#66** (T2) extract fallback（#67 ✅ unblocked） · **#127** (T2) VLM Cascade Router (独立于搜索链, 改 vlm_analyzer.py, 与 #113 须串行) · ~~#110~~ ✅ closed · ~~#121~~ ✅ closed · ~~#116~~ ✅ closed | ~~#63~~ ✅ → ~~#114~~ ✅ → ~~#115~~ ✅ 全部 closed（串行链完成）；#89 P0 先于 #91；#113/#127 须串行（同改 vlm_analyzer.py） |
| **W2 — 搜索扩展与路由** | `source-registry.mjs` 增源 + `search-sources.mjs` 路由 + `cdp-client.mjs` fallback | **#64** (T2) API sources · **#66** (T2) extract fallback · **#90** (T2) Bigsong API · **#97** (T2) WeChat RSS · **#91** (T3→**W2 提升**) DDG (#112 hard dep, 需前移) · **#112** (T2) image search pool · **#75** (T2) 视频源标注+下载方案（从 W4 提升） · ~~#122~~ ✅ closed · ~~#123~~ ✅ closed · ~~#124~~ ✅ closed · ~~#125~~ ✅ closed | #66 unblocked（#67 ✅）；#65 依赖 #64/#90；#91 依赖 #89 P0（**从 W3 前移到 W2**：#112 显式依赖 #91 DDG infra，不能在 #112 之后）；#109 已合并进 #65；#112 依赖 #91/#103 ✅/~~**#115 (hard)**~~ ✅ **hard blocker 已解除**；#75 依赖 #54 done | #64/#90/#66 共享 registry/search collector，按 Matrix 串行；#97/#112 可并行；#75 改 source-registry + asset-sourcer，与 #64/#66/#88 串行 |
| **W3 — 审计与收尾** | 验证/文档工作——审计已实现的 registry/schema/fallback，不产生新功能 | **#68** (T3) signal density · **#76** (T3) SSOT · **#77** (T3) source labels · **#87** (T3) maintenance audit · **#65** (T2) pool (含 #109 MCP 封装) · **#92** (T3) SearXNG · ~~#126~~ ✅ closed | #68/#76/#77 unblocked（#67 ✅）；#87 依赖 #66（~~#63~~ ✅ done）；#65 依赖 #64/#90；#109 已合并进 #65 | 先完成 registry/search 改动再做 #77；审计项不得与其审计对象共享文件并行。**#91 已前移到 W2**（#112 hard dep） |
| **W4 — 延后视频链 + 独立增强** | 视频渲染 P5-P8b 线性序列 + 独立研究/增强任务 | **#98** (T3) P5 ASR · **#99** (T3) P6 timeline · **#100** (T3) P7 cache · **#101** (T3) P8b focus · **#85** (T3) Bloomberg · **#94** (T3) visual intent · **#108** (T3) free inference · **#117** (T3) currency conversion | #99 依赖 #98；#101 依赖 #69 推荐接 #100 | 视频链按 P5–P8b 显式 Sequence 推进；独立增强受各自 Matrix 约束。**#101 不是 #94 的 child**——是 P5-P8b 线性序列中的 P8b（见 Tier 3） |
| **Dormant / Human gate** | 不进入 wave，直到 trigger 或人工决策满足 | #21/#29（measurable）· #107（milestone）· #32/#35（user input）· #60/#61（triage） | 见各 issue trigger | 不占用实现排期 |

### Execution Semantics

**工作模式：每个 session 做一个 issue。** 新 session 启动时读 Wave 表，从最早未完成的 Wave 中选 Tier 最高的 issue。Shared context 列帮助预判这个 session 会碰到哪些文件和设计上下文。

三层结构各司其职：

- **Wave**：执行摘要，给出全局推进次序。基于 Tier 和依赖关系合成，不是独立的状态维护源。Tier/Dormant 变动后**再同步更新 Wave**。
- **Tier**：完整 issue inventory 的权威位置；按内容生产价值分层，不表示技术依赖。新增、关闭或调整 issue 时**先更新此处**。同 Wave 内选 issue 时，Tier 1 优先于 Tier 2/3。
- **Conflict Matrix**：并行的最终裁决来源。Wave 中的并行文字只是初筛；任何并行决策**必须以 Matrix 为准**。
- **Shared context**：每个 Wave 共享的代码文件和设计上下文。帮助判断"做这个 issue 需要加载哪些上下文"，以及"不同 Wave 的 issue 是否共享同一设计空间"。

其他术语：

- **Sequence**：单一能力内的严格顺序，例如 #98 → #99。
- **Runtime Layer**：代码运行时的降级层，#110 应使用 `L1–L4` 表示，避免同项目执行 Tier 混淆。
- **Hard blocker**：未完成时不能开工；**soft/recommended**：可开工，但须在 issue 说明提前执行的风险和回退方案。

---

## Execution Tiers

按对内容生产管线的实际推动力分层。同 tier 内标注依赖和冲突文件。

### Tier 1 — 直接提升内容生产效率（优先做）

| # | Issue | Type | Blocked by | Conflict files | Notes |
|---|-------|------|-------------|---------------|-------|
| #88 | Rename CDP script fields + universal Google site: fallback | mechanical + enhancement | #83 done | source-registry.mjs, asset-sourcer.mjs, search-sources.mjs, tests | 消除 20+ 手动配置项，每次加源都受益。**Part 1 ✅ done** (commit 759f07d): field rename (articleScript/imageScript/imageFallbackScript/googleSiteFallback) across 6 code + 4 test + 14 doc files. 422 tests pass. Part 2 pending: universal auto-gen Google site: fallback |
| **#103** Docs offload/split | #95 ✅ done (PR #104 merged) | content-pipeline.md, video-workflow.md, DOCS-INDEX.md | ✅ Commit df1623e — content-pipeline.md 1069→424 lines (-60%), video-workflow.md 821→379 lines (-54%). 3 new L1 docs: article-production-guide.md, series-production-guide.md, content-scaffold-guide.md. Spec/tickets/review archived |
| #111 | Integrate text RAG retrieval into content pipeline (Stage 1 & 3) | enhancement | #15 done | content-pipeline.md, scripts/rag/query.mjs | RAG 索引+查询基础设施已就绪，缺管线集成层。Agent 写文章/scene-data 前自动查 RAG。与 #21 正交，为 #21 铺路 |

### Tier 2 — 有价值但不紧迫（下一轮）

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #66 | Scenario-driven fetch layer + articleScript fallback + API→CDP fix | — | search-sources.mjs, cdp-client.mjs, source-registry.mjs, asset-sourcer.mjs, new fetch-page.mjs | 学 web-access 工具选择表：web_fetch（静态HTML）→ Jina Reader（轻量JS）→ CDP（重）。+ API→CDP fallback 合理性检查（cdpUrl==apiUrl 时 skip）。#67 ✅ unblocked |
| ~~#116~~ | ✅ Pipeline auto-start CDP proxy | — | ~~cdp-client.mjs, search-sources.mjs~~ | ✅ Commit 4d9e684. `ensureCdpProxy()` + `findCdpProxyScript()` in cdp-client.mjs. Multi-path search for cdp-proxy.mjs, detached spawn, health check retry. Replaced `process.exit(1)` with graceful degradation. 29 tests (7 new). Lint+tsc+build pass |
| ~~#63~~ | ✅ URL dedup (standalone) | — | ~~search-sources.mjs, trends-utils.mjs~~ | ✅ Commit 80f5a13. `dedupByUrl()` in trends-utils.mjs reuses `canonicalizeUrl()` from url-normalizer.mjs. 12 tests covering 13 scenario matrix rows. 57/57 tests passing |
| #113 | VLM: Image preprocessing (resize >1920px) | — | vlm_analyzer.py | 所有模型在高分辨率图（>1920px）上幻觉。根因是分辨率不是模型能力。PIL resize 到 1920px 长边后消除幻觉。Benchmark: `docs/research/vlm-model-selection-benchmark.md` |
| ~~#114~~ | ✅ SVE: Single-Visit Extraction | #63 done | ~~search-sources.mjs, asset-sourcer.mjs~~ | ✅ Commit f7c3567 + cdcc8c7. 3 layers: enrichWithMedia + extract-media.mjs + Phase 0b. 28 tests, 302 total. Runtime verified 2026-08-27 (WeChat article + Bing News). Issue #114 CLOSED. Follow-up: #128 |
| ~~#115~~ | ✅ downloadCandidate helper extraction | #63 done | ~~asset-sourcer.mjs, new lib/download-candidate.mjs~~ | ✅ Commit cc699e6. Created `lib/download-candidate.mjs` helper wrapping VDL `downloadVideo()` with file I/O + status mapping. Extended VDL to support images. Replaced 5 duplicated download blocks in asset-sourcer.mjs. 67 new tests + 2111 existing tests passing. Spec/tickets archived |
| ~~#110~~ | ✅ Progressive media-search layers (L1–L4) | #88/#67 recommended | ~~source-registry.mjs, asset-sourcer.mjs~~ | ✅ Commit 3bdadd5. Brave Image + SearXNG Image as Tier 3. Out of scope: Brave Video, SearXNG Video, Tavily, content-pipeline.md docs |
| #89 | Anti-bot rate limiter (P0-P2) | — | rate-limiter.mjs, cdp-client.mjs, proxy-manager.mjs | P0 rate-limiter to P1 backoff to P2 CAPTCHA. Parent of #91, #92. **P5 涉及 `proxy-manager.mjs`** |
| #64 | Add free API sources + baidu_news + reclassify Currents/Noozra | — | source-registry.mjs, search-sources.mjs | 13 候选 API，Brave 需注册。+ baidu_news (CDP news.baidu.com/ns，与 google_news/bing_news 同模式). + 把 currents 和 noozra_search 从 GENERAL_SEARCH_SOURCES 移到 INTERNATIONAL_SOURCES 或新建 NEWS_API_SOURCES（它们是新闻聚合 API，不是通用搜索）。**baidu_news 和 Currents/Noozra 分类调整可能触及 `search-sources.mjs`** |
| #90 | MCP to API migration (Bigsong) | — | source-registry.mjs, search-sources.mjs | lib/bigsong-api.mjs 直接 HTTP 调用. **Matrix/issue 也涉及 `search-sources.mjs`** |
| #65 | General Search Pool (Layer 3 兜底，含 #109) | #64, #90 | search-sources.mjs, config.env | Brave > Tavily > Jina > Grok round-robin. 只替换 7 个通用 web_search 源的 mcpFallback (x_search/youtube/arxiv/github/threads/google/mcp_grok_search). Currents/GNews/Noozra 是新闻 API 不是 general search，已移出 pool → 移到 INTERNATIONAL_SOURCES 或 NEWS_API_SOURCES. #109 合并：MCP 封装替代 Brave MCP |
| #97 | WeChat RSS tracking | — | content-pipeline.md, DOCS-INDEX.md, search-sources.mjs (may), source-registry.mjs (may) | 12 public feeds，evidence boundary 分组 + `sourceRole` 字段 |
| #112 | Image search pool expansion | #91 (DDG), ~~#103 (docs)~~ ✅, ~~**#115 (hard)**~~ ✅ | source-registry.mjs, asset-sourcer.mjs | Google Images (CDP) + Bing Images (CDP) + DuckDuckGo Images (CDP). Refactor Tier 3 to pluggable pool. Engines parallel, keywords serial. **#115 ✅ done**: `lib/download-candidate.mjs` extracted, #112 can call it directly. **Only #91 remains as hard blocker** |
| #75 | 替代下载方案 + 视频源标注（小红书/微博/抖音/B站） | #54 done, #77 推荐（#77 审计现有标注 → #75 加新标注） | asset-sourcer.mjs, source-registry.mjs | ~25% done（RedNote-MCP done, weibo/chubbyskills missing）。Scope expanded: B站图片搜索 + SVE 视频提取 + 全源 video capability 调研（51 个源逐个验证）+ 不用 downloadable 字段（有 videos 就尝试下载，失败由 try-catch 处理）。与 #77 分工：#77 审计现有标注，#75 加新标注。**直接影响视频素材覆盖面** — 从 Tier 3 提升 |
| #127 | VLM Cascade Router: Qwen3-VL-2B fast path + GLM-4.1V-9B deep analysis fallback | — | vlm_analyzer.py | 级联路由器：2B 分析所有图片（~3s），低置信度自动升级到 9B 深度分析（~28s）。Router 信号：输出<100 chars / fit 缺失 / 重复文本 / 高分辨率+content_kind=other。两模型同时加载 ~3GB。Benchmark: `docs/research/vlm-model-selection-benchmark.md` §9-10。Handoff: `docs/handoffs/handoff-vlm-cascade-router-2026-08-27.md`。与 #113 共改 `vlm_analyzer.py`，须串行 |

### Tier 3 — 低重要性 / 大幅延后

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #68 | Signal Density audit | — | — | ADR-0016 Rule 2 全管线排查。验证/文档工作，不产生新功能。#67 ✅ unblocked |
| #76 | SSOT violations audit | — | — | 隐式 schema 彻查 + types.mjs 创建。验证/文档工作。#67 ✅ unblocked |
| #77 | Source type labeling audit | — | source-registry.mjs | 59 源类型标注 + fallback 链完整性。新增：video capability 调研清单（与 #75 配合——#77 调研应不应该标，#75 实现标注+集成下载器）。**#77 应在 #88 后做**（#88 改字段名，先做避免其他 issue 跟着变）。#67 ✅ unblocked |
| #87 | 88 manual maintenance items audit | #66, ~~#63~~ ✅ | — | 盘点 + fallback 覆盖率。验证/文档工作。#67 ✅ unblocked, ~~#63 ✅ done~~ |
| #94 | Scene-level visual intent + evidence-media audit | — | scene-rules.mjs, scene-templates.mjs | 视觉意图契约 + MRL-2 报告。设计层面 |
| #91 | DuckDuckGo source | #89 P0 (hard) | source-registry.mjs | html.duckduckgo.com，无 JS。搜索来源已够用 |
| #92 | SearXNG source | #89 P0 (soft) | source-registry.mjs | Docker 自托管，269 引擎聚合。搜索来源已够用 |
| #85 | Bloomberg paywall alternatives | — | source-registry.mjs (may) | 单个来源研究任务。落地后可能加新 source entry |
| #117 | General currency conversion (multi-currency + rate API) | — | normalize-currency.mjs | Low priority — China AI news is 99% RMB/HKD. EUR/GBP rarely needed. Add patterns + optional API rate fetch |
| #108 | Research: free cloud inference endpoints | — | — | 纯调研，本地模型够用。Deliverable: docs/tools-catalog.md |
| #98 | Local ASR worker (WhisperX) | #69 done | — | 视频管线 P5。当前视频管线基本可用 |
| #99 | Deterministic media timeline fusion | #69 done, #98 | — | 视频管线 P6 |
| #100 | Content-addressed cache + scheduler | P3 done (可与 #98/#99 并行) | — | 视频管线 P7 |
| #101 | Temporal Focus for video backgrounds | #69 done (推荐接 #100) | — | 视频管线 P8b。**不是 #94 的 child**——是 P5-P8b 线性序列的最后一环（P8b），有独立依赖链 |
| #128 | SVE follow-up: Logo/Icon SVG filter + 4 deferred design points | — | extract-media.mjs, asset-sourcer.mjs (may), source-registry.mjs (may) | Item 1 (SVG data URI filter) is runtime-confirmed bug from #114 runtime test. Items 2-5 are low-priority enhancements. All non-blocking. Reference: `docs/handoffs/handoff-sve-media-extraction.md` §4 |

### Dormant — 触发条件未满足

按暂停原因分组，便于新 session 判断下一步动作。

#### Dormant — measurable trigger

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #21 | Multimodal RAG | 50+ images accumulated (当前 0) |
| #29 | Analytics Workflow Part A + Part B | >10 published videos with analytics。Part A: retention pattern analysis。Part B: reference video extraction |

#### Dormant — project milestone

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #107 | Algorithm & Model Review (14 components) | 项目第一版完成。Tracking issue，明确标注 Do NOT start until first version complete |

#### Waiting for user input / information

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #32 | yt-dlp full video + AI segment | 功能未实现（当前只下载前 8s）。#99 完成后可消费 timeline |
| #35 | F5-TTS Multi-Reference Audio | 用户录制 4 段参考音频 |

#### Needs triage / design decision

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #60 | On-demand content audit | 设计讨论中，与 #61 合并 |
| #61 | Non-blocking evidence audit | 与 #60 合并讨论中 |
| #109 | ~~Unified text search pool~~ → 合并进 #65 | #109 的目标（替换 Brave MCP）合并进 #65 scope。#65 完成后 #109 自动关闭 |

---

## Domain Index (read-only)

快速定位同一领域的 issue 及其所在 Wave。不改变 Wave 推进顺序——仅用于导航。

| Domain | Issues | Waves spanned |
|--------|--------|---------------|
| **Source / Search** | #88, #89, #64, #66, #90, #65, #97, #112, #68, #76, #77, #87, #91, #92, ~~#63~~ ✅, ~~#114~~ ✅, ~~#115~~ ✅, ~~#116~~ ✅, #128 | W0–W3 |
| **Content Pipeline** | #103, #111, #94, #60, #61 | W0, W2, W4, Dormant |
| **Video Pipeline** | #98, #99, #100, #101, #113, #35, #32, #75, #127, #29 | W1, W2, W4, Dormant |
| **Docs / Research** | #103, #108, #29, #21, #97, #61 | W0, W4, Dormant |
| **Audit** | #68, #76, #77, #87, #94, #61 | W3, W4, Dormant. #61 也属 Audit domain（non-blocking evidence audit） |
| **Infra / Platform** | #107, #85, #117 | Dormant, W4 |

> 跨领域 issue（如 #94 同时属于 Content Pipeline 和 Audit）在多个领域行出现。并行前仍需查 Conflict Risk Matrix。

---

## Conflict Risk Matrix

同时改同一文件的 issues **必须串行执行**：

| File | Issues touching it | Risk |
|------|--------------------|------|
| `source-registry.mjs` | #88, #64, #77, #90, #91, #92, #66, #75, #97 (may), #85 (may) | 🔴 最高——所有加源/改字段的 issue 都碰这个文件（#110 ✅ done；#66 加 skipCdpOnApiFail 标记；#75 视频源 capability 标注；#97 sourceRole if scope expands；#85 if republisher added） |
| `asset-sourcer.mjs` | #88, ~~#114~~ ✅, #75, #66, ~~#115~~ ✅, #128 (may) | 🟡 中（#84 已 merge，搜索缓存已就位；#110 ✅ done；#66 全文提取改用 fetchPage()；#75 视频源下载+capability 标注；#114 ✅ SVE done；#115 ✅ downloadCandidate 提取 done；#128 SVG filter may touch isLogoOrIcon） |
| `search-sources.mjs` | #66, ~~#63~~ ✅, #88, #65, #90, #64, ~~#114~~ ✅, ~~#116~~ ✅, #97 (may) | 🔴 高（#67 ✅ 已迁移消费者到 capabilities.articles；#63 ✅ URL dedup done；#64 baidu_news/分类调整；#90 Bigsong API 迁移；#114 ✅ SVE done；#116 ✅ CDP proxy auto-start done；#97 evidence 分组+sourceRole if scope expands） |
| `cdp-client.mjs` | #66, #89 | 🔴 高——#66 加 /extract fallback；#89 P1 改 retry/backoff。（~~#116~~ ✅ done — ensureCdpProxy() added） |
| `docs/content-pipeline.md` | #94, #97, #103, #111 | 🟡 中——#103 瘦身后其他 issue 指针需更新；#111 在 Stage 0/1/3 加 RAG 查询步骤 |
| `docs/DOCS-INDEX.md` | #97, #103 | 🟡 低——#78 ✅ 已同步 |
| `Search quota / backend routing` | #65, #110, #112 | 🟡 中——Brave quota 与统一路由边界需单一 owner（#109 已合并进 #65） |
| `vlm_analyzer.py` | #113, #127 | 🟡 中——#113 图片预处理（resize），#127 级联路由器（cascade router + deep_analyze）。两者都改 vlm_analyzer.py，须串行 |
| `scene-rules.mjs` / `scene-templates.mjs` | #94（可能） | 🟢 低 |
| `text-align.py` | — | ✅ ~~#122, #125, #126~~ all CLOSED |
| `main.mjs` | — | ✅ ~~#124, #126~~ all CLOSED |
| `render-only.mjs` | — | ✅ ~~#124~~ CLOSED |
| `verify-retry.mjs` | — | ✅ ~~#125~~ CLOSED |
| `normalize-currency.mjs` | #117 | 🟢 低——独立模块，无并行冲突 |
| `proxy-manager.mjs` | #89 | 🟢 低——#89 P5 anti-bot proxy 管理 |

---

## Closed Issues (2026-08-21~27)

40 issues closed across multiple triage/implementation sessions (code verified + PR merges + mechanical fixes + superseded + schema completion + docs offload + crop decision spec + subtitle AIL gate + URL dedup + downloadCandidate extraction). Full details on GitHub.

| # | Issue | Reason |
|---|-------|--------|
| #103 | Docs: offload/split L1 video content workflows | ✅ Commit df1623e — 3 new L1 docs, content-pipeline.md -60%, video-workflow.md -54%. Spec/tickets/review archived |
| #110 | Progressive (Tiered) Media Search Architecture | Commit 3bdadd5 - Brave Image + SearXNG Image as Tier 3. 28 new tests, 402 total pass. Spec/tickets archived |
| #83 | stock_api -> stock_media rename | Commit 418f46e - pure find-replace, 163 tests pass |
| #78 | DOCS-INDEX sync 22+ missing docs | Commit 15385be - handoffs/reviews/specs/conventions/tiktok tables added |
| #81 | Homepage-only sources search | Superseded by #88 (googleSiteFallback + universal auto-gen) |
| #22 | RAG pre-work | RAG Phase 1 complete; remaining WP items tracked elsewhere |
| #62 | SVE architecture (unified page visitor) | Superseded by #63 (SVE implementation) |
| #70 | Pipeline Simplification spec | All sub-tickets completed; follow-up in #82/#88 |
| #51 | Cascade-filter audit | Completed; GitHub closed 2026-08-23 |
| #36 | ai-analyzer → visual-analyzer rename | Code verified: completed. Review archived → `archive/reviews/ai-visual-analysis-code-review-2026-08-19.md` |
| #44 | scoreCandidate() optimization | Code verified: completed. Reviews archived → `archive/reviews/scorecandidate-review.md` + `archive/reviews/ai-visual-analysis-code-review-2026-08-19.md` |
| #49 | Hook Scene Media + Ken-Burns + Warning | Code verified: completed |
| #52 | Unified Source Registry (umbrella) | All sub-tickets #53-#59 verified. Review archived → `archive/reviews/unified-source-registry-implementation-review-2026-08-19.md` |
| #53 | capabilities field | Code verified: completed |
| #54 | asset-sourcer imports from source-registry | Code verified: completed |
| #55 | articleScript imageUrl | Code verified: completed |
| #56 | Asset-sourcer cached-image flow | Code verified: loadCachedImages() implemented |
| #57 | pre-download filter gate | Code verified: completed |
| #58 | cascade order fix | Code verified: completed |
| #59 | ADR + CONTEXT.md docs | Dependencies all completed |
| #69 | P4 VLM Time Windows + Audit | Code verified: completed. Reviews archived → `archive/reviews/vlm-semantic-merge-implementation-review.md` + `archive/reviews/asset-focus-detection-alternatives-review.md` |
| #79 | DOCS-INDEX sync (dup #78) | Duplicate |
| #80 | DOCS-INDEX sync (dup #78) | Duplicate |
| #82 | Homepage-only sources (superseded by #81) | Superseded |
| #86 | Pipeline Generalization (7 subtasks) | Code verified: completed. Review archived → `archive/reviews/research-evidence-pipeline-implementation-review.md` |
| #84 | Search-call caching | PR #102 merged (Fixes #84) |
| #93 | Scene visual intent (dup #94) | Duplicate |
| #95 | Restore dual-track article and video workflow | PR #104 merged (closes #95) |
| #96 | WeChat RSS tracking (dup #97) | Duplicate |
| #67 | capabilities.articles schema 补全 | Commit 0f75cdb - enrichWithCapabilities() adds method/apiSearch/requiresApiKey/apiKeyEnv/paidApi/googleSiteFallback/mcpFallback. search-sources.mjs migrated to cap?.x ?? source.x. Bug fix: cap.articles.googleSiteFallback. 374 tests pass |
| #119 | Vertical Image Cropping Pipeline — Crop Decision + Framed Contain | ✅ Phase 1 (crop decision + smart alignment): `lib/crop-decision.mjs` + `vlm_analyzer.py` crop simulation + EXIF fix + `asset-sourcer.mjs` Phase 3b + `MediaBackground.tsx` cropFocus. Phase 2 (framed contain composition): `MediaBackground.tsx` branded matte for image+contain (radial-gradient `#0a0a14→#050508`), video contain stays bare. Code review 0 findings. tsc+build+lint+verify-video --pre all pass. Spec/tickets/review archived |
| #120 | Subtitle AIL Gate: Canonical Text verification + dual-gate subtitle validation | ✅ Spec parent — all 6 tickets (#121-#126) completed and closed |
| #121 | T1: Verify current baseline — prove canonical-text gap exists | ✅ CLOSED — baseline documented |
| #122 | T2: timing JSON format adaptation + runWhisperAlignment rename | ✅ CLOSED — timing JSON format adapted, runForcedAlignment alias |
| #123 | T3: canonical-text validator + proper noun normalization | ✅ CLOSED — `verifyCanonicalText()` implemented in `lib/canonical-text.mjs` |
| #124 | T4: Gate 1 integration into main.mjs + render-only.mjs | ✅ CLOSED — canonical-text gate integrated |
| #125 | T5: canonical-text repair strategy + verify-retry integration | ✅ CLOSED — repair strategy integrated into verify-retry.mjs |
| #126 | T6: Gate 2 — complete subtitle-alignment repairFn | ✅ CLOSED — subtitle-alignment repairFn completed |
| #114 | SVE: Single-Visit Extraction | ✅ Commit f7c3567 + cdcc8c7 — 3 layers (enrichWithMedia + extract-media.mjs + Phase 0b). 28 tests, 302 total. Runtime verified 2026-08-27. Follow-up: #128 |
| #116 | Pipeline auto-start CDP proxy | ✅ Commit 4d9e684 — `ensureCdpProxy()` + `findCdpProxyScript()` in cdp-client.mjs. Multi-path search for cdp-proxy.mjs, detached spawn, health check retry. Replaced `process.exit(1)` with graceful degradation in search-sources.mjs. 29 tests (7 new). Lint+tsc+build pass |
| #63 | URL dedup (standalone) | ✅ Commit 80f5a13 — `dedupByUrl()` in trends-utils.mjs reuses `canonicalizeUrl()` from url-normalizer.mjs. 12 tests covering 13 scenario matrix rows. 57/57 tests passing |
| #115 | downloadCandidate helper extraction | ✅ Commit cc699e6 — Created `lib/download-candidate.mjs` helper wrapping VDL `downloadVideo()` with file I/O + status mapping. Extended VDL to support images. Replaced 5 duplicated download blocks in asset-sourcer.mjs. 67 new tests + 2111 existing tests passing. Spec/tickets archived |

---

## Triage Protocol

1. **New session start**: 读 Wave 表 → 从最早未完成的 Wave 中选 Tier 最高的无 hard blocker issue → 查 Conflict Matrix 确认文件不与进行中工作冲突 → 开工
2. **完成一个 issue**: 在对应 Tier 行标 ✅，移到 Closed Issues 表 → 同步更新 Wave 摘要和 Conflict Matrix
3. **新发现已完成**: 代码验证 → `gh issue close` + 评论证据 → 更新本文档（先 Tier/Matrix，再 Wave）
4. **新 issue 创建**: 先添加到对应 Tier 表格 + Conflict Matrix → 再同步到 Wave 摘要；如果属于已有 parent，标注 `Child of #N`
5. **依赖变化**: 先更新 Tier 表 Blocked by 列 → 再同步 Wave 中的依赖描述
6. **冲突检查**: 改代码前查 Conflict Risk Matrix，确认没有并行 issue 在改同一文件
7. **更新顺序铁律**: 任何 issue 状态变动，始终先更新 Tier/Dormant 和 Conflict Matrix，再同步 Wave 摘要——Wave 是执行摘要，不是状态维护源

## Design Decisions & References

| Topic | Reference | Content |
|-------|-----------|---------|
| VLM model selection benchmark | `docs/research/vlm-model-selection-benchmark.md` (L2) | Qwen3-VL 2B/4B/8B comparison + GLM-4.1V-9B A/B test + cascade router design — §9-10 cover GLM cascade |
| VLM cascade router | `docs/handoffs/handoff-vlm-cascade-router-2026-08-27.md` | Qwen3-VL-2B fast path + GLM-4.1V-9B deep analysis fallback — Issue #127 |
| Issue tracker review | `docs/research/issue-tracker-review.md` (L2) | 2026-08-26 全量逐项审阅 — 38 open issues, 19 pass / 19 comment (8 P1 + 11 P2) |

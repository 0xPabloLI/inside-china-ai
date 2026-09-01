# Issue Tracker — Open Issues Roadmap

GitHub Issues 依赖关系 + 执行顺序 + 父子分组 + 状态追踪。每次 triage 后更新。

Last inventory: 2026-08-30 — **#113 VLM 图片预处理 ✅ CLOSED**（Triage Protocol step 3：实现早已在 `main`，本 session 只做验证与关闭——代码核对 + `test_resize_image.py` 5/5 + `unitree-building.jpg` 3468×4624 真实数据冒烟确认无幻觉）。**#127 核实结论已写入 Tier 2 行**（级联端到端跑通，残留两项差距待决策）。Previous: 2026-08-30 — **#89 P0 rate limiter ✅ done**（新模块 `rate-limiter.mjs` + `cdpNewTab` 集成，47 tests + 真实数据冒烟，spec/tickets/review 已归档到 `docs/archive/`）。GitHub #89 CLOSED。Previous: 2026-08-28 全量核对完成。**#140 已创建**（承接 #89 closed 后失去 tracking 载体的 P1/P2/P4–P7 切片；同时更正「P5 = `proxy-manager.mjs`」这一旧误标——#89 原文中 P5 是 selector auto-healing，proxy-manager 属 P6）。**2026-08-30 re-inventory（脚本双向集合比对，非人工点数）**：GitHub open 33 与 tracker open 33 **集合完全一致**——既无「tracker 列 open 但 GitHub 已 closed」，也无「GitHub open 但 tracker 未收录」；Closed 表 49 行全部确为 GitHub closed；open/closed 表无重叠、Tier 表无重号。**tracked = 33 open + 49 closed = 82**（= Closed 表行数 49 + tracker open 行数 33，两边已统一）。GitHub `closed` 计数 99 比 49 多 50，构成为：**40 个从未在 tracker 出现过**（tracker 建立前的历史 issue）＋ **`#15`**（仅作为 #111 的 Blocked-by 依赖被引用）＋ **`#131`–`#139`**（#130 的子 ticket，随 #130 一并关闭，未单独立行）——后 10 个不算 tracked，但**不再是「从未提及」**（旧表述不准确，已更正）。**下一 session W1 候选：#127**（串行约束已随 #113 关闭解除，且已有端到端验证证据；待决策：直接 close 还是先抽 `deep_analyze()`）或 **#66**（同为 T2，改 `cdp-client.mjs` 等，🔴 高冲突）。#88 Part 2 completed (commit c177213): auto-gen googleSiteFallback for 13 sources, W0 fully done. Previous: #111 CLOSED, #129 created, #63/#115/#116/#114 CLOSED, #128 created, #120-#126 all CLOSED, #127 created, #119 fully closed, #75 promoted to Tier 2, #117 created, #113 VLM image preprocessing, #63 split into #63+#114, #65 renamed, #110 closed, #112 added, #109 merged into #65, #67/#78/#83/#81/#22/#62/#70/#51 Closed.

**Tracker review**: `docs/archive/reviews/issue-tracker-review-2026-08-26.md` — 2026-08-26 全量逐项审阅（38 open issues），19 项通过 / 19 项 Comment（8 P1 + 11 P2）。**2026-08-28：19/19 项全部已修复，报告已归档。**

---

## Parent–Child Issue Groups

GitHub 已支持原生 sub-issues（2025-01 公测）；本仓库当前尚未建立原生层级。以下 `Parent →` 为临时 triage 视图。

| Parent | Children | Relationship |
|--------|----------|--------------|
| ~~**#89**~~ ✅ CLOSED Anti-bot scraping (P0 delivered; #91/#92 仍 open) | → #91 (DuckDuckGo), → #92 (SearXNG), → **#140** (follow-up: #89 未交付的 P1/P2/P4–P7 切片) | #91/#92 是 #89 P3 的子任务——rate limiter (#89 P0) 已完成，#91/#92 unblocked。**#89 已 CLOSED，剩余切片统一由 #140 承载**（#89 原文的 P5 = selector auto-healing，P6 = proxy-manager） |
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
| ~~#83~~ ✅ done -> ~~#88~~ ✅ done | #83 done, #88 done. Both changed source-registry.mjs field names |
| #67 ✅ → #66 | #66 auto-fallback 需要 #67 的 method/fallback 字段——#67 已完成，#66 unblocked |
| #67 ✅ → #76, #77, #68, #87 | 审计类全部依赖 capabilities schema 完整——#67 已完成，全部 unblocked |
| #89 P0 ✅ → #91 (hard), #92 (soft) | #91 DDG 需 rate limiter（P0 已完成，#91 unblocked）；#92 SearXNG 自身不需要，但 backend engines 可能需要 |
| #98 → #99 | P5 ASR → P6 timeline fusion（#99 显式依赖 #98） |
| #100 可与 #98, #99 并行 | P7 cache 不改分析语义，只管执行和复用 |
| #101 依赖 #69 ✅, 推荐接 #100 | P8b temporal focus 需要 P4 window + 推荐 P7 cache |
| ~~#111~~ ✅ -> #21 (推荐顺序) | ~~#111 先做文本 RAG 管线集成~~ ✅ done，#21 后做多模态。#111 已集成 RAG 查询步骤，#21 扩展即可，无阻塞依赖 |
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
| **W0 — 决策与基线** | `source-registry.mjs` schema 基线 + `content-pipeline.md` 文档结构 + RAG 查询接口 | ~~**#103**~~ ✅ done · ~~**#111**~~ ✅ done (RAG integration) · ~~**#88**~~ ✅ done (Part 1 field rename + Part 2 universal auto-gen) | #67 ✅ 已完成（commit 0f75cdb），#66/#68/#76/#77/#87 全部 unblocked；#111 与 #21 只有推荐顺序 | ~~#103~~ ✅ done；~~#111~~ ✅ done；~~#88~~ ✅ done — W0 全部完成 |
| **W1 — 搜索/素材核心链** | `source-registry.mjs` + `search-sources.mjs` fallback chain + `asset-sourcer.mjs` media search + `cdp-client.mjs` retry | ~~**#63**~~ ✅ closed (URL dedup, commit 80f5a13) · ~~**#113**~~ ✅ closed (2026-08-30 验证后关闭：实现早已落地，5/5 tests + 真实数据冒烟) · ~~**#114**~~ ✅ closed (SVE + runtime verified) · ~~**#115**~~ ✅ closed (downloadCandidate, commit cc699e6) · ~~**#89**~~ ✅ closed (P0 rate limiter 已交付并 GitHub CLOSED；剩余 P1/P2/P4–P7 切片 → **#140**) · **#66** (T2) extract fallback（#67 ✅ unblocked） · **#127** (T2) VLM Cascade Router (独立于搜索链, 改 vlm_analyzer.py, ~~与 #113 须串行~~ → #113 ✅ closed，串行约束解除) · ~~#110~~ ✅ closed · ~~#121~~ ✅ closed · ~~#116~~ ✅ closed | ~~#63~~ ✅ → ~~#114~~ ✅ → ~~#115~~ ✅ 全部 closed（串行链完成）；#89 ✅ GitHub CLOSED（P0 交付）；剩余切片由 **#140** 承接；~~#113~~ ✅ closed（2026-08-30），#127 的串行约束解除 |
| **W2 — 搜索扩展与路由** | `source-registry.mjs` 增源 + `search-sources.mjs` 路由 + `cdp-client.mjs` fallback | **#64** (T2) API sources · **#66** (T2) extract fallback · **#90** (T2) Bigsong API · **#97** (T2) WeChat RSS · **#91** (T3→**W2 提升**) DDG (#112 hard dep, 需前移) · **#112** (T2) image search pool · **#75** (T2) 视频源标注+下载方案（从 W4 提升） · ~~#122~~ ✅ closed · ~~#123~~ ✅ closed · ~~#124~~ ✅ closed · ~~#125~~ ✅ closed | #66 unblocked（#67 ✅）；#65 依赖 #64/#90；#91 依赖 #89 P0（**从 W3 前移到 W2**：#112 显式依赖 #91 DDG infra，不能在 #112 之后）；#109 已合并进 #65；#112 依赖 #91/#103 ✅/~~**#115 (hard)**~~ ✅ **hard blocker 已解除**；#75 依赖 #54 done | #64/#90/#66 共享 registry/search collector，按 Matrix 串行；#97/#112 可并行；#75 改 source-registry + asset-sourcer，与 #64/#66 串行（~~#88~~ ✅ done，不再约束） |
| **W3 — 审计与收尾** | 验证/文档工作——审计已实现的 registry/schema/fallback，不产生新功能 | **#68** (T3) signal density · **#76** (T3) SSOT · **#77** (T3) source labels · **#87** (T3) maintenance audit · **#65** (T2) pool (含 #109 MCP 封装) · **#92** (T3) SearXNG · ~~#126~~ ✅ closed | #68/#76/#77 unblocked（#67 ✅）；#87 依赖 #66（~~#63~~ ✅ done）；#65 依赖 #64/#90；#109 已合并进 #65 | 先完成 registry/search 改动再做 #77；审计项不得与其审计对象共享文件并行。**#91 已前移到 W2**（#112 hard dep） |
| **W4 — 延后视频链 + 独立增强** | 视频渲染 P5-P8b 线性序列 + 独立研究/增强任务 | **#98** (T3) P5 ASR · **#99** (T3) P6 timeline · **#100** (T3) P7 cache · **#101** (T3) P8b focus · **#85** (T3) Bloomberg · **#94** (T3) visual intent · **#108** (T3) free inference · **#117** (T3) currency conversion · **#140** (T3) anti-bot follow-up (#89 剩余 P1/P2/P4–P7 切片) | #99 依赖 #98；#101 依赖 #69 推荐接 #100 | 视频链按 P5–P8b 显式 Sequence 推进；独立增强受各自 Matrix 约束。**#101 不是 #94 的 child**——是 P5-P8b 线性序列中的 P8b（见 Tier 3） |
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
| ~~#88~~ | ✅ Rename CDP script fields + universal Google site: fallback | mechanical + enhancement | ~~#83~~ ✅ done | ~~source-registry.mjs, asset-sourcer.mjs, search-sources.mjs, tests~~ | ✅ **Part 1** (commit 759f07d): field rename. **Part 2** (commit c177213): auto-gen `googleSiteFallback` for 13 applicable sources via `enrichWithCapabilities()`. `SHARED_GOOGLE_SITE_SEARCH_SCRIPT` + `autoGenerateGoogleSiteFallback()` + `shouldAutoGenGoogleSiteFallback()`. Zero-impact on `search-sources.mjs`. CDP test: 12/13 OK. 22 new tests, 206 total pass. Spec/tickets archived |
| **#103** Docs offload/split | #95 ✅ done (PR #104 merged) | content-pipeline.md, video-workflow.md, DOCS-INDEX.md | ✅ Commit df1623e — content-pipeline.md 1069→424 lines (-60%), video-workflow.md 821→379 lines (-54%). 3 new L1 docs: article-production-guide.md, series-production-guide.md, content-scaffold-guide.md. Spec/tickets/review archived |
| ~~#111~~ | ✅ Integrate text RAG retrieval into content pipeline (Stage 0 & 3) | enhancement | #15 done | ~~content-pipeline.md~~ | ✅ Commit dea33a5. Stage 0 末尾 + Stage 3 Step 2 新增 RAG 查询步骤。Stage 2e 重新定位为工具参考块。非阻塞降级与 Stage 2d 一致。无新代码。 Spec/tickets archived |

### Tier 2 — 有价值但不紧迫（下一轮）

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #66 | Scenario-driven fetch layer + articleScript fallback + API→CDP fix | — | search-sources.mjs, cdp-client.mjs, source-registry.mjs, asset-sourcer.mjs, new fetch-page.mjs | 学 web-access 工具选择表：web_fetch（静态HTML）→ Jina Reader（轻量JS）→ CDP（重）。+ API→CDP fallback 合理性检查（cdpUrl==apiUrl 时 skip）。#67 ✅ unblocked |
| ~~#116~~ | ✅ Pipeline auto-start CDP proxy | — | ~~cdp-client.mjs, search-sources.mjs~~ | ✅ Commit 4d9e684. `ensureCdpProxy()` + `findCdpProxyScript()` in cdp-client.mjs. Multi-path search for cdp-proxy.mjs, detached spawn, health check retry. Replaced `process.exit(1)` with graceful degradation. 29 tests (7 new). Lint+tsc+build pass |
| ~~#63~~ | ✅ URL dedup (standalone) | — | ~~search-sources.mjs, trends-utils.mjs~~ | ✅ Commit 80f5a13. `dedupByUrl()` in trends-utils.mjs reuses `canonicalizeUrl()` from url-normalizer.mjs. 12 tests covering 13 scenario matrix rows. 57/57 tests passing |
| ~~#113~~ | ✅ VLM: Image preprocessing (resize >1920px) | — | ~~vlm_analyzer.py~~ | ✅ **CLOSED 2026-08-30** — 实现早已在 `main`，本 session 只做验证与关闭（Triage Protocol step 3）。证据见下方 Closed Issues 表。1920px vs 1280px 阈值权衡未纳入本 issue——见 `docs/research/vlm-model-selection-benchmark.md` §7 待办 |
| ~~#114~~ | ✅ SVE: Single-Visit Extraction | #63 done | ~~search-sources.mjs, asset-sourcer.mjs~~ | ✅ Commit f7c3567 + cdcc8c7. 3 layers: enrichWithMedia + extract-media.mjs + Phase 0b. 28 tests, 302 total. Runtime verified 2026-08-27 (WeChat article + Bing News). Issue #114 CLOSED. Follow-up: #128 |
| ~~#115~~ | ✅ downloadCandidate helper extraction | #63 done | ~~asset-sourcer.mjs, new lib/download-candidate.mjs~~ | ✅ Commit cc699e6. Created `lib/download-candidate.mjs` helper wrapping VDL `downloadVideo()` with file I/O + status mapping. Extended VDL to support images. Replaced 5 duplicated download blocks in asset-sourcer.mjs. 67 new tests + 2111 existing tests passing. Spec/tickets archived |
| ~~#110~~ | ✅ Progressive media-search layers (L1–L4) | #88/#67 recommended | ~~source-registry.mjs, asset-sourcer.mjs~~ | ✅ Commit 3bdadd5. Brave Image + SearXNG Image as Tier 3. Out of scope: Brave Video, SearXNG Video, Tavily, content-pipeline.md docs |
| ~~#89~~ | ✅ Anti-bot rate limiter (P0; P1/P2/P5 切片 + #91/#92 仍 open) | — | ~~rate-limiter.mjs, cdp-client.mjs, proxy-manager.mjs~~ | ✅ Commit `21d0c47`：`rate-limiter.mjs` 按域名滑窗限流 + `cdpNewTab` 集成 + 跨进程持久化。47 tests 全绿 + 真实数据冒烟（跨进程聚合、news.google.com 并入 google 桶）。未交付切片（P1 backoff / P2 CAPTCHA / P4 Google 源合并 / P5 selector auto-healing / P6 FlClash proxy 自动切换 / P7 Colima 重建）由 **#140** 承接跟踪——#89 已 closed，切片不能再挂在已关闭 issue 下。**更正**：#89 原文中 P5 = selector auto-healing，`proxy-manager.mjs` 属 **P6**（旧 tracker 行误标为 P5）。子 issue #91（DDG）/#92（SearXNG）仍 open。Spec/tickets/review 归档至 `docs/archive/`。GitHub #89 CLOSED |
| #64 | Add free API sources + baidu_news + reclassify Currents/Noozra | — | source-registry.mjs, search-sources.mjs | 13 候选 API，Brave 需注册。+ baidu_news (CDP news.baidu.com/ns，与 google_news/bing_news 同模式). + 把 currents 和 noozra_search 从 GENERAL_SEARCH_SOURCES 移到 INTERNATIONAL_SOURCES 或新建 NEWS_API_SOURCES（它们是新闻聚合 API，不是通用搜索）。**baidu_news 和 Currents/Noozra 分类调整可能触及 `search-sources.mjs`** |
| #90 | MCP to API migration (Bigsong) | — | source-registry.mjs, search-sources.mjs | lib/bigsong-api.mjs 直接 HTTP 调用. **Matrix/issue 也涉及 `search-sources.mjs`** |
| #65 | General Search Pool (Layer 3 兜底，含 #109) | #64, #90 | search-sources.mjs, config.env | Brave > Tavily > Jina > Grok round-robin. 只替换 7 个通用 web_search 源的 mcpFallback (x_search/youtube/arxiv/github/threads/google/mcp_grok_search). Currents/GNews/Noozra 是新闻 API 不是 general search，已移出 pool → 移到 INTERNATIONAL_SOURCES 或 NEWS_API_SOURCES. #109 合并：MCP 封装替代 Brave MCP |
| #97 | WeChat RSS tracking | — | content-pipeline.md, DOCS-INDEX.md, search-sources.mjs (may), source-registry.mjs (may) | 12 public feeds，evidence boundary 分组 + `sourceRole` 字段 |
| #112 | Image search pool expansion | #91 (DDG), ~~#103 (docs)~~ ✅, ~~**#115 (hard)**~~ ✅ | source-registry.mjs, asset-sourcer.mjs | Google Images (CDP) + Bing Images (CDP) + DuckDuckGo Images (CDP). Refactor Tier 3 to pluggable pool. Engines parallel, keywords serial. **#115 ✅ done**: `lib/download-candidate.mjs` extracted, #112 can call it directly. **Only #91 remains as hard blocker** |
| #75 | 替代下载方案 + 视频源标注（小红书/微博/抖音/B站） | #54 done, #77 推荐（#77 审计现有标注 → #75 加新标注） | asset-sourcer.mjs, source-registry.mjs | ~25% done（RedNote-MCP done, weibo/chubbyskills missing）。Scope expanded: B站图片搜索 + SVE 视频提取 + 全源 video capability 调研（51 个源逐个验证）+ 不用 downloadable 字段（有 videos 就尝试下载，失败由 try-catch 处理）。与 #77 分工：#77 审计现有标注，#75 加新标注。**直接影响视频素材覆盖面** — 从 Tier 3 提升 |
| #127 | VLM Cascade Router: Qwen3-VL-2B fast path + GLM-4.1V-9B deep analysis fallback | — | vlm_analyzer.py | 级联路由器：2B 分析所有图片（~3s），低置信度自动升级到 9B 深度分析（~28s）。Router 信号：输出<100 chars / fit 缺失 / 重复文本 / 高分辨率+content_kind=other。两模型同时加载 ~3GB。Benchmark: `docs/research/vlm-model-selection-benchmark.md` §9-10。Handoff: `docs/handoffs/handoff-vlm-cascade-router-2026-08-27.md`。与 #113 共改 `vlm_analyzer.py`，须串行。**2026-08-30 核实（做 #113 时顺带验证）**：级联已实现且真实跑通——`should_escalate()` 16/16 tests、`check_ram_available()` 5/5 tests，`unitree-building.jpg` 端到端 `escalated: true` 且 GLM 输出正确。两项残留差距：(1) issue 正文要求 `deep_analyze()` 函数，实际为 `get_deep_model()` + `handle_analyze_semantics` 内联重跑（功能等价，但 2B/deep 两条路径各有 3 层嵌套 `finally`，重复 ~35 行）；(2) Router 第 4 信号「>1920px + content_kind=other」在 #113 之后**永久失效**（VLM 输入恒 ≤1920px）。下一 session 需决策：直接 close，还是先抽 `deep_analyze()` 再 close |

### Tier 3 — 低重要性 / 大幅延后

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #68 | Signal Density audit | — | — | ADR-0016 Rule 2 全管线排查。验证/文档工作，不产生新功能。#67 ✅ unblocked |
| #76 | SSOT violations audit | — | — | 隐式 schema 彻查 + types.mjs 创建。验证/文档工作。#67 ✅ unblocked |
| #77 | Source type labeling audit | — | source-registry.mjs | 59 源类型标注 + fallback 链完整性。新增：video capability 调研清单（与 #75 配合——#77 调研应不应该标，#75 实现标注+集成下载器）。**#88 ✅ done** — #77 不再被 #88 阻塞。#67 ✅ unblocked |
| #87 | 88 manual maintenance items audit | #66, ~~#63~~ ✅ | — | 盘点 + fallback 覆盖率。验证/文档工作。#67 ✅ unblocked, ~~#63 ✅ done~~ |
| #94 | Scene-level visual intent + evidence-media audit | — | scene-rules.mjs, scene-templates.mjs | 视觉意图契约 + MRL-2 报告。设计层面 |
| #91 | DuckDuckGo source | #89 P0 ✅ done（unblocked） | source-registry.mjs | html.duckduckgo.com，无 JS。搜索来源已够用 |
| #92 | SearXNG source | #89 P0 ✅ done（unblocked） | source-registry.mjs | Docker 自托管，269 引擎聚合。搜索来源已够用 |
| #85 | Bloomberg paywall alternatives | — | source-registry.mjs (may) | 单个来源研究任务。落地后可能加新 source entry |
| #117 | General currency conversion (multi-currency + rate API) | — | normalize-currency.mjs | Low priority — China AI news is 99% RMB/HKD. EUR/GBP rarely needed. Add patterns + optional API rate fetch |
| #108 | Research: free cloud inference endpoints | — | — | 纯调研，本地模型够用。Deliverable: docs/tools-catalog.md |
| #98 | Local ASR worker (WhisperX) | #69 done | — | 视频管线 P5。当前视频管线基本可用 |
| #99 | Deterministic media timeline fusion | #69 done, #98 | — | 视频管线 P6 |
| #100 | Content-addressed cache + scheduler | P3 done (可与 #98/#99 并行) | — | 视频管线 P7 |
| #101 | Temporal Focus for video backgrounds | #69 done (推荐接 #100) | — | 视频管线 P8b。**不是 #94 的 child**——是 P5-P8b 线性序列的最后一环（P8b），有独立依赖链 |
| #128 | SVE follow-up: Logo/Icon SVG filter + 4 deferred design points | — | extract-media.mjs, asset-sourcer.mjs (may), source-registry.mjs (may) | Item 1 (SVG data URI filter) is runtime-confirmed bug from #114 runtime test. Items 2-5 are low-priority enhancements. All non-blocking. Reference: `docs/handoffs/handoff-sve-media-extraction.md` §4 |
| #129 | lint-doc-hierarchy: writing-for-agents gate false positive on file rename/archive | — | scripts/lint-doc-hierarchy.mjs | Non-blocking WARN. Fix: skip `docs/archive/` path in checkWritingForAgentsGate, or add `R` to `--diff-filter` |
| #140 | Anti-bot follow-up（承接 #89 未交付切片） | — | cdp-client.mjs (P1/P2), source-registry.mjs + search-sources.mjs (P4), proxy-manager.mjs (P6) | #89 closed 后，剩余切片需要独立 tracking 载体：P1 exponential backoff / P2 通用 CAPTCHA 检测 / P4 Google 源合并（tbm=nws toggle）/ P5 selector auto-healing（agent 驱动自愈）/ P6 FlClash 节点自动切换 / P7 Colima VM 重建。P3=#91、P3b=#92、P3c=#64+#65，不在本 issue。一片一个 session，P1→P7 |
| #155 | B-roll follow-up: aiImage 静态图生成（T2I） | — | lib/b-roll/*, scene-rules.mjs | B-roll spec §7.1 范围外。管线机制（策略契约 + 门 + 报告 + 缓存/轮次）已就绪，缺 T2I 后端；引入哪个（本地 MLX vs Cloudflare FLUX）需人确认账号与许可 |
| #156 | B-roll follow-up: 垫层合成模式（生成素材垫在真实素材下） | 建议先做 #155 | MediaBackground.tsx, media-bg.mjs, lib/b-roll/orchestrator.mjs, verify-scene-dom.mjs | 现 media 契约每 scene 只有一个素材，b-roll 只能替换不能垫底。夹具 scene 8 现在是「生成 + 过门 + 丢弃」，此 issue 把那笔 GPU 时间变成产出 |
| #157 | B-roll follow-up: 生成模型横评 | — | lib/b-roll/runner.mjs | incumbent `FastVideo/FastMetal-1.3B-QAD`（Apache-2.0）Tier A 是质量上限，Tier B 在 M3 Max OOM。候选 FastMetal 更高档 / Wan 2.2 / LTX / Helios，先查维护状态与 MPS 路径 |
| #158 | B-roll follow-up: ComfyUI / MCP 迭代式生成后端 | 建议接 #157 | lib/b-roll/runner.mjs (seam) | 现回路是批次级（一轮 ≥8min 才拿到分数，无法单候选重跑）。接缝已备好：`{jobs} → {ok, results[]}`，门/报告/缓存不感知后端。云端 RunComfy 路线见 `docs/tools-catalog.md`（用户暂不注册账号） |
| #159 | B-roll follow-up: runner 未透传 `--model-root` | — | lib/b-roll/runner.mjs, b-roll-runner.test.mjs | `buildPythonArgs` 从不传 `--model-root`/`--mlx-checkpoint` → `resolve_model_root(None)` 每批次打 HF `GET /revision/main`，缓存缺件时重下 1.5 GB（用户两次质疑「为什么又下载」）。修法：`BROLL_MODEL_ROOT`/`BROLL_MLX_CHECKPOINT` 透传 + 离线 fail-fast。**T10 已落地 offline 默认**（spawn 注入 `HF_HUB_OFFLINE=1`，哑端点零网络验证）——联网重下载风险已消，本 issue 剩余范围 = 透传 |
| #164 | eslint 全仓库 lint 被 experiments/.venv 拖死 | — | eslint.config.js | `eslint .` 爬进 `scripts/short-video/experiments/fastvideo-spike/repo/.venv`（Python site-packages 内 gradio 前端产物），`npm run lint` 45+ 分钟不收敛，阻断 AGENTS.md Step 6。修法：eslint.config.js ignores 加 `scripts/short-video/experiments/**`。发现于 T5 (#146) session（2026-09-01） |

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
| **Source / Search** | ~~#88~~ ✅, ~~#89~~ ✅, #64, #66, #90, #65, #97, #112, #68, #76, #77, #87, #91, #92, #140, ~~#63~~ ✅, ~~#114~~ ✅, ~~#115~~ ✅, ~~#116~~ ✅, #128 | W0–W4（#140 的 P1/P2/P4 属搜索链） |
| **Content Pipeline** | #103, ~~#111~~ ✅, #94, #60, #61 | W0, W2, W4, Dormant |
| **Video Pipeline** | #98, #99, #100, #101, ~~#113~~ ✅, #35, #32, #75, #127, #29, #155, #156, #157, #158 | W1, W2, W4, Dormant, T3 |
| **Docs / Research** | #103, #108, #29, #21, #97, #61 | W0, W4, Dormant |
| **Audit** | #68, #76, #77, #87, #94, #61 | W3, W4, Dormant. #61 也属 Audit domain（non-blocking evidence audit） |
| **Infra / Platform** | #107, #85, #117, #140, #164 | Dormant, W4（#140 的 P5 自愈 / P6 代理 / P7 Colima 属平台层；#164 为独立小项） |

> 跨领域 issue（如 #94 同时属于 Content Pipeline 和 Audit）在多个领域行出现。并行前仍需查 Conflict Risk Matrix。

---

## Conflict Risk Matrix

同时改同一文件的 issues **必须串行执行**：

| File | Issues touching it | Risk |
|------|--------------------|------|
| `source-registry.mjs` | ~~#88~~ ✅, #64, #77, #90, #91, #92, #66, #75, #97 (may), #85 (may), #140 (P4 only) | 🔴 最高——所有加源/改字段的 issue 都碰这个文件（~~#88~~ ✅ done；#110 ✅ done；#66 加 skipCdpOnApiFail 标记；#75 视频源 capability 标注；#97 sourceRole if scope expands；#85 if republisher added；**#140 仅 P4「Google 源合并」碰此文件 + `search-sources.mjs`，其余切片不碰**） |
| `asset-sourcer.mjs` | ~~#88~~ ✅, ~~#114~~ ✅, #75, #66, ~~#115~~ ✅, #128 (may) | 🟡 中（#84 已 merge，搜索缓存已就位；#110 ✅ done；#66 全文提取改用 fetchPage()；#75 视频源下载+capability 标注；#114 ✅ SVE done；#115 ✅ downloadCandidate 提取 done；#128 SVG filter may touch isLogoOrIcon） |
| `search-sources.mjs` | #66, ~~#63~~ ✅, ~~#88~~ ✅, #65, #90, #64, ~~#114~~ ✅, ~~#116~~ ✅, #97 (may) | 🔴 高（#67 ✅ 已迁移消费者到 capabilities.articles；#63 ✅ URL dedup done；#88 ✅ zero-impact on search-sources.mjs；#64 baidu_news/分类调整；#90 Bigsong API 迁移；#114 ✅ SVE done；#116 ✅ CDP proxy auto-start done；#97 evidence 分组+sourceRole if scope expands） |
| `cdp-client.mjs` | #66, #140 (P1/P2) | 🔴 高——#66 加 /extract fallback；**#140 P1（exponential backoff）+ P2（通用 CAPTCHA 检测）改 retry/探测逻辑，与 #66 必须串行**。（#89 ✅ closed，P1/P2 已移交 #140；~~#116~~ ✅ done — ensureCdpProxy() added） |
| `docs/content-pipeline.md` | #94, #97, #103, ~~#111~~ ✅ | 🟡 中——#103 瘦身后其他 issue 指针需更新；~~#111 RAG 查询步骤已集成~~ |
| `docs/DOCS-INDEX.md` | #97, #103 | 🟡 低——#78 ✅ 已同步 |
| `Search quota / backend routing` | #65, #110, #112 | 🟡 中——Brave quota 与统一路由边界需单一 owner（#109 已合并进 #65） |
| `vlm_analyzer.py` | ~~#113~~ ✅, #127 | 🟢 低（2026-08-30 起——~~#113 图片预处理已 CLOSED~~；只剩 #127 级联路由器的收尾项「抽取 `deep_analyze()`」，见 Tier 2 行）。串行约束随 #113 关闭而解除 |
| `scene-rules.mjs` / `scene-templates.mjs` | #94（可能）, #155 | 🟢 低 |
| `lib/b-roll/*` | #155, #156, #157, #158 | 🟡 中——B-roll stage 模块（orchestrator / runner / gate / report）。#157 与 #158 都改 `runner.mjs` 的后端边界，须串行；#156 另碰渲染层（`MediaBackground.tsx` / `media-bg.mjs`） |
| `text-align.py` | — | ✅ ~~#122, #125, #126~~ all CLOSED |
| `main.mjs` | — | ✅ ~~#124, #126~~ all CLOSED |
| `render-only.mjs` | — | ✅ ~~#124~~ CLOSED |
| `verify-retry.mjs` | — | ✅ ~~#125~~ CLOSED |
| `normalize-currency.mjs` | #117 | 🟢 低——独立模块，无并行冲突 |
| `proxy-manager.mjs` | #140 (**P6**) | 🟢 低——FlClash 出口节点自动切换（#89 原文中这是 **P6**；旧 tracker 行误标为 P5，P5 实为 selector auto-healing）。独立新模块，无并行冲突 |
| `eslint.config.js` | #164 | 🟢 低——独立配置变更，无并行冲突 |

---

## Closed Issues (2026-08-21~30)

49 issues closed across multiple triage/implementation sessions (code verified + PR merges + mechanical fixes + superseded + schema completion + docs offload + crop decision spec + subtitle AIL gate + URL dedup + downloadCandidate extraction + RAG index extension + LLM filter superseded + RAG pipeline integration + universal Google site: fallback + per-domain rate limiter). Full details on GitHub.

| # | Issue | Reason |
|---|-------|--------|
| #88 | Rename CDP script fields + universal Google site: fallback | ✅ Part 1 (commit 759f07d): field rename. Part 2 (commit c177213): auto-gen googleSiteFallback for 13 applicable sources. SHARED_GOOGLE_SITE_SEARCH_SCRIPT + autoGenerateGoogleSiteFallback + shouldAutoGenGoogleSiteFallback. Zero-impact on search-sources.mjs. CDP test: 12/13 OK. 22 new tests, 206 total. Spec/tickets archived |
| #89 | Anti-bot rate limiter (P0) | ✅ Commit 21d0c47 (2026-08-30): per-domain sliding-window rate limiter in rate-limiter.mjs + cdpNewTab 集成进 cdp-client.mjs + 跨进程持久化（跨进程时间戳门控）。47 tests 全绿（16 单测 + 29 cdp-client + 2 集成）+ 真实数据冒烟（双 node 进程、news.google.com 并入 google 桶）。P1 backoff / P2 CAPTCHA / P5 proxy-manager 切片 + 子 issue #91（DDG）/#92（SearXNG）仍 open。Spec/tickets/review 归档至 docs/archive/。GitHub #89 CLOSED |
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
| #130 | Asset relevance refactor: per-scene assetNeed claims + used-asset 40% cap + VLM relevance gate + serif baseline + RAG fix | ✅ Commits 9781fe1..7bd5268 (T1-T8) + docs sync. Spec/tickets archived; ticket issues #131-#139 closed |
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
| #111 | Integrate text RAG retrieval into content pipeline | ✅ Commit dea33a5 — Stage 0 末尾 + Stage 3 Step 2 新增 RAG 查询步骤（`query.mjs --type article/source-material/scene-data`）。Stage 2e 重新定位为工具参考块。非阻塞降级与 Stage 2d 一致。无新代码。 Spec/tickets archived |
| #33 | Replace filterChinaAI + classifyTopic regex with local LLM | Superseded by #51 (cascade direction correction). Closed and confirmed out of scope for P3 |
| #118 | RAG: extend index.mjs to collect docs/research/ markdown | ✅ Commit f6f0e6c + e77dcad — chunkCatalog() + collectAssetCatalog() + catalog.yml + migration. 551 chunks. Incremental indexing (chunk_hash SHA-256). triggerRagReindex() in publish-utils.mjs |
| #113 | VLM: Image preprocessing (resize >1920px) | ✅ **No code change this session** — 实现早已在 `main`（`resize_image_if_needed()` + `MAX_IMAGE_LONG_EDGE = 1920` + `Image.Resampling.LANCZOS` + `mkstemp`/`finally` 清理，2B 与 GLM 两条路径均接入；`mktemp`→`mkstemp`、删除未用 `pathlib` import 由 commit 445bf8e 完成）。Triage Protocol step 3「新发现已完成」：**验证** `__tests__/test_resize_image.py` 5/5 pass + **真实数据冒烟** `unitree-building.jpg` 3468×4624 → crop 2601×4624 → resize 1080×1920，输出正确识别 "Unitree" + "峰达创意园"（修复前基线："digital sign, TALKING HEAD" / 拼写 "Unitee"）。证据见 issue comment |

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
| Issue tracker review | `docs/archive/reviews/issue-tracker-review-2026-08-26.md` | 2026-08-26 全量逐项审阅 — 38 open issues, 19 pass / 19 comment (8 P1 + 11 P2)。2026-08-28 全部修复后归档 |

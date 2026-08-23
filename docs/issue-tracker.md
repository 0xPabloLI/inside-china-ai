# Issue Tracker — Open Issues Roadmap

GitHub Issues 依赖关系 + 执行顺序 + 父子分组 + 状态追踪。每次 triage 后更新。

Last inventory: 2026-08-23 - 34 open issues (after #51 closed; #109/#110/#111 added; #78/#83 and #81/#22/#62/#70 in Closed).

---

## Parent–Child Issue Groups

GitHub 已支持原生 sub-issues（2025-01 公测）；本仓库当前尚未建立原生层级。以下 `Parent →` 为临时 triage 视图。

| Parent | Children | Relationship |
|--------|----------|--------------|
| **#89** Anti-bot scraping | → #91 (DuckDuckGo), → #92 (SearXNG) | #91/#92 是 #89 P3 的子任务——rate limiter (#89 P0) 完成后才加新搜索引擎 |
| **#94** Scene visual intent | → #101 (P8b Temporal Focus) | #101 为 #94 的动态媒体场景提供 temporal focus 数据 |
| **#103** Docs offload/split | #95 ✅ closed (PR #104 merged) | #103 依赖 #95 确立的 dual-track 时序。#106 已提供 review baseline |

**不需要引入父子概念的情况**：#98/#99/#100/#101 是 P5-P8b 的线性序列（有显式 `依赖与关联` 章节），不是父子关系——它们是视频管线的线性阶段，用 P5-P8b 编号追踪即可（见 Tier 3）。

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
| #67 → #66 | #66 auto-fallback 需要 #67 的 method/fallback 字段 |
| #67 → #76, #77, #68, #87 | 审计类全部依赖 capabilities schema 完整 |
| #89 P0 → #91 (hard), #92 (soft) | #91 DDG 需 rate limiter；#92 SearXNG 自身不需要，但 backend engines 可能需要 |
| #98 → #99 | P5 ASR → P6 timeline fusion（#99 显式依赖 #98） |
| #100 可与 #98, #99 并行 | P7 cache 不改分析语义，只管执行和复用 |
| #101 依赖 #69 ✅, 推荐接 #100 | P8b temporal focus 需要 P4 window + 推荐 P7 cache |
| #111 -> #21 (推荐顺序) | #111 先做文本 RAG 管线集成，#21 后做多模态。#111 设计好集成接口后 #21 扩展即可，无阻塞依赖 |

---

## Recommended Execution Order

**Tier 决定优先级；Wave 决定推进顺序；Conflict Group 决定同一 wave 内能否并行。** 每个 session 选择最早一个尚未完成、且 hard blocker 已满足的 wave；同一 wave 内只并行不共享 Conflict Risk Matrix 行的事项。`recommended` 或 `soft` 不是开工阻塞，但应在实现方案中说明为何提前执行。

| Wave | 目标与完成出口 | 可开始项 | 必须串行 / 依赖 | 并行规则 |
|---|---|---|---|---|
| **W0 — 决策与基线** | 固定后续实现会共享的接口与边界。 | #67 capabilities schema；#103 L1 docs offload；#111 text RAG pipeline integration。 | #67 完成后 #66/#68/#76/#77/#87 才可开始；#111 与 #21 只有推荐顺序。 | #67 可与 #103 或 #111 并行（#67 独占 `source-registry.mjs`）；#103 → #111 必须串行（均改 `content-pipeline.md`，见 Conflict Matrix）。 |
| **W1 — 搜索/素材核心链** | 让 source schema、CDP script 和资产搜集基线一致。 | #88 universal script fallback；#63 SVE；#89 P0 rate limiter；#110 progressive media-search layers。 | #88 先于所有 `source-registry.mjs` 增源工作；#89 P0 先于 #91，#92 可 soft-start；#110 推荐在 #88/#67 后。 | #63 可与 #89 并行；#88、#63、#110 不得并行修改同一 registry/asset 文件。 |
| **W2 — 搜索扩展与路由** | 在稳定 schema 上增加 source、fallback 与搜索路由。 | #64 API sources；#66 extract fallback；#90 Bigsong direct API；#97 WeChat RSS。 | #66 依赖 #67；#65 依赖 #64/#90；#91 依赖 #89 P0；#92 对 #89 P0 为 soft；#109 先完成与 #65 的边界 triage。 | #64/#90/#66 共享 registry/search collector，应按 Conflict Matrix 串行；#97 可并行。 |
| **W3 — 审计与收尾** | 只在相关实现稳定后审计、收敛和补测试。 | #68 signal density；#76 SSOT；#77 source labels；#87 maintenance audit；#65 pool；#91/#92 source additions。 | #68/#76/#77 依赖 #67；#87 依赖 #66/#63/#67；#65 依赖 #64/#90。 | 先完成 registry/search 改动，再做 #77；审计项不得与其审计对象共享文件并行。 |
| **W4 — 延后的视频链与独立增强** | 按明确触发或业务节奏推进，不与 W0–W3 的依赖图混淆。 | #98→#99；#100 可并行；#101 推荐接 #100；以及 #75/#85/#94/#108。 | #99 依赖 #98；#101 依赖 #69，推荐接 #100；#75 依赖 #54 done。 | 视频链按 P5–P8b 的显式 Sequence 推进；独立增强仍受各自 Conflict Matrix 约束。 |
| **Dormant / Human gate** | 不进入 wave，直到 trigger 或人工决策满足。 | #21/#29（measurable）；#107（milestone）；#32/#35（user input）；#60/#61/#109（triage）。 | 见各 issue 的 trigger 或决策项。 | 不占用实现排期。 |

### Execution Semantics

三层结构各司其职：

- **Tier**：完整 issue inventory 的权威位置；按内容生产价值分层，不表示技术依赖。新增、关闭或调整 issue 时**先更新此处**。
- **Wave**：执行摘要，给出全局推进次序。基于 Tier 和依赖关系合成，不是独立的状态维护源。Tier/Dormant 变动后**再同步更新 Wave**。
- **Conflict Matrix**：并行的最终裁决来源。Wave 中的并行文字只是初筛；任何并行决策**必须以 Matrix 为准**。

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
| #88 | Rename CDP script fields + universal Google site: fallback | mechanical + enhancement | #83 done | source-registry.mjs, asset-sourcer.mjs, search-sources.mjs, tests | 消除 20+ 手动配置项，每次加源都受益。Part 1: rename. Part 2: universal auto-gen |
| #67 | capabilities.articles schema 补全 | enhancement | — | source-registry.mjs | block 最多下游（5 个直接下游：#66/#68/#76/#77/#87）。~70% done（method/apiKey/paidApi done, fallbacks array missing） |
| #103 | Docs: offload/split L1 video content workflows | docs | #95 done | content-pipeline.md, video-workflow.md, DOCS-INDEX.md | 文档瘦身，提升 agent 读取效率。#106 review baseline 已 merge |
| #111 | Integrate text RAG retrieval into content pipeline (Stage 1 & 3) | enhancement | #15 done | content-pipeline.md, scripts/rag/query.mjs | RAG 索引+查询基础设施已就绪，缺管线集成层。Agent 写文章/scene-data 前自动查 RAG。与 #21 正交，为 #21 铺路 |

### Tier 2 — 有价值但不紧迫（下一轮）

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #66 | extractScript auto-fallback | #67 | search-sources.mjs, cdp-client.mjs | 搜索健壮性提升。per-site to Jina to generic eval to /extract |
| #63 | SVE: Single-Visit Extraction | #54 done, #55 done | search-sources.mjs, asset-sourcer.mjs | 减少 CDP 调用次数，性能优化 |
| #110 | Progressive media-search layers (L1–L4) | #88/#67 recommended | source-registry.mjs, asset-sourcer.mjs, content-pipeline.md | Stock → CDP → open search → HITL；共享 Brave quota，先与 #65/#109 定边界 |
| #89 | Anti-bot rate limiter (P0-P2) | — | rate-limiter.mjs, cdp-client.mjs | P0 rate-limiter to P1 backoff to P2 CAPTCHA. Parent of #91, #92 |
| #64 | Add free API sources | — | source-registry.mjs | 13 候选 API，Brave 需注册 |
| #90 | MCP to API migration (Bigsong) | — | source-registry.mjs | lib/bigsong-api.mjs 直接 HTTP 调用 |
| #65 | Search API Pool | #64, #90 | search-sources.mjs | Jina > Brave > Tavily > Currents > Noozra > GNews > Grok |
| #97 | WeChat RSS tracking | — | content-pipeline.md, DOCS-INDEX.md | 12 public feeds，evidence boundary 分组 |

### Tier 3 — 低重要性 / 大幅延后

| # | Issue | Blocked by | Conflict files | Notes |
|---|-------|-------------|---------------|-------|
| #68 | Signal Density audit | #67 | — | ADR-0016 Rule 2 全管线排查。验证/文档工作，不产生新功能 |
| #76 | SSOT violations audit | #67 | — | 隐式 schema 彻查 + types.mjs 创建。验证/文档工作 |
| #77 | Source type labeling audit | #67 | source-registry.mjs | 59 源类型标注 + fallback 链完整性。验证/文档工作 |
| #87 | 88 manual maintenance items audit | #66, #63, #67 | — | 盘点 + fallback 覆盖率。验证/文档工作 |
| #94 | Scene-level visual intent + evidence-media audit | — | scene-rules.mjs, scene-templates.mjs | 视觉意图契约 + MRL-2 报告。设计层面 |
| #91 | DuckDuckGo source | #89 P0 (hard) | source-registry.mjs | html.duckduckgo.com，无 JS。搜索来源已够用 |
| #92 | SearXNG source | #89 P0 (soft) | source-registry.mjs | Docker 自托管，269 引擎聚合。搜索来源已够用 |
| #85 | Bloomberg paywall alternatives | — | — | 单个来源研究任务 |
| #75 | 替代下载方案（小红书/微博/抖音） | #54 done | asset-sourcer.mjs | ~25% done（RedNote-MCP done, weibo/chubbyskills missing）。剩余技术难度高 |
| #108 | Research: free cloud inference endpoints | — | — | 纯调研，本地模型够用。Deliverable: docs/tools-catalog.md |
| #98 | Local ASR worker (WhisperX) | #69 done | — | 视频管线 P5。当前视频管线基本可用 |
| #99 | Deterministic media timeline fusion | #69 done, #98 | — | 视频管线 P6 |
| #100 | Content-addressed cache + scheduler | P3 done (可与 #98/#99 并行) | — | 视频管线 P7 |
| #101 | Temporal Focus for video backgrounds | #69 done (推荐接 #100) | — | 视频管线 P8b。Child of #94 |

### Dormant — 触发条件未满足

按暂停原因分组，便于新 session 判断下一步动作。

#### Dormant — measurable trigger

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #21 | Multimodal RAG | 50+ images accumulated (当前 0) |
| #29 | Analytics Workflow Part A | >10 published videos with analytics |

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
| #109 | Unified text search pool | 与 #65 的边界未定；先明确 MCP host search 与内容管线 API pool 的职责 |

---

## Conflict Risk Matrix

同时改同一文件的 issues **必须串行执行**：

| File | Issues touching it | Risk |
|------|--------------------|------|
| `source-registry.mjs` | #88, #67, #64, #77, #90, #91, #92, #110 | 🔴 最高——所有加源/改字段的 issue 都碰这个文件 |
| `asset-sourcer.mjs` | #88, #63, #75, #110 | 🟡 中（#84 已 merge，搜索缓存已就位） |
| `search-sources.mjs` | #66, #63, #88, #65, #90 | 🔴 高 |
| `cdp-client.mjs` | #66, #89 | 🔴 高——#66 加 /extract fallback；#89 P1 改 retry/backoff |
| `docs/content-pipeline.md` | #94, #97, #103, #110, #111 | 🟡 中——#103 瘦身后其他 issue 指针需更新；#111 在 Stage 0/1/3 加 RAG 查询步骤 |
| `docs/DOCS-INDEX.md` | #97, #103 | 🟡 低——#78 ✅ 已同步 |
| `Search quota / backend routing` | #65, #109, #110 | 🟡 中——Brave quota 与统一路由边界需单一 owner |
| `scene-rules.mjs` / `scene-templates.mjs` | #94（可能） | 🟢 低 |

---

## Closed Issues (2026-08-21~23)

27 issues closed across four triage sessions (code verified + PR merges + mechanical fixes + superseded). Full details on GitHub.

| # | Issue | Reason |
|---|-------|--------|
| #83 | stock_api -> stock_media rename | Commit 418f46e - pure find-replace, 163 tests pass |
| #78 | DOCS-INDEX sync 22+ missing docs | Commit 15385be - handoffs/reviews/specs/conventions/tiktok tables added |
| #81 | Homepage-only sources search | Superseded by #88 (googleSiteFallback + universal auto-gen) |
| #22 | RAG pre-work | RAG Phase 1 complete; remaining WP items tracked elsewhere |
| #62 | SVE architecture (unified page visitor) | Superseded by #63 (SVE implementation) |
| #70 | Pipeline Simplification spec | All sub-tickets completed; follow-up in #82/#88 |
| #51 | Cascade-filter audit | Completed; GitHub closed 2026-08-23 |
| #36 | ai-analyzer → visual-analyzer rename | Code verified: completed |
| #44 | scoreCandidate() optimization | Code verified: completed |
| #49 | Hook Scene Media + Ken-Burns + Warning | Code verified: completed |
| #52 | Unified Source Registry (umbrella) | All sub-tickets #53-#59 verified |
| #53 | capabilities field | Code verified: completed |
| #54 | asset-sourcer imports from source-registry | Code verified: completed |
| #55 | extractScript imageUrl | Code verified: completed |
| #56 | Asset-sourcer cached-image flow | Code verified: loadCachedImages() implemented |
| #57 | pre-download filter gate | Code verified: completed |
| #58 | cascade order fix | Code verified: completed |
| #59 | ADR + CONTEXT.md docs | Dependencies all completed |
| #69 | P4 VLM Time Windows + Audit | Code verified: completed |
| #79 | DOCS-INDEX sync (dup #78) | Duplicate |
| #80 | DOCS-INDEX sync (dup #78) | Duplicate |
| #82 | Homepage-only sources (superseded by #81) | Superseded |
| #86 | Pipeline Generalization (7 subtasks) | Code verified: completed |
| #84 | Search-call caching | PR #102 merged (Fixes #84) |
| #93 | Scene visual intent (dup #94) | Duplicate |
| #95 | Restore dual-track article and video workflow | PR #104 merged (closes #95) |
| #96 | WeChat RSS tracking (dup #97) | Duplicate |

---

## Triage Protocol

1. **New session start**: 读本文档 → 先检查 Recommended Execution Order 中最早未完成 wave，再从该 wave 选择无 hard blocker 的 issue
2. **完成一个 issue**: 在对应 Tier 行标 ✅，移到 Closed Issues 表 → 同步更新 Wave 摘要和 Conflict Matrix
3. **新发现已完成**: 代码验证 → `gh issue close` + 评论证据 → 更新本文档（先 Tier/Matrix，再 Wave）
4. **新 issue 创建**: 先添加到对应 Tier 表格 + Conflict Matrix → 再同步到 Wave 摘要；如果属于已有 parent，标注 `Child of #N`
5. **依赖变化**: 先更新 Tier 表 Blocked by 列 → 再同步 Wave 中的依赖描述
6. **冲突检查**: 改代码前查 Conflict Risk Matrix，确认没有并行 issue 在改同一文件
7. **更新顺序铁律**: 任何 issue 状态变动，始终先更新 Tier/Dormant 和 Conflict Matrix，再同步 Wave 摘要——Wave 是执行摘要，不是状态维护源

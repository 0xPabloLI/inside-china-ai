# Issue Tracker — Open Issues Roadmap

GitHub Issues 依赖关系 + 执行顺序 + 父子分组 + 状态追踪。每次 triage 后更新。

Last inventory: 2026-08-22 (29 open issues after PR merges #102/#104/#106 closed #84 and #95).

---

## Parent–Child Issue Groups

GitHub 不支持原生父子 issue，但有些 issue 天然是同一工作流的子任务。用 `Parent →` 标注关系，子任务关闭后父任务才能关。

| Parent | Children | Relationship |
|--------|----------|--------------|
| **#89** Anti-bot scraping | → #91 (DuckDuckGo), → #92 (SearXNG) | #91/#92 是 #89 P3 的子任务——rate limiter (#89 P0) 完成后才加新搜索引擎 |
| **#94** Scene visual intent | → #101 (P8b Temporal Focus) | #101 为 #94 的动态媒体场景提供 temporal focus 数据 |
| **#103** Docs offload/split | #95 ✅ closed (PR #104 merged) | #103 依赖 #95 确立的 dual-track 时序。#106 已提供 review baseline |

**不需要引入父子概念的情况**：#98/#99/#100/#101 是 P5-P8b 的线性序列（有显式 `依赖与关联` 章节），不是父子关系——它们是 **pipeline phases**，用 Phase 编号追踪即可。

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
| #83 → #88 | 两个都改 `source-registry.mjs` 字段名。#83 是小改（category 名），#88 是大改（script 字段名 + fallback 机制）。先做 #83 再做 #88 避免 merge conflict |
| #67 → #66 | #66 auto-fallback 需要 #67 的 method/fallback 字段 |
| #67 → #76, #77, #68, #87 | 审计类全部依赖 capabilities schema 完整 |
| #89 P0 → #91, #92 | rate limiter 先行，再加新搜索引擎 |
| #98 → #99 | P5 ASR → P6 timeline fusion（#99 显式依赖 #98） |
| #100 可与 #98, #99 并行 | P7 cache 不改分析语义，只管执行和复用 |
| #101 依赖 #69 ✅, 推荐接 #100 | P8b temporal focus 需要 P4 window + 推荐 P7 cache |

---

## Execution Phases

按依赖拓扑排序。同 phase 内可并行（注意冲突文件标注）。

### Phase 0 — 立即可做（无依赖，纯机械/文档）

| # | Issue | Type | Conflict files | Notes |
|---|-------|------|---------------|-------|
| #83 | stock_api → stock_media rename | mechanical | source-registry.mjs + tests | 纯 find-replace，无行为变更 |
| #88 | Rename CDP script fields + universal Google site: fallback | mechanical + enhancement | source-registry.mjs, asset-sourcer.mjs, search-sources.mjs, tests, docs | Part 1: 纯 rename。Part 2: Google site: fallback 从 per-source config 改为 universal auto-generation。先做 #83 再做 #88 |
| #78 | DOCS-INDEX sync: 22 missing docs | docs only | DOCS-INDEX.md | 无代码变更 |

### Phase 1 — 核心功能增强

| # | Issue | Blocked by | Conflict files | Status |
|---|-------|-------------|---------------|--------|
| #67 | capabilities.articles schema 补全 | — | source-registry.mjs | ⚠️ ~70% done（method/apiKey/paidApi ✅, fallbacks array ❌） |
| #66 | extractScript auto-fallback | #67 | search-sources.mjs, cdp-client.mjs | per-site → Jina → generic eval → /extract |
| #63 | SVE: Single-Visit Extraction | #54 ✅, #55 ✅ | search-sources.mjs, asset-sourcer.mjs | enrichWithImages → enrichWithMedia |
| #51 | Cascade-filter audit (RAG BM25 pre-filter) | — | rag/query.mjs | ⚠️ item 1 done, item 2 (BM25) not implemented |

### Phase 2 — 审计类（依赖 #67 完成）

| # | Issue | Blocked by | Notes |
|---|-------|-------------|-------|
| #68 | Signal Density audit | #67 | ADR-0016 Rule 2 全管线排查 |
| #76 | SSOT violations audit | #67 | 隐式 schema 彻查 + types.mjs 创建 |
| #77 | Source type labeling audit | #67 | 59 源类型标注 + fallback 链完整性 |
| #87 | 88 manual maintenance items audit | #66, #63, #67 | 盘点 + fallback 覆盖率 |

### Phase 3 — 搜索基础设施

| # | Issue | Blocked by | Notes |
|---|-------|-------------|-------|
| #89 | Anti-bot rate limiter (P0-P2) | — | P0 rate-limiter.mjs → P1 backoff → P2 CAPTCHA detection。Parent of #91, #92 |
| #64 | Add free API sources | — (#53 ✅ preferred) | 13 候选 API，Brave 需注册 |
| #90 | MCP→API migration (Bigsong) | — | lib/bigsong-api.mjs 直接 HTTP 调用 |
| #65 | Search API Pool | #64, #90 | Jina > Brave > Tavily > Currents > Noozra > GNews > Grok |
| #91 | DuckDuckGo source | #89 P0 | Child of #89。html.duckduckgo.com，无 JS |
| #92 | SearXNG source | #89 P0 | Child of #89。Docker 自托管，269 引擎聚合 |
| #81 | Homepage-only sources search | — | WordPress REST API + in-site search + googleSiteFallback rename |

### Phase 4 — 视频管线 Phase 5-8b（线性序列）

P3-P4 已完成（#69 closed）。以下是 P5-P8b 的线性依赖链。

| # | Issue | Phase | Blocked by | Status |
|---|-------|-------|-------------|--------|
| #98 | Local ASR worker (WhisperX) | P5 | #69 ✅ | ready-for-agent |
| #99 | Deterministic media timeline fusion | P6 | #69 ✅, #98 | ready-for-agent |
| #100 | Content-addressed cache + scheduler | P7 | P3 ✅ (可与 #98/#99 并行) | ready-for-agent |
| #101 | Temporal Focus for video backgrounds | P8b | #69 ✅ (推荐接 #100) | ready-for-agent |

### Phase 5 — 独立增强

| # | Issue | Blocked by | Notes |
|---|-------|-------------|-------|
| #94 | Scene-level visual intent + evidence-media audit | — | 视觉意图契约 + MRL-2 报告。Child: #101 |
| #97 | WeChat RSS tracking — research & docs closure | — | 12 public feeds，evidence boundary 分组 |
| #103 | Docs: offload/split L1 video content workflows | #95 ✅ (PR #104 merged) | 文档架构任务，content-pipeline.md + video-workflow.md 瘦身。#106 review baseline 已 merge |
| #85 | Bloomberg paywall alternatives | — | 研究任务 |
| #75 | 替代下载方案（小红书/微博/抖音） | #54 ✅ | ⚠️ ~25% done（RedNote-MCP ✅, weibo/chubbyskills ❌, GPL 评估待定） |

### Phase 6 — 触发条件未满足（暂搁置）

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #21 | Multimodal RAG | 50+ images accumulated (当前 0) |
| #22 | RAG pre-work | articles >= 20 OR scene-data >= 10 (当前 3+7) |
| #29 | Analytics Workflow Part A | >10 published videos with analytics |
| #32 | yt-dlp full video + AI segment | needs-triage（功能未实现，当前只下载前 8s）。#99 完成后可消费 timeline |
| #35 | F5-TTS Multi-Reference Audio | 用户录制 4 段参考音频 |
| #60 | On-demand content audit | 设计讨论中，与 #61 合并 |
| #61 | Non-blocking evidence audit | 与 #60 合并讨论中 |

---

## Conflict Risk Matrix

同时改同一文件的 issues **必须串行执行**：

| File | Issues touching it | Risk |
|------|--------------------|------|
| `source-registry.mjs` | #83, #88, #67, #64, #81, #91, #92 | 🔴 最高——所有加源/改字段的 issue 都碰这个文件 |
| `asset-sourcer.mjs` | #66, #63, #75 | 🟡 中（#84 已 merge，搜索缓存已就位） |
| `search-sources.mjs` | #66, #63, #81, #65, #90 | 🔴 高 |
| `docs/content-pipeline.md` | #51, #94, #97, #103 | 🟡 中——#103 瘦身后其他 issue 指针需更新 |
| `docs/DOCS-INDEX.md` | #78, #97, #103 | 🟡 中——索引变更串行 |
| `scene-rules.mjs` / `scene-templates.mjs` | #94（可能） | 🟢 低 |

---

## Closed Issues (2026-08-21~22 Triage)

20 issues closed across three triage sessions (code verified + PR merges). Full details on GitHub.

| # | Issue | Reason |
|---|-------|--------|
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

1. **New session start**: 读本文档 → 检查 Phase 0-1 是否有可做项
2. **完成一个 issue**: 在对应表格行标 ✅，移到 Closed Issues 表
3. **新发现已完成**: 代码验证 → `gh issue close` + 评论证据 → 更新本文档
4. **新 issue 创建**: 添加到对应 Phase 表格；如果属于已有 parent，标注 `Child of #N`
5. **依赖变化**: 更新 Blocked by 列
6. **冲突检查**: 改代码前查 Conflict Risk Matrix，确认没有并行 issue 在改同一文件

# Issue Tracker — Open Issues Roadmap

GitHub Issues 依赖关系 + 执行顺序 + 状态追踪。每次 triage 后更新。

Last inventory: 2026-08-21 (29 locally tracked open issues after closing #95 and adding #103).

## Execution Phases

按依赖拓扑排序。同 phase 内可并行（注意冲突文件标注）。

### Phase 0 — 立即可做（无依赖，纯机械/文档）

| # | Issue | Type | Conflict files | Notes |
|---|-------|------|---------------|-------|
| #83 | stock_api → stock_media rename | mechanical | source-registry.mjs + tests | 纯 find-replace，无行为变更 |
| #88 | extractScript → articleScript etc. rename | mechanical | source-registry.mjs, asset-sourcer.mjs, search-sources.mjs, tests, docs | 影响面大（50 sources × 65 test refs × 80 doc refs），建议在 #63/#66 之前做以减少后续 diff |
| #78 | DOCS-INDEX sync: 22 missing docs | docs only | DOCS-INDEX.md | 无代码变更 |

### Phase 1 — 核心功能增强

| # | Issue | Blocked by | Conflict files | Status |
|---|-------|-------------|---------------|--------|
| #67 | capabilities.articles schema 补全 | — | source-registry.mjs | ⚠️ ~70% done（method/apiKey/paidApi ✅, fallbacks array ❌） |
| #66 | extractScript auto-fallback | #67 | search-sources.mjs, cdp-client.mjs | per-site → Jina → generic eval → /extract |
| #63 | SVE: Single-Visit Extraction | #54 ✅, #55 ✅ | search-sources.mjs, asset-sourcer.mjs | enrichWithImages → enrichWithMedia |
| #84 | Search-call caching | #54 ✅ | asset-sourcer.mjs | 与 #63 不冲突（#63 改 search-sources，#84 改 asset-sourcer） |
| #51 | Cascade-filter audit (RAG BM25 pre-filter) | — | rag/query.mjs | ⚠️ item 1 done, item 2 (BM25) not implemented |
| #103 | Offload and split Layer 1 video content workflows | #95 ✅ | content-pipeline.md, video-workflow.md, DOCS-INDEX.md | Chapter-level migration map → thin route/runbook → on-demand L1 references + L2 rationale; no pipeline-code change |

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
| #89 | Anti-bot rate limiter (P0-P2) | — | P0 rate-limiter.mjs → P1 backoff → P2 CAPTCHA detection |
| #64 | Add free API sources | — (#53 ✅ preferred) | 13 候选 API，Brave 需注册 |
| #90 | MCP→API migration (Bigsong) | — | lib/bigsong-api.mjs 直接 HTTP 调用 |
| #65 | Search API Pool | #64, #90 | Jina > Brave > Tavily > Currents > Noozra > GNews > Grok |
| #91 | DuckDuckGo source | #89 P0 | html.duckduckgo.com，无 JS |
| #92 | SearXNG source | #89 P0 | Docker 自托管，269 引擎聚合 |
| #81 | Homepage-only sources search | — | WordPress REST API + in-site search + googleSiteFallback rename |

### Phase 4 — 独立增强

| # | Issue | Blocked by | Notes |
|---|-------|-------------|-------|
| #85 | Bloomberg paywall alternatives | — | 研究任务 |
| #75 | 替代下载方案（小红书/微博/抖音） | #54 ✅ | ⚠️ ~25% done（RedNote-MCP ✅, weibo/chubbyskills ❌, GPL 评估待定） |

### Phase 5 — 触发条件未满足（暂搁置）

| # | Issue | Trigger condition |
|---|-------|-------------------|
| #21 | Multimodal RAG | 50+ images accumulated (当前 0) |
| #22 | RAG pre-work | articles >= 20 OR scene-data >= 10 (当前 3+7) |
| #29 | Analytics Workflow Part A | >10 published videos with analytics |
| #32 | yt-dlp full video + AI segment | needs-triage（功能未实现，当前只下载前 8s） |
| #35 | F5-TTS Multi-Reference Audio | 用户录制 4 段参考音频 |
| #60 | On-demand content audit | 设计讨论中 |
| #61 | Non-blocking evidence audit | 与 #60 合并讨论中 |

## Conflict Risk Matrix

同时改同一文件的 issues **必须串行执行**：

| File | Issues touching it |
|------|--------------------|
| `source-registry.mjs` | #83, #88, #67, #64, #81, #91, #92 — **最高冲突风险** |
| `asset-sourcer.mjs` | #66, #63, #84, #75 — 高冲突风险 |
| `search-sources.mjs` | #66, #63, #81, #65, #90 — 高冲突风险 |
| `scene-rules.mjs` / `scene-templates.mjs` | 无 open issue（#49, #86 已关闭） |
| `docs/content-pipeline.md` | #103 — 以 #95 已验证的双轨时序为基线做 L1 route-map 瘦身 |
| `docs/video-workflow.md` | #103 — 抽离低频 SOP 与研究性内容 |
| `docs/DOCS-INDEX.md` | #78, #103 — 索引变更串行，避免遗漏或覆盖文档归属 |

## Closed Issues (2026-08-21 Triage)

14 issues closed this session. Full details on GitHub.

| # | Issue | Reason |
|---|-------|--------|
| #36 | ai-analyzer → visual-analyzer rename | Code verified: completed |
| #44 | scoreCandidate() optimization | Code verified: completed |
| #49 | Hook Scene Media + Ken-Burns + Warning | Code verified: completed |
| #52 | Unified Source Registry (umbrella) | All sub-tickets #53-#59 verified |
| #53 | capabilities field | Code verified: completed |
| #54 | asset-sourcer imports from source-registry | Code verified: completed |
| #55 | extractScript imageUrl | Code verified: completed |
| #57 | pre-download filter gate | Code verified: completed |
| #58 | cascade order fix | Code verified: completed |
| #59 | ADR + CONTEXT.md docs | Dependencies all completed |
| #69 | P4 VLM Time Windows + Audit | Code verified: completed |
| #79 | DOCS-INDEX sync (dup #78) | Duplicate |
| #80 | DOCS-INDEX sync (dup #78) | Duplicate |
| #82 | Homepage-only sources (superseded by #81) | Superseded |
| #86 | Pipeline Generalization (7 subtasks) | Code verified: completed |
| #95 | Restore local dual-track article and video workflow | Docs verified: AGENTS.md, content-pipeline.md, manual-ops.md aligned; `npm run lint:docs` passes |

## Triage Protocol

1. **New session start**: 读本文档 → 检查 Phase 0-1 是否有可做项
2. **完成一个 issue**: 在对应表格行标 ✅，移到 Closed Issues 表
3. **新发现已完成**: 代码验证 → `gh issue close` + 评论证据 → 更新本文档
4. **新 issue 创建**: 添加到对应 Phase 表格
5. **依赖变化**: 更新 Blocked by 列

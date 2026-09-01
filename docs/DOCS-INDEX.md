# Documentation Index

> Source of truth for doc ownership. Use it to find any document in one lookup.
>
> _Last inventory: 2026-08-25._

## Canonical Structure

### Layer Definitions

| Layer | What goes here | What does NOT go here | Who reads it |
|-------|---------------|----------------------|-------------|
| **L0: AGENTS.md** (必读) | Pointers + top-level rules only | No technical details | Agent every session start |
| **L1: Execution reference** | Execution instructions: what to do, what params to use, how to configure. Loaded on-demand when doing that workflow | Research rationale, parameter derivation, multi-source comparison, methodology — push to L2, pointer from L1 bottom | Agent loaded on-demand when doing that workflow |
| **L2: Deep research** | Research rationale: why this was chosen, how params were derived, what sources were surveyed, methodology comparison | Execution instructions — extract to L1 as pointer targets | Agent only when deep-diving into specific topic |
| **L3: Archive** | Completed work: specs, tickets, roadmaps — retained for reference, no longer maintained | No active reference material | Historical reference only |

### Layer Placement Rules

修改文档时，先按 `AGENTS.md` → Coding Conventions → `writing-for-agents 强制加载` 判定是否加载 skill；随后应用本节的 Layer Placement 检查：

1. **L1/L2 boundary**: AGENTS.md Coding Conventions defines the boundary ("执行文档只写'做什么、用什么参数'；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，底部用 Design Decisions & References 索引指向"). These rules add the operational checks:
2. **New document: ask first.** Before writing, ask: "Is this execution instructions or research rationale?" → execution → L1; research → L2.
3. **Modifying an L1 doc: check for L2 intrusion.** If research rationale has crept in, extract it to L2 and add a pointer in the L1 doc bottom.
4. **L2 docs: no execution instructions.** L2 writes "why this was chosen, how params were derived, what was surveyed" — execution instructions belong in L1 as pointer targets.
5. **Sync DOCS-INDEX after changes.** After creating, moving, or deleting any doc, add/remove/rename the corresponding table row here. Run `npm run lint:docs` to verify.

### Root — Active reference (AGENTS.md pointers)

| Document | Purpose | Referenced by |
|----------|---------|---------------|
| `brand-system.md` | Brand visual identity — tokens, templates, rules | `brand-system` skill |
| `analytics-workflow.md` | TikTok Analytics 独立工作流 — CSV/CDP 导出、A/B 测试、hashtag 效果追踪、Analytics→Pipeline 联动机制、竞品参考视频分析 | `content-pipeline.md` Stage 0 + Stage 5, `video-workflow.md` |
| `article-production-guide.md` | Article generation rules — Widget decision tree, Frontmatter format, MRL-1 checklist, claim verification, source citation | `content-pipeline.md` Stage 1/2 |
| `content-pipeline.md` | Unified content pipeline route map — Stage 0–5, MRL/HITL gates, inputs/outputs, pointers to specialized references | AGENTS.md |
| `manual-ops.md` | Manual operations checklist, sorted by frequency | AGENTS.md |
| `media-asset-management.md` | Media asset placement rules + asset catalog & RAG integration | AGENTS.md |
| `tools-catalog.md` | All available tools, services, APIs, and candidate skills — integrated, evaluated, pipeline API candidates; scenario→tool decision table (Tavily fallback authority lives in AGENTS.md) | AGENTS.md |
| `installed-skills.md` | Agent skills overview — sources, invocation modes, MCP list, install commands | AGENTS.md |
| `tanstack-lovable-conventions.md` | Stack-level conventions for publishable build | AGENTS.md |
| `series-production-guide.md` | Multi-video series strategy — split evaluation, inter-episode linking, compilation, series publishing | `content-pipeline.md` Stage 3, `video-workflow.md` |
| `content-scaffold-guide.md` | New content pipeline scaffold — directory structure, file templates, CSS overflow checklist, visual style | `video-workflow.md` |
| `video-workflow.md` | Regular video-production runbook — TTS, B-roll generation (FastVideo), rendering, verify, file paths, publishing strategy, skill loading matrix | AGENTS.md |
| `video-script-writing-guide.md` | Short video script writing methodology — S.T.A.R.T. primary framework + AI Outline HITL tool + retention engine, per-scene asset requirements, hook/CTA formulas, W7/W8/W9 narrative checks | `content-pipeline.md` Stage 3 |
| `archive/handoff-video-layout-standard.md` | 视频布局安全区 session 交接（已归档，内容已集成到 `brand-system.md` Layout Safety 章节） | — |
| `archive/handoffs/handoff-qwen4-preview-pipeline-hardening.md` | Qwen4-preview 视频 + 管线加固 session 交接（已归档，发布由用户自洽） | — |
| `archive/spec-cta-end-card-standard.md` | 标准 CTA 结尾页设计（已归档） | video pipeline |
| `archive/spec-video-layout-safe-zones.md` | 视频布局安全区 + 槽位 + 竖向堆叠规范（已归档；现行行为见 brand-system.md） | video pipeline |

### `adr/` — Architecture Decision Records

Numbered sequence. Current: 0001–0018 (0006 moved to archive).

| ADR | Title | Status |
|-----|-------|--------|
| 0001 | Widget inline embedding via HTML comment markers | Active |
| 0002 | Supabase admin auth for programmatic DB writes | Active |
| 0003 | Widget registry as extension point | Active |
| 0004 | Env file strategy | Active |
| 0005 | Lovable file structure constraints | Active |
| 0006 | ~~Architecture deepening completed~~ | Moved to `archive/` |
| 0007 | RAG pipeline decisions | Active |
| 0008 | TTS engine: F5-TTS-MLX | Active |
| 0009 | VLM analysis layer: Qwen3-VL-2B via mlx-vlm | Active |
| 0010 | Remotion replaces Playwright | Active |
| 0011 | Unified venv | Active |
| 0012 | Cloud GPU: Kaggle + Colab | Active |
| 0013 | Asset sourcing three-layer | Active |
| 0014 | Git LFS strategy | Active |
| 0015 | Visual focus detection: OpenCV subprocess | Active |
| 0016 | Cascade filtering & signal density | Active |
| 0017 | Widget breakout layout | Active |
| 0018 | S.T.A.R.T. as primary script framework, AI Outline as HITL tool | Active |

### `conventions/` — Engineering conventions

| Document | Purpose |
|----------|---------|
| `scenario-enumeration-checklist.md` | Boundary scenario enumeration checklist |
| `scenario-matrix.md` | Spec scenario matrix format (Modified Files Impact + Behavioral Scenarios) |
| `fact-verification.md` | PSR item-4 operational procedures (source verification chain, CLI confirmation, pricing lookup, tool maintenance check) |
| `visual-design-loop.md` | Visual design iteration loop — impeccable skill workflow for video template polish |

### `tiktok/` — TikTok guides

| Document | Purpose |
|----------|---------|
| `tiktok-best-practices.md` | 2025-2026 best practices (signal weights, voice rules, hooks, audit checklist) |
| `tiktok-developer-setup.md` | TikTok API publishing setup guide |
| `tiktok-do-dont.md` | Do/Don't comparison guide |
| `tiktok-profile-setup.md` | Brand profile setup (one-time reference) |
| `ab-testing-methodology.md` | Element iteration method — single-variable A/B testing philosophy |
| `tiktok-analytics-review.md` | TikTok Analytics 定期复盘模板 — 周期性复制模板、CDP 抓取数据、制定行动计划 |

### `video/` — Video roadmap

| Document | Purpose |
|----------|---------|
| `video-automation-roadmap.md` | Video automation phased roadmap (ISSUE-01~14) |

### Root-level tracking docs

| Document | Purpose |
|----------|---------|
| `issue-tracker.md` | Open GitHub Issues 依赖关系 + 执行顺序 + 状态追踪 — 每次 triage 后更新 |

### `handoffs/` — Session handoffs

Active handoffs only. Completed handoffs archived to `archive/handoffs/`.

| Document | Purpose |
|----------|---------|
| `handoff-add-free-api-sources.md` | Adding free API sources (Guardian, NYT, Semantic Scholar, etc.) to source-registry (Issue #64 OPEN) |
| `handoff-extractscript-autofix.md` | articleScript 自动修复 + warn + health 追踪 (Issue #66 OPEN) |
| `handoff-on-demand-audit.md` | On-Demand Content Audit feature design (Issue #60/#61 OPEN) |
| `handoff-search-api-pool.md` | Search API Pool — 多搜索 API 轮转调度 (Issue #65 OPEN) |
| `handoff-vlm-cascade-router-2026-08-27.md` | VLM Cascade Router 调研完成 (Issue #127 OPEN) |
| `handoff-infinitetalk-modal-2026-08-28.md` | InfiniteTalk Modal 推理 handoff（状态：推理运行中） |

### `reviews/` — Active review records

Review 文档与 spec/ticket 同生命周期：审查期间存在，结论被吸收后归档到 `archive/reviews/`。以下为对应 issue 仍开着的 review。

| Document | Purpose |
|----------|---------|
| `source-registry-capability-audit-2026-08-19.md` | #77 Source registry capability 标注核查报告（W3 待做） |
| `source-registry-capability-audit-2026-08-19-matrix.csv` | Source registry capability audit matrix (CSV) |

### `archive/` — Completed work

Historical specs, tickets, and roadmaps. Retained for reference, no longer maintained. See `archive/README.md` for the full list.

### `specs/` — Active specs

| Document | Purpose |
|----------|---------|
| `specs/adr-0008-0014-remediation-tracker.md` | ADR 0008–0014 修复执行追踪器 |
| `specs/spec-asset-first-hook-media-focus-detection.md` | 素材先行 + Hook 场景 Media 支持 + OpenCV 焦点检测提案 |
| `specs/spec-media-patch-apply.md` | Media-patch apply workflow spec |
| `specs/spec-pipeline-generalization.md` | Pipeline generalization — verification intelligence, media upscale, currency auto-fix, layout & chart template |
| `specs/spec-research-evidence-pipeline.md` | Research evidence pipeline spec |
| `specs/spec-vlm-semantic-merge-remediation.md` | VLM semantic merge remediation (P0 + P1) spec |
| `specs/spec-wechat2rss-source-tracking.md` | Wechat2RSS 第三方公众号追踪接入规格 |
| `specs/spec-agents-md-restructure.md` | AGENTS.md restructure spec — three-tier routing + unified PSR gate + layered slimming (proposal v3, two review rounds) |

### `proposals/` & `tickets/` — Ephemeral work docs

| Document | Purpose |
|----------|---------|
| `proposals/proposal-agents-md-restructure.md` | AGENTS.md restructure proposal (v3, conditionally approved; archive after rollout per #167) |
| `tickets/tickets-agents-md-restructure.md` | 10 tracer-bullet tickets for the AGENTS.md restructure (T0–T7b) |

### Root-level active specs & tickets

| Document | Purpose |
|----------|---------|
| `spec-hook-media-support.md` | Hook scene media support + narrative Ken-Burns + warning summary spec |
| `spec-vlm-fit-focus.md` | VLM-driven fit/focus for landscape assets in vertical video spec |
| `spec-issue-56-84-pr102-refresh.md` | Refresh PR #102 on current asset sourcer spec |
| `tickets-issue-56-84-pr102-refresh.md` | Tickets for PR #102 refresh |

### `refs/` — Reference materials

External reference repos and source materials. Not project documentation.

### `research/` — Research reports

Deep research reports with citations.

| Document | Purpose |
|----------|---------|
| `agent-driven-video-editing-research.md` | Agent-driven video editing automation research |
| `anti-bot-scraping-solutions.md` | Anti-bot scraping solutions — bypass strategies and alternative search engines |
| `asset-focus-detection-alternatives.md` | 素材重点内容检测替代方案 — OpenCV Saliency vs VLM vs YOLO/SAM 对比 |
| `vlm-model-selection-benchmark.md` | VLM model selection benchmark — Qwen3-VL 2B/4B/8B comparison with local test data |
| `asset-source-quick-reference.md` | Quick reference for all content sources (multimedia + text) — API keys, auth, licenses |
| `audio-drift-fix.md` | Audio drift root cause analysis, fix implementation, sync verification, diagnostics |
| `china-ai-article-pipeline-2026.md` | Article pipeline research — content strategy, widget design, SEO |
| `china-ai-hashtag-mapping.md` | China AI entity → TikTok hashtag mapping (60+ entities, 7 tiers: Big Tech, startups, AI chips, robotics, autonomous driving, international competitors, product brands) | `caption-utils.mjs` ENTITY_HASHTAG_MAP, `tiktok-best-practices.md` Hashtag 策略 |
| `china-digital-human-api-alternatives.md` | Digital human API alternatives in mainland China |
| `cloud-gpu-options.md` | Cloud GPU options — free tier + paid rental (Kaggle, Colab, Lightning AI, AutoDL) + HuggingFace LFS 下载策略（curl -L vs hf_hub_download, Kaggle CLI --dir-mode 陷阱, Colab WebSocket 超时） |
| `colab-cli-guide.md` | Google Colab CLI guide — gcloud setup, kernel push/pull, GPU smoke test |
| `digital-human-references.md` | Offloaded reference material — papers, code repos, cloud platforms, market research for digital human models |
| `digital-human-solutions-m2-pro.md` | Digital human solutions for Apple M2 Pro 32GB — pointers to references and cloud-gpu-options |
| `echomimicv3-optimization-options.md` | EchoMimicV3 optimization options — Kaggle GPU test results, config tuning |
| `friendly-search-engines-comparison.md` | Friendly search engines comparison — CDP vs API, anti-bot resistance, result quality |
| `free-llm-api-options.md` | 免费 LLM API 方案对比 — 合规的程序化 LLM 调用路径（官方 API / Puter.js User-Pays / 免费替代平台）+ 实测吞吐量数据 |
| `digital-human-test-progress.md` | Digital human model test progress tracking — pointers to cloud-gpu-options for detailed analysis |
| `media-asset-strategy.md` | Media asset strategy — acquisition, integration, animation (1000+ lines) |
| `golden-asset-evaluation.md` | Golden asset evaluation — benchmark criteria for media asset quality scoring |
| ~~`issue-tracker-review.md`~~ | ✅ 已归档至 `docs/archive/reviews/issue-tracker-review-2026-08-26.md` — 19/19 项全部修复后归档 |
| `writing-for-agents-enforcement-proposal.md` | `writing-for-agents` 规则执行率改善方案（待审核结论吸收） |
| `model-sources-reference.md` | Model search sources reference — sources, format guide, GPU compat checklist, search flow, admission criteria & scoring |
| `multi-video-splitting-best-practices.md` | Video splitting strategy, inter-episode linking, auto-evaluator |
| `open-source-video-generation-landscape-2026.md` | Open-source video generation landscape 2026 — model/engine comparison, local Apple Silicon viability |
| `pipeline-simplification-discussion.md` | Pipeline simplification discussion — Stage 0 unification, category rename, locale field |
| `reference-video-extraction.md` | Reference video extraction — long-term backlog task |
| `source-layer-comparison.md` | Source layer comparison — CDP vs MCP vs API, capability matrix per source |
| `safe-zone-calibration-log.md` | Safe zone calibration log with FYP screenshot evidence |
| `short-video-script-writing-best-practices.md` | Short video script writing best practices — S.T.A.R.T. framework, psychological retention engines, hook formulas, 15 sources |
| `video-background-coverage-audit-2026-08-21.md` | 视频背景视觉承载审查结论 — 现状覆盖率、实现缺口与场景级视觉意图建议 |
| `wechat-rss-tracking-mechanisms.md` | WeChat RSS tracking mechanisms — Wechat2RSS, third-party feeds, verified sources |
| `tailscale-remote-gpu-setup.md` | NVIDIA machine deployment — Tailscale + SSH + WSL2 setup guide |
| `text-auto-fit-landscape-research.md` | 文本自动适配两轮 deep research — 官方 layout-utils 边界、行业方案对比、官方能力利用审计；spec 决策 57–62（T6 pivot）的决策依据 |
| `tiktok-color-scheme-research.md` | TikTok video color scheme — dark vs bright impact on engagement |
| `tiktok-competitor-intelligence.md` | TikTok competitor intelligence — 16 competitor videos + hashtag frequency, description patterns, self-video analytics (§3) |
| `tiktok-creator-tools.md` | TikTok Creator Tools evaluation — Creator Academy + Research API integration assessment for pipeline and analytics |
| `tiktok-hook-patterns-best-practices.md` | TikTok hook P1-P6 pattern system + fill-in-the-blank templates — CDP research, pattern occurrence matrix, scaffold design |
| `tiktok-hook-patterns-wide-research-assessment.md` | TikTok hook patterns research — wide assessment and source evaluation |
| `tiktok-practical-guide-2026.md` | TikTok practical methodology 2026 |
| `voice-cloning-solutions-m2-pro.md` | Voice cloning / TTS model research for Apple M2 Pro 32GB |
| `voice-prosody-hook-optimization.md` | Per-scene pitch/tempo prosody enhancement — 15 sources, parameter rationale |
| `windows-gpu-analysis.md` | Windows device digital human model feasibility analysis & upgrade plan |
| `windows-gpu-test-progress.md` | Windows digital human model test progress tracking |

## Spec/Ticket/Review Lifecycle

Specs, tickets, and reviews are **ephemeral** — they exist only during implementation or review, then archive.

1. `/to-spec` creates `spec-<name>.md` (in `docs/` root or a `specs/` subdir if multiple are active)
2. `/to-tickets` creates `tickets-<name>.md` alongside the spec
3. `/implement` builds each ticket via TDD
4. **Code review** produces `*-review.md` in `docs/reviews/` or `docs/research/`
5. **On completion**: move spec/tickets/review files to `archive/` (specs+tickets → `archive/`, reviews → `archive/reviews/`), update this index

No `specs/` or `tickets/` directories persist between work cycles. They are created on demand and cleaned up when the work ships. Review files stay in `docs/reviews/` or `docs/research/` only while the corresponding issue is open; once the issue is closed and verified, the review archives.

## Redirect Rule

If a topic is historical or split-legacy, keep a short pointer in `archive/README.md` and move all normative content to one canonical file only.

# Documentation Index

> Source of truth for doc ownership. Use it to find any document in one lookup.
>
> _Last inventory: 2026-08-15._

## Canonical Structure

### Layer Definitions

| Layer | What goes here | What does NOT go here | Who reads it |
|-------|---------------|----------------------|-------------|
| **L0: AGENTS.md** (必读) | Pointers + top-level rules only | No technical details | Agent every session start |
| **L1: Execution reference** | Execution instructions: what to do, what params to use, how to configure. Loaded on-demand when doing that workflow | Research rationale, parameter derivation, multi-source comparison, methodology — push to L2, pointer from L1 bottom | Agent loaded on-demand when doing that workflow |
| **L2: Deep research** | Research rationale: why this was chosen, how params were derived, what sources were surveyed, methodology comparison | Execution instructions — extract to L1 as pointer targets | Agent only when deep-diving into specific topic |
| **L3: Archive** | Completed work: specs, tickets, roadmaps — retained for reference, no longer maintained | No active reference material | Historical reference only |

### Layer Placement Rules

Before writing or modifying any document under `docs/`, load the `writing-for-agents` skill (AGENTS.md → Coding Conventions → `writing-for-agents 强制加载`), then apply these rules:

1. **L1/L2 boundary**: AGENTS.md Coding Conventions defines the boundary ("执行文档只写'做什么、用什么参数'；研究依据和方法论放 `docs/research/` 或 `docs/tiktok/`，底部用 Design Decisions & References 索引指向"). These rules add the operational checks:
2. **New document: ask first.** Before writing, ask: "Is this execution instructions or research rationale?" → execution → L1; research → L2.
3. **Modifying an L1 doc: check for L2 intrusion.** If research rationale has crept in, extract it to L2 and add a pointer in the L1 doc bottom.
4. **L2 docs: no execution instructions.** L2 writes "why this was chosen, how params were derived, what was surveyed" — execution instructions belong in L1 as pointer targets.
5. **Sync DOCS-INDEX after changes.** After creating, moving, or deleting any doc, add/remove/rename the corresponding table row here. Run `npm run lint:docs` to verify.

### Root — Active reference (AGENTS.md pointers)

| Document | Purpose | Referenced by |
|----------|---------|---------------|
| `brand-system.md` | Brand visual identity — tokens, templates, rules | `brand-system` skill |
| `analytics-workflow.md` | TikTok Analytics 独立工作流 — CSV 导出、A/B 测试、数据驱动优化建议、竞品参考视频分析 | `content-pipeline.md` Stage 6, `manual-ops.md` |
| `content-pipeline.md` | Unified content pipeline (article → publish → video → TikTok → analytics) | AGENTS.md |
| `manual-ops.md` | Manual operations checklist, sorted by frequency | AGENTS.md |
| `media-asset-management.md` | Media asset placement rules + asset catalog & RAG integration | AGENTS.md |
| `tools-catalog.md` | All available tools, services, APIs, and candidate skills — integrated, evaluated, pipeline API candidates | AGENTS.md |
| `tanstack-lovable-conventions.md` | Stack-level conventions for publishable build | AGENTS.md |
| `video-workflow.md` | Video production workflow — TTS, publishing, file paths | AGENTS.md |
| `video-script-writing-guide.md` | Short video script writing methodology — S.T.A.R.T. framework, open loops, hook/CTA formulas, beat-by-beat iteration | `content-pipeline.md` Stage 3 |
| `handoffs/video-layout-standard.md` | 视频布局安全区 session 交接（已完成，内容已集成到 `brand-system.md` Layout Safety 章节） | — |
| `archive/spec-cta-end-card-standard.md` | 标准 CTA 结尾页设计（已归档） | video pipeline |
| `archive/spec-video-layout-safe-zones.md` | 视频布局安全区 + 槽位 + 竖向堆叠规范（已归档；现行行为见 brand-system.md） | video pipeline |

### `adr/` — Architecture Decision Records

Numbered sequence. Current: 0001–0006.

### `conventions/` — Engineering conventions

| Document | Purpose |
|----------|---------|
| `scenario-enumeration-checklist.md` | Boundary scenario enumeration checklist |
| `scenario-matrix.md` | Spec scenario matrix format (Modified Files Impact + Behavioral Scenarios) |

### `tiktok/` — TikTok guides

| Document | Purpose |
|----------|---------|
| `tiktok-best-practices.md` | 2025-2026 best practices (signal weights, voice rules, hooks, audit checklist) |
| `tiktok-developer-setup.md` | TikTok API publishing setup guide |
| `tiktok-do-dont.md` | Do/Don't comparison guide |
| `tiktok-profile-setup.md` | Brand profile setup (one-time reference) |
| `ab-testing-methodology.md` | Element iteration method — single-variable A/B testing philosophy |

### `video/` — Video roadmap

| Document | Purpose |
|----------|---------|
| `video-automation-roadmap.md` | Video automation phased roadmap (ISSUE-01~14) |

### `archive/` — Completed work

Historical specs, tickets, and roadmaps. Retained for reference, no longer maintained. See `archive/README.md` for the full list (39 files).

### `refs/` — Reference materials

External reference repos and source materials. Not project documentation.

### `research/` — Research reports

Deep research reports with citations.

| Document | Purpose |
|----------|---------|
| `agent-driven-video-editing-research.md` | Agent-driven video editing automation research |
| `asset-focus-detection-alternatives.md` | 素材重点内容检测替代方案 — OpenCV Saliency vs VLM vs YOLO/SAM 对比 |
| `asset-source-quick-reference.md` | Quick reference for all content sources (multimedia + text) — API keys, auth, licenses |
| `audio-drift-fix.md` | Audio drift root cause analysis, fix implementation, sync verification, diagnostics |
| `china-ai-article-pipeline-2026.md` | Article pipeline research — content strategy, widget design, SEO |
| `china-digital-human-api-alternatives.md` | Digital human API alternatives in mainland China |
| `cloud-gpu-options.md` | Cloud GPU options — free tier + paid rental (Kaggle, Colab, Lightning AI, AutoDL) |
| `digital-human-solutions-m2-pro.md` | Digital human solutions for Apple M2 Pro 32GB |
| `golden-asset-evaluation.md` | Golden Asset evaluation for VLM quality — test set design, human expectations, model/prompt versions, testing strategy |
| `digital-human-test-progress.md` | Digital human model test progress tracking |
| `media-asset-strategy.md` | Media asset strategy — acquisition, integration, animation (1000+ lines) |
| `model-sources-reference.md` | Model search sources reference |
| `multi-video-splitting-best-practices.md` | Video splitting strategy, inter-episode linking, auto-evaluator |
| `reference-video-extraction.md` | Reference video extraction — long-term backlog task |
| `safe-zone-calibration-log.md` | Safe zone calibration log with FYP screenshot evidence |
| `short-video-script-writing-best-practices.md` | Short video script writing best practices — S.T.A.R.T. framework, psychological retention engines, hook formulas, 15 sources |
| `tailscale-remote-gpu-setup.md` | NVIDIA machine deployment — Tailscale + SSH + WSL2 setup guide |
| `tiktok-color-scheme-research.md` | TikTok video color scheme — dark vs bright impact on engagement |
| `tiktok-practical-guide-2026.md` | TikTok practical methodology 2026 |
| `voice-cloning-solutions-m2-pro.md` | Voice cloning / TTS model research for Apple M2 Pro 32GB |
| `voice-prosody-hook-optimization.md` | Per-scene pitch/tempo prosody enhancement — 15 sources, parameter rationale |
| `windows-gpu-analysis.md` | Windows device digital human model feasibility analysis & upgrade plan |
| `windows-gpu-test-progress.md` | Windows digital human model test progress tracking |

## Spec/Ticket Lifecycle

Specs and tickets are **ephemeral** — they exist only during implementation, then archive.

1. `/to-spec` creates `spec-<name>.md` (in `docs/` root or a `specs/` subdir if multiple are active)
2. `/to-tickets` creates `tickets-<name>.md` alongside the spec
3. `/implement` builds each ticket via TDD
4. **On completion**: move both files to `archive/`, update this index

No `specs/` or `tickets/` directories persist between work cycles. They are created on demand and cleaned up when the work ships.

## Redirect Rule

If a topic is historical or split-legacy, keep a short pointer in `archive/README.md` and move all normative content to one canonical file only.

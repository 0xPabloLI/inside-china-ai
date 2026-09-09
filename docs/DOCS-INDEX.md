# Documentation Index

> Source of truth for doc ownership. Use it to find any document in one lookup.
>
> _Last inventory: 2026-09-02._

## Canonical Structure

### Layer Definitions

| Layer                       | What goes here                                                                                                       | What does NOT go here                                                                                               | Who reads it                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **L0: AGENTS.md** (必读)    | Pointers + top-level rules only                                                                                      | No technical details                                                                                                | Agent every session start                       |
| **L1: Execution reference** | Execution instructions: what to do, what params to use, how to configure. Loaded on-demand when doing that workflow  | Research rationale, parameter derivation, multi-source comparison, methodology — push to L2, pointer from L1 bottom | Agent loaded on-demand when doing that workflow |
| **L2: Deep research**       | Research rationale: why this was chosen, how params were derived, what sources were surveyed, methodology comparison | Execution instructions — extract to L1 as pointer targets                                                           | Agent only when deep-diving into specific topic |
| **L3: Archive**             | Completed work: specs, tickets, plans, roadmaps — retained for reference, no longer maintained                       | No active reference material                                                                                        | Historical reference only                       |

### Layer Placement Rules

创建、移动、删除、重命名或结构性修改 `AGENTS.md`、`docs/`、skill 或其他 Agent-reached 文档前，先按 `AGENTS.md` → Workflow Router → Agent documents 加载 `writing-for-agents`；随后应用本节的 Layer Placement 检查：

1. **L1/L2 boundary**: 执行文档只写“做什么、用什么参数”；研究依据、参数推导和方法比较放 `docs/research/` 或相应的 L2 目录，并由 L1 底部的 Design Decisions & References 指向。
2. **New document: ask first.** Before writing, ask: "Is this execution instructions or research rationale?" → execution → L1; research → L2.
3. **Modifying an L1 doc: check for L2 intrusion.** If research rationale has crept in, extract it to L2 and add a pointer in the L1 doc bottom.
4. **L2 docs: no execution instructions.** L2 writes "why this was chosen, how params were derived, what was surveyed" — execution instructions belong in L1 as pointer targets.
5. **Sync DOCS-INDEX after changes.** After creating, moving, or deleting any doc, add/remove/rename the corresponding table row here. Run `npm run lint:docs` to verify.
6. **Compression/restructure audit.** Check (a) cross-section and cross-document qualifiers for contradictions, (b) every moved information field has a destination rather than merely an existing pointer, and (c) every changed local pointer resolves to a real file.

### Root — Active reference (AGENTS.md pointers)

| Document                                                       | Purpose                                                                                                                                                                                     | Referenced by                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `brand-system.md`                                              | Brand visual identity — tokens, templates, rules                                                                                                                                            | `brand-system` skill                                         |
| `brand-voice-profile.md`                                       | Brand text voice — 表达 DNA / 决策启发式 / 反模式 / 诚实边界四件套，逐条带语料例句 + 写作自检清单；结构层仍归 `video-script-writing-guide.md`                                                | `brand-system` / `writing-beats` / `copywriting` skills      |
| `analytics-workflow.md`                                        | TikTok Analytics 独立工作流 — CSV/CDP 导出、A/B 测试、hashtag 效果追踪、Analytics→Pipeline 联动机制、竞品参考视频分析                                                                       | `content-pipeline.md` Stage 0 + Stage 5, `video-production-runbook.md` |
| `article-humanize-patterns-2026-09-04.md`                      | Article humanize 模式来源与阈值依据（MRL-1 B9/W7/W8/W9、W1 阈值）— Wikipedia "Signs of AI writing" 35 条清单等；执行规则唯一权威版本在 `article-production-guide.md` MRL-1                  |
| `article-production-guide.md`                                  | Article generation rules — Widget decision tree, Frontmatter format, MRL-1 checklist, claim verification, source citation                                                                   | `content-pipeline.md` Stage 1/2                              |
| `content-pipeline.md`                                          | Unified content pipeline route map — Stage 0–5, MRL/HITL gates, inputs/outputs, pointers to specialized references                                                                          | AGENTS.md                                                    |
| `manual-ops.md`                                                | Manual operations checklist, sorted by frequency                                                                                                                                            | `content-pipeline.md`                                        |
| `selector-auto-healing.md`                                     | CDP 选择器自愈 runbook — selector-health.mjs 发现 → agent 修复步骤 → 验证；只改选择器的边界与修复台账（#140 P5）                                                                             | issue #140, `#200` sourceHealth                              |
| `media-asset-management.md`                                    | Media asset placement rules + asset catalog & RAG integration                                                                                                                               | AGENTS.md                                                    |
| `tools-catalog.md`                                             | All available tools, services, APIs, and candidate skills — integrated, evaluated, pipeline API candidates; scenario→tool decision table (Tavily fallback authority lives in AGENTS.md)     | AGENTS.md                                                    |
| `installed-skills.md`                                          | Agent skills overview — sources, invocation modes, MCP list, install commands                                                                                                               | AGENTS.md                                                    |
| `tanstack-lovable-conventions.md`                              | Stack-level conventions for publishable build                                                                                                                                               | AGENTS.md                                                    |
| `series-production-guide.md`                                   | Multi-video series strategy — split evaluation, inter-episode linking, compilation, series publishing                                                                                       | `content-pipeline.md` Stage 3, `video-production-runbook.md`           |
| `content-scaffold-guide.md`                                    | New content pipeline scaffold — directory structure, file templates, CSS overflow checklist, visual style                                                                                   | `video-production-runbook.md`                                          |
| `video-production-runbook.md`                                            | Regular video-production runbook — preflight, TTS/audio conversion, B-roll generation (FastVideo), rendering, verify, file paths, publishing strategy, skill loading matrix                 | AGENTS.md                                                    |
| `video-script-writing-guide.md`                                | Short video script writing methodology — S.T.A.R.T. primary framework + AI Outline HITL tool + retention engine, per-scene asset requirements, hook/CTA formulas, W7/W8/W9 narrative checks | `content-pipeline.md` Stage 3                                |
| `archive/handoff-video-layout-standard.md`                     | 视频布局安全区 session 交接（已归档，内容已集成到 `brand-system.md` Layout Safety 章节）                                                                                                    | —                                                            |
| `archive/handoffs/handoff-qwen4-preview-pipeline-hardening.md` | Qwen4-preview 视频 + 管线加固 session 交接（已归档，发布由用户自洽）                                                                                                                        | —                                                            |
| `archive/spec-cta-end-card-standard.md`                        | 标准 CTA 结尾页设计（已归档）                                                                                                                                                               | video pipeline                                               |
| `archive/spec-video-layout-safe-zones.md`                      | 视频布局安全区 + 槽位 + 竖向堆叠规范（已归档；现行行为见 brand-system.md）                                                                                                                  | video pipeline                                               |

### `adr/` — Architecture Decision Records

**Architecture Principles（#76 TODO ③，跨 ADR 索引）**：

| 原则 | 记录位置 | 追踪 issue |
| ---- | -------- | ---------- |
| Cascade — cheap filters first, expensive processing last | ADR-0016 | ~~#51~~ ✅ |
| Signal Density — one expensive call produces multiple signals | ADR-0016 + `docs/reviews/signal-density-audit-2026-09-06.md` | ~~#68~~ ✅ → #198 |
| Single Source of Truth — registry/capabilities/schema 单一事实来源 | ADR-0013 + `docs/reviews/ssot-audit-2026-09-06.md` | #76 |
| Single-Visit Extraction (SVE) — each URL visited once, extracts all resource types | `docs/archive/handoffs/handoff-sve-media-extraction.md`（epic 收官，spec/tickets 归档 docs/archive/spec-sve-single-visit-extraction.md） | ~~#62/#63~~ ✅ |

Numbered sequence. Current: 0001–0019 (0006 moved to archive).

| ADR  | Title                                                           | Status              |
| ---- | --------------------------------------------------------------- | ------------------- |
| 0001 | Widget inline embedding via HTML comment markers                | Active              |
| 0002 | Supabase admin auth for programmatic DB writes                  | Active              |
| 0003 | Widget registry as extension point                              | Active              |
| 0004 | Env file strategy                                               | Active              |
| 0005 | Lovable file structure constraints                              | Active              |
| 0006 | ~~Architecture deepening completed~~                            | Moved to `archive/` |
| 0007 | RAG pipeline decisions                                          | Active              |
| 0008 | TTS engine: F5-TTS-MLX                                          | Superseded by 0019  |
| 0009 | VLM analysis layer: Qwen3-VL-2B via mlx-vlm                     | Active              |
| 0010 | Remotion replaces Playwright                                    | Active              |
| 0011 | Unified venv                                                    | Active              |
| 0012 | Cloud GPU: Kaggle + Colab                                       | Active              |
| 0013 | Asset sourcing three-layer                                      | Active              |
| 0014 | Git LFS strategy                                                | Active              |
| 0015 | Visual focus detection: OpenCV subprocess                       | Active              |
| 0016 | Cascade filtering & signal density                              | Active              |
| 0017 | Widget breakout layout                                          | Active              |
| 0018 | S.T.A.R.T. as primary script framework, AI Outline as HITL tool | Active              |
| 0019 | TTS engine: CosyVoice3-Kaggle-CUDA                              | Active              |

### `conventions/` — Engineering conventions

| Document                            | Purpose                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scenario-enumeration-checklist.md` | Boundary scenario enumeration checklist                                                                                                |
| `scenario-matrix.md`                | Spec scenario matrix format (Modified Files Impact + Behavioral Scenarios)                                                             |
| `fact-verification.md`              | Operational procedures for proposal-review §3/§4 (source verification chain, CLI confirmation, pricing lookup, tool maintenance check) |
| `visual-design-loop.md`             | Visual design iteration loop — impeccable skill workflow for video template polish                                                     |
| `test-env-baseline.md`              | Known environment-dependent test failures — rerun-in-isolation rule, per-suite env causes, node version drift                          |

### `agents/` — Agent execution references

| Document                     | Purpose                                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `implementation-workflow.md` | Automatic risk × planning-scale implementation workflow and Matt skill adaptation                                                                                  |
| `git-workflow.md`            | Git safety, worktrees, commit cadence, review baseline, push and PR rules + concurrent sessions and orphan-commit recovery + Session-Id provenance (hook-enforced) |
| `git-concurrent-recovery.md` | 竞态应急配方（git-workflow §9 指向）：临时 index 隔离提交、孤儿提交找回、单文件恢复；含试点收尾复评触发条款                                                        |
| `proposal-review.md`         | Evidence, impact, external-fact, tool-admission and model-parameter proposal checks                                                                                |
| `issue-tracker.md`           | GitHub Issues operations and roadmap pointer                                                                                                                       |
| `triage-labels.md`           | Canonical issue category and state labels                                                                                                                          |
| `domain.md`                  | Domain context and ADR layout                                                                                                                                      |

### `tiktok/` — TikTok guides

| Document                     | Purpose                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `tiktok-best-practices.md`   | 2025-2026 best practices (signal weights, voice rules, hooks, audit checklist) |
| `tiktok-developer-setup.md`  | TikTok API publishing setup guide                                              |
| `tiktok-do-dont.md`          | Do/Don't comparison guide                                                      |
| `tiktok-profile-setup.md`    | Brand profile setup (one-time reference)                                       |
| `ab-testing-methodology.md`  | Element iteration method — single-variable A/B testing philosophy              |
| `tiktok-analytics-review.md` | TikTok Analytics 定期复盘模板 — 周期性复制模板、CDP 抓取数据、制定行动计划     |

### Root-level tracking docs

| Document           | Purpose                                                                |
| ------------------ | ---------------------------------------------------------------------- |
| `issue-roadmap.md` | Open GitHub Issues 依赖关系 + 执行顺序 + 状态追踪 — 每次 triage 后更新 |

### `handoffs/` — Session handoffs

Active handoffs only. Completed handoffs archived to `archive/handoffs/`.

| Document                                      | Purpose                                                                                             |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `tts-indian-accent-handoff.md`                 | TTS 印度口音回归 handoff（CosyVoice3-Kaggle-CUDA deepseek-v41-flash；基线样本参数未记录，未解决待处理；issue #234） |
| `handoff-on-demand-audit.md`                  | On-Demand Content Audit feature design (Issue #60/#61 OPEN)                                         |
| `handoff-qwen4-preview-r2-visual-audit.md`     | qwen4-preview R2 视觉审计 — 仅诊断+方案设计未改代码，渲染 6 FAIL 待独立 triage（2026-09-06 补登） |

### `reviews/` — Active review records

Review 文档与 spec/ticket 同生命周期：审查期间存在，结论被吸收后归档到 `archive/reviews/`。以下为对应 issue 仍开着的 review。

| Document                                                 | Purpose                                                                                                                                                                                                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`source-registry-capability-audit-2026-08-19.md`~~     | ✅ 已归档至 `archive/reviews/`（#77 已关闭，被 research/source-capabilities-audit.md 取代）
| `signal-density-audit-2026-09-06.md`                     | Signal Density 审计（#68，ADR-0016 Rule 2）— 设计时调用点全面达标（5 条 Already applied 成立、VLM 8 信号）；6 项残留违规 → #198（render 4-pass ffmpeg、TTS 无跨 run 缓存、VLM crop hint 断层等）
| `ssot-audit-2026-09-06.md`                               | SSOT 违规审计（#76）— 开票 5 项违规 4 项已解决（REMOTION_SLOT_MAP 双侧强制等）；2 项高影响（NO_MEDIA_TYPES 双份、validateDiscovery 无生产消费者）→ #199；types.mjs TODO 的不做判断；DOCS-INDEX Architecture Principles 表为本票 TODO ③ 交付
| `maintenance-audit-2026-09-06.md`                        | 88 项手工维护条目审计（#87，64 源时代重新盘点）— 5 类缺口 4 类翻绿（兜底链完整）；唯一仍成立痛点=静默 0 结果 → #200；新增维护面 5 项大多已在 #77 在案；结论「可接受人工」为主 |                                                                                                                    |
| ~~`source-registry-capability-audit-2026-08-19-matrix.csv`~~ | ✅ 已归档至 `archive/reviews/`（随主报告）
| ~~`session-id-provenance-review-brief-2026-09-04.md`~~ | ✅ 已归档至 `archive/reviews/`（提案 v5 已结项，复核意见全部吸收进 proposal 与 git-workflow.md §8）
| `ponytail-adoption-review-brief-2026-09-04.md`           | ponytail 改造的第三方独立复核材料 **v3** — 上游分层体积实测（固定 SHA，合计闭合）、适配器逐目录层级表（4 注入 + 9 指令层）、三处落地文本与统一字节口径、逐 tag 拒绝理由、证据分级与自我反驳、两轮复核（Q1–Q7、R1–R6）裁决落实                      |

### `archive/` — Completed work

Historical specs, tickets, plans, and roadmaps. Retained for reference, no longer maintained. See `archive/README.md` for the full list.

### `specs/` — Active specs

| Document                                               | Purpose                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `specs/spec-platform-profile-isolation.md`             | Active spec（#219 平台 Profile 隔离）：窄隔离模型（Profile=发布包规则+发布方式+产物类型）、publish/{platform}/ 目录、per-platform 发布器与 HITL；tickets 在 `.scratch/platform-profile/issues/` |
| ~~`specs/adr-0008-0014-remediation-tracker.md`~~       | ✅ 已归档至 `archive/specs/`（2026-09-06 裁决被事件超越：01–07 DONE，08 项由后续全量测试+审计实质覆盖）       |
| ~~`specs/spec-asset-first-hook-media-focus-detection.md`~~ | ✅ 已归档至 `archive/specs/`（2026-08-17 三合一提案已被 NO_MEDIA_TYPES/hook media warning 落地拆解吸收）    |
| ~~`specs/spec-media-patch-apply.md`~~                  | ✅ 已归档至 `archive/specs/`（实现完成：lib/apply-media-patch.mjs + #192 拒绝回路；archive 旧根快照为过期版已清除）|
| ~~`specs/spec-pipeline-generalization.md`~~            | ✅ 已归档至 `archive/specs/`（10 项 systemic issues 分散交付于各 closed issue；含 2026-09-01 Playwright 退役注记）|
| ~~`specs/spec-research-evidence-pipeline.md`~~         | ✅ 已归档至 `archive/specs/`（实现落地 research-pipeline.mjs + lib/research/*；活跃版与 archive 曾逐字节重复）  |
| ~~`specs/spec-vlm-semantic-merge-remediation.md`~~     | ✅ 已归档至 `archive/specs/`（Status: implemented 2026-08-19）                                                  |


### Root-level active specs & tickets

| Document                               | Purpose                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `spec-vlm-fit-focus.md`                | VLM-driven fit/focus for landscape assets in vertical video spec |


### `refs/` — Reference materials

External reference repos and source materials. Not project documentation.

### `research/` — Research reports

Deep research reports with citations.

| Document                                           | Purpose                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`agent-doc-token-audit-2026-09-02.md`~~          | ✅ 已归档至 `archive/research/`（审计建议已全部实施，AGENTS.md 24KB→6.5KB）
| `agent-driven-video-editing-research.md`           | Agent-driven video editing automation research                                                                                                                                                                                                                                                                                                                                                                   |
| `anti-bot-scraping-solutions.md`                   | Anti-bot scraping solutions — bypass strategies and alternative search engines                                                                                                                                                                                                                                                                                                                                   |
| `article-humanize-patterns-2026-09-04.md`          | 文章人味化模式依据 — Wikipedia "Signs of AI writing" 35 模式采纳/拒绝清单、10 篇语料实测、MRL-1 B9/W7/W8/W9 与 W1（3000→2500）阈值推导、外部改写工具对 widget 标记的风险                                                                                                                                                                                                                                         |
| `asset-focus-detection-alternatives.md`            | 素材重点内容检测替代方案 — OpenCV Saliency vs VLM vs YOLO/SAM 对比                                                                                                                                                                                                                                                                                                                                               |
| `vlm-model-selection-benchmark.md`                 | VLM model selection benchmark — Qwen3-VL 2B/4B/8B comparison with local test data                                                                                                                                                                                                                                                                                                                                |
| `asset-source-quick-reference.md`                  | Quick reference for all content sources (multimedia + text) — API keys, auth, licenses                                                                                                                                                                                                                                                                                                                           |
| `atomgit-ai-platform-research.md`                  | AtomGit AI 平台调研（2026-09-03）— 昇腾模型平台（ai.atomgit.com）：NPU 910B 硬件（无 GPU）、200 万 Token/月推理额度（月度刷新）+ 1000 核时/月 NPU 算力、AtomCode CodingPlan（编码助手，独立于推理 Token）、OpenAI 兼容 API（`/v1/chat_completions` 等 4 端点）、15 种 Token 任务类型、竞品对比（ModelScope/OpenXLab/模力方舟/Replicate）、数字人模型 NPU 适配限制（CUDA 硬依赖模型不可跑）、可替代本地小模型评估 |
| `audio-drift-fix.md`                               | Audio drift root cause analysis, fix implementation, sync verification, diagnostics                                                                                                                                                                                                                                                                                                                              |
| `china-ai-article-pipeline-2026.md`                | Article pipeline research — content strategy, widget design, SEO                                                                                                                                                                                                                                                                                                                                                 |
| `china-ai-hashtag-mapping.md`                      | China AI entity → TikTok hashtag mapping (60+ entities, 7 tiers: Big Tech, startups, AI chips, robotics, autonomous driving, international competitors, product brands)                                                                                                                                                                                                                                          | `caption-utils.mjs` ENTITY_HASHTAG_MAP, `tiktok-best-practices.md` Hashtag 策略 |
| `china-digital-human-api-alternatives.md`          | Digital human API alternatives in mainland China                                                                                                                                                                                                                                                                                                                                                                 |
| `cloud-gpu-options.md`                             | 计算硬件路由 MLX→MPS→Cloud GPU — 决策树 + TTS 硬件路由 + 免费额度 + 付费租用 (Kaggle/Colab/AutoDL) + HuggingFace LFS 下载策略                                                                                                                                                                                                                                                                                |
| `colab-cli-guide.md`                               | Google Colab CLI guide — gcloud setup, kernel push/pull, GPU smoke test                                                                                                                                                                                                                                                                                                                                          |
| `commit-session-association-id-proposal.md`        | Commit Session-Id 关联标识提案 **v5（已结项 + 第三方复核修订）** — tool-agnostic 方案：精确匹配查询（separator=%x2C）、Session-Id 唯一性、compact 恢复规则、6hex id、strict 登记门控（common-dir 登记表，fail-closed）；操作规则在 `git-workflow.md` §8，验收在 `scripts/test-commit-msg-hook.sh`，复核材料 `docs/reviews/session-id-provenance-review-brief-2026-09-04.md`                                      |
| `digital-human-references.md`                      | Offloaded reference material — papers, code repos, cloud platforms, market research for digital human models                                                                                                                                                                                                                                                                                                     |
| `digital-human-solutions-m2-pro.md`                | Digital human solutions for Apple M2 Pro 32GB — pointers to references and cloud-gpu-options                                                                                                                                                                                                                                                                                                                     |
| `echomimicv3-optimization-options.md`              | EchoMimicV3 optimization options — Kaggle GPU test results, config tuning                                                                                                                                                                                                                                                                                                                                        |
| `friendly-search-engines-comparison.md`            | Friendly search engines comparison — CDP vs API, anti-bot resistance, result quality                                                                                                                                                                                                                                                                                                                             |
| `free-llm-api-options.md`                          | 免费 LLM API 方案对比 — 合规的程序化 LLM 调用路径（官方 API / Puter.js User-Pays / 免费替代平台）+ 实测吞吐量数据                                                                                                                                                                                                                                                                                                |
| `digital-human-test-progress.md`                   | Digital human model test progress tracking — pointers to cloud-gpu-options for detailed analysis                                                                                                                                                                                                                                                                                                                 |
| `dh-avatar-layout-best-practices.md`               | 数字人 9:16 版面布局依据（#214 spec 依据）— TikTok 安全区多源三角数据（顶部/底部/右侧死区）、PiP 版式语义与比例共识、3 秒法则（2026-09-08 降级修正：精确数字单源传言）、中文机构案例、版面变体对比与裁决（变体 1′ 右中卡）                                                                                                                                                                                                                              |
| `dh-presenter-usage-strategy-research.md`          | 数字人使用时机/频次内容策略调研（web-deep-research，85 源 2026-09-08）— 定位=品牌符号非拟真记者；声明白名单 CTA/payoff/数据时刻、黑名单 hook/高情感/突发新闻；声音是第一杠杆形象第二（persona zero effect）；新闻=AI 主播接受度最低档（Reuters 19%）；AI 标识政策约束 — video-script-writing-guide 数字人策略节 + spec 内容策略回写依据                                                                                                                                                                                |
| `feathertalk-training-video-spec.md`               | FeatherTalk 训练视频录制规范 — 分辨率/帧率/头部运动/光照/音频硬性要求 + 录制操作建议                                                                                                                                                                                                                                                                                                                          |
| `digital-human-npu910b-adaptation-research.md`     | CUDA 数字人模型适配华为昇腾 NPU 910B 可行性调研（web-deep-research，13 模型逐个验证）— AtomGit NPU 免费档路由依据（Wan2.2-S2V 等已跑通）                                                                                                                                                                                                                                                                      |
| `image-text-content-research.md`                   | 小红书/图文内容形态调研（web research）— 图文频道内容策略与生产模式证据，支撑 #223 小红书图文频道立项与 #208 降级路径                                                                                                                                                                                                                                                                                         |
| `douyin-best-practices-research.md`                | 抖音（国内版）短视频最佳实践 deep research（2026-09-08）— 2025 官方算法公开（收藏/分享加权、知识类扶持）、AIGC 强制标识（2025-09-01 施行）与发布页声明路径、时政/医疗/财经资质门槛、蓝V/DOU+、大陆实名注册前提、抖音 vs TikTok 复用差异；含 pipeline 落点清单                                                                                                                                                      |
| `leaptalk-v8-params-review.md`                     | LeapTalk v8 方案参数合理性评估 — arXiv 2608.00079 论文 + 源码 + v4-v7 实测逐项核对                                                                                                                                                                                                                                                                                                                               |
| `media-asset-strategy.md`                          | Media asset strategy — acquisition, integration, animation (1000+ lines)                                                                                                                                                                                                                                                                                                                                         |
| `golden-asset-evaluation.md`                       | Golden asset evaluation — benchmark criteria for media asset quality scoring                                                                                                                                                                                                                                                                                                                                     |
| ~~`issue-tracker-review.md`~~                      | ✅ 已归档至 `docs/archive/reviews/issue-tracker-review-2026-08-26.md` — 19/19 项全部修复后归档                                                                                                                                                                                                                                                                                                                   |
| `model-sources-reference.md`                       | Model search sources reference — sources, format guide, GPU compat checklist, search flow, admission criteria & scoring                                                                                                                                                                                                                                                                                          |
| `multi-video-splitting-best-practices.md`          | Video splitting strategy, inter-episode linking, auto-evaluator                                                                                                                                                                                                                                                                                                                                                  |
| `open-source-video-generation-landscape-2026.md`   | Open-source video generation landscape 2026 — model/engine comparison, local Apple Silicon viability                                                                                                                                                                                                                                                                                                             |
| `pipeline-simplification-discussion.md`            | Pipeline simplification discussion — Stage 0 unification, category rename, locale field                                                                                                                                                                                                                                                                                                                          |
| `ponytail-minimal-code-adoption-proposal.md`       | Ponytail 最小实现规则引入提案 **v6（已批准试点，0/5）** — A-lite/D → implementation-workflow §6、B-lite → §8、试点路由 → §9；**裁决门槛真相源在试点记录** `docs/reviews/ponytail-lite-pilot-2026-09.md`（v3：正向证据门槛 + "保留"取代"转正"、保留结论不得附带收益量级声明；hard gate 六项）                                                                                                                     |
| `reference-video-extraction.md`                    | Reference video extraction — long-term backlog task                                                                                                                                                                                                                                                                                                                                                              |
| `source-layer-comparison.md`                       | Source layer CDP vs MCP vs API, capability matrix per source                                                                                                                                                                                                                                                                                                                                                     |
| `selfmedia-skills-survey-2026-09.md`  | 自媒体十 Skill 调研（源码级验证细节；决策结论在 tools-catalog「待评估」区） |
| `source-capabilities-audit.md`                     | Source capabilities 标注审计（#77，2026-09-06）— 64 源 schema 时代全面复核：11 疑点清单（baidu_news 缺 CDP entry / yt-dlp 白名单双份 / 图片引擎池游离等）、fallback 链覆盖（9 文章源零 fallback 为设计内）、44 源 videos 标注定论（36kr/guancha live 抽样不标注）、#75 交接清单、测试缺口 3 项                                                                                                                       |
| `talking-head-api-platforms.md`                    | Talking Head 模型 API 平台调研（2026-09-03）— NVIDIA NIM / Replicate / fal.ai / HF Spaces / 硅基流动等 8 平台 CDP 实测，免费低价 API 路线                                                                                                                                                                                                                                                                        |
| `safe-zone-calibration-log.md`                     | Safe zone calibration log with FYP screenshot evidence                                                                                                                                                                                                                                                                                                                                                           |
| `security-scanner-oss-replacement-research.md`     | 安全扫描层去闭源 deep research（#197，2026-09-05）— mimosa 开源替代工具链（Semgrep CE / mcp-scanner / osv-scanner / gitleaks）功能覆盖对比                                                                                                                                                                                                      |
| `short-video-script-writing-best-practices.md`     | Short video script writing best practices — S.T.A.R.T. framework, psychological retention engines, hook formulas, 15 sources                                                                                                                                                                                                                                                                                     |
| `video-background-coverage-audit-2026-08-21.md`    | 视频背景视觉承载审查结论 — 现状覆盖率、实现缺口与场景级视觉意图建议                                                                                                                                                                                                                                                                                                                                              |
| `wechat-rss-tracking-mechanisms.md`                | WeChat RSS tracking mechanisms — Wechat2RSS, third-party feeds, verified sources                                                                                                                                                                                                                                                                                                                                 |
| `tailscale-remote-gpu-setup.md`                    | NVIDIA machine deployment — Tailscale + SSH + WSL2 setup guide                                                                                                                                                                                                                                                                                                                                                   |
| `text-auto-fit-landscape-research.md`              | 文本自动适配两轮 deep research — 官方 layout-utils 边界、行业方案对比、官方能力利用审计；spec 决策 57–62（T6 pivot）的决策依据                                                                                                                                                                                                                                                                                   |
| `douyin-best-practices-research.md`                | 抖音（国内版）短视频最佳实践 deep research（2026-09-08，web-deep-research）— 2025 算法公开（收藏/分享加权、知识类扶持）、AIGC 强制标识合规（2025-09-01 施行）、资质门槛（时政/财经/医疗）、账号运营（蓝V/DOU+/大陆实名前提）、抖音 vs TikTok 差异与发布包复用建议 |
| `tiktok-color-scheme-research.md`                  | TikTok video color scheme — dark vs bright impact on engagement                                                                                                                                                                                                                                                                                                                                                  |
| `tiktok-competitor-intelligence.md`                | TikTok competitor intelligence — 16 competitor videos + hashtag frequency, description patterns, self-video analytics (§3)                                                                                                                                                                                                                                                                                       |
| `tiktok-creator-tools.md`                          | TikTok Creator Tools evaluation — Creator Academy + Research API integration assessment for pipeline and analytics                                                                                                                                                                                                                                                                                               |
| `tiktok-hook-patterns-best-practices.md`           | TikTok hook P1-P6 pattern system + fill-in-the-blank templates — CDP research, pattern occurrence matrix, scaffold design                                                                                                                                                                                                                                                                                        |
| `tiktok-hook-patterns-wide-research-assessment.md` | TikTok hook patterns research — wide assessment and source evaluation                                                                                                                                                                                                                                                                                                                                            |
| `tiktok-practical-guide-2026.md`                   | TikTok practical methodology 2026                                                                                                                                                                                                                                                                                                                                                                                |
| `muapi-async-task-patterns.md`                     | MuAPI/Generative-Media-Skills `/core` 异步任务编排模式提炼 — 提交→轮询状态机、错误三分类、SKILL.md 配方取舍表（#207，只读调研不接入）                                                                                                                                                                                                                              |
| `zh-source-recovery-research-2026-09.md`           | 中文失效源恢复调研 — weibo_hot/zhidx 替代 API 实测落地（60s API + wp-json）、xinzhiyuan DNS 欠费实锤、baidu_news 上游收缩放弃（#140 P5）                                                                                                                                                                                                                          |
| `trend-selection-dedup-scoring.md`                 | Trends 选题去重与评分 — Horizon 同事件判定 prompt + 0-10 rubric + 按类阈值与调参记录（#203）                                                                                                                                                                                                                                                                      |
| `voice-cloning-solutions-m2-pro.md`                | Voice cloning / TTS model research for Apple M2 Pro 32GB                                                                                                                                                                                                                                                                                                                                                         |
| `wechat-channels-publishing-research.md`           | 微信视频号发布最佳实践调研 — 现有 9:16 Remotion 输出兼容，无需改渲染规格；发布 API/CDP 路径与 TikTok 对比                                                                                                                                                                                                                                                                                                      |
| `zonos-configuration-research.md`                  | Zonos v2 电音/机械音根因研究 — speaking_rate OOD + pitch_std/emotion 耦合冲突，最佳配置建议（#179 TTS 批次）                                                                                                                                                                                                                                                                                                     |
| `voice-prosody-hook-optimization.md`               | Per-scene pitch/tempo prosody enhancement — 15 sources, parameter rationale                                                                                                                                                                                                                                                                                                                                      |
| `windows-gpu-analysis.md`                          | Windows device digital human model feasibility analysis & upgrade plan                                                                                                                                                                                                                                                                                                                                           |
| `windows-gpu-test-progress.md`                     | Windows digital human model test progress tracking                                                                                                                                                                                                                                                                                                                                                               |

## Spec/Ticket/Review Lifecycle

Specs, tickets, and durable review records are **active execution artifacts**, not permanent reference docs. They exist only when the Planning Scale or an explicit user request requires them.

1. S1 work normally keeps its contract in the current context and does not create standalone Spec/Tickets solely for ceremony.
2. S2/S3 runs `to-spec` and `to-tickets` by reference. Active artifacts follow the repository's established location for that effort (`docs/`, `docs/specs/`, or a feature-specific ticket directory) and must be listed in this index.
3. Each implementation ticket follows the TDD/evidence rules in `docs/agents/implementation-workflow.md`.
4. `code-review` runs against a fixed committed baseline. If a durable review file is needed, keep it in `docs/reviews/` while active; research rationale belongs in `docs/research/`, not in a review file.
5. An incomplete implementation, or an issue that still represents unfinished scope, remains active. After the actual scope is complete and verified, move specs/tickets to `docs/archive/`, completed plan-only artifacts to `docs/archive/plans/`, durable reviews to `docs/archive/reviews/`, and update this index plus `docs/archive/README.md`. If tracker authorization is absent, report the stale remote state rather than mislabelling completed implementation as incomplete.

Active `specs/`, ticket directories, and review files may persist across work cycles while their effort remains open. Archive only after the implementation or corresponding issue is actually complete.

## Redirect Rule

If a topic is historical or split-legacy, keep a short pointer in `archive/README.md` and move all normative content to one canonical file only.

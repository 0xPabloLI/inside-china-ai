# Spec: Offload and Split L1 Video Content Workflows (Issue #103)

> **Origin**: Grill session 2026-08-25, based on `docs/reviews/video-document-layer-review-2026-08-21.md`.
> **Dependency**: PR #104 (merged 2026-08-22) — dual-track contract.

## Problem Statement

`docs/content-pipeline.md` (1,069 lines) and `docs/video-workflow.md` (821 lines) are L1 execution references that have accumulated multiple workflows, low-frequency branches, duplicated responsibilities, and research rationale. A concrete request such as "make a Unitree IPO video" loads more material than the active step needs. Agent context is wasted on content not relevant to the current operation.

## Solution

Split both documents into thin route maps / runbooks with narrow L1 references for low-frequency operations. Move research rationale to L2. Point to existing canonical documents instead of restating their procedures.

### New L1 Documents (3)

| Document | Canonical responsibility | Invocation trigger |
|---|---|---|
| `docs/article-production-guide.md` | Article generation rules: Widget decision tree, Widget width rules, new Widget creation flow, Frontmatter format, claim verification annotation, MRL-1 checklist (8 Blockers + 5 Warnings), source citation requirements, article draft saving | Writing or revising an article |
| `docs/series-production-guide.md` | Multi-video series strategy: split evaluation, series types, inter-episode linking, coherence rules, compilation video, series publishing workflow | Episode evaluator recommends >1 part, or user requests a compilation |
| `docs/content-scaffold-guide.md` | New content pipeline scaffold: directory structure, `meta.mjs`/`scene-data.mjs`/`scenes.mjs` templates, CSS overflow checklist, visual style flexibility | Creating a new content slug |

### Content Migration Map

#### `content-pipeline.md` → Target destinations

| Current section | Treatment | Destination | Trigger after migration |
|---|---|---|---|
| Stage 0 shared material, track inputs/outputs, MRL/HITL, cross-output consistency, release ordering | **Keep, condensed** | `content-pipeline.md` | Every content-package request |
| Stage 0 search tool config details (mcp-search-bridge, WeChat RSS 12 sources, directed monitoring) | **Delete or point** | `specs/spec-wechat2rss-source-tracking.md` (RSS); `.env.local` comments (mcp-bridge) | — |
| Stage 0 last30days full config (~40 lines) | **Delete** | Already integrated in `source-registry.mjs`; `docs/tools-catalog.md` has entry | — |
| Stage 0 Western social media supplement (分工矩阵, 协作流程) | **Delete** | Same as above — sources already in `source-registry.mjs` | — |
| 内容品类战略优先级 (品类 A/B/C table + core insight) | **Delete** | Rationale; already in `docs/research/china-ai-article-pipeline-2026.md` | — |
| Stage 1b article drafting details (Widget decision tree, width rules, creation flow, Frontmatter, claim verification, MRL-1) | **Move** | `article-production-guide.md` | Article track active |
| Stage 1b 调研搜索矩阵 | **Delete** | Agent judgment; not execution instruction | — |
| Stage 2a Widget deployment | **Move** | `article-production-guide.md` | New widget created |
| Stage 2b/2c/2d (draft saving, attachments, RAG reindex) | **Keep contract** | `content-pipeline.md` (commands + non-blocking statement) | HITL or draft save |
| Stage 3 叙事结构模板 (四层公式, 内容类型选择, 节奏适配) | **Move** | `video-script-writing-guide.md` | Writing scene-data |
| Stage 3 标题策略 (封面给眼球标题给算法) | **Move** | `video-script-writing-guide.md` | Writing scene-data |
| Stage 3 内容拆分原则 | **Move** | `series-production-guide.md` | Split evaluation |
| Stage 3 pipeline-status.json (full JSON template ~50 lines) | **Condense** | `content-pipeline.md` (field list + 4 behavior rules, no full JSON) | Every stage transition |
| Stage 3 step sequence (steps 1-7) | **Keep, condensed** (1 line/step + pointer) | `content-pipeline.md` | Writing scene-data |
| Stage 3 MRL-2 checklist | **Keep** | `content-pipeline.md` (contract) | After scene-data |
| Stage 5 HITL TikTok Best Practices reminder block (~60 lines) | **Move** | `docs/tiktok/tiktok-best-practices.md` | HITL checkpoint |
| Stage 5 BGM selection block | **Keep** | `content-pipeline.md` (HITL contract) | HITL checkpoint |
| 检查点总结 table | **Keep** | `content-pipeline.md` (contract summary) | — |
| Agent 行为准则 | **Keep, condensed** (5 rules, no explanatory paragraphs) | `content-pipeline.md` | — |
| Design Decisions & References | **Update** | `content-pipeline.md` (add pointers to new docs) | — |

#### `video-workflow.md` → Target destinations

| Current section | Treatment | Destination | Trigger after migration |
|---|---|---|---|
| Best Practices (Duration, Hook-First, Silent Autoplay, Pacing, Audio, Mobile-First) | **Keep** | `video-workflow.md` | Normal video production |
| Content Standards, Brand Voice | **Keep** | `video-workflow.md` | Normal video production |
| TTS Engine Configuration (param tables, post-processing matrix) | **Keep** | `video-workflow.md` (execution params) | Normal video production |
| F5/Qwen historical experiment explanations | **Remove** | ADR-0008 + `docs/research/voice-cloning-solutions-m2-pro.md` | Reconsidering TTS choice |
| VLM Asset Analysis | **Keep** | `video-workflow.md` (execution config) | Normal video production |
| Logo Handling | **Keep** | `video-workflow.md` (paths + usage) | Normal video production |
| Publishing Strategy (platform adaptations table) | **Keep** | `video-workflow.md` (affects scene count) | Normal video production |
| TikTok Best Practices Integration (auto-check table, agent-assisted table, manual table, penalty table) | **Move** | `docs/tiktok/tiktok-best-practices.md` | Verify or publish |
| Content Publishing Red Lines | **Move** | `content-pipeline.md` HITL section (merge with quality gate) | HITL checkpoint |
| Step 8 Analytics & Optimization | **Move** | `docs/analytics-workflow.md` | Post-publish analytics |
| Multi-Video Series Strategy | **Move** | `series-production-guide.md` | Episode split |
| Compilation Video | **Move** | `series-production-guide.md` | Compilation request |
| Series Publishing Workflow | **Move** | `series-production-guide.md` | Series release |
| Creating a New Content Pipeline (directory tree, templates, CSS checklist, visual flexibility) | **Move** | `content-scaffold-guide.md` | New content slug |
| Running the Pipeline (commands, steps, versioning, gapless audio, background execution) | **Keep** | `video-workflow.md` | Normal video production |
| Design Decisions & References | **Update** | `video-workflow.md` (update pointers) | — |

## User Stories

1. As an agent, when I receive a topic-only request ("make a Unitree IPO video"), I want to load only `content-pipeline.md` (route map) + `video-script-writing-guide.md` (while writing scene-data) + `video-workflow.md` (while rendering), so that I don't load article widget rules, series strategy, or analytics workflow.
2. As an agent, when I write an article, I want to load `article-production-guide.md` for Widget decision tree, Frontmatter format, and MRL-1 checklist, so that `content-pipeline.md` doesn't need to carry 300+ lines of article details.
3. As an agent, when the episode evaluator recommends >1 part, I want to load `series-production-guide.md` for split strategy and inter-episode linking, so that I don't load it for every single-video request.
4. As an agent, when I create a new content slug, I want to load `content-scaffold-guide.md` for directory structure and file templates, so that `video-workflow.md` doesn't carry scaffold templates during normal rendering.
5. As an agent, when I reach HITL, I want `content-pipeline.md` to point to `tiktok-best-practices.md` for the full reminder block, so that the route map stays thin.
6. As an agent, when I do post-publish analytics, I want to load `analytics-workflow.md` (not `video-workflow.md`), so that analytics instructions have one canonical home.
7. As a user, when I ask "where is the Widget width rule?", I want one canonical answer in `article-production-guide.md`, not duplicated across documents.
8. As a maintainer, when I run `npm run lint:docs`, I want all new L1 documents to pass the hierarchy lint (DOCS-INDEX consistency + Design Decisions section), so that documentation integrity is verified.

## Implementation Decisions

- **No code changes**: This spec touches only `docs/` markdown files and `DOCS-INDEX.md`. No pipeline code, no TTS, no RAG, no rendering.
- **Dual-track contract preserved**: The route map must never require public article release before scene-data or rendering. The `shared material → parallel tracks → consistency join → one HITL → release` sequence stays intact.
- **One rule, one canonical home**: Parent documents link to specialized references; they do not restate complete procedures.
- **No ADR**: The split follows already-established L1/L2 rules in `DOCS-INDEX.md`. Not surprising, not hard to reverse, not a non-obvious trade-off.
- **Execution order**: Create 3 new docs → slim `content-pipeline.md` → slim `video-workflow.md` → update `DOCS-INDEX.md` → `npm run lint:docs`.
- **Pointer format**: Each moved section in the parent document is replaced with a 1-line pointer: `> 详见 \`docs/xxx.md\`` or inline `（见 \`docs/xxx.md\` § Y）`.
- **New docs must have `## Design Decisions & References`**: Required by `lint:docs` Check 2 when referencing `docs/research/` or `docs/tiktok/`.

## Testing Decisions

- **Primary test seam**: `npm run lint:docs` (doc hierarchy lint). Checks:
  1. Every `.md` file in `docs/` root and `docs/research/` is listed in `DOCS-INDEX.md`
  2. L1 docs referencing L2 must have `## Design Decisions` heading
  3. L2 docs with ≥5 command-line patterns get WARN
- **Manual verification**: After migration, grep for moved section titles to confirm no contradictory duplicate remains.
- **Cross-document pointer verification**: Every new pointer in the parent documents must resolve to an existing file containing the referenced content.
- **No unit tests**: This is a documentation-only task. The "test" is lint + grep + manual walkthrough.

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk Level | Assessment |
|---|---|---|---|
| `docs/content-pipeline.md` | Slim from ~1,069 to ~400 lines. Remove article details, search config, last30days, strategy table, narrative templates, TikTok HITL block. Add pointers to 6+ documents. | High | Core route map — every content request loads it. Risk: pointer target missing content → agent can't find instructions. Mitigation: grep-verify each pointer target before deleting source content. |
| `docs/video-workflow.md` | Slim from ~821 to ~400 lines. Remove analytics, series, scaffold, TikTok best practices tables, red lines. Add pointers. | High | Core runbook — every video render loads it. Risk: rendering params accidentally removed. Mitigation: keep all TTS/render/verify params; only move non-routine content. |
| `docs/DOCS-INDEX.md` | Add 3 new L1 documents to Root table. Update video-workflow description. | Low | Pure addition + 1 description update. No existing rows removed. |
| `docs/article-production-guide.md` | New file (~300 lines). Extracted from content-pipeline.md Stage 1b/2a. | Low | New file, no existing content modified. |
| `docs/series-production-guide.md` | New file (~150 lines). Extracted from video-workflow.md Multi-Video + Compilation + Series Publishing sections. | Low | New file. |
| `docs/content-scaffold-guide.md` | New file (~150 lines). Extracted from video-workflow.md Creating a New Content Pipeline section. | Low | New file. |
| `docs/tiktok/tiktok-best-practices.md` | Add TikTok Best Practices Integration tables (auto-check, agent-assisted, manual, penalty) from video-workflow.md. | Medium | Existing 693-line document receives ~80 lines of tables. Risk: duplication with existing content. Mitigation: check for overlap before appending. |
| `docs/analytics-workflow.md` | Add Step 8 Analytics content from video-workflow.md. | Medium | Existing 149-line document receives ~60 lines. Risk: duplication. Mitigation: check overlap. |
| `docs/video-script-writing-guide.md` | Add narrative structure templates + title strategy from content-pipeline.md. | Medium | Existing 186-line document receives ~60 lines. Risk: duplication with existing S.T.A.R.T. content. Mitigation: merge, don't append. |
| `docs/manual-ops.md` | Verify TikTok manual ops already present; add any missing items from HITL block. | Low | Mostly verification; minimal additions. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|---|---|---|---|
| 1 | Agent receives "make a Unitree IPO video" | Loads `content-pipeline.md` (route) → `video-script-writing-guide.md` (scene-data) → `video-workflow.md` (render). Does NOT load article-production-guide, series-guide, scaffold-guide, analytics, or tiktok-best-practices by default. | Medium | Verify route map doesn't inline low-freq content. Grep for "Widget" in content-pipeline.md after migration — should only appear in pointer. |
| 2 | Agent writes an article | Loads `article-production-guide.md` for Widget rules + MRL-1 + Frontmatter. `content-pipeline.md` only has pointer + contract (input/output/MRL-1 exists). | Low | Verify article-production-guide contains all 8 MRL-1 Blockers + 5 Warnings. |
| 3 | Episode evaluator recommends 3 parts | Agent loads `series-production-guide.md` for split strategy. `content-pipeline.md` Stage 3 Step 0 has only trigger + output format + pointer. | Low | Verify series-guide contains coherence rules + inter-episode linking + compilation. |
| 4 | Agent creates new content slug | Loads `content-scaffold-guide.md` for directory structure + templates. `video-workflow.md` has pointer only. | Low | Verify scaffold-guide contains meta.mjs/scene-data.mjs/scenes.mjs templates + CSS overflow checklist. |
| 5 | Agent reaches HITL | `content-pipeline.md` outputs TikTok reminder block by reading from `tiktok-best-practices.md`, not from inline content. | Medium | Verify tiktok-best-practices.md contains the full reminder block. Verify content-pipeline.md has only pointer. |
| 6 | Agent does post-publish analytics | Loads `analytics-workflow.md`, not `video-workflow.md`. `video-workflow.md` has no analytics section. | Low | Grep "analytics" in video-workflow.md — should only appear in pointer. |
| 7 | Agent needs TTS params | `video-workflow.md` still contains TTS Engine Configuration table (F5/Qwen/edge/say). | Low | Verify TTS param table intact. Grep "steps=32" in video-workflow.md. |
| 8 | `npm run lint:docs` runs | 0 FAILs. All 3 new docs in DOCS-INDEX. All 3 new docs have `## Design Decisions & References` if they reference L2. | Medium | Run lint:docs as final verification step. |
| 9 | Greppable pointer targets | Every `详见 \`docs/xxx.md\`` or `见 \`docs/xxx.md\`` pointer in content-pipeline.md and video-workflow.md resolves to an existing file. | Medium | Script: extract pointer targets, verify file existence. |
| 10 | No contradictory duplicates | Content moved to new docs does NOT also remain in parent docs (except contract summaries). | High | Grep for section titles — if found in both parent and child, verify parent version is ≤2 lines (pointer only). |
| 11 | Dual-track contract intact | `content-pipeline.md` route map preserves `shared material → parallel tracks → consistency join → one HITL → release` sequence. No "publish article before video" ordering. | High | Grep "publish" in content-pipeline.md — verify no pre-HITL publish requirement for articles. |
| 12 | Design Decisions sections updated | Both parent docs have updated `## Design Decisions & References` tables pointing to new docs. | Low | Grep "Design Decisions" in both files. |

## Out of Scope

- No code changes to pipeline, TTS, RAG, rendering, database, or publication APIs.
- No changes to `source-registry.mjs` or any `scripts/` code.
- No alteration of the factual-evidence audit behavior (#60/#61).
- No merging of unrelated visual-intent, media-audit, or analytics work.
- No document split merely to reduce line count — every extraction has a distinct trigger and canonical responsibility.
- #111 (text RAG integration) is not started in this session — #103 and #111 share `content-pipeline.md` and must be serial.

## Further Notes

- The review document `docs/reviews/video-document-layer-review-2026-08-21.md` is the scope baseline. This spec operationalizes its migration map.
- After completion, the review document should be archived to `docs/archive/reviews/`.
- The migration follows guardrails from the review: preserve dual-track, don't split by line count, retain operating contracts, one rule one home, verify every move.

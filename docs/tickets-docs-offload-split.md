# Tickets: Offload and Split L1 Video Content Workflows (#103)

> Spec: `docs/spec-docs-offload-split.md`
> Dependency chain: T1 → T2 → T3 → T4 → T5 → T6 → T7

## T1: Create `docs/article-production-guide.md`

**Depends on**: —
**Conflict files**: none (new file)

### Checklist
- [x] Create `docs/article-production-guide.md` with the following content extracted from `content-pipeline.md` Stage 1b:
  - [x] Widget 定位 (supplement new info, not repeat)
  - [x] Widget 决策树 table
  - [x] Widget 宽度规则 (65ch / breakout)
  - [x] 创建新 Widget 流程 (6 steps)
  - [x] 已有 Widget 注册表 (list from registry.ts)
  - [x] Frontmatter 格式 (yaml template)
  - [x] 声明验证标注规范 (4-level table + examples)
  - [x] MRL-1 文章自审 (8 Blockers table + 5 Warnings table + loop flow)
  - [x] 源引用要求 (5-point citation rules)
  - [x] 原创分析要求 (My Take gating)
  - [x] 公司档案查阅 (前置 step)
- [x] Add `## Design Decisions & References` table pointing to `docs/research/china-ai-article-pipeline-2026.md`
- [x] Add `> **被引用**: content-pipeline.md Stage 1/2` header line

## T2: Create `docs/series-production-guide.md`

**Depends on**: —
**Conflict files**: none (new file)

### Checklist
- [x] Create `docs/series-production-guide.md` with content extracted from `video-workflow.md`:
  - [x] When to Split (episode evaluator trigger)
  - [x] Series Types table (Explicit Part N, Loop-and-Flashback, Deep Dive, 对比系列)
  - [x] Inter-Episode Linking table (Pin, Pinned Comment, Stitch, Hashtag, Part 编号)
  - [x] Coherence Rules (5 rules)
  - [x] Compilation Video (Plan A FFmpeg, Plan B reconstruct, publishing)
  - [x] Series Publishing Workflow (发布节奏, series commands, 批量生产)
  - [x] 内容拆分原则 (from content-pipeline.md Stage 3)
- [x] Add `## Design Decisions & References` pointing to `docs/research/multi-video-splitting-best-practices.md`
- [x] Add header: `> **被引用**: content-pipeline.md Stage 3 Step 0, video-workflow.md`

## T3: Create `docs/content-scaffold-guide.md`

**Depends on**: —
**Conflict files**: none (new file)

### Checklist
- [x] Create `docs/content-scaffold-guide.md` with content extracted from `video-workflow.md` "Creating a New Content Pipeline" section:
  - [x] Directory structure (single + multi-part)
  - [x] meta.mjs template
  - [x] scene-data.mjs template (with rules enforced by verify-video.mjs)
  - [x] scenes.mjs template (with shared scene templates list, CSS overflow checklist)
  - [x] Visual style flexibility table
  - [x] Run and verify commands
- [x] Add `## Design Decisions & References` pointing to `docs/brand-system.md` (scene templates)
- [x] Add header: `> **被引用**: video-workflow.md (new content slug creation)`

## T4: Slim `docs/content-pipeline.md` to route map

**Depends on**: T1, T2 (pointers must resolve to created files)
**Conflict files**: `content-pipeline.md` (#111 not started — safe)

### Checklist
- [x] Stage 0: Delete 内容品类战略优先级 section
- [x] Stage 0: Delete last30days full config block (~40 lines)
- [x] Stage 0: Delete Western social media supplement section (~40 lines)
- [x] Stage 0: Condense mcp-search-bridge paragraph to 1 line + pointer to `.env.local`
- [x] Stage 0: Condense WeChat RSS paragraphs to 1 line + pointer to `specs/spec-wechat2rss-source-tracking.md`
- [x] Stage 0: Condense 定向公众号监控 to 1 line
- [x] Stage 1: Replace Widget decision tree, width rules, creation flow, Frontmatter, claim verification, MRL-1 checklist with pointer to `article-production-guide.md`
- [x] Stage 1: Delete 调研搜索矩阵 table
- [x] Stage 1: Keep source citation contract (5-point summary) or move to article-production-guide (decide: move, keep 1-line pointer)
- [x] Stage 2a: Replace Widget deployment with pointer to `article-production-guide.md`
- [x] Stage 2b/2c/2d: Keep commands + non-blocking statement
- [x] Stage 3: Move 叙事结构模板 to `video-script-writing-guide.md` (or verify already there, replace with pointer)
- [x] Stage 3: Move 标题策略 to `video-script-writing-guide.md` (or verify, replace with pointer)
- [x] Stage 3: Move 内容拆分原则 to `series-production-guide.md` (replace with pointer)
- [x] Stage 3: Condense pipeline-status.json (remove full JSON template, keep field list + 4 behavior rules)
- [x] Stage 3: Condense step sequence (1 line/step + pointer to `video-script-writing-guide.md`)
- [x] Stage 3: Keep MRL-2 checklist (contract)
- [x] Stage 5: Move TikTok Best Practices reminder block to `tiktok-best-practices.md` (or verify already there), replace with pointer
- [x] Stage 5: Keep BGM selection block (HITL contract)
- [x] Stage 5: Move Content Publishing Red Lines from video-workflow.md into HITL quality gate (merge)
- [x] Keep 检查点总结 table
- [x] Condense Agent 行为准则 to 5 rules (no explanatory paragraphs)
- [x] Update `## Design Decisions & References` table (add pointers to new docs)

## T5: Slim `docs/video-workflow.md` to regular-production runbook

**Depends on**: T2, T3 (pointers must resolve to created files)
**Conflict files**: `video-workflow.md`

### Checklist
- [x] Keep Best Practices (Duration, Hook-First, Silent Autoplay, Pacing, Audio, Mobile-First)
- [x] Keep Content Standards + Brand Voice
- [x] Keep TTS Engine Configuration (param tables, post-processing matrix)
- [x] Remove F5/Qwen historical experiment explanations (keep params, delete rationale paragraphs)
- [x] Keep VLM Asset Analysis
- [x] Keep Logo Handling
- [x] Keep Publishing Strategy (platform adaptations table, title strategy)
- [x] Move TikTok Best Practices Integration tables to `tiktok-best-practices.md` (or verify already there, replace with pointer)
- [x] Move Content Publishing Red Lines to `content-pipeline.md` (T4 will receive)
- [x] Move Step 8 Analytics & Optimization to `analytics-workflow.md` (replace with pointer)
- [x] Move Multi-Video Series Strategy to `series-production-guide.md` (T2 already created, replace with pointer)
- [x] Move Compilation Video to `series-production-guide.md` (replace with pointer)
- [x] Move Series Publishing Workflow to `series-production-guide.md` (replace with pointer)
- [x] Move Creating a New Content Pipeline to `content-scaffold-guide.md` (T3 already created, replace with pointer)
- [x] Keep Running the Pipeline (commands, steps, versioning, gapless audio, background execution)
- [x] Update `## Design Decisions & References` table

## T6: Update `docs/DOCS-INDEX.md`

**Depends on**: T1, T2, T3 (new files exist), T4, T5 (descriptions finalized)
**Conflict files**: `DOCS-INDEX.md`

### Checklist
- [x] Add `article-production-guide.md` to Root — Active reference table
- [x] Add `series-production-guide.md` to Root — Active reference table
- [x] Add `content-scaffold-guide.md` to Root — Active reference table
- [x] Update `content-pipeline.md` description if needed
- [x] Update `video-workflow.md` description if needed
- [x] Verify no removed rows (all existing docs still present)

## T7: Verify and archive

**Depends on**: T1–T6 all complete
**Conflict files**: none

### Checklist
- [x] Run `npm run lint:docs` — 0 FAILs (3 pre-existing FAILs not introduced by this session)
- [x] Grep verification: no contradictory duplicates (section titles in both parent and child)
- [x] Grep verification: all pointer targets exist
- [x] Grep "publish" in content-pipeline.md — no pre-HITL publish requirement
- [x] Grep "steps=32" in video-workflow.md — TTS params intact
- [x] Grep "Widget" in content-pipeline.md — only in pointer
- [x] Grep "analytics" in video-workflow.md — only in pointer
- [ ] Archive spec + tickets to `docs/archive/`
- [ ] Archive review to `docs/archive/reviews/`
- [ ] Update `docs/archive/README.md` if needed

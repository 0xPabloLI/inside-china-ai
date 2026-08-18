# Handoff: VLM Semantic Merge — P3 Implementation

> **Date**: 2026-08-18
> **Previous session**: VLM optimization planning (Grill + Spec + Tickets)
> **Next session focus**: TDD implementation of T-01 through T-05

## What was done this session

### Git
- **Push**: Deferred to user (working tree has non-session changes blocking `pull --rebase`). Previous session's commits (`8f4d7dd` + `fec2353` + `938f84d`) are local only.
- **No new code changes** — this session was planning only (Grill → Spec → Tickets).

### Grill (3 rounds, all decisions settled)

**Round 1** (Q1-Q6): Basic design decisions
- Q1: New `analyzeAssetSemantics` action (not modify old prompts)
- Q2: All assets unified through one path (Python judges landscape/portrait)
- Q3: Markdown output + Python code parser (NOT JSON, NOT Pydantic — MLX has no guided decoding)
- Q4: Minimal field set (description + subjects + contentKind + fit + criticalEdgeText + reason)
- Q5: Video skips fit analysis
- Q6: Delete old APIs (not deprecate — full removal)

**Round 2** (Q7-redesigned to Q10-redesigned): Scope expansion
- User feedback: "don't just merge calls — redefine the VLM output contract for the whole pipeline"
- User feedback: "why JSON not Markdown? Can code convert Markdown to structured data?"
- Expanded field set: added subjects + contentKind (with current consumers identified)
- Markdown output format confirmed
- `asset-analysis.json` artifact design confirmed
- Pipeline order: unchanged (script-driven asset search is correct)

**Round 3** (Q7-final to Q12): Pre-filter + validation
- User feedback: "filter before VLM to save expensive calls"
- Pre-filter design: rebalanced scoreCandidate non-AI part (0-70), threshold 30, soft gate
- Issue #44 integration confirmed (scoreCandidate rebalance + keyword provenance + boundary matching)
- Issue #33 confirmed out of scope (different pipeline stage)
- 5-test validation plan designed
- Final design confirmed by user
- Test seams confirmed by user (5 seams including Python parser)

### Spec
- Written: `docs/specs/spec-vlm-semantic-merge.md`
- Contains: Problem Statement, Solution, 15 User Stories, Implementation Decisions, Testing Decisions, Scenario Matrix (20 behavioral scenarios + 9 modified files impact assessment), Out of Scope, Further Notes

### Tickets (5 tracer-bullet tickets)
- `.scratch/vlm-semantic-merge/issues/01-python-markdown-parser-analyze-semantics.md`
- `.scratch/vlm-semantic-merge/issues/02-node-analyze-asset-semantics-gateway.md`
- `.scratch/vlm-semantic-merge/issues/03-scorecandidate-rebalance-prefilter.md`
- `.scratch/vlm-semantic-merge/issues/04-analyze-assets-rewrite-artifact.md`
- `.scratch/vlm-semantic-merge/issues/05-vlm-validation-script.md`

### Dependency graph
```
T-01 (Python parser+handler) ──┬──→ T-02 (Node gateway) ──┐
                               │                          ├──→ T-04 (analyzeAssets rewrite) ──→ T-05 (validation)
T-03 (scoreCandidate rebalance)┘                          ┘
```
T-01 and T-03 can start in parallel. T-02 blocks on T-01. T-04 blocks on T-02+T-03. T-05 blocks on T-04.

## Key design decisions (for new session context)

1. **VLM outputs Markdown, not JSON** — MLX has no guided decoding. Markdown is natural for LLMs. Python code parses Markdown to dict. No LLM needed for conversion. No Pydantic dependency.

2. **6 output fields**: description, subjects, contentKind, fit, criticalEdgeText, reason. Each has current consumers. Video skips fit/criticalEdgeText (different prompt).

3. **Pre-filter before VLM**: rebalanced scoreCandidate non-AI part (0-70). Threshold 30. Soft gate — low confidence assets can still be analyzed if VLM is available.

4. **Delete old APIs completely** (Q6 = option C): describeImage, describeVideo, analyzeFit, parseFitResponse all deleted. All tests rewritten.

5. **asset-analysis.json artifact**: structured JSON output for all pipeline stages. Versioned. Includes model ID, analyzedAt, per-asset full analysis (VLM + focus).

6. **Issue #44 directly fixed**: score rebalance (70+30), searchKeyword provenance, boundary matching, 4K case fix.

7. **Pipeline order unchanged**: script-driven asset search (scene-data → asset-sourcer) is correct for content creation.

8. **Validation required before merge**: 5-test plan in experiments/ directory. Must verify format stability ≥80%, parser robustness 10/10, pre-filter 0 false rejects, latency ≤60% of old.

## What the new session should do

1. **Start with T-01 and T-03 in parallel** (both have no blockers)
2. **Follow Mandatory Implementation Workflow** from Step 4 (TDD):
   - For each ticket: think about best implementation → write tests (red) → implement (green) → refactor
   - Test cases = Scenario Matrix rows from spec
3. **After T-01 + T-03 complete**: T-02 (Node gateway), then T-04 (analyzeAssets rewrite)
4. **After T-04 complete**: T-05 (validation script) — run real VLM tests
5. **Code Review** (Step 5): Standards + Spec dual-axis
6. **Runtime Verify** (Step 6): `npm run lint && npm run build && npx tsc --noEmit` + run validation script + 81+ tests passing
7. **Commit & Push** (Step 7)
8. **Archive spec + tickets** (Step 8): move to `docs/archive/`

## Key files for the new session

### Spec + Tickets
- `docs/specs/spec-vlm-semantic-merge.md` — full spec with scenario matrix
- `.scratch/vlm-semantic-merge/issues/01-05-*.md` — 5 tracer-bullet tickets

### Code to modify
- `scripts/short-video/lib/vlm_analyzer.py` — T-01 (Python parser + handler)
- `scripts/short-video/lib/visual-analyzer.mjs` — T-02 (Node gateway)
- `scripts/short-video/lib/asset-sourcer.mjs` — T-03 + T-04 (scoreCandidate + analyzeAssets)
- `scripts/short-video/lib/review-media-patch.mjs` — T-04 (artifact consumer)
- `scripts/short-video/remotion/src/types.ts` — T-04 (MediaField types)
- `scripts/short-video/__tests__/visual-analyzer.test.mjs` — T-02 (test rewrite)
- `scripts/short-video/__tests__/asset-sourcer-visual-integration.test.mjs` — T-04 (integration test)
- `scripts/short-video/__tests__/asset-sourcer.test.mjs` — T-03 (scoreCandidate tests)

### Reference docs
- `docs/adr/0009-vlm-qwen3-vl-mlx.md` — VLM architecture
- `docs/adr/0015-opencv-focus-detection.md` — Focus detection
- `docs/reviews/scorecandidate-review.md` — Issue #44 review findings
- `docs/handoffs/handoff-visual-focus-detection.md` — Previous session handoff (P0/P1 remediation)

## Architecture insight: Cascade filtering + signal density

P3 的设计本质上是一个 **Viola-Jones cascade**（级联分类器）模式——用一系列越来越贵的分类器，前级 reject 大部分负样本，只有通过所有层的才送到最贵的资源。

### P3 的 cascade 层级

```
Asset 流水线
  ├─ Layer 0 (免费): 文件存在性检查 → reject 不存在的
  ├─ Layer 1 (极便宜): scoreCandidate 非 AI 部分 (0-70) → reject <30 的
  ├─ Layer 2 (中等): OpenCV 焦点检测 (~0.5s/asset) → 标注保护区
  ├─ Layer 3 (昂贵): VLM 语义分析 (20-30s/asset) → 只对 Layer 1 通过的
  └─ Layer 4 (免费): 语义重评分 → 用 VLM 产出的 subjects + description 做匹配
```

### Viola-Jones 三原则在管线中的映射

| Viola-Jones 原则 | 管线映射 |
|------------------|---------|
| 前级分类器要便宜且高召回 | `filterChinaAI`（关键词）、`computeTechnicalScore`（元数据） |
| 每级只处理前级通过的样本 | P3 pre-filter gate: `technicalScore < 30` → skip VLM |
| 最后一级可以贵，因为样本少 | VLM 20-30s/asset，但只处理通过 pre-filter 的 |

### 额外原则：信号密度最大化

Viola-Jones 没有但管线需要的：**一次调用产出多个信号**。P3 的 VLM 一次输出 6 字段（description + subjects + contentKind + fit + criticalEdgeText + reason），不是 6 次调用。这是 "merge calls" 的设计本质——不仅是 cascade 的层级优化，还是单次调用的信号密度最大化。

### 管线中已用此模式的 3 处

1. **RAG 查询** (`scripts/rag/query.mjs`)：metadata filter → vector similarity → noise filter → reranker（只对 >3 results）。已经 cascade，但 reranker 触发条件是 `results.length > 3`，没有先做关键词预匹配。**优化机会**：加 BM25/关键词预过滤层，减少送入 reranker 的样本数。

2. **search-sources filter/classify** (`trends-utils.mjs`)：`filterChinaAI`（关键词 reject）→ `classifyTopic`（关键词分类）→ `deduplicateTopics`（Jaccard）。`filterChinaAI` 就是 Viola 式第一级。**Issue #33 想用 LLM 替代这个**——方向可能反了，应该是关键词先过滤 → LLM 只对边界 case 分类。

3. **asset-sourcer 下载前过滤**：search API 排序 → `scoreCandidate` 非 AI 部分 → VLM（P3 新增的 cascade 层）。P3 本身就是在给这个流水线加 cascade 层。

### 管线中可借鉴但还没用的 2 处

4. **caption/hashtag 生成** (`caption-utils.mjs`)：目前纯规则匹配。如果未来用 LLM 生成 caption，应先走规则匹配，匹配不到才 fallback 到 LLM，不是所有 caption 都走 LLM。

5. **scene-data → asset 匹配** (`recommendScene`)：目前关键词匹配。P3 的 `contentKind` + `subjects` 从 VLM 获得语义信号后，`recommendScene` 可做语义匹配——这就是 P3 的 Layer 4（免费层，用 VLM 已产出的信号做匹配）。

### 对 P4-P8 的指导意义

P4（视频时序窗口）应该用同样的 cascade：OpenCV shot detection（便宜）→ VLM 关键帧分析（贵，只对 shot boundary 的帧）。P7（缓存）本质上是给 cascade 加一个 "Layer -1"：hash 命中 → 全跳过。

## Session checklist status (this session)

- [x] Step 1 Grill — completed (3 rounds, all decisions settled)
- [x] Step 1b Prototype — N/A (no prototype needed)
- [x] Step 2 Spec — `docs/specs/spec-vlm-semantic-merge.md` (with Scenario Matrix)
- [x] Step 3 Tickets — 5 tracer-bullet tickets with dependency edges
- [ ] Step 4 TDD — **next session**
- [ ] Step 5 Code Review — **next session**
- [ ] Step 6 Runtime Verify — **next session**
- [ ] Step 7 Commit & Push — **next session** (also: push previous session's commits)
- [ ] Step 8 Docs — **next session**

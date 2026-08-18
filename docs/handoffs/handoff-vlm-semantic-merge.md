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
- Issue #33 confirmed out of scope for P3; closed and superseded by #51 (cascade direction correction)
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

## Architecture principle

P3 applies the cascade filtering principle documented in **ADR-0016** (`docs/adr/0016-cascade-filtering-signal-density.md`). See also Issue #51 for cascade violations found in other pipeline stages.

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

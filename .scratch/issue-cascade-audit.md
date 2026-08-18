# Cascade-filter audit: pipeline stages violating ADR-0016 (cheap-first, expensive-last)

## Problem

ADR-0016 (`docs/adr/0016-cascade-filtering-signal-density.md`) establishes Viola-Jones cascade filtering as an architecture principle: cheap filters first, expensive processing only for survivors.

Some pipeline stages and proposals violate this principle.

## Violations found

### 1. Issue #33 — filterChinaAI replacement direction is backwards

**Issue #33** proposes to **replace** `filterChinaAI` regex with local LLM (embedding or text generation).

**Problem**: This removes the cheap first-layer classifier. If 100+ articles per run all go through embedding/LLM, the cascade is gone — expensive resources process everything, not just survivors.

**Correct direction**: **Enhance** keyword filter (add people names, semantic aliases) as Layer 0, then add LLM as Layer 1 **fallback for boundary cases only** — articles where keyword matching is inconclusive. This follows the cascade principle.

```
Layer 0 (free):    filterChinaAI (enhanced keywords) → reject 90% clearly unrelated
Layer 1 (medium):  LLM embedding/classification → only for ambiguous cases
```

**Action**: Update Issue #33's scope from "replace" to "enhance + add fallback layer".

### 2. RAG reranker — no pre-filter before reranking

**`scripts/rag/query.mjs`** sends all vector-search results to the reranker if `results.length > 3`. No keyword/BM25 pre-filter reduces the candidate set.

**Problem**: With 20+ results, all go to reranker. The reranker (bge-reranker-base, ~100ms/result) is not free.

**Correct direction**: Add a BM25 or keyword-overlap pre-filter between vector search and reranker — pass only top-N (e.g., 10) to the reranker.

```
Layer 0 (free):     metadata filter (type, topics)
Layer 1 (medium):   vector similarity (bge-m3)
Layer 2 (free):     noise filter (< 0.5 similarity)
Layer 3 (cheap):    BM25/keyword pre-filter → top-10     ← MISSING
Layer 4 (expensive): reranker (only for top-10)
```

### 3. (Potential) caption/hashtag generation

If LLM is added for caption generation in the future, it should be a **fallback** after rule matching, not a replacement. Currently no issue exists for this — this is a preventive note.

## Reference

- ADR-0016: `docs/adr/0016-cascade-filtering-signal-density.md`
- Viola-Jones cascade principle: cheap filters first, expensive processing only for survivors
- Issue #33: Replace filterChinaAI + classifyTopic regex with local LLM

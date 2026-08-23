# Spec: BM25 Pre-filter for RAG Query

> Issue: #51 | ADR: 0016 | Status: Ready

## Problem

RAG query violates ADR-0016 cascade: vector results go directly to reranker without cheap keyword pre-filter.

## Solution

Insert BM25 as Layer 3 between noise filter and reranker. Runs by default, --no-bm25 to disable, --bm25-top-k N (default 10).

## User Stories

1. BM25 runs by default, excludes zero-keyword-overlap results.
2. --no-bm25 disables BM25.
3. --bm25-top-k N controls pre-filter size (default 10).
4. BM25 runs before --rerank, reducing reranker input.
5. BM25 preserves vector similarity ordering of survivors.
6. BM25 is pure function, no external deps.
7. BM25 uses current result set as corpus for IDF.
8. BM25 handles mixed CN-EN text.
9. BM25 gracefully degrades on errors.

## Implementation Decisions

### New module: scripts/rag/lib/bm25.mjs

Pure functions, no external deps:

- tokenize(text): English/numbers split by whitespace/punctuation, whole words, lowercased. Chinese per-character.
- computeIDF(term, docFreqs, numDocs): IDF = max(0, ln(1 + (N - n + 0.5) / (n + 0.5))).
- bm25Score(queryTerms, docTerms, docFreqs, numDocs, avgDocLength, k1=1.5, b=0.75): Standard BM25.
- bm25PreFilter(query, results, topK=10): Orchestrates tokenize+IDF+score+sort+truncate. Preserves all fields.

### Modified module: scripts/rag/query.mjs

- Import bm25PreFilter.
- New CLI args: --no-bm25 (flag), --bm25-top-k N (default 10).
- Insert BM25 step between noise filter and reranker.
- Updated flow: embed -> vector search -> noise filter -> BM25 pre-filter -> optional reranker -> output.
- BM25 in try/catch: on error, warn and return original results.

### Tokenization

English/numbers: whole words, lowercased. Chinese: per-character. Upgradable to jieba by modifying tokenize() only.

### Corpus

Current vector search result set (10-20 docs). No pre-computed global IDF.

### Cascade position

BM25 after noise filter, before reranker. Does NOT change vector ordering of survivors — only truncates.

## Scenario and Risk Verification Matrix

### Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| scripts/rag/lib/bm25.mjs (NEW) | New pure-function module | Low | Pure addition |
| scripts/rag/query.mjs | Insert BM25 step + 2 CLI args | Medium | Additive step, downstream gets same shape. Worst case: discards relevant result. Mitigated by --bm25-top-k and --no-bm25. |
| scripts/rag/__tests__/bm25.test.mjs (NEW) | Unit tests | Low | Pure addition |
| scripts/rag/__tests__/query.test.mjs | Integration tests | Low | Pure addition |

### Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 15 results, top-k=10 | Returns top-10 by BM25, vector order preserved | Low | Truncation only |
| 2 | 5 results, top-k=10 | Returns all 5 | Low | top-k is max |
| 3 | Empty result set | Returns empty array | Low | Nothing to score |
| 4 | Empty query string | All scores=0, original order, truncated to top-k | Low | tokenize returns [] |
| 5 | null chunk_text | Score=0, no crash | Medium | Guard with default empty string |
| 6 | --no-bm25 | BM25 skipped | Low | Boolean gate |
| 7 | --bm25-top-k 0 | Returns empty array | Low | Edge case |
| 8 | top-k=20 with 15 results | Returns all 15 | Low | top-k is max |
| 9 | BM25 + --rerank | BM25 first, then reranker on top-k | Medium | Order matters |
| 10 | BM25 + --include-noise | BM25 processes all including noise | Low | After noise filter |
| 11 | BM25 error | Warning, original results returned | Medium | try/catch |
| 12 | Mixed CN-EN query | Both languages contribute | Low | tokenize handles mixed |
| 13 | All same chunk_text | Equal scores, original order | Low | Stable sort |
| 14 | Single result | Returned as-is | Low | Edge case |
| 15 | --include-noise, no --rerank | Noise with 0 overlap gets BM25=0, truncated | Low | Intended |

## Testing Decisions

- Unit tests for bm25.mjs: test tokenize, computeIDF, bm25Score, bm25PreFilter as pure functions. Prior art: ollama.test.mjs.
- Integration tests for query.mjs: test BM25 applied in main flow, --no-bm25 skips it, --bm25-top-k controls size. Prior art: query.test.mjs classifyConfidence tests.
- Test external behavior only — verify relative ordering, not exact IDF values.
- BM25 scores need not be exact — tests verify result A scores higher than B when A has more query term matches.

## Out of Scope

- Violation 1 from #51 (filterChinaAI + classifyTopic cascade) — separate issue.
- Violation 3 from #51 (caption/hashtag LLM fallback) — preventive note.
- Jieba or n-gram tokenization upgrade — future improvement.
- BM25 global index / PostgreSQL full-text search — not needed for 551-chunk corpus.
- RAG framework migration — explicitly deferred per grill decision.
- Modifying match_content RPC — BM25 runs client-side.

## Further Notes

- ADR-0016 names RAG query as cascade application point. This spec adds the missing BM25 layer.
- BM25 parameters (k1=1.5, b=0.75) are standard IR values. No tuning needed for pre-filter.
- The tokenize function is the upgrade seam: swapping to jieba only requires modifying this one function.

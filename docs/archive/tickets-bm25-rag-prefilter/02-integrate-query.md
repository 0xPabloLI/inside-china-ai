# 02 - Integrate BM25 into query.mjs + Integration Tests

**What to build:** Wire BM25 pre-filter into the RAG query pipeline between noise filter and reranker. Add --no-bm25 and --bm25-top-k CLI args. BM25 runs by default with graceful degradation.

**Blocked by:** 01-bm25-module (needs bm25PreFilter exported from bm25.mjs)

**Status:** ready-for-agent

- [x] Import bm25PreFilter in query.mjs
- [x] Add --no-bm25 CLI flag (boolean, skips BM25 entirely)
- [x] Add --bm25-top-k CLI arg (integer, default 10)
- [x] Insert BM25 step between noise filter and reranker in main()
- [x] BM25 wrapped in try/catch: on error, warn and return original results
- [x] Updated flow: embed -> vector search -> noise filter -> BM25 -> optional reranker -> output
- [x] Scenario 6: --no-bm25 skips BM25 entirely
- [x] Scenario 9: BM25 + --rerank, BM25 runs first then reranker on top-k
- [x] Scenario 10: BM25 + --include-noise, BM25 processes all including noise
- [x] Scenario 11: BM25 error, warning printed, original results returned
- [x] Scenario 15: --include-noise without --rerank, noise with 0 overlap truncated
- [x] All existing query.test.mjs tests still pass

# 01 - BM25 Pure-Function Module + Unit Tests

**What to build:** A standalone BM25 scoring module with tokenize, computeIDF, bm25Score, and bm25PreFilter as pure functions with no external dependencies. All functions exportable and unit-testable in isolation.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

- [x] tokenize() splits English/numbers by whitespace+punctuation as whole lowercased tokens, Chinese per-character
- [x] computeIDF() returns IDF = max(0, ln(1 + (N - n + 0.5) / (n + 0.5)))
- [x] bm25Score() computes standard BM25 with k1=1.5, b=0.75
- [x] bm25PreFilter() orchestrates tokenize+IDF+score+sort+truncate, preserves all fields
- [x] Scenario 1: 15 results, top-k=10 returns top-10 by BM25, vector order preserved
- [x] Scenario 2: 5 results, top-k=10 returns all 5
- [x] Scenario 3: empty result set returns empty array
- [x] Scenario 4: empty query string, all scores=0, original order preserved
- [x] Scenario 5: null chunk_text, score=0, no crash
- [x] Scenario 7: top-k=0 returns empty array
- [x] Scenario 8: top-k=20 with 15 results returns all 15
- [x] Scenario 12: mixed CN-EN query, both languages contribute
- [x] Scenario 13: all same chunk_text, equal scores, stable sort
- [x] Scenario 14: single result returned as-is

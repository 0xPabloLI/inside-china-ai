# 01 — chunkCatalog() + tests

**What to build:** A new `chunkCatalog(entries, sourceIdPrefix)` function in `scripts/rag/lib/chunker.mjs` that converts an array of catalog entry objects (from YAML) into RAG chunk objects. Each entry → one chunk. Chunk text = description + keywords + file + source (only present fields). Chunk title = file basename. This is a pure function with no I/O.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `chunkCatalog()` exported from `chunker.mjs`
- [ ] Returns one chunk per catalog entry with correct `text` composition (description + keywords + file + source)
- [ ] Handles missing optional fields (license, used_in, keywords) — chunk_text only includes present fields
- [ ] Empty array input → returns empty array
- [ ] `sourceId` = entry's `file` field value
- [ ] `chunk_index` = 0 for each entry (one chunk per entry)
- [ ] Tests in `scripts/rag/__tests__/chunker.test.mjs` cover all scenarios from spec matrix (#1-#10)

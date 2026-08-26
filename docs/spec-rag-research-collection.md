# Spec: RAG — Collect `docs/research/` Markdown + Type-Safe Orphan Cleanup

**Issue**: [#118](https://github.com/0xPabloLI/inside-china-ai/issues/118)
**Source**: Grill session (design tree) + Issue #118 comment (5426866894)

---

## Problem Statement

The RAG indexer (`scripts/rag/index.mjs`) currently collects articles, scene-data, `docs/refs/source-materials/`, TikTok references, and the asset catalog. It does **not** collect `docs/research/` where `web-deep-research` writes its reports. Research reports are invisible to RAG queries even after a reindex. Additionally, the orphan cleanup function deletes globally by `source_id` without distinguishing `content_type`, meaning a deleted research report can survive if another content type shares the same ID.

## Solution

Extend the indexer to collect `docs/research/**/*.md` as `content_type = "research"`, and fix the orphan cleanup contract to operate on the full identity `(content_type, source_id, chunk_index)` so that:

1. A deleted research file's chunks are removed even if another content type has the same `source_id`.
2. Trailing chunks left over after a research report is shortened are also removed.
3. No cleanup operation can delete or retain rows belonging to a different content type.

The `web-deep-research` Phase 8 conditional reindex (handoff improvement 4) can then safely depend on this issue.

## User Stories

1. As a content researcher, I want my research reports in `docs/research/` to be searchable via RAG queries, so that I can find prior research by semantic similarity.
2. As a pipeline operator, I want the indexer to automatically discover new research reports, so that I don't have to manually trigger a full rebuild.
3. As a pipeline operator, I want incremental indexing to skip unchanged research reports, so that reindex is fast.
4. As a pipeline operator, I want deleted research reports to be automatically removed from the index, so that stale results don't surface in queries.
5. As a pipeline operator, I want shortened research reports to have their trailing stale chunks removed, so that query results don't contain outdated fragments.
6. As a developer, I want orphan cleanup to never delete rows from a different content type that happens to share a `source_id`, so that cleanup is safe across content types.
7. As a developer, I want the markdown collector to be importable and testable without booting Ollama or Supabase, so that I can run unit tests in isolation.
8. As a developer, I want the markdown collector to use repo-relative paths as `source_id` for research files, so that same-named files in different subdirectories don't collide.
9. As a developer, I want existing collectors (source-materials, tiktok-refs) to continue working unchanged, so that the change is non-breaking.

## Implementation Decisions

### 1. New module: `scripts/rag/lib/collectors.mjs`

Extract `collectMarkdownSource` and `findFilesRecursive` from `index.mjs` into a dedicated module so they can be imported and tested independently.

**`collectMarkdownSource` signature change:**

```
collectMarkdownSource(baseDir, contentType, excludePatterns = [], useRelativePath = false, projectRoot = null)
```

- `useRelativePath = false` (default): `source_id = basename(filePath, ".md")` — preserves existing behavior for source-materials and tiktok-refs.
- `useRelativePath = true`: `source_id = relative(projectRoot, filePath)` without `.md` extension — research files use this mode. `projectRoot` is required when `useRelativePath = true`.

### 2. Research collection in `index.mjs`

Add a new collection call in `main()`:

```
collectMarkdownSource(
  join(projectRoot, "docs", "research"),
  "research",
  ["INDEX.md", "README.md"],
  true,     // useRelativePath
  projectRoot,
)
```

### 3. Orphan cleanup redesign: `cleanupOrphans`

**Current signature:** `cleanupOrphans(client, currentSourceIds: string[])` — deletes globally by `source_id NOT IN (...)`.

**New signature:** `cleanupOrphans(client, currentIdentities: Array<{content_type, source_id, maxChunkIndex}>)`

Two-step deletion:

- **Step A (removed files):** Delete rows where `(content_type, source_id)` is NOT in the current identity set.
- **Step B (stale trailing chunks):** For each identity in the current set, delete rows where `content_type = X AND source_id = Y AND chunk_index > maxChunkIndex`.

PostgREST query construction:
- Step A: `DELETE FROM content_embeddings WHERE NOT (content_type = 'X' AND source_id = 'Y') OR (...)` — use `.not("content_type", "in", "(...)")` combined with `.not("source_id", "in", "(...)")` is insufficient because it's AND not OR. Instead, use `.or()` filter or a composite approach.
- Practical approach: Fetch all distinct `(content_type, source_id)` pairs from DB, compare to current set, delete the difference. This is two queries (SELECT + DELETE) but correct.

Alternative (simpler PostgREST-compatible approach):
- Step A: For each `(content_type, source_id)` pair that exists in DB but NOT in current set: `DELETE WHERE content_type = X AND source_id = Y`.
- Step B: For each current identity: `DELETE WHERE content_type = X AND source_id = Y AND chunk_index > maxChunkIndex`.

To avoid N+1 queries, batch by content_type: for each content_type, collect source_ids to delete and maxChunkIndex mappings.

### 4. `index.mjs` `main()` changes

- Import `collectMarkdownSource` and `findFilesRecursive` from `./lib/collectors.mjs`.
- Add research collection block.
- Build `currentIdentities` array from `allChunks` (group by `content_type + source_id`, track max `chunk_index`).
- Pass `currentIdentities` to `cleanupOrphans`.
- Add `research` to summary output.

### 5. `fetchExistingHashes` — no change needed

The Map key is already `content_type:source_id:chunk_index`, so cross-type collisions in `source_id` don't cause hash comparison errors.

## Testing Decisions

### Test seam: `scripts/rag/lib/collectors.mjs` (new module)

Unit-test `collectMarkdownSource` in isolation:
- Use real fixture files under `scripts/rag/__tests__/fixtures/research/`.
- No Ollama or Supabase needed — `collectMarkdownSource` only does file I/O and chunking.

### Test seam: `scripts/rag/lib/supabase-client.mjs` (existing)

Update existing `cleanupOrphans` tests to use the new signature. Mock client tracks delete calls and filters.

### Prior art

- `chunker.test.mjs` — direct import, no mocks, tests pure functions.
- `supabase-client.test.mjs` — mock Supabase client, tests DB operations.

---

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/rag/lib/supabase-client.mjs` | `cleanupOrphans` signature + logic change | **High** | Core RAG cleanup path. All callers must update. Existing tests must be rewritten for new signature. Worst case: orphan cleanup deletes wrong rows or fails to delete stale ones. Mitigated by: comprehensive test coverage for cross-type safety, stale chunk deletion, and empty-set handling. |
| `scripts/rag/index.mjs` | Extract `collectMarkdownSource` + `findFilesRecursive` to `lib/collectors.mjs`; add research collection; change `cleanupOrphans` call to pass identities; add summary line | **Medium** | Orchestrator file. Extraction changes import paths. `main()` flow changes for identity construction. Mitigated by: preserving existing collector call signatures (backward compatible), incremental testing. |
| `scripts/rag/__tests__/supabase-client.test.mjs` | Rewrite `cleanupOrphans` tests for new signature | **Low** | Test-only file. Tests must cover new contract. |
| `scripts/rag/__tests__/collectors.test.mjs` | New file — test `collectMarkdownSource` with research fixtures | **Low** | New test file, no existing impact. |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | `docs/research/` has 36 .md files | All collected as `content_type="research"`, source_id = relative path without `.md` | Low | Fixture-based unit test |
| 2 | `docs/research/` does not exist | `collectMarkdownSource` returns `[]` (graceful, no error) | Low | Unit test with non-existent dir |
| 3 | Research file with no `##` headings | Whole file = one chunk, `chunk_title = null` | Low | Covered by existing `chunkMarkdown` tests |
| 4 | Research file is empty (0 bytes) | `chunkMarkdown` returns `[]`, no chunks produced | Low | Covered by existing `chunkMarkdown` tests |
| 5 | INDEX.md or README.md in `docs/research/` | Excluded from collection | Low | Unit test with fixture |
| 6 | Incremental reindex with unchanged research files | Hashes match DB → skipped, no embedding | Low | Covered by existing incremental logic |
| 7 | Research file content modified | Hash changes → re-embedded + upserted | Low | Covered by existing incremental logic |
| 8 | Research file deleted | Orphan cleanup removes all chunks for that `(content_type="research", source_id)` | Medium | New cleanupOrphans test |
| 9 | Research file shortened (fewer chunks) | Stale trailing chunks (`chunk_index > new max`) deleted | Medium | New cleanupOrphans test |
| 10 | `source_id` collision: research and source-material both have "cloud-gpu-options" | Cleanup of research type does NOT touch source-material rows | **High** | Cross-type safety test in cleanupOrphans |
| 11 | `currentIdentities` is empty (no content at all) | All rows deleted (clean slate) | Medium | cleanupOrphans empty-set test |
| 12 | Existing source-materials collector still uses basename source_id | No change to existing behavior | Low | Regression: existing source-material tests pass unchanged |
| 13 | Existing tiktok-refs collector still uses basename source_id | No change to existing behavior | Low | Regression: existing tiktok-refs collection works |
| 14 | `useRelativePath=true` with nested subdirectory `docs/research/subdir/report.md` | `source_id = "docs/research/subdir/report"` (no collision with `docs/research/report.md`) | Low | Unit test with nested fixture |
| 15 | Collector can be imported and tested without Ollama/Supabase running | Tests pass with no external services | Low | CI validation |

---

## Out of Scope

- Fixing orphan cleanup for other content types (source-materials, tiktok-refs) to also use relative paths — only research gets `useRelativePath=true`.
- Database schema changes — existing schema already permits any `content_type` string.
- `web-deep-research` Phase 8 reindex integration — this is the blocking dependency; Phase 8 will be updated separately after this issue closes.
- Migrating existing source-materials or tiktok-refs `source_id` from basename to relative paths — would trigger a full reindex; deferred.

## Further Notes

- The `cleanupOrphans` redesign is a wide change to a shared function, but the blast radius is contained: only `index.mjs` calls it, and the tests are in one file. No expand-contract sequence needed.
- PostgREST limitation: `.not("source_id", "in", "(...)")` cannot express `NOT (content_type = X AND source_id = Y)` as a single filter. The implementation will use a two-query approach: SELECT distinct pairs, compute difference, DELETE in batches per content_type. Alternatively, use `.or()` with explicit column conditions.

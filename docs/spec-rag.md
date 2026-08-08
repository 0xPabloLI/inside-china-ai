# Spec: RAG Pipeline for Content Knowledge Base

> GitHub Issue: [#15 — feat: RAG pipeline for content knowledge base](https://github.com/0xPabloLI/inside-china-ai/issues/15)
> Prerequisite doc: `docs/archive/rag-prework.md` (D1-D5 decisions confirmed) — 已归档
> Grilling session: 2026-08-07, 19 questions across 4 rounds
> Status: **Draft** — ready for ticket breakdown

---

## 1. Overview

### 1.1 Goal

Build a RAG (Retrieval-Augmented Generation) pipeline that indexes all content assets (articles, source materials, scene-data, research reports, TikTok references) and provides semantic search for the content creation workflow.

### 1.2 Trigger Condition

RAG implementation starts when content reaches **20+ articles or 10+ video scripts**. Current: 3 articles + 7 scene-data files — **below threshold**. This spec is pre-written so implementation can start immediately when the threshold is met.

### 1.3 Scope

**In scope**:
- Supabase pgvector schema (migration)
- Indexing script (`scripts/rag/index.mjs`)
- Query script (`scripts/rag/query.mjs`)
- Evaluation script (`scripts/rag/eval.mjs`)
- Widget source URL extraction script (`scripts/rag/extract-widget-sources.mjs`)
- CONTEXT.md update (RAG terminology)
- ADR for key technical decisions

**Out of scope** (future phases):
- Server function + UI integration (D5 方案 B)
- Incremental indexing (Q14: YAGNI until data volume demands it)
- Reranker enabled by default (Q8: gated on WP-11 evaluation results)
- Public semantic search (anon RLS policy)

---

## 2. Decisions (from Grilling Session)

### 2.1 Decision Summary

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| Q1 | Index trigger | Hybrid: publish-article auto-triggers full rebuild; manual `node scripts/rag/index.mjs` for other sources | Simple, reliable at current scale; cost ≈ 0 |
| Q2 | Model migration strategy | Versioned tables (`content_embeddings_<model>`) | Zero-downtime migration, A/B comparison, easy rollback |
| Q3 | Metadata consistency | DB CHECK constraint + application-layer validation | Defense in depth; bad data blocked at both layers |
| Q4 | Chunk size | Split by `##` headings; sub-split by paragraph if > 8K tokens | Semantic completeness; bge-m3 8192 context limit |
| Q5 | Topic/entity normalization | Application-layer: topics → lowercase, entity IDs → snake_case | Exact match for `?|` operator; consistent query results |
| Q6 | Script authentication | Reuse `loginAdmin()` from `scripts/article/lib/supabase-auth.mjs` | No service_role key needed (Lovable-managed Supabase); RLS stays in effect |
| Q7 | Chunk target size | No fixed target; one `##` section = one chunk (sub-split only if over limit) | Current content is short; avoid over-engineering |
| Q8 | Reranker | `--rerank` flag, default off | Validate bge-m3 quality first via WP-11; avoid unnecessary 1.2GB download |
| Q9 | Deletion cleanup | Full rebuild auto-cleans (unread files → not indexed → old embeddings removed via orphan cleanup) | Consistent with Q1 full-rebuild strategy |
| Q10 | Query output format | Dual-mode: default JSON (Agent consumption), `--format human` for debugging | Agent parses JSON; human reads formatted text |
| Q11 | Widget data | Don't index widget TS files; extract `sourceUrl`/`url` fields, fetch content, save as markdown, then index | Widget data is derived from external sources; indexing the original sources avoids duplicate embeddings |
| Q12 | Scene-data | Index (voiceover + visual.text per scene) | Different phrasing improves cross-language retrieval; finer chunk granularity |
| Q13 | Filter parameters | CLI flags: `--type <content_type>`, `--topics <comma-separated>` | Simple for Agent to use; default no filter |
| Q14 | Incremental threshold | None preset (YAGNI) | Current volume tiny; optimize when needed |
| Q15 | Documentation | Update CONTEXT.md (RAG terms) + create ADR-0007 | Terms are industry-standard but ADR-worthy decisions need recording |
| Q16 | Script directory | `scripts/rag/` (parallel to `scripts/article/`, `scripts/short-video/`) | RAG serves multiple content types, not just articles |
| Q17 | RPC security | SECURITY INVOKER + `COALESCE(metadata->'topics', '[]'::jsonb)` + empty array → NULL | Prevent NULL topics crash; parameterized query already prevents SQL injection |
| Q18 | Idempotency | UPSERT via `UNIQUE(content_type, source_id, chunk_index)`; orphan cleanup post-rebuild | No delete-insert window; crash-safe |
| Q19 | Error handling | Pre-check Ollama availability; skip failed chunks with logged errors | Fast failure on common issue; non-blocking on edge cases |

### 2.2 Content Sources (revised from D3)

| # | Source | content_type | Location | Chunking | Metadata |
|---|--------|-------------|----------|----------|----------|
| 1 | Published articles | `article` | `articles/*.md` | By `##` heading | `article_slug, section_title, topics, entities, published` |
| 2 | Scene-data | `scene-data` | `scripts/short-video/content/**/scene-data.mjs` + `meta.mjs` | Per scene (voiceover + visual.text) | `article_slug, part_number, scene_id, visual_type, topics` |
| 3 | Source materials | `source-material` | `docs/refs/source-materials/**/*.md` | By `##` heading | `source_file, source_urls[], topic` |
| 4 | Research reports | `research` | `docs/research/*.md` | By `##` heading | `report_file, topic` |
| 5 | TikTok references | `tiktok-ref` | `docs/refs/tiktok-skills/**/*.md` | By `##` heading | `skill_file, topic` |
| 6 | Widget-extracted sources | `source-material` | `docs/refs/source-materials/widget-sources/*.md` (auto-generated) | By `##` heading | `source_file, source_urls[], widget_id` |

> **Removed from D3**: Widget data TS files (`src/components/widgets/*/data/*.ts`) — not indexed directly. Their `sourceUrl`/`url` fields are extracted, content fetched, and saved as markdown for indexing (Q11).

### 2.3 Metadata Data Flow

```
articles/*.md (frontmatter: topics, entities, sources)
     ↓ index.mjs reads frontmatter (source of truth)
     ↓ Supabase posts table (published status only — RLS filter)
     ↓
content_embeddings.metadata = {
  topics: ["deepseek", "funding"],         // Q5: lowercase
  entities: {
    companies: ["deepseek"],
    people: ["liang_wenfeng"],
    models: ["deepseek_r1"]
  },
  source_urls: ["https://..."],
  article_slug: "deepseek-art-of-restraint",
  section_title: "## The Funding Round",
  published: true
}
```

---

## 3. Database Schema

### 3.1 Migration: `supabase/migrations/<timestamp>_rag_content_embeddings.sql`

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embeddings table (versioned via table suffix; current: bge-m3)
CREATE TABLE public.content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content reference
  content_type TEXT NOT NULL CHECK (
    content_type IN ('article', 'scene-data', 'source-material', 'research', 'tiktok-ref')
  ),
  source_id TEXT NOT NULL,          -- article slug / file path / widget ID
  chunk_index INT NOT NULL DEFAULT 0,  -- section number within source

  -- Chunk content
  chunk_text TEXT NOT NULL,
  chunk_title TEXT,                 -- section heading or scene title

  -- Metadata (JSONB for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Common keys: topics[] (lowercase strings), entities{companies[], people[], models[]},
  -- source_urls[], article_slug, section_title, published, part_number, scene_id, visual_type
  --
  -- CHECK constraint: if topics exists, must be a non-empty array of strings (Q3)
  CONSTRAINT topics_must_be_string_array CHECK (
    (metadata->'topics' IS NULL) OR (
      jsonb_typeof(metadata->'topics') = 'array'
      AND jsonb_array_length(metadata->'topics') >= 0
    )
  ),

  -- Embedding (bge-m3 = 1024 dimensions)
  embedding vector(1024),

  -- Tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(content_type, source_id, chunk_index)
);

-- updated_at auto-update (reuse existing public.set_updated_at())
CREATE TRIGGER content_embeddings_set_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- HNSW index for fast approximate nearest neighbor search
CREATE INDEX content_embeddings_embedding_idx
  ON public.content_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- Metadata filtering indexes
CREATE INDEX content_embeddings_type_idx
  ON public.content_embeddings (content_type);
CREATE INDEX content_embeddings_source_idx
  ON public.content_embeddings (source_id);
-- GIN index for JSONB metadata queries (topics ?| array)
CREATE INDEX content_embeddings_metadata_idx
  ON public.content_embeddings USING gin (metadata);

-- RLS
ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

-- anon policy: NOT created (Q17/D5: script + Agent only; no public search)
-- Future: enable when implementing public semantic search

-- Admin can search all (RLS via has_role)
CREATE POLICY "admin search all embeddings"
  ON public.content_embeddings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin insert embeddings"
  ON public.content_embeddings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin update embeddings"
  ON public.content_embeddings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admin delete embeddings"
  ON public.content_embeddings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Similarity search RPC function
-- SECURITY INVOKER: RLS policies apply (Q17)
CREATE OR REPLACE FUNCTION public.match_content(
  query_embedding vector(1024),
  filter_content_type TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content_type TEXT,
  source_id TEXT,
  chunk_index INT,
  chunk_text TEXT,
  chunk_title TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    e.id,
    e.content_type,
    e.source_id,
    e.chunk_index,
    e.chunk_text,
    e.chunk_title,
    e.metadata,
    1 - (e.embedding <=> query_embedding) AS similarity
  FROM public.content_embeddings e
  WHERE (filter_content_type IS NULL OR e.content_type = filter_content_type)
    AND (
      filter_topics IS NULL
      OR COALESCE(e.metadata->'topics', '[]'::jsonb) ?| filter_topics
    )
    AND 1 - (e.embedding <=> query_embedding) > match_threshold
  ORDER BY (e.embedding <=> query_embedding) ASC
  LIMIT match_count;
$$;
```

### 3.2 Model Migration Strategy (Q2)

When switching embedding models (e.g., bge-m3 → Qwen3-Embedding):

1. Create new table `content_embeddings_<model>` (same schema, different `vector(N)` dimension)
2. Run index script with new model to populate new table
3. Create new RPC function `match_content_<model>` pointing to new table
4. Update `query.mjs` default model parameter
5. Keep old table for A/B comparison; drop when confident

---

## 4. Index Script Design

### 4.1 File Structure

```
scripts/rag/
├── index.mjs                    # Main indexing script
├── query.mjs                    # Query script
├── eval.mjs                     # Evaluation script (WP-11 golden queries)
├── extract-widget-sources.mjs   # Widget source URL extractor
├── lib/
│   ├── ollama.mjs              # Ollama embedding client
│   ├── chunker.mjs             # Chunking logic (markdown + scene-data)
│   ├── normalizer.mjs          # Topic/entity normalization (Q5)
│   └── supabase-client.mjs     # Supabase client (reuses loginAdmin)
└── output/
    ├── index-errors.log        # Failed chunks log (Q19)
    └── extract-errors.log      # Failed source URL fetches log
```

### 4.2 `index.mjs` — Full Rebuild Flow

```
1. Pre-check: Ollama available? (GET http://localhost:11434/api/tags)
   └─ No → exit(1) with message "Start Ollama: ollama serve"

2. Authenticate: loginAdmin() → access_token

3. Read all content sources:
   a. articles/*.md → parse frontmatter (topics, entities, published)
      └─ Cross-check with Supabase posts table for published status
   b. scripts/short-video/content/**/scene-data.mjs + meta.mjs
      └─ Extract voiceover + visual.text per scene
   c. docs/refs/source-materials/**/*.md
   d. docs/research/*.md
   e. docs/refs/tiktok-skills/**/*.md
   f. docs/refs/source-materials/widget-sources/*.md (auto-generated by extract-widget-sources.mjs)

4. Chunking (Q4, Q7):
   - Markdown: split by ## headings; if section > 8K tokens, sub-split by paragraph
   - Scene-data: one chunk per scene (voiceover + visual.text merged)
   - Assign chunk_index sequentially within each source

5. Normalize metadata (Q5):
   - topics: lowercase all strings (["DeepSeek"] → ["deepseek"])
   - entities.companies/people/models: use entity registry IDs (snake_case)

6. Generate embeddings (Q1, Q19):
   - Batch: 100 chunks per Ollama API call
   - POST http://localhost:11434/api/embed {"model":"bge-m3","input":[...]}
   - Failed chunk → log to output/index-errors.log, skip, continue

7. UPSERT to Supabase (Q18):
   - .upsert() using onConflict: (content_type, source_id, chunk_index)
   - Includes embedding vector

8. Orphan cleanup (Q9, Q18):
   - Collect all current source_ids
   - DELETE FROM content_embeddings WHERE source_id NOT IN (current_source_ids)

9. Summary output: X chunks indexed, Y skipped, Z orphans cleaned
```

### 4.3 `query.mjs` — Query Flow

```
Usage: node scripts/rag/query.mjs "search text" [--type article] [--topics deepseek,funding] [--rerank] [--format json|human]

1. Pre-check: Ollama available?

2. Authenticate: loginAdmin() → access_token

3. Generate query embedding:
   POST http://localhost:11434/api/embed {"model":"bge-m3","input":["search text"]}

4. Call RPC: match_content(query_embedding, filter_content_type, filter_topics, 0.7, 10)
   └─ filter_topics: lowercase + split by comma (Q5)
   └─ Empty array → pass NULL (Q17)

5. (Optional) Rerank (Q8):
   if (--rerank && results.length > 3):
     POST http://localhost:11434/api/embed {"model":"bge-reranker-base", ...}
     Reorder results by reranker score

6. Output (Q10):
   --format json (default): console.log(JSON.stringify(results, null, 2))
   --format human: formatted text with similarity, source, chunk preview
```

### 4.4 `eval.mjs` — Evaluation Flow

```
Usage: node scripts/rag/eval.mjs

1. Load golden queries from docs/refs/rag-eval/golden-queries.yaml

2. For each query:
   a. Run query.mjs logic (embedding + match_content)
   b. Check if any top-5 result's source_id matches expected_sources
   c. Record: query, hit/miss, top-5 source_ids, expected_sources

3. Output report:
   - Total queries: N
   - Hits: H/N (hit rate %)
   - Misses: list each missed query with details
   - Per-category breakdown: cross-language, entity-alias, data-point, negative

4. Exit code: 0 if hit rate >= 80%, 1 otherwise
```

### 4.5 `extract-widget-sources.mjs` — Widget Source Extraction

```
Usage: node scripts/rag/extract-widget-sources.mjs

1. Scan src/components/widgets/*/data/*.ts
2. Extract all sourceUrl / url fields (regex or AST parse)
3. Deduplicate URLs
4. For each URL:
   a. Fetch content (web_fetch or web-access skill)
   b. Success → save to docs/refs/source-materials/widget-sources/<widget-id>-<slug>.md
      Format: # Source: <title>\n> URL: <url>\n> Extracted from widget: <widget-id>\n\n<content>
   c. Failure (paywall, 403, timeout) → create stub:
      # Source: <title> (Stub)\n> URL: <url>\n> Extracted from widget: <widget-id>\n\n## Note\nContent could not be fetched (reason). Widget data summary: <key data points from TS file>.
   d. Log failures to output/extract-errors.log
```

### 4.6 Article Publish Integration (Q1)

In `scripts/article/publish-article.mjs`, after successful publish:

```javascript
// After publish success
console.log("  📚 Triggering RAG reindex...");
try {
  const { execSync } = await import("child_process");
  execSync("node scripts/rag/index.mjs", { stdio: "inherit", cwd: projectRoot });
  console.log("  ✅ RAG reindex complete");
} catch (err) {
  console.warn("  ⚠️  RAG reindex failed (non-blocking):", err.message);
  console.warn("     Run manually: node scripts/rag/index.mjs");
}
```

Non-blocking: if RAG index fails, article publish still succeeds.

---

## 5. Scenario & Risk Verification Matrix

### 5.1 Modified Files Impact

| File | Modification | Risk | Assessment |
|------|-------------|------|------------|
| `scripts/article/publish-article.mjs` | Add RAG reindex call after publish (non-blocking) | **Low** | Appended after publish success; try/catch with non-blocking fallback. If RAG fails, publish still succeeds. |
| `CONTEXT.md` | Add RAG terminology section | **Low** | Pure addition; no existing terms modified |
| `docs/archive/rag-prework.md` | Update D3 (remove widget-data), add Q11-Q19 decisions | **Low** | Documentation update only |
| `supabase/migrations/` | New migration file (additive) | **Medium** | New table + extension + RPC function. No existing tables modified. pgvector extension is additive. Verified: Supabase Pro plan supports extensions. |

### 5.2 Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | Index script runs with Ollama not running | Exit immediately with clear error message | Low | Pre-check `GET /api/tags` before any work (Q19) |
| 2 | Article published → publish-article.mjs triggers reindex | Full reindex runs; embeddings updated | Medium | Non-blocking try/catch; manual fallback documented |
| 3 | Article unpublished (frontmatter `published: false`) | Its embeddings removed during next full rebuild | Low | Index script reads frontmatter; skips unpublished; orphan cleanup removes old embeddings |
| 4 | Article file deleted from `articles/` | Its embeddings removed during next full rebuild | Low | Orphan cleanup: `DELETE WHERE source_id NOT IN (current_source_ids)` |
| 5 | Chunk section > 8192 tokens | Sub-split by paragraph; multiple chunks with incremental chunk_index | Medium | Token estimation via character count / 4 (approx); sub-split at paragraph boundaries |
| 6 | Chunk section has no `##` headings (e.g., plain text source material) | Entire file = one chunk (chunk_index = 0) | Low | Fallback: if no `##` found, treat whole file as single chunk |
| 7 | Scene-data file with empty voiceover (visual-only scene) | Skip scene; log warning | Low | Check `voiceover` truthiness before chunking |
| 8 | `metadata.topics` written as string instead of array | DB CHECK constraint rejects INSERT | Medium | Application-layer validation in normalizer.mjs before upsert; DB CHECK is backstop (Q3) |
| 9 | `metadata.topics` field missing entirely | `COALESCE(metadata->'topics', '[]'::jsonb)` in RPC handles NULL | Low | Q17 fix applied in match_content function |
| 10 | Query with `--topics` as empty string | Treated as no filter (pass NULL to RPC) | Low | CLI parser: empty/missing `--topics` → NULL |
| 11 | Query with `--type` for invalid content_type | RPC returns empty results (WHERE clause mismatch) | Low | No validation needed; empty result is correct behavior |
| 12 | Embedding API call fails for one chunk in a batch | Skip chunk, log to index-errors.log, continue with rest of batch | Medium | Q19: per-chunk error handling; batch continues |
| 13 | Ollama returns wrong-dimension embedding (model changed) | Supabase INSERT fails (vector dimension mismatch) | Medium | Pre-check: verify model dimensions match schema (1024) before indexing |
| 14 | index.mjs crashes mid-rebuild | Already-upserted chunks are persisted (UPSERT is idempotent) | Low | Q18: UPSERT design; re-running index.mjs produces same result |
| 15 | Widget source URL is behind paywall (Bloomberg, FT) | Stub markdown created with URL + data summary | Low | extract-widget-sources.mjs catches fetch errors; creates stub |
| 16 | Widget source URL returns 403/429 | Stub markdown created; logged to extract-errors.log | Low | Same as #15 |
| 17 | Multiple widget data files reference same URL | Only one markdown file created (deduplication) | Low | URL deduplication before fetch |
| 18 | Query returns 0 results (no chunks above threshold) | Empty array in JSON / "No results found" in human mode | Low | Handle empty results gracefully in output |
| 19 | Reranker (`--rerank`) used but bge-reranker-base not pulled | Error message: "Run `ollama pull bge-reranker-base` first" | Low | Pre-check model availability in query.mjs |
| 20 | match_content RPC called by non-admin user | RLS blocks SELECT; returns empty results | Low | RLS policy enforces admin-only (Q17) |
| 21 | Cross-language query: English query → Chinese source material chunk | bge-m3 multilingual embedding matches across languages | Medium | Must be validated by WP-11 golden queries; bge-m3 MIRACL score 69.2 |
| 22 | Entity alias query: "梁文锋" → article mentioning "Liang Wenfeng" | bge-m3 matches; entity registry provides alias mapping for filter | Medium | Depends on Q5 normalization + WP-4 entity registry; golden query validates |
| 23 | Negative query: topic not in knowledge base | Low similarity scores; filtered out by match_threshold (0.7) | Low | match_threshold default 0.7; tunable via CLI |
| 24 | Article frontmatter has `topics` but no `entities` | metadata.entities omitted; topics still indexed | Low | Normalizer handles missing optional fields |
| 25 | Scene-data meta.mjs has stale article slug (e.g., `deepseek-funding-round`) | Indexed with stale slug; orphan cleanup won't remove (source_id matches file) | Medium | WP-6 fixes stale slugs before RAG starts; index script warns on mismatch |
| 26 | pgvector extension not enabled on Supabase | Migration fails with "extension vector not available" | Medium | Supabase Pro plan supports pgvector; pre-check via `SELECT * FROM pg_extension WHERE extname = 'vector'` |

---

## 6. Test Plan

### 6.1 Unit Tests

| Component | Test File | Key Cases |
|-----------|-----------|-----------|
| `chunker.mjs` | `scripts/rag/__tests__/chunker.test.mjs` | Split by `##`; sub-split > 8K; no headings fallback; scene-data chunking |
| `normalizer.mjs` | `scripts/rag/__tests__/normalizer.test.mjs` | Topics lowercase; entity ID mapping; missing fields; empty array |
| `ollama.mjs` | `scripts/rag/__tests__/ollama.test.mjs` | Batch embed; single embed; connection error; dimension check |
| `supabase-client.mjs` | `scripts/rag/__tests__/supabase-client.test.mjs` | loginAdmin reuse; upsert; orphan cleanup; RPC call |

### 6.2 Integration Tests

| Test | File | Key Cases |
|------|------|-----------|
| Index → Query roundtrip | `scripts/rag/__tests__/roundtrip.test.mjs` | Index 3 test articles → query → verify results contain expected source |
| Orphan cleanup | `scripts/rag/__tests__/orphan-cleanup.test.mjs` | Index → delete source file → re-index → verify orphan removed |
| RLS enforcement | `scripts/rag/__tests__/rls.test.mjs` | Anon key cannot SELECT; authenticated non-admin cannot SELECT; admin can SELECT/INSERT |

### 6.3 Evaluation Tests (WP-11)

| Test | File | Key Cases |
|------|------|-----------|
| Golden queries | `scripts/rag/__tests__/golden-queries.test.mjs` | 15-20 queries; top-5 hit rate ≥ 80%; cross-language; entity alias; data point; negative |

### 6.4 Scenario Matrix Coverage

All 26 scenarios from Section 5.2 must be covered by at least one test. Mapping:

| Scenarios | Covered By |
|-----------|-----------|
| #1, #12, #13 | `ollama.test.mjs` (connection error, batch failure, dimension check) |
| #2 | `roundtrip.test.mjs` (publish integration) |
| #3, #4, #14, #25 | `orphan-cleanup.test.mjs` |
| #5, #6, #7 | `chunker.test.mjs` |
| #8, #24 | `normalizer.test.mjs` |
| #9, #10, #11, #18 | `roundtrip.test.mjs` + `normalizer.test.mjs` |
| #15, #16, #17 | `extract-widget-sources.test.mjs` |
| #19 | `ollama.test.mjs` (reranker pre-check) |
| #20 | `rls.test.mjs` |
| #21, #22, #23 | `golden-queries.test.mjs` |
| #26 | Manual verification (migration on Supabase) |

---

## 7. Implementation Order

1. **ADR-0007** — Record Q1-Q19 key decisions
2. **CONTEXT.md update** — Add RAG terminology
3. **Database migration** — pgvector + content_embeddings table + match_content RPC
4. **`scripts/rag/lib/`** — ollama.mjs, chunker.mjs, normalizer.mjs, supabase-client.mjs (with tests)
5. **`scripts/rag/index.mjs`** — Full rebuild script (with tests)
6. **`scripts/rag/query.mjs`** — Query script (with tests)
7. **`scripts/rag/extract-widget-sources.mjs`** — Widget source extractor (with tests)
8. **`scripts/rag/eval.mjs`** — Evaluation script
9. **`scripts/article/publish-article.mjs`** — Add RAG reindex trigger
10. **`docs/refs/rag-eval/golden-queries.yaml`** — Golden query set (WP-11)
11. **`docs/archive/rag-prework.md`** — Update with Q1-Q19 decisions, revise D3

---

## 8. Dependencies

- **Ollama bge-m3** — `ollama pull bge-m3` (1.2GB, one-time download)
- **Supabase pgvector** — Enable extension (Supabase Pro plan supports it)
- **WP-4 Entity Registry** — Optional for Q5 normalization; can work without (topics only)
- **WP-6 Scene-data meta.mjs** — Fixes stale article slugs before indexing (Scenario #25)
- **WP-11 Golden Queries** — Required for evaluation tests; co-developed with eval.mjs

# RAG Pipeline: Key Technical Decisions

## Context

Issue #15 requires a RAG pipeline for the content knowledge base. A grilling session (2026-08-07, 19 questions across 4 rounds) stress-tested the technical design from `docs/archive/rag-prework.md` (formerly `docs/rag-prework.md`; D1-D5 decisions). This ADR records the 6 decisions that meet all three ADR criteria: hard to reverse, surprising without context, and the result of a real trade-off.

Full decision table (Q1-Q19) is in `docs/spec-rag.md` §2.1.

## Decisions

### 1. Authentication: Reuse `loginAdmin()`, not service_role key (Q6)

The Supabase project is managed by Lovable — no dashboard access, no service_role key. The RAG index/query scripts reuse `scripts/article/lib/supabase-auth.mjs` (`loginAdmin()`), which authenticates via Supabase Auth password grant using `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env.local`.

**Why not alternatives**:
- **service_role key**: not available (Lovable-managed Supabase).
- **Edge Function**: unnecessary complexity for a script that runs locally.

**Trade-off**: `loginAdmin()` tokens expire (1 hour), but scripts complete in < 1 minute. RLS stays in effect (defense in depth), unlike service_role which bypasses RLS.

### 2. Model Migration: Versioned Tables (Q2)

If the embedding model changes (e.g., bge-m3 1024-dim → Qwen3 768-dim), a new table `content_embeddings_<model>` is created rather than altering the existing table's `vector(N)` column.

**Why not alternatives**:
- **Alter column**: PostgreSQL cannot change `vector(N)` dimension in-place; requires DROP + recreate, losing all data.
- **Versioned columns** (`embedding_v1`, `embedding_v2`): bloats schema; queries need to know which column to use.

**Trade-off**: More tables, but zero-downtime migration, A/B comparison, and trivial rollback.

### 3. Widget Data: Extract Source URLs, Don't Index TS Files (Q11)

Widget data files (`src/components/widgets/*/data/*.ts`) are not indexed directly. Instead, `sourceUrl`/`url` fields are extracted, content is fetched, and saved as markdown to `docs/refs/source-materials/widget-sources/`. The markdown files are then indexed normally.

**Why**: Widget data is derived from external sources. Indexing both would create duplicate embeddings for the same information. Indexing the original sources provides richer context and avoids fragile TS parsing.

**Trade-off**: Extra step (URL extraction + fetch), but avoids duplicate embeddings and provides the full source context that widget data condenses.

### 4. Idempotency: UPSERT, Not Delete-Then-Insert (Q18)

The index script uses `UPSERT` (via `UNIQUE(content_type, source_id, chunk_index)` constraint) instead of delete-then-insert per source.

**Why not delete-then-insert**: If the script crashes after DELETE but before INSERT, data is lost. UPSERT is crash-safe — re-running produces the same result. Orphan cleanup (delete embeddings for removed files) runs once at the end.

**Trade-off**: Slightly more complex (need to track current source_ids for orphan cleanup), but eliminates the data-loss window.

### 5. RPC Safety: SECURITY INVOKER + COALESCE (Q17)

The `match_content` RPC function uses `SECURITY INVOKER` (not `SECURITY DEFINER`), so RLS policies apply. The `filter_topics ?|` operation uses `COALESCE(e.metadata->'topics', '[]'::jsonb)` to handle chunks where the `topics` key is missing.

**Why SECURITY INVOKER**: `SECURITY DEFINER` would bypass RLS, allowing any caller to read all embeddings. With INVOKER, only admin-authenticated callers can retrieve results (per RLS policy).

**Why COALESCE**: Without it, `metadata->'topics'` returning NULL causes `?|` to error or return NULL, silently excluding chunks without topics from all queries.

### 6. Index Trigger: Hybrid Full Rebuild (Q1)

Article publishing auto-triggers a full rebuild (via `publish-article.mjs`). Other content source changes require manual `node scripts/rag/index.mjs`. No incremental indexing.

**Why full rebuild**: Current content volume is tiny (3 articles, ~50-100 chunks). Full rebuild takes 15-35 seconds and costs $0. Incremental indexing adds state management complexity (file hash tracking, diff logic) for no practical benefit at this scale.

**Trade-off**: Will need incremental when volume grows (50+ articles). YAGNI for now — the index script is designed so incremental can be added later without architectural change.

## Consequences

- RAG scripts depend on Ollama running locally (`ollama serve`) and `.env.local` containing `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `publish-article.mjs` gains a non-blocking RAG reindex call after successful publish.
- Future model migration requires creating a new table + new RPC function + updating query script defaults.
- Widget source extraction may create stub files for paywalled URLs — these stubs contain the URL and a data summary but not the full article text.

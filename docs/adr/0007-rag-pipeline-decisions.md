# RAG Pipeline: Key Technical Decisions

The content knowledge base requires a RAG pipeline for semantic search across articles, scene-data, and source materials. Six decisions from a grilling session (2026-08-07, 19 questions across 4 rounds) meet the ADR criteria: hard to reverse, surprising without context, and the result of a real trade-off.

## Decisions

### 1. Authentication: Reuse `loginAdmin()`, not service_role key

The Supabase project is managed by Lovable — no dashboard access, no service_role key. RAG scripts reuse `scripts/article/lib/supabase-auth.mjs` (`loginAdmin()`) via Supabase Auth password grant. RLS stays in effect (defense in depth), unlike service_role which bypasses RLS. Trade-off: tokens expire (1 hour), but scripts complete in < 1 minute.

### 2. Model Migration: Versioned Tables

If the embedding model changes (e.g., bge-m3 1024-dim → Qwen3 768-dim), a new table `content_embeddings_<model>` is created rather than altering the existing `vector(N)` column. PostgreSQL cannot change `vector(N)` dimension in-place without DROP + recreate. Trade-off: more tables, but zero-downtime migration, A/B comparison, and trivial rollback.

### 3. Widget Data: Extract Source URLs, Don't Index TS Files

Widget data files are not indexed directly. Instead, `sourceUrl`/`url` fields are extracted, content fetched, and saved as markdown to `docs/refs/source-materials/`. Indexing both would create duplicate embeddings for the same information.

### 4. Idempotency: UPSERT, Not Delete-Then-Insert

The index script uses `UPSERT` (via `UNIQUE(content_type, source_id, chunk_index)` constraint). Delete-then-insert has a data-loss window if the script crashes after DELETE but before INSERT. UPSERT is crash-safe — re-running produces the same result.

### 5. RPC Safety: SECURITY INVOKER + COALESCE

The `match_content` RPC uses `SECURITY INVOKER` (not `SECURITY DEFINER`) so RLS policies apply. The `filter_topics ?|` operation uses `COALESCE(e.metadata->'topics', '[]'::jsonb)` to handle chunks missing the `topics` key — without it, NULL causes silent exclusion from all queries.

### 6. Index Trigger: Content-Ready, Non-Blocking

RAG reindex triggers at three content-pipeline stages (see `docs/content-pipeline.md` Stage 2c/3b/4b). All three are non-blocking: if Ollama is unavailable, the pipeline continues and the agent warns the user. Incremental indexing is implemented (commit `ea20bd3`) — only chunks with changed content hash are re-embedded.

## Consequences

- RAG scripts depend on Ollama running locally and `.env.local` containing `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `publish-article.mjs` triggers RAG reindex after successful publish (non-blocking).
- Future model migration requires creating a new table + new RPC function + updating query script defaults.
- Widget source extraction may create stub files for paywalled URLs.

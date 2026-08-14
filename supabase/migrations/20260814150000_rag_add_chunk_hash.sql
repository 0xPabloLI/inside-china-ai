-- RAG Incremental Indexing: add chunk_hash column
-- Allows index.mjs to skip unchanged chunks (hash match → no re-embed needed)
-- Spec: incremental indexing for content_embeddings

-- Add chunk_hash column: SHA-256 hex of chunk_text, used for change detection
ALTER TABLE public.content_embeddings
ADD COLUMN IF NOT EXISTS chunk_hash TEXT;

-- Index for fast hash lookups (WHERE chunk_hash = ANY(...))
CREATE INDEX IF NOT EXISTS content_embeddings_hash_idx
ON public.content_embeddings (content_type, source_id, chunk_hash);

-- Backfill: existing rows get chunk_hash from their chunk_text
-- Uses encode(digest(chunk_text, 'sha256'), 'hex') — requires pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;
UPDATE public.content_embeddings
SET chunk_hash = encode(digest(chunk_text, 'sha256'), 'hex')
WHERE chunk_hash IS NULL;

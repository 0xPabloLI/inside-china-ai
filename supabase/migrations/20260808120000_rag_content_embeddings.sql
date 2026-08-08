-- RAG Pipeline: content_embeddings table + match_content RPC
-- Spec: docs/spec-rag.md §3.1
-- ADR: docs/adr/0007-rag-pipeline-decisions.md

-- ─── Enable pgvector extension ───
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Embeddings table (versioned via table suffix; current: bge-m3) ───
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
  -- CHECK constraint: if topics exists, must be an array of strings (Q3)
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

-- ─── updated_at auto-update (reuse existing public.set_updated_at()) ───
CREATE TRIGGER content_embeddings_set_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── HNSW index for fast approximate nearest neighbor search ───
CREATE INDEX content_embeddings_embedding_idx
  ON public.content_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- ─── Metadata filtering indexes ───
CREATE INDEX content_embeddings_type_idx
  ON public.content_embeddings (content_type);
CREATE INDEX content_embeddings_source_idx
  ON public.content_embeddings (source_id);
-- GIN index for JSONB metadata queries (topics ?| array)
CREATE INDEX content_embeddings_metadata_idx
  ON public.content_embeddings USING gin (metadata);

-- ─── RLS ───
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

-- ─── Similarity search RPC function ───
-- SECURITY INVOKER: RLS policies apply (Q17)
-- COALESCE: handles chunks where topics key is missing (Q17)
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

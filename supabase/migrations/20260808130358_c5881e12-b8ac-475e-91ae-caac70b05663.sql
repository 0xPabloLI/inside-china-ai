-- RAG Pipeline: content_embeddings table + match_content RPC
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (
    content_type IN ('article', 'scene-data', 'source-material', 'research', 'tiktok-ref')
  ),
  source_id TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  chunk_title TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  CONSTRAINT topics_must_be_string_array CHECK (
    (metadata->'topics' IS NULL) OR (
      jsonb_typeof(metadata->'topics') = 'array'
      AND jsonb_array_length(metadata->'topics') >= 0
    )
  ),
  embedding vector(1024),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(content_type, source_id, chunk_index)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_embeddings TO authenticated;
GRANT ALL ON public.content_embeddings TO service_role;

ALTER TABLE public.content_embeddings ENABLE ROW LEVEL SECURITY;

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

CREATE TRIGGER content_embeddings_set_updated_at
  BEFORE UPDATE ON public.content_embeddings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX content_embeddings_embedding_idx
  ON public.content_embeddings
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX content_embeddings_type_idx
  ON public.content_embeddings (content_type);
CREATE INDEX content_embeddings_source_idx
  ON public.content_embeddings (source_id);
CREATE INDEX content_embeddings_metadata_idx
  ON public.content_embeddings USING gin (metadata);

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
SET search_path = public
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

GRANT EXECUTE ON FUNCTION public.match_content(vector, TEXT, TEXT[], FLOAT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_content(vector, TEXT, TEXT[], FLOAT, INT) TO service_role;
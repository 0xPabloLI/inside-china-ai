-- RAG: Lower match_content default threshold from 0.7 to 0.3
--
-- The original migration (20260808120000) set match_threshold DEFAULT 0.7,
-- but the application layer (query.mjs, eval.mjs) consistently uses 0.3.
-- bge-m3 empirical evaluation shows positive queries hit 0.60-0.70 similarity;
-- a 0.7 threshold would return empty results for most queries if called
-- without an explicit threshold parameter.
--
-- This migration aligns the DB default with the application default (0.3)
-- so that any future client calling match_content without an explicit
-- threshold gets the same behavior as the current RAG query scripts.

CREATE OR REPLACE FUNCTION public.match_content(
  query_embedding vector(1024),
  filter_content_type TEXT DEFAULT NULL,
  filter_topics TEXT[] DEFAULT NULL,
  match_threshold FLOAT DEFAULT 0.3,
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

-- Re-grant EXECUTE (CREATE OR REPLACE may reset privileges)
GRANT EXECUTE ON FUNCTION public.match_content(
  vector(1024), TEXT, TEXT[], FLOAT, INT
) TO authenticated;

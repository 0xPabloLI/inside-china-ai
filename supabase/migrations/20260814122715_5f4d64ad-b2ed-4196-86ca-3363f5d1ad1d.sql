-- Add 'asset-catalog' as a valid content_type in content_embeddings
-- Needed for RAG pipeline to index media asset catalog entries

ALTER TABLE public.content_embeddings
  DROP CONSTRAINT IF EXISTS content_embeddings_content_type_check;

ALTER TABLE public.content_embeddings
  ADD CONSTRAINT content_embeddings_content_type_check CHECK (
    content_type IN (
      'article', 'scene-data', 'source-material', 'research', 'tiktok-ref',
      'asset-catalog'
    )
  );
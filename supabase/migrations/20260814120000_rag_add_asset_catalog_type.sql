-- Add 'asset-catalog' to content_type CHECK constraint
--
-- Allows the RAG pipeline to index asset catalog entries from
-- scripts/short-video/assets/catalog.yml (see docs/media-asset-management.md §2).
--
-- The original migration (20260808120000_rag_content_embeddings.sql)
-- defined a CHECK constraint with 5 content types. This adds the 6th.

ALTER TABLE public.content_embeddings
  DROP CONSTRAINT content_embeddings_content_type_check;

ALTER TABLE public.content_embeddings
  ADD CONSTRAINT content_embeddings_content_type_check CHECK (
    content_type IN (
      'article',
      'scene-data',
      'source-material',
      'research',
      'tiktok-ref',
      'asset-catalog'
    )
  );

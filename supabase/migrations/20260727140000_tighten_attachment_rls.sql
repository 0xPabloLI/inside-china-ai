
-- ============================================================
-- Tighten attachment security: block enumeration + protect drafts
--
-- Bucket stays public (files accessible via permanent public URLs),
-- but anon can no longer:
--   1. List/enumerate files in the storage bucket
--   2. Read attachment metadata (incl. storage_path) for draft posts
-- ============================================================

-- 1. Storage: remove anon SELECT on storage.objects for this bucket
--    Public URLs (/storage/v1/object/public/...) still work because
--    they bypass RLS. But the Storage API list/read endpoints now
--    require authentication.
DROP POLICY IF EXISTS "public read post-attachments" ON storage.objects;

-- 2. post_attachments table: replace the wide-open public read policy
--    with one that only exposes attachments belonging to PUBLISHED posts.
DROP POLICY IF EXISTS "public read attachments" ON public.post_attachments;

CREATE POLICY "public read published attachments"
  ON public.post_attachments FOR SELECT TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.posts
      WHERE posts.id = post_attachments.post_id
        AND posts.published = true
    )
  );

-- 3. Admin can read ALL attachments (including draft posts)
CREATE POLICY "admin read all attachments"
  ON public.post_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

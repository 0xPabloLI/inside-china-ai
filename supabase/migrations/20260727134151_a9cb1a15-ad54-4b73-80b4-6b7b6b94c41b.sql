DROP POLICY IF EXISTS "public read post-attachments" ON storage.objects;

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

CREATE POLICY "admin read all attachments"
  ON public.post_attachments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
-- Storage: explicit read policies for post-attachments
CREATE POLICY "public read published post-attachments"
ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'post-attachments'
  AND EXISTS (
    SELECT 1 FROM public.post_attachments pa
    JOIN public.posts p ON p.id = pa.post_id
    WHERE pa.storage_path = storage.objects.name
      AND p.published = true
  )
);

CREATE POLICY "admin read post-attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'post-attachments' AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Profiles: remove blanket public read
DROP POLICY IF EXISTS "profiles public read" ON public.profiles;

CREATE POLICY "profiles self read"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles admin read"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

REVOKE SELECT ON public.profiles FROM anon;
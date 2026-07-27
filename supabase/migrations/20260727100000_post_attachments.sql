
-- ============================================================
-- Post Attachments: Storage bucket + metadata table
-- ============================================================

-- 1. Storage bucket (public read, admin-only write)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-attachments',
  'post-attachments',
  true,
  52428800,          -- 50 MB per file
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "public read post-attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'post-attachments');

CREATE POLICY "admin upload post-attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "admin update post-attachments"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-attachments'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'post-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "admin delete post-attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );

-- 2. Metadata table
CREATE TABLE public.post_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX post_attachments_post_id_idx ON public.post_attachments (post_id);

GRANT SELECT ON public.post_attachments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.post_attachments TO authenticated;
GRANT ALL ON public.post_attachments TO service_role;

ALTER TABLE public.post_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read attachments"
  ON public.post_attachments FOR SELECT USING (true);

CREATE POLICY "admin insert attachments"
  ON public.post_attachments FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin update attachments"
  ON public.post_attachments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin delete attachments"
  ON public.post_attachments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

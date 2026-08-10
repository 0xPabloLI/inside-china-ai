-- ============================================================
-- Add tiktok_url column to posts table
--
-- Stores the full TikTok video URL (e.g. https://www.tiktok.com/@chinaainews/video/123)
-- When present, the article page renders a TikTok embed instead of a raw <video> tag.
-- ============================================================

ALTER TABLE public.posts ADD COLUMN tiktok_url TEXT;

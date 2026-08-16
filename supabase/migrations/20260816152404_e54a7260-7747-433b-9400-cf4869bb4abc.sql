CREATE TABLE public.tracked_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  database TEXT NOT NULL DEFAULT 'us',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (keyword, database)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tracked_keywords TO authenticated;
GRANT ALL ON public.tracked_keywords TO service_role;
ALTER TABLE public.tracked_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage tracked keywords"
ON public.tracked_keywords FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.keyword_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES public.tracked_keywords(id) ON DELETE CASCADE,
  captured_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
  position INTEGER,
  search_volume INTEGER,
  difficulty NUMERIC,
  traffic_share NUMERIC,
  ranking_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (keyword_id, captured_on)
);

CREATE INDEX keyword_snapshots_keyword_date_idx
  ON public.keyword_snapshots (keyword_id, captured_on DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.keyword_snapshots TO authenticated;
GRANT ALL ON public.keyword_snapshots TO service_role;
ALTER TABLE public.keyword_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage keyword snapshots"
ON public.keyword_snapshots FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.tracked_keywords (keyword, database) VALUES
  ('china ai news', 'us'),
  ('chinese ai models', 'us'),
  ('china ai regulation', 'us'),
  ('deepseek vs qwen', 'us'),
  ('chinese ai companies', 'us');
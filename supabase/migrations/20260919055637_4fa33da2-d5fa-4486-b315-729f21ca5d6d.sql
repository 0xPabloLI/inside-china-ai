CREATE TABLE public.ask_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash TEXT NOT NULL,
  question TEXT NOT NULL,
  source_slugs TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ask_queries_ip_hash_created_at_idx ON public.ask_queries (ip_hash, created_at DESC);
CREATE INDEX ask_queries_created_at_idx ON public.ask_queries (created_at DESC);

GRANT SELECT ON public.ask_queries TO authenticated;
GRANT ALL ON public.ask_queries TO service_role;

ALTER TABLE public.ask_queries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ask queries"
  ON public.ask_queries
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
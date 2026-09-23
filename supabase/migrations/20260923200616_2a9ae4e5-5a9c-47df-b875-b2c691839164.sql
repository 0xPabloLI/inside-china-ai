CREATE TABLE public.ask_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  question_key TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  seo_title TEXT NOT NULL,
  seo_description TEXT NOT NULL,
  source_slugs TEXT[] NOT NULL DEFAULT '{}',
  ask_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seo_rewritten_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ask_answers_status_idx ON public.ask_answers (status, ask_count DESC);

GRANT SELECT ON public.ask_answers TO anon, authenticated;
GRANT UPDATE ON public.ask_answers TO authenticated;
GRANT ALL ON public.ask_answers TO service_role;
ALTER TABLE public.ask_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read published answers" ON public.ask_answers
  FOR SELECT TO anon, authenticated USING (status = 'published');
CREATE POLICY "Admins can read all answers" ON public.ask_answers
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update answers" ON public.ask_answers
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ask_job_state (
  name TEXT PRIMARY KEY,
  locked_until TIMESTAMPTZ,
  paused_reason TEXT,
  last_run_at TIMESTAMPTZ,
  last_result JSONB
);
GRANT SELECT ON public.ask_job_state TO authenticated;
GRANT ALL ON public.ask_job_state TO service_role;
ALTER TABLE public.ask_job_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read job state" ON public.ask_job_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.ask_job_state (name) VALUES ('ask-answers');

-- Atomic single-flight lease; returns true when acquired.
CREATE OR REPLACE FUNCTION public.acquire_ask_job_lease(_name TEXT, _seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok BOOLEAN;
BEGIN
  UPDATE public.ask_job_state SET locked_until = now() + make_interval(secs => _seconds)
  WHERE name = _name AND (locked_until IS NULL OR locked_until < now())
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END $$;
REVOKE EXECUTE ON FUNCTION public.acquire_ask_job_lease(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_ask_job_lease(TEXT, INTEGER) TO service_role;
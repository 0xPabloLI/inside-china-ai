CREATE TYPE public.newsletter_status AS ENUM ('draft','scheduled','sending','sent','failed');

CREATE TABLE public.newsletters (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subject text NOT NULL,
  title text,
  excerpt text,
  content text NOT NULL DEFAULT '',
  post_url text,
  status public.newsletter_status NOT NULL DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count integer NOT NULL DEFAULT 0,
  suppressed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.newsletters TO authenticated;
GRANT ALL ON public.newsletters TO service_role;
ALTER TABLE public.newsletters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read newsletters" ON public.newsletters FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins insert newsletters" ON public.newsletters FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins update newsletters" ON public.newsletters FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins delete newsletters" ON public.newsletters FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER newsletters_set_updated_at BEFORE UPDATE ON public.newsletters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.newsletter_sends (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  newsletter_id uuid NOT NULL REFERENCES public.newsletters(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  status text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX newsletter_sends_newsletter_id_idx ON public.newsletter_sends (newsletter_id);
CREATE INDEX newsletter_sends_recipient_idx ON public.newsletter_sends (recipient_email);

GRANT SELECT ON public.newsletter_sends TO authenticated;
GRANT ALL ON public.newsletter_sends TO service_role;
ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read newsletter sends" ON public.newsletter_sends FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.subscribers ADD COLUMN IF NOT EXISTS unsubscribed_at timestamptz;
CREATE TABLE public.ranking_alert_settings (
  id boolean NOT NULL DEFAULT true PRIMARY KEY,
  drop_threshold integer NOT NULL DEFAULT 3,
  alert_on_lost_ranking boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ranking_alert_settings_singleton CHECK (id),
  CONSTRAINT ranking_alert_settings_threshold_range CHECK (drop_threshold BETWEEN 1 AND 50)
);

GRANT SELECT, INSERT, UPDATE ON public.ranking_alert_settings TO authenticated;
GRANT ALL ON public.ranking_alert_settings TO service_role;
ALTER TABLE public.ranking_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ranking alert settings" ON public.ranking_alert_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ranking_alert_settings_set_updated_at BEFORE UPDATE ON public.ranking_alert_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.ranking_alert_settings (id) VALUES (true);

CREATE TABLE public.ranking_alert_recipients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ranking_alert_recipients TO authenticated;
GRANT ALL ON public.ranking_alert_recipients TO service_role;
ALTER TABLE public.ranking_alert_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage ranking alert recipients" ON public.ranking_alert_recipients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.islamic_tenure_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  months integer NOT NULL UNIQUE,
  profit_pct numeric(6,2) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.islamic_tenure_options TO authenticated;
GRANT ALL ON public.islamic_tenure_options TO service_role;

ALTER TABLE public.islamic_tenure_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Any authenticated can read tenure options"
  ON public.islamic_tenure_options FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins manage tenure options"
  ON public.islamic_tenure_options FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_islamic_tenure_options_updated
  BEFORE UPDATE ON public.islamic_tenure_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.islamic_tenure_options (months, profit_pct, sort_order) VALUES
  (3, 8, 1),
  (6, 16, 2),
  (12, 25, 3)
ON CONFLICT (months) DO NOTHING;
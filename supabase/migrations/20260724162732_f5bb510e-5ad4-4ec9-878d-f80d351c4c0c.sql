
CREATE TABLE IF NOT EXISTS public.percentage_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_pct numeric(5,2) NOT NULL DEFAULT 5,
  media_person_pct numeric(5,2) NOT NULL DEFAULT 10,
  manager_pct numeric(5,2) NOT NULL DEFAULT 10,
  admin_pct numeric(5,2) NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT ON public.percentage_defaults TO authenticated;
GRANT ALL ON public.percentage_defaults TO service_role;

ALTER TABLE public.percentage_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read percentage defaults"
  ON public.percentage_defaults FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert percentage defaults"
  ON public.percentage_defaults FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update percentage defaults"
  ON public.percentage_defaults FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete percentage defaults"
  ON public.percentage_defaults FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER percentage_defaults_updated_at
  BEFORE UPDATE ON public.percentage_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed one row
INSERT INTO public.percentage_defaults (fund_pct, media_person_pct, manager_pct, admin_pct)
SELECT 5, 10, 10, 5
WHERE NOT EXISTS (SELECT 1 FROM public.percentage_defaults);

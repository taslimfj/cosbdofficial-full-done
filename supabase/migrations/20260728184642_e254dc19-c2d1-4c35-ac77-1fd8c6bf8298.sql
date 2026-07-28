CREATE TABLE public.rule_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rule_sections TO authenticated;
GRANT ALL ON public.rule_sections TO service_role;
ALTER TABLE public.rule_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rule sections" ON public.rule_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert rule sections" ON public.rule_sections FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update rule sections" ON public.rule_sections FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete rule sections" ON public.rule_sections FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_rule_sections_updated_at BEFORE UPDATE ON public.rule_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.rule_sections(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  audiences text[] NOT NULL DEFAULT ARRAY['all']::text[],
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rules TO authenticated;
GRANT ALL ON public.rules TO service_role;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view rules" ON public.rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert rules" ON public.rules FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update rules" ON public.rules FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete rules" ON public.rules FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_rules_updated_at BEFORE UPDATE ON public.rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_rules_section ON public.rules(section_id);

INSERT INTO public.rule_sections (name, sort_order) VALUES ('Company Rules', 1), ('Islamic Loan Rules', 2);
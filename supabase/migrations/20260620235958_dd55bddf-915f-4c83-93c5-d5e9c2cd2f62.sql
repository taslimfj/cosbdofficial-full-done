
CREATE TABLE public.assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  purchase_price NUMERIC NOT NULL CHECK (purchase_price >= 0),
  scrap_value NUMERIC,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','deleted')),
  purchase_txn_id UUID REFERENCES public.fund_transactions(id) ON DELETE SET NULL,
  scrap_txn_id UUID REFERENCES public.fund_transactions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can view assets"
  ON public.assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert assets"
  ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update assets"
  ON public.assets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete assets"
  ON public.assets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

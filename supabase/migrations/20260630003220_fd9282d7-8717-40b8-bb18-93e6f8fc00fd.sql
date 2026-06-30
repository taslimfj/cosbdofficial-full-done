
-- Add budget tracking to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS budget_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_funds_approved numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_returned numeric NOT NULL DEFAULT 0;

-- Project fund requests (manager → admin)
CREATE TABLE IF NOT EXISTS public.project_fund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_fund_requests TO authenticated;
GRANT ALL ON public.project_fund_requests TO service_role;

ALTER TABLE public.project_fund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fund requests"
  ON public.project_fund_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create fund requests"
  ON public.project_fund_requests FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update fund requests"
  ON public.project_fund_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete fund requests"
  ON public.project_fund_requests FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER set_project_fund_requests_updated_at
  BEFORE UPDATE ON public.project_fund_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

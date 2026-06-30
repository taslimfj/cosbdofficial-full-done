
-- 1) Add product_name + payment_methods to islamic_loans
ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS payment_methods jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2) Recreate islamic_loans_public view with the new columns
DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker = on) AS
SELECT
  id, code, purchase_price, sell_price, tenure_months, profit_percentage,
  media_person_id, media_person_profit_pct, fund_profit_pct, admin_profit_pct,
  status, remaining_amount, monthly_installment, comments, discount_pct,
  customer_user_id, created_at,
  product_name,
  payment_methods,
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN borrower_name END AS borrower_name,
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN borrower_phone END AS borrower_phone,
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN relative_phone END AS relative_phone
FROM public.islamic_loans;

GRANT SELECT ON public.islamic_loans_public TO authenticated;

-- 3) Admin-managed default payment methods (auto-populated into new loans)
CREATE TABLE IF NOT EXISTS public.payment_method_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_method_defaults TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_method_defaults TO authenticated;
GRANT ALL ON public.payment_method_defaults TO service_role;

ALTER TABLE public.payment_method_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All signed-in users read payment defaults"
ON public.payment_method_defaults
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins manage payment defaults"
ON public.payment_method_defaults
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_method_defaults_updated_at
BEFORE UPDATE ON public.payment_method_defaults
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

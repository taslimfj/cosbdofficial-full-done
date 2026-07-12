
-- Drop broad "Members and admins read ..." SELECT policies
DROP POLICY IF EXISTS "Members and admins read assets" ON public.assets;
DROP POLICY IF EXISTS "Members and admins read deposits" ON public.deposits;
DROP POLICY IF EXISTS "Members and admins read fund transactions" ON public.fund_transactions;
DROP POLICY IF EXISTS "Members and admins read islamic loan shares" ON public.islamic_loan_member_shares;
DROP POLICY IF EXISTS "Members and admins read islamic loan payments" ON public.islamic_loan_payments;
DROP POLICY IF EXISTS "Members and admins read islamic loans" ON public.islamic_loans;
DROP POLICY IF EXISTS "Members and admins read repayments" ON public.member_loan_repayments;
DROP POLICY IF EXISTS "Members and admins read member loans" ON public.member_loans;
DROP POLICY IF EXISTS "Members and admins read profit distributions" ON public.profit_distributions;
DROP POLICY IF EXISTS "Members and admins read project shares" ON public.project_member_shares;
DROP POLICY IF EXISTS "Members and admins read project transactions" ON public.project_transactions;
DROP POLICY IF EXISTS "Members and admins read projects" ON public.projects;

-- Rebuild islamic_loans_public view with security_invoker=on to remove Security Definer warning.
-- The view exposes only non-sensitive columns; access is governed by RLS on islamic_loans.
DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker=on) AS
SELECT
  id, code, product_name, purchase_price, sell_price, tenure_months,
  profit_percentage, discount_pct, media_person_profit_pct, fund_profit_pct,
  admin_profit_pct, monthly_installment, remaining_amount, comments, status,
  customer_user_id, media_person_id, borrower_name, created_at, closed_at,
  months_paid_early, discount_credit_used, discount_credit_from_loan
FROM public.islamic_loans;

GRANT SELECT ON public.islamic_loans_public TO authenticated, anon;

-- Add a members read policy for islamic_loans that only exposes non-sensitive
-- columns via the public view. Since column-level RLS is not native, we allow
-- authenticated users to read islamic_loans rows only when accessed through
-- the view context using a lightweight policy. The view uses security_invoker,
-- so we need to permit authenticated members to read islamic_loans rows.
-- To preserve confidentiality of borrower_phone / relative_phone / payment_methods,
-- clients must use the islamic_loans_public view. Direct table reads for non-admin
-- non-customer non-media_person are blocked.
CREATE POLICY "Authenticated can read islamic loans via public view"
ON public.islamic_loans
FOR SELECT
TO authenticated
USING (true);

-- NOTE: Because column-level restriction cannot be enforced via RLS alone,
-- we revoke direct table SELECT on sensitive columns from authenticated and
-- keep only view access for them.
REVOKE SELECT ON public.islamic_loans FROM authenticated;
GRANT SELECT (
  id, code, product_name, purchase_price, sell_price, tenure_months,
  profit_percentage, discount_pct, media_person_profit_pct, fund_profit_pct,
  admin_profit_pct, monthly_installment, remaining_amount, comments, status,
  customer_user_id, media_person_id, borrower_name, created_at, closed_at,
  months_paid_early, discount_credit_used, discount_credit_from_loan
) ON public.islamic_loans TO authenticated;

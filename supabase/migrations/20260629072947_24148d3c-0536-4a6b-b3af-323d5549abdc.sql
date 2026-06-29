
-- 1) PROFILES: restrict full row to self/admin; expose safe directory view
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON public.profiles;
CREATE POLICY "Profiles self or admin select"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.member_directory AS
SELECT id, full_name, avatar_url, deleted_name, is_deleted, total_deposited, created_at, updated_at
FROM public.profiles;
GRANT SELECT ON public.member_directory TO authenticated;

-- 2) ISLAMIC LOANS: restrict full row (with borrower PII) to admin; safe view for members
DROP POLICY IF EXISTS "All can read islamic loans" ON public.islamic_loans;
CREATE POLICY "Admins read islamic loans"
ON public.islamic_loans FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE VIEW public.islamic_loans_public AS
SELECT id, code, purchase_price, sell_price, tenure_months, media_person_id,
       media_person_profit_pct, fund_profit_pct, status, remaining_amount,
       monthly_installment, comments, created_at, discount_pct, profit_percentage
FROM public.islamic_loans;
GRANT SELECT ON public.islamic_loans_public TO authenticated;

-- 3) PROFIT DISTRIBUTIONS: members see own, admin sees all
DROP POLICY IF EXISTS "All can read distributions" ON public.profit_distributions;
CREATE POLICY "Distributions self or admin"
ON public.profit_distributions FOR SELECT TO authenticated
USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4) USER_ROLES: scope policies to authenticated only
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can read own role"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 5) SECURITY DEFINER hardening: revoke EXECUTE from PUBLIC/anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
GRANT  EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;

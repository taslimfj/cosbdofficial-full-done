
DROP POLICY IF EXISTS "Authenticated can view all profiles" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP VIEW IF EXISTS public.member_directory;
CREATE VIEW public.member_directory
WITH (security_invoker=off) AS
  SELECT id, full_name, avatar_url, deleted_name, is_deleted, is_customer,
         phone, total_deposited, created_at, updated_at
  FROM public.profiles
  WHERE is_deleted = false AND is_customer = false;
GRANT SELECT ON public.member_directory TO authenticated;
REVOKE SELECT ON public.member_directory FROM anon;

DROP POLICY IF EXISTS "Authenticated read all islamic loans" ON public.islamic_loans;
CREATE POLICY "Loan participants read islamic loans" ON public.islamic_loans
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR customer_user_id = auth.uid()
    OR media_person_id = auth.uid()
    OR secondary_media_person_id = auth.uid()
  );

DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker=off) AS
  SELECT id, code, purchase_price, sell_price, tenure_months, profit_percentage,
         media_person_id, media_person_profit_pct, fund_profit_pct, admin_profit_pct,
         status, remaining_amount, monthly_installment, comments, discount_pct,
         customer_user_id, created_at, product_name, payment_methods,
         borrower_name, borrower_phone, relative_phone
  FROM public.islamic_loans;
GRANT SELECT ON public.islamic_loans_public TO authenticated;
REVOKE SELECT ON public.islamic_loans_public FROM anon;

DROP POLICY IF EXISTS "Authenticated can view all deposits" ON public.deposits;
CREATE POLICY "Owner or admin read deposits" ON public.deposits
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view all member loans" ON public.member_loans;
CREATE POLICY "Owner or admin read member loans" ON public.member_loans
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view all member loan repayments" ON public.member_loan_repayments;
CREATE POLICY "Borrower or admin read repayments" ON public.member_loan_repayments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.member_loans ml
      WHERE ml.id = member_loan_repayments.loan_id
        AND ml.member_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated can view all distributions" ON public.profit_distributions;
CREATE POLICY "Owner or admin read distributions" ON public.profit_distributions
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members read project shares" ON public.project_member_shares;
CREATE POLICY "Owner or admin read project shares" ON public.project_member_shares
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated read loan shares" ON public.islamic_loan_member_shares;
CREATE POLICY "Owner or admin read loan shares" ON public.islamic_loan_member_shares
  FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Members and admins read loan payments" ON public.islamic_loan_payments;
CREATE POLICY "Loan participants read loan payments" ON public.islamic_loan_payments
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.islamic_loans l
      WHERE l.id = islamic_loan_payments.loan_id
        AND (
          l.customer_user_id = auth.uid()
          OR l.media_person_id = auth.uid()
          OR l.secondary_media_person_id = auth.uid()
        )
    )
  );

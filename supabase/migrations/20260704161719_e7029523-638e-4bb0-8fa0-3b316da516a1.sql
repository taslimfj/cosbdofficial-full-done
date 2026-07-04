
-- 1) View: reveal borrower fields to any authenticated user (admin/customer/member)
CREATE OR REPLACE VIEW public.islamic_loans_public
WITH (security_invoker=on) AS
SELECT id, code, purchase_price, sell_price, tenure_months, profit_percentage,
       media_person_id, media_person_profit_pct, fund_profit_pct, admin_profit_pct,
       status, remaining_amount, monthly_installment, comments, discount_pct,
       customer_user_id, created_at, product_name, payment_methods,
       borrower_name, borrower_phone, relative_phone
FROM public.islamic_loans;

-- 2) islamic_loans: allow authenticated members to read all, insert new, and media person to update
DROP POLICY IF EXISTS "Admins read islamic loans" ON public.islamic_loans;
DROP POLICY IF EXISTS "Customer reads own loan" ON public.islamic_loans;
CREATE POLICY "Authenticated read all islamic loans"
  ON public.islamic_loans FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can create islamic loans"
  ON public.islamic_loans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Media person can update own loan"
  ON public.islamic_loans FOR UPDATE
  TO authenticated
  USING (media_person_id = auth.uid())
  WITH CHECK (media_person_id = auth.uid());

-- 3) islamic_loan_member_shares: readable by all authenticated
DROP POLICY IF EXISTS "Admins read loan shares" ON public.islamic_loan_member_shares;
CREATE POLICY "Authenticated read loan shares"
  ON public.islamic_loan_member_shares FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated to insert snapshot rows (needed when member creates a loan)
CREATE POLICY "Authenticated insert loan shares"
  ON public.islamic_loan_member_shares FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4) islamic_loan_payments: media person can insert deposits on their loan
CREATE POLICY "Media person can record loan payments"
  ON public.islamic_loan_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.islamic_loans l
      WHERE l.id = islamic_loan_payments.loan_id
        AND l.media_person_id = auth.uid()
    )
  );

-- 1) Scope islamic_loan_member_shares reads to admins only (was: any member/admin)
DROP POLICY IF EXISTS "Members read loan shares" ON public.islamic_loan_member_shares;
CREATE POLICY "Admins read loan shares"
  ON public.islamic_loan_member_shares
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Remove borrower self-UPDATE on member_loans (allowed column escalation).
-- Repayments go through member_loan_repayments (INSERT flow); admins still manage loan rows.
DROP POLICY IF EXISTS "Borrowers can update own loan repaid amount" ON public.member_loans;
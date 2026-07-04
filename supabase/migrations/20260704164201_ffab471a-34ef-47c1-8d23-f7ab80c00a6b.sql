DROP POLICY IF EXISTS "Members see own loans" ON public.member_loans;
CREATE POLICY "Authenticated can view all member loans"
  ON public.member_loans FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Members see own repayments" ON public.member_loan_repayments;
CREATE POLICY "Authenticated can view all member loan repayments"
  ON public.member_loan_repayments FOR SELECT
  TO authenticated
  USING (true);
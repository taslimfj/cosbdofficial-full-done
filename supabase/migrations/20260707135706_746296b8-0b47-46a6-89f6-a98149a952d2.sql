
DROP POLICY IF EXISTS "Authenticated insert loan shares" ON public.islamic_loan_member_shares;
DROP POLICY IF EXISTS "Authenticated can create islamic loans" ON public.islamic_loans;
DROP POLICY IF EXISTS "Borrowers can record own repayments" ON public.member_loan_repayments;

CREATE POLICY "Borrowers can record own pending repayments"
ON public.member_loan_repayments
FOR INSERT
TO authenticated
WITH CHECK (
  status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.member_loans ml
    WHERE ml.id = member_loan_repayments.loan_id
      AND ml.member_id = auth.uid()
  )
);

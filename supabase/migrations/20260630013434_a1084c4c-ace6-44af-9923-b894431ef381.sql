
ALTER TABLE public.member_loans ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE POLICY "Borrowers can record own repayments"
ON public.member_loan_repayments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.member_loans ml
    WHERE ml.id = member_loan_repayments.loan_id
      AND ml.member_id = auth.uid()
  )
);

CREATE POLICY "Borrowers can update own loan repaid amount"
ON public.member_loans
FOR UPDATE
TO authenticated
USING (member_id = auth.uid())
WITH CHECK (member_id = auth.uid());

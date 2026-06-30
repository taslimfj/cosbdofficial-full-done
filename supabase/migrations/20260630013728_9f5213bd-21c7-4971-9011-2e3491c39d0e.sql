
ALTER TABLE public.member_loan_repayments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

ALTER TABLE public.member_loan_repayments
  DROP CONSTRAINT IF EXISTS member_loan_repayments_status_check;
ALTER TABLE public.member_loan_repayments
  ADD CONSTRAINT member_loan_repayments_status_check
  CHECK (status IN ('pending','approved','rejected'));

-- Existing rows are historic — treat them as approved
UPDATE public.member_loan_repayments SET status = 'approved' WHERE status = 'pending' AND created_at < now();


ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS months_paid_early INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_credit_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_credit_from_loan UUID REFERENCES public.islamic_loans(id);

CREATE INDEX IF NOT EXISTS idx_islamic_loans_borrower_phone ON public.islamic_loans(borrower_phone);
CREATE INDEX IF NOT EXISTS idx_islamic_loans_closed_at ON public.islamic_loans(closed_at);

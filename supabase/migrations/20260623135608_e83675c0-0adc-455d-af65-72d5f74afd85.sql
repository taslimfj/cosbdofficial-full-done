ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS borrower_name text,
  ADD COLUMN IF NOT EXISTS borrower_phone text,
  ADD COLUMN IF NOT EXISTS relative_phone text,
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2) DEFAULT 0;
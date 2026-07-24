ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS relative_name text,
  ADD COLUMN IF NOT EXISTS relationship text;
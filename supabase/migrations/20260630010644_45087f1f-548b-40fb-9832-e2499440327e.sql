
ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS admin_profit_pct numeric NOT NULL DEFAULT 5,
  ALTER COLUMN fund_profit_pct SET DEFAULT 5,
  ALTER COLUMN media_person_profit_pct SET DEFAULT 10;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS admin_profit_pct numeric NOT NULL DEFAULT 5,
  ALTER COLUMN fund_profit_pct SET DEFAULT 5,
  ALTER COLUMN manager_profit_pct SET DEFAULT 10;


ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS excluded_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusion_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS excluded_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS exclusion_reasons jsonb NOT NULL DEFAULT '{}'::jsonb;

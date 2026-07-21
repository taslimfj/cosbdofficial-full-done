
ALTER TABLE public.islamic_loans ADD COLUMN IF NOT EXISTS issue_date DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS issue_date DATE;

UPDATE public.islamic_loans SET issue_date = (created_at AT TIME ZONE 'Asia/Dhaka')::date WHERE issue_date IS NULL;
UPDATE public.projects SET issue_date = (created_at AT TIME ZONE 'Asia/Dhaka')::date WHERE issue_date IS NULL;

ALTER TABLE public.islamic_loans ALTER COLUMN issue_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date);
ALTER TABLE public.projects ALTER COLUMN issue_date SET DEFAULT ((now() AT TIME ZONE 'Asia/Dhaka')::date);

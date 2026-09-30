-- Add loan_cost column to islamic_loans table
ALTER TABLE public.islamic_loans ADD COLUMN IF NOT EXISTS loan_cost numeric DEFAULT 0;

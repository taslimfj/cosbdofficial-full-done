
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS secondary_manager_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS closed_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS comments text;

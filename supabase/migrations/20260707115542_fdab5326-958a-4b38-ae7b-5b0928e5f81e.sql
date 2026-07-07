ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS secondary_media_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_islamic_loans_secondary_media_person
  ON public.islamic_loans(secondary_media_person_id);
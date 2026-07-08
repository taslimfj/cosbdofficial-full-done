ALTER TABLE public.payment_method_defaults
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'both';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_method_defaults_audience_check'
  ) THEN
    ALTER TABLE public.payment_method_defaults
      ADD CONSTRAINT payment_method_defaults_audience_check
      CHECK (audience IN ('member','customer','both'));
  END IF;
END $$;
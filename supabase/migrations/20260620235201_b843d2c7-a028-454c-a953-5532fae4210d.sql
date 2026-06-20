CREATE TABLE public.phone_book (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.phone_book TO authenticated;
GRANT ALL ON public.phone_book TO service_role;

ALTER TABLE public.phone_book ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view phone book"
  ON public.phone_book FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert phone book entries"
  ON public.phone_book FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update phone book entries"
  ON public.phone_book FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete phone book entries"
  ON public.phone_book FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_phone_book_updated_at
  BEFORE UPDATE ON public.phone_book
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
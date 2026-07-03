
CREATE TABLE public.tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  youtube_url TEXT NOT NULL,
  audiences TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutorials TO authenticated;
GRANT ALL ON public.tutorials TO service_role;

ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins manage tutorials" ON public.tutorials
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Everyone authenticated can view tutorials assigned to 'all' audience
CREATE POLICY "Public tutorials viewable" ON public.tutorials
  FOR SELECT TO authenticated
  USING ('all' = ANY(audiences));

-- Members can view tutorials assigned to 'member'
CREATE POLICY "Members view member tutorials" ON public.tutorials
  FOR SELECT TO authenticated
  USING ('member' = ANY(audiences) AND public.has_role(auth.uid(), 'member'));

-- Customers can view tutorials assigned to 'customer'
CREATE POLICY "Customers view customer tutorials" ON public.tutorials
  FOR SELECT TO authenticated
  USING (
    'customer' = ANY(audiences) AND EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_customer = true
    )
  );

CREATE TRIGGER update_tutorials_updated_at
BEFORE UPDATE ON public.tutorials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

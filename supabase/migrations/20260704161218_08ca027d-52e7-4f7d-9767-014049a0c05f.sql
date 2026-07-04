DROP POLICY IF EXISTS "Profiles self or admin select" ON public.profiles;
CREATE POLICY "Authenticated can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
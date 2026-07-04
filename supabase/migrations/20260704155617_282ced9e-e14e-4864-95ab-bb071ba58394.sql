
DROP POLICY IF EXISTS "Members see own deposits" ON public.deposits;
CREATE POLICY "Authenticated can view all deposits"
  ON public.deposits FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Distributions self or admin" ON public.profit_distributions;
CREATE POLICY "Authenticated can view all distributions"
  ON public.profit_distributions FOR SELECT
  TO authenticated
  USING (true);

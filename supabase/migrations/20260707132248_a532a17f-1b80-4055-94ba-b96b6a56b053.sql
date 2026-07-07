
-- 1. Restrict SELECT policies on sensitive financial tables

DROP POLICY IF EXISTS "All authenticated can view assets" ON public.assets;
CREATE POLICY "Admins can view assets"
  ON public.assets FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "All can read fund transactions" ON public.fund_transactions;
CREATE POLICY "Admins can view fund transactions"
  ON public.fund_transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "All can read project transactions" ON public.project_transactions;
CREATE POLICY "Admins and involved can view project transactions"
  ON public.project_transactions FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_transactions.project_id
        AND (p.manager_id = auth.uid() OR p.secondary_manager_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.project_member_shares pms
      WHERE pms.project_id = project_transactions.project_id
        AND pms.member_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "All can read projects" ON public.projects;
CREATE POLICY "Admins and involved can view projects"
  ON public.projects FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR manager_id = auth.uid()
    OR secondary_manager_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_member_shares pms
      WHERE pms.project_id = projects.id AND pms.member_id = auth.uid()
    )
  );

-- 2. Convert SECURITY DEFINER views to SECURITY INVOKER
ALTER VIEW public.member_directory SET (security_invoker = on);
ALTER VIEW public.islamic_loans_public SET (security_invoker = on);

-- Views now run with the caller's privileges. Add SELECT policies on the base
-- tables so authenticated users can still see the directory / public-loan info.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='Authenticated can view profile directory'
  ) THEN
    CREATE POLICY "Authenticated can view profile directory"
      ON public.profiles FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='islamic_loans'
      AND policyname='Authenticated can view islamic loans (public)'
  ) THEN
    CREATE POLICY "Authenticated can view islamic loans (public)"
      ON public.islamic_loans FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 3. Lock down SECURITY DEFINER functions — trigger functions and
-- notify_admins should not be callable directly via the API.
REVOKE EXECUTE ON FUNCTION public.notify_admins(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_new_pending_deposit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fire_push_on_notification() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_new_pending_member_loan() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_new_pending_repayment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_new_customer_payment_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_new_project_transaction() FROM PUBLIC, anon, authenticated;

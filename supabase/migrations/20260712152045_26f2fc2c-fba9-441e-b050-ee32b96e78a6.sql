
-- 1) Broad member/admin SELECT policies (additive, non-destructive)
CREATE POLICY "Members and admins read fund transactions" ON public.fund_transactions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read deposits" ON public.deposits
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read profit distributions" ON public.profit_distributions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read projects" ON public.projects
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read project transactions" ON public.project_transactions
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read project shares" ON public.project_member_shares
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read islamic loans" ON public.islamic_loans
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read islamic loan payments" ON public.islamic_loan_payments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read islamic loan shares" ON public.islamic_loan_member_shares
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read member loans" ON public.member_loans
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read repayments" ON public.member_loan_repayments
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

CREATE POLICY "Members and admins read assets" ON public.assets
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'member'));

-- 2) Member specific INSERT abilities

-- Member can create new islamic loans (approval / edits still admin only via existing policies)
CREATE POLICY "Members can create islamic loans" ON public.islamic_loans
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'member') OR has_role(auth.uid(),'admin'));

-- Member as media person of a loan can submit customer payment requests for that loan
CREATE POLICY "Media person submits payment requests" ON public.customer_payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.islamic_loans l
      WHERE l.id = customer_payment_requests.loan_id
        AND (l.media_person_id = auth.uid() OR l.secondary_media_person_id = auth.uid())
    )
  );

CREATE POLICY "Media person reads own submitted payment requests" ON public.customer_payment_requests
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin')
    OR customer_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.islamic_loans l
      WHERE l.id = customer_payment_requests.loan_id
        AND (l.media_person_id = auth.uid() OR l.secondary_media_person_id = auth.uid())
    )
  );

-- Member can save new phone book entries (edit/delete stays admin only)
CREATE POLICY "Members can insert phone book entries" ON public.phone_book
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'member') OR has_role(auth.uid(),'admin'));

-- 3) Auto-assign 'member' role to any new non-customer profile
CREATE OR REPLACE FUNCTION public.tg_assign_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_customer IS DISTINCT FROM true THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'member')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_assign_member_role ON public.profiles;
CREATE TRIGGER trg_profiles_assign_member_role
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_assign_member_role();

-- 4) Backfill: give 'member' role to every existing non-customer profile that lacks it
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'member'::app_role
FROM public.profiles p
WHERE COALESCE(p.is_customer, false) = false
  AND COALESCE(p.is_deleted, false) = false
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = 'member'
  )
ON CONFLICT (user_id, role) DO NOTHING;

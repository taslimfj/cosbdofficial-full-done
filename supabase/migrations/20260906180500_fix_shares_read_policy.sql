-- Ensure all authenticated members and admins can read islamic_loan_member_shares and project_member_shares
DROP POLICY IF EXISTS "Owner or admin read loan shares" ON public.islamic_loan_member_shares;
DROP POLICY IF EXISTS "Members read loan shares" ON public.islamic_loan_member_shares;
DROP POLICY IF EXISTS "Members and admins read islamic loan shares" ON public.islamic_loan_member_shares;
DROP POLICY IF EXISTS "Authenticated read loan shares" ON public.islamic_loan_member_shares;

CREATE POLICY "Authenticated read loan shares" ON public.islamic_loan_member_shares
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Owner or admin read project shares" ON public.project_member_shares;
DROP POLICY IF EXISTS "Members read project shares" ON public.project_member_shares;

CREATE POLICY "Authenticated read project shares" ON public.project_member_shares
  FOR SELECT TO authenticated
  USING (true);

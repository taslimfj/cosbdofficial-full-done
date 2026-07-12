
CREATE POLICY "Members and admins read assets"
ON public.assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read deposits"
ON public.deposits FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read fund transactions"
ON public.fund_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read islamic loan shares"
ON public.islamic_loan_member_shares FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read islamic loan payments"
ON public.islamic_loan_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read repayments"
ON public.member_loan_repayments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read member loans"
ON public.member_loans FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read profit distributions"
ON public.profit_distributions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read project shares"
ON public.project_member_shares FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read project transactions"
ON public.project_transactions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Members and admins read projects"
ON public.projects FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can add project transactions" ON public.project_transactions;
CREATE POLICY "Managers can add project transactions" ON public.project_transactions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects p
  WHERE p.id = project_transactions.project_id
    AND (p.manager_id = auth.uid() OR p.secondary_manager_id = auth.uid())
));
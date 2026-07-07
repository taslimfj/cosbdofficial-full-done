-- Drop the restrictive self-only select policy and replace with a directory-aware one
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Admins & members can see all non-deleted, non-customer profiles (directory).
-- Everyone (including customers) can still see their own row.
CREATE POLICY "Directory visible to admins and members"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (
    is_deleted = false
    AND is_customer = false
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('admin'::app_role, 'member'::app_role)
    )
  )
);
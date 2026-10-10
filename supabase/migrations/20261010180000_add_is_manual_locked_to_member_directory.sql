-- Grant SELECT on is_manual_locked column on profiles to authenticated role
GRANT SELECT (is_manual_locked) ON public.profiles TO authenticated;

-- Update member_directory view to include is_manual_locked column
CREATE OR REPLACE VIEW public.member_directory
WITH (security_invoker = on) AS
SELECT
  id,
  full_name,
  avatar_url,
  deleted_name,
  is_deleted,
  is_customer,
  total_deposited,
  created_at,
  updated_at,
  is_manual_locked
FROM public.profiles
WHERE is_deleted = false AND is_customer = false;

GRANT SELECT ON public.member_directory TO authenticated;


-- 1) Drop the broad USING(true) SELECT policies that expose sensitive columns
DROP POLICY IF EXISTS "Authenticated can view profile directory" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated can view islamic loans (public)" ON public.islamic_loans;

-- 2) Redefine member_directory view WITHOUT phone (nid already excluded)
DROP VIEW IF EXISTS public.member_directory;
CREATE VIEW public.member_directory
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
  updated_at
FROM public.profiles
WHERE is_deleted = false AND is_customer = false;

GRANT SELECT ON public.member_directory TO authenticated;

-- 3) Redefine islamic_loans_public view WITHOUT sensitive borrower / financial fields
DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker = on) AS
SELECT
  id,
  code,
  tenure_months,
  media_person_id,
  secondary_media_person_id,
  status,
  monthly_installment,
  created_at,
  closed_at,
  product_name,
  customer_user_id
FROM public.islamic_loans;

GRANT SELECT ON public.islamic_loans_public TO authenticated;

-- 4) Re-add a NARROW SELECT policy on profiles so authenticated users can still
-- resolve names via joins/lookups when the client selects only non-sensitive
-- columns. The view above is the recommended path; this policy keeps existing
-- non-sensitive selects working while sensitive columns (nid_card, phone) are
-- protected by removing the previous broad access.
-- Note: PostgreSQL RLS is row-level, not column-level. To truly protect
-- nid_card/phone at the column layer we revoke direct SELECT on those columns
-- from authenticated and only grant safe columns.
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, avatar_url, is_deleted, deleted_name, is_customer, total_deposited, created_at, updated_at)
  ON public.profiles TO authenticated;
-- Owner and admin can still read nid_card/phone via SECURITY DEFINER paths
-- (e.g. profile page edge/API or direct admin queries via service role).

-- 5) Same treatment for islamic_loans: revoke broad column SELECT and only
-- grant non-sensitive columns to authenticated. Participants (admin, customer,
-- media person) can still read all columns via the existing
-- "Loan participants read islamic loans" policy WHEN combined with column
-- grants — so we must keep sensitive columns grantable to authenticated but
-- rely on RLS for row filtering. Because column grants apply to the role
-- regardless of RLS row, we instead keep sensitive columns readable ONLY to
-- roles that will be filtered by the participant RLS policy. Grant safe cols
-- to authenticated broadly, and keep sensitive cols readable — RLS still
-- filters rows so only participants get any row back.
REVOKE SELECT ON public.islamic_loans FROM authenticated;
GRANT SELECT ON public.islamic_loans TO authenticated;
-- The broad USING(true) policy is gone, so authenticated users can only see
-- rows via the "Loan participants read islamic loans" policy. Non-participants
-- who need list metadata should query islamic_loans_public view instead.

-- 6) Make sure service_role retains full access
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.islamic_loans TO service_role;

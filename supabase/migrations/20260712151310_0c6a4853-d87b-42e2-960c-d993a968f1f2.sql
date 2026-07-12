
-- Rebuild the public view as SECURITY DEFINER so it bypasses base RLS
-- and returns non-sensitive columns to any authenticated user, while
-- customers still only see their own loan.
DROP VIEW IF EXISTS public.islamic_loans_public;

CREATE VIEW public.islamic_loans_public
WITH (security_invoker=off) AS
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
FROM public.islamic_loans
WHERE
  -- Non-customer authenticated users (members + admins) see all rows
  NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_customer = true
  )
  -- Customers only see their own loan
  OR customer_user_id = auth.uid();

GRANT SELECT ON public.islamic_loans_public TO authenticated;

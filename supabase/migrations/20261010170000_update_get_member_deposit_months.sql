-- Update get_member_deposit_months() to return approved deposit months for all authenticated users
-- so overdue / missed installment status calculations ("1 মাস বকেয়া", "2 মাস বকেয়া", etc.)
-- are accurate and consistent across both Admin and Member views.

CREATE OR REPLACE FUNCTION public.get_member_deposit_months()
RETURNS TABLE(member_id uuid, month_year date, created_at timestamp with time zone, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.member_id, d.month_year, d.created_at, d.status
  FROM public.deposits d
  WHERE d.status = 'approved';
$function$;

GRANT EXECUTE ON FUNCTION public.get_member_deposit_months() TO authenticated;

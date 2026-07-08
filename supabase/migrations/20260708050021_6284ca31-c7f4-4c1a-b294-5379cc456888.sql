
CREATE OR REPLACE FUNCTION public.get_member_deposit_months()
RETURNS TABLE(member_id uuid, month_year date, created_at timestamptz, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.member_id, d.month_year, d.created_at, d.status
  FROM public.deposits d
  WHERE d.status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION public.get_member_deposit_months() TO authenticated;

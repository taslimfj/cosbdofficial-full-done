-- Fix RPC snapshot_islamic_loan_shares to calculate member balances safely using total_deposited from profiles/member_directory if deposits are restricted or unpopulated
CREATE OR REPLACE FUNCTION public.snapshot_islamic_loan_shares(_loan_id uuid, _excluded jsonb DEFAULT '{}'::jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _total numeric := 0;
  _count integer := 0;
  _ids uuid[];
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(_caller,'admin') OR public.has_role(_caller,'member')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.islamic_loans WHERE id = _loan_id) THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.islamic_loan_member_shares WHERE loan_id = _loan_id) THEN
    RETURN 0;
  END IF;

  CREATE TEMP TABLE _bal ON COMMIT DROP AS
  SELECT p.id,
         COALESCE(p.full_name, p.deleted_name, 'Unknown') AS name,
         GREATEST(
           0,
           COALESCE(p.total_deposited, 0),
           COALESCE((SELECT sum(d.amount) FROM public.deposits d WHERE d.member_id = p.id AND d.status = 'approved'), 0)
         + COALESCE((SELECT sum(pd.amount) FROM public.profit_distributions pd WHERE pd.member_id = p.id), 0)
         ) AS balance
  FROM public.profiles p
  WHERE p.is_deleted = false
    AND p.is_customer = false
    AND NOT (_excluded ? p.id::text);

  DELETE FROM _bal WHERE balance <= 0;
  SELECT COALESCE(sum(balance),0) INTO _total FROM _bal;
  IF _total <= 0 THEN RETURN 0; END IF;

  INSERT INTO public.islamic_loan_member_shares (loan_id, member_id, member_name, deposit_snapshot, share_percentage)
  SELECT _loan_id, b.id, b.name, b.balance, round((b.balance / _total) * 100, 2)
  FROM _bal b;
  GET DIAGNOSTICS _count = ROW_COUNT;

  SELECT array_agg(k::uuid) INTO _ids FROM jsonb_object_keys(_excluded) AS k;
  UPDATE public.islamic_loans
    SET excluded_member_ids = COALESCE(_ids, '{}'::uuid[]),
        exclusion_reasons = _excluded
    WHERE id = _loan_id;

  RETURN _count;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_islamic_loan_shares(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_islamic_loan_shares(uuid, jsonb) TO authenticated;

-- 1) Welfare deduction cycles table
CREATE TABLE public.welfare_deductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_end date NOT NULL UNIQUE,
  amount_per_member numeric(15,2) NOT NULL DEFAULT 100,
  member_count integer,
  total_amount numeric(15,2),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.welfare_deductions TO authenticated;
GRANT ALL ON public.welfare_deductions TO service_role;

ALTER TABLE public.welfare_deductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage welfare deductions"
ON public.welfare_deductions
FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER PUBLICATION supabase_realtime ADD TABLE public.welfare_deductions;

-- 2) Auto-create current cycle if the latest quarter cutoff has passed
CREATE OR REPLACE FUNCTION public.ensure_current_welfare_cycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  yr int := extract(year from today);
  candidates date[];
  c date;
  chosen date := NULL;
  new_id uuid;
BEGIN
  candidates := ARRAY[
    make_date(yr,3,30),
    make_date(yr,6,30),
    make_date(yr,9,30),
    make_date(yr,12,30)
  ];
  FOREACH c IN ARRAY candidates LOOP
    IF c <= today AND (chosen IS NULL OR c > chosen) THEN
      chosen := c;
    END IF;
  END LOOP;
  IF chosen IS NULL THEN
    chosen := make_date(yr-1,12,30);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.welfare_deductions WHERE period_end = chosen) THEN
    INSERT INTO public.welfare_deductions(period_end) VALUES (chosen) RETURNING id INTO new_id;
    PERFORM public.notify_admins(
      'Welfare Deduction Approval',
      'প্রত্যেক active member এর কাছ থেকে ৳100 করে withdraw করে Fund এ deposit করা হবে। Approve / Reject করুন।',
      '/', 'welfare-' || new_id::text
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_current_welfare_cycle() TO authenticated;

-- 3) Approve: withdraw from every active member and deposit total into Fund
CREATE OR REPLACE FUNCTION public.approve_welfare_deduction(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cycle public.welfare_deductions;
  per_amt numeric(15,2);
  cnt integer := 0;
  m record;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can approve';
  END IF;

  SELECT * INTO cycle FROM public.welfare_deductions WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cycle not found'; END IF;
  IF cycle.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;

  per_amt := cycle.amount_per_member;

  FOR m IN
    SELECT p.id FROM public.profiles p
    WHERE p.is_deleted = false AND p.is_customer = false
  LOOP
    INSERT INTO public.deposits(member_id, amount, status, payment_method, transaction_number, month_year)
    VALUES (m.id, -per_amt, 'approved', 'welfare_deduction',
            'WELFARE-' || to_char(cycle.period_end,'YYYY-MM-DD'), cycle.period_end);
    cnt := cnt + 1;
  END LOOP;

  IF cnt > 0 THEN
    INSERT INTO public.fund_transactions(type, amount, reason, created_by)
    VALUES ('in', cnt * per_amt,
            'Member Fund Deposit for Company Welfare — ' || to_char(cycle.period_end,'DD Mon YYYY'),
            auth.uid());
  END IF;

  UPDATE public.welfare_deductions
    SET status='approved', decided_at=now(), decided_by=auth.uid(),
        member_count=cnt, total_amount=cnt * per_amt
    WHERE id = _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_welfare_deduction(uuid) TO authenticated;

-- 4) Reject cycle
CREATE OR REPLACE FUNCTION public.reject_welfare_deduction(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reject';
  END IF;
  UPDATE public.welfare_deductions
    SET status='rejected', decided_at=now(), decided_by=auth.uid()
    WHERE id = _id AND status='pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_welfare_deduction(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.record_islamic_loan_payment(_loan_id uuid, _amount numeric, _payment_type text DEFAULT 'installment'::text, _payment_method text DEFAULT NULL::text, _transaction_id text DEFAULT NULL::text, _payment_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _payment_id uuid;
  _remaining numeric;
  _caller uuid;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(_caller, 'admin'::public.app_role) THEN
    -- Members may only auto-record the advance at loan creation time
    IF NOT (public.has_role(_caller, 'member'::public.app_role)
            AND COALESCE(_payment_type,'') = 'advance') THEN
      RAISE EXCEPTION 'Only admins can record Islamic loan payments';
    END IF;
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT remaining_amount INTO _remaining
  FROM public.islamic_loans
  WHERE id = _loan_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  INSERT INTO public.islamic_loan_payments(
    loan_id, amount, payment_type, payment_method,
    transaction_id, payment_date, approved_by, approved_at
  )
  VALUES (
    _loan_id, _amount, COALESCE(_payment_type,'installment'),
    _payment_method, _transaction_id, _payment_date, _caller, now()
  )
  RETURNING id INTO _payment_id;

  UPDATE public.islamic_loans
  SET remaining_amount = GREATEST(0, COALESCE(_remaining,0) - _amount),
      status = CASE
        WHEN GREATEST(0, COALESCE(_remaining,0) - _amount) <= 0 THEN 'closed'
        ELSE status
      END
  WHERE id = _loan_id;

  RETURN _payment_id;
END;
$function$;
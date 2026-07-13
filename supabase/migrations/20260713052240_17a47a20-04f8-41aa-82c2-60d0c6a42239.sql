CREATE OR REPLACE FUNCTION public.record_islamic_loan_payment(
  _loan_id uuid,
  _amount numeric,
  _payment_type text DEFAULT 'installment',
  _payment_method text DEFAULT NULL,
  _transaction_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _payment_id uuid;
  _remaining numeric;
  _caller uuid;
  _customer uuid;
  _media_person uuid;
  _secondary_media_person uuid;
  _is_admin boolean;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT
    remaining_amount,
    customer_user_id,
    media_person_id,
    secondary_media_person_id
  INTO
    _remaining,
    _customer,
    _media_person,
    _secondary_media_person
  FROM public.islamic_loans
  WHERE id = _loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  SELECT public.has_role(_caller, 'admin'::public.app_role)
  INTO _is_admin;

  IF NOT _is_admin
     AND _customer IS DISTINCT FROM _caller
     AND _media_person IS DISTINCT FROM _caller
     AND _secondary_media_person IS DISTINCT FROM _caller THEN
    RAISE EXCEPTION 'Not authorised for this loan';
  END IF;

  INSERT INTO public.islamic_loan_payments(
    loan_id,
    amount,
    payment_type,
    payment_method,
    transaction_id,
    approved_by,
    approved_at
  )
  VALUES (
    _loan_id,
    _amount,
    COALESCE(_payment_type, 'installment'),
    _payment_method,
    _transaction_id,
    _caller,
    now()
  )
  RETURNING id INTO _payment_id;

  UPDATE public.islamic_loans
  SET
    remaining_amount = GREATEST(0, COALESCE(_remaining, 0) - _amount),
    status = CASE
      WHEN GREATEST(0, COALESCE(_remaining, 0) - _amount) <= 0 THEN 'closed'
      ELSE status
    END
  WHERE id = _loan_id;

  RETURN _payment_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text, text, text) TO service_role;
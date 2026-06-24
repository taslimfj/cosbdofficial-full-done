
CREATE OR REPLACE FUNCTION public.record_islamic_loan_payment(
  _loan_id uuid,
  _amount numeric,
  _payment_type text DEFAULT 'installment'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payment_id uuid;
  _remaining numeric;
  _sell numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT remaining_amount, sell_price INTO _remaining, _sell
  FROM public.islamic_loans WHERE id = _loan_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  INSERT INTO public.islamic_loan_payments(loan_id, amount, payment_type)
  VALUES (_loan_id, _amount, COALESCE(_payment_type, 'installment'))
  RETURNING id INTO _payment_id;

  UPDATE public.islamic_loans
     SET remaining_amount = GREATEST(0, _remaining - _amount),
         status = CASE WHEN GREATEST(0, _remaining - _amount) <= 0 THEN 'closed' ELSE status END
   WHERE id = _loan_id;

  RETURN _payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;

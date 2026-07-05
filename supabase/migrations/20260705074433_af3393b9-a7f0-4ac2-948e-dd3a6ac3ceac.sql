
ALTER TABLE public.islamic_loan_payments
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

CREATE OR REPLACE FUNCTION private.record_islamic_loan_payment(_loan_id uuid, _amount numeric, _payment_type text DEFAULT 'installment', _payment_method text DEFAULT NULL, _transaction_id text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  _payment_id uuid;
  _remaining numeric;
  _sell numeric;
  _caller uuid;
  _customer uuid;
  _is_admin boolean;
BEGIN
  _caller := auth.uid();
  IF _caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;

  SELECT remaining_amount, sell_price, customer_user_id
    INTO _remaining, _sell, _customer
  FROM public.islamic_loans WHERE id = _loan_id FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Loan not found'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'admin')
    INTO _is_admin;

  IF NOT _is_admin AND _customer IS DISTINCT FROM _caller THEN
    RAISE EXCEPTION 'Not authorised for this loan';
  END IF;

  INSERT INTO public.islamic_loan_payments(loan_id, amount, payment_type, payment_method, transaction_id, approved_by, approved_at)
  VALUES (_loan_id, _amount, COALESCE(_payment_type, 'installment'), _payment_method, _transaction_id, _caller, now())
  RETURNING id INTO _payment_id;

  UPDATE public.islamic_loans
     SET remaining_amount = GREATEST(0, _remaining - _amount),
         status = CASE WHEN GREATEST(0, _remaining - _amount) <= 0 THEN 'closed' ELSE status END
   WHERE id = _loan_id;

  RETURN _payment_id;
END;
$$;

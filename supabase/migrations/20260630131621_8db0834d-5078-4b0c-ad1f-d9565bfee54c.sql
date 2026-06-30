
-- =====================================================
-- 1) has_role: switch to SECURITY INVOKER
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =====================================================
-- 2) Private schema for SECURITY DEFINER internals
-- =====================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

-- Move handle_new_user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, is_customer)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    COALESCE((NEW.raw_user_meta_data->>'is_customer')::boolean, false)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'member'));

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.handle_new_user();

-- Move mark_member_deleted_in_snapshots
DROP TRIGGER IF EXISTS trg_mark_member_deleted_snapshots ON public.profiles;
DROP FUNCTION IF EXISTS public.mark_member_deleted_in_snapshots();

CREATE OR REPLACE FUNCTION private.mark_member_deleted_in_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    UPDATE public.islamic_loan_member_shares
      SET is_member_deleted = true
      WHERE member_id = NEW.id;
    UPDATE public.project_member_shares
      SET is_member_deleted = true
      WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_member_deleted_snapshots
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.mark_member_deleted_in_snapshots();

-- Move record_islamic_loan_payment to private; expose a SECURITY INVOKER public wrapper
DROP FUNCTION IF EXISTS public.record_islamic_loan_payment(uuid, numeric, text);

CREATE OR REPLACE FUNCTION private.record_islamic_loan_payment(
  _loan_id uuid, _amount numeric, _payment_type text DEFAULT 'installment'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT remaining_amount, sell_price, customer_user_id
    INTO _remaining, _sell, _customer
  FROM public.islamic_loans WHERE id = _loan_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan not found';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'admin')
    INTO _is_admin;

  IF NOT _is_admin AND _customer IS DISTINCT FROM _caller THEN
    RAISE EXCEPTION 'Not authorised for this loan';
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

-- Public wrapper, SECURITY INVOKER, delegates to private definer
CREATE OR REPLACE FUNCTION public.record_islamic_loan_payment(
  _loan_id uuid, _amount numeric, _payment_type text DEFAULT 'installment'
)
RETURNS uuid
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'private'
AS $$
  SELECT private.record_islamic_loan_payment(_loan_id, _amount, _payment_type);
$$;

REVOKE ALL ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;

-- =====================================================
-- 3) Recreate islamic_loans_public view with security_invoker
-- =====================================================
DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker = on) AS
SELECT
  id, code, purchase_price, sell_price, tenure_months, profit_percentage,
  media_person_id, media_person_profit_pct, fund_profit_pct, admin_profit_pct,
  status, remaining_amount, monthly_installment, comments, discount_pct,
  customer_user_id, created_at,
  -- Borrower PII visible only to admin or the loan's own customer
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN borrower_name END AS borrower_name,
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN borrower_phone END AS borrower_phone,
  CASE WHEN public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid()
       THEN relative_phone END AS relative_phone
FROM public.islamic_loans;

GRANT SELECT ON public.islamic_loans_public TO authenticated;

-- =====================================================
-- 4) RLS tightening
-- =====================================================

-- customer_payment_requests: members lose blanket read
DROP POLICY IF EXISTS "Members read payment requests" ON public.customer_payment_requests;
CREATE POLICY "Admins or owning customer read payment requests"
ON public.customer_payment_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR customer_user_id = auth.uid());

-- islamic_loan_payments: drop blanket true policy
DROP POLICY IF EXISTS "All can read loan payments" ON public.islamic_loan_payments;
CREATE POLICY "Members and admins read loan payments"
ON public.islamic_loan_payments
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'member'));
-- (existing 'Customer reads own loan payments' policy still covers customers for their own loan)

-- phone_book: hide from customers
DROP POLICY IF EXISTS "Authenticated users can view phone book" ON public.phone_book;
CREATE POLICY "Members and admins can view phone book"
ON public.phone_book
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'member'));

-- project_fund_requests: restrict INSERT to managers/admins
DROP POLICY IF EXISTS "Authenticated can create fund requests" ON public.project_fund_requests;
CREATE POLICY "Managers or admins create fund requests"
ON public.project_fund_requests
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_id
      AND (p.manager_id = auth.uid() OR p.secondary_manager_id = auth.uid())
  )
);

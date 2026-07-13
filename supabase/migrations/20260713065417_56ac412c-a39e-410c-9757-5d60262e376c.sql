-- Guard function: prevents non-admin privilege escalation on islamic_loans
CREATE OR REPLACE FUNCTION public.tg_islamic_loans_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Bypass for service_role / no auth context (edge functions, admin RPCs)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Non-admin cannot assign themselves as media person
    IF NEW.media_person_id IS NOT NULL AND NEW.media_person_id = auth.uid() THEN
      RAISE EXCEPTION 'Non-admin users cannot assign themselves as media person';
    END IF;
    IF NEW.secondary_media_person_id IS NOT NULL AND NEW.secondary_media_person_id = auth.uid() THEN
      RAISE EXCEPTION 'Non-admin users cannot assign themselves as secondary media person';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Block changes to sensitive financial / assignment / status fields for non-admins
    IF NEW.purchase_price IS DISTINCT FROM OLD.purchase_price
       OR NEW.sell_price IS DISTINCT FROM OLD.sell_price
       OR NEW.media_person_profit_pct IS DISTINCT FROM OLD.media_person_profit_pct
       OR NEW.secondary_media_person_profit_pct IS DISTINCT FROM OLD.secondary_media_person_profit_pct
       OR NEW.admin_profit_pct IS DISTINCT FROM OLD.admin_profit_pct
       OR NEW.fund_profit_pct IS DISTINCT FROM OLD.fund_profit_pct
       OR NEW.remaining_amount IS DISTINCT FROM OLD.remaining_amount
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.tenure_months IS DISTINCT FROM OLD.tenure_months
       OR NEW.monthly_installment IS DISTINCT FROM OLD.monthly_installment
       OR NEW.code IS DISTINCT FROM OLD.code
       OR NEW.media_person_id IS DISTINCT FROM OLD.media_person_id
       OR NEW.secondary_media_person_id IS DISTINCT FROM OLD.secondary_media_person_id
       OR NEW.customer_user_id IS DISTINCT FROM OLD.customer_user_id
    THEN
      RAISE EXCEPTION 'Only admins can modify financial or assignment fields of an islamic loan';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS islamic_loans_guard_ins ON public.islamic_loans;
DROP TRIGGER IF EXISTS islamic_loans_guard_upd ON public.islamic_loans;

CREATE TRIGGER islamic_loans_guard_ins
BEFORE INSERT ON public.islamic_loans
FOR EACH ROW EXECUTE FUNCTION public.tg_islamic_loans_guard();

CREATE TRIGGER islamic_loans_guard_upd
BEFORE UPDATE ON public.islamic_loans
FOR EACH ROW EXECUTE FUNCTION public.tg_islamic_loans_guard();
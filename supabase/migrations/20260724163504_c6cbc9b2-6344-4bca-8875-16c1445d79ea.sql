-- 1) Allow members to assign themselves as media/secondary media person
CREATE OR REPLACE FUNCTION public.tg_islamic_loans_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  IF is_admin THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Non-admins CAN now assign themselves or anyone as media/secondary media person.
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
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
$function$;

-- 2) Advance payment column
ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS advance_amount numeric(15,2) NOT NULL DEFAULT 0;
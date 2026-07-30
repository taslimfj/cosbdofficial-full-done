CREATE OR REPLACE FUNCTION public.tg_cpr_decision_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare lcode text;
begin
  if NEW.status is distinct from OLD.status and NEW.status in ('approved','rejected') then
    select code into lcode from public.islamic_loans where id = NEW.loan_id;
    insert into public.notifications (user_id, title, message, url, tag)
    values (
      NEW.customer_user_id,
      case when NEW.status = 'approved' then 'কিস্তি Approved' else 'কিস্তি Rejected' end,
      case when NEW.status = 'approved'
        then 'Loan ' || coalesce(lcode,'') || ' — আপনার ৳' || NEW.amount::text || ' কিস্তি approve করা হয়েছে।'
        else 'Loan ' || coalesce(lcode,'') || ' — আপনার ৳' || NEW.amount::text || ' কিস্তি request reject করা হয়েছে।'
      end,
      '/islamic-loans/' || NEW.loan_id::text,
      'cpr-decision-' || NEW.id::text || '-' || NEW.status
    );
  end if;
  return NEW;
end;
$$;

DROP TRIGGER IF EXISTS tg_cpr_decision ON public.customer_payment_requests;
CREATE TRIGGER tg_cpr_decision
AFTER UPDATE ON public.customer_payment_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_cpr_decision_notify();
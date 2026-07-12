
DROP VIEW IF EXISTS public.islamic_loans_public;

CREATE VIEW public.islamic_loans_public
WITH (security_invoker=off) AS
SELECT
  id,
  code,
  borrower_name,
  product_name,
  purchase_price,
  sell_price,
  tenure_months,
  profit_percentage,
  discount_pct,
  discount_credit_from_loan,
  discount_credit_used,
  media_person_id,
  secondary_media_person_id,
  media_person_profit_pct,
  fund_profit_pct,
  admin_profit_pct,
  monthly_installment,
  remaining_amount,
  comments,
  status,
  created_at,
  closed_at,
  customer_user_id,
  excluded_member_ids,
  exclusion_reasons
FROM public.islamic_loans
WHERE
  NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_customer = true
  )
  OR customer_user_id = auth.uid();

GRANT SELECT ON public.islamic_loans_public TO authenticated;

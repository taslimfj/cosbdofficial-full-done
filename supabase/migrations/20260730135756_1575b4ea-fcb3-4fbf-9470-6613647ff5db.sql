DROP VIEW IF EXISTS public.islamic_loans_public;

CREATE VIEW public.islamic_loans_public
WITH (security_invoker=on) AS
SELECT id, code, product_name, purchase_price, sell_price, tenure_months,
  profit_percentage, discount_pct, media_person_profit_pct, fund_profit_pct,
  admin_profit_pct, monthly_installment, remaining_amount, comments, status,
  customer_user_id, media_person_id, secondary_media_person_id, borrower_name,
  created_at, issue_date, advance_amount, closed_at, months_paid_early,
  discount_credit_used, discount_credit_from_loan
FROM public.islamic_loans;

GRANT SELECT ON public.islamic_loans_public TO authenticated;
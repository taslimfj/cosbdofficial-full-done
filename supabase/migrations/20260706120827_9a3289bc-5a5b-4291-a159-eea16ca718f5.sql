-- 1. Islamic Loan: recalculate sell_price & monthly_installment
--    New rule: monthly = FLOOR(sell_price / tenure), sell_price = monthly * tenure
--    Adjust remaining_amount so that already-paid portion is preserved.
WITH new_vals AS (
  SELECT
    id,
    tenure_months,
    sell_price AS old_sell,
    remaining_amount AS old_remaining,
    FLOOR(sell_price / NULLIF(tenure_months, 0))::numeric AS new_monthly
  FROM public.islamic_loans
  WHERE tenure_months IS NOT NULL AND tenure_months > 0
)
UPDATE public.islamic_loans l
SET
  monthly_installment = n.new_monthly,
  sell_price = n.new_monthly * n.tenure_months,
  remaining_amount = GREATEST(
    0,
    LEAST(
      n.new_monthly * n.tenure_months,
      (n.new_monthly * n.tenure_months) - (n.old_sell - n.old_remaining)
    )
  )
FROM new_vals n
WHERE n.id = l.id;

-- 2. Drop project_fund_requests table (feature removed)
DROP TABLE IF EXISTS public.project_fund_requests CASCADE;

-- 3. Refund/clear project budget reservation fund_transactions rows
--    so Fund balance is no longer polluted by project budget flows.
DELETE FROM public.fund_transactions
WHERE reason ILIKE 'Project %— Budget reserved%'
   OR reason ILIKE 'Project %— অব্যবহৃত budget%'
   OR reason ILIKE 'Project %— অতিরিক্ত fund approved%';

-- 4. Clear budget columns on projects (no longer used)
UPDATE public.projects
SET budget_amount = 0,
    extra_funds_approved = 0,
    budget_returned = 0
WHERE budget_amount IS NOT NULL
   OR extra_funds_approved IS NOT NULL
   OR budget_returned IS NOT NULL;
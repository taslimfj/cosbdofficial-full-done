
ALTER TABLE public.profit_distributions DROP CONSTRAINT IF EXISTS profit_distributions_distribution_type_check;
ALTER TABLE public.profit_distributions ADD CONSTRAINT profit_distributions_distribution_type_check
  CHECK (distribution_type = ANY (ARRAY[
    'share','media_person','manager','fund',
    'admin','admin_to_fund','deleted_member_to_fund','loss','loss_deleted_to_fund'
  ]));

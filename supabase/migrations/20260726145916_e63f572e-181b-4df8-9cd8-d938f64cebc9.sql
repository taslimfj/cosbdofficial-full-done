ALTER TABLE public.profit_distributions DROP CONSTRAINT IF EXISTS profit_distributions_distribution_type_check;
ALTER TABLE public.profit_distributions ADD CONSTRAINT profit_distributions_distribution_type_check
CHECK (distribution_type = ANY (ARRAY[
  'share','media_person','secondary_media_person','manager','secondary_manager',
  'fund','admin','admin_to_fund','deleted_member_to_fund','media_deleted_to_fund',
  'manager_deleted_to_fund','residual_to_fund','loss','loss_deleted_to_fund'
]));
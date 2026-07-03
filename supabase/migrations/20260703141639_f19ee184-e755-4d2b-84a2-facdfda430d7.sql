DROP VIEW IF EXISTS public.member_directory;
CREATE VIEW public.member_directory
WITH (security_invoker=on) AS
SELECT id, full_name, avatar_url, deleted_name, is_deleted, is_customer, total_deposited, created_at, updated_at
FROM public.profiles;
GRANT SELECT ON public.member_directory TO authenticated, anon;
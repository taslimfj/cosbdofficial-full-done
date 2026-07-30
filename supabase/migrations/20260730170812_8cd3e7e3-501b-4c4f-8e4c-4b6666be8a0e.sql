DROP VIEW IF EXISTS public.islamic_loans_public;
CREATE VIEW public.islamic_loans_public
WITH (security_invoker = off) AS
SELECT l.*
FROM public.islamic_loans l
WHERE public.has_role(auth.uid(), 'admin'::public.app_role)
   OR public.has_role(auth.uid(), 'member'::public.app_role)
   OR l.customer_user_id = auth.uid()
   OR l.media_person_id = auth.uid()
   OR l.secondary_media_person_id = auth.uid();

GRANT SELECT ON public.islamic_loans_public TO authenticated;
REVOKE SELECT ON public.islamic_loans_public FROM anon;
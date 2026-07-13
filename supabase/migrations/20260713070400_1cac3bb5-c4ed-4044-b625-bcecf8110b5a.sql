CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Preserve the existing workflow: admins have full admin permission and can also use member login.
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'member'::public.app_role
FROM public.user_roles
WHERE role = 'admin'::public.app_role
ON CONFLICT (user_id, role) DO NOTHING;

-- Repair admin accounts created from admin signup metadata if their admin row was missing.
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'admin'
ON CONFLICT (user_id, role) DO NOTHING;
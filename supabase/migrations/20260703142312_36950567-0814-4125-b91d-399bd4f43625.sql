DROP VIEW IF EXISTS public.member_directory;

CREATE VIEW public.member_directory
WITH (security_invoker = on) AS
SELECT
  id,
  full_name,
  avatar_url,
  deleted_name,
  is_deleted,
  is_customer,
  phone,
  total_deposited,
  created_at,
  updated_at
FROM public.profiles
WHERE is_deleted = false
  AND is_customer = false;

GRANT SELECT ON public.member_directory TO authenticated;

CREATE OR REPLACE FUNCTION private.anonymize_member_references_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.islamic_loan_member_shares
    SET is_member_deleted = true,
        member_name = 'Deleted Member',
        member_id = NULL
    WHERE member_id = OLD.id;

  UPDATE public.project_member_shares
    SET is_member_deleted = true,
        member_name = 'Deleted Member',
        member_id = NULL
    WHERE member_id = OLD.id;

  UPDATE public.islamic_loans
    SET media_person_id = NULL
    WHERE media_person_id = OLD.id;

  UPDATE public.projects
    SET manager_id = NULL
    WHERE manager_id = OLD.id;

  UPDATE public.projects
    SET secondary_manager_id = NULL
    WHERE secondary_manager_id = OLD.id;

  DELETE FROM public.profit_distributions
    WHERE member_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_anonymize_member_references_before_delete ON public.profiles;
CREATE TRIGGER trg_anonymize_member_references_before_delete
BEFORE DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.anonymize_member_references_before_delete();

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_manager_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_manager_id_fkey
  FOREIGN KEY (manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_secondary_manager_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_secondary_manager_id_fkey
  FOREIGN KEY (secondary_manager_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.islamic_loans DROP CONSTRAINT IF EXISTS islamic_loans_media_person_id_fkey;
ALTER TABLE public.islamic_loans
  ADD CONSTRAINT islamic_loans_media_person_id_fkey
  FOREIGN KEY (media_person_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.profit_distributions DROP CONSTRAINT IF EXISTS profit_distributions_member_id_fkey;
ALTER TABLE public.profit_distributions
  ADD CONSTRAINT profit_distributions_member_id_fkey
  FOREIGN KEY (member_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- 1. PROFILES: customer flag
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_customer boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. ISLAMIC LOANS: link to customer auth user
-- ============================================================
ALTER TABLE public.islamic_loans
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================================
-- 3. SNAPSHOT TABLE: Islamic Loan member shares (locked at creation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.islamic_loan_member_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.islamic_loans(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  deposit_snapshot numeric NOT NULL DEFAULT 0,
  share_percentage numeric NOT NULL DEFAULT 0,
  is_member_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ilms_loan ON public.islamic_loan_member_shares(loan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.islamic_loan_member_shares TO authenticated;
GRANT ALL ON public.islamic_loan_member_shares TO service_role;

ALTER TABLE public.islamic_loan_member_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage loan shares" ON public.islamic_loan_member_shares
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members read loan shares" ON public.islamic_loan_member_shares
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'member'::app_role)
  );

-- ============================================================
-- 4. SNAPSHOT TABLE: Project member shares (locked at creation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.project_member_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  member_name text NOT NULL,
  deposit_snapshot numeric NOT NULL DEFAULT 0,
  share_percentage numeric NOT NULL DEFAULT 0,
  is_member_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pms_project ON public.project_member_shares(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_member_shares TO authenticated;
GRANT ALL ON public.project_member_shares TO service_role;

ALTER TABLE public.project_member_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage project shares" ON public.project_member_shares
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members read project shares" ON public.project_member_shares
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'member'::app_role)
  );

-- ============================================================
-- 5. CUSTOMER PAYMENT REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_payment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.islamic_loans(id) ON DELETE CASCADE,
  customer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid
);
CREATE INDEX IF NOT EXISTS idx_cpr_loan ON public.customer_payment_requests(loan_id);
CREATE INDEX IF NOT EXISTS idx_cpr_customer ON public.customer_payment_requests(customer_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_payment_requests TO authenticated;
GRANT ALL ON public.customer_payment_requests TO service_role;

ALTER TABLE public.customer_payment_requests ENABLE ROW LEVEL SECURITY;

-- Admins/Members can see all; admins can update (approve/reject)
CREATE POLICY "Admins manage payment requests" ON public.customer_payment_requests
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Members read payment requests" ON public.customer_payment_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'member'::app_role)
    OR customer_user_id = auth.uid()
  );

CREATE POLICY "Customers create own requests" ON public.customer_payment_requests
  FOR INSERT TO authenticated
  WITH CHECK (customer_user_id = auth.uid());

-- ============================================================
-- 6. ISLAMIC LOANS: allow customer to read their own loan
-- ============================================================
DROP POLICY IF EXISTS "Customer reads own loan" ON public.islamic_loans;
CREATE POLICY "Customer reads own loan" ON public.islamic_loans
  FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

-- Allow customer to read their own loan payments
DROP POLICY IF EXISTS "Customer reads own loan payments" ON public.islamic_loan_payments;
CREATE POLICY "Customer reads own loan payments" ON public.islamic_loan_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.islamic_loans l
      WHERE l.id = islamic_loan_payments.loan_id
        AND l.customer_user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. BACKFILL snapshots for existing Islamic Loans
-- ============================================================
INSERT INTO public.islamic_loan_member_shares (loan_id, member_id, member_name, deposit_snapshot, share_percentage)
SELECT
  l.id,
  p.id,
  COALESCE(p.full_name, p.deleted_name, 'Unknown'),
  COALESCE(p.total_deposited, 0),
  CASE
    WHEN totals.total > 0 THEN ROUND((COALESCE(p.total_deposited,0) / totals.total) * 100, 4)
    ELSE 0
  END
FROM public.islamic_loans l
CROSS JOIN public.profiles p
JOIN (
  SELECT SUM(COALESCE(total_deposited, 0)) AS total
  FROM public.profiles
  WHERE is_deleted = false AND COALESCE(total_deposited,0) > 0
) totals ON true
WHERE p.is_deleted = false
  AND COALESCE(p.total_deposited, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.islamic_loan_member_shares s
    WHERE s.loan_id = l.id
  );

-- Backfill snapshots for existing Projects
INSERT INTO public.project_member_shares (project_id, member_id, member_name, deposit_snapshot, share_percentage)
SELECT
  pr.id,
  p.id,
  COALESCE(p.full_name, p.deleted_name, 'Unknown'),
  COALESCE(p.total_deposited, 0),
  CASE
    WHEN totals.total > 0 THEN ROUND((COALESCE(p.total_deposited,0) / totals.total) * 100, 4)
    ELSE 0
  END
FROM public.projects pr
CROSS JOIN public.profiles p
JOIN (
  SELECT SUM(COALESCE(total_deposited, 0)) AS total
  FROM public.profiles
  WHERE is_deleted = false AND COALESCE(total_deposited,0) > 0
) totals ON true
WHERE p.is_deleted = false
  AND COALESCE(p.total_deposited, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.project_member_shares s
    WHERE s.project_id = pr.id
  );

-- ============================================================
-- 8. handle_new_user: respect is_customer metadata
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, is_customer)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'phone',
    COALESCE((NEW.raw_user_meta_data->>'is_customer')::boolean, false)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'member'));

  RETURN NEW;
END;
$$;

-- ============================================================
-- 9. Helper: mark snapshots when a member is soft-deleted
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_member_deleted_in_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_deleted = true AND COALESCE(OLD.is_deleted, false) = false THEN
    UPDATE public.islamic_loan_member_shares
      SET is_member_deleted = true
      WHERE member_id = NEW.id;
    UPDATE public.project_member_shares
      SET is_member_deleted = true
      WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mark_member_deleted_snapshots ON public.profiles;
CREATE TRIGGER trg_mark_member_deleted_snapshots
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.mark_member_deleted_in_snapshots();

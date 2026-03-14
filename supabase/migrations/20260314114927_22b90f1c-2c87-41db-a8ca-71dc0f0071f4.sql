
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'member');

-- Create user_roles table (security best practice - roles in separate table)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  total_deposited DECIMAL(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Deposits table
CREATE TABLE public.deposits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_method TEXT,
  transaction_number TEXT,
  month_year DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

-- Fund transactions
CREATE TABLE public.fund_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.fund_transactions ENABLE ROW LEVEL SECURITY;

-- Islamic loans
CREATE TABLE public.islamic_loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  purchase_price DECIMAL(15,2) NOT NULL,
  sell_price DECIMAL(15,2) NOT NULL,
  tenure_months INT NOT NULL,
  profit_percentage DECIMAL(5,2) DEFAULT 0,
  media_person_id UUID REFERENCES public.profiles(id),
  media_person_profit_pct DECIMAL(5,2) DEFAULT 5,
  fund_profit_pct DECIMAL(5,2) DEFAULT 15,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  remaining_amount DECIMAL(15,2) DEFAULT 0,
  monthly_installment DECIMAL(15,2) DEFAULT 0,
  comments TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.islamic_loans ENABLE ROW LEVEL SECURITY;

-- Islamic loan payments
CREATE TABLE public.islamic_loan_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.islamic_loans(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_type TEXT DEFAULT 'installment' CHECK (payment_type IN ('installment', 'advance')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.islamic_loan_payments ENABLE ROW LEVEL SECURITY;

-- Projects
CREATE TABLE public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  manager_id UUID REFERENCES public.profiles(id),
  manager_profit_pct DECIMAL(5,2) DEFAULT 5,
  fund_profit_pct DECIMAL(5,2) DEFAULT 15,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Project transactions
CREATE TABLE public.project_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('expense', 'income')),
  amount DECIMAL(15,2) NOT NULL,
  reason TEXT,
  comments TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.project_transactions ENABLE ROW LEVEL SECURITY;

-- Member loans (interest-free)
CREATE TABLE public.member_loans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  requested_amount DECIMAL(15,2) NOT NULL,
  approved_amount DECIMAL(15,2) DEFAULT 0,
  repaid_amount DECIMAL(15,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'repaid')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.member_loans ENABLE ROW LEVEL SECURITY;

-- Member loan repayments
CREATE TABLE public.member_loan_repayments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id UUID REFERENCES public.member_loans(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  payment_method TEXT,
  transaction_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.member_loan_repayments ENABLE ROW LEVEL SECURITY;

-- Notifications
CREATE TABLE public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Profit distributions
CREATE TABLE public.profit_distributions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('islamic_loan', 'project')),
  source_id UUID NOT NULL,
  member_id UUID REFERENCES public.profiles(id),
  amount DECIMAL(15,2) NOT NULL,
  share_percentage DECIMAL(8,4),
  distribution_type TEXT CHECK (distribution_type IN ('share', 'media_person', 'manager', 'fund')),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profit_distributions ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- user_roles: users can read their own role, admins can manage all
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- profiles: everyone can read, users can update own
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- deposits: members see own, admins see all
CREATE POLICY "Members see own deposits" ON public.deposits FOR SELECT TO authenticated USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members can insert deposits" ON public.deposits FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage deposits" ON public.deposits FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- fund_transactions: all authenticated can read, only admins can write
CREATE POLICY "All can read fund transactions" ON public.fund_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage fund transactions" ON public.fund_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- islamic_loans: all authenticated can read, only admins can write
CREATE POLICY "All can read islamic loans" ON public.islamic_loans FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage islamic loans" ON public.islamic_loans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- islamic_loan_payments: all can read, admins can write
CREATE POLICY "All can read loan payments" ON public.islamic_loan_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage loan payments" ON public.islamic_loan_payments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- projects: all can read, admins can write
CREATE POLICY "All can read projects" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- project_transactions: all can read, admins and managers can write
CREATE POLICY "All can read project transactions" ON public.project_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage project transactions" ON public.project_transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Managers can add project transactions" ON public.project_transactions FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND manager_id = auth.uid())
  );

-- member_loans: members see own, admins see all
CREATE POLICY "Members see own loans" ON public.member_loans FOR SELECT TO authenticated USING (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Members can request loans" ON public.member_loans FOR INSERT TO authenticated WITH CHECK (member_id = auth.uid());
CREATE POLICY "Admins can manage member loans" ON public.member_loans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- member_loan_repayments: members see own, admins see all
CREATE POLICY "Members see own repayments" ON public.member_loan_repayments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.member_loans WHERE id = loan_id AND (member_id = auth.uid() OR public.has_role(auth.uid(), 'admin')))
);
CREATE POLICY "Admins can manage repayments" ON public.member_loan_repayments FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- notifications: users see own
CREATE POLICY "Users see own notifications" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- profit_distributions: all can read
CREATE POLICY "All can read distributions" ON public.profit_distributions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage distributions" ON public.profit_distributions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for auto-creating profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'member');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

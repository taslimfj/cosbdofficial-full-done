import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { MonthlyReminders } from '@/components/MonthlyReminders';
import { NotificationBell } from '@/components/NotificationBell';
import { BackButton } from '@/components/BackButton';
import {
  LayoutDashboard,
  Users,
  Wallet,
  Landmark,
  FolderKanban,
  HandCoins,
  LogOut,
  Menu,
  X,
  Shield,
  BookUser,
  Package,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'member'] },
  { to: '/members', icon: Users, label: 'Members', roles: ['admin', 'member'] },
  { to: '/fund', icon: Wallet, label: 'Fund', roles: ['admin', 'member'] },
  { to: '/islamic-loans', icon: Landmark, label: 'Islamic Loans', roles: ['admin', 'member'] },
  { to: '/projects', icon: FolderKanban, label: 'Projects', roles: ['admin', 'member'] },
  { to: '/member-loans', icon: HandCoins, label: 'Member Loans', roles: ['admin', 'member'] },
  { to: '/phone-book', icon: BookUser, label: 'Phone Book', roles: ['admin', 'member'] },
  { to: '/assets', icon: Package, label: 'Assets', roles: ['admin', 'member'] },
  { to: '/tutorials', icon: GraduationCap, label: 'Tutorial', roles: ['admin', 'member'] },
];

export default function DashboardLayout() {
  const { profile, role, signOut, isCustomer, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customerLoanId, setCustomerLoanId] = useState<string | null>(null);

  // Fetch customer's own loan id (used both for redirect and sidebar nav)
  useEffect(() => {
    if (!isCustomer || !user) {
      setCustomerLoanId(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('islamic_loans')
        .select('id')
        .eq('customer_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (data?.id) setCustomerLoanId(data.id);
    })();
  }, [isCustomer, user]);

  // Customer redirect: send to their loan page on first landing
  useEffect(() => {
    if (!isCustomer || !user) return;
    if (location.pathname.startsWith('/islamic-loans/')) return;
    if (location.pathname.startsWith('/tutorials')) return;
    if (location.pathname.startsWith('/profile')) return;
    if (customerLoanId) navigate(`/islamic-loans/${customerLoanId}`, { replace: true });
  }, [isCustomer, user, location.pathname, navigate, customerLoanId]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const customerNav = [
    ...(customerLoanId
      ? [{ to: `/islamic-loans/${customerLoanId}`, icon: Landmark, label: 'My Loan' }]
      : []),
    { to: '/tutorials', icon: GraduationCap, label: 'Tutorial' },
  ];

  const filteredNav = isCustomer
    ? customerNav
    : navItems.filter(item => role && item.roles.includes(role));

  return (
    <div className="flex min-h-screen bg-background">
      <MonthlyReminders />
      
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0 lg:static lg:z-auto",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-14 px-4 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <img src={BRAND.logoUrl} alt={`${BRAND.name} logo`} className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
              <div className="flex flex-col leading-tight min-w-0">
                <span className="font-semibold text-foreground tracking-tight text-sm truncate">{BRAND.name}</span>
                <span className="text-[10px] text-muted-foreground italic truncate">{BRAND.slogan}</span>
              </div>
            </div>
            <button className="lg:hidden text-muted-foreground" onClick={() => setSidebarOpen(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {filteredNav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-secondary"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* User info */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2">
              <button
                onClick={() => { setSidebarOpen(false); navigate('/profile'); }}
                className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg hover:bg-secondary px-1 -mx-1 py-1 transition-colors"
                title="Open profile"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary overflow-hidden">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Profile photo" className="h-full w-full object-cover" />
                  ) : (
                    profile?.full_name?.charAt(0)?.toUpperCase() || 'U'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || 'User'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{role || 'member'}</p>
                </div>
              </button>
              <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={handleSignOut}>
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card flex items-center gap-2 px-4 lg:px-6 shrink-0">
          <button className="lg:hidden text-muted-foreground" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <BackButton />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {role === 'admin' && (
              <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-md">Admin</span>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8 relative">
              <Bell className="w-4 h-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

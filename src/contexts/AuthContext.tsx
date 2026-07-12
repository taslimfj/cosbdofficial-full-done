import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'member';
type LoginMode = 'admin' | 'member' | 'customer';

const ACTIVE_LOGIN_MODE_KEY = 'activeLoginMode';

function getActiveLoginMode(): LoginMode | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(ACTIVE_LOGIN_MODE_KEY);
  return value === 'admin' || value === 'member' || value === 'customer' ? value : null;
}

function resolveActiveRole(roles: AppRole[], isCustomer: boolean): AppRole | null {
  if (isCustomer) return null;

  const mode = getActiveLoginMode();
  const isAdminAccount = roles.includes('admin');
  const isMemberAccount = roles.includes('member') || isAdminAccount;

  if (mode === 'admin') return isAdminAccount ? 'admin' : isMemberAccount ? 'member' : null;
  if (mode === 'member') return isMemberAccount ? 'member' : null;

  return isAdminAccount ? 'admin' : isMemberAccount ? 'member' : null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: any | null;
  isCustomer: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    const [roleResult, profileResult] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', userId),
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    ]);

    const roles = (roleResult.data || []).map((r: any) => r.role as AppRole);
    const nextProfile = profileResult.data || null;
    setRole(resolveActiveRole(roles, !!nextProfile?.is_customer));
    setProfile(nextProfile);
  };

  const refreshProfile = async () => {
    if (user) await fetchUserData(user.id);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        setLoading(true);
        setTimeout(async () => {
          await fetchUserData(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setRole(null);
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchUserData(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem(ACTIVE_LOGIN_MODE_KEY);
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);
  };

  const isCustomer = !!profile?.is_customer;

  return (
    <AuthContext.Provider value={{ user, session, role, profile, isCustomer, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

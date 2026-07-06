import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Loader2, Shield, UserPlus, Users, ShoppingBag } from 'lucide-react';
import { BRAND } from '@/lib/brand';

type LoginType = 'admin' | 'member' | 'customer';

export default function LoginPage() {
  const { user, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [signupName, setSignupName] = useState('');
  const [loginType, setLoginType] = useState<LoginType>('admin');

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    const redirect = sessionStorage.getItem('postLoginRedirect');
    if (redirect) {
      sessionStorage.removeItem('postLoginRedirect');
      return <Navigate to={redirect} replace />;
    }
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    // Accept either an email or a phone number. Phone numbers are converted
    // to the synthetic email used at signup time.
    const raw = email.trim();
    const isEmail = raw.includes('@');
    const loginIdentifier = isEmail
      ? raw
      : `${raw.replace(/[^0-9]/g, '')}@sharee.local`;

    if (mode === 'signup') {
      if (!signupName.trim()) {
        toast.error('Please enter your name');
        return;
      }
      if (!isEmail) {
        toast.error('Admin signup requires an email address');
        return;
      }
      setLoading(true);
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.auth.signUp({
        email: loginIdentifier,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { full_name: signupName, role: 'admin' },
        },
      });
      setLoading(false);
      if (error) {
        toast.error(error.message || 'Signup failed');
      } else {
        toast.success('এডমিন একাউন্ট তৈরি হয়েছে। আগে ইমেইল ভেরিফাই করুন, তারপর লগ ইন করুন।');
        setMode('login');
      }
      return;
    }

    // Customer redirect is handled inside DashboardLayout (finds their loan).
    // Always send through "/" so the layout can route them appropriately.
    sessionStorage.removeItem('postLoginRedirect');

    setLoading(true);
    const { error } = await signIn(loginIdentifier, password);
    setLoading(false);
    if (error) {
      sessionStorage.removeItem('postLoginRedirect');
      const message = error.message || 'Login failed';
      if (message.toLowerCase().includes('email not confirmed')) {
        toast.error('আপনার ইমেইল এখনো ভেরিফাই করা হয়নি। ইমেইলের ভেরিফিকেশন লিংকে ক্লিক করে তারপর লগ ইন করুন।');
      } else if (message.toLowerCase().includes('invalid login credentials')) {
        toast.error('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
      } else {
        toast.error(message);
      }
    } else {
      toast.success('Welcome back!');
    }
  };

  const typeMeta: Record<LoginType, { label: string; desc: string }> = {
    admin: { label: 'Admin', desc: 'Sign in to manage the fund' },
    member: { label: 'Member', desc: 'Sign in to view your account' },
    customer: { label: 'Customer', desc: 'Sign in to view Islamic Loans' },
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-primary-foreground/10 p-3 mb-6">
              <img src={BRAND.logoUrl} alt={`${BRAND.name} logo`} className="w-full h-full object-contain" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-2 tracking-tight">{BRAND.name}</h1>
          <p className="text-primary-foreground/60 text-sm mb-4 tracking-widest">{BRAND.short}</p>
          <p className="text-primary-foreground/80 text-lg leading-relaxed italic">
            {BRAND.slogan}
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <img src={BRAND.logoUrl} alt={`${BRAND.name} logo`} className="w-16 h-16 mx-auto mb-3 rounded-xl" />
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{BRAND.name}</h1>
            <p className="text-muted-foreground text-xs mt-1 italic">{BRAND.slogan}</p>
          </div>

          {mode === 'login' && (
            <Tabs value={loginType} onValueChange={(v) => setLoginType(v as LoginType)} className="mb-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="admin" className="text-xs gap-1">
                  <Shield className="w-3.5 h-3.5" /> Admin
                </TabsTrigger>
                <TabsTrigger value="member" className="text-xs gap-1">
                  <Users className="w-3.5 h-3.5" /> Member
                </TabsTrigger>
                <TabsTrigger value="customer" className="text-xs gap-1">
                  <ShoppingBag className="w-3.5 h-3.5" /> Customer
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground">
              {mode === 'login' ? `${typeMeta[loginType].label} Sign in` : 'Create Admin Account'}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === 'login' ? typeMeta[loginType].desc : 'Set up a new admin account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  className="h-10"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                {mode === 'login' ? 'Email or Phone Number' : 'Email'}
              </Label>
              <Input
                id="email"
                type="text"
                placeholder={mode === 'login' ? 'you@example.com or +8801XXXXXXXXX' : 'you@example.com'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </div>
            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {mode === 'login' ? `Sign in as ${typeMeta[loginType].label}` : 'Create Admin Account'}
            </Button>
          </form>

          <div className="mt-6 text-center">
            {mode === 'login' ? (
              <button
                onClick={() => setMode('signup')}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> Create Admin Account
              </button>
            ) : (
              <button
                onClick={() => setMode('login')}
                className="text-sm text-primary hover:underline"
              >
                Already have an account? Sign in
              </button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Contact your fund administrator for member access
          </p>
        </div>
      </div>
    </div>
  );
}

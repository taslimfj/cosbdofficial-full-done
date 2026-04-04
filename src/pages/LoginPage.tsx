import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Shield, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const { user, signIn, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [signupName, setSignupName] = useState('');

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    if (mode === 'signup') {
      if (!signupName.trim()) {
        toast.error('Please enter your name');
        return;
      }
      setLoading(true);
      const { supabase } = await import('@/integrations/supabase/client');
      const { error } = await supabase.auth.signUp({
        email,
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
        toast.success('এডমিন একাউন্ট তৈরি হয়েছে। আগে ইমেইল ভেরিফাই করুন, তারপর লগ ইন করুন।');
        setMode('login');
      }
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const message = error.message || 'Login failed';
      if (message.toLowerCase().includes('email not confirmed')) {
        toast.error('আপনার ইমেইল এখনো ভেরিফাই করা হয়নি। ইমেইলের ভেরিফিকেশন লিংকে ক্লিক করে তারপর লগ ইন করুন।');
      } else if (message.toLowerCase().includes('invalid login credentials')) {
        toast.error('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আবার চেষ্টা করুন।');
      } else {
        toast.error(message);
      }
    } else {
      toast.success('Welcome back!');
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary items-center justify-center p-12">
        <div className="max-w-md text-center">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary-foreground/10 mb-6">
              <Shield className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-primary-foreground mb-4 tracking-tight">ShareeFund</h1>
          <p className="text-primary-foreground/70 text-lg leading-relaxed">
            Ethical Growth. Community Trust.
          </p>
          <p className="text-primary-foreground/50 text-sm mt-4">
            Islamic community investment management platform
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8 text-center">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">ShareeFund</h1>
            <p className="text-muted-foreground text-sm mt-1">Ethical Growth. Community Trust.</p>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-foreground">
              {mode === 'login' ? 'Sign in' : 'Create Admin Account'}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              {mode === 'login' ? 'Enter your credentials to continue' : 'Set up a new admin account'}
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
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                autoComplete="email"
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
              {mode === 'login' ? 'Sign in' : 'Create Admin Account'}
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

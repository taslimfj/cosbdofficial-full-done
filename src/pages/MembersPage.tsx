import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, calculateSharePercentage } from '@/lib/finance';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Phone, MessageCircle, Search, Loader2, PhoneCall, PhoneOff, Mic, MicOff } from 'lucide-react';

interface MemberContact {
  id: string;
  full_name: string;
  phone: string | null;
}

export default function MembersPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', password: '', fullName: '', phone: '' });
  const [adding, setAdding] = useState(false);

  const [inAppCall, setInAppCall] = useState<MemberContact | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  useEffect(() => { fetchMembers(); }, []);

  useEffect(() => {
    if (!inAppCall) return;
    const t = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [inAppCall]);

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_deleted', false).order('full_name');
    const profiles = data || [];
    const total = profiles.reduce((s, p) => s + Number(p.total_deposited || 0), 0);
    setTotalInvestment(total);
    setMembers(profiles);
    setLoading(false);
  };

  const handleAddMember = async () => {
    if (!newMember.email || !newMember.password || !newMember.fullName) {
      toast.error('Please fill required fields');
      return;
    }
    setAdding(true);

    // Preserve the current admin session — signUp would otherwise replace it
    const { data: sessionData } = await supabase.auth.getSession();
    const currentSession = sessionData.session;

    const { data: signUpData, error } = await supabase.auth.signUp({
      email: newMember.email,
      password: newMember.password,
      options: {
        data: {
          full_name: newMember.fullName,
          phone: newMember.phone || null,
        },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setAdding(false);
      toast.error(error.message);
      return;
    }

    // Restore the admin session so the page does not log us out
    if (currentSession) {
      await supabase.auth.setSession({
        access_token: currentSession.access_token,
        refresh_token: currentSession.refresh_token,
      });
    }

    // Fallback: if the trigger didn't set the phone (e.g. metadata key mismatch),
    // update the profile directly.
    if (signUpData?.user?.id && newMember.phone) {
      await supabase
        .from('profiles')
        .update({ phone: newMember.phone })
        .eq('id', signUpData.user.id);
    }

    setAdding(false);
    toast.success('Member account created');
    setShowAddDialog(false);
    setNewMember({ email: '', password: '', fullName: '', phone: '' });
    setTimeout(fetchMembers, 800);
  };


  const handlePhoneCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
  };

  const handleWhatsApp = (number: string) => {
    const cleaned = number.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${cleaned.startsWith('+') ? cleaned.slice(1) : cleaned}`, '_blank');
  };

  const handleInAppCall = (member: MemberContact) => {
    setCallSeconds(0);
    setCallMuted(false);
    setInAppCall(member);
  };

  const fmtDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const filtered = members.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.phone?.includes(search)
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">{members.length} members · {formatBDT(totalInvestment)} total invested</p>
        </div>
        {role === 'admin' && (
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Member Account</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input value={newMember.fullName} onChange={e => setNewMember(p => ({ ...p, fullName: e.target.value }))} placeholder="Member name" />
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input type="email" value={newMember.email} onChange={e => setNewMember(p => ({ ...p, email: e.target.value }))} placeholder="member@example.com" />
                </div>
                <div className="space-y-2">
                  <Label>Password *</Label>
                  <Input type="password" value={newMember.password} onChange={e => setNewMember(p => ({ ...p, password: e.target.value }))} placeholder="Min 6 characters" />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={newMember.phone} onChange={e => setNewMember(p => ({ ...p, phone: e.target.value }))} placeholder="+880..." />
                </div>
                <Button className="w-full" onClick={handleAddMember} disabled={adding}>
                  {adding && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9 h-9" placeholder="Search members..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No members found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="text-left px-5 py-3 font-medium text-muted-foreground">Member</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Deposited</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Share %</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(member => {
                  const share = calculateSharePercentage(Number(member.total_deposited || 0), totalInvestment);
                  return (
                    <tr key={member.id} className="hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => navigate(`/members/${member.id}`)}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                            {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{member.full_name || 'Unnamed'}</p>
                            <p className="text-xs text-muted-foreground">{member.phone || 'No phone'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatBDT(Number(member.total_deposited || 0))}</td>
                      <td className="px-5 py-3 text-right">
                        <span className="font-semibold tabular-nums">{share.toFixed(1)}%</span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          {member.phone && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full text-primary hover:bg-primary/10"
                                onClick={() => handleInAppCall({ id: member.id, full_name: member.full_name, phone: member.phone })}
                                title="In-App Call"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full hover:bg-secondary"
                                onClick={() => handlePhoneCall(member.phone)}
                                title="Phone Call"
                              >
                                <Phone className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-full text-green-600 hover:bg-green-50"
                                onClick={() => handleWhatsApp(member.phone)}
                                title="WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={!!inAppCall} onOpenChange={(o) => !o && setInAppCall(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>In-App Call</DialogTitle>
          </DialogHeader>
          {inAppCall && (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <PhoneCall className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <div>
                <p className="text-lg font-semibold">{inAppCall.full_name}</p>
                <p className="text-sm text-muted-foreground">{inAppCall.phone}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connecting via app · {fmtDuration(callSeconds)}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={() => setCallMuted(m => !m)}
                  title={callMuted ? 'Unmute' : 'Mute'}
                >
                  {callMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={() => setInAppCall(null)}
                  title="End"
                >
                  <PhoneOff className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


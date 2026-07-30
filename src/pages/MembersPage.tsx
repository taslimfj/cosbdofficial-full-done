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
import { Plus, Phone, MessageCircle, Search, Loader2 } from 'lucide-react';
import { PhoneInput, phoneToDigits, DEFAULT_PHONE_PASSWORD } from '@/components/PhoneInput';
import { computeMissedInstallments, statusRowClass, type MissedStatus } from '@/lib/memberStatus';

interface MemberContact {
  id: string;
  full_name: string;
  phone: string | null;
}

export default function MembersPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [totalInvestment, setTotalInvestment] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newMember, setNewMember] = useState({ fullName: '', phone: '+880' });
  const [adding, setAdding] = useState(false);
  const [visibleCount, setVisibleCount] = useState(3);
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [memberBalances, setMemberBalances] = useState<Map<string, number>>(new Map());
  const [memberStatuses, setMemberStatuses] = useState<Map<string, MissedStatus>>(new Map());

  useEffect(() => { fetchMembers(); }, []);


  const fetchMembers = async () => {
    const [profRes, rolesRes, depositsRes, depMonthsRes, distRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_deleted', false).eq('is_customer', false),
      supabase.from('user_roles').select('user_id, role').eq('role', 'admin'),
      supabase.from('deposits').select('member_id, amount, month_year, created_at, status'),
      (supabase as any).rpc('get_member_deposit_months'),
      supabase.from('profit_distributions').select('member_id, amount'),
    ]);
    const profiles = profRes.data || [];
    const admins = new Set<string>((rolesRes.data || []).map((r: any) => r.user_id));
    setAdminIds(admins);

    const depositMap = new Map<string, number>();
    const profitMap = new Map<string, number>();
    for (const p of profiles) {
      depositMap.set(p.id, 0);
      profitMap.set(p.id, 0);
    }
    const depositsByMember = new Map<string, any[]>();
    (depositsRes.data || []).forEach((d: any) => {
      if (d.status === 'approved') {
        depositMap.set(d.member_id, (depositMap.get(d.member_id) || 0) + Number(d.amount || 0));
      }
      const arr = depositsByMember.get(d.member_id) || [];
      arr.push(d);
      depositsByMember.set(d.member_id, arr);
    });
    // Merge in approved deposit months visible to everyone (from RPC) so status colors show for all members, not just self/admin
    ((depMonthsRes as any)?.data || []).forEach((d: any) => {
      const arr = depositsByMember.get(d.member_id) || [];
      arr.push({ month_year: d.month_year, created_at: d.created_at, status: d.status });
      depositsByMember.set(d.member_id, arr);
    });
    (distRes.data || []).forEach((d: any) => {
      profitMap.set(d.member_id, (profitMap.get(d.member_id) || 0) + Number(d.amount || 0));
    });

    const statusMap = new Map<string, MissedStatus>();
    for (const p of profiles) {
      statusMap.set(p.id, computeMissedInstallments(depositsByMember.get(p.id) || [], p.created_at));
    }
    setMemberStatuses(statusMap);

    const balanceMap = new Map<string, number>();
    let total = 0;
    for (const p of profiles) {
      const balance = (depositMap.get(p.id) || 0) + (profitMap.get(p.id) || 0);
      balanceMap.set(p.id, balance);
      total += balance;
    }
    setTotalInvestment(total);
    setMemberBalances(balanceMap);

    // Self first, then admins, then by balance desc
    const sorted = [...profiles].sort((a, b) => {
      const aSelf = user?.id && a.id === user.id ? 1 : 0;
      const bSelf = user?.id && b.id === user.id ? 1 : 0;
      if (aSelf !== bSelf) return bSelf - aSelf;
      const aAdmin = admins.has(a.id) ? 1 : 0;
      const bAdmin = admins.has(b.id) ? 1 : 0;
      if (aAdmin !== bAdmin) return bAdmin - aAdmin;
      return (balanceMap.get(b.id) || 0) - (balanceMap.get(a.id) || 0);
    });
    setMembers(sorted);
    setLoading(false);
  };

  const handleAddMember = async () => {
    if (!newMember.fullName.trim() || !phoneToDigits(newMember.phone)) {
      toast.error('Full name and phone number are required');
      return;
    }
    setAdding(true);

    const defaultPassword = DEFAULT_PHONE_PASSWORD;

    const { data, error } = await supabase.functions.invoke('create-member', {
      body: { fullName: newMember.fullName.trim(), phone: newMember.phone.trim() },
    });

    if (error || (data as any)?.error) {
      setAdding(false);
      toast.error((data as any)?.error || error?.message || 'Member create failed');
      return;
    }

    setAdding(false);
    toast.success(`Member created. Login: ${newMember.phone} · Password: ${defaultPassword}`);
    setShowAddDialog(false);
    setNewMember({ fullName: '', phone: '+880' });
    setTimeout(fetchMembers, 800);
  };


  const handlePhoneCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
  };

  const handleWhatsApp = (number: string) => {
    const cleaned = number.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${cleaned.startsWith('+') ? cleaned.slice(1) : cleaned}`, '_blank');
  };




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
          <p className="text-sm text-muted-foreground mt-1">{members.length} members · {formatBDT(totalInvestment)} total balance</p>
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
                  <Label>Phone Number *</Label>
                  <PhoneInput value={newMember.phone} onChange={(v) => setNewMember(p => ({ ...p, phone: v }))} />
                  <p className="text-xs text-muted-foreground">
                    Phone number works as the login ID. Default password: <span className="font-mono font-semibold">{DEFAULT_PHONE_PASSWORD}</span>
                  </p>
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
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Total Investment</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Share %</th>
                  <th className="text-right px-5 py-3 font-medium text-muted-foreground">Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.slice(0, visibleCount).map(member => {
                  const balance = memberBalances.get(member.id) || 0;
                  const share = calculateSharePercentage(balance, totalInvestment);
                  const isAdmin = adminIds.has(member.id);
                  const status = memberStatuses.get(member.id) || { missed: 0, level: 'normal' as const, message: null };
                  return (
                    <tr key={member.id} className={`${statusRowClass(status.level)} transition-colors cursor-pointer`} onClick={() => navigate(`/members/${member.id}`)} title={status.message || undefined}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary overflow-hidden">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt={`${member.full_name || 'Member'} photo`} className="h-full w-full object-cover" />
                            ) : (
                              member.full_name?.charAt(0)?.toUpperCase() || '?'
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-foreground">{member.full_name || 'Unnamed'}</p>
                              {isAdmin && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">ADMIN</span>}
                              {status.missed > 0 && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  status.level === 'warn' ? 'bg-yellow-200 text-yellow-900' :
                                  status.level === 'alert' ? 'bg-pink-200 text-pink-900' :
                                  'bg-red-200 text-red-900'
                                }`}>
                                  {status.missed}+ মাস বকেয়া
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{member.phone || 'No phone'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums">{formatBDT(balance)}</td>
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
            {filtered.length > visibleCount && (
              <button
                onClick={() => setVisibleCount(c => c + 10)}
                className="w-full py-3 text-xs font-medium text-primary hover:bg-primary/5 border-t border-border"
              >
                See more ({filtered.length - visibleCount} বাকি)
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  );
}


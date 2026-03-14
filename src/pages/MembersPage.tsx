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

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('full_name');
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
    const { error } = await supabase.auth.signUp({
      email: newMember.email,
      password: newMember.password,
      options: { data: { full_name: newMember.fullName } },
    });
    setAdding(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Member account created');
      setShowAddDialog(false);
      setNewMember({ email: '', password: '', fullName: '', phone: '' });
      setTimeout(fetchMembers, 1000);
    }
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
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                          {member.phone && (
                            <>
                              <a href={`tel:${member.phone}`} className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground">
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <a href={`https://wa.me/${member.phone?.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener" className="p-1.5 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground">
                                <MessageCircle className="w-3.5 h-3.5" />
                              </a>
                            </>
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
    </div>
  );
}

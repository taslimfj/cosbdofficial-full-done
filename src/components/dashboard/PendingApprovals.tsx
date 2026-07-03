import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface PendingDeposit {
  id: string;
  amount: number;
  member_id: string;
  created_at: string;
  member_name?: string;
}

interface PendingLoan {
  id: string;
  requested_amount: number;
  member_id: string;
  created_at: string;
  member_name?: string;
}

export function PendingApprovals() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [loans, setLoans] = useState<PendingLoan[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    const [depRes, loanRes, profilesRes] = await Promise.all([
      supabase.from('deposits').select('id, amount, member_id, created_at').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('member_loans').select('id, requested_amount, member_id, created_at').eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name'),
    ]);

    const profileMap = new Map((profilesRes.data || []).map(p => [p.id, p.full_name]));

    setDeposits((depRes.data || []).map(d => ({ ...d, member_name: profileMap.get(d.member_id) || 'Unknown' })));
    setLoans((loanRes.data || []).map(l => ({ ...l, member_name: profileMap.get(l.member_id) || 'Unknown' })));
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('pending-approvals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loans' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const approveDeposit = async (id: string, amount: number, memberId: string) => {
    const { error } = await supabase.from('deposits').update({ status: 'approved' }).eq('id', id);
    if (error) return toast.error('Failed to approve deposit');

    toast.success('Deposit approved');
    fetchData();
  };

  const rejectDeposit = async (id: string) => {
    const { error } = await supabase.from('deposits').update({ status: 'rejected' }).eq('id', id);
    if (error) return toast.error('Failed to reject');
    toast.success('Deposit rejected');
    fetchData();
  };

  const approveLoan = async (id: string, amount: number) => {
    const { error } = await supabase.from('member_loans').update({ status: 'approved', approved_amount: amount }).eq('id', id);
    if (error) return toast.error('Failed to approve loan');
    toast.success('Loan approved');
    fetchData();
  };

  const rejectLoan = async (id: string) => {
    const { error } = await supabase.from('member_loans').update({ status: 'rejected' }).eq('id', id);
    if (error) return toast.error('Failed to reject');
    toast.success('Loan rejected');
    fetchData();
  };

  if (role !== 'admin') return null;

  const total = deposits.length + loans.length;

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pending Approvals</h3>
        </div>
        {total > 0 && (
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">{total}</span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : total === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No pending requests</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {deposits.map(d => (
            <div key={d.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{d.member_name}</p>
                <p className="text-xs text-muted-foreground">Deposit · {formatBDT(Number(d.amount))}</p>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => approveDeposit(d.id, Number(d.amount), d.member_id)}>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => rejectDeposit(d.id)}>
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
          {loans.map(l => (
            <div key={l.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{l.member_name}</p>
                <p className="text-xs text-muted-foreground">Loan · {formatBDT(Number(l.requested_amount))}</p>
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={() => approveLoan(l.id, Number(l.requested_amount))}>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" className="h-8" onClick={() => rejectLoan(l.id)}>
                <XCircle className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

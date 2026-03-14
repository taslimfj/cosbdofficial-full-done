import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Loader2, HandCoins } from 'lucide-react';

export default function MemberLoansPage() {
  const { role, user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');

  useEffect(() => { fetchLoans(); }, []);

  const fetchLoans = async () => {
    let query = supabase.from('member_loans').select('*, member:profiles!member_loans_member_id_fkey(*)').order('created_at', { ascending: false });
    const { data } = await query;
    setLoans(data || []);
    setLoading(false);
  };

  const handleRequest = async () => {
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    setSubmitting(true);
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 3);
    const { error } = await supabase.from('member_loans').insert({
      member_id: user?.id,
      requested_amount: amount,
      due_date: dueDate.toISOString().split('T')[0],
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan request submitted');
    setShowDialog(false);
    setRequestAmount('');
    fetchLoans();
  };

  const handleApprove = async (loanId: string, amount: number) => {
    const { error } = await supabase.from('member_loans').update({ status: 'approved', approved_amount: amount }).eq('id', loanId);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan approved');
    fetchLoans();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Member Loans</h1>
          <p className="text-sm text-muted-foreground mt-1">Interest-free loans from community fund</p>
        </div>
        {role === 'member' && (
          <Dialog open={showDialog} onOpenChange={setShowDialog}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Request Loan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request Interest-Free Loan</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Amount (৳)</Label>
                  <Input type="number" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} placeholder="0" />
                </div>
                <p className="text-xs text-muted-foreground">Repayment deadline: 3 months. If not repaid, amount will be deducted from your balance.</p>
                <Button className="w-full" onClick={handleRequest} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit Request
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        {loans.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No loan requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {loans.map(loan => (
              <div key={loan.id} className="flex items-center gap-4 px-5 py-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {loan.member?.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{loan.member?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested: {formatBDT(Number(loan.requested_amount))}
                    {loan.approved_amount > 0 && ` · Approved: ${formatBDT(Number(loan.approved_amount))}`}
                    {loan.due_date && ` · Due: ${format(new Date(loan.due_date), 'MMM d, yyyy')}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    loan.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    loan.status === 'repaid' ? 'bg-secondary text-muted-foreground' :
                    'bg-warning/10 text-warning'
                  }`}>{loan.status}</span>
                  {role === 'admin' && loan.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => handleApprove(loan.id, Number(loan.requested_amount))}>
                      Approve
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

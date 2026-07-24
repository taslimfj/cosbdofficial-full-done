import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Loader2, HandCoins, ChevronRight, Users } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateMemberLoansPDF } from '@/lib/pdfGenerator';

export default function MemberLoansPage() {
  const { role, user } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const processOverdueLoans = async (loanRows: any[]) => {
    if (role !== 'admin') return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = loanRows.filter(l => {
      if (l.status !== 'approved') return false;
      const approved = Number(l.approved_amount || 0);
      const repaid = Number(l.repaid_amount || 0);
      if (approved <= 0 || repaid >= approved) return false;
      if (!l.due_date) return false;
      return new Date(l.due_date) < today;
    });
    if (overdue.length === 0) return false;
    for (const loan of overdue) {
      const approved = Number(loan.approved_amount || 0);
      const repaid = Number(loan.repaid_amount || 0);
      const remaining = Math.max(0, approved - repaid);
      const { data: prof } = await supabase.from('profiles').select('total_deposited').eq('id', loan.member_id).single();
      const newTotal = Math.max(0, Number(prof?.total_deposited || 0) - remaining);
      await supabase.from('profiles').update({ total_deposited: newTotal }).eq('id', loan.member_id);
      await supabase.from('member_loans').update({
        status: 'repaid',
        repaid_amount: approved,
        defaulted: true,
      }).eq('id', loan.id);
    }
    toast.message(`${overdue.length}টি overdue loan member balance থেকে withdraw হিসেবে কাটা হয়েছে`);
    return true;
  };

  const fetchLoans = async () => {
    const { data } = await supabase
      .from('member_loans')
      .select('*, member:profiles!member_loans_member_id_fkey(*)')
      .order('created_at', { ascending: true });
    const loanRows = data || [];
    const changed = await processOverdueLoans(loanRows);
    if (changed) {
      const refetch = await supabase
        .from('member_loans')
        .select('*, member:profiles!member_loans_member_id_fkey(*)')
        .order('created_at', { ascending: true });
      setLoans(refetch.data || []);
    } else {
      setLoans(loanRows);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLoans(); }, []);

  const handleRequest = async () => {
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) { toast.error('সঠিক পরিমাণ লিখুন'); return; }
    if (!requestReason.trim()) { toast.error('লোনের কারণ লিখুন'); return; }
    setSubmitting(true);
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 3);
    const { error } = await supabase.from('member_loans').insert({
      member_id: user?.id,
      requested_amount: amount,
      reason: requestReason.trim(),
      due_date: dueDate.toISOString().split('T')[0],
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan request submitted');
    setShowDialog(false);
    setRequestAmount('');
    setRequestReason('');
    fetchLoans();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  // Group loans by member
  const byMember = new Map<string, { member: any; loans: any[] }>();
  loans.forEach(l => {
    if (!l.member_id) return;
    if (!byMember.has(l.member_id)) byMember.set(l.member_id, { member: l.member, loans: [] });
    byMember.get(l.member_id)!.loans.push(l);
  });

  const memberCards = Array.from(byMember.entries()).map(([memberId, { member, loans: mLoans }]) => {
    const ongoing = mLoans.filter(l => l.status === 'approved' || l.status === 'pending');
    const paid = mLoans.filter(l => l.status === 'repaid');
    const rejected = mLoans.filter(l => l.status === 'rejected');
    const totalRemaining = ongoing.reduce((s, l) =>
      s + Math.max(0, Number(l.approved_amount || 0) - Number(l.repaid_amount || 0)), 0);
    const nextDue = ongoing
      .filter(l => l.status === 'approved' && l.due_date)
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
    return { memberId, member, mLoans, ongoing, paid, rejected, totalRemaining, nextDue };
  }).sort((a, b) => {
    // Logged-in member's own card always first
    const aSelf = user?.id && a.memberId === user.id ? 1 : 0;
    const bSelf = user?.id && b.memberId === user.id ? 1 : 0;
    if (aSelf !== bSelf) return bSelf - aSelf;
    return (b.ongoing.length - a.ongoing.length) || (b.totalRemaining - a.totalRemaining);
  });


  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Member Loans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === 'admin'
              ? 'প্রত্যেক member-এর নিজস্ব loan profile · click করে ভিতরে যান'
              : 'আপনার নিজের loan profile'}
          </p>
        </div>
        <div className="flex gap-2">
          {role === 'admin' && <PdfPeriodButton onDownload={(p) => generateMemberLoansPDF(loans, p)} />}
          {(role === 'member' || role === 'admin') && (
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
                  <div className="space-y-2">
                    <Label>কারণ *</Label>
                    <Textarea
                      value={requestReason}
                      onChange={e => setRequestReason(e.target.value)}
                      placeholder="কী কারণে লোন প্রয়োজন তা সংক্ষেপে লিখুন"
                      rows={3}
                    />
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
      </div>

      {memberCards.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-subtle">
          <HandCoins className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">এখনো কোনো loan request নেই।</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {memberCards.map(mc => (
            <button
              key={mc.memberId}
              onClick={() => navigate(`/member-loans/m/${mc.memberId}`)}
              className="text-left bg-card border border-border rounded-xl p-5 shadow-subtle hover:shadow-card hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                  {mc.member?.full_name?.charAt(0)?.toUpperCase() || <Users className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{mc.member?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{mc.mLoans.length}টি loan মোট</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <StatChip label="Ongoing" value={mc.ongoing.length} tone="warning" />
                <StatChip label="Paid" value={mc.paid.length} tone="success" />
                <StatChip label="Rejected" value={mc.rejected.length} tone="danger" />
              </div>

              <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Due:</span>
                  <span className={`font-semibold tabular-nums ${mc.totalRemaining > 0 ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'}`}>
                    {formatBDT(mc.totalRemaining)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Next Due:</span>
                  <span className="font-medium text-foreground">
                    {mc.nextDue?.due_date ? format(new Date(mc.nextDue.due_date), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' }) {
  const cls =
    tone === 'success' ? 'bg-emerald-50 text-emerald-700' :
    tone === 'warning' ? 'bg-warning/10 text-[hsl(var(--warning))]' :
    'bg-destructive/10 text-destructive';
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${cls}`}>
      <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</p>
    </div>
  );
}

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
import { Plus, Loader2, HandCoins, Check, ChevronRight } from 'lucide-react';
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
  const [showAllOngoing, setShowAllOngoing] = useState(false);
  const [showAllPaid, setShowAllPaid] = useState(false);

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
      .order('created_at', { ascending: false });
    const loanRows = data || [];
    const changed = await processOverdueLoans(loanRows);
    if (changed) {
      const refetch = await supabase
        .from('member_loans')
        .select('*, member:profiles!member_loans_member_id_fkey(*)')
        .order('created_at', { ascending: false });
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

  const sortByOldest = (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  const repaidLoans = loans.filter(l => l.status === 'repaid').sort(sortByOldest);
  const ongoingLoans = loans.filter(l => l.status !== 'repaid').sort(sortByOldest);
  const visibleOngoing = showAllOngoing ? ongoingLoans : ongoingLoans.slice(0, 5);
  const visiblePaid = showAllPaid ? repaidLoans : repaidLoans.slice(0, 5);

  const renderLoanRow = (loan: any) => {
    const approved = Number(loan.approved_amount || 0);
    const repaid = Number(loan.repaid_amount || 0);
    const remaining = Math.max(0, approved - repaid);
    return (
      <button
        key={loan.id}
        onClick={() => navigate(`/member-loans/${loan.id}`)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-secondary/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
          {loan.member?.full_name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{loan.member?.full_name || 'Unknown'}</p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              loan.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
              loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
              loan.status === 'repaid' ? 'bg-secondary text-muted-foreground' :
              'bg-warning/10 text-warning'
            }`}>{loan.status}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {approved > 0
              ? `Approved: ${formatBDT(approved)} · Paid: ${formatBDT(repaid)}${loan.status === 'approved' ? ` · Remaining: ${formatBDT(remaining)}` : ''}`
              : `Requested: ${formatBDT(Number(loan.requested_amount))}`}
            {loan.due_date && ` · Due: ${format(new Date(loan.due_date), 'MMM d, yyyy')}`}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Member Loans</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === 'admin' ? 'সব মেম্বারের interest-free loan' : 'আপনার নিজের loan সমূহ'}
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

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30">
          <h2 className="text-sm font-semibold text-foreground">Ongoing Loans</h2>
          <p className="text-xs text-muted-foreground">যেগুলো এখনো সম্পূর্ণ পরিশোধ হয়নি · প্রতিটি লোনের profile-এ ঢুকতে click করুন</p>
        </div>
        {ongoingLoans.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">কোনো চলমান লোন নেই।</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visibleOngoing.map(renderLoanRow)}
            {ongoingLoans.length > 5 && (
              <div className="px-5 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllOngoing(v => !v)}>
                  {showAllOngoing ? 'কম দেখুন' : `আরও দেখুন (${ongoingLoans.length - 5}টি)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30">
          <h2 className="text-sm font-semibold text-foreground">Paid / Completed Loans</h2>
          <p className="text-xs text-muted-foreground">যেগুলো সম্পূর্ণ পরিশোধ হয়ে গেছে</p>
        </div>
        {repaidLoans.length === 0 ? (
          <div className="p-12 text-center">
            <Check className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">এখনো কোনো লোন সম্পূর্ণ পরিশোধ হয়নি।</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visiblePaid.map(renderLoanRow)}
            {repaidLoans.length > 5 && (
              <div className="px-5 py-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setShowAllPaid(v => !v)}>
                  {showAllPaid ? 'কম দেখুন' : `আরও দেখুন (${repaidLoans.length - 5}টি)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

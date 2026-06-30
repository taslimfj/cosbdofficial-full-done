import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Loader2, HandCoins, Wallet } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateMemberLoansPDF } from '@/lib/pdfGenerator';

export default function MemberLoansPage() {
  const { role, user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');

  // Payment dialog
  const [payLoan, setPayLoan] = useState<any | null>(null);
  const [payForm, setPayForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    method: 'bkash',
    txn: '',
  });
  const [paying, setPaying] = useState(false);

  useEffect(() => { fetchLoans(); }, []);

  const fetchLoans = async () => {
    const { data } = await supabase
      .from('member_loans')
      .select('*, member:profiles!member_loans_member_id_fkey(*)')
      .order('created_at', { ascending: false });
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

  const openPay = (loan: any) => {
    const approved = Number(loan.approved_amount || 0);
    const repaid = Number(loan.repaid_amount || 0);
    const remaining = Math.max(0, approved - repaid);
    setPayLoan(loan);
    setPayForm({
      date: new Date().toISOString().split('T')[0],
      amount: String(remaining || ''),
      method: 'bkash',
      txn: '',
    });
  };

  const handlePay = async () => {
    if (!payLoan) return;
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { toast.error('সঠিক পরিমাণ লিখুন'); return; }
    if (!payForm.txn.trim()) { toast.error('Transaction ID দিন'); return; }
    const approved = Number(payLoan.approved_amount || 0);
    const alreadyRepaid = Number(payLoan.repaid_amount || 0);
    const remaining = Math.max(0, approved - alreadyRepaid);
    if (amt > remaining) { toast.error(`সর্বোচ্চ ৳${remaining.toLocaleString()} পরিশোধ করা যাবে`); return; }

    setPaying(true);
    const { error: repErr } = await supabase.from('member_loan_repayments').insert({
      loan_id: payLoan.id,
      amount: amt,
      payment_method: payForm.method,
      transaction_number: payForm.txn.trim(),
      created_at: new Date(payForm.date).toISOString(),
    });
    if (repErr) { setPaying(false); toast.error(repErr.message); return; }

    const newRepaid = alreadyRepaid + amt;
    const fullyRepaid = newRepaid >= approved;
    const { error: updErr } = await supabase.from('member_loans').update({
      repaid_amount: newRepaid,
      status: fullyRepaid ? 'repaid' : payLoan.status,
    }).eq('id', payLoan.id);
    setPaying(false);
    if (updErr) { toast.error(updErr.message); return; }

    toast.success(fullyRepaid ? 'লোন সম্পূর্ণ পরিশোধ হয়েছে' : 'পরিশোধ রেকর্ড হয়েছে');
    setPayLoan(null);
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
        <div className="flex gap-2">
          <PdfPeriodButton onDownload={(p) => generateMemberLoansPDF(loans, p)} />
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
        {loans.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No loan requests yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {loans.map(loan => {
              const approved = Number(loan.approved_amount || 0);
              const repaid = Number(loan.repaid_amount || 0);
              const remaining = Math.max(0, approved - repaid);
              const isBorrower = loan.member_id === user?.id;
              const canPay = isBorrower && loan.status === 'approved' && remaining > 0;
              return (
                <div key={loan.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    {loan.member?.full_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{loan.member?.full_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">
                      Requested: {formatBDT(Number(loan.requested_amount))}
                      {approved > 0 && ` · Approved: ${formatBDT(approved)}`}
                      {repaid > 0 && ` · Repaid: ${formatBDT(repaid)}`}
                      {loan.status === 'approved' && remaining > 0 && ` · Remaining: ${formatBDT(remaining)}`}
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
                    {canPay && (
                      <Button size="sm" onClick={() => openPay(loan)} className="gap-1">
                        <Wallet className="w-3.5 h-3.5" /> Payment
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment dialog */}
      <Dialog open={!!payLoan} onOpenChange={(o) => !o && setPayLoan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>লোন পরিশোধ</DialogTitle>
          </DialogHeader>
          {payLoan && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Approved: {formatBDT(Number(payLoan.approved_amount || 0))} · Remaining:{' '}
                <span className="text-foreground font-semibold">
                  {formatBDT(Math.max(0, Number(payLoan.approved_amount || 0) - Number(payLoan.repaid_amount || 0)))}
                </span>
              </div>
              <div className="space-y-2">
                <Label>তারিখ</Label>
                <Input type="date" value={payForm.date} onChange={e => setPayForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>পরিমাণ (৳)</Label>
                <Input type="number" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>পেমেন্ট পদ্ধতি</Label>
                <Select value={payForm.method} onValueChange={v => setPayForm(p => ({ ...p, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transaction ID</Label>
                <Input value={payForm.txn} onChange={e => setPayForm(p => ({ ...p, txn: e.target.value }))} placeholder="TXN-XXXXX" />
              </div>
              <Button className="w-full" onClick={handlePay} disabled={paying}>
                {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} পরিশোধ রেকর্ড করুন
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

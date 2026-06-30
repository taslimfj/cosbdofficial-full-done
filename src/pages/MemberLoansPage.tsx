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
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Loader2, HandCoins, Wallet, Check, X, RotateCcw, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateMemberLoansPDF } from '@/lib/pdfGenerator';

export default function MemberLoansPage() {
  const { role, user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [showAllOngoing, setShowAllOngoing] = useState(false);
  const [showAllPaid, setShowAllPaid] = useState(false);

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
    const [loansRes, repsRes] = await Promise.all([
      supabase
        .from('member_loans')
        .select('*, member:profiles!member_loans_member_id_fkey(*)')
        .order('created_at', { ascending: false }),
      supabase
        .from('member_loan_repayments')
        .select('*')
        .order('created_at', { ascending: false }),
    ]);
    setLoans(loansRes.data || []);
    setRepayments(repsRes.data || []);
    setLoading(false);
  };

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

  const handleApproveLoan = async (loanId: string, amount: number) => {
    const { error } = await supabase.from('member_loans').update({ status: 'approved', approved_amount: amount }).eq('id', loanId);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan approved');
    fetchLoans();
  };

  const openPay = (loan: any) => {
    const approved = Number(loan.approved_amount || 0);
    const repaid = Number(loan.repaid_amount || 0);
    const pendingAmt = repayments
      .filter(r => r.loan_id === loan.id && r.status === 'pending')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const remaining = Math.max(0, approved - repaid - pendingAmt);
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
    const pendingAmt = repayments
      .filter(r => r.loan_id === payLoan.id && r.status === 'pending')
      .reduce((s, r) => s + Number(r.amount || 0), 0);
    const remaining = Math.max(0, approved - alreadyRepaid - pendingAmt);
    if (amt > remaining) { toast.error(`সর্বোচ্চ ৳${remaining.toLocaleString()} পরিশোধ করা যাবে`); return; }

    setPaying(true);
    const { error } = await supabase.from('member_loan_repayments').insert({
      loan_id: payLoan.id,
      amount: amt,
      payment_method: payForm.method,
      transaction_number: payForm.txn.trim(),
      status: 'pending',
      created_at: new Date(payForm.date).toISOString(),
    });
    setPaying(false);
    if (error) { toast.error(error.message); return; }

    toast.success('পরিশোধ পাঠানো হয়েছে — admin approval-এর অপেক্ষায়');
    setPayLoan(null);
    fetchLoans();
  };

  const setRepaymentStatus = async (rep: any, newStatus: 'approved' | 'rejected' | 'pending') => {
    const loan = loans.find(l => l.id === rep.loan_id);
    if (!loan) return;
    const oldEff = rep.status === 'approved' ? Number(rep.amount || 0) : 0;
    const newEff = newStatus === 'approved' ? Number(rep.amount || 0) : 0;
    const delta = newEff - oldEff;

    const { error: upRepErr } = await supabase
      .from('member_loan_repayments')
      .update({
        status: newStatus,
        approved_at: newStatus === 'approved' ? new Date().toISOString() : null,
        approved_by: newStatus === 'approved' ? user?.id : null,
      })
      .eq('id', rep.id);
    if (upRepErr) { toast.error(upRepErr.message); return; }

    if (delta !== 0 || loan.status === 'repaid') {
      const approved = Number(loan.approved_amount || 0);
      const newRepaid = Math.max(0, Number(loan.repaid_amount || 0) + delta);
      let nextStatus = loan.status;
      if (newRepaid >= approved && approved > 0) nextStatus = 'repaid';
      else if (loan.status === 'repaid' && newRepaid < approved) nextStatus = 'approved';
      const { error: upLoanErr } = await supabase
        .from('member_loans')
        .update({ repaid_amount: newRepaid, status: nextStatus })
        .eq('id', loan.id);
      if (upLoanErr) { toast.error(upLoanErr.message); return; }
    }

    toast.success(
      newStatus === 'approved' ? 'Paid হিসেবে চিহ্নিত হয়েছে' :
      newStatus === 'rejected' ? 'Reject করা হয়েছে' :
      'Pending করা হয়েছে'
    );
    fetchLoans();
  };

  const handleDeleteLoan = async (loan: any) => {
    if (loan.status !== 'repaid') { toast.error('শুধু পরিশোধিত লোন delete করা যাবে'); return; }
    const isBorrower = loan.member_id === user?.id;
    if (!(role === 'admin' || isBorrower)) { toast.error('আপনার অনুমতি নেই'); return; }
    const { error: repErr } = await supabase.from('member_loan_repayments').delete().eq('loan_id', loan.id);
    if (repErr) { toast.error(repErr.message); return; }
    const { error } = await supabase.from('member_loans').delete().eq('id', loan.id);
    if (error) { toast.error(error.message); return; }
    toast.success('লোন delete হয়েছে');
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

      {(() => {
        const sortByOldest = (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        const repaidLoans = loans.filter(l => l.status === 'repaid').sort(sortByOldest);
        const ongoingLoans = loans.filter(l => l.status !== 'repaid').sort(sortByOldest);
        const visibleOngoing = showAllOngoing ? ongoingLoans : ongoingLoans.slice(0, 5);
        const visiblePaid = showAllPaid ? repaidLoans : repaidLoans.slice(0, 5);

        const renderLoanCard = (loan: any) => {
          const approved = Number(loan.approved_amount || 0);
          const repaid = Number(loan.repaid_amount || 0);
          const loanReps = repayments.filter(r => r.loan_id === loan.id);
          const pendingReps = loanReps.filter(r => r.status === 'pending');
          const pendingAmt = pendingReps.reduce((s, r) => s + Number(r.amount || 0), 0);
          const remaining = Math.max(0, approved - repaid - pendingAmt);
          const isBorrower = loan.member_id === user?.id;
          const canPay = isBorrower && loan.status === 'approved' && remaining > 0;
          return (
            <div key={loan.id} className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-4">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {loan.member?.full_name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{loan.member?.full_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested: {formatBDT(Number(loan.requested_amount))}
                    {approved > 0 && ` · Approved: ${formatBDT(approved)}`}
                    {repaid > 0 && ` · Paid: ${formatBDT(repaid)}`}
                    {pendingAmt > 0 && ` · Pending approval: ${formatBDT(pendingAmt)}`}
                    {loan.status === 'approved' && remaining > 0 && ` · Remaining: ${formatBDT(remaining)}`}
                    {loan.due_date && ` · Due: ${format(new Date(loan.due_date), 'MMM d, yyyy')}`}
                  </p>
                  {loan.reason && (
                    <p className="text-xs text-muted-foreground/80 mt-0.5 italic">কারণ: {loan.reason}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    loan.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                    loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    loan.status === 'repaid' ? 'bg-secondary text-muted-foreground' :
                    'bg-warning/10 text-warning'
                  }`}>{loan.status}</span>
                  {role === 'admin' && loan.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => handleApproveLoan(loan.id, Number(loan.requested_amount))}>
                      Approve
                    </Button>
                  )}
                  {canPay && (
                    <Button size="sm" onClick={() => openPay(loan)} className="gap-1">
                      <Wallet className="w-3.5 h-3.5" /> Payment
                    </Button>
                  )}
                  {loan.status === 'repaid' && (role === 'admin' || loan.member_id === user?.id) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 px-2 text-destructive border-destructive/30 gap-1">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>এই পরিশোধিত লোনটি delete করবেন?</AlertDialogTitle>
                          <AlertDialogDescription>
                            এই কাজটি undo করা যাবে না। লোন এবং এর সব payment record মুছে যাবে।
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>বাতিল</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDeleteLoan(loan)} className="bg-destructive hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>

              {loanReps.length > 0 && (
                <div className="ml-12 space-y-1">
                  {loanReps.map(r => (
                    <div key={r.id} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        {format(new Date(r.created_at), 'MMM d, yyyy')} · {formatBDT(Number(r.amount))}
                        {r.payment_method && ` · ${r.payment_method}`}
                        {r.transaction_number && ` · ${r.transaction_number}`}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded font-medium ${
                        r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                        r.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                        'bg-warning/10 text-warning'
                      }`}>
                        {r.status === 'pending' ? 'pending approval' : r.status === 'approved' ? 'paid' : 'rejected'}
                      </span>
                      {role === 'admin' && (
                        <div className="flex items-center gap-1 ml-auto">
                          {r.status !== 'approved' && (
                            <Button size="sm" variant="outline" className="h-6 px-2 gap-1" onClick={() => setRepaymentStatus(r, 'approved')}>
                              <Check className="w-3 h-3" /> {r.status === 'rejected' ? 'Mark Paid' : 'Approve'}
                            </Button>
                          )}
                          {r.status !== 'rejected' && (
                            <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-destructive border-destructive/30" onClick={() => setRepaymentStatus(r, 'rejected')}>
                              <X className="w-3 h-3" /> Reject
                            </Button>
                          )}
                          {r.status !== 'pending' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1" onClick={() => setRepaymentStatus(r, 'pending')} title="Move back to pending">
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary/30">
                <h2 className="text-sm font-semibold text-foreground">Ongoing Loans</h2>
                <p className="text-xs text-muted-foreground">যেগুলো এখনো সম্পূর্ণ পরিশোধ হয়নি</p>
              </div>
              {ongoingLoans.length === 0 ? (
                <div className="p-12 text-center">
                  <HandCoins className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">কোনো চলমান লোন নেই।</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {visibleOngoing.map(renderLoanCard)}
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
                  {visiblePaid.map(renderLoanCard)}
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
      })()}



      <Dialog open={!!payLoan} onOpenChange={(o) => !o && setPayLoan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>লোন পরিশোধ</DialogTitle>
          </DialogHeader>
          {payLoan && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                Approved: {formatBDT(Number(payLoan.approved_amount || 0))} · Paid:{' '}
                {formatBDT(Number(payLoan.repaid_amount || 0))}
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
              <p className="text-xs text-muted-foreground">
                নোট: পরিশোধ admin approval-এর পরই paid হিসেবে গণ্য হবে।
              </p>
              <Button className="w-full" onClick={handlePay} disabled={paying}>
                {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} পরিশোধ পাঠান
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { ArrowLeft, Phone, MessageCircle, Loader2, Plus, Download, Trash2, MinusCircle, PhoneCall, PhoneOff, Mic, MicOff } from 'lucide-react';
import { generateMemberPDF } from '@/lib/pdfGenerator';

import { calculateSharePercentage } from '@/lib/finance';

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role, user, loading: authLoading } = useAuth();
  const [member, setMember] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inAppCall, setInAppCall] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [callMuted, setCallMuted] = useState(false);
  const [outstandingLoans, setOutstandingLoans] = useState<any[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [repaymentInput, setRepaymentInput] = useState('');
  const [depositLimit, setDepositLimit] = useState(3);
  const [distLimit, setDistLimit] = useState(3);
  const [totalAllBalances, setTotalAllBalances] = useState(0);
  const [isTargetAdmin, setIsTargetAdmin] = useState(false);
  const [togglingAdmin, setTogglingAdmin] = useState(false);
  


  useEffect(() => {
    if (!inAppCall) return;
    const t = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [inAppCall]);

  const startInAppCall = () => { setCallSeconds(0); setCallMuted(false); setInAppCall(true); };
  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  useEffect(() => {
    if (!id) return;
    fetchData();
  }, [id]);

  const fetchData = async () => {
    const [profileRes, depositsRes, distRes, loansRes, allDepRes, allDistRes, roleRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id!).single(),
      supabase.from('deposits').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
      supabase.from('profit_distributions').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
      supabase.from('member_loans').select('*').eq('member_id', id!).in('status', ['approved', 'pending']),
      supabase.from('deposits').select('amount').eq('status', 'approved'),
      supabase.from('profit_distributions').select('amount'),
      supabase.from('user_roles').select('role').eq('user_id', id!).eq('role', 'admin').maybeSingle(),
    ]);
    const totalDep = (allDepRes.data || []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    const totalProf = (allDistRes.data || []).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    setTotalAllBalances(totalDep + totalProf);
    setIsTargetAdmin(!!roleRes.data);
    setMember(profileRes.data);
    setDeposits(depositsRes.data || []);

    // Enrich profit distributions with source project/loan name + code
    const dists = distRes.data || [];
    const projectIds = Array.from(new Set(dists.filter(d => d.source_type === 'project' && d.source_id).map(d => d.source_id)));
    const loanIds = Array.from(new Set(dists.filter(d => d.source_type === 'islamic_loan' && d.source_id).map(d => d.source_id)));
    const sourceMap = new Map<string, any>();
    if (projectIds.length > 0) {
      const { data: projs } = await supabase.from('projects').select('id, name, code').in('id', projectIds);
      (projs || []).forEach((p: any) => sourceMap.set(p.id, { kind: 'project', name: p.name, code: p.code }));
    }
    if (loanIds.length > 0) {
      const { data: loans } = await (supabase as any).from('islamic_loans_public').select('id, code').in('id', loanIds);
      (loans || []).forEach((l: any) => sourceMap.set(l.id, { kind: 'loan', name: 'Islamic Loan', code: l.code }));
    }
    setDistributions(dists.map((d: any) => ({ ...d, source: sourceMap.get(d.source_id) || null })));

    // Outstanding = approved - repaid, ignore pending zero
    const outstanding = (loansRes.data || []).filter(l => {
      const owed = Number(l.approved_amount || l.requested_amount || 0) - Number(l.repaid_amount || 0);
      return owed > 0;
    });
    setOutstandingLoans(outstanding);
    setLoading(false);
  };

  const outstandingTotal = outstandingLoans.reduce(
    (s, l) => s + (Number(l.approved_amount || l.requested_amount || 0) - Number(l.repaid_amount || 0)),
    0,
  );

  const handleAddDeposit = async () => {
    const amount = parseFloat(depositForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!depositForm.transactionNumber.trim()) { toast.error('Enter transaction number'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('deposits').insert({
      member_id: id!,
      amount,
      payment_method: depositForm.paymentMethod,
      transaction_number: depositForm.transactionNumber.trim(),
      status: 'approved',
    });

    if (!error) {
      await supabase.from('profiles').update({
        total_deposited: Number(member.total_deposited || 0) + amount,
      }).eq('id', id!);

      toast.success(`৳${amount} deposit recorded`);
      setShowDepositDialog(false);
      setDepositForm({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
      fetchData();
    } else {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!withdrawForm.transactionNumber.trim()) { toast.error('Enter transaction number'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('deposits').insert({
      member_id: id!,
      amount: -amount,
      payment_method: withdrawForm.paymentMethod,
      transaction_number: withdrawForm.transactionNumber.trim(),
      status: 'approved',
    });

    if (!error) {
      await supabase.from('profiles').update({
        total_deposited: Math.max(0, Number(member.total_deposited || 0) - amount),
      }).eq('id', id!);

      toast.success(`৳${amount} withdrawal recorded`);
      setShowWithdrawDialog(false);
      setWithdrawForm({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
      fetchData();
    } else {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  const handleDeleteTransaction = async (depositId: string, amount: number) => {
    const { error } = await supabase.from('deposits').delete().eq('id', depositId);
    if (!error) {
      // Recalculate total from remaining deposits
      const remaining = deposits.filter(d => d.id !== depositId);
      const newTotal = remaining.reduce((sum, d) => sum + Number(d.amount), 0);
      await supabase.from('profiles').update({ total_deposited: Math.max(0, newTotal) }).eq('id', id!);
      toast.success('Transaction deleted');
      fetchData();
    } else {
      toast.error(error.message);
    }
  };

  const handleDeleteDistribution = async (distId: string) => {
    const { error } = await supabase.from('profit_distributions').delete().eq('id', distId);
    if (!error) {
      toast.success('Distribution deleted');
      fetchData();
    } else {
      toast.error(error.message);
    }
  };

  const handleDeleteMember = async () => {
    if (!member) return;

    // Validate: any outstanding personal loans must be settled (Islamic loans NOT considered)
    if (outstandingTotal > 0) {
      const repaid = parseFloat(repaymentInput);
      if (!repaid || repaid < outstandingTotal) {
        toast.error(`পরিশোধের পরিমাণ কমপক্ষে ৳${outstandingTotal.toLocaleString()} হতে হবে`);
        return;
      }
    }

    setDeleting(true);
    const totalDeposited = Number(member.total_deposited || 0);

    // Mark all outstanding personal loans as fully repaid
    for (const loan of outstandingLoans) {
      const fullAmount = Number(loan.approved_amount || loan.requested_amount || 0);
      await supabase.from('member_loans').update({
        status: 'repaid',
        repaid_amount: fullAmount,
      }).eq('id', loan.id);
    }

    // Record withdrawal for the full deposited amount
    if (totalDeposited > 0) {
      await supabase.from('deposits').insert({
        member_id: id!,
        amount: -totalDeposited,
        payment_method: 'system',
        transaction_number: `DELETE-${Date.now()}`,
        status: 'approved',
      });
    }

    // Soft delete profile
    await supabase.from('profiles').update({
      is_deleted: true,
      deleted_name: member.full_name,
      total_deposited: 0,
      full_name: `[${member.full_name}] (মুছে ফেলা হয়েছে)`,
    }).eq('id', id!);

    toast.success(`${member.full_name} মুছে ফেলা হয়েছে।`);
    setShowDeleteDialog(false);
    navigate('/members');
    setDeleting(false);
  };

  const handleDownloadPDF = () => {
    if (!member) return;
    generateMemberPDF(member, deposits, distributions);
    toast.success('PDF downloaded');
  };

  if (loading || authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!member) return <div className="text-center py-12"><p className="text-muted-foreground">Member not found</p></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate('/members')} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-2">
            <Download className="w-4 h-4" /> PDF
          </Button>
          {role === 'admin' && (
            <>
              {/* Withdraw Dialog */}
              <Dialog open={showWithdrawDialog} onOpenChange={setShowWithdrawDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2 text-destructive border-destructive/30">
                    <MinusCircle className="w-4 h-4" /> Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record Withdrawal for {member.full_name}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (৳)</Label>
                      <Input type="number" value={withdrawForm.amount} onChange={e => setWithdrawForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={withdrawForm.paymentMethod} onValueChange={v => setWithdrawForm(p => ({ ...p, paymentMethod: v }))}>
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
                      <Label>Transaction Number</Label>
                      <Input value={withdrawForm.transactionNumber} onChange={e => setWithdrawForm(p => ({ ...p, transactionNumber: e.target.value }))} placeholder="TXN-XXXXX" />
                    </div>
                    <Button className="w-full" variant="destructive" onClick={handleWithdraw} disabled={submitting}>
                      {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Record Withdrawal
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Deposit Dialog */}
              <Dialog open={showDepositDialog} onOpenChange={setShowDepositDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Deposit</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Record Deposit for {member.full_name}</DialogTitle></DialogHeader>
                  <div className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (৳)</Label>
                      <Input type="number" value={depositForm.amount} onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                    </div>
                    <div className="space-y-2">
                      <Label>Payment Method</Label>
                      <Select value={depositForm.paymentMethod} onValueChange={v => setDepositForm(p => ({ ...p, paymentMethod: v }))}>
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
                      <Label>Transaction Number</Label>
                      <Input value={depositForm.transactionNumber} onChange={e => setDepositForm(p => ({ ...p, transactionNumber: e.target.value }))} placeholder="TXN-XXXXX" />
                    </div>
                    <Button className="w-full" onClick={handleAddDeposit} disabled={submitting}>
                      {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Record Deposit
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Delete Member */}
              <Dialog open={showDeleteDialog} onOpenChange={(o) => { setShowDeleteDialog(o); if (!o) setRepaymentInput(''); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-2"><Trash2 className="w-4 h-4" /> Delete Member</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>মেম্বার মুছে ফেলবেন?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 mt-2 text-sm">
                    <p className="text-muted-foreground">
                      {member.full_name} কে মুছে ফেললে তার মোট জমা ৳{Number(member.total_deposited || 0).toLocaleString()} উত্তোলন হিসেবে গণ্য হবে।
                    </p>
                    <p className="text-xs text-muted-foreground">
                      নোট: ইসলামিক লোন সম্পূর্ণ আলাদা প্রজেক্ট — মেম্বার মুছে ফেললেও তা প্রভাবিত হবে না।
                    </p>
                    {outstandingTotal > 0 && (
                      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                        <div>
                          <p className="font-medium text-destructive">পার্সোনাল লোন বকেয়া আছে</p>
                          <p className="text-xs text-muted-foreground mt-1">মোট বকেয়া: ৳{outstandingTotal.toLocaleString()} ({outstandingLoans.length}টি লোন)</p>
                          <p className="text-xs text-muted-foreground mt-1">মুছে ফেলার আগে পরিশোধিত পরিমাণ লিখুন।</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">পরিশোধিত পরিমাণ (৳)</Label>
                          <Input type="number" value={repaymentInput} onChange={e => setRepaymentInput(e.target.value)} placeholder={String(outstandingTotal)} />
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowDeleteDialog(false)}>বাতিল</Button>
                      <Button variant="destructive" className="flex-1" onClick={handleDeleteMember}
                        disabled={deleting || (outstandingTotal > 0 && (parseFloat(repaymentInput) || 0) < outstandingTotal)}>
                        {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} হ্যাঁ, মুছে ফেলুন
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-subtle space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {member.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground">{member.full_name}</h1>
            <p className="text-sm text-muted-foreground">{member.phone || 'No phone'}</p>
          </div>
          {member.phone && (
            <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
              <Button size="sm" variant="outline" onClick={startInAppCall} className="gap-1 border-green-500/50 text-green-600 hover:bg-green-500/10">
                <PhoneCall className="w-3.5 h-3.5" /> In-App
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`tel:${member.phone}`, '_self')} className="gap-1">
                <Phone className="w-3.5 h-3.5" /> Call
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${member.phone.replace(/[^0-9]/g, '')}`, '_blank')} className="gap-1 border-green-500/50 text-green-600 hover:bg-green-500/10">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </div>
          )}
        </div>

        {(() => {
          const depositSum = deposits.filter(d => Number(d.amount) > 0 && d.status === 'approved').reduce((s, d) => s + Number(d.amount), 0);
          const withdrawSum = deposits.filter(d => Number(d.amount) < 0 && d.status === 'approved').reduce((s, d) => s + Math.abs(Number(d.amount)), 0);
          const profitSum = distributions.reduce((s, d) => s + Number(d.amount || 0), 0);
          const balance = depositSum + profitSum - withdrawSum;
          const sharePct = calculateSharePercentage(balance, totalAllBalances);
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <p className="text-xs text-muted-foreground">জমা (Deposit)</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">+{formatBDT(depositSum)}</p>
              </div>
              <div className="rounded-lg bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">প্রফিট (Profit)</p>
                <p className="text-sm font-bold text-primary tabular-nums">+{formatBDT(profitSum)}</p>
              </div>
              <div className="rounded-lg bg-destructive/5 p-3">
                <p className="text-xs text-muted-foreground">উত্তোলন (Withdraw)</p>
                <p className="text-sm font-bold text-destructive tabular-nums">−{formatBDT(withdrawSum)}</p>
              </div>
              <div className="rounded-lg bg-foreground/5 p-3">
                <p className="text-xs text-muted-foreground">মোট ব্যালেন্স</p>
                <p className="text-sm font-bold text-foreground tabular-nums">{formatBDT(balance)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Share: {sharePct.toFixed(2)}%</p>
              </div>
            </div>
          );
        })()}
      </div>


      <Dialog open={inAppCall} onOpenChange={(o) => !o && setInAppCall(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">In-App Call</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <PhoneCall className="w-10 h-10 text-primary animate-pulse" />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">{member.full_name}</p>
              <p className="text-sm text-muted-foreground">{member.phone}</p>
              <p className="text-xs text-muted-foreground mt-2">Connected · {fmtTime(callSeconds)}</p>
            </div>
            <div className="flex gap-3">
              <Button size="lg" variant="outline" onClick={() => setCallMuted(m => !m)} className="rounded-full w-12 h-12 p-0">
                {callMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
              <Button size="lg" variant="destructive" onClick={() => setInAppCall(false)} className="rounded-full w-12 h-12 p-0">
                <PhoneOff className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Transaction History */}
        <div className="bg-card border border-border rounded-xl shadow-subtle">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Transaction History</h3>
            <span className="text-xs text-muted-foreground">{deposits.length} records</span>
          </div>
          {deposits.length === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No transactions yet</p></div>
          ) : (
            <>
            <div className="divide-y divide-border">
              {deposits.slice(0, depositLimit).map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className={`text-sm font-medium ${Number(d.amount) < 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {Number(d.amount) < 0 ? '↓ Withdraw' : '↑ Deposit'} {formatBDT(Math.abs(Number(d.amount)))}
                    </p>
                    <p className="text-xs text-muted-foreground">{d.payment_method} · {d.transaction_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                        d.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                        'bg-amber-50 text-amber-700'
                      }`}>{d.status}</span>
                      <p className="text-xs text-muted-foreground mt-1">{d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : ''}</p>
                    </div>
                    {role === 'admin' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete this transaction and update the member balance.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteTransaction(d.id, Number(d.amount))} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {deposits.length > depositLimit && (
              <button onClick={() => setDepositLimit(l => l + 10)} className="w-full py-3 text-xs font-medium text-primary hover:bg-primary/5 border-t border-border">
                See more ({deposits.length - depositLimit} বাকি)
              </button>
            )}
            </>
          )}
        </div>

        {/* Profit History */}
        <div className="bg-card border border-border rounded-xl shadow-subtle">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Profit Distributions</h3>
          </div>
          {distributions.length === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No distributions yet</p></div>
          ) : (
            <>
            <div className="divide-y divide-border">
              {distributions.slice(0, distLimit).map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{formatBDT(Number(d.amount))}</p>
                    <p className="text-xs text-muted-foreground">{d.distribution_type} · {d.share_percentage?.toFixed(1)}%</p>
                    {d.source ? (
                      <p className="text-xs text-primary mt-0.5 truncate">
                        {d.source.kind === 'loan' ? '🕌' : '📁'} {d.source.name} <span className="font-mono text-muted-foreground">({d.source.code})</span>
                      </p>
                    ) : d.source_type ? (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{d.source_type}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : ''}</p>
                    {role === 'admin' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete distribution?</AlertDialogTitle>
                            <AlertDialogDescription>This will permanently delete this profit distribution record.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteDistribution(d.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {distributions.length > distLimit && (
              <button onClick={() => setDistLimit(l => l + 10)} className="w-full py-3 text-xs font-medium text-primary hover:bg-primary/5 border-t border-border">
                See more ({distributions.length - distLimit} বাকি)
              </button>
            )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

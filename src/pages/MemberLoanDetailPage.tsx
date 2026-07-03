import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft, Loader2, Wallet, Check, X, RotateCcw, Trash2, User, Calendar, HandCoins,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function MemberLoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loan, setLoan] = useState<any | null>(null);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payForm, setPayForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    method: 'bkash',
    txn: '',
  });

  const fetchAll = async () => {
    if (!id) return;
    const [loanRes, repsRes] = await Promise.all([
      supabase.from('member_loans').select('*, member:profiles!member_loans_member_id_fkey(*)').eq('id', id).maybeSingle(),
      supabase.from('member_loan_repayments').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
    ]);
    setLoan(loanRes.data);
    setRepayments(repsRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!loan) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">লোন পাওয়া যায়নি।</p>
      <Button variant="ghost" onClick={() => navigate('/member-loans')} className="mt-4"><ArrowLeft className="w-4 h-4 mr-1" /> ফিরে যান</Button>
    </div>
  );

  const isBorrower = loan.member_id === user?.id;
  if (!(isBorrower || role === 'admin')) {
    return <div className="text-center py-16 text-muted-foreground">এই লোন দেখার অনুমতি নেই।</div>;
  }

  const approved = Number(loan.approved_amount || 0);
  const repaid = Number(loan.repaid_amount || 0);
  const pendingReps = repayments.filter(r => r.status === 'pending');
  const pendingAmt = pendingReps.reduce((s, r) => s + Number(r.amount || 0), 0);
  const remaining = Math.max(0, approved - repaid - pendingAmt);
  const canPay = isBorrower && loan.status === 'approved' && remaining > 0;

  const handleApproveLoan = async () => {
    const { error } = await supabase.from('member_loans').update({
      status: 'approved',
      approved_amount: Number(loan.requested_amount),
      approved_at: new Date().toISOString(),
    }).eq('id', loan.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan approved');
    fetchAll();
  };

  const handleRejectLoan = async () => {
    const { error } = await supabase.from('member_loans').update({ status: 'rejected' }).eq('id', loan.id);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan rejected');
    fetchAll();
  };

  const openPay = () => {
    setPayForm({
      date: new Date().toISOString().split('T')[0],
      amount: String(remaining || ''),
      method: 'bkash',
      txn: '',
    });
    setPayOpen(true);
  };

  const handlePay = async () => {
    const amt = parseFloat(payForm.amount);
    if (!amt || amt <= 0) { toast.error('সঠিক পরিমাণ লিখুন'); return; }
    if (!payForm.txn.trim()) { toast.error('Transaction ID দিন'); return; }
    if (amt > remaining) { toast.error(`সর্বোচ্চ ৳${remaining.toLocaleString()} পরিশোধ করা যাবে`); return; }
    setPaying(true);
    const { error } = await supabase.from('member_loan_repayments').insert({
      loan_id: loan.id,
      amount: amt,
      payment_method: payForm.method,
      transaction_number: payForm.txn.trim(),
      status: 'pending',
      created_at: new Date(payForm.date).toISOString(),
    });
    setPaying(false);
    if (error) { toast.error(error.message); return; }
    toast.success('পরিশোধ পাঠানো হয়েছে — admin approval-এর অপেক্ষায়');
    setPayOpen(false);
    fetchAll();
  };

  const setRepaymentStatus = async (rep: any, newStatus: 'approved' | 'rejected' | 'pending') => {
    const oldEff = rep.status === 'approved' ? Number(rep.amount || 0) : 0;
    const newEff = newStatus === 'approved' ? Number(rep.amount || 0) : 0;
    const delta = newEff - oldEff;
    const { error: upRepErr } = await supabase.from('member_loan_repayments').update({
      status: newStatus,
      approved_at: newStatus === 'approved' ? new Date().toISOString() : null,
      approved_by: newStatus === 'approved' ? user?.id : null,
    }).eq('id', rep.id);
    if (upRepErr) { toast.error(upRepErr.message); return; }

    if (delta !== 0 || loan.status === 'repaid') {
      const newRepaid = Math.max(0, repaid + delta);
      let nextStatus = loan.status;
      if (newRepaid >= approved && approved > 0) nextStatus = 'repaid';
      else if (loan.status === 'repaid' && newRepaid < approved) nextStatus = 'approved';
      const { error: upLoanErr } = await supabase.from('member_loans')
        .update({ repaid_amount: newRepaid, status: nextStatus }).eq('id', loan.id);
      if (upLoanErr) { toast.error(upLoanErr.message); return; }
    }
    toast.success('Updated');
    fetchAll();
  };

  const handleDeleteLoan = async () => {
    if (loan.status !== 'repaid') { toast.error('শুধু পরিশোধিত লোন delete করা যাবে'); return; }
    if (!(role === 'admin' || isBorrower)) { toast.error('অনুমতি নেই'); return; }
    const { error: repErr } = await supabase.from('member_loan_repayments').delete().eq('loan_id', loan.id);
    if (repErr) { toast.error(repErr.message); return; }
    const { error } = await supabase.from('member_loans').delete().eq('id', loan.id);
    if (error) { toast.error(error.message); return; }
    toast.success('লোন delete হয়েছে');
    navigate('/member-loans');
  };

  const statusColor =
    loan.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
    loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
    loan.status === 'repaid' ? 'bg-secondary text-muted-foreground' :
    'bg-warning/10 text-warning';

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate('/member-loans')} className="gap-1 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Member Loans
      </Button>

      {/* Loan profile header */}
      <div className="bg-card border border-border rounded-xl shadow-subtle p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
              {loan.member?.full_name?.charAt(0)?.toUpperCase() || <User className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">{loan.member?.full_name || 'Unknown'}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Loan #{loan.id.slice(0, 8).toUpperCase()} · Created {format(new Date(loan.created_at), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor}`}>{loan.status}</span>
            {loan.defaulted && <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">defaulted</span>}
            {role === 'admin' && loan.status === 'pending' && (
              <>
                <Button size="sm" onClick={handleApproveLoan} className="gap-1"><Check className="w-3.5 h-3.5" /> Approve</Button>
                <Button size="sm" variant="outline" onClick={handleRejectLoan} className="gap-1 text-destructive border-destructive/30">
                  <X className="w-3.5 h-3.5" /> Reject
                </Button>
              </>
            )}
            {canPay && (
              <Button size="sm" onClick={openPay} className="gap-1"><Wallet className="w-3.5 h-3.5" /> পরিশোধ করুন</Button>
            )}
            {loan.status === 'repaid' && (role === 'admin' || isBorrower) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-destructive border-destructive/30 gap-1">
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>এই পরিশোধিত লোনটি delete করবেন?</AlertDialogTitle>
                    <AlertDialogDescription>এই কাজ undo করা যাবে না। লোন এবং সব payment record মুছে যাবে।</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>বাতিল</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteLoan} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Financial summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <Stat label="Requested" value={formatBDT(Number(loan.requested_amount))} />
          <Stat label="Approved" value={formatBDT(approved)} />
          <Stat label="Paid" value={formatBDT(repaid)} tone="success" />
          <Stat label="Remaining" value={formatBDT(remaining)} tone={remaining > 0 ? 'warning' : 'muted'} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          <InfoRow icon={<Calendar className="w-3.5 h-3.5" />} label="Due Date"
            value={loan.due_date ? format(new Date(loan.due_date), 'MMM d, yyyy') : '—'} />
          <InfoRow icon={<HandCoins className="w-3.5 h-3.5" />} label="Pending approval"
            value={pendingAmt > 0 ? formatBDT(pendingAmt) : '—'} />
        </div>

        {loan.reason && (
          <div className="mt-4 p-3 rounded-lg bg-secondary/40 text-sm text-muted-foreground italic">
            কারণ: {loan.reason}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-secondary/30">
          <h2 className="text-sm font-semibold text-foreground">Payment Transactions</h2>
          <p className="text-xs text-muted-foreground">এই লোনের সকল পরিশোধ ইতিহাস</p>
        </div>
        {repayments.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">এখনো কোনো পরিশোধ নেই।</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {repayments.map(r => (
              <div key={r.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground tabular-nums">{formatBDT(Number(r.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), 'MMM d, yyyy')}
                    {r.payment_method && ` · ${r.payment_method}`}
                    {r.transaction_number && ` · ${r.transaction_number}`}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  r.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                  r.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                  'bg-warning/10 text-warning'
                }`}>
                  {r.status === 'pending' ? 'pending approval' : r.status === 'approved' ? 'paid' : 'rejected'}
                </span>
                {role === 'admin' && (
                  <div className="flex items-center gap-1">
                    {r.status !== 'approved' && (
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1" onClick={() => setRepaymentStatus(r, 'approved')}>
                        <Check className="w-3 h-3" /> {r.status === 'rejected' ? 'Mark Paid' : 'Approve'}
                      </Button>
                    )}
                    {r.status !== 'rejected' && (
                      <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-destructive border-destructive/30" onClick={() => setRepaymentStatus(r, 'rejected')}>
                        <X className="w-3 h-3" /> Reject
                      </Button>
                    )}
                    {r.status !== 'pending' && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setRepaymentStatus(r, 'pending')} title="Move back to pending">
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

      {/* Pay dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>লোন পরিশোধ</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              Approved: {formatBDT(approved)} · Paid: {formatBDT(repaid)} · Remaining: {formatBDT(remaining)}
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
            <p className="text-xs text-muted-foreground">নোট: পরিশোধ admin approval-এর পরই paid হিসেবে গণ্য হবে।</p>
            <Button className="w-full" onClick={handlePay} disabled={paying}>
              {paying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} পরিশোধ পাঠান
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'muted' }) {
  const toneCls =
    tone === 'success' ? 'text-emerald-600' :
    tone === 'warning' ? 'text-[hsl(var(--warning))]' :
    tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

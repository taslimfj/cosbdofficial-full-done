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

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
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
    const [profileRes, depositsRes, distRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id!).single(),
      supabase.from('deposits').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
      supabase.from('profit_distributions').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
    ]);
    setMember(profileRes.data);
    setDeposits(depositsRes.data || []);
    setDistributions(distRes.data || []);
    setLoading(false);
  };

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
    setDeleting(true);
    
    const totalDeposited = Number(member.total_deposited || 0);
    
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

    // Soft delete: mark as deleted, store name, zero out balance
    await supabase.from('profiles').update({
      is_deleted: true,
      deleted_name: member.full_name,
      total_deposited: 0,
      full_name: `[${member.full_name}] (মুছে ফেলা হয়েছে)`,
    }).eq('id', id!);

    toast.success(`${member.full_name} মুছে ফেলা হয়েছে। জমা টাকা উত্তোলন হিসেবে গণ্য হয়েছে।`);
    navigate('/members');
    setDeleting(false);
  };

  const handleDownloadPDF = () => {
    if (!member) return;
    generateMemberPDF(member, deposits, distributions);
    toast.success('PDF downloaded');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
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
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="gap-2"><Trash2 className="w-4 h-4" /> Delete Member</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>মেম্বার মুছে ফেলবেন?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {member.full_name} কে মুছে ফেললে তার মোট জমা ৳{Number(member.total_deposited || 0).toLocaleString()} উত্তোলন হিসেবে গণ্য হবে। পরবর্তী লাভের অংশ ফান্ডে জমা হবে তার নামে।
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>বাতিল</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteMember} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} হ্যাঁ, মুছে ফেলুন
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-subtle">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {member.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-foreground">{member.full_name}</h1>
            <p className="text-sm text-muted-foreground">{member.phone || 'No phone'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatBDT(Number(member.total_deposited || 0))}</p>
            <p className="text-xs text-muted-foreground">Total Balance</p>
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
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {deposits.map(d => (
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
            <div className="divide-y divide-border">
              {distributions.map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatBDT(Number(d.amount))}</p>
                    <p className="text-xs text-muted-foreground">{d.distribution_type} · {d.share_percentage?.toFixed(1)}%</p>
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
          )}
        </div>
      </div>
    </div>
  );
}

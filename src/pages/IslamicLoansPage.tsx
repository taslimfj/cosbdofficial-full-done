import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, generateCode, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Phone, MessageCircle, Loader2, Calendar, TrendingDown, TrendingUp, Clock } from 'lucide-react';

export default function IslamicLoansPage() {
  const { role } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    purchasePrice: '',
    tenure: '3',
    mediaPersonId: '',
    comments: '',
    mediaPersonProfitPct: '5',
    fundProfitPct: '15',
  });

  useEffect(() => {
    Promise.all([
      supabase.from('islamic_loans').select('*, media_person:profiles!islamic_loans_media_person_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*'),
      supabase.from('islamic_loan_payments').select('*').order('created_at', { ascending: false }),
    ]).then(([loansRes, membersRes, paymentsRes]) => {
      setLoans(loansRes.data || []);
      setMembers(membersRes.data || []);
      setPayments(paymentsRes.data || []);
      setLoading(false);
    });
  }, []);

  const tenure = parseInt(form.tenure);
  const purchasePrice = parseFloat(form.purchasePrice) || 0;
  const profitPct = calculateProfitPercentage(tenure);
  const sellPrice = calculateSellPrice(purchasePrice, profitPct);
  const monthlyInstallment = calculateMonthlyInstallment(sellPrice, tenure);

  const handleCreate = async () => {
    if (!purchasePrice) { toast.error('Enter purchase price'); return; }
    if (!form.mediaPersonId) { toast.error('Select media person'); return; }
    setSubmitting(true);
    const code = generateCode('IL');
    const { error } = await supabase.from('islamic_loans').insert({
      code,
      purchase_price: purchasePrice,
      sell_price: sellPrice,
      tenure_months: tenure,
      profit_percentage: profitPct,
      media_person_id: form.mediaPersonId,
      media_person_profit_pct: parseFloat(form.mediaPersonProfitPct),
      fund_profit_pct: parseFloat(form.fundProfitPct),
      remaining_amount: sellPrice,
      monthly_installment: monthlyInstallment,
      comments: form.comments,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Loan ${code} created`);
    setShowSheet(false);
    setForm({ purchasePrice: '', tenure: '3', mediaPersonId: '', comments: '', mediaPersonProfitPct: '5', fundProfitPct: '15' });
    const { data } = await supabase.from('islamic_loans').select('*, media_person:profiles!islamic_loans_media_person_id_fkey(*)').order('created_at', { ascending: false });
    setLoans(data || []);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Islamic Loans</h1>
          <p className="text-sm text-muted-foreground mt-1">{loans.length} loans · Profit-based financing</p>
        </div>
        {role === 'admin' && (
          <Sheet open={showSheet} onOpenChange={setShowSheet}>
            <SheetTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Loan</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>Create Islamic Loan</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>Purchase Price (৳)</Label>
                  <Input type="number" value={form.purchasePrice} onChange={e => setForm(p => ({ ...p, purchasePrice: e.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Tenure</Label>
                  <Select value={form.tenure} onValueChange={v => setForm(p => ({ ...p, tenure: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Months (8%)</SelectItem>
                      <SelectItem value="6">6 Months (16%)</SelectItem>
                      <SelectItem value="12">12 Months (25%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {purchasePrice > 0 && (
                  <div className="bg-secondary rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Profit %</span><span className="font-semibold">{profitPct}%</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Sell Price</span><span className="font-semibold tabular-nums">{formatBDT(sellPrice)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Monthly</span><span className="font-semibold tabular-nums">{formatBDT(monthlyInstallment)}</span></div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Media Person</Label>
                  <Select value={form.mediaPersonId} onValueChange={v => setForm(p => ({ ...p, mediaPersonId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    <SelectContent>
                      {members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Media Person %</Label>
                    <Input type="number" value={form.mediaPersonProfitPct} onChange={e => setForm(p => ({ ...p, mediaPersonProfitPct: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Fund %</Label>
                    <Input type="number" value={form.fundProfitPct} onChange={e => setForm(p => ({ ...p, fundProfitPct: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Comments</Label>
                  <Textarea value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Loan
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loans.length === 0 ? (
          <div className="col-span-full bg-card border border-border rounded-xl p-12 text-center">
            <p className="text-sm text-muted-foreground">No Islamic loans yet. Create your first one.</p>
          </div>
        ) : loans.map(loan => {
          const sellPriceN = Number(loan.sell_price);
          const remaining = Number(loan.remaining_amount);
          const paid = sellPriceN - remaining;
          const monthly = Number(loan.monthly_installment);
          const startDate = loan.created_at ? new Date(loan.created_at) : new Date();
          const endDate = addMonths(startDate, loan.tenure_months);
          const loanPayments = payments.filter(p => p.loan_id === loan.id);
          const lastPayment = loanPayments[0];
          const installmentsPaid = monthly > 0 ? Math.floor(paid / monthly) : 0;
          const nextInstallmentDate = addMonths(startDate, Math.min(installmentsPaid + 1, loan.tenure_months));
          const progressPct = sellPriceN > 0 ? (paid / sellPriceN) * 100 : 0;
          const phoneDigits = loan.media_person?.phone?.replace(/[^0-9]/g, '');

          return (
            <div key={loan.id} className="group bg-card border border-border p-5 rounded-xl hover:border-primary/30 transition-colors shadow-subtle flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-foreground">{loan.code}</span>
                  <p className="text-xs text-muted-foreground mt-2">{loan.tenure_months}mo · {loan.profit_percentage}% profit</p>
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${loan.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{loan.status}</span>
              </div>

              {/* Media Person */}
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Media Person</p>
                  <h3 className="text-sm font-semibold text-foreground truncate">{loan.media_person?.full_name || 'N/A'}</h3>
                  {loan.media_person?.phone && <p className="text-xs text-muted-foreground font-mono mt-0.5">{loan.media_person.phone}</p>}
                </div>
                {phoneDigits && (
                  <div className="flex gap-1 shrink-0">
                    <a href={`tel:${loan.media_person.phone}`} className="p-2 rounded-full bg-secondary hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                    </a>
                    <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="p-2 rounded-full bg-secondary hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>

              {/* Amount Summary */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-secondary/50 rounded-lg p-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <TrendingDown className="w-3 h-3" /> Due
                  </div>
                  <p className="font-mono font-bold text-primary tabular-nums text-sm">{formatBDT(remaining)}</p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-3">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <TrendingUp className="w-3 h-3" /> Paid
                  </div>
                  <p className="font-mono font-bold text-emerald-600 tabular-nums text-sm">{formatBDT(paid)}</p>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Progress</span>
                  <span>{installmentsPaid}/{loan.tenure_months} installments</span>
                </div>
                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </div>

              {/* Details */}
              <div className="space-y-2 text-xs mt-auto">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Upcoming</span>
                  <span className="font-medium text-foreground tabular-nums">{formatBDT(monthly)} · {format(nextInstallmentDate, 'dd MMM')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</span>
                  <span className="font-medium text-foreground">{format(endDate, 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Last Payment</span>
                  <span className="font-medium text-foreground tabular-nums">
                    {lastPayment ? `${formatBDT(Number(lastPayment.amount))} · ${format(new Date(lastPayment.created_at), 'dd MMM')}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground">Sell Price</span>
                  <span className="font-medium text-foreground tabular-nums">{formatBDT(sellPriceN)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

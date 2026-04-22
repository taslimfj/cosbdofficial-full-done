import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, generateCode, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Phone, MessageCircle, MessageSquare, Loader2 } from 'lucide-react';

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
          const monthly = Number(loan.monthly_installment);
          const phone = loan.media_person?.phone;
          const phoneDigits = phone?.replace(/[^0-9]/g, '');

          return (
            <Link
              key={loan.id}
              to={`/islamic-loans/${loan.id}`}
              className="group bg-card border border-border p-5 rounded-xl hover:border-primary/30 hover:shadow-md transition-all flex flex-col"
            >
              {/* Customer */}
              <div className="mb-4">
                <h3 className="text-base font-semibold text-foreground truncate">{loan.media_person?.full_name || 'N/A'}</h3>
                {phone && <p className="text-xs text-muted-foreground font-mono mt-0.5">{phone}</p>}
              </div>

              {/* Contact actions */}
              {phoneDigits && (
                <div className="flex gap-2 mb-4" onClick={e => e.stopPropagation()}>
                  <a href={`tel:${phone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors">
                    <Phone className="w-3.5 h-3.5" /> Call
                  </a>
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                  </a>
                  <a href={`sms:${phone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors">
                    <MessageSquare className="w-3.5 h-3.5" /> SMS
                  </a>
                </div>
              )}

              {/* 3 amounts */}
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Due</p>
                  <p className="font-mono font-bold text-primary tabular-nums text-sm">{formatBDT(remaining)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Purchase</p>
                  <p className="font-mono font-bold text-foreground tabular-nums text-sm">{formatBDT(Number(loan.purchase_price))}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Monthly</p>
                  <p className="font-mono font-bold text-foreground tabular-nums text-sm">{formatBDT(monthly)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

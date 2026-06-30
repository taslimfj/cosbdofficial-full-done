import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, buildEntityCode, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Phone, MessageCircle, MessageSquare, Loader2 } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateIslamicLoansPDF } from '@/lib/pdfGenerator';
import { PhoneInput } from '@/components/PhoneInput';
import { LoanCalculator } from '@/components/LoanCalculator';
import { snapshotMemberShares } from '@/lib/snapshotShares';

export default function IslamicLoansPage() {
  const { role } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    borrowerName: '',
    borrowerPhone: '+880',
    relativePhone: '+880',
    purchasePrice: '',
    tenure: '3',
    mediaPersonId: '',
    comments: '',
    mediaPersonProfitPct: '5',
    fundProfitPct: '15',
    discountPct: '0',
  });

  useEffect(() => {
    const isAdmin = role === 'admin';
    const loansQuery = isAdmin
      ? supabase.from('islamic_loans').select('*').order('created_at', { ascending: false })
      : (supabase as any).from('islamic_loans_public').select('*').order('created_at', { ascending: false });
    Promise.all([
      loansQuery,
      (supabase as any).from('member_directory').select('*'),
      supabase.from('islamic_loan_payments').select('*').order('created_at', { ascending: false }),
    ]).then(([loansRes, membersRes, paymentsRes]: any[]) => {
      const members = membersRes.data || [];
      const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
      const loans = (loansRes.data || []).map((l: any) => ({ ...l, media_person: byId.get(l.media_person_id) || null }));
      setLoans(loans);
      setMembers(members);
      setPayments(paymentsRes.data || []);
      setLoading(false);
    });
  }, [role]);

  const tenure = parseInt(form.tenure);
  const purchasePrice = parseFloat(form.purchasePrice) || 0;
  const discountPct = Math.max(0, Math.min(100, parseFloat(form.discountPct) || 0));
  const profitPct = calculateProfitPercentage(tenure);
  const baseSellPrice = calculateSellPrice(purchasePrice, profitPct);
  const sellPrice = Math.round(baseSellPrice * (1 - discountPct / 100) * 100) / 100;
  const monthlyInstallment = calculateMonthlyInstallment(sellPrice, tenure);

  const handleCreate = async () => {
    if (!form.borrowerName.trim()) { toast.error('Enter borrower name'); return; }
    if (!form.borrowerPhone.trim()) { toast.error('Enter borrower phone'); return; }
    if (!purchasePrice) { toast.error('Enter purchase price'); return; }
    if (!form.mediaPersonId) { toast.error('Select media person'); return; }
    setSubmitting(true);
    const now = new Date();
    const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const { count: yearCount } = await supabase
      .from('islamic_loans')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yStart);
    const code = buildEntityCode('IL', form.borrowerName.trim(), (yearCount || 0) + 1, now);
    const { data: inserted, error } = await supabase.from('islamic_loans').insert({
      code,
      borrower_name: form.borrowerName.trim(),
      borrower_phone: form.borrowerPhone.trim(),
      relative_phone: form.relativePhone.trim() || null,
      purchase_price: purchasePrice,
      sell_price: sellPrice,
      tenure_months: tenure,
      profit_percentage: profitPct,
      discount_pct: discountPct,
      media_person_id: form.mediaPersonId,
      media_person_profit_pct: parseFloat(form.mediaPersonProfitPct),
      fund_profit_pct: parseFloat(form.fundProfitPct),
      remaining_amount: sellPrice,
      monthly_installment: monthlyInstallment,
      comments: form.comments,
    } as any).select('id').single();
    if (error || !inserted) { setSubmitting(false); toast.error(error?.message || 'Failed'); return; }
    const loanId = inserted.id;

    // Snapshot current member shares — locked at creation
    try { await snapshotMemberShares({ type: 'islamic_loan', sourceId: loanId }); }
    catch (e: any) { console.warn('Snapshot failed:', e?.message); }

    // Create customer login (phone + default password 123456) and link to loan
    try {
      const { data: custRes, error: custErr } = await supabase.functions.invoke('create-customer', {
        body: { phone: form.borrowerPhone.trim(), fullName: form.borrowerName.trim() },
      });
      if (custErr) throw custErr;
      if (custRes?.userId) {
        await supabase.from('islamic_loans').update({ customer_user_id: custRes.userId } as any).eq('id', loanId);
      }
    } catch (e: any) {
      console.warn('Customer account creation failed:', e?.message);
      toast.warning('Loan created, but customer account creation failed: ' + (e?.message || 'unknown'));
    }

    setSubmitting(false);
    toast.success(`Loan ${code} created`);
    setShowSheet(false);
    setForm({ borrowerName: '', borrowerPhone: '+880', relativePhone: '+880', purchasePrice: '', tenure: '3', mediaPersonId: '', comments: '', mediaPersonProfitPct: '5', fundProfitPct: '15', discountPct: '0' });
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
        <div className="flex gap-2">
          <LoanCalculator />
          <PdfPeriodButton onDownload={(p) => generateIslamicLoansPDF(loans, payments, p)} />
        {role === 'admin' && (
          <Sheet open={showSheet} onOpenChange={setShowSheet}>
            <SheetTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Loan</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto">
              <SheetHeader><SheetTitle>Create Islamic Loan</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-6">
                <div className="space-y-2">
                  <Label>Borrower Name</Label>
                  <Input value={form.borrowerName} onChange={e => setForm(p => ({ ...p, borrowerName: e.target.value }))} placeholder="Full name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Borrower Phone</Label>
                    <PhoneInput value={form.borrowerPhone} onChange={v => setForm(p => ({ ...p, borrowerPhone: v }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Relative Phone</Label>
                    <PhoneInput value={form.relativePhone} onChange={v => setForm(p => ({ ...p, relativePhone: v }))} />
                  </div>
                </div>
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
                <div className="space-y-2">
                  <Label>Discount (%)</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={e => setForm(p => ({ ...p, discountPct: e.target.value }))} placeholder="0" />
                </div>
                {purchasePrice > 0 && (
                  <div className="bg-secondary rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Profit %</span><span className="font-semibold">{profitPct}%</span></div>
                    {discountPct > 0 && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Before Discount</span><span className="font-semibold tabular-nums">{formatBDT(baseSellPrice)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-semibold tabular-nums text-destructive">−{discountPct}%</span></div>
                      </>
                    )}
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
      </div>

      {(() => {
        const renderLoan = (loan: any) => {
          const remaining = Number(loan.remaining_amount);
          const monthly = Number(loan.monthly_installment);
          const borrowerName = loan.borrower_name || loan.media_person?.full_name || 'N/A';
          const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
          const phoneDigits = borrowerPhone?.replace(/[^0-9]/g, '');
          return (
            <Link
              key={loan.id}
              to={`/islamic-loans/${loan.id}`}
              className="group bg-card border border-border p-5 rounded-xl hover:border-primary/30 hover:shadow-md transition-all flex flex-col"
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-foreground truncate">{borrowerName}</h3>
                  {borrowerPhone && <p className="text-xs text-muted-foreground font-mono mt-0.5">{borrowerPhone}</p>}
                </div>
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${loan.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{loan.status}</span>
              </div>
              {phoneDigits && (
                <div className="flex gap-2 mb-4" onClick={e => e.stopPropagation()}>
                  <a href={`tel:${borrowerPhone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><Phone className="w-3.5 h-3.5" /> Call</a>
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><MessageCircle className="w-3.5 h-3.5" /> WA</a>
                  <a href={`sms:${borrowerPhone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-auto pt-4 border-t border-border">
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Due</p><p className="font-mono font-bold text-primary tabular-nums text-sm">{formatBDT(remaining)}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Purchase</p><p className="font-mono font-bold text-foreground tabular-nums text-sm">{formatBDT(Number(loan.purchase_price))}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Monthly</p><p className="font-mono font-bold text-foreground tabular-nums text-sm">{formatBDT(monthly)}</p></div>
              </div>
            </Link>
          );
        };
        const active = loans.filter(l => l.status === 'active');
        const closed = loans.filter(l => l.status !== 'active');
        return (
          <Tabs defaultValue="active" className="w-full">
            <TabsList>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
            </TabsList>
            {([['active', active], ['closed', closed]] as const).map(([key, list]) => (
              <TabsContent key={key} value={key} className="mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.length === 0 ? (
                    <div className="col-span-full bg-card border border-border rounded-xl p-12 text-center">
                      <p className="text-sm text-muted-foreground">No {key} loans.</p>
                    </div>
                  ) : list.map(renderLoan)}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        );
      })()}
    </div>
  );
}

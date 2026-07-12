import { useEffect, useMemo, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Phone, MessageCircle, MessageSquare, Loader2 } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateIslamicLoansPDF } from '@/lib/pdfGenerator';
import { PhoneInput } from '@/components/PhoneInput';
import { LoanCalculator } from '@/components/LoanCalculator';
import { snapshotMemberShares, persistExclusions } from '@/lib/snapshotShares';
import type { PaymentMethod } from '@/components/PaymentMethodsCard';
import { isLoanOverdue, findDiscountCreditForPhone, computeCustomerRating } from '@/lib/loanStatus';
import { AlertCircle, Sparkles, Star } from 'lucide-react';
import { MemberMultiSelect } from '@/components/MemberMultiSelect';
import { computeMissedInstallments } from '@/lib/memberStatus';

export default function IslamicLoansPage() {
  const { role, isCustomer, user } = useAuth();
  const [loans, setLoans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [defaultMethods, setDefaultMethods] = useState<PaymentMethod[]>([]);
  const [excludedMemberIds, setExcludedMemberIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    borrowerName: '',
    borrowerPhone: '+880',
    relativePhone: '+880',
    productName: '',
    purchasePrice: '',
    tenure: '3',
    mediaPersonId: '',
    secondaryMediaPersonId: '',
    comments: '',
    mediaPersonProfitPct: '10',
    fundProfitPct: '5',
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
      supabase.from('deposits').select('member_id, amount, month_year, created_at, status'),
    ]).then(([loansRes, membersRes, paymentsRes, depRes]: any[]) => {
      const allMembers = membersRes.data || [];
      const byId = new Map<string, any>(allMembers.map((m: any) => [m.id, m]));
      const loans = (loansRes.data || []).map((l: any) => ({ ...l, media_person: byId.get(l.media_person_id) || null }));
      setLoans(loans);
      setMembers(allMembers.filter((m: any) => !m.is_deleted && !m.is_customer));
      setPayments(paymentsRes.data || []);
      setDeposits(depRes.data || []);
      setLoading(false);
    });

  }, [role]);

  const tenure = parseInt(form.tenure);
  const purchasePrice = parseFloat(form.purchasePrice) || 0;
  const discountPct = Math.max(0, Math.min(100, parseFloat(form.discountPct) || 0));
  const profitPct = calculateProfitPercentage(tenure);
  const baseSellPrice = calculateSellPrice(purchasePrice, profitPct);
  const rawSellPrice = baseSellPrice * (1 - discountPct / 100);
  const monthlyInstallment = calculateMonthlyInstallment(rawSellPrice, tenure);
  const sellPrice = monthlyInstallment * (tenure || 0); // effective (ভগ্নাংশ বাদ)

  const criticalMemberIds = useMemo(() => {
    const byMember = new Map<string, any[]>();
    (deposits || []).forEach((d: any) => {
      if (!d.member_id) return;
      const arr = byMember.get(d.member_id) || [];
      arr.push(d);
      byMember.set(d.member_id, arr);
    });
    return members
      .filter((m: any) => computeMissedInstallments(byMember.get(m.id) || [], m.created_at).level === 'critical')
      .map((m: any) => m.id);
  }, [members, deposits]);

  // Phone-based history lookup → discount credit + customer rating
  const phoneHistory = useMemo(() => {
    if (!form.borrowerPhone || form.borrowerPhone.replace(/[^0-9]/g, '').length < 6) return null;
    const credit = findDiscountCreditForPhone(loans as any, form.borrowerPhone);
    const rating = computeCustomerRating(loans as any, form.borrowerPhone);
    return { credit, rating };
  }, [form.borrowerPhone, loans]);


  // Auto-fill discount when an unused early-payoff credit exists
  useEffect(() => {
    if (phoneHistory?.credit && phoneHistory.credit.months > 0) {
      setForm(p => {
        // Only auto-fill if user hasn't manually set a different value
        if (p.discountPct === '0' || p.discountPct === '') {
          return { ...p, discountPct: String(phoneHistory.credit!.months) };
        }
        return p;
      });
    }
  }, [phoneHistory?.credit?.fromLoanId]);

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
    const usingCredit = phoneHistory?.credit && discountPct > 0 && Math.abs(discountPct - phoneHistory.credit.months) < 0.01;
    const { data: inserted, error } = await supabase.from('islamic_loans').insert({
      code,
      borrower_name: form.borrowerName.trim(),
      borrower_phone: form.borrowerPhone.trim(),
      relative_phone: form.relativePhone.trim() || null,
      product_name: form.productName.trim() || null,
      purchase_price: purchasePrice,
      sell_price: sellPrice,
      tenure_months: tenure,
      profit_percentage: profitPct,
      discount_pct: discountPct,
      media_person_id: form.mediaPersonId,
      secondary_media_person_id: (form as any).secondaryMediaPersonId || null,
      media_person_profit_pct: parseFloat(form.mediaPersonProfitPct),
      fund_profit_pct: parseFloat(form.fundProfitPct),
      remaining_amount: sellPrice,
      monthly_installment: monthlyInstallment,
      comments: form.comments,
      discount_credit_from_loan: usingCredit ? phoneHistory!.credit!.fromLoanId : null,
      // Auto-populate admin's default payment methods so customer sees them immediately
      payment_methods: defaultMethods.filter(m => m.label.trim() && m.value.trim()),
    } as any).select('id').single();
    if (error || !inserted) { setSubmitting(false); toast.error(error?.message || 'Failed'); return; }
    const loanId = inserted.id;

    // Mark the previous loan's discount credit as used (one-shot)
    if (usingCredit) {
      await supabase.from('islamic_loans')
        .update({ discount_credit_used: true } as any)
        .eq('id', phoneHistory!.credit!.fromLoanId);
    }

    // Snapshot current member shares — locked at creation
    try {
      const snap = await snapshotMemberShares({ type: 'islamic_loan', sourceId: loanId, excludeMemberIds: excludedMemberIds });
      await persistExclusions({ type: 'islamic_loan', sourceId: loanId, excluded: snap.excluded });
    } catch (e: any) { console.warn('Snapshot failed:', e?.message); }

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
    setForm({ borrowerName: '', borrowerPhone: '+880', relativePhone: '+880', productName: '', purchasePrice: '', tenure: '3', mediaPersonId: '', secondaryMediaPersonId: '', comments: '', mediaPersonProfitPct: '10', fundProfitPct: '5', discountPct: '0' } as any);
    setExcludedMemberIds([]);
    const { data } = await supabase.from('islamic_loans').select('*, media_person:profiles!islamic_loans_media_person_id_fkey(*)').order('created_at', { ascending: false });
    setLoans(data || []);
  };

  // Load admin's default payment methods for customers (used to auto-populate new loans)
  useEffect(() => {
    (supabase as any)
      .from('payment_method_defaults')
      .select('*')
      .in('audience', ['customer', 'both'])
      .order('sort_order')
      .then(({ data }: any) => {
        setDefaultMethods((data || []).map((d: any) => ({ label: d.label, value: d.value, note: d.note })));
      });
  }, []);


  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Islamic Loans</h1>
          <p className="text-sm text-muted-foreground mt-1">{loans.length} loans · Profit-based financing</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <LoanCalculator />
          <PdfPeriodButton onDownload={(p) => generateIslamicLoansPDF(loans, payments, p)} />

        {!!user && !isCustomer && (
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

                {/* Phone history reminder: discount credit + customer rating */}
                {phoneHistory && (phoneHistory.rating.totalLoans > 0) && (
                  <div className="space-y-2">
                    {phoneHistory.credit && phoneHistory.credit.months > 0 && (
                      <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-lg p-3 flex gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-semibold text-emerald-700">
                            পূর্বের loan {phoneHistory.credit.fromLoanCode ? `(${phoneHistory.credit.fromLoanCode})` : ''} {phoneHistory.credit.months} মাস আগে পরিশোধ করা হয়েছিল
                          </p>
                          <p className="text-muted-foreground mt-0.5">
                            এই loan-এ <b className="text-emerald-700">{phoneHistory.credit.months}% discount</b> স্বয়ংক্রিয়ভাবে যুক্ত হয়েছে (এক-বারই ব্যবহারযোগ্য)।
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="border border-border bg-secondary/40 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs">
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        <div>
                          <p className="font-semibold">Customer Rating: {phoneHistory.rating.score}/10</p>
                          <p className="text-muted-foreground">
                            {phoneHistory.rating.totalLoans} loan · {phoneHistory.rating.closedLoans} closed
                            {phoneHistory.rating.overdueActive > 0 && <span className="text-destructive"> · {phoneHistory.rating.overdueActive} overdue</span>}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>পণ্যের নাম / Product Name</Label>
                  <Input value={form.productName} onChange={e => setForm(p => ({ ...p, productName: e.target.value }))} placeholder="যেমন: iPhone 15, Honda CB150R" />
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
                <div className="space-y-2">
                  <Label>Secondary Media Person <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Select value={(form as any).secondaryMediaPersonId || 'none'} onValueChange={v => setForm(p => ({ ...p, secondaryMediaPersonId: v === 'none' ? '' : v } as any))}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {members.filter(m => m.id !== form.mediaPersonId).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
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
                  <Label>Exclude Members <span className="text-xs text-muted-foreground">(এই loan এ যাদের অংশ থাকবে না)</span></Label>
                  <MemberMultiSelect
                    members={members.map(m => ({ id: m.id, name: m.full_name }))}
                    value={excludedMemberIds}
                    onChange={setExcludedMemberIds}
                    lockedIds={criticalMemberIds}
                    lockedLabel="৩ মাস বকেয়া — auto exclude"
                    placeholder="কাউকে exclude করতে চাইলে select করুন"
                  />
                  <p className="text-[11px] text-muted-foreground">এখানে যাদের select করা হবে তারা এই loan-এর profit/loss share পাবেন না। বাকি member-দের মধ্যে percentage পুনরায় হিসাব হবে। ৩ মাস consecutive বকেয়া member automatic exclude হবেন।</p>
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
          const overdue = isLoanOverdue(loan);
          return (
            <Link
              key={loan.id}
              to={`/islamic-loans/${loan.id}`}
              className={`group p-5 rounded-xl hover:shadow-md transition-all flex flex-col border ${
                overdue
                  ? 'bg-destructive/10 border-destructive/50 hover:border-destructive'
                  : 'bg-card border-border hover:border-primary/30'
              }`}
            >
              <div className="mb-4 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className={`text-base font-semibold truncate ${overdue ? 'text-destructive' : 'text-foreground'}`}>{borrowerName}</h3>
                  {borrowerPhone && <p className={`text-xs font-mono mt-0.5 ${overdue ? 'text-destructive/80' : 'text-muted-foreground'}`}>{borrowerPhone}</p>}
                  {overdue && (
                    <p className="text-[11px] font-semibold text-destructive mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> এই মাসের টাকা পরিশোধ করেননি
                    </p>
                  )}
                </div>
                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${overdue ? 'bg-destructive/20 text-destructive' : loan.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{overdue ? 'overdue' : loan.status}</span>
              </div>
              {phoneDigits && (
                <div className="flex gap-2 mb-4" onClick={e => e.stopPropagation()}>
                  <a href={`tel:${borrowerPhone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><Phone className="w-3.5 h-3.5" /> Call</a>
                  <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><MessageCircle className="w-3.5 h-3.5" /> WA</a>
                  <a href={`sms:${borrowerPhone}`} className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-xs transition-colors"><MessageSquare className="w-3.5 h-3.5" /> SMS</a>
                </div>
              )}
              <div className={`grid grid-cols-3 gap-2 mt-auto pt-4 border-t ${overdue ? 'border-destructive/30' : 'border-border'}`}>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Due</p><p className={`font-mono font-bold tabular-nums text-sm ${overdue ? 'text-destructive' : 'text-primary'}`}>{formatBDT(remaining)}</p></div>
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

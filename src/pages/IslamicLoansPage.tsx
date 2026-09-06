import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '@/hooks/usePersistentState';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, buildEntityCode, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
import { AlertCircle, AlertTriangle, Sparkles, Star, Search } from 'lucide-react';
import { format, addMonths } from 'date-fns';

import { MemberMultiSelect } from '@/components/MemberMultiSelect';
import { computeMissedInstallments } from '@/lib/memberStatus';
import { DateField } from '@/components/DateField';

export default function IslamicLoansPage() {
  const { role, isCustomer, user } = useAuth();
  const navigate = useNavigate();
  const [loans, setLoans] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [search, setSearch] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [closedVisible, setClosedVisible] = useState(10);
  const daysInCurrentMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();


  const [submitting, setSubmitting] = useState(false);
  const [defaultMethods, setDefaultMethods] = useState<PaymentMethod[]>([]);
  const [excludedMemberIds, setExcludedMemberIds, clearExcludedDraft] = usePersistentState<string[]>('islamic-loan-create-excluded', []);
  const todayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const [form, setForm, clearFormDraft] = usePersistentState('islamic-loan-create', {
    borrowerName: '',
    borrowerPhone: '+880',
    relativePhone: '+880',
    relativeName: '',
    relationship: '',
    productName: '',
    purchasePrice: '',
    advanceAmount: '',
    tenure: '3',
    mediaPersonId: '',
    secondaryMediaPersonId: '',
    comments: '',
    mediaPersonProfitPct: '10',
    fundProfitPct: '5',
    discountPct: '0',
    issueDate: todayStr(),
    customerPassword: '123456',
  });


  const [pctDefaults, setPctDefaults] = useState({ fund: 5, media: 10, admin: 5 });

  useEffect(() => {
    (supabase as any)
      .from('percentage_defaults')
      .select('fund_pct, media_person_pct, admin_pct')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setPctDefaults({
          fund: Number(data.fund_pct) || 0,
          media: Number(data.media_person_pct) || 0,
          admin: Number(data.admin_pct) || 0,
        });
      });
  }, []);

  const [tenureOptions, setTenureOptions] = useState<{ months: number; profit_pct: number }[]>([
    { months: 3, profit_pct: 8 }, { months: 6, profit_pct: 16 }, { months: 12, profit_pct: 25 },
  ]);

  useEffect(() => {
    (supabase as any)
      .from('islamic_tenure_options')
      .select('months, profit_pct')
      .order('months')
      .then(({ data }: any) => {
        if (data && data.length) {
          setTenureOptions(data.map((d: any) => ({ months: Number(d.months), profit_pct: Number(d.profit_pct) })));
        }
      });
  }, []);


  useEffect(() => {
    if (isCustomer) { setLoading(false); return; }
    Promise.all([
      supabase.from('islamic_loans').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*'),
      supabase.from('islamic_loan_payments').select('*').order('created_at', { ascending: false }),
      supabase.from('deposits').select('member_id, amount, month_year, created_at, status'),
    ]).then(([loansRes, membersRes, paymentsRes, depRes]: any[]) => {
      const allMembers = membersRes.data || [];
      const byId = new Map<string, any>(allMembers.map((m: any) => [m.id, m]));
      const allPays = paymentsRes.data || [];
      const loans = (loansRes.data || []).map((l: any) => ({
        ...l,
        media_person: byId.get(l.media_person_id) || null,
        payments: allPays.filter((p: any) => p.loan_id === l.id),
      }));
      setLoans(loans);
      setMembers(allMembers.filter((m: any) => !m.is_deleted && !m.is_customer));
      setPayments(allPays);

      setDeposits(depRes.data || []);
      setLoading(false);
    });

  }, [role, isCustomer]);

  const tenure = parseInt(form.tenure);
  const purchasePrice = parseFloat(form.purchasePrice) || 0;
  const advanceAmount = Math.max(0, Math.min(purchasePrice, parseFloat(form.advanceAmount) || 0));
  const financedAmount = Math.max(0, purchasePrice - advanceAmount);
  const discountPct = Math.max(0, Math.min(100, parseFloat(form.discountPct) || 0));
  const baseProfitPct = (tenureOptions.find(o => o.months === tenure)?.profit_pct) ?? calculateProfitPercentage(tenure);
  // Discount কমে profit rate থেকে (যেমন 25% − 5% = 20%), sell price-এর উপরে নয়।
  const profitPct = Math.max(0, baseProfitPct - discountPct);
  const baseSellPrice = calculateSellPrice(financedAmount, baseProfitPct);
  const rawSellPrice = calculateSellPrice(financedAmount, profitPct);
  const monthlyInstallment = calculateMonthlyInstallment(rawSellPrice, tenure);
  const sellPrice = monthlyInstallment * (tenure || 0); // financed portion — customer's remaining



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
    const businessDate = form.issueDate ? new Date(`${form.issueDate}T00:00:00`) : new Date();
    const yearStart = `${businessDate.getFullYear()}-01-01`;
    const yearEnd = `${businessDate.getFullYear()}-12-31`;
    const { count: yearCount } = await supabase
      .from('islamic_loans')
      .select('id', { count: 'exact', head: true })
      .gte('issue_date', yearStart)
      .lte('issue_date', yearEnd);
    const code = buildEntityCode('IL', form.borrowerName.trim(), (yearCount || 0) + 1, businessDate);
    const usingCredit = phoneHistory?.credit && discountPct > 0 && Math.abs(discountPct - phoneHistory.credit.months) < 0.01;
    const isAdmin = role === 'admin';
    const { data: inserted, error } = await supabase.from('islamic_loans').insert({
      code,
      borrower_name: form.borrowerName.trim(),
      borrower_phone: form.borrowerPhone.trim(),
      relative_phone: form.relativePhone.trim() || null,
      relative_name: form.relativeName.trim() || null,
      relationship: form.relationship.trim() || null,
      product_name: form.productName.trim() || null,
      purchase_price: purchasePrice,
      advance_amount: advanceAmount,
      sell_price: sellPrice + advanceAmount, // Total customer-payable (Advance সহ)
      tenure_months: tenure,
      profit_percentage: profitPct,

      discount_pct: discountPct,
      media_person_id: form.mediaPersonId,
      secondary_media_person_id: (form as any).secondaryMediaPersonId || null,
      media_person_profit_pct: pctDefaults.media,
      fund_profit_pct: pctDefaults.fund,
      admin_profit_pct: pctDefaults.admin,
      remaining_amount: sellPrice + advanceAmount,
      monthly_installment: monthlyInstallment,
      comments: form.comments,
      discount_credit_from_loan: usingCredit ? phoneHistory!.credit!.fromLoanId : null,
      issue_date: form.issueDate || todayStr(),
      // Auto-populate admin's default payment methods so customer sees them immediately
      payment_methods: defaultMethods.filter(m => m.label.trim() && m.value.trim()),
    } as any).select('id').single();
    if (error || !inserted) { setSubmitting(false); toast.error(error?.message || 'Failed'); return; }
    const loanId = inserted.id;

    // Auto-record Advance as a paid deposit (not an installment)
    if (advanceAmount > 0) {
      try {
        await supabase.rpc('record_islamic_loan_payment', {
          _loan_id: loanId,
          _amount: advanceAmount,
          _payment_type: 'advance',
          _payment_method: 'advance',
          _transaction_id: `ADV-${code}`,
           _payment_date: form.issueDate || todayStr(),
        } as any);
      } catch (e: any) { console.warn('Advance auto-record failed:', e?.message); }
    }


    // Mark the previous loan's discount credit as used (one-shot)
    if (usingCredit) {
      const { error: creditErr } = await (supabase as any).rpc('mark_discount_credit_used', {
        _loan_id: phoneHistory!.credit!.fromLoanId,
      });
      if (creditErr) console.warn('Discount credit mark failed:', creditErr.message);
    }

    // Snapshot current member shares — locked at creation
    try {
      const snap = await snapshotMemberShares({ type: 'islamic_loan', sourceId: loanId, excludeMemberIds: excludedMemberIds });
      await persistExclusions({ type: 'islamic_loan', sourceId: loanId, excluded: snap.excluded });
    } catch (e: any) { console.warn('Snapshot failed:', e?.message); }

    // Create customer login (phone + default password 123456) and link to loan
    try {
      const { data: custRes, error: custErr } = await supabase.functions.invoke('create-customer', {
        body: { phone: form.borrowerPhone.trim(), fullName: form.borrowerName.trim(), password: (form.customerPassword || '').trim() || '123456' },
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
    clearFormDraft();
    clearExcludedDraft();
    const { data } = await supabase.from('islamic_loans').select('*, media_person:profiles!islamic_loans_media_person_id_fkey(*)').order('created_at', { ascending: false });
    const { data: freshPays } = await supabase.from('islamic_loan_payments').select('*');
    setPayments(freshPays || []);
    setLoans((data || []).map((l: any) => ({ ...l, payments: (freshPays || []).filter((p: any) => p.loan_id === l.id) })));

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
          <Dialog open={showSheet} onOpenChange={setShowSheet}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Loan</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Islamic Loan</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-6">
                {role === 'admin' && (() => {
                  const d = form.issueDate ? new Date(form.issueDate) : new Date();
                  const end = new Date(d);
                  end.setMonth(end.getMonth() + (parseInt(form.tenure) || 0));
                  const endStr = end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  return (
                    <div className="space-y-2">
                      <Label>Create / Issue Date <span className="text-xs text-muted-foreground">(admin only)</span></Label>
                      <DateField value={form.issueDate} onChange={(v) => setForm(p => ({ ...p, issueDate: v }))} />
                      <p className="text-[11px] text-muted-foreground">শেষ কিস্তির তারিখ: <b>{endStr}</b> ({form.tenure} মাস পরে)</p>
                    </div>
                  );
                })()}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>পারিবারিক সদস্যের নাম</Label>
                    <Input value={form.relativeName} onChange={e => setForm(p => ({ ...p, relativeName: e.target.value }))} placeholder="নাম" />
                  </div>
                  <div className="space-y-2">
                    <Label>সম্পর্ক</Label>
                    <Input value={form.relationship} onChange={e => setForm(p => ({ ...p, relationship: e.target.value }))} placeholder="যেমন: বাবা, ভাই, স্ত্রী" />
                  </div>
                </div>

                <div className="space-y-2 border border-primary/20 bg-primary/5 rounded-lg p-3">
                  <Label className="text-xs">Customer Login Password (তার login এর জন্য)</Label>
                  <Input
                    type="text"
                    value={form.customerPassword}
                    onChange={e => setForm(p => ({ ...p, customerPassword: e.target.value }))}
                    placeholder="123456"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Customer এই phone number এবং এই password দিয়ে "Customer" section থেকে login করবে। ন্যূনতম ৬ অক্ষর। খালি রাখলে default <b>123456</b> ব্যবহৃত হবে।
                  </p>
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
                    <div className={`border rounded-lg p-3 ${phoneHistory.rating.score < 6 ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-secondary/40'}`}>
                      <div className="flex items-center gap-2 text-xs">
                        <Star className={`w-4 h-4 ${phoneHistory.rating.score < 6 ? 'text-destructive fill-destructive' : 'text-yellow-500 fill-yellow-500'}`} />
                        <div>
                          <p className="font-semibold">Customer Rating: {phoneHistory.rating.score}/10</p>
                          <p className="text-muted-foreground">
                            {phoneHistory.rating.totalLoans} loan · {phoneHistory.rating.closedLoans} closed
                            {phoneHistory.rating.violations > 0 && <span className="text-destructive"> · {phoneHistory.rating.violations} issue (−{(phoneHistory.rating.violations * 0.25).toFixed(2)})</span>}
                            {phoneHistory.rating.overrunMonths > 0 && <span className="text-destructive"> · {phoneHistory.rating.overrunMonths} মাস অতিরিক্ত (−{(phoneHistory.rating.overrunMonths * 0.5).toFixed(2)})</span>}
                          </p>
                        </div>
                      </div>
                      {phoneHistory.rating.score < 6 && (
                        <div className="mt-2 flex gap-2 items-start text-xs text-destructive border-t border-destructive/20 pt-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <p className="font-semibold">
                            সতর্কতা: এই customer-এর rating ideal (৬/১০)-এর থেকে কম। Loan দেওয়ার আগে ভালোভাবে বিবেচনা করুন।
                          </p>
                        </div>
                      )}
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
                  <Label>Advance / অগ্রিম (৳) <span className="text-xs text-muted-foreground">(optional)</span></Label>
                  <Input type="number" min="0" value={form.advanceAmount} onChange={e => setForm(p => ({ ...p, advanceAmount: e.target.value }))} placeholder="যদি কোনো advance থাকে" />
                  <p className="text-[11px] text-muted-foreground">Advance বাদ দিয়ে বাকি টাকার উপর profit % হিসাব হবে।</p>
                </div>
                <div className="space-y-2">
                  <Label>Tenure</Label>
                  <Select value={form.tenure} onValueChange={v => setForm(p => ({ ...p, tenure: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {tenureOptions.map(o => (
                        <SelectItem key={o.months} value={String(o.months)}>{o.months} Months ({o.profit_pct}%)</SelectItem>
                      ))}
                    </SelectContent>

                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Discount (%)</Label>
                  <Input type="number" min="0" max="100" step="0.01" value={form.discountPct} onChange={e => setForm(p => ({ ...p, discountPct: e.target.value }))} placeholder="0" />
                </div>
                {purchasePrice > 0 && (
                  <div className="bg-secondary rounded-lg p-4 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Profit %</span><span className="font-semibold">{discountPct > 0 ? `${baseProfitPct}% − ${discountPct}% = ${profitPct}%` : `${profitPct}%`}</span></div>
                    {advanceAmount > 0 && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Advance</span><span className="font-semibold tabular-nums text-emerald-600">−{formatBDT(advanceAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Financed (বাকি)</span><span className="font-semibold tabular-nums">{formatBDT(financedAmount)}</span></div>
                      </>
                    )}
                    {discountPct > 0 && (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Discount ছাড়া ({baseProfitPct}%)</span><span className="font-semibold tabular-nums">{formatBDT(baseSellPrice)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Discount (profit rate থেকে)</span><span className="font-semibold tabular-nums text-destructive">−{discountPct}%</span></div>
                      </>
                    )}

                    <div className="flex justify-between"><span className="text-muted-foreground">Sell Price (Advance সহ)</span><span className="font-semibold tabular-nums">{formatBDT(sellPrice + advanceAmount)}</span></div>
                    {advanceAmount > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Financed বাকি ({tenure} মাস)</span><span className="font-semibold tabular-nums">{formatBDT(sellPrice)}</span></div>
                    )}
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
                <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded px-2 py-1">
                  Profit distribution — Fund: <b>{pctDefaults.fund}%</b> • Media: <b>{pctDefaults.media}%</b> • Admin: <b>{pctDefaults.admin}%</b>
                  <span className="block opacity-70">Default Settings → Percentage Default থেকে পরিবর্তন করুন।</span>
                </p>
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
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-3 md:items-end">
        <div className="relative max-w-md flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="নাম, ফোন, code বা product দিয়ে search করুন..."
            className="pl-9"
          />
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">এই মাসে কিস্তির তারিখ (from)</Label>
            <Select value={dueFrom} onValueChange={setDueFrom}>
              <SelectTrigger className="w-[110px]"><SelectValue placeholder="দিন" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {Array.from({ length: daysInCurrentMonth }, (_, i) => String(i + 1)).map(d => (
                  <SelectItem key={d} value={d}>{d} তারিখ</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">to</Label>
            <Select value={dueTo} onValueChange={setDueTo}>
              <SelectTrigger className="w-[110px]"><SelectValue placeholder="দিন" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {Array.from({ length: daysInCurrentMonth }, (_, i) => String(i + 1)).map(d => (
                  <SelectItem key={d} value={d}>{d} তারিখ</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(dueFrom || dueTo) && (
            <Button variant="outline" size="sm" onClick={() => { setDueFrom(''); setDueTo(''); }}>Clear</Button>
          )}
        </div>
      </div>
      {(dueFrom || dueTo) && (
        <p className="text-xs text-muted-foreground -mt-3">
          {format(new Date(), 'MMMM yyyy')} মাসের {dueFrom || 1} – {dueTo || daysInCurrentMonth} তারিখের মধ্যে যাদের কিস্তি পরিশোধের কথা।
        </p>
      )}




      {(() => {
        const renderLoan = (loan: any) => {
          const remaining = Number(loan.remaining_amount);
          const monthly = Number(loan.monthly_installment);
          const borrowerName = loan.borrower_name || loan.media_person?.full_name || 'N/A';
          const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
          const phoneDigits = borrowerPhone?.replace(/[^0-9]/g, '');
          const overdue = isLoanOverdue(loan);
          const startDate = loan.issue_date ? new Date(loan.issue_date) : new Date(loan.created_at);
          const endDate = loan.closed_at
            ? new Date(loan.closed_at)
            : addMonths(startDate, Number(loan.tenure_months) || 0);

          return (
            <div
              key={loan.id}
              role="link"
              tabIndex={0}
              onClick={() => navigate(`/islamic-loans/${loan.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') navigate(`/islamic-loans/${loan.id}`); }}
              className={`group p-5 rounded-xl hover:shadow-md transition-all flex flex-col border cursor-pointer ${
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
              <div className={`grid grid-cols-2 gap-2 mt-3 pt-3 border-t ${overdue ? 'border-destructive/30' : 'border-border'}`}>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Start</p><p className="text-xs font-medium text-foreground">{format(startDate, 'dd MMM yyyy')}</p></div>
                <div><p className="text-[10px] text-muted-foreground uppercase tracking-wide">End</p><p className="text-xs font-medium text-foreground">{format(endDate, 'dd MMM yyyy')}</p></div>
              </div>

            </div>
          );
        };
        const mineFirst = (arr: any[]) => [...arr].sort((a, b) => {
          const aMine = user?.id && (a.media_person_id === user.id || a.secondary_media_person_id === user.id) ? 1 : 0;
          const bMine = user?.id && (b.media_person_id === user.id || b.secondary_media_person_id === user.id) ? 1 : 0;
          return bMine - aMine;
        });
        const q = search.trim().toLowerCase();
        const qDigits = q.replace(/[^0-9]/g, '');
        const matches = (l: any) => {
          if (!q) return true;
          const name = (l.borrower_name || l.media_person?.full_name || '').toLowerCase();
          const phone = (l.borrower_phone || l.media_person?.phone || '').replace(/[^0-9]/g, '');
          const code = (l.code || '').toLowerCase();
          const product = (l.product_name || '').toLowerCase();
          return name.includes(q) || code.includes(q) || product.includes(q) ||
            (qDigits.length >= 3 && phone.includes(qDigits));
        };
        const fromDay = dueFrom ? parseInt(dueFrom) : (dueTo ? 1 : 0);
        const toDay = dueTo ? parseInt(dueTo) : (dueFrom ? daysInCurrentMonth : 0);
        const dueDayMatches = (l: any) => {
          if (!fromDay && !toDay) return true;
          const base = l.issue_date ? new Date(`${l.issue_date}T00:00:00`) : new Date(l.created_at);
          const day = Math.min(base.getDate(), daysInCurrentMonth);
          return day >= fromDay && day <= toDay;
        };
        const filtered = loans.filter(l => matches(l) && dueDayMatches(l));
        const active = mineFirst(filtered.filter(l => l.status === 'active'));
        const closed = mineFirst(filtered.filter(l => l.status !== 'active'));
        const closedShown = closed.slice(0, closedVisible);

        return (
          <Tabs defaultValue="active" className="w-full">
            <TabsList>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="closed">Closed ({closed.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.length === 0 ? (
                  <div className="col-span-full bg-card border border-border rounded-xl p-12 text-center">
                    <p className="text-sm text-muted-foreground">No active loans.</p>
                  </div>
                ) : active.map(renderLoan)}
              </div>
            </TabsContent>
            <TabsContent value="closed" className="mt-4">
              {closed.length === 0 ? (
                <div className="bg-card border border-border rounded-xl p-12 text-center">
                  <p className="text-sm text-muted-foreground">No closed loans.</p>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="divide-y divide-border">
                    {closedShown.map((loan: any) => {
                      const borrowerName = loan.borrower_name || loan.media_person?.full_name || 'N/A';
                      const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
                      const startDate = loan.issue_date ? new Date(`${loan.issue_date}T00:00:00`) : new Date(loan.created_at);
                      const endDate = loan.closed_at ? new Date(loan.closed_at) : addMonths(startDate, Number(loan.tenure_months) || 0);
                      return (
                        <div
                          key={loan.id}
                          role="link"
                          tabIndex={0}
                          onClick={() => navigate(`/islamic-loans/${loan.id}`)}
                          onKeyDown={e => { if (e.key === 'Enter') navigate(`/islamic-loans/${loan.id}`); }}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{borrowerName}</p>
                            <p className="text-[11px] font-mono text-muted-foreground truncate">{borrowerPhone}</p>
                          </div>
                          <div className="hidden sm:block text-right shrink-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Purchase</p>
                            <p className="text-xs font-mono font-semibold tabular-nums text-foreground">{formatBDT(Number(loan.purchase_price))}</p>
                          </div>
                          <div className="hidden md:block text-right shrink-0 w-28">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Closed</p>
                            <p className="text-xs font-medium text-foreground">{format(endDate, 'dd MMM yyyy')}</p>
                          </div>
                          <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{loan.status}</span>
                        </div>
                      );
                    })}
                  </div>
                  {closedVisible < closed.length && (
                    <div className="p-3 border-t border-border text-center">
                      <Button variant="outline" size="sm" onClick={() => setClosedVisible(v => v + 5)}>
                        Show more ({closed.length - closedVisible} বাকি)
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        );
      })()}

    </div>
  );
}

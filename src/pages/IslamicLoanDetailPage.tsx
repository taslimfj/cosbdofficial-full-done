import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, formatBDTDecimal, round2, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Phone, MessageCircle, MessageSquare, Loader2, ArrowLeft, Calendar, TrendingDown, TrendingUp,
  Clock, Pencil, Trash2, Plus, Sparkles, Users, Package, AlertCircle, Star, Layers, Download,
} from 'lucide-react';
import { ExcludedMembersCard } from '@/components/ExcludedMembersCard';
import { PaymentMethodsCard, type PaymentMethod } from '@/components/PaymentMethodsCard';
import { PaymentMethodsEditor } from '@/components/PaymentMethodsEditor';
import { LoanContractPdf } from '@/components/LoanContractPdf';
import { isLoanOverdue, computeCustomerRating, computeMonthsEarly } from '@/lib/loanStatus';
import { generatePaymentReceiptPDF } from '@/lib/paymentReceipt';
import { generateIslamicLoanSnapshotPDF } from '@/lib/snapshotReportPdf';
import { SnapshotShareEditor } from '@/components/SnapshotShareEditor';
import { DateField } from '@/components/DateField';

export default function IslamicLoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user, isCustomer } = useAuth();
  const isAdmin = role === 'admin';
  // Media person of this loan gets admin-like powers (edit + record deposit) — computed after loan loads


  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [payRequests, setPayRequests] = useState<any[]>([]);
  const [approvers, setApprovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [payLimit, setPayLimit] = useState(3);

  const [showEdit, setShowEdit] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showShareEdit, setShowShareEdit] = useState(false);

  const [depositAmt, setDepositAmt] = useState('');
  const [depositType, setDepositType] = useState('installment');
  const [requestNote, setRequestNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [siblingLoans, setSiblingLoans] = useState<any[]>([]);
  const [phoneHistory, setPhoneHistory] = useState<any[]>([]);
  const [searchParams] = useSearchParams();
  const showCustomerDetail = searchParams.get('detail') === '1';

  const [edit, setEdit] = useState<any>(null);


  const load = async () => {
    if (!id) return;
    const isAdminLocal = role === 'admin';
    const loanQuery = (isAdminLocal || isCustomer)
      ? supabase.from('islamic_loans').select('*').eq('id', id).maybeSingle()
      : (supabase as any).from('islamic_loans_public').select('*').eq('id', id).maybeSingle();
    const [loanRes, payRes, memRes, snapRes, distRes, reqRes] = await Promise.all([
      loanQuery,
      supabase.from('islamic_loan_payments').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*'),
      (supabase as any).from('islamic_loan_member_shares').select('*').eq('loan_id', id),
      supabase.from('profit_distributions').select('*').eq('source_id', id).eq('source_type', 'islamic_loan'),
      (supabase as any).from('customer_payment_requests').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
    ]);
    const members = (memRes.data || []).filter((m: any) => !m.is_deleted && !m.is_customer);
    const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
    const loan = loanRes.data ? { ...loanRes.data, media_person: byId.get(loanRes.data.media_person_id) || null, secondary_media_person: byId.get((loanRes.data as any).secondary_media_person_id) || null } : null;
    const distributions = (distRes.data || []).map((d: any) => ({ ...d, member: byId.get(d.member_id) || null }));
    setLoan(loan);
    setPayments(payRes.data || []);
    setMembers(members);
    setSnapshot(snapRes.data || []);
    setDistributions(distributions);
    setPayRequests(reqRes.data || []);

    // Fetch approver names for payments
    const approverIds = Array.from(new Set([
      ...(payRes.data || []).map((p: any) => p.approved_by).filter(Boolean),
      ...(reqRes.data || []).map((r: any) => r.reviewed_by).filter(Boolean),
    ]));
    if (approverIds.length) {
      const { data: appProfiles } = await supabase.from('profiles').select('id, full_name').in('id', approverIds as string[]);
      const map: Record<string, string> = {};
      (appProfiles || []).forEach((p: any) => { map[p.id] = p.full_name || 'Admin'; });
      setApprovers(map);
    } else {
      setApprovers({});
    }

    // Fetch sibling loans (same customer, different loan, still active)
    if (loan?.customer_user_id) {
      const { data: sibs } = await supabase
        .from('islamic_loans')
        .select('id, code, borrower_name, product_name, status, remaining_amount, sell_price, monthly_installment, tenure_months, created_at, issue_date, closed_at')
        .eq('customer_user_id', loan.customer_user_id)
        .neq('id', id)
        .order('created_at', { ascending: false });
      setSiblingLoans(sibs || []);
    } else {
      setSiblingLoans([]);
    }

    // Fetch full loan history for this phone (for rating computation)
    if (loan?.borrower_phone) {
      const { data: hist } = await supabase
        .from('islamic_loans')
        .select('id, status, tenure_months, monthly_installment, sell_price, remaining_amount, advance_amount, created_at, issue_date, closed_at, months_paid_early, borrower_phone')
        .eq('borrower_phone', loan.borrower_phone);
      setPhoneHistory(hist || []);
    } else {
      setPhoneHistory([]);
    }

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (loan) {
      setEdit({
        borrower_name: loan.borrower_name || '',
        borrower_phone: loan.borrower_phone || '',
        relative_phone: loan.relative_phone || '',
        relative_name: (loan as any).relative_name || '',
        relationship: (loan as any).relationship || '',
        product_name: (loan as any).product_name || '',
        purchase_price: String(loan.purchase_price ?? ''),
        sell_price: String(loan.sell_price ?? ''),
        tenure_months: String(loan.tenure_months ?? '3'),
        profit_percentage: String(loan.profit_percentage ?? ''),
        discount_pct: String(loan.discount_pct ?? '0'),
        media_person_id: loan.media_person_id || '',
        secondary_media_person_id: (loan as any).secondary_media_person_id || '',
        media_person_profit_pct: String(loan.media_person_profit_pct ?? '10'),
        fund_profit_pct: String(loan.fund_profit_pct ?? '5'),
        monthly_installment: String(loan.monthly_installment ?? ''),
        remaining_amount: String(loan.remaining_amount ?? ''),
        status: loan.status || 'active',
        comments: loan.comments || '',
        issue_date: (loan as any).issue_date
          ? String((loan as any).issue_date).slice(0, 10)
          : (loan.created_at ? new Date(loan.created_at).toISOString().slice(0, 10) : ''),
        payment_methods: Array.isArray((loan as any).payment_methods) ? (loan as any).payment_methods : [],
      });
    }
  }, [loan]);

  // Profit / Loss = collected (paid) − purchase_price
  //   Profit → Fund % + Media % + Admin % + Member Pool (snapshot %)
  //   Loss   → Members bear it fully by snapshot % (Fund/Media/Admin unaffected)
  const profitTotals = useMemo(() => {
    if (!loan) return { total: 0, net: 0, isLoss: false, fund: 0, media: 0, admin: 0, memberPool: 0 };
    const collected = Number(loan.sell_price) - Number(loan.remaining_amount);
    const net = round2(collected - Number(loan.purchase_price));
    if (net >= 0) {
      const fund = round2(net * (Number(loan.fund_profit_pct) || 0) / 100);
      const media = round2(net * (Number(loan.media_person_profit_pct) || 0) / 100);
      const admin = round2(net * (Number((loan as any).admin_profit_pct) || 0) / 100);
      return { total: net, net, isLoss: false, fund, media, admin, memberPool: round2(Math.max(0, net - fund - media - admin)) };
    }
    return { total: net, net, isLoss: true, fund: 0, media: 0, admin: 0, memberPool: net };
  }, [loan]);

  // Snapshot share rows — frozen at loan creation (signed: negative on loss)
  const shareRows = useMemo(() => {
    if (!loan || !snapshot.length) return [] as any[];
    const pool = profitTotals.memberPool;
    const activeMemberIds = new Set(members.map((m: any) => m.id));
    return snapshot
      .map((s: any) => ({
        id: s.id,
        memberId: s.member_id,
        name: s.member_name,
        deposit: Number(s.deposit_snapshot),
        sharePct: Number(s.share_percentage),
        expected: round2(pool * Number(s.share_percentage) / 100),
        isDeleted: !!s.is_member_deleted || !s.member_id || !activeMemberIds.has(s.member_id),
      }))
      .sort((a, b) => b.sharePct - a.sharePct);
  }, [loan, snapshot, profitTotals, members]);



  const alreadyDistributed = distributions.length > 0;
  const visibleShareRows = shareRows.filter(r => !r.isDeleted && r.sharePct > 0);

  const handleEditSave = async () => {
    setBusy(true);
    const payload: any = {
      borrower_name: edit.borrower_name.trim() || null,
      borrower_phone: edit.borrower_phone.trim() || null,
      relative_phone: edit.relative_phone.trim() || null,
      relative_name: (edit as any).relative_name?.trim() || null,
      relationship: (edit as any).relationship?.trim() || null,
      product_name: edit.product_name?.trim() || null,
      purchase_price: parseFloat(edit.purchase_price) || 0,
      sell_price: parseFloat(edit.sell_price) || 0,
      tenure_months: parseInt(edit.tenure_months) || 3,
      profit_percentage: parseFloat(edit.profit_percentage) || 0,
      discount_pct: parseFloat(edit.discount_pct) || 0,
      media_person_id: edit.media_person_id || null,
      secondary_media_person_id: edit.secondary_media_person_id || null,
      media_person_profit_pct: parseFloat(edit.media_person_profit_pct) || 0,
      fund_profit_pct: parseFloat(edit.fund_profit_pct) || 0,
      monthly_installment: parseFloat(edit.monthly_installment) || 0,
      remaining_amount: parseFloat(edit.remaining_amount) || 0,
      status: edit.status,
      comments: edit.comments,
      issue_date: edit.issue_date || null,
      payment_methods: (edit.payment_methods || []).filter((m: PaymentMethod) => m.label?.trim() && m.value?.trim()),
    };
    const { error } = await supabase.from('islamic_loans').update(payload).eq('id', id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan updated');
    setShowEdit(false);
    load();
  };

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    setBusy(true);
    const { error } = await supabase.rpc('record_islamic_loan_payment', {
      _loan_id: id!,
      _amount: amt,
      _payment_type: depositType,
      _payment_method: paymentMethod || null,
      _transaction_id: transactionId || null,
      _payment_date: paymentDate || null,
    } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await maybeMarkClosed(amt);
    toast.success('Deposit recorded');
    setShowDeposit(false);
    setDepositAmt(''); setPaymentMethod(''); setTransactionId('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    load();
  };

  // After a payment, if remaining reaches 0, freeze closed_at + months_paid_early
  const maybeMarkClosed = async (justPaid: number) => {
    if (!loan) return;
    const currentRemaining = Number(loan.remaining_amount) - justPaid;
    if (currentRemaining > 0.01) return;
    if (loan.closed_at) return;
    const closeDate = paymentDate ? new Date(`${paymentDate}T00:00:00`) : new Date();
    const start = new Date((loan as any).issue_date || loan.created_at);
    const monthsUsed =
      (closeDate.getFullYear() - start.getFullYear()) * 12 +
      (closeDate.getMonth() - start.getMonth()) +
      (closeDate.getDate() >= start.getDate() ? 0 : -1);
    const monthsEarly = Math.max(0, Number(loan.tenure_months) - Math.max(0, monthsUsed));
    await supabase.from('islamic_loans').update({
      closed_at: closeDate.toISOString(),
      months_paid_early: monthsEarly,
      status: 'closed',
    } as any).eq('id', id!);
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await supabase.from('islamic_loans').delete().eq('id', id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan deleted');
    navigate('/islamic-loans');
  };

  const handleDistribute = async () => {
    if (alreadyDistributed) { toast.error('Already distributed'); return; }
    if (profitTotals.net === 0) { toast.error('No profit or loss to distribute'); return; }
    setBusy(true);
    const rows: any[] = [];
    const fundExtras: { amount: number; reason: string; type: 'in' | 'out' }[] = [];
    const isLoss = profitTotals.isLoss;

    // Profit-only pools — Fund %, Media %, Admin % (skipped entirely on loss)
    if (!isLoss) {
      if (profitTotals.fund > 0) {
        rows.push({ source_type: 'islamic_loan', source_id: id, member_id: null, amount: profitTotals.fund, share_percentage: Number(loan.fund_profit_pct), distribution_type: 'fund' });
      }
      if (profitTotals.media > 0) {
        const mediaPct = Number(loan.media_person_profit_pct) || 0;
        const secondaryId = (loan as any).secondary_media_person_id || null;
        if (loan.media_person_id) {
          rows.push({ source_type: 'islamic_loan', source_id: id, member_id: loan.media_person_id, amount: profitTotals.media, share_percentage: mediaPct, distribution_type: 'media_person' });
        } else if (secondaryId) {
          // Primary media deleted, secondary exists → half to secondary, half to Fund
          const half = round2(profitTotals.media / 2);
          const other = round2(profitTotals.media - half);
          rows.push({ source_type: 'islamic_loan', source_id: id, member_id: secondaryId, amount: half, share_percentage: mediaPct / 2, distribution_type: 'secondary_media_person' });
          rows.push({ source_type: 'islamic_loan', source_id: id, member_id: null, amount: other, share_percentage: mediaPct / 2, distribution_type: 'media_deleted_to_fund' });
          fundExtras.push({ amount: other, reason: `Loan ${loan.code} — Deleted primary media (অর্ধেক) Fund-এ যোগ`, type: 'in' });
        } else {
          // Both deleted → entire media share → Fund
          rows.push({ source_type: 'islamic_loan', source_id: id, member_id: null, amount: profitTotals.media, share_percentage: mediaPct, distribution_type: 'media_deleted_to_fund' });
          fundExtras.push({ amount: profitTotals.media, reason: `Loan ${loan.code} — Deleted media person share Fund-এ যোগ`, type: 'in' });
        }
      }
      if (profitTotals.admin > 0) {
        const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
        const adminRoleIds = (adminRoles || []).map((r: any) => r.user_id).filter(Boolean);
        const { data: adminProfiles } = adminRoleIds.length
          ? await supabase.from('profiles').select('id').in('id', adminRoleIds)
          : { data: [] as any[] };
        const adminIds = (adminProfiles || []).map((p: any) => p.id);
        if (adminIds.length > 0) {
          const perAdmin = profitTotals.admin / adminIds.length;
          const perAdminPct = (Number((loan as any).admin_profit_pct) || 0) / adminIds.length;
          adminIds.forEach((uid: string) => {
            rows.push({ source_type: 'islamic_loan', source_id: id, member_id: uid, amount: perAdmin, share_percentage: perAdminPct, distribution_type: 'admin' });
          });
        } else {
          rows.push({ source_type: 'islamic_loan', source_id: id, member_id: null, amount: profitTotals.admin, share_percentage: Number((loan as any).admin_profit_pct) || 0, distribution_type: 'admin_to_fund' });
          fundExtras.push({ amount: profitTotals.admin, reason: `Loan ${loan.code} — Admin share (no admin found) Fund-এ যোগ`, type: 'in' });
        }
      }
    }

    // Member shares — only active, non-deleted, non-zero snapshot rows count.
    // Deleted/0% rows are fully excluded; their names never get a distribution entry.
    shareRows.forEach(r => {
      if (r.expected === 0) return;
      if (r.isDeleted || !r.memberId) {
        return;
      } else {
        rows.push({
          source_type: 'islamic_loan', source_id: id, member_id: r.memberId,
          amount: r.expected, share_percentage: r.sharePct,
          distribution_type: 'share',
        });
      }
    });

    // Residual member-pool coverage — if snapshot alive-share % < 100, the
    // uncovered pool goes to Fund. On profit → Fund gets credit. On loss →
    // Fund absorbs the uncovered loss.
    if (profitTotals.memberPool !== 0) {
      const totalSnapshotPct = shareRows
        .filter(r => !r.isDeleted && r.memberId && r.sharePct > 0)
        .reduce((s, r) => s + r.sharePct, 0);
      const residualPct = Math.max(0, 100 - totalSnapshotPct);
      if (residualPct > 0.001) {
        const residualAmt = round2(profitTotals.memberPool * residualPct / 100);
        if (residualAmt !== 0) {
          rows.push({
            source_type: 'islamic_loan', source_id: id, member_id: null,
            amount: residualAmt, share_percentage: residualPct,
            distribution_type: 'residual_to_fund',
          });
          fundExtras.push({
            amount: Math.abs(residualAmt),
            reason: isLoss
              ? `Loan ${loan.code} — অবশিষ্ট ${residualPct.toFixed(2)}% loss Fund থেকে বিয়োগ`
              : `Loan ${loan.code} — অবশিষ্ট ${residualPct.toFixed(2)}% Fund-এ যোগ`,
            type: isLoss ? 'out' : 'in',
          });
        }
      }
    }

    if (rows.length === 0) { setBusy(false); toast.error('Nothing to distribute'); return; }

    const { error } = await supabase.from('profit_distributions').insert(rows);
    if (error) { setBusy(false); toast.error(error.message); return; }

    const fundTxRows: any[] = [];
    if (!isLoss && profitTotals.fund > 0) {
      fundTxRows.push({ type: 'in', amount: profitTotals.fund, reason: `Loan ${loan.code} — Fund profit share (${loan.fund_profit_pct}%)` });
    }
    fundExtras.forEach(f => fundTxRows.push({ type: f.type, amount: f.amount, reason: f.reason }));
    if (fundTxRows.length) {
      const { error: ftErr } = await supabase.from('fund_transactions').insert(fundTxRows);
      if (ftErr) toast.error('Fund tx: ' + ftErr.message);
    }

    setBusy(false);
    toast.success(isLoss ? 'Loss distributed among members' : 'Profit distributed');
    load();
  };

  // Customer submits a payment / installment request
  const handleSubmitRequest = async () => {
    const amt = parseFloat(depositAmt);
    if (!amt || amt <= 0) { toast.error('সঠিক amount দিন'); return; }
    if (!paymentMethod) { toast.error('Payment মাধ্যম select করুন'); return; }
    if (!transactionId.trim()) { toast.error('Transaction ID দিন'); return; }
    if (!user) return;
    setBusy(true);
    const requestCustomerId = isCustomer ? user.id : ((loan as any)?.customer_user_id || user.id);
    const { error } = await (supabase as any).from('customer_payment_requests').insert({
      loan_id: id, customer_user_id: requestCustomerId, amount: amt,
      note: requestNote || null,
      payment_method: paymentMethod,
      transaction_id: transactionId.trim(),
      // Customer cannot pick a date → null. Media person picks explicitly.
      payment_date: isCustomer ? null : (paymentDate || null),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Request পাঠানো হয়েছে। Admin approve করলে installment হিসেবে count হবে।');
    setShowRequest(false);
    setDepositAmt(''); setRequestNote(''); setPaymentMethod(''); setTransactionId('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    load();
  };

  // Admin approves a pending request → records payment + marks request approved
  const approveRequest = async (req: any) => {
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc('record_islamic_loan_payment', {
      _loan_id: id!, _amount: Number(req.amount), _payment_type: 'installment',
      _payment_method: req.payment_method || null,
      _transaction_id: req.transaction_id || null,
      _payment_date: req.payment_date || null,
    } as any);
    if (rpcErr) { setBusy(false); toast.error(rpcErr.message); return; }
    await (supabase as any).from('customer_payment_requests').update({
      status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id,
    }).eq('id', req.id);
    await maybeMarkClosed(Number(req.amount));
    setBusy(false);
    toast.success('Approved & recorded');
    load();
  };

  const rejectRequest = async (req: any) => {
    setBusy(true);
    await (supabase as any).from('customer_payment_requests').update({
      status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.id,
    }).eq('id', req.id);
    setBusy(false);
    toast('Request rejected');
    load();
  };


  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!loan) return <div className="text-center text-muted-foreground py-12">Loan not found</div>;

  const sellPriceN = Number(loan.sell_price);
  const remaining = Number(loan.remaining_amount);
  const paid = sellPriceN - remaining;
  const monthly = Number(loan.monthly_installment);
  const startDate = (loan as any).issue_date ? new Date((loan as any).issue_date) : (loan.created_at ? new Date(loan.created_at) : new Date());
  const endDate = (loan as any).closed_at ? new Date((loan as any).closed_at) : addMonths(startDate, loan.tenure_months);

  // Advance payments are one-time upfront amounts — never counted as installment progress.
  // Only approved advance entries reduce financed amount (pending requests are excluded).
  const advancePaid = payments
    .filter((p: any) => (p.payment_type || 'installment') === 'advance' && (p.status ?? 'approved') === 'approved')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const installmentPaidAmount = Math.max(0, paid - advancePaid);
  const financedAmount = Math.max(0, sellPriceN - advancePaid);
  // Installment count = number of DISTINCT months in which approved non-advance payments landed.
  // Same month = 1 installment (partials merged). Different months = separate installments.
  const monthKey = (p: any) => {
    const d = p.payment_date || p.created_at;
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getFullYear()}-${dt.getMonth()}`;
  };
  const paidMonthsSet = new Set<string>();
  for (const p of payments) {
    if ((p.payment_type || 'installment') === 'advance') continue;
    if ((p.status ?? 'approved') !== 'approved') continue;
    const k = monthKey(p);
    if (k) paidMonthsSet.add(k);
  }
  const installmentsPaid = Math.min(paidMonthsSet.size, loan.tenure_months);
  const nextInstallmentDate = addMonths(startDate, Math.min(installmentsPaid + 1, loan.tenure_months));
  const progressPct = financedAmount > 0 ? (installmentPaidAmount / financedAmount) * 100 : 0;

  const borrowerName = loan.borrower_name || loan.media_person?.full_name || 'N/A';
  const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
  const relPhone = loan.relative_phone || '';
  const phoneDigits = borrowerPhone?.replace(/[^0-9]/g, '');
  const relDigits = relPhone?.replace(/[^0-9]/g, '');
  const isClosed = loan.status === 'closed' || remaining <= 0;
  const overdue = isLoanOverdue(loan);
  // Installment numbering per payment — same-month payments share the same installment number.
  const installmentIndexById = (() => {
    const map = new Map<string, number>();
    const asc = [...payments].reverse();
    const monthToIdx = new Map<string, number>();
    let n = 0;
    for (const p of asc) {
      if ((p.payment_type || 'installment') === 'advance') continue;
      const k = monthKey(p);
      if (!k) continue;
      let idx = monthToIdx.get(k);
      if (idx === undefined) { n++; idx = n; monthToIdx.set(k, idx); }
      map.set(p.id, idx);
    }
    return map;
  })();
  const getMatchedApprovedRequest = (payment: any) => payRequests.find((request: any) =>
    request.status === 'approved' &&
    Number(request.amount) === Number(payment.amount) &&
    (request.transaction_id || null) === (payment.transaction_id || null)
  );
  const getPaymentApproval = (payment: any) => {
    const matchedRequest = getMatchedApprovedRequest(payment);
    const approvedBy = payment.approved_by || matchedRequest?.reviewed_by || null;
    const approvedAt = payment.approved_at || matchedRequest?.reviewed_at || null;
    return { approvedBy, approvedAt, approverName: approvedBy ? (approvers[approvedBy] || 'Admin') : null };
  };
  const downloadPaymentReceipt = (payment: any, installmentNumber: number, approverName?: string | null, approvedAt?: string | null) => generatePaymentReceiptPDF({
    loan: {
      id: loan.id, code: loan.code, borrower_name: loan.borrower_name,
      borrower_phone: loan.borrower_phone, product_name: (loan as any).product_name,
      tenure_months: loan.tenure_months, sell_price: loan.sell_price,
      monthly_installment: loan.monthly_installment, remaining_amount: loan.remaining_amount,
    },
    payment: {
      id: payment.id, amount: Number(payment.amount), payment_type: payment.payment_type,
      payment_method: payment.payment_method, transaction_id: payment.transaction_id,
      created_at: payment.created_at, approved_at: approvedAt || payment.approved_at,
    },
    installmentNumber,
    totalInstallments: loan.tenure_months || payments.length,
    approverName,
  });

  // ───────── Customer view (loan recipient): NO profit/percentages, only payment info ─────────
  if (isCustomer) {
    const myRequests = payRequests.filter(r => r.customer_user_id === user?.id);
    const methods: PaymentMethod[] = Array.isArray((loan as any).payment_methods) ? (loan as any).payment_methods : [];
    return (
      <div className={`space-y-6 animate-fade-in max-w-xl ${overdue ? 'p-4 -m-4 rounded-xl bg-destructive/10 ring-2 ring-destructive/40' : ''}`}>
        {overdue && (
          <div className="bg-destructive text-destructive-foreground rounded-xl p-4 flex items-start gap-3 shadow-md">
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-base">আপনি এখনো এই মাসের টাকা পরিশোধ করেননি</p>
              <p className="text-sm opacity-90 mt-0.5">দয়া করে দ্রুত installment পরিশোধ করুন।</p>
            </div>
          </div>
        )}
        <div className="flex justify-end">
          <Link
            to="/tutorials"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            📺 Tutorial ভিডিও দেখুন
          </Link>
        </div>
        {/* All loans for this customer — Active / Closed tabs (current loan included) */}
        {!showCustomerDetail && (() => {
          const allLoans = [loan as any, ...siblingLoans.filter(s => s.id !== loan.id)];
          const activeCount = allLoans.filter(s => s.status === 'active').length;
          const closedCount = allLoans.length - activeCount;
          return (
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">আপনার Islamic Loan ({allLoans.length})</p>
            </div>
            <Tabs defaultValue={loan.status === 'active' ? 'active' : 'closed'} className="w-full">
              <TabsList>
                <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
                <TabsTrigger value="closed">Closed ({closedCount})</TabsTrigger>
              </TabsList>
              {(['active', 'closed'] as const).map(tab => {
                const list = allLoans.filter(s => tab === 'active' ? s.status === 'active' : s.status !== 'active');

                return (
                  <TabsContent key={tab} value={tab} className="mt-3">
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-6">No {tab} loans.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {list.map(s => {
                          const sStart = new Date(s.issue_date || s.created_at);
                          const sEnd = s.closed_at ? new Date(s.closed_at) : addMonths(sStart, Number(s.tenure_months) || 0);
                          return (
                            <Link
                              key={s.id}
                              to={`/islamic-loans/${s.id}?detail=1`}
                              className="block bg-background border border-border rounded-lg p-3 hover:border-primary/40 transition-colors shadow-subtle"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-foreground">{s.code}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{s.status}</span>
                              </div>
                              {s.product_name && <p className="text-xs font-medium mt-1.5 truncate text-foreground">{s.product_name}</p>}
                              <p className="text-[11px] text-muted-foreground mt-0.5">Due: <span className="font-mono text-foreground">{formatBDT(Number(s.remaining_amount))}</span></p>
                              <div className="mt-2 pt-2 border-t border-border grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Start</p>
                                  <p className="text-[11px] font-medium text-foreground">{format(sStart, 'dd MMM yyyy')}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">End</p>
                                  <p className="text-[11px] font-medium text-foreground">{format(sEnd, 'dd MMM yyyy')}</p>
                                </div>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
          );
        })()}

        {showCustomerDetail && (
          <Link to={`/islamic-loans/${loan.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            ← আপনার সব Loan
          </Link>
        )}

        {/* Payment methods — always available for the customer */}
        {methods.length > 0 && (!showCustomerDetail || !isClosed) && (
          <PaymentMethodsCard
            methods={methods}
            title="এখানে টাকা পাঠান"
            subtitle="Tap to copy"
          />
        )}

        {showCustomerDetail && (<>
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">

          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{loan.code}</span>
            <h1 className="text-2xl font-bold mt-2">{borrowerName}</h1>
            {(loan as any).product_name && (
              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> {(loan as any).product_name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Sale Amount</p><p className="font-mono font-bold tabular-nums">{formatBDT(sellPriceN)}</p></div>
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Monthly Installment</p><p className="font-mono font-bold tabular-nums">{formatBDT(monthly)}</p></div>
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Paid</p><p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDT(paid)}</p></div>
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Due</p><p className="font-mono font-bold text-primary tabular-nums">{formatBDT(remaining)}</p></div>
          </div>

          <div className="space-y-2 text-sm border-t border-border pt-4">
            <div className="flex justify-between"><span className="text-muted-foreground">Tenure</span><span className="font-medium">{loan.tenure_months} months</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Installments Paid</span><span className="font-medium">{installmentsPaid}/{loan.tenure_months}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Next Installment</span><span className="font-medium">{format(nextInstallmentDate, 'dd MMM yyyy')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</span><span className="font-medium">{format(endDate, 'dd MMM yyyy')}</span></div>
          </div>

          <div className="mb-2">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Progress</span><span>{installmentsPaid}/{loan.tenure_months} installments</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <Button className="w-full" onClick={() => { setDepositAmt(String(monthly || '')); setShowRequest(true); }} disabled={isClosed}>
            <Plus className="w-4 h-4 mr-1" /> Request Installment Payment
          </Button>
        </div>

        {/* Approved payment history */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h2 className="font-semibold mb-3">Payment History</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">এখনো কোন payment নেই</p>
          ) : (
            <div className="space-y-2">
              {payments.slice(0, payLimit).map((p, idx) => {
                const installmentNumber = installmentIndexById.get(p.id) || 0;
                const { approvedBy, approvedAt, approverName } = getPaymentApproval(p);
                const canDownload = !!approvedBy || !!approvedAt;
                return (
                  <div key={p.id} className="flex justify-between items-center p-3 bg-secondary/40 rounded-lg gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium capitalize">{p.payment_type || 'installment'}{p.payment_method ? ` · ${p.payment_method}` : ''}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(p.payment_date || p.created_at), 'dd MMM yyyy')}</p>
                      {p.transaction_id && <p className="text-[11px] text-muted-foreground font-mono truncate">TrxID: {p.transaction_id}</p>}
                      {approverName && <p className="text-[11px] text-emerald-600 mt-0.5">✓ Approved by {approverName}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDTDecimal(Number(p.amount))}</p>
                      {canDownload ? (
                        <button
                          onClick={() => downloadPaymentReceipt(p, installmentNumber, approverName, approvedAt)}
                          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded-md border border-primary/20"
                        >
                          <Download className="w-3 h-3" /> Receipt
                        </button>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">Pending approval</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {payments.length > payLimit && (
                <button onClick={() => setPayLimit(l => l + 5)} className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg">
                  See more ({payments.length - payLimit} বাকি)
                </button>
              )}
            </div>
          )}
        </div>

        {/* My payment requests */}
        {myRequests.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold mb-3">My Requests</h2>
            <div className="space-y-2">
              {myRequests.map(r => (
                <div key={r.id} className="flex justify-between items-center p-3 bg-secondary/40 rounded-lg">
                  <div className="min-w-0">
                    <p className="font-mono font-bold tabular-nums">{formatBDTDecimal(Number(r.amount))}{r.payment_method ? ` · ${r.payment_method}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(r.payment_date || r.created_at), 'dd MMM yyyy')}{!r.payment_date ? ` · ${format(new Date(r.created_at), 'hh:mm a')}` : ''}</p>
                    {r.transaction_id && <p className="text-[11px] text-muted-foreground font-mono truncate">TrxID: {r.transaction_id}</p>}
                    {r.note && <p className="text-xs text-muted-foreground mt-0.5">{r.note}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' : r.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}



        <Dialog open={showRequest} onOpenChange={setShowRequest}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Installment Payment</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Admin approve করলে এটা installment হিসেবে count হবে।</p>
            <div className="space-y-3 mt-2">
              <div><Label>Amount (৳)</Label><Input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} /></div>
              <div>
                <Label>কোন মাধ্যমে টাকা পাঠিয়েছেন?</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Rocket">Rocket</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transaction ID</Label>
                <Input value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="যেমন: 8FA7CX12B9" />
              </div>
              <div><Label>Note (optional)</Label><Textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="অতিরিক্ত মন্তব্য" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequest(false)}>Cancel</Button>
              <Button onClick={handleSubmitRequest} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ───────── Admin & Member view ─────────
  const pendingRequests = payRequests.filter(r => r.status === 'pending');
  const rating = computeCustomerRating(phoneHistory as any, borrowerPhone || '');
  const isMediaPerson = !!user?.id && (
    loan?.media_person_id === user.id ||
    (loan as any)?.secondary_media_person_id === user.id
  );
  const canRequestDeposit = isMediaPerson && !isAdmin && !isClosed;
  return (
    <div className={`space-y-6 animate-fade-in max-w-3xl ${overdue ? 'p-4 -m-4 rounded-xl bg-destructive/5 ring-2 ring-destructive/40' : ''}`}>
      <div className="flex items-center justify-between">
        <Link to="/islamic-loans"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex gap-2 flex-wrap justify-end">
          <LoanContractPdf loan={loan} />
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={async () => {
              try {
                const { data: adminRoles } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
                const adminIds = (adminRoles || []).map((r: any) => r.user_id).filter(Boolean);
                await generateIslamicLoanSnapshotPDF({
                  loan,
                  mediaPersonId: loan.media_person_id || null,
                  secondaryMediaPersonId: (loan as any).secondary_media_person_id || null,
                      snapshot: visibleShareRows.map((r: any) => ({
                        member_id: r.memberId,
                        member_name: r.name,
                        share_percentage: r.sharePct,
                        is_member_deleted: false,
                      })),
                  allMembers: members as any,
                  adminIds,
                  excludedIds: (loan as any).excluded_member_ids || [],
                });
              } catch (e: any) {
                toast.error('PDF তৈরিতে সমস্যা: ' + (e?.message || ''));
              }
            }}><Download className="w-4 h-4 mr-1" /> Snapshot PDF</Button>
          )}
          {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>}
          {isAdmin && <Button size="sm" variant="outline" onClick={() => setShowDeposit(true)} disabled={isClosed}><Plus className="w-4 h-4 mr-1" /> Deposit</Button>}
          {canRequestDeposit && <Button size="sm" variant="outline" onClick={() => { setDepositAmt(String(monthly || '')); setShowRequest(true); }}><Plus className="w-4 h-4 mr-1" /> Deposit Request</Button>}
          {isAdmin && isClosed && <Button size="sm" variant="destructive" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>}
        </div>
      </div>


      {overdue && (
        <div className="bg-destructive text-destructive-foreground rounded-xl p-4 flex items-start gap-3 shadow-md">
          <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-base">এই মাসের installment এখনো পরিশোধ হয়নি</p>
            <p className="text-sm opacity-90 mt-0.5">Customer-কে remind করুন — payment হলে এই status স্বয়ংক্রিয়ভাবে সাদা হয়ে যাবে।</p>
          </div>
        </div>
      )}

      {/* Customer rating badge */}
      {rating.totalLoans > 0 && (
        <div className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-semibold">Customer Rating: {rating.score}/10</p>
              <p className="text-xs text-muted-foreground">
                {rating.totalLoans} loan · {rating.closedLoans} closed
                {rating.totalMonthsEarly > 0 && <span className="text-emerald-600"> · {rating.totalMonthsEarly} মাস early payoff</span>}
                {rating.overdueActive > 0 && <span className="text-destructive"> · {rating.overdueActive} overdue</span>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Other active loans for this customer — quick switcher */}
      {siblingLoans.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-warning" />
            <p className="text-sm font-semibold text-warning">
              একই customer-এর অন্য Islamic Loan ({siblingLoans.length})
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {siblingLoans.map(s => (
              <Link
                key={s.id}
                to={`/islamic-loans/${s.id}`}
                className="flex-1 min-w-[180px] bg-background border border-warning/20 rounded-lg p-3 hover:border-warning/40 hover:bg-warning/5 transition-colors shadow-subtle"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono bg-warning/10 text-warning px-1.5 py-0.5 rounded">{s.code}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{s.status}</span>
                </div>
                {s.product_name && <p className="text-xs font-medium mt-1.5 truncate text-foreground">{s.product_name}</p>}
                <p className="text-[11px] text-muted-foreground mt-0.5">Due: <span className="font-mono text-foreground">{formatBDT(Number(s.remaining_amount))}</span></p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{loan.code}</span>
            <h1 className="text-2xl font-bold mt-2">{borrowerName}</h1>
            {(loan as any).product_name && (
              <p className="text-sm font-medium mt-1 flex items-center gap-1 text-primary">
                <Package className="w-3.5 h-3.5" /> {(loan as any).product_name}
              </p>
            )}
            {borrowerPhone && <p className="text-sm text-muted-foreground font-mono mt-1">{borrowerPhone}</p>}
            {relPhone && <p className="text-xs text-muted-foreground font-mono">Relative: {relPhone}</p>}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${loan.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{loan.status}</span>
        </div>

        {(phoneDigits || relDigits) && (
          <div className="flex flex-wrap gap-2 mb-6">
            {phoneDigits && <>
              <a href={`tel:${borrowerPhone}`} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><Phone className="w-4 h-4" /> Call</a>
              <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
              <a href={`sms:${borrowerPhone}`} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><MessageSquare className="w-4 h-4" /> SMS</a>
            </>}
            {relDigits && (
              <a href={`tel:${relPhone}`} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><Phone className="w-4 h-4" /> Relative</a>
            )}
          </div>
        )}

        {isAdmin && (loan as any).customer_user_id && phoneDigits && (
          <div className="mb-6 border border-primary/30 bg-primary/5 rounded-lg p-3">
            <p className="text-xs font-semibold text-primary mb-2">Customer Login Credentials</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Phone:</span>{' '}
                <span className="font-mono font-semibold">{borrowerPhone}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Section:</span>{' '}
                <span className="font-semibold">Customer</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 text-[11px]"
                  onClick={async () => {
                    const np = window.prompt('নতুন password দিন (ন্যূনতম ৬ অক্ষর):', '123456');
                    if (!np || np.trim().length < 6) { toast.error('Password কমপক্ষে ৬ অক্ষর হতে হবে'); return; }
                    const { error } = await supabase.functions.invoke('create-customer', {
                      body: { phone: borrowerPhone, fullName: borrowerName, password: np.trim() },
                    });
                    if (error) { toast.error(error.message || 'Password reset failed'); return; }
                    toast.success('Customer এর password reset হয়েছে');
                  }}
                >
                  Reset Password
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Customer এই phone দিয়ে "Customer" section থেকে login করবে। Password ভুলে গেলে উপরের "Reset Password" বাটনে ক্লিক করে নতুন password সেট করুন।
            </p>
          </div>
        )}



        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Purchase</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(Number(loan.purchase_price))}</p></div>
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Sell Price</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(sellPriceN)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Monthly</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(monthly)}</p></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-secondary/50 rounded-lg p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingDown className="w-3 h-3" /> Due</div><p className="font-mono font-bold text-primary tabular-nums">{formatBDT(remaining)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingUp className="w-3 h-3" /> Paid</div><p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDT(paid)}</p></div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span><span>{installmentsPaid}/{loan.tenure_months} installments</span>
          </div>
          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="space-y-2 text-sm border-t border-border pt-4">
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Tenure</span><span className="font-medium">{loan.tenure_months} months · {loan.profit_percentage}% profit</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Start</span><span className="font-medium">{format(startDate, 'dd MMM yyyy')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> End</span><span className="font-medium">{format(endDate, 'dd MMM yyyy')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Media Person</span><span className="font-medium">{loan.media_person?.full_name || '—'} ({loan.media_person_profit_pct}%)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Fund %</span><span className="font-medium">{loan.fund_profit_pct}%</span></div>
          {Number(loan.discount_pct) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-medium text-destructive">−{loan.discount_pct}%</span></div>}
          {loan.comments && <div className="pt-2"><p className="text-xs text-muted-foreground mb-1">Comments</p><p className="text-sm">{loan.comments}</p></div>}
        </div>
      </div>

      {/* Share / Profit Distribution preview */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Member Shares & Profit</h2>
          <div className="flex gap-2 flex-wrap">
            {isAdmin && !alreadyDistributed && snapshot.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setShowShareEdit(true)}>
                <Pencil className="w-4 h-4 mr-1" /> Edit Shares
              </Button>
            )}
            {isAdmin && isClosed && !alreadyDistributed && profitTotals.net !== 0 && (
              <Button size="sm" variant={profitTotals.isLoss ? 'destructive' : 'default'} onClick={handleDistribute} disabled={busy}>
                <Sparkles className="w-4 h-4 mr-1" /> {profitTotals.isLoss ? 'Distribute Loss' : 'Distribute Profit'}
              </Button>
            )}
            {alreadyDistributed && <span className="text-xs text-emerald-600 font-medium">✓ Distributed</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 text-xs">
          <div className={`rounded-lg p-2 ${profitTotals.isLoss ? 'bg-destructive/10' : 'bg-secondary/50'}`}>
            <p className="text-muted-foreground">{profitTotals.isLoss ? 'Total Loss' : 'Total Profit'}</p>
            <p className={`font-mono font-bold tabular-nums ${profitTotals.isLoss ? 'text-destructive' : ''}`}>{formatBDTDecimal(Math.abs(profitTotals.total))}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Fund ({loan.fund_profit_pct}%)</p><p className="font-mono font-bold tabular-nums">{formatBDTDecimal(profitTotals.fund)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Media ({loan.media_person_profit_pct}%)</p><p className="font-mono font-bold tabular-nums">{formatBDTDecimal(profitTotals.media)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Admins ({(loan as any).admin_profit_pct ?? 5}%)</p><p className="font-mono font-bold tabular-nums">{formatBDTDecimal(profitTotals.admin)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2">
            <p className="text-muted-foreground">Member Pool (80%)</p>
            <p className={`font-mono font-bold tabular-nums ${profitTotals.isLoss ? 'text-destructive' : ''}`}>
              {profitTotals.isLoss ? '−' : ''}{formatBDTDecimal(Math.abs(profitTotals.memberPool))}
            </p>
          </div>
        </div>
        {profitTotals.isLoss && (
          <p className="text-[11px] text-destructive mb-3 italic">
            ⚠ Loss — সম্পূর্ণ ক্ষতি শুধুমাত্র members-দের snapshot % অনুযায়ী ভাগ হবে। Admin, Media person ও Fund এর ভাগ নেই।
          </p>
        )}

        {shareRows.filter(r => !r.isDeleted).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No member deposits at loan creation time</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-muted-foreground px-2">
              <div className="col-span-7">Member</div>
              <div className="col-span-2 text-right">Share</div>
              <div className="col-span-3 text-right">{profitTotals.isLoss ? 'Loss' : 'Profit'}</div>
            </div>
            {shareRows.filter(r => !r.isDeleted).map(r => (
              <div key={r.id} className="grid grid-cols-12 gap-2 text-sm rounded px-2 py-2 bg-secondary/30">
                <div className="col-span-7 truncate">{r.name}</div>
                <div className="col-span-2 text-right font-medium">{r.sharePct.toFixed(2)}%</div>
                <div className={`col-span-3 text-right font-mono tabular-nums text-xs ${r.expected < 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {r.expected < 0 ? '−' : ''}{formatBDTDecimal(Math.abs(r.expected))}
                </div>
              </div>
            ))}
            {(() => {
              const aliveSum = shareRows.filter(r => !r.isDeleted).reduce((s: number, r: any) => s + r.expected, 0);
              const fundGets = profitTotals.memberPool - aliveSum;
              return (
                <div className="border-t border-border/50 mt-2 pt-2 space-y-0.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active members total</span>
                    <span className="font-mono tabular-nums font-medium">{profitTotals.isLoss ? '−' : ''}{formatBDTDecimal(Math.abs(aliveSum))}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>→ Fund (residual only)</span>
                    <span className="font-mono tabular-nums font-medium">{profitTotals.isLoss ? '−' : ''}{formatBDTDecimal(Math.abs(fundGets))}</span>
                  </div>
                </div>
              );
            })()}
            <p className="text-[10px] text-muted-foreground mt-2 italic">প্রতি active member পান: Member Pool × তার % ÷ 100। Deleted/0% members পুরোপুরি বাদ; বাকি residual % Fund-এ যাবে।</p>
          </div>
        )}
      </div>

      <SnapshotShareEditor
        open={showShareEdit}
        onOpenChange={setShowShareEdit}
        table="islamic_loan_member_shares"
        rows={snapshot.map((s: any) => ({ id: s.id, member_id: s.member_id || null, member_name: s.member_name || 'Unknown', share_percentage: Number(s.share_percentage), is_member_deleted: !!s.is_member_deleted }))}
        onSaved={load}
      />

      <ExcludedMembersCard
        excludedIds={(loan as any).excluded_member_ids || []}
        reasons={(loan as any).exclusion_reasons || {}}
        memberById={new Map(members.map((m: any) => [m.id, m]))}
      />



      {/* Pending payment requests — view-only (approve/reject moved to admin dashboard) */}
      {isAdmin && pendingRequests.length > 0 && (
        <div className="bg-card border border-amber-500/40 rounded-xl p-5">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" /> Pending Customer Requests ({pendingRequests.length})
          </h2>
          <p className="text-xs text-muted-foreground mb-3">Approve / Reject করতে Admin Dashboard-এ যান।</p>
          <div className="space-y-2">
            {pendingRequests.map(r => (
              <div key={r.id} className="flex justify-between items-center p-3 bg-amber-500/5 rounded-lg gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono font-bold tabular-nums">{formatBDTDecimal(Number(r.amount))}{r.payment_method ? ` · ${r.payment_method}` : ''}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.payment_date || r.created_at), 'dd MMM yyyy')}{!r.payment_date ? ` · ${format(new Date(r.created_at), 'hh:mm a')}` : ''}</p>
                  {r.transaction_id && <p className="text-[11px] text-muted-foreground font-mono truncate">TrxID: {r.transaction_id}</p>}
                  {r.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.note}</p>}
                </div>
                <span className="text-[11px] px-2 py-1 rounded-full bg-warning/10 text-warning shrink-0">pending</span>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {payments.slice(0, payLimit).map((p, idx) => {
              const installmentNumber = installmentIndexById.get(p.id) || 0;
              const { approvedBy, approvedAt, approverName } = getPaymentApproval(p);
              const canDownload = !!approvedBy || !!approvedAt;
              return (
                <div key={p.id} className="flex justify-between items-center p-3 bg-secondary/40 rounded-lg gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{p.payment_type || 'installment'}{p.payment_method ? ` · ${p.payment_method}` : ''}</p>
                    <p className="text-xs text-muted-foreground">{format(new Date(p.payment_date || p.created_at), 'dd MMM yyyy')}{!p.payment_date ? ` · ${format(new Date(p.created_at), 'hh:mm a')}` : ''}</p>
                    {p.transaction_id && <p className="text-[11px] text-muted-foreground font-mono truncate">TrxID: {p.transaction_id}</p>}
                    {approverName && (
                      <p className="text-[11px] text-emerald-600 mt-0.5">✓ Approved by {approverName}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDTDecimal(Number(p.amount))}</p>
                    {canDownload ? (
                      <button
                        onClick={() => downloadPaymentReceipt(p, installmentNumber, approverName, approvedAt)}
                        className="flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded-md border border-primary/20"
                      >
                        <Download className="w-3 h-3" /> Receipt
                      </button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">Pending approval</span>
                    )}
                  </div>
                </div>
              );
            })}
            {payments.length > payLimit && (
              <button
                onClick={() => setPayLimit(l => l + 5)}
                className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg"
              >
                See more ({payments.length - payLimit} বাকি)
              </button>
            )}
          </div>
        )}
      </div>


      {/* Edit Sheet */}
      <Sheet open={showEdit} onOpenChange={setShowEdit}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Loan</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 mt-6">
              <div className="space-y-2">
                <Label>Issue / Create Date <span className="text-xs text-muted-foreground">(past date সাপোর্টেড)</span></Label>
                <DateField value={edit.issue_date || ''} onChange={(v) => setEdit({ ...edit, issue_date: v })} />
              </div>
              <div className="space-y-2"><Label>Borrower Name</Label><Input value={edit.borrower_name} onChange={e => setEdit({ ...edit, borrower_name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>পণ্যের নাম / Product Name</Label>
                <Input value={edit.product_name} onChange={e => setEdit({ ...edit, product_name: e.target.value })} placeholder="যেমন: iPhone 15" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Borrower Phone</Label><Input value={edit.borrower_phone} onChange={e => setEdit({ ...edit, borrower_phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Relative Phone</Label><Input value={edit.relative_phone} onChange={e => setEdit({ ...edit, relative_phone: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>পারিবারিক সদস্যের নাম</Label><Input value={(edit as any).relative_name || ''} onChange={e => setEdit({ ...edit, relative_name: e.target.value } as any)} /></div>
                <div className="space-y-2"><Label>সম্পর্ক</Label><Input value={(edit as any).relationship || ''} onChange={e => setEdit({ ...edit, relationship: e.target.value } as any)} placeholder="যেমন: বাবা, ভাই" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Purchase Price</Label><Input type="number" value={edit.purchase_price} onChange={e => setEdit({ ...edit, purchase_price: e.target.value })} /></div>
                <div className="space-y-2"><Label>Sell Price</Label><Input type="number" value={edit.sell_price} onChange={e => setEdit({ ...edit, sell_price: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Monthly Installment</Label><Input type="number" value={edit.monthly_installment} onChange={e => setEdit({ ...edit, monthly_installment: e.target.value })} /></div>
                <div className="space-y-2"><Label>Remaining Amount</Label><Input type="number" value={edit.remaining_amount} onChange={e => setEdit({ ...edit, remaining_amount: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tenure</Label>
                  <Select value={edit.tenure_months} onValueChange={v => setEdit({ ...edit, tenure_months: v, profit_percentage: String(calculateProfitPercentage(parseInt(v))) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 Months</SelectItem>
                      <SelectItem value="6">6 Months</SelectItem>
                      <SelectItem value="12">12 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Profit %</Label><Input type="number" value={edit.profit_percentage} onChange={e => setEdit({ ...edit, profit_percentage: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Discount %</Label><Input type="number" value={edit.discount_pct} onChange={e => setEdit({ ...edit, discount_pct: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Media Person</Label>
                <Select value={edit.media_person_id} onValueChange={v => setEdit({ ...edit, media_person_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Secondary Media Person <span className="text-xs text-muted-foreground">(optional — primary delete হলে অর্ধেক পাবে)</span></Label>
                <Select value={edit.secondary_media_person_id || 'none'} onValueChange={v => setEdit({ ...edit, secondary_media_person_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {members.filter(m => m.id !== edit.media_person_id).map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Media Person %</Label><Input type="number" value={edit.media_person_profit_pct} onChange={e => setEdit({ ...edit, media_person_profit_pct: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fund %</Label><Input type="number" value={edit.fund_profit_pct} onChange={e => setEdit({ ...edit, fund_profit_pct: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="defaulted">Defaulted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Comments</Label><Textarea value={edit.comments} onChange={e => setEdit({ ...edit, comments: e.target.value })} /></div>
              <div className="space-y-2 pt-2 border-t border-border">
                <Label>Payment Methods (customer-এর দেখার জন্য)</Label>
                <p className="text-xs text-muted-foreground -mt-1">এই loan-এর জন্য customer এই numbers/accounts-এ টাকা পাঠাবে।</p>
                <PaymentMethodsEditor
                  methods={edit.payment_methods || []}
                  onChange={(next) => setEdit({ ...edit, payment_methods: next })}
                />
              </div>
              <Button className="w-full" onClick={handleEditSave} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save Changes</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Deposit dialog */}
      <Dialog open={showDeposit} onOpenChange={setShowDeposit}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Deposit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount (৳)</Label><Input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} /></div>
            <div><Label>Type</Label>
              <Select value={depositType} onValueChange={setDepositType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="installment">Installment</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="full">Full Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Payment Method (optional)</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue placeholder="bKash / Nagad / Bank ..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bKash">bKash</SelectItem>
                  <SelectItem value="Nagad">Nagad</SelectItem>
                  <SelectItem value="Rocket">Rocket</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transaction ID (optional)</Label>
              <Input value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="যেমন: 8FA7CX12B9" />
            </div>
            <div>
              <Label>Payment Date</Label>
              <DateField value={paymentDate} onChange={setPaymentDate} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeposit(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Media-person deposit request dialog */}
      {canRequestDeposit && (
        <Dialog open={showRequest} onOpenChange={setShowRequest}>
          <DialogContent>
            <DialogHeader><DialogTitle>Deposit Request</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Admin approve করলে এটা installment হিসেবে count হবে।</p>
            <div className="space-y-3 mt-2">
              <div><Label>Amount (৳)</Label><Input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)} /></div>
              <div>
                <Label>কোন মাধ্যমে টাকা পাঠানো হয়েছে?</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bKash">bKash</SelectItem>
                    <SelectItem value="Nagad">Nagad</SelectItem>
                    <SelectItem value="Rocket">Rocket</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Card">Card</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Transaction ID</Label>
                <Input value={transactionId} onChange={e => setTransactionId(e.target.value)} placeholder="যেমন: 8FA7CX12B9" />
              </div>
              <div>
                <Label>Payment Date</Label>
                <DateField value={paymentDate} onChange={setPaymentDate} />
              </div>
              <div><Label>Note (optional)</Label><Textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="অতিরিক্ত মন্তব্য" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequest(false)}>Cancel</Button>
              <Button onClick={handleSubmitRequest} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this loan?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This permanently removes the loan and its payment records. Profit distributions for this loan will also be removed.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

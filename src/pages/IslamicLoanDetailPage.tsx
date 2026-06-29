import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, calculateProfitPercentage, calculateSellPrice, calculateMonthlyInstallment } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Phone, MessageCircle, MessageSquare, Loader2, ArrowLeft, Calendar, TrendingDown, TrendingUp,
  Clock, Pencil, Trash2, Plus, Sparkles, Users,
} from 'lucide-react';

export default function IslamicLoanDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const [depositAmt, setDepositAmt] = useState('');
  const [depositType, setDepositType] = useState('installment');

  const [edit, setEdit] = useState<any>(null);

  const load = async () => {
    if (!id) return;
    const isAdmin = role === 'admin';
    const loanQuery = isAdmin
      ? supabase.from('islamic_loans').select('*').eq('id', id).single()
      : (supabase as any).from('islamic_loans_public').select('*').eq('id', id).single();
    const [loanRes, payRes, memRes, depRes, distRes] = await Promise.all([
      loanQuery,
      supabase.from('islamic_loan_payments').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*').eq('is_deleted', false),
      supabase.from('deposits').select('*').eq('status', 'approved'),
      supabase.from('profit_distributions').select('*').eq('source_id', id).eq('source_type', 'islamic_loan'),
    ]);
    const members = memRes.data || [];
    const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
    const loan = loanRes.data ? { ...loanRes.data, media_person: byId.get(loanRes.data.media_person_id) || null } : null;
    const distributions = (distRes.data || []).map((d: any) => ({ ...d, member: byId.get(d.member_id) || null }));
    setLoan(loan);
    setPayments(payRes.data || []);
    setMembers(members);
    setDeposits(depRes.data || []);
    setDistributions(distributions);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (loan) {
      setEdit({
        borrower_name: loan.borrower_name || '',
        borrower_phone: loan.borrower_phone || '',
        relative_phone: loan.relative_phone || '',
        purchase_price: String(loan.purchase_price ?? ''),
        sell_price: String(loan.sell_price ?? ''),
        tenure_months: String(loan.tenure_months ?? '3'),
        profit_percentage: String(loan.profit_percentage ?? ''),
        discount_pct: String(loan.discount_pct ?? '0'),
        media_person_id: loan.media_person_id || '',
        media_person_profit_pct: String(loan.media_person_profit_pct ?? '5'),
        fund_profit_pct: String(loan.fund_profit_pct ?? '15'),
        monthly_installment: String(loan.monthly_installment ?? ''),
        remaining_amount: String(loan.remaining_amount ?? ''),
        status: loan.status || 'active',
        comments: loan.comments || '',
      });
    }
  }, [loan]);

  // Share calc: based on deposits approved BEFORE loan creation
  const shareRows = useMemo(() => {
    if (!loan) return [] as any[];
    const cutoff = new Date(loan.created_at).getTime();
    const eligible = deposits.filter(d => new Date(d.created_at).getTime() <= cutoff);
    const byMember = new Map<string, number>();
    eligible.forEach(d => {
      byMember.set(d.member_id, (byMember.get(d.member_id) || 0) + Number(d.amount));
    });
    const total = Array.from(byMember.values()).reduce((a, b) => a + b, 0);
    const sellP = Number(loan.sell_price);
    const purchaseP = Number(loan.purchase_price);
    const totalProfit = Math.max(0, sellP - purchaseP);
    const mediaCut = totalProfit * (Number(loan.media_person_profit_pct) || 0) / 100;
    const fundCut = totalProfit * (Number(loan.fund_profit_pct) || 0) / 100;
    const memberPool = Math.max(0, totalProfit - mediaCut - fundCut);
    const rows = Array.from(byMember.entries()).map(([memberId, dep]) => {
      const m = members.find(x => x.id === memberId);
      const pct = total > 0 ? (dep / total) * 100 : 0;
      return {
        memberId,
        name: m?.full_name || 'Unknown',
        deposit: dep,
        sharePct: pct,
        expected: memberPool * pct / 100,
      };
    }).sort((a, b) => b.sharePct - a.sharePct);
    return rows;
  }, [loan, deposits, members]);

  const profitTotals = useMemo(() => {
    if (!loan) return { total: 0, fund: 0, media: 0, memberPool: 0 };
    const total = Math.max(0, Number(loan.sell_price) - Number(loan.purchase_price));
    const fund = total * (Number(loan.fund_profit_pct) || 0) / 100;
    const media = total * (Number(loan.media_person_profit_pct) || 0) / 100;
    return { total, fund, media, memberPool: Math.max(0, total - fund - media) };
  }, [loan]);

  const alreadyDistributed = distributions.length > 0;

  const handleEditSave = async () => {
    setBusy(true);
    const payload: any = {
      borrower_name: edit.borrower_name.trim() || null,
      borrower_phone: edit.borrower_phone.trim() || null,
      relative_phone: edit.relative_phone.trim() || null,
      purchase_price: parseFloat(edit.purchase_price) || 0,
      sell_price: parseFloat(edit.sell_price) || 0,
      tenure_months: parseInt(edit.tenure_months) || 3,
      profit_percentage: parseFloat(edit.profit_percentage) || 0,
      discount_pct: parseFloat(edit.discount_pct) || 0,
      media_person_id: edit.media_person_id || null,
      media_person_profit_pct: parseFloat(edit.media_person_profit_pct) || 0,
      fund_profit_pct: parseFloat(edit.fund_profit_pct) || 0,
      monthly_installment: parseFloat(edit.monthly_installment) || 0,
      remaining_amount: parseFloat(edit.remaining_amount) || 0,
      status: edit.status,
      comments: edit.comments,
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
    } as any);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Deposit recorded');
    setShowDeposit(false);
    setDepositAmt('');
    load();
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
    if (profitTotals.total <= 0) { toast.error('No profit to distribute'); return; }
    setBusy(true);
    const rows: any[] = [];
    if (profitTotals.fund > 0) {
      rows.push({ source_type: 'islamic_loan', source_id: id, member_id: null, amount: profitTotals.fund, share_percentage: Number(loan.fund_profit_pct), distribution_type: 'fund' });
    }
    if (profitTotals.media > 0 && loan.media_person_id) {
      rows.push({ source_type: 'islamic_loan', source_id: id, member_id: loan.media_person_id, amount: profitTotals.media, share_percentage: Number(loan.media_person_profit_pct), distribution_type: 'media_person' });
    }
    shareRows.forEach(r => {
      if (r.expected > 0) {
        rows.push({ source_type: 'islamic_loan', source_id: id, member_id: r.memberId, amount: r.expected, share_percentage: r.sharePct, distribution_type: 'share' });
      }
    });
    if (rows.length === 0) { setBusy(false); toast.error('Nothing to distribute'); return; }
    const { error } = await supabase.from('profit_distributions').insert(rows);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Profit distributed');
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!loan) return <div className="text-center text-muted-foreground py-12">Loan not found</div>;

  const sellPriceN = Number(loan.sell_price);
  const remaining = Number(loan.remaining_amount);
  const paid = sellPriceN - remaining;
  const monthly = Number(loan.monthly_installment);
  const startDate = loan.created_at ? new Date(loan.created_at) : new Date();
  const endDate = addMonths(startDate, loan.tenure_months);
  const installmentsPaid = monthly > 0 ? Math.floor(paid / monthly) : 0;
  const nextInstallmentDate = addMonths(startDate, Math.min(installmentsPaid + 1, loan.tenure_months));
  const progressPct = sellPriceN > 0 ? (paid / sellPriceN) * 100 : 0;

  const borrowerName = loan.borrower_name || loan.media_person?.full_name || 'N/A';
  const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
  const relPhone = loan.relative_phone || '';
  const phoneDigits = borrowerPhone?.replace(/[^0-9]/g, '');
  const relDigits = relPhone?.replace(/[^0-9]/g, '');
  const isClosed = loan.status === 'closed' || remaining <= 0;

  // ───────── Member view (non-admin): only deposit + call ─────────
  if (!isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in max-w-xl">
        <Link to="/islamic-loans"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{loan.code}</span>
            <h1 className="text-2xl font-bold mt-2">{borrowerName}</h1>
            {borrowerPhone && <p className="text-sm text-muted-foreground font-mono mt-1">{borrowerPhone}</p>}
          </div>
          {phoneDigits && (
            <div className="flex gap-2">
              <a href={`tel:${borrowerPhone}`} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><Phone className="w-4 h-4" /> Call</a>
              <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Due</p><p className="font-mono font-bold text-primary tabular-nums">{formatBDT(remaining)}</p></div>
            <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Monthly</p><p className="font-mono font-bold tabular-nums">{formatBDT(monthly)}</p></div>
          </div>
          <Button className="w-full" onClick={() => setShowDeposit(true)} disabled={isClosed}>
            <Plus className="w-4 h-4 mr-1" /> Deposit
          </Button>
        </div>

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
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeposit(false)}>Cancel</Button>
              <Button onClick={handleDeposit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ───────── Admin view ─────────
  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <Link to="/islamic-loans"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
          <Button size="sm" variant="outline" onClick={() => setShowDeposit(true)} disabled={isClosed}><Plus className="w-4 h-4 mr-1" /> Deposit</Button>
          <Button size="sm" variant="destructive" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
        </div>
      </div>

      {/* Header card */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{loan.code}</span>
            <h1 className="text-2xl font-bold mt-2">{borrowerName}</h1>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Member Shares & Profit</h2>
          {isClosed && !alreadyDistributed && (
            <Button size="sm" onClick={handleDistribute} disabled={busy}>
              <Sparkles className="w-4 h-4 mr-1" /> Distribute Profit
            </Button>
          )}
          {alreadyDistributed && <span className="text-xs text-emerald-600 font-medium">✓ Distributed</span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-xs">
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Total Profit</p><p className="font-mono font-bold tabular-nums">{formatBDT(profitTotals.total)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Fund ({loan.fund_profit_pct}%)</p><p className="font-mono font-bold tabular-nums">{formatBDT(profitTotals.fund)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Media ({loan.media_person_profit_pct}%)</p><p className="font-mono font-bold tabular-nums">{formatBDT(profitTotals.media)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-2"><p className="text-muted-foreground">Member Pool</p><p className="font-mono font-bold tabular-nums">{formatBDT(profitTotals.memberPool)}</p></div>
        </div>

        {shareRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No member deposits at loan creation time</p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-2 text-[10px] uppercase text-muted-foreground px-2">
              <div className="col-span-5">Member</div>
              <div className="col-span-3 text-right">Deposit</div>
              <div className="col-span-2 text-right">Share</div>
              <div className="col-span-2 text-right">Profit</div>
            </div>
            {shareRows.map(r => (
              <div key={r.memberId} className="grid grid-cols-12 gap-2 text-sm bg-secondary/30 rounded px-2 py-2">
                <div className="col-span-5 truncate">{r.name}</div>
                <div className="col-span-3 text-right font-mono tabular-nums text-xs">{formatBDT(r.deposit)}</div>
                <div className="col-span-2 text-right font-medium">{r.sharePct.toFixed(2)}%</div>
                <div className="col-span-2 text-right font-mono tabular-nums text-emerald-600 text-xs">{formatBDT(r.expected)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">Transaction History</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
        ) : (
          <div className="space-y-2">
            {payments.map(p => (
              <div key={p.id} className="flex justify-between items-center p-3 bg-secondary/40 rounded-lg">
                <div>
                  <p className="text-sm font-medium capitalize">{p.payment_type || 'installment'}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(p.created_at), 'dd MMM yyyy · hh:mm a')}</p>
                </div>
                <p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDT(Number(p.amount))}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={showEdit} onOpenChange={setShowEdit}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Loan</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 mt-6">
              <div className="space-y-2"><Label>Borrower Name</Label><Input value={edit.borrower_name} onChange={e => setEdit({ ...edit, borrower_name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Borrower Phone</Label><Input value={edit.borrower_phone} onChange={e => setEdit({ ...edit, borrower_phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Relative Phone</Label><Input value={edit.relative_phone} onChange={e => setEdit({ ...edit, relative_phone: e.target.value })} /></div>
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeposit(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, ArrowDownLeft, ArrowUpRight, ChevronDown, Coins, Pencil, Trash2 } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateCashInHandPDF } from '@/lib/pdfGenerator';

type EditableTable =
  | 'fund_transactions'
  | 'project_transactions'
  | 'islamic_loan_payments'
  | 'deposits'
  | 'member_loan_repayments';

type Row = {
  id: string;
  created_at: string | null;
  source: 'Fund' | 'Project' | 'Islamic Loan' | 'Deposit' | 'Profit' | 'Member Loan';
  direction: 'in' | 'out';
  amount: number;
  reason: string;
  /** Extra detail lines shown under the main reason. */
  meta?: string[];
  /** Underlying table + row id, so admin can edit/delete. */
  editable?: {
    table: EditableTable;
    rowId: string;
    hasReason: boolean;
    /** Deposits store signed amount (negative = withdrawal); preserve sign on edit. */
    signed?: boolean;
  };
};

const shortId = (id: string) => (id || '').replace(/-/g, '').slice(-6).toUpperCase();
const fmtMethod = (m?: string | null) => {
  if (!m) return null;
  const map: Record<string, string> = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', cash: 'Cash', bank: 'Bank' };
  const k = m.toLowerCase();
  return map[k] || m;
};
const fmtMonth = (my?: string | null) => {
  if (!my) return null;
  try {
    const d = new Date(my.length <= 7 ? `${my}-01` : my);
    if (!isNaN(d.getTime())) return format(d, 'MMM yyyy');
  } catch {}
  return my;
};

const PREVIEW_LIMIT = 10;

export default function CashInHandPage() {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [visibleCount, setVisibleCount] = useState(PREVIEW_LIMIT);

  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel('cash-in-hand')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_transactions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_transactions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loan_payments' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profit_distributions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loan_repayments' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    const [fundRes, projRes, ilRes, ilPayRes, depRes, distRes, projectsRes, mlRes, mlPayRes, profilesRes] = await Promise.all([
      supabase.from('fund_transactions').select('*'),
      supabase.from('project_transactions').select('*'),
      supabase.from('islamic_loans').select('id, code, product_name, borrower_name, purchase_price, created_at'),
      supabase.from('islamic_loan_payments').select('*'),
      supabase.from('deposits').select('*').eq('status', 'approved'),
      supabase.from('profit_distributions').select('*'),
      supabase.from('projects').select('id, name'),
      supabase.from('member_loans').select('*'),
      supabase.from('member_loan_repayments').select('*').eq('status', 'approved'),
      supabase.from('profiles').select('id, full_name'),
    ]);

    const projectName = new Map<string, string>();
    (projectsRes.data || []).forEach((p: any) => projectName.set(p.id, p.name));

    const memberName = new Map<string, string>();
    (profilesRes.data || []).forEach((p: any) => memberName.set(p.id, p.full_name || 'Member'));

    const mlById = new Map<string, any>();
    (mlRes.data || []).forEach((l: any) => mlById.set(l.id, l));

    const ilById = new Map<string, any>();
    (ilRes.data || []).forEach((l: any) => ilById.set(l.id, l));

    const merged: Row[] = [];

    // Deposits (approved) — positive = deposit (IN), negative = withdrawal (OUT)
    (depRes.data || []).forEach((d: any) => {
      const amt = Number(d.amount || 0);
      const isWithdraw = amt < 0;
      const name = memberName.get(d.member_id) || 'Member';
      const meta = [
        `Ref: DEP-${shortId(d.id)}`,
        `Member ID: ${shortId(d.member_id || '')}`,
      ];
      const method = fmtMethod(d.payment_method);
      if (method) meta.push(`Via: ${method}`);
      const month = fmtMonth(d.month_year);
      if (month) meta.push(`For: ${month}`);
      if (d.note) meta.push(`Note: ${d.note}`);
      merged.push({
        id: `dep-${d.id}`,
        created_at: d.created_at,
        source: 'Deposit',
        direction: isWithdraw ? 'out' : 'in',
        amount: Math.abs(amt),
        reason: `${isWithdraw ? 'Member withdraw' : 'Member deposit'} — ${name}`,
        meta,
        editable: { table: 'deposits', rowId: d.id, hasReason: false, signed: true },
      });
    });

    // Fund transactions — skip auto-created "profit share" rows from loan
    // distributions (they mirror money already counted as IL installments).
    (fundRes.data || []).forEach((t: any) => {
      const reason: string = t.reason || '';
      const isProfitInternal = /profit share|Admin share.*Fund/i.test(reason);
      if (isProfitInternal) return;
      const meta = [`Ref: FND-${shortId(t.id)}`];
      const method = fmtMethod(t.payment_method);
      if (method) meta.push(`Via: ${method}`);
      if (t.note) meta.push(`Note: ${t.note}`);
      merged.push({
        id: `fund-${t.id}`,
        created_at: t.created_at,
        source: 'Fund',
        direction: t.type === 'in' || t.type === 'income' ? 'in' : 'out',
        amount: Number(t.amount || 0),
        reason: reason || 'Fund transaction',
        meta,
        editable: { table: 'fund_transactions', rowId: t.id, hasReason: true },
      });
    });

    // Project transactions
    (projRes.data || []).forEach((t: any) => {
      const meta = [
        `Ref: PRJ-${shortId(t.id)}`,
        `Project ID: ${shortId(t.project_id || '')}`,
      ];
      const method = fmtMethod(t.payment_method);
      if (method) meta.push(`Via: ${method}`);
      if (t.note) meta.push(`Note: ${t.note}`);
      merged.push({
        id: `proj-${t.id}`,
        created_at: t.created_at,
        source: 'Project',
        direction: t.type === 'income' ? 'in' : 'out',
        amount: Number(t.amount || 0),
        reason: `${projectName.get(t.project_id) || 'Project'} — ${t.reason || (t.type === 'income' ? 'Income' : 'Expense')}`,
        meta,
        editable: { table: 'project_transactions', rowId: t.id, hasReason: true },
      });
    });

    // Islamic loan purchases (money OUT) — NOT editable here (managed on loan page)
    (ilRes.data || []).forEach((l: any) => merged.push({
      id: `il-${l.id}`,
      created_at: l.created_at,
      source: 'Islamic Loan',
      direction: 'out',
      amount: Number(l.purchase_price || 0),
      reason: `Purchase — ${l.product_name || l.code || 'Loan'}${l.borrower_name ? ` (${l.borrower_name})` : ''}`,
      meta: [
        `Ref: ${l.code || `ILN-${shortId(l.id)}`}`,
        `Loan ID: ${shortId(l.id)}`,
      ],
    }));

    // Islamic loan payments (money IN)
    (ilPayRes.data || []).forEach((p: any) => {
      const l = ilById.get(p.loan_id);
      const meta = [
        `Ref: ILP-${shortId(p.id)}`,
        `Loan: ${l?.code || shortId(p.loan_id || '')}`,
      ];
      if (l?.borrower_name) meta.push(`Borrower: ${l.borrower_name}`);
      const method = fmtMethod(p.payment_method);
      if (method) meta.push(`Via: ${method}`);
      if (p.payment_date) meta.push(`For: ${format(new Date(p.payment_date), 'MMM d, yyyy')}`);
      if (p.note) meta.push(`Note: ${p.note}`);
      merged.push({
        id: `ilp-${p.id}`,
        created_at: p.created_at,
        source: 'Islamic Loan',
        direction: 'in',
        amount: Number(p.amount || 0),
        reason: `${p.payment_type === 'advance' ? 'Advance' : 'Installment'} — ${l?.product_name || l?.code || 'Loan'}`,
        meta,
        editable: { table: 'islamic_loan_payments', rowId: p.id, hasReason: false },
      });
    });

    // Member loan disbursements (money OUT) — NOT editable here
    (mlRes.data || []).forEach((l: any) => {
      if (l.status !== 'approved' && l.status !== 'repaid') return;
      merged.push({
        id: `ml-${l.id}`,
        created_at: l.approved_at || l.created_at,
        source: 'Member Loan',
        direction: 'out',
        amount: Number(l.approved_amount || 0),
        reason: `Loan disbursed — ${memberName.get(l.member_id) || 'Member'}`,
        meta: [
          `Ref: MLN-${shortId(l.id)}`,
          `Member ID: ${shortId(l.member_id || '')}`,
        ],
      });
    });

    // Member loan repayments (money IN)
    (mlPayRes.data || []).forEach((r: any) => {
      const l = mlById.get(r.loan_id);
      const meta = [
        `Ref: MLP-${shortId(r.id)}`,
        `Loan ID: ${shortId(r.loan_id || '')}`,
      ];
      const method = fmtMethod(r.payment_method);
      if (method) meta.push(`Via: ${method}`);
      if (r.payment_date) meta.push(`For: ${format(new Date(r.payment_date), 'MMM d, yyyy')}`);
      if (r.note) meta.push(`Note: ${r.note}`);
      merged.push({
        id: `mlp-${r.id}`,
        created_at: r.approved_at || r.created_at,
        source: 'Member Loan',
        direction: 'in',
        amount: Number(r.amount || 0),
        reason: `Loan repayment — ${l ? (memberName.get(l.member_id) || 'Member') : 'Member'}`,
        meta,
        editable: { table: 'member_loan_repayments', rowId: r.id, hasReason: false },
      });
    });

    merged.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    setRows(merged);
    setLoading(false);
  };

  const totals = useMemo(() => {
    const inn = rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
    const out = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
    return { inn, out, net: inn - out };
  }, [rows]);

  const openEdit = (r: Row) => {
    setEditRow(r);
    setEditAmount(String(r.amount));
    setEditReason(r.reason);
  };

  const handleSave = async () => {
    if (!editRow?.editable) return;
    const amt = parseFloat(editAmount);
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('সঠিক amount দিন'); return; }
    setSaving(true);
    const { table, rowId, hasReason, signed } = editRow.editable;
    const payload: any = { amount: signed && editRow.direction === 'out' ? -amt : amt };
    if (hasReason) payload.reason = editReason.trim() || null;
    const { error } = await (supabase as any).from(table).update(payload).eq('id', rowId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction update হয়েছে');
    setEditRow(null);
    fetchAll();
  };

  const handleDelete = async () => {
    if (!deleteRow?.editable) return;
    setDeleting(true);
    const { table, rowId } = deleteRow.editable;
    const { error } = await (supabase as any).from(table).delete().eq('id', rowId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction delete হয়েছে');
    setDeleteRow(null);
    fetchAll();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const visible = rows.slice(0, visibleCount);
  const hiddenCount = Math.max(0, rows.length - visibleCount);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-[hsl(var(--warning))]" />
            Cash in Hand
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Actual cash movements — deposits, loan disbursements & repayments, project & fund entries
          </p>
        </div>
        <PdfPeriodButton
          label="Cash in Hand PDF"
          onDownload={(p) => generateCashInHandPDF(rows, p)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total In</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatBDT(totals.inn)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Out</p>
          <p className="text-xl font-bold text-destructive tabular-nums">{formatBDT(totals.out)}</p>
        </div>
        <div className="bg-[hsl(var(--warning)/0.12)] border border-[hsl(var(--warning)/0.35)] rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-[hsl(var(--warning))] uppercase tracking-wider mb-2">Cash in Hand</p>
          <p className="text-xl font-bold tabular-nums text-foreground">{formatBDT(totals.net)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {visible.map(r => (
              <div key={r.id} className="flex items-start gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  r.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
                }`}>
                  {r.direction === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">{r.reason}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-medium">{r.source}</span>
                    {r.created_at ? ` · ${format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}` : ''}
                  </p>
                  {r.meta && r.meta.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {r.meta.map((m, i) => (
                        <span
                          key={i}
                          className="text-[11px] leading-tight text-muted-foreground bg-muted/50 border border-border/60 rounded px-1.5 py-0.5 break-all"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <p className={`text-sm font-semibold tabular-nums shrink-0 mt-0.5 ${
                  r.direction === 'in' ? 'text-emerald-600' : 'text-destructive'
                }`}>
                  {r.direction === 'in' ? '+' : '-'}{formatBDT(r.amount)}
                </p>
                {isAdmin && r.editable && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)} title="Edit">
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteRow(r)} title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {hiddenCount > 0 && (
              <div className="px-5 py-3 flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setVisibleCount(c => c + PREVIEW_LIMIT)}
                >
                  See more ({Math.min(PREVIEW_LIMIT, hiddenCount)} of {hiddenCount})
                  <ChevronDown className="w-4 h-4" />
                </Button>
                {visibleCount > PREVIEW_LIMIT && (
                  <Button
                    variant="ghost"
                    className="text-sm text-muted-foreground hover:text-foreground"
                    onClick={() => setVisibleCount(PREVIEW_LIMIT)}
                  >
                    See less
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>
              {editRow?.source} · {editRow?.direction === 'in' ? 'Money In' : 'Money Out'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Amount (৳)</Label>
              <Input type="number" step="0.01" min="0" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
            </div>
            {editRow?.editable?.hasReason && (
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>এই transaction delete করবেন?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRow?.reason} — {deleteRow ? formatBDT(deleteRow.amount) : ''} ({deleteRow?.source})
              <br />
              এই action-এর সাথে সাথে Cash in Hand-এর calculation update হয়ে যাবে। এটি undo করা যাবে না।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

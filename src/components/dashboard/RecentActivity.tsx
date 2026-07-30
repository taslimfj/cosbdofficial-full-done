import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

type SourceTable =
  | 'fund_transactions'
  | 'deposits'
  | 'project_transactions'
  | 'islamic_loan_payments'
  | 'member_loan_repayments'
  | 'customer_payment_requests'
  | 'profit_distributions_group';

interface UnifiedTx {
  id: string;
  rawId: string;
  table: SourceTable;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  label: string;
  category: string;
  reason?: string;
  type?: string;
  groupKey?: { source_type: string; source_id: string; isLoss: boolean };
}

const PAGE_SIZE = 3;
const PAGE_STEP = 5;

export function RecentActivity() {
  const { role } = useAuth();
  const [transactions, setTransactions] = useState<UnifiedTx[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<UnifiedTx | null>(null);
  const [form, setForm] = useState<{ amount: string; reason: string; type: string }>({ amount: '', reason: '', type: 'in' });
  const [submitting, setSubmitting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [
        fundRes,
        depRes,
        profitRes,
        projTxRes,
        islamicPayRes,
        memberRepayRes,
        custPayRes,
        projectsRes,
        islamicLoansRes,
      ] = await Promise.all([
        supabase.from('fund_transactions').select('id, amount, type, reason, created_at').order('created_at', { ascending: false }).limit(100),
        supabase.from('deposits').select('id, amount, status, created_at, member:profiles!deposits_member_id_fkey(full_name)').eq('status', 'approved').order('created_at', { ascending: false }).limit(100),
        supabase.from('profit_distributions').select('id, amount, distribution_type, source_type, source_id, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('project_transactions').select('id, amount, type, reason, created_at, project:projects(name, code)').order('created_at', { ascending: false }).limit(100),
        supabase.from('islamic_loan_payments').select('id, amount, payment_type, created_at, loan:islamic_loans(borrower_name, code)').order('created_at', { ascending: false }).limit(100),
        supabase.from('member_loan_repayments').select('id, amount, status, created_at, loan:member_loans(member:profiles!member_loans_member_id_fkey(full_name))').eq('status', 'approved').order('created_at', { ascending: false }).limit(100),
        supabase.from('customer_payment_requests').select('id, amount, status, created_at, loan:islamic_loans(borrower_name, code)').eq('status', 'approved').order('created_at', { ascending: false }).limit(100),
        supabase.from('projects').select('id, name, code'),
        supabase.from('islamic_loans').select('id, borrower_name, code'),
      ]);

      const all: UnifiedTx[] = [];

      (fundRes.data || []).forEach((r: any) => {
        const reason = (r.reason || '').toLowerCase();
        if (reason.includes('profit share') || reason.includes('loss share') || reason.includes('profit distribution') || reason.includes('loss distribution')) return;
        all.push({
          id: `fund-${r.id}`, rawId: r.id, table: 'fund_transactions',
          date: r.created_at, amount: Number(r.amount || 0),
          direction: r.type === 'in' || r.type === 'income' ? 'in' : 'out',
          label: r.reason || 'Fund Transaction', category: 'Fund',
          reason: r.reason || '', type: r.type,
        });
      });

      (depRes.data || []).forEach((r: any) => all.push({
        id: `dep-${r.id}`, rawId: r.id, table: 'deposits',
        date: r.created_at, amount: Number(r.amount || 0), direction: 'in',
        label: `${r.member?.full_name || 'Member'} deposit`, category: 'Deposit',
      }));

      const projectMap = new Map<string, any>();
      (projectsRes.data || []).forEach((p: any) => projectMap.set(p.id, p));
      const loanMap = new Map<string, any>();
      (islamicLoansRes.data || []).forEach((l: any) => loanMap.set(l.id, l));

      const groups = new Map<string, { total: number; isLoss: boolean; latest: string; source_type: string; source_id: string }>();
      (profitRes.data || []).forEach((r: any) => {
        const isLoss = r.distribution_type === 'loss' || r.distribution_type === 'loss_deleted_to_fund';
        const key = `${r.source_type}:${r.source_id}:${isLoss ? 'loss' : 'profit'}`;
        const existing = groups.get(key);
        const amt = Number(r.amount || 0);
        if (existing) {
          existing.total += amt;
          if (new Date(r.created_at) > new Date(existing.latest)) existing.latest = r.created_at;
        } else {
          groups.set(key, { total: amt, isLoss, latest: r.created_at, source_type: r.source_type, source_id: r.source_id });
        }
      });

      groups.forEach((g, key) => {
        let sourceLabel = 'Unknown';
        if (g.source_type === 'project') {
          const p = projectMap.get(g.source_id);
          sourceLabel = p ? `Project ${p.code || p.name}` : 'Project';
        } else if (g.source_type === 'islamic_loan') {
          const l = loanMap.get(g.source_id);
          sourceLabel = l ? `Islamic Loan ${l.code || l.borrower_name}` : 'Islamic Loan';
        }
        all.push({
          id: `pdg-${key}`, rawId: key, table: 'profit_distributions_group',
          date: g.latest, amount: g.total,
          direction: g.isLoss ? 'out' : 'in',
          label: `${g.isLoss ? 'Loss' : 'Profit'} distribution — ${sourceLabel}`,
          category: g.isLoss ? 'Loss' : 'Profit',
          groupKey: { source_type: g.source_type, source_id: g.source_id, isLoss: g.isLoss },
        });
      });

      (projTxRes.data || []).forEach((r: any) => all.push({
        id: `pt-${r.id}`, rawId: r.id, table: 'project_transactions',
        date: r.created_at, amount: Number(r.amount || 0),
        direction: r.type === 'income' ? 'in' : 'out',
        label: `Project ${r.project?.code || r.project?.name || ''} — ${r.reason || r.type}`,
        category: 'Project', reason: r.reason || '', type: r.type,
      }));

      (islamicPayRes.data || []).forEach((r: any) => all.push({
        id: `ilp-${r.id}`, rawId: r.id, table: 'islamic_loan_payments',
        date: r.created_at, amount: Number(r.amount || 0), direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} — Loan Payment${r.loan?.code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Loan',
      }));

      (memberRepayRes.data || []).forEach((r: any) => all.push({
        id: `mlr-${r.id}`, rawId: r.id, table: 'member_loan_repayments',
        date: r.created_at, amount: Number(r.amount || 0), direction: 'in',
        label: `${r.loan?.member?.full_name || 'Member'} — Loan Repayment`,
        category: 'Member Loan',
      }));

      (custPayRes.data || []).forEach((r: any) => all.push({
        id: `cpr-${r.id}`, rawId: r.id, table: 'customer_payment_requests',
        date: r.created_at, amount: Number(r.amount || 0), direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} — Payment${r.loan?.code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Payment',
      }));

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(all);
    };
    load();
  }, [reloadKey]);

  const openEdit = (tx: UnifiedTx) => {
    setEditing(tx);
    setForm({ amount: String(tx.amount), reason: tx.reason || '', type: tx.type || (tx.direction === 'in' ? 'in' : 'out') });
  };

  const handleSave = async () => {
    if (!editing) return;
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) { toast.error('সঠিক amount দিন'); return; }
    setSubmitting(true);
    let error: any = null;
    if (editing.table === 'fund_transactions') {
      ({ error } = await supabase.from('fund_transactions').update({ amount: amt, reason: form.reason.trim() || null, type: form.type }).eq('id', editing.rawId));
    } else if (editing.table === 'project_transactions') {
      ({ error } = await supabase.from('project_transactions').update({ amount: amt, reason: form.reason.trim() || null, type: form.type }).eq('id', editing.rawId));
    } else if (editing.table === 'deposits') {
      ({ error } = await supabase.from('deposits').update({ amount: amt }).eq('id', editing.rawId));
    } else if (editing.table === 'islamic_loan_payments') {
      ({ error } = await supabase.from('islamic_loan_payments').update({ amount: amt }).eq('id', editing.rawId));
    } else if (editing.table === 'member_loan_repayments') {
      ({ error } = await supabase.from('member_loan_repayments').update({ amount: amt }).eq('id', editing.rawId));
    } else if (editing.table === 'customer_payment_requests') {
      ({ error } = await supabase.from('customer_payment_requests').update({ amount: amt }).eq('id', editing.rawId));
    }
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction update হয়েছে');
    setEditing(null);
    setReloadKey(k => k + 1);
  };

  const handleDelete = async (tx: UnifiedTx) => {
    let error: any = null;
    if (tx.table === 'profit_distributions_group' && tx.groupKey) {
      const dt = tx.groupKey.isLoss
        ? ['loss', 'loss_deleted_to_fund', 'loss_share']
        : ['profit', 'profit_deleted_to_fund', 'profit_to_fund', 'fund', 'profit_share', 'manager', 'media', 'admin'];
      ({ error } = await supabase.from('profit_distributions').delete()
        .eq('source_type', tx.groupKey.source_type)
        .eq('source_id', tx.groupKey.source_id)
        .in('distribution_type', dt));
    } else {
      ({ error } = await supabase.from(tx.table as any).delete().eq('id', tx.rawId));
    }
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction delete হয়েছে');
    setReloadKey(k => k + 1);
  };

  const shown = transactions.slice(0, visible);
  const hasMore = visible < transactions.length;
  const isAdmin = role === 'admin';

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Recent Financial Activity</h3>
      </div>
      {transactions.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {shown.map(tx => (
              <div key={tx.id} className="flex items-start gap-3 px-4 sm:px-5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  tx.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
                }`}>
                  {tx.direction === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground break-words whitespace-normal">{tx.label}</p>
                  <p className="text-xs text-muted-foreground break-words whitespace-normal">
                    <span className="uppercase tracking-wide">{tx.category}</span>
                    {tx.date ? ` · ${format(new Date(tx.date), 'MMM d, yyyy')}` : ''}
                  </p>
                  <p className={`sm:hidden mt-1 text-sm font-semibold tabular-nums ${
                    tx.direction === 'in' ? 'text-emerald-600' : 'text-destructive'
                  }`}>
                    {tx.direction === 'in' ? '+' : '-'}{formatBDT(tx.amount)}
                  </p>
                </div>
                <p className={`hidden sm:block text-sm font-semibold tabular-nums shrink-0 ${
                  tx.direction === 'in' ? 'text-emerald-600' : 'text-destructive'
                }`}>
                  {tx.direction === 'in' ? '+' : '-'}{formatBDT(tx.amount)}
                </p>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    {tx.table !== 'profit_distributions_group' && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(tx)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {tx.table === 'profit_distributions_group'
                              ? 'এই source-এর সব profit/loss distribution rows delete হবে।'
                              : 'This action cannot be undone.'}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(tx)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={() => setVisible(v => v + PAGE_STEP)}
                className="w-full text-sm font-medium text-primary hover:underline"
              >
                See more
              </button>
            </div>
          )}
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 mt-2">
              <div className="text-xs text-muted-foreground">{editing.label}</div>
              {(editing.table === 'fund_transactions' || editing.table === 'project_transactions') && (
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {editing.table === 'fund_transactions' ? (
                        <>
                          <SelectItem value="in">Fund In</SelectItem>
                          <SelectItem value="out">Fund Out</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="income">Income</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Amount (৳)</Label>
                <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              {(editing.table === 'fund_transactions' || editing.table === 'project_transactions') && (
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
                </div>
              )}
              <Button className="w-full" onClick={handleSave} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

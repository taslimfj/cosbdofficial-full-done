import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowDownLeft, ArrowUpRight, ChevronDown, Coins } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateCashInHandPDF } from '@/lib/pdfGenerator';

type Row = {
  id: string;
  created_at: string | null;
  source: 'Fund' | 'Project' | 'Islamic Loan' | 'Deposit' | 'Profit' | 'Member Loan';
  direction: 'in' | 'out';
  amount: number;
  reason: string;
};

const PREVIEW_LIMIT = 10;

export default function CashInHandPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [showAll, setShowAll] = useState(false);

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

    // Deposits (approved) — cash coming in
    (depRes.data || []).forEach((d: any) => merged.push({
      id: `dep-${d.id}`,
      created_at: d.created_at,
      source: 'Deposit',
      direction: 'in',
      amount: Number(d.amount || 0),
      reason: 'Member deposit',
    }));

    // Profit distributions — cash out to members
    (distRes.data || []).forEach((r: any) => merged.push({
      id: `dist-${r.id}`,
      created_at: r.created_at,
      source: 'Profit',
      direction: 'in',
      amount: Number(r.amount || 0),
      reason: 'Profit distribution',
    }));

    // Fund transactions
    (fundRes.data || []).forEach((t: any) => merged.push({
      id: `fund-${t.id}`,
      created_at: t.created_at,
      source: 'Fund',
      direction: t.type === 'in' || t.type === 'income' ? 'in' : 'out',
      amount: Number(t.amount || 0),
      reason: t.reason || 'Fund transaction',
    }));

    // Project transactions
    (projRes.data || []).forEach((t: any) => merged.push({
      id: `proj-${t.id}`,
      created_at: t.created_at,
      source: 'Project',
      direction: t.type === 'income' ? 'in' : 'out',
      amount: Number(t.amount || 0),
      reason: `${projectName.get(t.project_id) || 'Project'} — ${t.reason || (t.type === 'income' ? 'Income' : 'Expense')}`,
    }));

    // Islamic loan purchases (money OUT)
    (ilRes.data || []).forEach((l: any) => merged.push({
      id: `il-${l.id}`,
      created_at: l.created_at,
      source: 'Islamic Loan',
      direction: 'out',
      amount: Number(l.purchase_price || 0),
      reason: `Purchase — ${l.product_name || l.code || 'Loan'}${l.borrower_name ? ` (${l.borrower_name})` : ''}`,
    }));

    // Islamic loan payments (money IN)
    (ilPayRes.data || []).forEach((p: any) => {
      const l = ilById.get(p.loan_id);
      merged.push({
        id: `ilp-${p.id}`,
        created_at: p.created_at,
        source: 'Islamic Loan',
        direction: 'in',
        amount: Number(p.amount || 0),
        reason: `${p.payment_type === 'advance' ? 'Advance' : 'Installment'} — ${l?.product_name || l?.code || 'Loan'}`,
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const visible = showAll ? rows : rows.slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-[hsl(var(--warning))]" />
            Cash in Hand
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capital + fund balance ± project ± Islamic loan cashflow
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
              <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  r.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
                }`}>
                  {r.direction === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{r.reason}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">{r.source}</span>
                    {r.created_at ? ` · ${format(new Date(r.created_at), 'MMM d, yyyy · h:mm a')}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold tabular-nums shrink-0 ${
                  r.direction === 'in' ? 'text-emerald-600' : 'text-destructive'
                }`}>
                  {r.direction === 'in' ? '+' : '-'}{formatBDT(r.amount)}
                </p>
              </div>
            ))}
            {rows.length > PREVIEW_LIMIT && (
              <div className="px-5 py-3">
                <Button
                  variant="ghost"
                  className="w-full gap-1 text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAll(s => !s)}
                >
                  {showAll ? 'See less' : `See more (${rows.length - PREVIEW_LIMIT})`}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? 'rotate-180' : ''}`} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

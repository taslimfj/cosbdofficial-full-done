import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT } from '@/lib/finance';
import { Loader2, ArrowDownLeft, ArrowUpRight, Coins, Users, Wallet, Landmark, Briefcase, HandCoins, Package } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateCashInHandPDF } from '@/lib/pdfGenerator';

type Row = {
  id: string;
  created_at: string | null;
  source: 'Fund' | 'Project' | 'Islamic Loan' | 'Deposit' | 'Member Loan' | 'Asset';
  direction: 'in' | 'out';
  amount: number;
  reason: string;
};

type SectionKey = 'Deposit' | 'Fund' | 'Islamic Loan' | 'Project' | 'Member Loan' | 'Asset';

const SECTIONS: { key: SectionKey; label: string; icon: any; description: string }[] = [
  { key: 'Deposit', label: 'Member Deposits', icon: Users, description: 'সদস্যদের deposit ও withdraw' },
  { key: 'Fund', label: 'Fund', icon: Wallet, description: 'Manual fund income ও expense' },
  { key: 'Islamic Loan', label: 'Islamic Loan', icon: Landmark, description: 'পণ্য purchase ও installment / advance' },
  { key: 'Project', label: 'Project', icon: Briefcase, description: 'Project income ও expense' },
  { key: 'Member Loan', label: 'Member Loan', icon: HandCoins, description: 'Loan disbursement ও repayment' },
  { key: 'Asset', label: 'Asset', icon: Package, description: 'Asset purchase ও scrap/sell' },
];

export default function CashInHandPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    fetchAll();
    const ch = supabase
      .channel('cash-in-hand')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_transactions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_transactions' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loan_payments' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loans' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loan_repayments' }, fetchAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    const [fundRes, projRes, ilRes, ilPayRes, depRes, mlRes, mlPayRes, assetRes] = await Promise.all([
      supabase.from('fund_transactions').select('*'),
      supabase.from('project_transactions').select('*'),
      supabase.from('islamic_loans').select('id, purchase_price, created_at, product_name, code'),
      supabase.from('islamic_loan_payments').select('*'),
      supabase.from('deposits').select('*').eq('status', 'approved'),
      supabase.from('member_loans').select('*'),
      supabase.from('member_loan_repayments').select('*').eq('status', 'approved'),
      supabase.from('assets').select('*').is('deleted_at', null),
    ]);

    // Asset-linked fund_transactions ids — will be reclassified as "Asset" instead of "Fund"
    const assetTxnIds = new Set<string>();
    (assetRes.data || []).forEach((a: any) => {
      if (a.purchase_txn_id) assetTxnIds.add(a.purchase_txn_id);
      if (a.scrap_txn_id) assetTxnIds.add(a.scrap_txn_id);
    });

    const merged: Row[] = [];

    (depRes.data || []).forEach((d: any) => {
      const amt = Number(d.amount || 0);
      const isWithdraw = amt < 0;
      merged.push({
        id: `dep-${d.id}`, created_at: d.created_at, source: 'Deposit',
        direction: isWithdraw ? 'out' : 'in', amount: Math.abs(amt),
        reason: isWithdraw ? 'Member withdraw' : 'Member deposit',
      });
    });

    (fundRes.data || []).forEach((t: any) => {
      const reason: string = t.reason || '';
      const isProfitInternal = /profit share|Admin share.*Fund|Fund-এ যোগ|Fund থেকে বিয়োগ/i.test(reason);
      if (isProfitInternal) return;
      const isAsset = assetTxnIds.has(t.id);
      merged.push({
        id: `fund-${t.id}`, created_at: t.created_at, source: isAsset ? 'Asset' : 'Fund',
        direction: t.type === 'in' || t.type === 'income' ? 'in' : 'out',
        amount: Number(t.amount || 0), reason: reason || (isAsset ? 'Asset transaction' : 'Fund transaction'),
      });
    });

    (projRes.data || []).forEach((t: any) => {
      merged.push({
        id: `proj-${t.id}`, created_at: t.created_at, source: 'Project',
        direction: t.type === 'income' ? 'in' : 'out',
        amount: Number(t.amount || 0), reason: t.reason || (t.type === 'income' ? 'Income' : 'Expense'),
      });
    });

    (ilRes.data || []).forEach((l: any) => merged.push({
      id: `il-${l.id}`, created_at: l.created_at, source: 'Islamic Loan',
      direction: 'out', amount: Number(l.purchase_price || 0),
      reason: `Purchase — ${l.product_name || l.code || 'Loan'}`,
    }));

    (ilPayRes.data || []).forEach((p: any) => merged.push({
      id: `ilp-${p.id}`, created_at: p.created_at, source: 'Islamic Loan',
      direction: 'in', amount: Number(p.amount || 0),
      reason: p.payment_type === 'advance' ? 'Advance' : 'Installment',
    }));

    (mlRes.data || []).forEach((l: any) => {
      if (l.status !== 'approved' && l.status !== 'repaid') return;
      merged.push({
        id: `ml-${l.id}`, created_at: l.approved_at || l.created_at, source: 'Member Loan',
        direction: 'out', amount: Number(l.approved_amount || 0), reason: 'Loan disbursed',
      });
    });

    (mlPayRes.data || []).forEach((r: any) => merged.push({
      id: `mlp-${r.id}`, created_at: r.approved_at || r.created_at, source: 'Member Loan',
      direction: 'in', amount: Number(r.amount || 0), reason: 'Loan repayment',
    }));

    setRows(merged);
    setLoading(false);
  };

  const { totals, sectionStats } = useMemo(() => {
    const inn = rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
    const out = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0);
    const stats: Record<SectionKey, { in: number; out: number; count: number }> = {
      'Deposit': { in: 0, out: 0, count: 0 },
      'Fund': { in: 0, out: 0, count: 0 },
      'Islamic Loan': { in: 0, out: 0, count: 0 },
      'Project': { in: 0, out: 0, count: 0 },
      'Member Loan': { in: 0, out: 0, count: 0 },
    };
    rows.forEach(r => {
      const s = stats[r.source as SectionKey];
      if (!s) return;
      s.count += 1;
      if (r.direction === 'in') s.in += r.amount; else s.out += r.amount;
    });
    return { totals: { inn, out, net: inn - out }, sectionStats: stats };
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Coins className="w-6 h-6 text-[hsl(var(--warning))]" />
            Cash in Hand
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Section অনুযায়ী total In / Out এর সারসংক্ষেপ
          </p>
        </div>
        <PdfPeriodButton
          label="Cash in Hand PDF"
          onDownload={(p) => generateCashInHandPDF(rows as any, p)}
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
        <div className="px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Section-wise Breakdown</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Profit distribution এর internal Fund entry double-counting এড়াতে বাদ দেওয়া হয়েছে
          </p>
        </div>
        <div className="divide-y divide-border">
          {SECTIONS.map(({ key, label, icon: Icon, description }) => {
            const s = sectionStats[key];
            const net = s.in - s.out;
            return (
              <div key={key} className="px-5 py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-muted text-foreground">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    <p className={`text-sm font-semibold tabular-nums ${net >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                      Net {net >= 0 ? '+' : '-'}{formatBDT(Math.abs(net))}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{description} · {s.count} transaction{s.count === 1 ? '' : 's'}</p>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total In</p>
                        <p className="text-sm font-semibold text-emerald-600 tabular-nums">+{formatBDT(s.in)}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-destructive/10 text-destructive flex items-center justify-center">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Out</p>
                        <p className="text-sm font-semibold text-destructive tabular-nums">-{formatBDT(s.out)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-foreground">সবগুলো section মিলিয়ে</p>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-semibold text-emerald-600 tabular-nums">In +{formatBDT(totals.inn)}</span>
            <span className="text-sm font-semibold text-destructive tabular-nums">Out -{formatBDT(totals.out)}</span>
            <span className="text-sm font-bold tabular-nums text-foreground">= {formatBDT(totals.net)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

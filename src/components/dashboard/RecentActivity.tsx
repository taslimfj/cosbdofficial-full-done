import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface UnifiedTx {
  id: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  label: string;
  category: string;
}

const PAGE_SIZE = 10;

export function RecentActivity() {
  const [transactions, setTransactions] = useState<UnifiedTx[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);

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

      // Fund transactions — exclude profit/loss share entries (already covered in grouped profit distribution)
      (fundRes.data || []).forEach((r: any) => {
        const reason = (r.reason || '').toLowerCase();
        if (reason.includes('profit share') || reason.includes('loss share') || reason.includes('profit distribution') || reason.includes('loss distribution')) return;
        all.push({
          id: `fund-${r.id}`,
          date: r.created_at,
          amount: Number(r.amount || 0),
          direction: r.type === 'in' || r.type === 'income' ? 'in' : 'out',
          label: r.reason || 'Fund Transaction',
          category: 'Fund',
        });
      });

      (depRes.data || []).forEach((r: any) => all.push({
        id: `dep-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.member?.full_name || 'Member'} deposit`,
        category: 'Deposit',
      }));

      // Group profit distributions by source (project / islamic loan)
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
          id: `pdg-${key}`,
          date: g.latest,
          amount: g.total,
          direction: g.isLoss ? 'out' : 'in',
          label: `${g.isLoss ? 'Loss' : 'Profit'} distribution — ${sourceLabel}`,
          category: g.isLoss ? 'Loss' : 'Profit',
        });
      });

      (projTxRes.data || []).forEach((r: any) => all.push({
        id: `pt-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: r.type === 'income' ? 'in' : 'out',
        label: `Project ${r.project?.code || r.project?.name || ''} — ${r.reason || r.type}`,
        category: 'Project',
      }));

      (islamicPayRes.data || []).forEach((r: any) => all.push({
        id: `ilp-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} — Loan Payment${r.loan?.code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Loan',
      }));

      (memberRepayRes.data || []).forEach((r: any) => all.push({
        id: `mlr-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.member?.full_name || 'Member'} — Loan Repayment`,
        category: 'Member Loan',
      }));

      (custPayRes.data || []).forEach((r: any) => all.push({
        id: `cpr-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} — Payment${r.loan?.code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Payment',
      }));

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(all);
    };
    load();
  }, []);

  const shown = transactions.slice(0, visible);
  const hasMore = visible < transactions.length;

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
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  tx.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
                }`}>
                  {tx.direction === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tx.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">{tx.category}</span>
                    {tx.date ? ` · ${format(new Date(tx.date), 'MMM d, yyyy')}` : ''}
                  </p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${
                  tx.direction === 'in' ? 'text-emerald-600' : 'text-destructive'
                }`}>
                  {tx.direction === 'in' ? '+' : '-'}{formatBDT(tx.amount)}
                </p>
              </div>
            ))}
          </div>
          {hasMore && (
            <div className="px-5 py-3 border-t border-border">
              <button
                onClick={() => setVisible(v => v + PAGE_SIZE)}
                className="w-full text-sm font-medium text-primary hover:underline"
              >
                See more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

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

export function RecentActivity() {
  const [transactions, setTransactions] = useState<UnifiedTx[]>([]);

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
      ] = await Promise.all([
        supabase.from('fund_transactions').select('id, amount, type, reason, created_at').order('created_at', { ascending: false }).limit(20),
        supabase.from('deposits').select('id, amount, status, created_at, member:profiles!deposits_member_id_fkey(full_name)').eq('status', 'approved').order('created_at', { ascending: false }).limit(20),
        supabase.from('profit_distributions').select('id, amount, distribution_type, created_at, member:profiles!profit_distributions_member_id_fkey(full_name)').order('created_at', { ascending: false }).limit(20),
        supabase.from('project_transactions').select('id, amount, type, reason, created_at, project:projects(name, code)').order('created_at', { ascending: false }).limit(20),
        supabase.from('islamic_loan_payments').select('id, amount, payment_type, created_at, loan:islamic_loans(borrower_name, code)').order('created_at', { ascending: false }).limit(20),
        supabase.from('member_loan_repayments').select('id, amount, status, created_at, loan:member_loans(member:profiles!member_loans_member_id_fkey(full_name))').eq('status', 'approved').order('created_at', { ascending: false }).limit(20),
        supabase.from('customer_payment_requests').select('id, amount, status, created_at, loan:islamic_loans(borrower_name, code)').eq('status', 'approved').order('created_at', { ascending: false }).limit(20),
      ]);

      const all: UnifiedTx[] = [];

      (fundRes.data || []).forEach((r: any) => all.push({
        id: `fund-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: r.type === 'in' ? 'in' : 'out',
        label: r.reason || 'Fund Transaction',
        category: 'Fund',
      }));

      (depRes.data || []).forEach((r: any) => all.push({
        id: `dep-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.member?.full_name || 'Member'} – Deposit`,
        category: 'Deposit',
      }));

      (profitRes.data || []).forEach((r: any) => all.push({
        id: `pd-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `Profit Distribution${r.member?.full_name ? ` – ${r.member.full_name}` : r.distribution_type ? ` – ${r.distribution_type}` : ''}`,
        category: 'Profit',
      }));

      (projTxRes.data || []).forEach((r: any) => all.push({
        id: `pt-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: r.type === 'income' ? 'in' : 'out',
        label: `Project ${r.project?.code || r.project?.name || ''} – ${r.reason || r.type}`,
        category: 'Project',
      }));

      (islamicPayRes.data || []).forEach((r: any) => all.push({
        id: `ilp-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} – Loan Payment${r.loan?.loan_code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Loan',
      }));

      (memberRepayRes.data || []).forEach((r: any) => all.push({
        id: `mlr-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.member?.full_name || 'Member'} – Loan Repayment`,
        category: 'Member Loan',
      }));

      (custPayRes.data || []).forEach((r: any) => all.push({
        id: `cpr-${r.id}`,
        date: r.created_at,
        amount: Number(r.amount || 0),
        direction: 'in',
        label: `${r.loan?.borrower_name || 'Customer'} – Payment${r.loan?.loan_code ? ` (${r.loan.code})` : ''}`,
        category: 'Customer Payment',
      }));

      all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(all.slice(0, 12));
    };
    load();
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Recent Financial Activity</h3>
        <p className="text-xs text-muted-foreground mt-0.5">সকল fund, deposit, withdraw, profit, loan ও project transaction</p>
      </div>
      {transactions.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {transactions.map(tx => (
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
      )}
    </div>
  );
}

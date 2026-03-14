import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

export function RecentActivity() {
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from('fund_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8)
      .then(({ data }) => setTransactions(data || []));
  }, []);

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Recent Fund Activity</h3>
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
                tx.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
              }`}>
                {tx.type === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{tx.reason || 'Transaction'}</p>
                <p className="text-xs text-muted-foreground">
                  {tx.created_at ? format(new Date(tx.created_at), 'MMM d, yyyy') : ''}
                </p>
              </div>
              <p className={`text-sm font-semibold tabular-nums ${
                tx.type === 'in' ? 'text-emerald-600' : 'text-destructive'
              }`}>
                {tx.type === 'in' ? '+' : '-'}{formatBDT(Number(tx.amount))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

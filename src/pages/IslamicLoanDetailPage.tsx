import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Phone, MessageCircle, Loader2, ArrowLeft, Calendar, TrendingDown, TrendingUp, Clock } from 'lucide-react';

export default function IslamicLoanDetailPage() {
  const { id } = useParams();
  const [loan, setLoan] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('islamic_loans').select('*, media_person:profiles!islamic_loans_media_person_id_fkey(*)').eq('id', id).single(),
      supabase.from('islamic_loan_payments').select('*').eq('loan_id', id).order('created_at', { ascending: false }),
    ]).then(([loanRes, paymentsRes]) => {
      setLoan(loanRes.data);
      setPayments(paymentsRes.data || []);
      setLoading(false);
    });
  }, [id]);

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
  const phoneDigits = loan.media_person?.phone?.replace(/[^0-9]/g, '');

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <Link to="/islamic-loans">
        <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
      </Link>

      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-foreground">{loan.code}</span>
            <h1 className="text-2xl font-bold mt-2">{loan.media_person?.full_name || 'N/A'}</h1>
            {loan.media_person?.phone && <p className="text-sm text-muted-foreground font-mono mt-1">{loan.media_person.phone}</p>}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${loan.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>{loan.status}</span>
        </div>

        {phoneDigits && (
          <div className="flex gap-2 mb-6">
            <a href={`tel:${loan.media_person.phone}`} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-sm transition-colors">
              <Phone className="w-4 h-4" /> Call
            </a>
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-foreground text-sm transition-colors">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Purchase Price</p>
            <p className="font-mono font-bold tabular-nums text-sm">{formatBDT(Number(loan.purchase_price))}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Sell Price</p>
            <p className="font-mono font-bold tabular-nums text-sm">{formatBDT(sellPriceN)}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Monthly</p>
            <p className="font-mono font-bold tabular-nums text-sm">{formatBDT(monthly)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingDown className="w-3 h-3" /> Due</div>
            <p className="font-mono font-bold text-primary tabular-nums">{formatBDT(remaining)}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingUp className="w-3 h-3" /> Paid</div>
            <p className="font-mono font-bold text-emerald-600 tabular-nums">{formatBDT(paid)}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{installmentsPaid}/{loan.tenure_months} installments</span>
          </div>
          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        <div className="space-y-2 text-sm border-t border-border pt-4">
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" /> Tenure</span><span className="font-medium">{loan.tenure_months} months · {loan.profit_percentage}% profit</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Start Date</span><span className="font-medium">{format(startDate, 'dd MMM yyyy')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> End Date</span><span className="font-medium">{format(endDate, 'dd MMM yyyy')}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Upcoming Installment</span><span className="font-medium tabular-nums">{formatBDT(monthly)} · {format(nextInstallmentDate, 'dd MMM yyyy')}</span></div>
          {loan.comments && <div className="pt-2"><p className="text-xs text-muted-foreground mb-1">Comments</p><p className="text-sm">{loan.comments}</p></div>}
        </div>
      </div>

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
    </div>
  );
}

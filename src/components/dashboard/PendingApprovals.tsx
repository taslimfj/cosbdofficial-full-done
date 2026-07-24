import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { Button } from '@/components/ui/button';
import { Inbox } from 'lucide-react';
import { toast } from 'sonner';

type Kind = 'deposit' | 'member_loan' | 'member_loan_repayment' | 'islamic_payment' | 'welfare';

interface PendingItem {
  id: string;
  kind: Kind;
  amount: number;
  user_id: string; // person to notify
  member_name: string;
  label: string;
  created_at: string;
  raw: any;
}

export function PendingApprovals() {
  const { role, user } = useAuth();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchData = async () => {
    // Auto-create the current quarter's welfare cycle if the cutoff has passed
    try { await (supabase as any).rpc('ensure_current_welfare_cycle'); } catch {}

    const [depRes, loanRes, repayRes, custReqRes, profilesRes, memLoansAll, islamicLoansAll, welfareRes] = await Promise.all([
      supabase.from('deposits').select('id, amount, member_id, created_at').eq('status', 'pending'),
      supabase.from('member_loans').select('id, requested_amount, member_id, created_at').eq('status', 'pending'),
      supabase.from('member_loan_repayments').select('id, amount, loan_id, created_at, payment_method, transaction_number').eq('status', 'pending'),
      (supabase as any).from('customer_payment_requests').select('id, amount, loan_id, customer_user_id, created_at, payment_method, transaction_id, note').eq('status', 'pending'),
      supabase.from('profiles').select('id, full_name'),
      supabase.from('member_loans').select('id, member_id'),
      (supabase as any).from('islamic_loans').select('id, borrower_name, code'),
      (supabase as any).from('welfare_deductions').select('id, period_end, amount_per_member, created_at').eq('status', 'pending'),
    ]);

    const profileMap = new Map((profilesRes.data || []).map((p: any) => [p.id, p.full_name]));
    const memLoanMap = new Map((memLoansAll.data || []).map((l: any) => [l.id, l.member_id]));
    const islamicMap = new Map((islamicLoansAll.data || []).map((l: any) => [l.id, l]));

    const merged: PendingItem[] = [];

    (depRes.data || []).forEach((d: any) => merged.push({
      id: d.id, kind: 'deposit', amount: Number(d.amount), user_id: d.member_id,
      member_name: profileMap.get(d.member_id) || 'Unknown',
      label: 'Deposit', created_at: d.created_at, raw: d,
    }));

    (loanRes.data || []).forEach((l: any) => merged.push({
      id: l.id, kind: 'member_loan', amount: Number(l.requested_amount), user_id: l.member_id,
      member_name: profileMap.get(l.member_id) || 'Unknown',
      label: 'Member Loan Request', created_at: l.created_at, raw: l,
    }));

    (repayRes.data || []).forEach((r: any) => {
      const memberId = memLoanMap.get(r.loan_id) as string | undefined;
      merged.push({
        id: r.id, kind: 'member_loan_repayment', amount: Number(r.amount),
        user_id: memberId || '',
        member_name: (memberId && profileMap.get(memberId)) || 'Unknown',
        label: `Loan Repayment${r.payment_method ? ` · ${r.payment_method}` : ''}`,
        created_at: r.created_at, raw: { ...r, member_id: memberId },
      });
    });

    (custReqRes.data || []).forEach((r: any) => {
      const loan = islamicMap.get(r.loan_id) as any;
      merged.push({
        id: r.id, kind: 'islamic_payment', amount: Number(r.amount),
        user_id: r.customer_user_id || '',
        member_name: loan?.borrower_name || (r.customer_user_id && profileMap.get(r.customer_user_id)) || 'Customer',
        label: `Islamic Loan Payment${loan?.code ? ` · ${loan.code}` : ''}${r.payment_method ? ` · ${r.payment_method}` : ''}`,
        created_at: r.created_at, raw: r,
      });
    });

    (welfareRes.data || []).forEach((w: any) => merged.push({
      id: w.id, kind: 'welfare', amount: Number(w.amount_per_member),
      user_id: '',
      member_name: 'Company Welfare',
      label: `প্রত্যেক member থেকে ৳${Number(w.amount_per_member).toLocaleString()} withdraw → Fund (${new Date(w.period_end).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})})`,
      created_at: w.created_at, raw: w,
    }));

    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('pending-approvals-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loans' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loan_repayments' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_payment_requests' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'welfare_deductions' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const notify = async (userId: string, title: string, message: string) => {
    if (!userId) return;
    await supabase.from('notifications').insert({ user_id: userId, title, message });
  };

  const handle = async (item: PendingItem, decision: 'approved' | 'rejected') => {
    setBusyId(item.id);
    try {
      if (item.kind === 'deposit') {
        const { error } = await supabase.from('deposits').update({ status: decision }).eq('id', item.id);
        if (error) throw error;
        await notify(item.user_id,
          decision === 'approved' ? 'Deposit approved' : 'Deposit rejected',
          `৳${item.amount.toLocaleString()} deposit-টি admin কর্তৃক ${decision === 'approved' ? 'অনুমোদন' : 'বাতিল'} করা হয়েছে।`);
      }

      else if (item.kind === 'member_loan') {
        const update: any = decision === 'approved'
          ? { status: 'approved', approved_amount: item.amount, approved_at: new Date().toISOString() }
          : { status: 'rejected' };
        const { error } = await supabase.from('member_loans').update(update).eq('id', item.id);
        if (error) throw error;
        await notify(item.user_id,
          decision === 'approved' ? 'Loan approved' : 'Loan rejected',
          `আপনার ৳${item.amount.toLocaleString()} member loan request ${decision === 'approved' ? 'অনুমোদিত' : 'বাতিল'} হয়েছে।`);
      }

      else if (item.kind === 'member_loan_repayment') {
        const { error } = await supabase.from('member_loan_repayments').update({
          status: decision,
          approved_at: decision === 'approved' ? new Date().toISOString() : null,
          approved_by: decision === 'approved' ? user?.id : null,
        }).eq('id', item.id);
        if (error) throw error;

        if (decision === 'approved') {
          // update parent loan repaid_amount + status
          const loanId = item.raw.loan_id;
          const { data: loanRow } = await supabase.from('member_loans')
            .select('approved_amount, repaid_amount, status').eq('id', loanId).maybeSingle();
          if (loanRow) {
            const newRepaid = Number(loanRow.repaid_amount || 0) + item.amount;
            const approved = Number(loanRow.approved_amount || 0);
            const nextStatus = (approved > 0 && newRepaid >= approved) ? 'repaid' : loanRow.status;
            await supabase.from('member_loans').update({
              repaid_amount: newRepaid, status: nextStatus,
            }).eq('id', loanId);
          }
        }
        await notify(item.user_id,
          decision === 'approved' ? 'Repayment approved' : 'Repayment rejected',
          `আপনার ৳${item.amount.toLocaleString()} loan repayment ${decision === 'approved' ? 'পরিশোধ হিসেবে গৃহীত' : 'বাতিল'} হয়েছে।`);
      }

      else if (item.kind === 'islamic_payment') {
        if (decision === 'approved') {
          const { error: rpcErr } = await supabase.rpc('record_islamic_loan_payment', {
            _loan_id: item.raw.loan_id,
            _amount: item.amount,
            _payment_type: 'installment',
            _payment_method: item.raw.payment_method || null,
            _transaction_id: item.raw.transaction_id || null,
          } as any);
          if (rpcErr) throw rpcErr;
        }
        await (supabase as any).from('customer_payment_requests').update({
          status: decision, reviewed_at: new Date().toISOString(), reviewed_by: user?.id,
        }).eq('id', item.id);
        await notify(item.user_id,
          decision === 'approved' ? 'Islamic loan payment approved' : 'Islamic loan payment rejected',
          `আপনার ৳${item.amount.toLocaleString()} installment ${decision === 'approved' ? 'গৃহীত' : 'বাতিল'} হয়েছে।`);
      }

      else if (item.kind === 'welfare') {
        const rpcName = decision === 'approved' ? 'approve_welfare_deduction' : 'reject_welfare_deduction';
        const { error: rpcErr } = await (supabase as any).rpc(rpcName, { _id: item.id });
        if (rpcErr) throw rpcErr;
      }

      toast.success(decision === 'approved' ? 'Approved' : 'Rejected');
      fetchData();
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  if (role !== 'admin') return null;

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Pending Approvals</h3>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-md">{items.length}</span>
        )}
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No pending requests</p>
        </div>
      ) : (
        <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
          {items.map(it => {
            const r = it.raw || {};
            const details: { k: string; v: string }[] = [];
            const method = r.payment_method;
            const txn = r.transaction_number || r.transaction_id;
            if (method) details.push({ k: 'Method', v: String(method) });
            if (txn) details.push({ k: 'Txn', v: String(txn) });
            if (r.note) details.push({ k: 'Note', v: String(r.note) });
            if (r.reason) details.push({ k: 'Reason', v: String(r.reason) });
            return (
              <div key={`${it.kind}-${it.id}`} className="px-4 sm:px-5 py-4 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground break-words">{it.member_name}</p>
                  <p className="text-xs text-muted-foreground break-words">
                    <span className="font-medium text-foreground/80">{it.label}</span>
                    {' · '}
                    <span className="font-semibold text-foreground">{formatBDT(it.amount)}</span>
                  </p>
                  {details.length > 0 && (
                    <div className="pt-1 space-y-0.5">
                      {details.map((d, i) => (
                        <p key={i} className="text-xs text-muted-foreground break-all">
                          <span className="font-medium text-foreground/70">{d.k}:</span> {d.v}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm" variant="outline" disabled={busyId === it.id}
                    className="h-9 px-4 text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50"
                    onClick={() => handle(it, 'approved')}>
                    Approve
                  </Button>
                  <Button
                    size="sm" variant="outline" disabled={busyId === it.id}
                    className="h-9 px-4 text-sm font-medium text-rose-600 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50"
                    onClick={() => handle(it, 'rejected')}>
                    Reject
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

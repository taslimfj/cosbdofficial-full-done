import { supabase } from '@/integrations/supabase/client';
import { computeMissedInstallments } from './memberStatus';

/**
 * Snapshot live member shares at the moment a Loan or Project is created.
 * Each member's percentage is computed from their current net balance
 * (relative to the org-wide total). These rows are then frozen — future
 * deposits / new members / member deletions do NOT alter the percentages.
 *
 * Members who are currently in "critical" status (missed 3+ consecutive
 * monthly installments) are excluded from the snapshot entirely — their
 * balance is NOT counted in the total, so remaining members' percentages
 * are recalculated to sum to 100% among themselves.
 */
export async function snapshotMemberShares(opts: {
  type: 'islamic_loan' | 'project';
  sourceId: string;
}) {
  const [{ data: members }, { data: deposits }, { data: distributions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, deleted_name, created_at')
      .eq('is_deleted', false)
      .eq('is_customer', false),
    supabase
      .from('deposits')
      .select('member_id, amount, month_year, created_at, status'),
    supabase.from('profit_distributions').select('member_id, amount'),
  ]);

  const approvedDeposits = (deposits || []).filter((d: any) => d.status === 'approved');

  const balanceByMember = new Map<string, number>();
  approvedDeposits.forEach((d: any) => {
    if (!d.member_id) return;
    balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount || 0));
  });
  (distributions || []).forEach((d: any) => {
    if (!d.member_id) return;
    balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount || 0));
  });

  // Group deposits by member for missed-installment check
  const depositsByMember = new Map<string, any[]>();
  (deposits || []).forEach((d: any) => {
    if (!d.member_id) return;
    const arr = depositsByMember.get(d.member_id) || [];
    arr.push(d);
    depositsByMember.set(d.member_id, arr);
  });

  // Exclude critical-status members (3+ months missed) from snapshot entirely
  const live = (members || []).filter((m) => {
    if (Number(balanceByMember.get(m.id) || 0) <= 0) return false;
    const status = computeMissedInstallments(depositsByMember.get(m.id) || [], m.created_at);
    if (status.level === 'critical') return false;
    return true;
  });

  const total = live.reduce((s, m) => s + Number(balanceByMember.get(m.id) || 0), 0);
  if (!live.length || total <= 0) return { count: 0 };

  const rows = live.map((m) => ({
    member_id: m.id,
    member_name: m.full_name || m.deleted_name || 'Unknown',
    deposit_snapshot: Number(balanceByMember.get(m.id) || 0),
    share_percentage: Math.round((Number(balanceByMember.get(m.id) || 0) / total) * 10000) / 100,
  }));

  if (opts.type === 'islamic_loan') {
    const { error } = await supabase
      .from('islamic_loan_member_shares')
      .insert(rows.map((r) => ({ ...r, loan_id: opts.sourceId })));
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('project_member_shares')
      .insert(rows.map((r) => ({ ...r, project_id: opts.sourceId })));
    if (error) throw error;
  }
  return { count: rows.length };
}

import { supabase } from '@/integrations/supabase/client';

/**
 * Snapshot live member shares at the moment a Loan or Project is created.
 * Each member's percentage is computed from their current net balance
 * (relative to the org-wide total). These rows are then frozen — future
 * deposits / new members / member deletions do NOT alter the percentages.
 */
export async function snapshotMemberShares(opts: {
  type: 'islamic_loan' | 'project';
  sourceId: string;
}) {
  const [{ data: members }, { data: deposits }, { data: distributions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, deleted_name')
      .eq('is_deleted', false)
      .eq('is_customer', false),
    supabase.from('deposits').select('member_id, amount, status').eq('status', 'approved'),
    supabase.from('profit_distributions').select('member_id, amount'),
  ]);

  const balanceByMember = new Map<string, number>();
  (deposits || []).forEach((d: any) => {
    if (!d.member_id) return;
    balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount || 0));
  });
  (distributions || []).forEach((d: any) => {
    if (!d.member_id) return;
    balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount || 0));
  });

  const live = (members || []).filter(
    (m) => Number(balanceByMember.get(m.id) || 0) > 0
  );
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

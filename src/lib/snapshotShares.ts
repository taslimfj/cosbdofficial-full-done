import { supabase } from '@/integrations/supabase/client';

/**
 * Snapshot live member shares at the moment a Loan or Project is created.
 * Each member's percentage is computed from their current total_deposited
 * (relative to the org-wide total). These rows are then frozen — future
 * deposits / new members / member deletions do NOT alter the percentages.
 */
export async function snapshotMemberShares(opts: {
  type: 'islamic_loan' | 'project';
  sourceId: string;
}) {
  const { data: members } = await supabase
    .from('profiles')
    .select('id, full_name, deleted_name, total_deposited')
    .eq('is_deleted', false)
    .eq('is_customer', false);

  const live = (members || []).filter(
    (m) => Number(m.total_deposited || 0) > 0
  );
  const total = live.reduce((s, m) => s + Number(m.total_deposited || 0), 0);
  if (!live.length || total <= 0) return { count: 0 };

  const rows = live.map((m) => ({
    member_id: m.id,
    member_name: m.full_name || m.deleted_name || 'Unknown',
    deposit_snapshot: Number(m.total_deposited || 0),
    share_percentage: Math.round((Number(m.total_deposited || 0) / total) * 10000) / 100,
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

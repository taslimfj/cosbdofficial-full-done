import { supabase } from '@/integrations/supabase/client';
import { computeMissedInstallments } from './memberStatus';

export type ExclusionReason = 'manual' | 'critical';
export type ExcludedMemberInfo = { id: string; name: string; reason: ExclusionReason };

/**
 * Snapshot live member shares at the moment a Loan or Project is created.
 *
 * Exclusion rules:
 *   1. Members whose id is in `excludeMemberIds` are excluded (reason: 'manual').
 *   2. Members currently in "critical" status (3+ consecutive missed monthly
 *      installments) are auto-excluded (reason: 'critical').
 *
 * The remaining members' percentages are recalculated to sum to 100% among
 * themselves. Returns the list of excluded members with reasons so the caller
 * can persist them onto the loan / project row for later display.
 */
export async function snapshotMemberShares(opts: {
  type: 'islamic_loan' | 'project';
  sourceId: string;
  excludeMemberIds?: string[];
}) {
  const manualExcluded = new Set((opts.excludeMemberIds || []).filter(Boolean));

  const [{ data: membersDirectory }, { data: deposits }, { data: distributions }] = await Promise.all([
    (supabase as any)
      .from('member_directory')
      .select('id, full_name, deleted_name, total_deposited, created_at')
      .eq('is_deleted', false)
      .eq('is_customer', false),
    supabase
      .from('deposits')
      .select('member_id, amount, month_year, created_at, status'),
    supabase.from('profit_distributions').select('member_id, amount'),
  ]);

  const balanceByMember = new Map<string, number>();
  (membersDirectory || []).forEach((m: any) => {
    if (m.id) balanceByMember.set(m.id, Number(m.total_deposited || 0));
  });

  // If deposits query returned rows (e.g. admin), calculate precise balance/deposits;
  // otherwise fallback to total_deposited from member_directory.
  const hasDepositsRead = (deposits || []).length > 0;
  if (hasDepositsRead) {
    const approvedDeposits = (deposits || []).filter((d: any) => d.status === 'approved');
    const exactBalance = new Map<string, number>();
    approvedDeposits.forEach((d: any) => {
      if (!d.member_id) return;
      exactBalance.set(d.member_id, (exactBalance.get(d.member_id) || 0) + Number(d.amount || 0));
    });
    (distributions || []).forEach((d: any) => {
      if (!d.member_id) return;
      exactBalance.set(d.member_id, (exactBalance.get(d.member_id) || 0) + Number(d.amount || 0));
    });
    exactBalance.forEach((val, id) => balanceByMember.set(id, val));
  }

  const depositsByMember = new Map<string, any[]>();
  (deposits || []).forEach((d: any) => {
    if (!d.member_id) return;
    const arr = depositsByMember.get(d.member_id) || [];
    arr.push(d);
    depositsByMember.set(d.member_id, arr);
  });

  const excluded: ExcludedMemberInfo[] = [];
  const live: any[] = [];

  (membersDirectory || []).forEach((m: any) => {
    const name = m.full_name || m.deleted_name || 'Unknown';
    const bal = Number(balanceByMember.get(m.id) || 0);
    if (bal <= 0) return;
    if (manualExcluded.has(m.id)) {
      excluded.push({ id: m.id, name, reason: 'manual' });
      return;
    }
    // Only check missed installments if deposits could be read (avoid false critical when RLS blocks deposits)
    if (hasDepositsRead) {
      const status = computeMissedInstallments(depositsByMember.get(m.id) || [], m.created_at);
      if (status.level === 'critical') {
        excluded.push({ id: m.id, name, reason: 'critical' });
        return;
      }
    }
    live.push(m);
  });

  if (opts.type === 'islamic_loan') {
    // Server-side snapshot (SECURITY DEFINER) so member-created loans work too.
    const reasons: Record<string, ExclusionReason> = {};
    excluded.forEach((e) => { reasons[e.id] = e.reason; });
    const { data, error } = await (supabase as any).rpc('snapshot_islamic_loan_shares', {
      _loan_id: opts.sourceId,
      _excluded: reasons,
    });
    if (error) throw error;
    return { count: Number(data || 0), excluded };
  }

  const total = live.reduce((s, m) => s + Number(balanceByMember.get(m.id) || 0), 0);
  if (!live.length || total <= 0) return { count: 0, excluded };

  const rows = live.map((m) => ({
    member_id: m.id,
    member_name: m.full_name || m.deleted_name || 'Unknown',
    deposit_snapshot: Number(balanceByMember.get(m.id) || 0),
    share_percentage: Math.round((Number(balanceByMember.get(m.id) || 0) / total) * 10000) / 100,
  }));

  const { error } = await supabase
    .from('project_member_shares')
    .insert(rows.map((r) => ({ ...r, project_id: opts.sourceId })));
  if (error) throw error;
  return { count: rows.length, excluded };
}

/** Persist excluded members list onto the source row (loan or project). */
export async function persistExclusions(opts: {
  type: 'islamic_loan' | 'project';
  sourceId: string;
  excluded: ExcludedMemberInfo[];
}) {
  if (!opts.excluded.length) return;
  // Islamic loans persist exclusions inside the snapshot RPC (works for members too).
  if (opts.type === 'islamic_loan') return;
  const ids = opts.excluded.map((e) => e.id);
  const reasons: Record<string, ExclusionReason> = {};
  opts.excluded.forEach((e) => { reasons[e.id] = e.reason; });
  await (supabase as any).from('projects')
    .update({ excluded_member_ids: ids, exclusion_reasons: reasons })
    .eq('id', opts.sourceId);
}

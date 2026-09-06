import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Trash2, RotateCcw } from 'lucide-react';

type Row = { id?: string; member_name: string; share_percentage: number; is_member_deleted?: boolean; member_id?: string | null };

/**
 * Admin-only editor for snapshot share percentages on
 * `islamic_loan_member_shares` or `project_member_shares`.
 *
 * Rules:
 *  - Total does NOT need to sum to 100. Any residual (100 − sum) is automatically
 *    absorbed by the Fund at distribution time.
 *  - Admin can Delete a member from the snapshot — that member is fully removed
 *    from this project/loan distribution; only the remaining active percentages count.
 *  - If snapshot was initially empty, admins can populate members and set percentages manually.
 */
export function SnapshotShareEditor({
  open,
  onOpenChange,
  table,
  sourceId,
  sourceColumn,
  rows: initialRows,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: 'islamic_loan_member_shares' | 'project_member_shares';
  sourceId: string;
  sourceColumn: 'loan_id' | 'project_id';
  rows: Row[];
  onSaved: () => void;
}) {
  const [workingRows, setWorkingRows] = useState<Row[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialRows && initialRows.length > 0) {
        setWorkingRows(initialRows);
        const v: Record<string, string> = {};
        initialRows.forEach(r => {
          const key = r.id || r.member_id || r.member_name;
          v[key] = String(r.share_percentage);
        });
        setValues(v);
        setRemoved(new Set(initialRows.filter(r => r.is_member_deleted || !r.member_id).map(r => r.id || r.member_id || r.member_name)));
      } else {
        // Fetch active members to populate manually when snapshot was empty
        setLoadingMembers(true);
        supabase
          .from('profiles')
          .select('id, full_name, deleted_name')
          .eq('is_deleted', false)
          .eq('is_customer', false)
          .then(({ data }) => {
            const fetchedRows: Row[] = (data || []).map(m => ({
              member_id: m.id,
              member_name: m.full_name || m.deleted_name || 'Unknown',
              share_percentage: 0,
              is_member_deleted: false,
            }));
            setWorkingRows(fetchedRows);
            const v: Record<string, string> = {};
            fetchedRows.forEach(r => { v[r.member_id!] = '0'; });
            setValues(v);
            setRemoved(new Set());
            setLoadingMembers(false);
          });
      }
    }
  }, [open, initialRows]);

  const activeTotal = workingRows.reduce((s, r) => {
    const key = r.id || r.member_id || r.member_name;
    if (removed.has(key)) return s;
    return s + (parseFloat(values[key]) || 0);
  }, 0);
  const fundShare = Math.max(0, 100 - activeTotal);

  const save = async () => {
    setSaving(true);
    try {
      const inserts: any[] = [];
      for (const r of workingRows) {
        const key = r.id || r.member_id || r.member_name;
        const isRemoved = removed.has(key);
        const pct = isRemoved ? 0 : parseFloat(values[key]) || 0;

        if (r.id) {
          // Update existing row
          const payload: any = { share_percentage: pct, is_member_deleted: isRemoved };
          const { error } = await (supabase as any).from(table).update(payload).eq('id', r.id);
          if (error) throw error;
        } else if (!isRemoved && pct > 0) {
          // Prepare new row to insert
          inserts.push({
            [sourceColumn]: sourceId,
            member_id: r.member_id || null,
            member_name: r.member_name,
            deposit_snapshot: 0,
            share_percentage: pct,
            is_member_deleted: false,
          });
        }
      }

      if (inserts.length > 0) {
        const { error } = await (supabase as any).from(table).insert(inserts);
        if (error) throw error;
      }

      toast.success('Share snapshot updated');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const distributeEvenly = () => {
    const alive = workingRows.filter(r => {
      const key = r.id || r.member_id || r.member_name;
      return !removed.has(key);
    });
    if (!alive.length) return;
    const each = 100 / alive.length;
    const v: Record<string, string> = { ...values };
    alive.forEach(r => {
      const key = r.id || r.member_id || r.member_name;
      v[key] = each.toFixed(2);
    });
    setValues(v);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Snapshot Share Edit (Admin)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            যে member-দের rakhbo তাদের % এখানে সেট করুন। মোট 100% হওয়া বাধ্যতামূলক নয় —
            <span className="font-medium"> বাকি অংশ automatically Fund-এ চলে যাবে</span>।
            কাউকে Delete/0% করলে সে এই distribution থেকে পুরোপুরি বাদ যাবে।
          </p>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            workingRows.map(r => {
              const key = r.id || r.member_id || r.member_name;
              const isRemoved = removed.has(key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isRemoved ? 'bg-destructive/5 opacity-60' : ''}`}
                >
                  <div className={`flex-1 text-sm truncate ${isRemoved ? 'line-through' : ''}`}>
                    {r.member_name}
                    {isRemoved && <span className="ml-1 text-[10px] text-destructive">বাদ</span>}
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={values[key] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
                    disabled={isRemoved}
                    className="w-24 text-right"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                  {isRemoved ? (
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => setRemoved(s => { const n = new Set(s); n.delete(key); return n; })}
                      title="Undo delete"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button" variant="ghost" size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setRemoved(s => new Set(s).add(key))}
                      title="Delete member from this distribution"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              );
            })
          )}

          <div className="border-t pt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Members active total</span>
              <span className="font-medium tabular-nums">{activeTotal.toFixed(2)}%</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Fund gets residual</span>
              <span className="tabular-nums">{fundShare.toFixed(2)}%</span>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={distributeEvenly}>Distribute Evenly</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

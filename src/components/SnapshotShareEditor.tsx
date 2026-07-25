import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Trash2, RotateCcw } from 'lucide-react';

type Row = { id: string; member_name: string; share_percentage: number; is_member_deleted?: boolean; member_id?: string | null };

/**
 * Admin-only editor for snapshot share percentages on
 * `islamic_loan_member_shares` or `project_member_shares`.
 *
 * Rules:
 *  - Total does NOT need to sum to 100. Any residual (100 − sum) is automatically
 *    absorbed by the Fund at distribution time.
 *  - Admin can Delete a member from the snapshot — that member's share also goes
 *    to Fund at distribution time.
 */
export function SnapshotShareEditor({
  open,
  onOpenChange,
  table,
  rows,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  table: 'islamic_loan_member_shares' | 'project_member_shares';
  rows: Row[];
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const v: Record<string, string> = {};
      rows.forEach(r => { v[r.id] = String(r.share_percentage); });
      setValues(v);
      setRemoved(new Set(rows.filter(r => r.is_member_deleted || !r.member_id).map(r => r.id)));
    }
  }, [open, rows]);

  const activeTotal = rows.reduce((s, r) => {
    if (removed.has(r.id)) return s;
    return s + (parseFloat(values[r.id]) || 0);
  }, 0);
  const deletedTotal = rows.reduce((s, r) => {
    if (!removed.has(r.id)) return s;
    return s + (parseFloat(values[r.id]) || Number(r.share_percentage) || 0);
  }, 0);
  const fundShare = Math.max(0, 100 - activeTotal);

  const save = async () => {
    setSaving(true);
    try {
      for (const r of rows) {
        const isRemoved = removed.has(r.id);
        const pct = isRemoved
          ? Number(r.share_percentage)                 // keep original pct so Fund absorbs it
          : parseFloat(values[r.id]) || 0;
        const payload: any = { share_percentage: pct, is_member_deleted: isRemoved };
        const { error } = await (supabase as any).from(table).update(payload).eq('id', r.id);
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
    const alive = rows.filter(r => !removed.has(r.id));
    if (!alive.length) return;
    const each = 100 / alive.length;
    const v: Record<string, string> = { ...values };
    alive.forEach(r => { v[r.id] = each.toFixed(2); });
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
            কাউকে Delete করলে তার share-ও Fund-এ যাবে।
          </p>
          {rows.map(r => {
            const isRemoved = removed.has(r.id);
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${isRemoved ? 'bg-destructive/5 opacity-60' : ''}`}
              >
                <div className={`flex-1 text-sm truncate ${isRemoved ? 'line-through' : ''}`}>
                  {r.member_name}
                  {isRemoved && <span className="ml-1 text-[10px] text-destructive">→ Fund</span>}
                </div>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={values[r.id] ?? ''}
                  onChange={e => setValues(v => ({ ...v, [r.id]: e.target.value }))}
                  disabled={isRemoved}
                  className="w-24 text-right"
                />
                <span className="text-xs text-muted-foreground">%</span>
                {isRemoved ? (
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => setRemoved(s => { const n = new Set(s); n.delete(r.id); return n; })}
                    title="Undo delete"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    type="button" variant="ghost" size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setRemoved(s => new Set(s).add(r.id))}
                    title="Delete member (share → Fund)"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}

          <div className="border-t pt-2 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Members active total</span>
              <span className="font-medium tabular-nums">{activeTotal.toFixed(2)}%</span>
            </div>
            {deletedTotal > 0 && (
              <div className="flex justify-between text-destructive">
                <span>Deleted (→ Fund)</span>
                <span className="tabular-nums">{deletedTotal.toFixed(2)}%</span>
              </div>
            )}
            <div className="flex justify-between text-emerald-600 font-medium">
              <span>Fund gets (residual + deleted)</span>
              <span className="tabular-nums">{(fundShare + deletedTotal).toFixed(2)}%</span>
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

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type Row = { id: string; member_name: string; share_percentage: number };

/**
 * Admin-only editor for snapshot share percentages on
 * `islamic_loan_member_shares` or `project_member_shares`.
 * Any positive numbers accepted; must sum to 100 (±0.01).
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const v: Record<string, string> = {};
      rows.forEach(r => { v[r.id] = String(r.share_percentage); });
      setValues(v);
    }
  }, [open, rows]);

  const total = Object.values(values).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const totalOk = Math.abs(total - 100) < 0.01;

  const save = async () => {
    if (!totalOk) { toast.error('মোট share ঠিক 100% হতে হবে (বর্তমানে ' + total.toFixed(2) + '%)'); return; }
    setSaving(true);
    try {
      for (const r of rows) {
        const pct = parseFloat(values[r.id]) || 0;
        if (pct === r.share_percentage) continue;
        const { error } = await (supabase as any).from(table).update({ share_percentage: pct }).eq('id', r.id);
        if (error) throw error;
      }
      toast.success('Share percentages updated');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const distributeEvenly = () => {
    if (!rows.length) return;
    const each = 100 / rows.length;
    const v: Record<string, string> = {};
    rows.forEach(r => { v[r.id] = each.toFixed(2); });
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
            প্রতিটি member-এর snapshot % পরিবর্তন করুন। সকল % এর মোট অবশ্যই 100% হতে হবে।
            এই পরিবর্তন অনুযায়ী profit/loss distribute হবে।
          </p>
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-3">
              <div className="flex-1 text-sm truncate">{r.member_name}</div>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={values[r.id] ?? ''}
                onChange={e => setValues(v => ({ ...v, [r.id]: e.target.value }))}
                className="w-28 text-right"
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          ))}
          <div className={`flex justify-between text-sm font-medium border-t pt-2 ${totalOk ? 'text-emerald-600' : 'text-destructive'}`}>
            <span>Total</span><span>{total.toFixed(2)}%</span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={distributeEvenly}>Distribute Evenly</Button>
          <Button onClick={save} disabled={saving || !totalOk}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

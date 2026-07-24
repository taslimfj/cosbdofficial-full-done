import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';

type Row = { id?: string; months: string; profit_pct: string };

export function TenureDefaultsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    (supabase as any)
      .from('islamic_tenure_options')
      .select('id, months, profit_pct, sort_order')
      .order('sort_order')
      .order('months')
      .then(({ data }: any) => {
        setRows(
          (data || []).map((d: any) => ({
            id: d.id,
            months: String(d.months),
            profit_pct: String(d.profit_pct),
          }))
        );
        setLoading(false);
      });
  };

  useEffect(load, []);

  const update = (idx: number, patch: Partial<Row>) =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const remove = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const add = () => setRows([...rows, { months: '', profit_pct: '' }]);

  const save = async () => {
    // Validate
    const clean = rows
      .map(r => ({
        months: parseInt(r.months),
        profit_pct: parseFloat(r.profit_pct),
      }))
      .filter(r => Number.isFinite(r.months) && r.months > 0 && Number.isFinite(r.profit_pct) && r.profit_pct >= 0);

    const uniqueMonths = new Set(clean.map(c => c.months));
    if (uniqueMonths.size !== clean.length) {
      toast.error('একই মাসের একাধিক entry দেয়া যাবে না');
      return;
    }

    setSaving(true);
    // Wipe & reinsert (simple + reliable)
    const { error: delErr } = await (supabase as any)
      .from('islamic_tenure_options')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) {
      setSaving(false);
      toast.error(delErr.message);
      return;
    }
    if (clean.length) {
      const payload = clean
        .sort((a, b) => a.months - b.months)
        .map((c, i) => ({ months: c.months, profit_pct: c.profit_pct, sort_order: i }));
      const { error } = await (supabase as any).from('islamic_tenure_options').insert(payload);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    setSaving(false);
    toast.success('Tenure options saved');
    load();
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Islamic Loan এর tenure dropdown-এ এই options গুলো দেখাবে। প্রতিটি tenure এর জন্য মাস ও profit % সেট করুন। চাইলে custom tenure (যেমন ২৪ মাস) যোগ করতে পারেন।
      </p>

      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            কোনো tenure option যোগ করা হয়নি। নিচের বাটন থেকে যোগ করুন।
          </p>
        )}
        {rows.map((r, idx) => (
          <div key={idx} className="p-3 border border-border rounded-lg bg-secondary/30">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Tenure (মাস)</Label>
                <Input
                  type="number"
                  min="1"
                  placeholder="যেমন: 3 / 6 / 12 / 24"
                  value={r.months}
                  onChange={e => update(idx, { months: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Profit %</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="যেমন: 8"
                  value={r.profit_pct}
                  onChange={e => update(idx, { profit_pct: e.target.value })}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(idx)}
                className="text-destructive"
                aria-label="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> Add Tenure Option
        </Button>
      </div>

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Tenure Options
      </Button>
    </div>
  );
}

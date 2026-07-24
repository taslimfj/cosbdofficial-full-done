import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';

type Audience = 'member' | 'customer' | 'both';
type Row = { label: string; value: string; note?: string | null; audience: Audience };

const AUDIENCE_LABEL: Record<Audience, string> = {
  member: 'শুধু Member',
  customer: 'শুধু Customer',
  both: 'উভয় (Member + Customer)',
};

export function PaymentDefaultsSection() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from('payment_method_defaults')
      .select('label, value, note, audience, sort_order')
      .order('sort_order')
      .then(({ data }: any) => {
        setRows(
          (data || []).map((d: any) => ({
            label: d.label,
            value: d.value,
            note: d.note,
            audience: (d.audience as Audience) || 'both',
          }))
        );
        setLoading(false);
      });
  }, []);

  const update = (idx: number, patch: Partial<Row>) =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const remove = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const add = () => setRows([...rows, { label: '', value: '', note: '', audience: 'both' }]);

  const save = async () => {
    setSaving(true);
    await (supabase as any)
      .from('payment_method_defaults')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    const clean = rows
      .filter(r => r.label.trim() && r.value.trim())
      .map((r, i) => ({
        label: r.label.trim(),
        value: r.value.trim(),
        note: r.note?.trim() || null,
        audience: r.audience,
        sort_order: i,
      }));
    if (clean.length) {
      const { error } = await (supabase as any).from('payment_method_defaults').insert(clean);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    setSaving(false);
    toast.success('Default payment methods saved');
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
        প্রতিটি payment method কার কাছে show করবে সেটি select করুন।
      </p>
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground italic text-center py-6">
            কোন payment method যোগ করা হয়নি। নিচের বাটন থেকে যোগ করুন।
          </p>
        )}
        {rows.map((r, idx) => (
          <div key={idx} className="p-3 border border-border rounded-lg bg-secondary/30 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Label</Label>
                <Input placeholder="যেমন: bKash / Bank / Nagad" value={r.label} onChange={e => update(idx, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Number / Account</Label>
                <Input placeholder="01XXXXXXXXX" value={r.value} onChange={e => update(idx, { value: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Note (optional)</Label>
                <Input placeholder="যেমন: Personal / Agent / Branch" value={r.note ?? ''} onChange={e => update(idx, { note: e.target.value })} />
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">কে দেখবে?</Label>
              <Select value={r.audience} onValueChange={v => update(idx, { audience: v as Audience })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">{AUDIENCE_LABEL.member}</SelectItem>
                  <SelectItem value="customer">{AUDIENCE_LABEL.customer}</SelectItem>
                  <SelectItem value="both">{AUDIENCE_LABEL.both}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> Add Payment Method
        </Button>
      </div>

      <Button className="w-full" onClick={save} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Payment Defaults
      </Button>
    </div>
  );
}

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';
import type { PaymentMethod } from './PaymentMethodsCard';

interface Props {
  methods: PaymentMethod[];
  onChange: (next: PaymentMethod[]) => void;
}

/** Admin editor for a list of payment methods (label + value + optional note). */
export function PaymentMethodsEditor({ methods, onChange }: Props) {
  const update = (idx: number, patch: Partial<PaymentMethod>) => {
    const next = methods.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange(next);
  };
  const remove = (idx: number) => onChange(methods.filter((_, i) => i !== idx));
  const add = () => onChange([...methods, { label: '', value: '', note: '' }]);

  return (
    <div className="space-y-3">
      {methods.length === 0 && (
        <p className="text-xs text-muted-foreground italic">কোন payment method যোগ করা হয়নি।</p>
      )}
      {methods.map((m, idx) => (
        <div key={idx} className="space-y-2 p-3 border border-border rounded-lg bg-secondary/30">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                placeholder="যেমন: bKash / Bank / Nagad"
                value={m.label}
                onChange={e => update(idx, { label: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Number / Account</Label>
              <Input
                placeholder="01XXXXXXXXX"
                value={m.value}
                onChange={e => update(idx, { value: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Note (optional)</Label>
              <Input
                placeholder="যেমন: Personal / Agent / Branch name"
                value={m.note ?? ''}
                onChange={e => update(idx, { note: e.target.value })}
              />
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(idx)} className="text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={add}>
        <Plus className="w-4 h-4 mr-1" /> Add Payment Method
      </Button>
    </div>
  );
}

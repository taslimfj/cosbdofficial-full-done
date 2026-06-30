import { Copy, Check, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export type PaymentMethod = { label: string; value: string; note?: string | null };

interface Props {
  methods: PaymentMethod[];
  title?: string;
  subtitle?: string;
}

/**
 * Customer-facing card showing admin's saved payment numbers/accounts.
 * One-tap copy on every entry.
 */
export function PaymentMethodsCard({ methods, title = 'Payment Methods', subtitle }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  if (!methods || methods.length === 0) return null;

  const handleCopy = async (value: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdx(idx);
      toast.success('Copied!');
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className="bg-card border border-primary/30 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <CreditCard className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="space-y-2">
        {methods.map((m, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleCopy(m.value, idx)}
            className="w-full text-left p-3 bg-secondary/50 hover:bg-primary/5 active:bg-primary/10 rounded-lg flex items-center justify-between gap-3 transition-colors group"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{m.label}</p>
              <p className="font-mono text-sm font-semibold tabular-nums truncate">{m.value}</p>
              {m.note && <p className="text-xs text-muted-foreground mt-0.5 truncate">{m.note}</p>}
            </div>
            <span className="shrink-0 w-9 h-9 rounded-md bg-background border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary">
              {copiedIdx === idx ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3 text-center">
        Tap any field to copy. Pay → তারপর Request Installment Payment দিন।
      </p>
    </div>
  );
}

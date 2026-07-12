import { UserMinus } from 'lucide-react';

type Reason = 'manual' | 'critical' | string;

interface Props {
  excludedIds: string[];
  reasons: Record<string, Reason>;
  memberById: Map<string, any>;
}

export function ExcludedMembersCard({ excludedIds, reasons, memberById }: Props) {
  if (!excludedIds || excludedIds.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <UserMinus className="w-4 h-4 text-destructive" />
        <h3 className="text-sm font-semibold">Excluded Members ({excludedIds.length})</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        নিচের member রা এই snapshot-এ অন্তর্ভুক্ত নয় — এদের profit/loss share নেই।
      </p>
      <div className="space-y-1.5">
        {excludedIds.map((id) => {
          const m = memberById.get(id);
          const name = m?.full_name || m?.deleted_name || 'Unknown';
          const reason = reasons?.[id] || 'manual';
          const isCritical = reason === 'critical';
          return (
            <div key={id} className="flex justify-between items-center text-sm px-3 py-2 rounded-lg bg-destructive/5">
              <span className="font-medium truncate">{name}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${isCritical ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-muted-foreground'}`}>
                {isCritical ? '৩ মাস বকেয়া — auto exclude' : 'Admin exclude'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

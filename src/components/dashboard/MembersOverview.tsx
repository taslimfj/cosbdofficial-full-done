import { formatBDT, calculateSharePercentage } from '@/lib/finance';
import { useNavigate } from 'react-router-dom';

interface MembersOverviewProps {
  members: any[];
  totalInvestment: number;
}

export function MembersOverview({ members, totalInvestment }: MembersOverviewProps) {
  const navigate = useNavigate();

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Members & Shares</h3>
      </div>
      {members.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No members yet. Add your first member to get started.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {members.map(member => {
            const share = calculateSharePercentage(Number(member.total_deposited || 0), totalInvestment);
            return (
              <button
                key={member.id}
                onClick={() => navigate(`/members/${member.id}`)}
                className="w-full flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0 overflow-hidden">
                  {member.avatar_url ? (
                    <img src={member.avatar_url} alt={`${member.full_name || 'Member'} photo`} className="h-full w-full object-cover" />
                  ) : (
                    member.full_name?.charAt(0)?.toUpperCase() || '?'
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{member.full_name || 'Unnamed'}</p>
                  <p className="text-xs text-muted-foreground">{formatBDT(Number(member.total_deposited || 0))}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">{share.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">share</p>
                </div>
                <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(share, 100)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

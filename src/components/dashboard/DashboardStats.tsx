import { formatBDT } from '@/lib/finance';
import { TrendingUp, Wallet, Landmark, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface StatsProps {
  stats: {
    totalInvestment: number;
    availableFund: number;
    cashInHand: number;
    activeLoans: number;
  };
}

type Variant = 'plain' | 'primary' | 'highlight';

export function DashboardStats({ stats }: StatsProps) {
  const navigate = useNavigate();
  const items: Array<{ label: string; value: string; icon: any; variant: Variant; onClick: () => void }> = [
    {
      label: 'Total Capital',
      value: formatBDT(stats.totalInvestment),
      icon: TrendingUp,
      variant: 'plain',
      onClick: () => navigate('/members'),
    },
    {
      label: 'Fund Net Balance',
      value: formatBDT(stats.availableFund),
      icon: Wallet,
      variant: 'primary',
      onClick: () => navigate('/fund'),
    },
    {
      label: 'Cash in Hand',
      value: formatBDT(stats.cashInHand),
      icon: Coins,
      variant: 'highlight',
      onClick: () => navigate('/cash-in-hand'),
    },
    {
      label: 'Active Loans',
      value: stats.activeLoans.toString(),
      icon: Landmark,
      variant: 'plain',
      onClick: () => navigate('/islamic-loans'),
    },
  ];

  const styles: Record<Variant, { card: string; label: string; icon: string }> = {
    plain: {
      card: 'bg-card text-card-foreground border-border',
      label: 'text-muted-foreground',
      icon: 'text-muted-foreground/50',
    },
    primary: {
      card: 'bg-primary text-primary-foreground border-primary',
      label: 'text-primary-foreground/70',
      icon: 'text-primary-foreground/50',
    },
    highlight: {
      card: 'bg-[hsl(var(--warning)/0.12)] text-foreground border-[hsl(var(--warning)/0.35)]',
      label: 'text-[hsl(var(--warning))]',
      icon: 'text-[hsl(var(--warning))]',
    },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const s = styles[item.variant];
        return (
          <div
            key={item.label}
            onClick={item.onClick}
            className={`p-5 rounded-xl border shadow-subtle transition-shadow hover:shadow-card cursor-pointer ${s.card}`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={`text-xs font-medium uppercase tracking-wider ${s.label}`}>
                {item.label}
              </p>
              <item.icon className={`w-4 h-4 ${s.icon}`} />
            </div>
            <p className="text-2xl font-bold tracking-tight tabular-nums">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}


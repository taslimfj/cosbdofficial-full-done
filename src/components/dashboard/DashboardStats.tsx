import { formatBDT } from '@/lib/finance';
import { TrendingUp, Wallet, Landmark, PiggyBank } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface StatsProps {
  stats: {
    totalInvestment: number;
    availableFund: number;
    totalMembers: number;
    activeLoans: number;
  };
}

export function DashboardStats({ stats }: StatsProps) {
  const navigate = useNavigate();
  const items = [
    {
      label: 'Total Capital',
      value: formatBDT(stats.totalInvestment),
      icon: TrendingUp,
      accent: false,
      onClick: () => navigate('/members'),
    },
    {
      label: 'Available Balance',
      value: formatBDT(stats.availableFund),
      icon: Wallet,
      accent: true,
      onClick: () => navigate('/fund'),
    },
    {
      label: 'Fund Net Balance',
      value: formatBDT(stats.availableFund),
      icon: PiggyBank,
      accent: false,
      onClick: () => navigate('/fund'),
    },
    {
      label: 'Active Loans',
      value: stats.activeLoans.toString(),
      icon: Landmark,
      accent: false,
      onClick: () => navigate('/islamic-loans'),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => (
        <div
          key={item.label}
          onClick={item.onClick}
          className={`p-5 rounded-xl border shadow-subtle transition-shadow hover:shadow-card cursor-pointer ${
            item.accent
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-card-foreground border-border'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <p className={`text-xs font-medium uppercase tracking-wider ${
              item.accent ? 'text-primary-foreground/70' : 'text-muted-foreground'
            }`}>
              {item.label}
            </p>
            <item.icon className={`w-4 h-4 ${item.accent ? 'text-primary-foreground/50' : 'text-muted-foreground/50'}`} />
          </div>
          <p className="text-2xl font-bold tracking-tight tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}


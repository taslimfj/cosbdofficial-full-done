import { formatBDT } from '@/lib/finance';
import { TrendingUp, Wallet, Users, Landmark } from 'lucide-react';
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
      label: 'Total Investment',
      value: formatBDT(stats.totalInvestment),
      icon: TrendingUp,
      accent: false,
    },
    {
      label: 'Available Fund',
      value: formatBDT(stats.availableFund),
      icon: Wallet,
      accent: true,
    },
    {
      label: 'Total Members',
      value: stats.totalMembers.toString(),
      icon: Users,
      accent: false,
    },
    {
      label: 'Active Loans',
      value: stats.activeLoans.toString(),
      icon: Landmark,
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item, index) => (
        <div
          key={item.label}
          onClick={index === 0 ? () => navigate('/members') : index === 1 ? () => navigate('/fund') : index === 3 ? () => navigate('/islamic-loans') : undefined}
          className={`p-5 rounded-xl border shadow-subtle transition-shadow hover:shadow-card ${
            item.accent
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-card-foreground border-border'
          } ${index === 0 || index === 1 || index === 3 ? 'cursor-pointer' : ''}`}
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

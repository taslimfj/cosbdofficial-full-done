import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { PendingApprovals } from '@/components/dashboard/PendingApprovals';
import { DeletedMembers } from '@/components/dashboard/DeletedMembers';
import { Loader2 } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateDashboardPDF } from '@/lib/pdfGenerator';

export default function DashboardPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalInvestment: 0, availableFund: 0, totalMembers: 0, activeLoans: 0 });
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_transactions' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    const [profilesRes, fundRes, loansRes] = await Promise.all([
      (supabase as any).from('member_directory').select('*'),
      supabase.from('fund_transactions').select('*'),
      (supabase as any).from('islamic_loans_public').select('*').eq('status', 'active'),
    ]);

    const profiles = profilesRes.data || [];
    const fundTxns = fundRes.data || [];
    const activeLoans = loansRes.data || [];

    const totalInvestment = profiles.reduce((sum, p) => sum + Number(p.total_deposited || 0), 0);
    const fundIn = fundTxns.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
    const fundOut = fundTxns.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
    const availableFund = totalInvestment + fundIn - fundOut;

    setStats({
      totalInvestment,
      availableFund,
      totalMembers: profiles.length,
      activeLoans: activeLoans.length,
    });
    setMembers(profiles);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Overview of your community fund</p>
        </div>
        <PdfPeriodButton
          label="Overall Summary PDF"
          onDownload={async (p) => {
            const [fund, deps, il, ml, assetsRes, dist] = await Promise.all([
              supabase.from('fund_transactions').select('*'),
              supabase.from('deposits').select('*'),
              supabase.from('islamic_loans').select('*'),
              supabase.from('member_loans').select('*'),
              supabase.from('assets' as any).select('*'),
              supabase.from('profit_distributions').select('*'),
            ]);
            generateDashboardPDF({
              members,
              fundTxns: fund.data || [],
              deposits: deps.data || [],
              islamicLoans: il.data || [],
              memberLoans: ml.data || [],
              assets: (assetsRes.data as any) || [],
              distributions: dist.data || [],
            }, p);
          }}
        />
      </div>
      <DashboardStats stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PendingApprovals />
          <DeletedMembers />
        </div>
        <div className="space-y-6">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { DashboardStats } from '@/components/dashboard/DashboardStats';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { PendingApprovals } from '@/components/dashboard/PendingApprovals';
import { DefaultPaymentMethods } from '@/components/dashboard/DefaultPaymentMethods';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Download } from 'lucide-react';
import { generateOverallSummaryPDF, type OverallPeriod } from '@/lib/overallSummaryPdf';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalInvestment: 0, availableFund: 0, cashInHand: 0, totalMembers: 0, activeLoans: 0 });
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposits' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fund_transactions' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profit_distributions' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_transactions' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loans' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'islamic_loan_payments' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loans' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'member_loan_repayments' }, fetchData)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchData = async () => {
    const [profilesRes, fundRes, loansRes, depsRes, distRes, projTxRes, ilRes, ilPayRes, mlRes, mlPayRes] = await Promise.all([
      (supabase as any).from('member_directory').select('*'),
      supabase.from('fund_transactions').select('*'),
      (supabase as any).from('islamic_loans_public').select('*').eq('status', 'active'),
      supabase.from('deposits').select('member_id, amount, status'),
      supabase.from('profit_distributions').select('member_id, amount'),
      supabase.from('project_transactions').select('type, amount'),
      supabase.from('islamic_loans').select('purchase_price'),
      supabase.from('islamic_loan_payments').select('amount'),
      supabase.from('member_loans').select('approved_amount, status'),
      supabase.from('member_loan_repayments').select('amount, status'),
    ]);

    const profiles = profilesRes.data || [];
    const fundTxns = fundRes.data || [];
    const activeLoans = loansRes.data || [];
    const deposits = depsRes.data || [];
    const distributions = distRes.data || [];
    const projTxns = projTxRes.data || [];
    const ilLoans = ilRes.data || [];
    const ilPayments = ilPayRes.data || [];
    const mLoans = mlRes.data || [];
    const mRepays = mlPayRes.data || [];

    const activeProfileIds = new Set(profiles.filter((p: any) => !p.is_deleted).map((p: any) => p.id));
    const balanceByMember = new Map<string, number>();
    for (const d of deposits) {
      if (d.status !== 'approved' || !activeProfileIds.has(d.member_id)) continue;
      balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount));
    }
    for (const r of distributions) {
      if (!activeProfileIds.has(r.member_id)) continue;
      balanceByMember.set(r.member_id, (balanceByMember.get(r.member_id) || 0) + Number(r.amount || 0));
    }
    const totalInvestment = Array.from(balanceByMember.values()).reduce((s, v) => s + v, 0);

    const fundIn = fundTxns.filter(t => t.type === 'income' || t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
    const fundOut = fundTxns.filter(t => t.type === 'expense' || t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
    const availableFund = fundIn - fundOut;

    const projectIncome = projTxns.filter((t: any) => t.type === 'income').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const projectExpense = projTxns.filter((t: any) => t.type === 'expense').reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const ilPurchases = ilLoans.reduce((s: number, l: any) => s + Number(l.purchase_price || 0), 0);
    const ilInstallments = ilPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const mlDisbursed = mLoans
      .filter((l: any) => l.status === 'approved' || l.status === 'repaid')
      .reduce((s: number, l: any) => s + Number(l.approved_amount || 0), 0);
    const mlRepaid = mRepays
      .filter((r: any) => r.status === 'approved')
      .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

    // Cash in Hand per user spec:
    // = Total Capital + Fund Net Balance
    //   + Project Income  - Project Expense
    //   - Islamic Loan Purchases + Islamic Loan Installments
    //   - Member Loans Disbursed + Member Loan Repayments
    // NOTE: Profit distributions are INTERNAL allocations of installment cash
    // already counted via ilInstallments — subtract them to avoid double count
    // (they inflate both totalInvestment via members and availableFund via fund share).
    const distributedProfitTotal = distributions.reduce(
      (s: number, d: any) => s + Number(d.amount || 0),
      0
    );
    const cashInHand =
      totalInvestment + availableFund
      + projectIncome - projectExpense
      - ilPurchases + ilInstallments
      - mlDisbursed + mlRepaid
      - distributedProfitTotal;


    setStats({
      totalInvestment,
      availableFund,
      cashInHand,
      totalMembers: profiles.filter((p: any) => !p.is_deleted && !p.is_customer).length,
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="w-4 h-4" /> Overall Summary PDF
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Download as PDF</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleOverallPdf('month')}>This Month</DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOverallPdf('year')}>This Year</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DashboardStats stats={stats} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <PendingApprovals />
          <DefaultPaymentMethods />
        </div>
        <div className="space-y-6">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

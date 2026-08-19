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
import { generateOverallSummaryPDF, fiscalYearRange, type OverallPeriod } from '@/lib/overallSummaryPdf';
import { toast } from 'sonner';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

export default function DashboardPage() {
  const { role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalInvestment: 0, availableFund: 0, cashInHand: 0, totalMembers: 0, activeLoans: 0 });
  const [members, setMembers] = useState<any[]>([]);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();
  const [generating, setGenerating] = useState(false);

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

    // Cash in Hand — mirror /cash-in-hand page exactly so both pages agree.
    // Sum of REAL cash movements only. Fund auto-entries created from profit
    // distributions (e.g. "Fund profit share", "Admin share ... Fund") are
    // internal reallocations of already-counted installment money and MUST
    // be excluded to avoid double counting.
    const isProfitInternal = (reason: string) =>
      /profit share|Admin share.*Fund|Fund-এ যোগ|Fund থেকে বিয়োগ/i.test(reason || '');

    const depositsCash = deposits
      .filter((d: any) => d.status === 'approved')
      .reduce((s: number, d: any) => s + Number(d.amount || 0), 0); // signed: withdraw is negative
    const fundManualIn = fundTxns
      .filter((t: any) => (t.type === 'in' || t.type === 'income') && !isProfitInternal(t.reason))
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const fundManualOut = fundTxns
      .filter((t: any) => (t.type === 'out' || t.type === 'expense') && !isProfitInternal(t.reason))
      .reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
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

    const cashInHand =
      depositsCash
      + (fundManualIn - fundManualOut)
      + (projectIncome - projectExpense)
      + (ilInstallments - ilPurchases)
      + (mlRepaid - mlDisbursed);


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

  const handleOverallPdf = async (period: OverallPeriod, customRange?: { from: Date; to: Date }) => {
    try {
      const [fundRes, depsRes, ilRes, ilPayRes, projRes, projTxRes, mlRes, mlRepayRes, distRes] = await Promise.all([
        supabase.from('fund_transactions').select('*'),
        supabase.from('deposits').select('*'),
        supabase.from('islamic_loans').select('id, code, purchase_price, sell_price, borrower_name, media_person_id, created_at'),
        supabase.from('islamic_loan_payments').select('loan_id, amount, payment_method, created_at'),
        supabase.from('projects').select('id, name, code'),
        supabase.from('project_transactions').select('project_id, type, amount, reason, comments, created_at'),
        supabase.from('member_loans').select('id, member_id, approved_amount, requested_amount, status, created_at'),
        supabase.from('member_loan_repayments').select('loan_id, amount, status, created_at'),
        supabase.from('profit_distributions').select('member_id, amount, created_at'),
      ]);
      await generateOverallSummaryPDF({
        members,
        fundTxns: fundRes.data || [],
        deposits: depsRes.data || [],
        islamicLoans: ilRes.data || [],
        islamicPayments: ilPayRes.data || [],
        projects: projRes.data || [],
        projectTxns: projTxRes.data || [],
        memberLoans: mlRes.data || [],
        memberRepayments: mlRepayRes.data || [],
        distributions: distRes.data || [],
      }, period, customRange);
    } catch (e: any) {
      toast.error(e?.message || 'PDF তৈরি করা যায়নি');
    }
  };

  const confirmRangeDownload = async () => {
    if (!range?.from) {
      toast.error('অন্তত একটি তারিখ নির্বাচন করুন');
      return;
    }
    setGenerating(true);
    try {
      await handleOverallPdf('month', { from: range.from, to: range.to || range.from });
      setRangeOpen(false);
    } finally {
      setGenerating(false);
    }
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
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Download as PDF</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setRange(undefined); setRangeOpen(true); }}>
              This Month / Date Range
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleOverallPdf('year')}>
              This Year ({format(fiscalYearRange().start, 'MMM yyyy')} – {format(fiscalYearRange().end, 'MMM yyyy')})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent className="sm:max-w-fit">
          <DialogHeader>
            <DialogTitle>তারিখ নির্বাচন করুন</DialogTitle>
            <DialogDescription>
              প্রথমে শুরুর তারিখ, তারপর শেষ তারিখ সিলেক্ট করুন — আগের যেকোনো মাসও বেছে নিতে পারবেন।
            </DialogDescription>
          </DialogHeader>
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            numberOfMonths={1}
            defaultMonth={range?.from}
            className="p-3 pointer-events-auto"
          />
          <p className="text-sm text-muted-foreground text-center">
            {range?.from
              ? `${format(range.from, 'dd/MM/yyyy')} – ${range.to ? format(range.to, 'dd/MM/yyyy') : '...'}`
              : 'কোনো তারিখ নির্বাচন করা হয়নি'}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangeOpen(false)}>বাতিল</Button>
            <Button onClick={confirmRangeDownload} disabled={!range?.from || generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

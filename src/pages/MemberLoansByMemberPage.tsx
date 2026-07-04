import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowLeft, ChevronRight, Loader2, Plus, User, AlertTriangle } from 'lucide-react';
import { buildMemberLoanCode } from '@/lib/memberLoanCode';

type Section = 'ongoing' | 'paid' | 'rejected';

export default function MemberLoansByMemberPage() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [member, setMember] = useState<any | null>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [repayments, setRepayments] = useState<any[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestAmount, setRequestAmount] = useState('');
  const [requestReason, setRequestReason] = useState('');

  const fetchAll = async () => {
    if (!memberId) return;
    const [memRes, loansRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', memberId).maybeSingle(),
      supabase.from('member_loans').select('*').eq('member_id', memberId).order('created_at', { ascending: true }),
    ]);
    setMember(memRes.data);
    const loanRows = loansRes.data || [];
    setLoans(loanRows);
    if (loanRows.length) {
      const { data: reps } = await supabase
        .from('member_loan_repayments')
        .select('*')
        .in('loan_id', loanRows.map(l => l.id));
      setRepayments(reps || []);
    } else {
      setRepayments([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [memberId]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!member) return (
    <div className="text-center py-16">
      <p className="text-muted-foreground">Member পাওয়া যায়নি।</p>
      <Button variant="ghost" onClick={() => navigate('/member-loans')} className="mt-4"><ArrowLeft className="w-4 h-4 mr-1" /> ফিরে যান</Button>
    </div>
  );

  const isSelf = memberId === user?.id;
  const canManage = isSelf || role === 'admin';

  // Attach unique code (per-member serial by creation order)
  const withCode = loans.map((l, idx) => ({
    ...l,
    code: buildMemberLoanCode(member.full_name, idx + 1, l.created_at),
  }));

  const ongoing = withCode.filter(l => l.status === 'approved' || l.status === 'pending');
  const paid = withCode.filter(l => l.status === 'repaid');
  const rejected = withCode.filter(l => l.status === 'rejected');

  // Summary
  const totalApproved = withCode.reduce((s, l) => s + Number(l.approved_amount || 0), 0);
  const totalRepaid = withCode.reduce((s, l) => s + Number(l.repaid_amount || 0), 0);
  const totalRemaining = ongoing.reduce((s, l) =>
    s + Math.max(0, Number(l.approved_amount || 0) - Number(l.repaid_amount || 0)), 0);
  const defaultedCount = paid.filter(l => l.defaulted).length;

  const handleRequest = async () => {
    const amount = parseFloat(requestAmount);
    if (!amount || amount <= 0) { toast.error('সঠিক পরিমাণ লিখুন'); return; }
    if (!requestReason.trim()) { toast.error('লোনের কারণ লিখুন'); return; }
    setSubmitting(true);
    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + 3);
    const { error } = await supabase.from('member_loans').insert({
      member_id: memberId,
      requested_amount: amount,
      reason: requestReason.trim(),
      due_date: dueDate.toISOString().split('T')[0],
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Loan request submitted');
    setShowDialog(false);
    setRequestAmount('');
    setRequestReason('');
    fetchAll();
  };

  const renderLoanRow = (loan: any) => {
    const approved = Number(loan.approved_amount || 0);
    const repaid = Number(loan.repaid_amount || 0);
    const remaining = Math.max(0, approved - repaid);
    const loanReps = repayments.filter(r => r.loan_id === loan.id && r.status === 'approved');
    return (
      <button
        key={loan.id}
        onClick={() => navigate(`/member-loans/${loan.id}`)}
        className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-secondary/40 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{loan.code}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              loan.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
              loan.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
              loan.status === 'repaid' ? 'bg-secondary text-muted-foreground' :
              'bg-warning/10 text-[hsl(var(--warning))]'
            }`}>{loan.status}</span>
            {loan.defaulted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium flex items-center gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> auto-withdrawn
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {approved > 0
              ? `Approved: ${formatBDT(approved)} · Paid: ${formatBDT(repaid)}${loan.status === 'approved' ? ` · Remaining: ${formatBDT(remaining)}` : ''}`
              : `Requested: ${formatBDT(Number(loan.requested_amount))}`}
            {loan.due_date && ` · Due: ${format(new Date(loan.due_date), 'MMM d, yyyy')}`}
            {loanReps.length > 0 && ` · ${loanReps.length}টি payment`}
          </p>
          {loan.reason && (
            <p className="text-[11px] text-muted-foreground/80 mt-0.5 italic truncate">কারণ: {loan.reason}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
    );
  };

  const Section = ({ title, subtitle, list, empty }: { title: string; subtitle: string; list: any[]; empty: string }) => (
    <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y divide-border">{list.map(renderLoanRow)}</div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate('/member-loans')} className="gap-1 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Member Loans
      </Button>

      <div className="bg-card border border-border rounded-xl shadow-subtle p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary">
              {member.full_name?.charAt(0)?.toUpperCase() || <User className="w-6 h-6" />}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">{member.full_name}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Member Loan Profile · মোট {loans.length}টি loan</p>
            </div>
          </div>
          {canManage && (
            <Dialog open={showDialog} onOpenChange={setShowDialog}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> নতুন Loan Request</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Request Interest-Free Loan</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input type="number" value={requestAmount} onChange={e => setRequestAmount(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>কারণ *</Label>
                    <Textarea value={requestReason} onChange={e => setRequestReason(e.target.value)} rows={3}
                      placeholder="কী কারণে লোন প্রয়োজন তা সংক্ষেপে লিখুন" />
                  </div>
                  <p className="text-xs text-muted-foreground">Deadline: 3 months। পরিশোধ না হলে balance থেকে কেটে নেওয়া হবে।</p>
                  <Button className="w-full" onClick={handleRequest} disabled={submitting}>
                    {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Submit Request
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <Stat label="Total Approved" value={formatBDT(totalApproved)} />
          <Stat label="Total Paid" value={formatBDT(totalRepaid)} tone="success" />
          <Stat label="Total Due" value={formatBDT(totalRemaining)} tone={totalRemaining > 0 ? 'warning' : 'muted'} />
          <Stat label="Auto-withdrawn" value={String(defaultedCount)} tone={defaultedCount > 0 ? 'danger' : 'muted'} />
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <SmallCount label="Ongoing" value={ongoing.length} tone="warning" />
          <SmallCount label="Paid" value={paid.length} tone="success" />
          <SmallCount label="Rejected" value={rejected.length} tone="danger" />
        </div>
      </div>

      <Section
        title="Ongoing Loans"
        subtitle="যেগুলো এখনো পরিশোধ হয়নি — নিচের ID অনুযায়ী পুরোনোটা আগে পরিশোধ করতে হবে"
        list={ongoing}
        empty="কোনো চলমান loan নেই।"
      />
      <Section
        title="Paid / Completed Loans"
        subtitle="সম্পূর্ণ পরিশোধ হয়ে গেছে (auto-withdrawn সহ)"
        list={paid}
        empty="এখনো কোনো loan সম্পূর্ণ পরিশোধ হয়নি।"
      />
      <Section
        title="Rejected Loans"
        subtitle="Admin কর্তৃক reject হয়েছে"
        list={rejected}
        empty="কোনো rejected loan নেই।"
      />
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warning' | 'muted' | 'danger' }) {
  const toneCls =
    tone === 'success' ? 'text-emerald-600' :
    tone === 'warning' ? 'text-[hsl(var(--warning))]' :
    tone === 'danger' ? 'text-destructive' :
    tone === 'muted' ? 'text-muted-foreground' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-semibold tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

function SmallCount({ label, value, tone }: { label: string; value: number; tone: 'success' | 'warning' | 'danger' }) {
  const cls =
    tone === 'success' ? 'bg-emerald-50 text-emerald-700' :
    tone === 'warning' ? 'bg-warning/10 text-[hsl(var(--warning))]' :
    'bg-destructive/10 text-destructive';
  return (
    <div className={`rounded-lg px-2 py-1.5 text-center ${cls}`}>
      <p className="text-base font-bold leading-tight tabular-nums">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-80">{label}</p>
    </div>
  );
}

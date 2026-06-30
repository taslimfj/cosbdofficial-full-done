import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Phone, MessageCircle, MessageSquare, Loader2, Pencil, Trash2,
  Plus, TrendingDown, TrendingUp, Sparkles,
} from 'lucide-react';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isAdmin = role === 'admin';

  const [project, setProject] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [snapshot, setSnapshot] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [fundRequests, setFundRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [txLimit, setTxLimit] = useState(3);

  const [showEdit, setShowEdit] = useState(false);
  const [showTx, setShowTx] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showFundReq, setShowFundReq] = useState(false);
  const [busy, setBusy] = useState(false);

  const [edit, setEdit] = useState<any>(null);
  const [tx, setTx] = useState({ type: 'income', amount: '', reason: '', comments: '' });
  const [fundReq, setFundReq] = useState({ amount: '', reason: '' });

  const load = async () => {
    if (!id) return;
    const [pRes, tRes, mRes, snapRes, distRes, frRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase.from('project_transactions').select('*').eq('project_id', id).order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*'),
      (supabase as any).from('project_member_shares').select('*').eq('project_id', id),
      supabase.from('profit_distributions').select('*').eq('source_id', id).eq('source_type', 'project'),
      (supabase as any).from('project_fund_requests').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    ]);
    const members = mRes.data || [];
    const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
    const project = pRes.data ? { ...pRes.data, manager: byId.get(pRes.data.manager_id) || null, secondary_manager: byId.get(pRes.data.secondary_manager_id) || null } : null;
    const distributions = (distRes.data || []).map((d: any) => ({ ...d, member: byId.get(d.member_id) || null }));
    setProject(project);
    setTxs(tRes.data || []);
    setMembers(members);
    setSnapshot(snapRes.data || []);
    setDistributions(distributions);
    setFundRequests(frRes.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (project) {
      setEdit({
        name: project.name || '',
        manager_id: project.manager_id || '',
        secondary_manager_id: project.secondary_manager_id || '',
        manager_profit_pct: String(project.manager_profit_pct ?? '5'),
        fund_profit_pct: String(project.fund_profit_pct ?? '15'),
        status: project.status || 'active',
        comments: project.comments || '',
      });
    }
  }, [project]);

  const totals = useMemo(() => {
    const inAmt = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const outAmt = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { in: inAmt, out: outAmt, profit: Math.max(0, inAmt - outAmt) };
  }, [txs]);

  // Snapshot shares — locked at project creation
  const profitTotalsPre = useMemo(() => {
    if (!project) return { total: 0, manager: 0, fund: 0, memberPool: 0 };
    const mgr = totals.profit * (Number(project.manager_profit_pct) || 0) / 100;
    const fund = totals.profit * (Number(project.fund_profit_pct) || 0) / 100;
    return { total: totals.profit, manager: mgr, fund, memberPool: Math.max(0, totals.profit - mgr - fund) };
  }, [project, totals]);

  const shareRows = useMemo(() => {
    if (!project || !snapshot.length) return [] as any[];
    const pool = profitTotalsPre.memberPool;
    return snapshot.map((s: any) => ({
      id: s.id,
      memberId: s.member_id,
      name: s.member_name,
      deposit: Number(s.deposit_snapshot),
      sharePct: Number(s.share_percentage),
      expected: pool * Number(s.share_percentage) / 100,
      isDeleted: !!s.is_member_deleted || !s.member_id,
    })).sort((a, b) => b.sharePct - a.sharePct);
  }, [project, snapshot, profitTotalsPre]);

  const profitTotals = profitTotalsPre;

  const alreadyDistributed = distributions.length > 0;

  const budgetAssigned = Number(project?.budget_amount || 0) + Number(project?.extra_funds_approved || 0);
  const budgetRemaining = Math.max(0, budgetAssigned - totals.out);

  const handleEditSave = async () => {
    setBusy(true);
    const becomingClosed = edit.status === 'closed' && project.status !== 'closed';
    const payload: any = {
      name: edit.name.trim(),
      manager_id: edit.manager_id || null,
      secondary_manager_id: edit.secondary_manager_id || null,
      manager_profit_pct: parseFloat(edit.manager_profit_pct) || 0,
      fund_profit_pct: parseFloat(edit.fund_profit_pct) || 0,
      status: edit.status,
      comments: edit.comments,
      closed_at: edit.status === 'closed' && !project.closed_at ? new Date().toISOString() : project.closed_at,
    };

    // On close: refund leftover budget to Available Balance
    if (becomingClosed && budgetRemaining > 0 && Number(project.budget_returned || 0) === 0) {
      await supabase.from('fund_transactions').insert({
        type: 'income', amount: budgetRemaining,
        reason: `Project ${project.code} — অব্যবহৃত budget Available Balance-এ ফেরত`,
      });
      payload.budget_returned = budgetRemaining;
    }

    const { error } = await supabase.from('projects').update(payload).eq('id', id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(becomingClosed && budgetRemaining > 0
      ? `Project closed — ৳${budgetRemaining.toFixed(0)} Available Balance-এ ফেরত`
      : 'Project updated');
    setShowEdit(false);
    load();
  };

  const handleFundRequest = async () => {
    const amt = parseFloat(fundReq.amount);
    if (!amt || amt <= 0) { toast.error('Valid amount দিন'); return; }
    setBusy(true);
    const { error } = await (supabase as any).from('project_fund_requests').insert({
      project_id: id, amount: amt, reason: fundReq.reason || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Fund request পাঠানো হয়েছে');
    setShowFundReq(false);
    setFundReq({ amount: '', reason: '' });
    load();
  };

  const handleFundDecision = async (req: any, decision: 'approved' | 'rejected', note?: string) => {
    setBusy(true);
    if (decision === 'approved') {
      // Check Available Balance
      const [{ data: profs }, { data: fundTxs }] = await Promise.all([
        (supabase as any).from('member_directory').select('total_deposited'),
        supabase.from('fund_transactions').select('type, amount'),
      ]);
      const totalCapital = (profs || []).reduce((s: number, p: any) => s + Number(p.total_deposited || 0), 0);
      const fundDelta = (fundTxs || []).reduce((s: number, t: any) =>
        s + ((t.type === 'income' || t.type === 'in') ? Number(t.amount) : -Number(t.amount)), 0);
      const availableBalance = totalCapital + fundDelta;
      if (Number(req.amount) > availableBalance) {
        setBusy(false);
        toast.error(`Available Balance-এ পর্যাপ্ত টাকা নেই। Available: ৳${availableBalance.toFixed(0)}`);
        return;
      }
      // Debit Available Balance + bump project's extra_funds_approved
      await supabase.from('fund_transactions').insert({
        type: 'expense', amount: Number(req.amount),
        reason: `Project ${project.code} — অতিরিক্ত fund approved`,
      });
      await supabase.from('projects').update({
        extra_funds_approved: Number(project.extra_funds_approved || 0) + Number(req.amount),
      }).eq('id', id!);
    }
    await (supabase as any).from('project_fund_requests').update({
      status: decision, admin_note: note || null, decided_at: new Date().toISOString(),
    }).eq('id', req.id);
    setBusy(false);
    toast.success(decision === 'approved' ? 'Approved & project budget বেড়েছে' : 'Rejected');
    load();
  };


  const handleAddTx = async () => {
    const amt = parseFloat(tx.amount);
    if (!amt || amt <= 0) { toast.error('Enter valid amount'); return; }
    setBusy(true);
    const { error } = await supabase.from('project_transactions').insert({
      project_id: id, type: tx.type, amount: amt,
      reason: tx.reason || null, comments: tx.comments || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction added');
    setShowTx(false);
    setTx({ type: 'income', amount: '', reason: '', comments: '' });
    load();
  };

  const handleDelete = async () => {
    setBusy(true);
    const { error } = await supabase.from('projects').delete().eq('id', id!);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Project deleted');
    navigate('/projects');
  };

  const handleDistribute = async () => {
    if (alreadyDistributed) { toast.error('Already distributed'); return; }
    if (profitTotals.total <= 0) { toast.error('No profit to distribute'); return; }
    setBusy(true);
    const rows: any[] = [];
    const fundExtras: { amount: number; reason: string }[] = [];

    const managerId = project.manager_id || project.secondary_manager_id;
    if (profitTotals.manager > 0 && managerId) {
      rows.push({ source_type: 'project', source_id: id, member_id: managerId, amount: profitTotals.manager, share_percentage: Number(project.manager_profit_pct), distribution_type: 'manager' });
    }
    if (profitTotals.fund > 0) {
      rows.push({ source_type: 'project', source_id: id, member_id: null, amount: profitTotals.fund, share_percentage: Number(project.fund_profit_pct), distribution_type: 'fund' });
    }
    shareRows.forEach(r => {
      if (r.expected <= 0) return;
      if (r.isDeleted || !r.memberId) {
        rows.push({ source_type: 'project', source_id: id, member_id: null, amount: r.expected, share_percentage: r.sharePct, distribution_type: 'deleted_member_to_fund' });
        fundExtras.push({ amount: r.expected, reason: `Project ${project.code} — ${r.name} (deleted member) এর অংশ Fund-এ যোগ` });
      } else {
        rows.push({ source_type: 'project', source_id: id, member_id: r.memberId, amount: r.expected, share_percentage: r.sharePct, distribution_type: 'share' });
      }
    });
    if (rows.length === 0) { setBusy(false); toast.error('Nothing to distribute'); return; }
    const { error } = await supabase.from('profit_distributions').insert(rows);
    if (error) { setBusy(false); toast.error(error.message); return; }

    // Add fund_transactions: Fund cut + each deleted-member redirect
    const fundTxRows: any[] = [];
    if (profitTotals.fund > 0) {
      fundTxRows.push({ type: 'income', amount: profitTotals.fund, reason: `Project ${project.code} — Fund profit share (${project.fund_profit_pct}%)` });
    }
    fundExtras.forEach(f => fundTxRows.push({ type: 'income', amount: f.amount, reason: f.reason }));
    if (fundTxRows.length) await supabase.from('fund_transactions').insert(fundTxRows);

    // Add each (non-deleted) member's share to their balance
    const perMember = new Map<string, number>();
    rows.forEach(r => {
      if (r.member_id && r.amount > 0 && r.distribution_type !== 'deleted_member_to_fund') {
        perMember.set(r.member_id, (perMember.get(r.member_id) || 0) + Number(r.amount));
      }
    });
    if (perMember.size > 0) {
      const ids = Array.from(perMember.keys());
      const { data: profs } = await supabase.from('profiles').select('id, total_deposited').in('id', ids);
      await Promise.all((profs || []).map((p: any) =>
        supabase.from('profiles').update({
          total_deposited: Number(p.total_deposited || 0) + (perMember.get(p.id) || 0),
        }).eq('id', p.id)
      ));
    }

    setBusy(false);
    toast.success('Profit distributed & added to balances');
    load();
  };


  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!project) return <div className="text-center text-muted-foreground py-12">Project not found</div>;

  const mgr = project.manager || project.secondary_manager;
  const mgrPhone: string = mgr?.phone || '';
  const phoneDigits = mgrPhone.replace(/[^0-9]/g, '');
  const isClosed = project.status === 'closed';

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center justify-between">
        <Link to="/projects"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button></Link>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
            <Button size="sm" variant="outline" onClick={() => setShowTx(true)}><Plus className="w-4 h-4 mr-1" /> Transaction</Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDelete(true)}><Trash2 className="w-4 h-4 mr-1" /> Delete</Button>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="text-xs font-mono bg-secondary px-2 py-1 rounded">{project.code}</span>
            <h1 className="text-2xl font-bold mt-2">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manager: {mgr?.full_name || <span className="italic">Unassigned</span>}
              {project.secondary_manager && project.manager_id && (
                <span className="ml-2 text-xs">(Secondary: {project.secondary_manager.full_name})</span>
              )}
            </p>
            {mgrPhone && <p className="text-xs font-mono text-muted-foreground">{mgrPhone}</p>}
          </div>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${isClosed ? 'bg-secondary text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600'}`}>{project.status}</span>
        </div>

        {phoneDigits && (
          <div className="flex flex-wrap gap-2 mb-6">
            <a href={`tel:${mgrPhone}`} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><Phone className="w-4 h-4" /> Call</a>
            <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><MessageCircle className="w-4 h-4" /> WhatsApp</a>
            <a href={`sms:${mgrPhone}`} className="flex-1 min-w-[100px] flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-primary/10 text-sm"><MessageSquare className="w-4 h-4" /> SMS</a>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingUp className="w-3 h-3" /> Total In</div>
            <p className="font-mono font-bold text-emerald-600 tabular-nums text-sm">{formatBDT(totals.in)}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><TrendingDown className="w-3 h-3" /> Total Out</div>
            <p className="font-mono font-bold text-destructive tabular-nums text-sm">{formatBDT(totals.out)}</p>
          </div>
          <div className="bg-secondary/50 rounded-lg p-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1"><Sparkles className="w-3 h-3" /> Profit</div>
            <p className="font-mono font-bold text-primary tabular-nums text-sm">{formatBDT(totals.profit)}</p>
          </div>
        </div>

        {budgetAssigned > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Project Budget</span>
              <span className="text-[10px] text-muted-foreground">{Number(project.budget_returned) > 0 ? `Returned ৳${Number(project.budget_returned).toFixed(0)}` : ''}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-primary/5 rounded-lg p-2">
                <p className="text-muted-foreground">Assigned</p>
                <p className="font-mono font-bold tabular-nums">{formatBDT(budgetAssigned)}</p>
                {Number(project.extra_funds_approved) > 0 && (
                  <p className="text-[10px] text-muted-foreground">+ ৳{Number(project.extra_funds_approved).toFixed(0)} extra</p>
                )}
              </div>
              <div className="bg-destructive/5 rounded-lg p-2">
                <p className="text-muted-foreground">Spent</p>
                <p className="font-mono font-bold tabular-nums">{formatBDT(totals.out)}</p>
              </div>
              <div className="bg-emerald-500/5 rounded-lg p-2">
                <p className="text-muted-foreground">Remaining</p>
                <p className="font-mono font-bold tabular-nums">{formatBDT(budgetRemaining)}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-3 text-xs text-muted-foreground border-t border-border pt-4">
          <span>Manager: {project.manager_profit_pct}%</span>
          <span>Fund: {project.fund_profit_pct}%</span>
          <span>Members pool: {Math.max(0, 100 - Number(project.manager_profit_pct) - Number(project.fund_profit_pct))}%</span>
        </div>
        {project.comments && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap">{project.comments}</p>}
      </div>

      {/* Fund Requests */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold">অতিরিক্ত Fund Requests</h2>
            <p className="text-[11px] text-muted-foreground">Manager admin বরাবর extra budget চাইতে পারে।</p>
          </div>
          {!isClosed && (
            <Button size="sm" variant="outline" onClick={() => setShowFundReq(true)}>
              <Plus className="w-4 h-4 mr-1" /> Request
            </Button>
          )}
        </div>
        {fundRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">কোন request নেই।</p>
        ) : (
          <div className="space-y-2">
            {fundRequests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-secondary/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold tabular-nums text-sm">{formatBDT(Number(r.amount))}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600' :
                      r.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                      'bg-amber-500/10 text-amber-600'
                    }`}>{r.status}</span>
                  </div>
                  {r.reason && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.reason}</p>}
                  <p className="text-[10px] text-muted-foreground">{format(new Date(r.created_at), 'PPp')}</p>
                </div>
                {isAdmin && r.status === 'pending' && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => handleFundDecision(r, 'approved')} disabled={busy}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleFundDecision(r, 'rejected')} disabled={busy}>Reject</Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>


      {/* Profit Distribution */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-semibold">Profit Distribution</h2>
          {isAdmin && isClosed && !alreadyDistributed && (
            <Button size="sm" onClick={handleDistribute} disabled={busy || profitTotals.total <= 0}>
              {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              <Sparkles className="w-4 h-4 mr-1" /> Distribute Profit
            </Button>
          )}
          {alreadyDistributed && <span className="text-xs bg-emerald-500/10 text-emerald-600 px-2 py-1 rounded-full">Distributed</span>}
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Manager ({project.manager_profit_pct}%)</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(profitTotals.manager)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Fund ({project.fund_profit_pct}%)</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(profitTotals.fund)}</p></div>
          <div className="bg-secondary/50 rounded-lg p-3"><p className="text-xs text-muted-foreground mb-1">Members</p><p className="font-mono font-bold tabular-nums text-sm">{formatBDT(profitTotals.memberPool)}</p></div>
        </div>
        {shareRows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No member shares snapshot for this project.</p>
        ) : (
          <div className="space-y-1.5">
            {shareRows.map(r => (
              <div key={r.id} className={`flex justify-between items-center text-sm px-3 py-2 rounded-lg ${r.isDeleted ? 'bg-destructive/5' : 'bg-secondary/30'}`}>
                <span className="font-medium truncate">
                  {r.name}
                  {r.isDeleted && <span className="ml-1 text-[10px] text-destructive">(deleted → Fund)</span>}
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{r.sharePct.toFixed(2)}%</span>
                  <span className={`font-mono font-bold tabular-nums ${r.isDeleted ? 'line-through text-muted-foreground' : ''}`}>{formatBDT(r.expected)}</span>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground mt-2 italic">Project তৈরির সময়ের snapshot — পরিবর্তন হয় না।</p>
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-semibold mb-4">Transactions ({txs.length})</h2>
        {txs.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No transactions yet.</p>
        ) : (
          <div className="space-y-2">
            {txs.slice(0, txLimit).map(t => (
              <div key={t.id} className="flex justify-between items-start px-3 py-2.5 rounded-lg bg-secondary/30">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${t.type === 'income' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>{t.type}</span>
                    {t.reason && <span className="text-sm font-medium truncate">{t.reason}</span>}
                  </div>
                  {t.comments && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{t.comments}</p>}
                  <p className="text-[10px] text-muted-foreground mt-1">{format(new Date(t.created_at), 'PPp')}</p>
                </div>
                <span className={`font-mono font-bold tabular-nums text-sm shrink-0 ${t.type === 'income' ? 'text-emerald-600' : 'text-destructive'}`}>
                  {t.type === 'income' ? '+' : '−'}{formatBDT(Number(t.amount))}
                </span>
              </div>
            ))}
            {txs.length > txLimit && (
              <button
                onClick={() => setTxLimit(l => l + 10)}
                className="w-full py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg"
              >
                See more ({txs.length - txLimit} বাকি)
              </button>
            )}
          </div>
        )}
      </div>


      {/* Edit Sheet */}
      <Sheet open={showEdit} onOpenChange={setShowEdit}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Project</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-4 mt-6">
              <div className="space-y-2"><Label>Name</Label><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Manager</Label>
                <Select value={edit.manager_id} onValueChange={v => setEdit({ ...edit, manager_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                  <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Secondary Manager (fallback)</Label>
                <Select value={edit.secondary_manager_id || 'none'} onValueChange={v => setEdit({ ...edit, secondary_manager_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Manager %</Label><Input type="number" value={edit.manager_profit_pct} onChange={e => setEdit({ ...edit, manager_profit_pct: e.target.value })} /></div>
                <div className="space-y-2"><Label>Fund %</Label><Input type="number" value={edit.fund_profit_pct} onChange={e => setEdit({ ...edit, fund_profit_pct: e.target.value })} /></div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={edit.status} onValueChange={v => setEdit({ ...edit, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Comments</Label><Textarea value={edit.comments} onChange={e => setEdit({ ...edit, comments: e.target.value })} rows={3} /></div>
              <Button className="w-full" onClick={handleEditSave} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Transaction */}
      <Dialog open={showTx} onOpenChange={setShowTx}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={tx.type} onValueChange={v => setTx({ ...tx, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income (In)</SelectItem>
                  <SelectItem value="expense">Expense (Out)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Amount (৳)</Label><Input type="number" value={tx.amount} onChange={e => setTx({ ...tx, amount: e.target.value })} /></div>
            <div><Label>Reason</Label><Input value={tx.reason} onChange={e => setTx({ ...tx, reason: e.target.value })} placeholder="Short reason" /></div>
            <div><Label>Comments</Label><Textarea value={tx.comments} onChange={e => setTx({ ...tx, comments: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTx(false)}>Cancel</Button>
            <Button onClick={handleAddTx} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete project?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the project and all its transactions.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fund Request */}
      <Dialog open={showFundReq} onOpenChange={setShowFundReq}>
        <DialogContent>
          <DialogHeader><DialogTitle>অতিরিক্ত Fund Request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>কত টাকা দরকার (৳)</Label><Input type="number" value={fundReq.amount} onChange={e => setFundReq({ ...fundReq, amount: e.target.value })} /></div>
            <div><Label>কারণ</Label><Textarea value={fundReq.reason} onChange={e => setFundReq({ ...fundReq, reason: e.target.value })} rows={3} placeholder="কেন প্রয়োজন বিস্তারিত লিখুন" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFundReq(false)}>Cancel</Button>
            <Button onClick={handleFundRequest} disabled={busy}>{busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

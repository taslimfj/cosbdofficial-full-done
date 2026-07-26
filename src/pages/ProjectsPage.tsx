import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT, buildEntityCode } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Loader2, FolderKanban } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateProjectsPDF } from '@/lib/pdfGenerator';
import { snapshotMemberShares, persistExclusions } from '@/lib/snapshotShares';
import { MemberMultiSelect } from '@/components/MemberMultiSelect';
import { computeMissedInstallments } from '@/lib/memberStatus';
import { DateField } from '@/components/DateField';


export default function ProjectsPage() {
  const { role, user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [excludedMemberIds, setExcludedMemberIds] = useState<string[]>([]);
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const [form, setForm] = useState({ name: '', managerId: '', managerProfitPct: '10', fundProfitPct: '5', issueDate: todayStr() });
  const [pctDefaults, setPctDefaults] = useState({ fund: 5, manager: 10, admin: 5 });

  useEffect(() => {
    (supabase as any)
      .from('percentage_defaults')
      .select('fund_pct, manager_pct, admin_pct')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) setPctDefaults({
          fund: Number(data.fund_pct) || 0,
          manager: Number(data.manager_pct) || 0,
          admin: Number(data.admin_pct) || 0,
        });
      });
  }, []);


  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*'),
      supabase.from('deposits').select('member_id, amount, month_year, created_at, status'),
    ]).then(([projRes, memRes, depRes]: any[]) => {
      const members = (memRes.data || []).filter((m: any) => !m.is_deleted && !m.is_customer);
      const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
      const projects = (projRes.data || []).map((p: any) => ({ ...p, manager: byId.get(p.manager_id) || null }));
      setProjects(projects);
      setMembers(members);
      setDeposits(depRes.data || []);
      setLoading(false);
    });
  }, []);

  const criticalMemberIds = useMemo(() => {
    const byMember = new Map<string, any[]>();
    (deposits || []).forEach((d: any) => {
      if (!d.member_id) return;
      const arr = byMember.get(d.member_id) || [];
      arr.push(d);
      byMember.set(d.member_id, arr);
    });
    return members
      .filter((m: any) => computeMissedInstallments(byMember.get(m.id) || [], m.created_at).level === 'critical')
      .map((m: any) => m.id);
  }, [members, deposits]);


  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Project name দিন'); return; }
    if (!form.managerId) { toast.error('Manager select করুন'); return; }

    setSubmitting(true);

    const now = new Date();
    const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const { count: yearCount } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yStart);
    const code = buildEntityCode('PRJ', form.name.trim(), (yearCount || 0) + 1, now);
    const isAdmin = role === 'admin';
    const { data: inserted, error } = await supabase.from('projects').insert({
      code, name: form.name.trim(), manager_id: form.managerId,
      manager_profit_pct: pctDefaults.manager,
      fund_profit_pct: pctDefaults.fund,
      admin_profit_pct: pctDefaults.admin,
      ...(isAdmin && form.issueDate ? { issue_date: form.issueDate } : {}),
    } as any).select('id').single();
    if (error || !inserted) { setSubmitting(false); toast.error(error?.message || 'Failed'); return; }

    // Snapshot member shares — locked at creation
    try {
      const snap = await snapshotMemberShares({ type: 'project', sourceId: inserted.id, excludeMemberIds: excludedMemberIds });
      await persistExclusions({ type: 'project', sourceId: inserted.id, excluded: snap.excluded });
    } catch (e: any) { console.warn('Project snapshot failed:', e?.message); }

    setSubmitting(false);
    toast.success(`Project ${code} created — খরচ Cash in Hand থেকে হবে`);
    setShowSheet(false);
    setForm({ name: '', managerId: '', managerProfitPct: '10', fundProfitPct: '5', issueDate: todayStr() });
    setExcludedMemberIds([]);
    const { data } = await supabase.from('projects').select('*, manager:profiles!projects_manager_id_fkey(*)').order('created_at', { ascending: false });
    setProjects(data || []);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground mt-1">{projects.length} projects</p>
        </div>
        <div className="flex gap-2">
          <PdfPeriodButton onDownload={async (p) => {
            const { data } = await supabase.from('project_transactions').select('*');
            generateProjectsPDF(projects, data || [], p);
          }} />
        {role === 'admin' && (
          <Sheet open={showSheet} onOpenChange={setShowSheet}>
            <SheetTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New Project</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Create Project</SheetTitle></SheetHeader>
              <div className="space-y-4 mt-6">
                {role === 'admin' && (
                  <div className="space-y-2">
                    <Label>Create / Issue Date <span className="text-xs text-muted-foreground">(admin only)</span></Label>
                    <Input type="date" value={form.issueDate} onChange={e => setForm(p => ({ ...p, issueDate: e.target.value }))} />
                  </div>
                )}
                <div className="space-y-2"><Label>Project Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Project name" /></div>
                <div className="space-y-2">
                  <Label>Project Manager</Label>
                  <Select value={form.managerId} onValueChange={v => setForm(p => ({ ...p, managerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded px-2 py-1">
                  Project-এর সব খরচ সরাসরি Cash in Hand থেকে হবে — কোনো budget আগে থেকে reserve করা লাগবে না।
                </p>
                <p className="text-[11px] text-muted-foreground bg-secondary/40 rounded px-2 py-1">
                  Profit distribution — Fund: <b>{pctDefaults.fund}%</b> • Manager: <b>{pctDefaults.manager}%</b> • Admin: <b>{pctDefaults.admin}%</b>
                  <span className="block opacity-70">Default Settings → Percentage Default থেকে পরিবর্তন করুন।</span>
                </p>
                <div className="space-y-2">
                  <Label>Exclude Members <span className="text-xs text-muted-foreground">(এই project-এ যাদের অংশ থাকবে না)</span></Label>
                  <MemberMultiSelect
                    members={members.map(m => ({ id: m.id, name: m.full_name }))}
                    value={excludedMemberIds}
                    onChange={setExcludedMemberIds}
                    lockedIds={criticalMemberIds}
                    lockedLabel="৩ মাস বকেয়া — auto exclude"
                    placeholder="কাউকে exclude করতে চাইলে select করুন"
                  />
                  <p className="text-[11px] text-muted-foreground">Select করা member রা এই project-এর profit/loss share পাবেন না। বাকি member-দের মধ্যে percentage পুনরায় হিসাব হবে। ৩ মাস consecutive বকেয়া member automatic exclude হবেন।</p>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Create Project
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        )}
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList>
          <TabsTrigger value="active">Active ({projects.filter(p => p.status === 'active').length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({projects.filter(p => p.status !== 'active').length})</TabsTrigger>
        </TabsList>
        {(['active', 'closed'] as const).map(tab => {
          const filtered = projects.filter(p => tab === 'active' ? p.status === 'active' : p.status !== 'active');
          const list = [...filtered].sort((a, b) => {
            const aMine = user?.id && a.manager_id === user.id ? 1 : 0;
            const bMine = user?.id && b.manager_id === user.id ? 1 : 0;
            return bMine - aMine;
          });
          return (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.length === 0 ? (
                  <div className="col-span-full bg-card border border-border rounded-xl p-12 text-center">
                    <FolderKanban className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No {tab} projects.</p>
                  </div>
                ) : list.map(proj => (
                  <Link key={proj.id} to={`/projects/${proj.id}`} className="block bg-card border border-border p-5 rounded-xl hover:border-primary/30 transition-colors shadow-subtle">
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-xs font-mono bg-secondary px-2 py-1 rounded text-foreground">{proj.code}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${proj.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>{proj.status}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">{proj.name}</h3>
                    <p className="text-xs text-muted-foreground">Manager: {proj.manager?.full_name || 'N/A'}</p>
                    <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                      <span>Manager: {proj.manager_profit_pct}%</span>
                      <span>Fund: {proj.fund_profit_pct}%</span>
                    </div>
                  </Link>
                ))}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

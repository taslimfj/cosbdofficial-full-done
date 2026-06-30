import { useEffect, useState } from 'react';
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
import { snapshotMemberShares } from '@/lib/snapshotShares';

export default function ProjectsPage() {
  const { role, user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSheet, setShowSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', managerId: '', managerProfitPct: '5', fundProfitPct: '15', budget: '' });

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('member_directory').select('*'),
    ]).then(([projRes, memRes]: any[]) => {
      const members = memRes.data || [];
      const byId = new Map<string, any>(members.map((m: any) => [m.id, m]));
      const projects = (projRes.data || []).map((p: any) => ({ ...p, manager: byId.get(p.manager_id) || null }));
      setProjects(projects);
      setMembers(members);
      setLoading(false);
    });
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Project name দিন'); return; }
    if (!form.managerId) { toast.error('Manager select করুন'); return; }
    const budget = parseFloat(form.budget);
    if (!budget || budget <= 0) { toast.error('আনুমানিক budget দিন'); return; }

    setSubmitting(true);

    // Check Available Balance = total capital + fund income - fund expense
    const [{ data: profs }, { data: fundTxs }] = await Promise.all([
      (supabase as any).from('member_directory').select('total_deposited'),
      supabase.from('fund_transactions').select('type, amount'),
    ]);
    const totalCapital = (profs || []).reduce((s: number, p: any) => s + Number(p.total_deposited || 0), 0);
    const fundDelta = (fundTxs || []).reduce((s: number, t: any) =>
      s + ((t.type === 'income' || t.type === 'in') ? Number(t.amount) : -Number(t.amount)), 0);
    const availableBalance = totalCapital + fundDelta;
    if (budget > availableBalance) {
      setSubmitting(false);
      toast.error(`Available Balance-এ পর্যাপ্ত টাকা নেই। Available: ৳${availableBalance.toFixed(0)}`);
      return;
    }

    const now = new Date();
    const yStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const { count: yearCount } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', yStart);
    const code = buildEntityCode('PRJ', form.name.trim(), (yearCount || 0) + 1, now);
    const { data: inserted, error } = await supabase.from('projects').insert({
      code, name: form.name.trim(), manager_id: form.managerId,
      manager_profit_pct: parseFloat(form.managerProfitPct),
      fund_profit_pct: parseFloat(form.fundProfitPct),
      budget_amount: budget,
    }).select('id').single();
    if (error || !inserted) { setSubmitting(false); toast.error(error?.message || 'Failed'); return; }

    // Reserve budget from Available Balance (ledger via fund_transactions)
    await supabase.from('fund_transactions').insert({
      type: 'expense', amount: budget,
      reason: `Project ${code} — Budget reserved (${form.name.trim()})`,
    });

    // Snapshot member shares — locked at creation
    try { await snapshotMemberShares({ type: 'project', sourceId: inserted.id }); }
    catch (e: any) { console.warn('Project snapshot failed:', e?.message); }

    setSubmitting(false);
    toast.success(`Project ${code} created — ৳${budget} Available Balance থেকে assign হলো`);
    setShowSheet(false);
    setForm({ name: '', managerId: '', managerProfitPct: '5', fundProfitPct: '15', budget: '' });
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
                <div className="space-y-2"><Label>Project Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Project name" /></div>
                <div className="space-y-2">
                  <Label>Project Manager</Label>
                  <Select value={form.managerId} onValueChange={v => setForm(p => ({ ...p, managerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                    <SelectContent>{members.map(m => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>আনুমানিক Budget (৳)</Label>
                  <Input type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="যেমন 50000" />
                  <p className="text-[11px] text-muted-foreground">এই টাকা Available Balance থেকে কেটে project-এ assign হবে। close করার সময় অব্যবহৃত টাকা + profit Available Balance-এ ফেরত যাবে।</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Manager %</Label><Input type="number" value={form.managerProfitPct} onChange={e => setForm(p => ({ ...p, managerProfitPct: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Fund %</Label><Input type="number" value={form.fundProfitPct} onChange={e => setForm(p => ({ ...p, fundProfitPct: e.target.value }))} /></div>
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
          const list = projects.filter(p => tab === 'active' ? p.status === 'active' : p.status !== 'active');
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

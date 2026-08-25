import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateField } from '@/components/DateField';
import { CheckSquare, Plus, Pencil, Trash2, Check, X, CalendarDays, Users, Loader2, Video } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description: string | null;
  details: string | null;
  task_type: 'task' | 'meeting';
  task_date: string;
  visibility: 'assigned' | 'all' | 'admin';
  status: 'ongoing' | 'closed';
  created_at: string;
}

interface Assignee { id: string; task_id: string; member_id: string }
interface Response {
  id: string;
  task_id: string;
  member_id: string;
  status: 'completed' | 'not_completed';
  note: string | null;
}

const PAGE_SIZE = 10;

const emptyForm = {
  id: undefined as string | undefined,
  title: '',
  description: '',
  details: '',
  task_type: 'task' as 'task' | 'meeting',
  task_date: format(new Date(), 'yyyy-MM-dd'),
  visibility: 'assigned' as 'assigned' | 'all' | 'admin',
  assignees: [] as string[],
};

export default function TasksPage() {
  const { role, user, isCustomer } = useAuth();
  const isAdmin = role === 'admin' && !isCustomer;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('ongoing');
  const [limits, setLimits] = useState<Record<string, number>>({ ongoing: PAGE_SIZE, upcoming: PAGE_SIZE, closed: PAGE_SIZE });
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ status: 'completed' | 'not_completed'; note: string } | null>(null);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tasks').select('*').order('task_date', { ascending: true });
      if (error) throw error;
      return (data || []) as Task[];
    },
  });

  const { data: assignees = [] } = useQuery({
    queryKey: ['task_assignees'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('task_assignees').select('*');
      if (error) throw error;
      return (data || []) as Assignee[];
    },
  });

  const { data: responses = [] } = useQuery({
    queryKey: ['task_responses'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('task_responses').select('*');
      if (error) throw error;
      return (data || []) as Response[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['task_members'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('member_directory').select('id, full_name, avatar_url, is_deleted, is_customer');
      if (error) throw error;
      return (data || []).filter((m: any) => !m.is_deleted && !m.is_customer);
    },
  });

  const memberName = (id: string) => members.find((m: any) => m.id === id)?.full_name || 'Member';

  const visible = useMemo(() => {
    if (isAdmin) return tasks;
    return tasks.filter(t => t.visibility !== 'admin');
  }, [tasks, isAdmin]);

  const grouped = useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const ongoing: Task[] = [];
    const upcoming: Task[] = [];
    const closed: Task[] = [];
    for (const t of visible) {
      if (t.status === 'closed') { closed.push(t); continue; }
      const d = parseISO(t.task_date);
      if (isWithinInterval(d, { start: monthStart, end: monthEnd }) || d < monthStart) ongoing.push(t);
      else upcoming.push(t);
    }
    closed.sort((a, b) => b.task_date.localeCompare(a.task_date));
    return { ongoing, upcoming, closed };
  }, [visible]);

  const saveTask = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Title লিখুন');
      if (!form.task_date) throw new Error('তারিখ নির্বাচন করুন');
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        details: form.details.trim() || null,
        task_type: form.task_type,
        task_date: form.task_date,
        visibility: form.visibility,
      };
      let taskId = form.id;
      if (taskId) {
        const { error } = await (supabase as any).from('tasks').update(payload).eq('id', taskId);
        if (error) throw error;
        const { error: delErr } = await (supabase as any).from('task_assignees').delete().eq('task_id', taskId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await (supabase as any)
          .from('tasks').insert({ ...payload, created_by: user?.id }).select('id').single();
        if (error) throw error;
        taskId = data.id;
      }
      if (form.assignees.length > 0) {
        const rows = form.assignees.map(member_id => ({ task_id: taskId, member_id }));
        const { error } = await (supabase as any).from('task_assignees').insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Task সংরক্ষণ হয়েছে');
      setFormOpen(false);
      setForm({ ...emptyForm });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task_assignees'] });
    },
    onError: (e: any) => toast.error(e?.message || 'সংরক্ষণ ব্যর্থ হয়েছে'),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Task মুছে ফেলা হয়েছে');
      setDetailId(null);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e: any) => toast.error(e?.message || 'মুছে ফেলা যায়নি'),
  });

  const submitAnswer = useMutation({
    mutationFn: async ({ taskId, status, note }: { taskId: string; status: 'completed' | 'not_completed'; note: string }) => {
      if (!user) throw new Error('Login প্রয়োজন');
      const { error } = await (supabase as any).from('task_responses').upsert(
        { task_id: taskId, member_id: user.id, status, note: note.trim() || null },
        { onConflict: 'task_id,member_id' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('আপনার উত্তর সংরক্ষণ হয়েছে');
      setAnswer(null);
      queryClient.invalidateQueries({ queryKey: ['task_responses'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (e: any) => toast.error(e?.message || 'সংরক্ষণ ব্যর্থ হয়েছে'),
  });

  const toggleStatus = useMutation({
    mutationFn: async (task: Task) => {
      const { error } = await (supabase as any)
        .from('tasks').update({ status: task.status === 'closed' ? 'ongoing' : 'closed' }).eq('id', task.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onError: (e: any) => toast.error(e?.message || 'পরিবর্তন করা যায়নি'),
  });

  const openEdit = (task: Task) => {
    setForm({
      id: task.id,
      title: task.title,
      description: task.description || '',
      details: task.details || '',
      task_type: task.task_type,
      task_date: task.task_date,
      visibility: task.visibility,
      assignees: assignees.filter(a => a.task_id === task.id).map(a => a.member_id),
    });
    setFormOpen(true);
  };

  const detailTask = tasks.find(t => t.id === detailId) || null;
  const detailAssignees = detailTask ? assignees.filter(a => a.task_id === detailTask.id) : [];
  const detailResponses = detailTask ? responses.filter(r => r.task_id === detailTask.id) : [];
  const myResponse = detailTask && user ? detailResponses.find(r => r.member_id === user.id) : undefined;
  const iAmAssigned = !!(detailTask && user && detailAssignees.some(a => a.member_id === user.id));

  const renderList = (list: Task[], key: string) => {
    const limit = limits[key] ?? PAGE_SIZE;
    const shown = list.slice(0, limit);
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground py-8 text-center">কোনো task নেই</p>;
    }
    return (
      <div className="space-y-3">
        {shown.map((task, idx) => {
          const colorIdx = (idx % 8) + 1;
          const c = `hsl(var(--rule-${colorIdx}))`;
          const taskAssignees = assignees.filter(a => a.task_id === task.id);
          const done = responses.filter(r => r.task_id === task.id && r.status === 'completed').length;
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => { setDetailId(task.id); setAnswer(null); }}
              className="w-full text-left rounded-xl border p-4 shadow-sm transition-colors hover:brightness-[0.98]"
              style={{
                borderColor: `hsl(var(--rule-${colorIdx}) / 0.35)`,
                background: `linear-gradient(90deg, hsl(var(--rule-${colorIdx}) / 0.14), hsl(var(--rule-${colorIdx}) / 0.03))`,
                borderLeft: `6px solid ${c}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {task.task_type === 'meeting'
                      ? <Video className="w-4 h-4 shrink-0" style={{ color: c }} />
                      : <CheckSquare className="w-4 h-4 shrink-0" style={{ color: c }} />}
                    <h3 className="font-semibold break-words" style={{ color: c }}>{task.title}</h3>
                    <Badge variant="outline" className="text-[10px]">
                      {task.task_type === 'meeting' ? 'Meeting' : 'Task'}
                    </Badge>
                    {task.visibility === 'all' && <Badge variant="secondary" className="text-[10px]">সবাই</Badge>}
                    {task.visibility === 'admin' && <Badge variant="secondary" className="text-[10px]">শুধু Admin</Badge>}
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap break-words">
                      {task.description}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" /> {format(parseISO(task.task_date), 'dd/MM/yyyy')}
                    </span>
                    {taskAssignees.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" /> {done}/{taskAssignees.length} সম্পন্ন
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant={task.status === 'closed' ? 'default' : 'outline'} className="shrink-0">
                  {task.status === 'closed' ? 'Completed' : 'Ongoing'}
                </Badge>
              </div>
            </button>
          );
        })}
        {list.length > limit && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLimits(prev => ({ ...prev, [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE }))}
          >
            See more ({list.length - limit} বাকি)
          </Button>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Task</h1>
          <p className="text-sm text-muted-foreground mt-1">কর্মপরিকল্পনা, মিটিং ও দায়িত্ব বণ্টন</p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => { setForm({ ...emptyForm }); setFormOpen(true); }}>
            <Plus className="w-4 h-4" /> নতুন Task
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="ongoing">Ongoing ({grouped.ongoing.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({grouped.upcoming.length})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({grouped.closed.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="ongoing" className="mt-4">{renderList(grouped.ongoing, 'ongoing')}</TabsContent>
        <TabsContent value="upcoming" className="mt-4">{renderList(grouped.upcoming, 'upcoming')}</TabsContent>
        <TabsContent value="closed" className="mt-4">{renderList(grouped.closed, 'closed')}</TabsContent>
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) { setDetailId(null); setAnswer(null); } }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailTask && (
            <>
              <DialogHeader>
                <DialogTitle className="break-words">{detailTask.title}</DialogTitle>
                <DialogDescription>
                  {detailTask.task_type === 'meeting' ? 'Meeting' : 'Task'} · {format(parseISO(detailTask.task_date), 'dd/MM/yyyy')}
                </DialogDescription>
              </DialogHeader>

              {detailTask.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap break-words">{detailTask.description}</p>
                </div>
              )}
              {detailTask.details && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {detailTask.task_type === 'meeting' ? 'Meeting details / link' : 'বিস্তারিত'}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-all">{detailTask.details}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Assigned {detailTask.visibility === 'all' ? '(সবাই দেখতে পারবে)' : ''}
                </p>
                <div className="space-y-2">
                  {detailAssignees.length === 0 && <p className="text-sm text-muted-foreground">কাউকে assign করা হয়নি</p>}
                  {detailAssignees.map(a => {
                    const r = detailResponses.find(x => x.member_id === a.member_id);
                    return (
                      <div key={a.id} className="rounded-lg border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium break-words">{memberName(a.member_id)}</span>
                          {r ? (
                            <Badge variant={r.status === 'completed' ? 'default' : 'destructive'} className="gap-1 shrink-0">
                              {r.status === 'completed' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                              {r.status === 'completed' ? 'Completed' : 'Not completed'}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0">অপেক্ষমাণ</Badge>
                          )}
                        </div>
                        {r?.note && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">মন্তব্য: {r.note}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {iAmAssigned && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-sm font-medium">
                    আপনার অবস্থা {myResponse && `(বর্তমানে: ${myResponse.status === 'completed' ? 'Completed' : 'Not completed'})`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={answer?.status === 'completed' ? 'default' : 'outline'}
                      className="gap-1"
                      onClick={() => setAnswer({ status: 'completed', note: myResponse?.note || '' })}
                    >
                      <Check className="w-4 h-4" /> সম্পন্ন হয়েছে
                    </Button>
                    <Button
                      size="sm"
                      variant={answer?.status === 'not_completed' ? 'destructive' : 'outline'}
                      className="gap-1"
                      onClick={() => setAnswer({ status: 'not_completed', note: myResponse?.note || '' })}
                    >
                      <X className="w-4 h-4" /> সম্পন্ন হয়নি
                    </Button>
                  </div>
                  {answer && (
                    <div className="space-y-2">
                      <Label className="text-xs">
                        {answer.status === 'completed' ? 'মন্তব্য (কী সুবিধা/ফলাফল হয়েছে)' : 'মন্তব্য (কী প্রতিবন্ধকতা ছিল)'}
                      </Label>
                      <Textarea
                        rows={3}
                        value={answer.note}
                        onChange={(e) => setAnswer({ ...answer, note: e.target.value })}
                        placeholder="বিস্তারিত লিখুন…"
                      />
                      <Button
                        size="sm"
                        onClick={() => submitAnswer.mutate({ taskId: detailTask.id, status: answer.status, note: answer.note })}
                        disabled={submitAnswer.isPending}
                      >
                        সংরক্ষণ করুন
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && (
                <DialogFooter className="flex-row gap-2 sm:justify-start">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setDetailId(null); openEdit(detailTask); }}>
                    <Pencil className="w-4 h-4" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => toggleStatus.mutate(detailTask)}>
                    {detailTask.status === 'closed' ? 'Reopen' : 'Mark completed'}
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1" onClick={() => deleteTask.mutate(detailTask.id)}>
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog (admin) */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Task Edit' : 'নতুন Task'}</DialogTitle>
            <DialogDescription>তারিখ ধরে ধরে আগামী এক বছরের task তৈরি করতে পারবেন।</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="যেমন: মাসিক মিটিং" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ধরন</Label>
                <Select value={form.task_type} onValueChange={(v: any) => setForm({ ...form, task_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task">Task</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>তারিখ</Label>
                <DateField value={form.task_date} onChange={(iso) => setForm({ ...form, task_date: iso })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="কাজের সংক্ষিপ্ত বিবরণ" />
            </div>
            <div className="space-y-1">
              <Label>{form.task_type === 'meeting' ? 'Meeting details / link' : 'বিস্তারিত (optional)'}</Label>
              <Textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder={form.task_type === 'meeting' ? 'Google Meet link, সময়, আলোচ্যসূচি…' : 'বিস্তারিত নির্দেশনা'} />
            </div>
            <div className="space-y-1">
              <Label>কে দেখতে পাবে</Label>
              <Select value={form.visibility} onValueChange={(v: any) => setForm({ ...form, visibility: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assigned">শুধু assign করা member রা</SelectItem>
                  <SelectItem value="all">সকল member</SelectItem>
                  <SelectItem value="admin">শুধু Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Assign member ({form.assignees.length})</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm({
                    ...form,
                    assignees: form.assignees.length === members.length ? [] : members.map((m: any) => m.id),
                  })}
                >
                  {form.assignees.length === members.length ? 'সব বাদ' : 'সবাইকে দিন'}
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border divide-y">
                {members.map((m: any) => {
                  const checked = form.assignees.includes(m.id);
                  return (
                    <label key={m.id} className="flex items-center gap-2 p-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => setForm({
                          ...form,
                          assignees: checked ? form.assignees.filter(id => id !== m.id) : [...form.assignees, m.id],
                        })}
                      />
                      <span className="text-sm break-words">{m.full_name || 'Unnamed'}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>বাতিল</Button>
            <Button onClick={() => saveTask.mutate()} disabled={saveTask.isPending} className={cn('gap-2')}>
              {saveTask.isPending && <Loader2 className="w-4 h-4 animate-spin" />} সংরক্ষণ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollText, Plus, Trash2, ChevronDown, Download, FolderPlus, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { BRAND } from '@/lib/brand';

interface RuleSection {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

interface Rule {
  id: string;
  section_id: string;
  title: string;
  description: string | null;
  audiences: string[];
  sort_order: number;
}

const AUDIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'সবাই (Admin + Member + Customer)' },
  { value: 'admin', label: 'শুধু Admin' },
  { value: 'member', label: 'শুধু Member' },
  { value: 'customer', label: 'শুধু Customer' },
];

const emptyRuleForm = {
  id: '' as string | undefined,
  section_id: '',
  title: '',
  description: '',
  audiences: ['all'] as string[],
};

export default function RulesPage() {
  const { role, isCustomer } = useAuth();
  const isAdmin = role === 'admin' && !isCustomer;
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ ...emptyRuleForm });
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionForm, setSectionForm] = useState<{ id?: string; name: string; description: string }>({ name: '', description: '' });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ['rule_sections'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rule_sections')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as RuleSection[];
    },
  });

  const { data: allRules = [], isLoading: rulesLoading } = useQuery({
    queryKey: ['rules'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('rules')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Rule[];
    },
  });

  const canView = (aud: string[] = []) => {
    if (isAdmin) return true;
    if (aud.includes('all')) return true;
    if (isCustomer) return aud.includes('customer');
    return aud.includes('member');
  };

  const visibleRules = useMemo(() => allRules.filter(r => canView(r.audiences || [])), [allRules, isAdmin, isCustomer]);

  const visibleSections = useMemo(
    () => sections.filter(s => isAdmin || visibleRules.some(r => r.section_id === s.id)),
    [sections, visibleRules, isAdmin]
  );

  const saveSection = useMutation({
    mutationFn: async (f: typeof sectionForm) => {
      const payload = { name: f.name.trim(), description: f.description.trim() || null };
      if (!payload.name) throw new Error('Section name দিন');
      if (f.id) {
        const { error } = await (supabase as any).from('rule_sections').update(payload).eq('id', f.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('rule_sections')
          .insert({ ...payload, sort_order: sections.length + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule_sections'] });
      setSectionOpen(false);
      setSectionForm({ name: '', description: '' });
      toast.success('Section সংরক্ষিত হয়েছে');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const deleteSection = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('rule_sections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rule_sections'] });
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Section মুছে ফেলা হয়েছে');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const saveRule = useMutation({
    mutationFn: async (f: typeof ruleForm) => {
      if (!f.section_id) throw new Error('Section সিলেক্ট করুন');
      if (!f.title.trim()) throw new Error('Rule লিখুন');
      if (!f.audiences.length) throw new Error('অন্তত একটি audience সিলেক্ট করুন');
      const payload = {
        section_id: f.section_id,
        title: f.title.trim(),
        description: f.description.trim() || null,
        audiences: f.audiences,
      };
      if (f.id) {
        const { error } = await (supabase as any).from('rules').update(payload).eq('id', f.id);
        if (error) throw error;
      } else {
        const count = allRules.filter(r => r.section_id === f.section_id).length;
        const { error } = await (supabase as any).from('rules').insert({ ...payload, sort_order: count + 1 });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      setRuleOpen(false);
      setRuleForm({ ...emptyRuleForm });
      toast.success('Rule সংরক্ষিত হয়েছে');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rules'] });
      toast.success('Rule মুছে ফেলা হয়েছে');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const toggleAudience = (value: string) => {
    setRuleForm(f => {
      if (value === 'all') return { ...f, audiences: ['all'] };
      const next = f.audiences.filter(a => a !== 'all');
      return {
        ...f,
        audiences: next.includes(value) ? next.filter(a => a !== value) : [...next, value],
      };
    });
  };

  const downloadPdf = (sectionId?: string) => {
    const secs = sectionId ? visibleSections.filter(s => s.id === sectionId) : visibleSections;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    const body = secs
      .map(s => {
        const rules = visibleRules.filter(r => r.section_id === s.id);
        if (!rules.length) return '';
        return `<h2>${esc(s.name)}</h2>${rules
          .map(
            (r, i) =>
              `<div class="rule"><p class="t">${i + 1}. ${esc(r.title)}</p>${
                r.description ? `<p class="d">${esc(r.description)}</p>` : ''
              }</div>`
          )
          .join('')}`;
      })
      .join('');

    if (!body) {
      toast.error('Download করার মতো কোনো rule নেই');
      return;
    }

    const html = `<!doctype html><html lang="bn"><head><meta charset="utf-8"/>
<title>${esc(BRAND.name)} — Rules</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Noto Sans Bengali', 'Nirmala UI', system-ui, sans-serif; color:#1a1a1a; }
  .head { text-align:center; border-bottom:2px solid #0f7a4d; padding-bottom:10px; margin-bottom:18px; }
  .head h1 { margin:0; font-size:20px; color:#0f7a4d; }
  .head p { margin:2px 0 0; font-size:11px; color:#555; }
  h2 { font-size:15px; color:#0f7a4d; margin:18px 0 8px; border-left:4px solid #0f7a4d; padding-left:8px; }
  .rule { margin-bottom:10px; page-break-inside:avoid; }
  .t { margin:0; font-size:12.5px; font-weight:600; }
  .d { margin:3px 0 0 14px; font-size:11.5px; color:#444; line-height:1.55; }
  .foot { margin-top:24px; border-top:1px solid #ddd; padding-top:8px; font-size:10px; color:#777; text-align:center; }
</style></head><body>
<div class="head"><h1>${esc(BRAND.name)}</h1><p>${esc(BRAND.slogan)}</p><p><strong>Rules &amp; Regulations</strong></p></div>
${body}
<div class="foot">Generated on ${new Date().toLocaleDateString('en-GB')} — ${esc(BRAND.name)}</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Popup block হয়েছে — browser এ popup allow করুন');
      return;
    }
    w.document.write(html);
    w.document.close();
  };

  const loading = sectionsLoading || rulesLoading;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ScrollText className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rules</h1>
            <p className="text-sm text-muted-foreground">কোম্পানির নিয়মাবলী — rule এ click করলে ব্যাখ্যা দেখা যাবে</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadPdf()}>
            <Download className="w-4 h-4 mr-2" /> PDF Download
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setSectionForm({ name: '', description: '' });
                  setSectionOpen(true);
                }}
              >
                <FolderPlus className="w-4 h-4 mr-2" /> Create Section
              </Button>
              <Button
                onClick={() => {
                  setRuleForm({ ...emptyRuleForm, section_id: sections[0]?.id || '' });
                  setRuleOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" /> Add Rule
              </Button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : visibleSections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>এখনো কোনো rule যোগ করা হয়নি।</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {visibleSections.map(section => {
            const rules = visibleRules.filter(r => r.section_id === section.id);
            return (
              <Card key={section.id}>
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-foreground">{section.name}</h2>
                      {section.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => downloadPdf(section.id)} title="এই section এর PDF">
                        <Download className="w-4 h-4" />
                      </Button>
                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => {
                              setSectionForm({ id: section.id, name: section.name, description: section.description || '' });
                              setSectionOpen(true);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => {
                              if (confirm('এই section ও এর সব rule মুছে ফেলবেন?')) deleteSection.mutate(section.id);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">এই section এ কোনো rule নেই।</p>
                  ) : (
                    <div className="space-y-2">
                      {rules.map((r, idx) => {
                        const isOpen = !!expanded[r.id];
                        return (
                          <div key={r.id} className="rounded-lg border border-border overflow-hidden">
                            <div className="flex items-start gap-2 p-3">
                              <button
                                type="button"
                                className="flex flex-1 items-start gap-2 text-left min-w-0"
                                onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                              >
                                <span className="text-sm font-semibold text-primary shrink-0">{idx + 1}.</span>
                                <span className="text-sm font-medium text-foreground flex-1 whitespace-normal break-words">
                                  {r.title}
                                </span>
                                {r.description && (
                                  <ChevronDown
                                    className={cn('w-4 h-4 text-muted-foreground shrink-0 transition-transform', isOpen && 'rotate-180')}
                                  />
                                )}
                              </button>
                              {isAdmin && (
                                <div className="flex items-center gap-1 shrink-0">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setRuleForm({
                                        id: r.id,
                                        section_id: r.section_id,
                                        title: r.title,
                                        description: r.description || '',
                                        audiences: r.audiences || ['all'],
                                      });
                                      setRuleOpen(true);
                                    }}

                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive"
                                    onClick={() => {
                                      if (confirm('এই rule মুছে ফেলবেন?')) deleteRule.mutate(r.id);
                                    }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {isOpen && r.description && (
                              <div className="px-3 pb-3 pt-0">
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap border-l-2 border-primary/40 pl-3">
                                  {r.description}
                                </p>
                              </div>
                            )}
                            {isAdmin && (
                              <div className="px-3 pb-2 flex flex-wrap gap-1">
                                {(r.audiences || []).map(a => (
                                  <span
                                    key={a}
                                    className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary"
                                  >
                                    {a}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Rule dialog */}
      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ruleForm.id ? 'Rule সম্পাদনা' : 'নতুন Rule যোগ করুন'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              saveRule.mutate(ruleForm);
            }}
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">Section</p>
              <Select value={ruleForm.section_id} onValueChange={v => setRuleForm(f => ({ ...f, section_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Section সিলেক্ট করুন" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Rule (মূল নিয়ম)"
              value={ruleForm.title}
              onChange={e => setRuleForm(f => ({ ...f, title: e.target.value }))}
            />
            <Textarea
              placeholder="ব্যাখ্যা / Description (click করলে দেখা যাবে)"
              rows={4}
              value={ruleForm.description}
              onChange={e => setRuleForm(f => ({ ...f, description: e.target.value }))}
            />
            <div className="space-y-2">
              <p className="text-sm font-medium">কারা দেখতে পারবে?</p>
              <div className="space-y-2 rounded-lg border border-border p-3">
                {AUDIENCE_OPTIONS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={ruleForm.audiences.includes(opt.value)}
                      onCheckedChange={() => toggleAudience(opt.value)}
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Admin সবসময় সব rule দেখতে পারবেন।</p>
            </div>
            <Button type="submit" className="w-full" disabled={saveRule.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Section dialog */}
      <Dialog open={sectionOpen} onOpenChange={setSectionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sectionForm.id ? 'Section সম্পাদনা' : 'নতুন Section তৈরি করুন'}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={e => {
              e.preventDefault();
              saveSection.mutate(sectionForm);
            }}
          >
            <Input
              placeholder="Section name (যেমন: Company Rules)"
              value={sectionForm.name}
              onChange={e => setSectionForm(f => ({ ...f, name: e.target.value }))}
            />
            <Textarea
              placeholder="Section description (optional)"
              rows={2}
              value={sectionForm.description}
              onChange={e => setSectionForm(f => ({ ...f, description: e.target.value }))}
            />
            <Button type="submit" className="w-full" disabled={saveSection.isPending}>
              Save
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

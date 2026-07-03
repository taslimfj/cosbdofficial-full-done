import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Play, Plus, Trash2, GraduationCap, X } from 'lucide-react';
import { toast } from 'sonner';

interface Tutorial {
  id: string;
  title: string;
  description: string | null;
  youtube_url: string;
  audiences: string[];
  created_at: string;
}

const AUDIENCE_OPTIONS: { value: 'all' | 'member' | 'customer'; label: string }[] = [
  { value: 'all', label: 'সবাই (All)' },
  { value: 'member', label: 'শুধু Member' },
  { value: 'customer', label: 'শুধু Customer' },
];

function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === 'youtu.be') return u.pathname.slice(1) || null;
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') return parts[1] || null;
    }
  } catch {
    // fallthrough
  }
  const m = url.match(/[?&]v=([a-zA-Z0-9_-]{6,})/) || url.match(/([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function TutorialsPage() {
  const { role, isCustomer } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<Tutorial | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    youtube_url: '',
    audiences: [] as string[],
  });

  const { data: tutorials = [], isLoading } = useQuery({
    queryKey: ['tutorials'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('tutorials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Tutorial[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof form) => {
      if (!getYouTubeId(entry.youtube_url)) throw new Error('Invalid YouTube link');
      const { error } = await (supabase as any).from('tutorials').insert({
        title: entry.title.trim(),
        description: entry.description.trim() || null,
        youtube_url: entry.youtube_url.trim(),
        audiences: entry.audiences,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tutorials'] });
      setForm({ title: '', description: '', youtube_url: '', audiences: [] });
      setOpen(false);
      toast.success('Tutorial added');
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('tutorials').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tutorials'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const toggleAudience = (value: string) => {
    setForm(f => ({
      ...f,
      audiences: f.audiences.includes(value)
        ? f.audiences.filter(a => a !== value)
        : [...f.audiences, value],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tutorial</h1>
            <p className="text-sm text-muted-foreground">
              অ্যাপ ব্যবহার এবং লোন সংক্রান্ত ভিডিও টিউটোরিয়াল
            </p>
          </div>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add Tutorial</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>নতুন Tutorial যোগ করুন</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={e => {
                  e.preventDefault();
                  if (!form.title || !form.youtube_url) {
                    toast.error('Title ও YouTube link দিন');
                    return;
                  }
                  if (form.audiences.length === 0) {
                    toast.error('অন্তত একটি audience সিলেক্ট করুন');
                    return;
                  }
                  addMutation.mutate(form);
                }}
              >
                <Input
                  placeholder="Title (যেমন: কিভাবে loan পরিশোধ করবেন)"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
                <Input
                  placeholder="YouTube link paste করুন"
                  value={form.youtube_url}
                  onChange={e => setForm(f => ({ ...f, youtube_url: e.target.value }))}
                  required
                />
                <Textarea
                  placeholder="Description (Optional)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
                <div className="space-y-2">
                  <p className="text-sm font-medium">কারা দেখতে পারবে?</p>
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    {AUDIENCE_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.audiences.includes(opt.value)}
                          onCheckedChange={() => toggleAudience(opt.value)}
                        />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    একাধিক select করা যাবে।
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : tutorials.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <GraduationCap className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>এখনো কোনো tutorial যোগ করা হয়নি।</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tutorials.map(t => {
            const vid = getYouTubeId(t.youtube_url);
            const thumb = vid ? `https://img.youtube.com/vi/${vid}/hqdefault.jpg` : null;
            return (
              <Card key={t.id} className="group overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPlaying(t)}
                  className="relative block w-full aspect-video bg-secondary overflow-hidden"
                >
                  {thumb ? (
                    <img src={thumb} alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">No preview</div>
                  )}
                  <div className="absolute inset-0 bg-foreground/20 group-hover:bg-foreground/30 transition-colors flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                      <Play className="w-6 h-6 text-primary ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </button>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-start justify-between gap-2">
                    <span className="line-clamp-2">{t.title}</span>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 -mt-1 -mr-1 text-destructive shrink-0"
                        onClick={() => {
                          if (confirm('Delete this tutorial?')) deleteMutation.mutate(t.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {t.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  )}
                  {isAdmin && (
                    <div className="flex flex-wrap gap-1">
                      {t.audiences.map(a => (
                        <span key={a} className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!playing} onOpenChange={o => !o && setPlaying(null)}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="pr-8">{playing?.title}</DialogTitle>
          </DialogHeader>
          {playing && (
            <div className="p-4 pt-2 space-y-3">
              <div className="aspect-video w-full bg-black rounded-lg overflow-hidden">
                {(() => {
                  const vid = getYouTubeId(playing.youtube_url);
                  return vid ? (
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${vid}?autoplay=1`}
                      title={playing.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-sm">
                      Invalid YouTube link
                    </div>
                  );
                })()}
              </div>
              {playing.description && (
                <p className="text-sm text-muted-foreground">{playing.description}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

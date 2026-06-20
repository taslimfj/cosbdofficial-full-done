import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Phone, MessageCircle, Plus, Trash2, Search, PhoneCall, PhoneOff, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';

interface PhoneEntry {
  id: string;
  name: string;
  phone_number: string;
  description: string | null;
  created_at: string;
}

export default function PhoneBookPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = role === 'admin';
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone_number: '', description: '' });
  const [inAppCall, setInAppCall] = useState<PhoneEntry | null>(null);
  const [callMuted, setCallMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['phone_book'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('phone_book')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data || []) as PhoneEntry[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof form) => {
      const { error } = await (supabase as any).from('phone_book').insert({
        name: entry.name.trim(),
        phone_number: entry.phone_number.trim(),
        description: entry.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone_book'] });
      setForm({ name: '', phone_number: '', description: '' });
      setOpen(false);
      toast.success('Phone number added');
    },
    onError: () => toast.error('Failed to save'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('phone_book').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone_book'] });
      toast.success('Deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const filtered = entries.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.phone_number.includes(search) ||
    (e.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleCall = (number: string) => {
    window.open(`tel:${number}`, '_self');
  };

  const handleWhatsApp = (number: string) => {
    const cleaned = number.replace(/[^0-9+]/g, '');
    window.open(`https://wa.me/${cleaned.startsWith('+') ? cleaned.slice(1) : cleaned}`, '_blank');
  };

  const handleInAppCall = (entry: PhoneEntry) => {
    setCallSeconds(0);
    setCallMuted(false);
    setInAppCall(entry);
  };

  useEffect(() => {
    if (!inAppCall) return;
    const t = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [inAppCall]);

  const fmtDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Phone Book</h1>
          <p className="text-sm text-muted-foreground">Emergency Contact Numbers</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Phone Number</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={e => {
                  e.preventDefault();
                  if (!form.name || !form.phone_number) return;
                  addMutation.mutate(form);
                }}
              >
                <Input
                  placeholder="Name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="Phone Number (e.g., +8801XXXXXXXXX)"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  required
                />
                <Textarea
                  placeholder="Description (Optional)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
                <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                  Save
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or number..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No numbers found</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(entry => (
            <Card key={entry.id} className="relative group">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="truncate">{entry.name}</span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete?')) deleteMutation.mutate(entry.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium text-foreground">{entry.phone_number}</p>
                {entry.description && (
                  <p className="text-xs text-muted-foreground">{entry.description}</p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-primary border-primary/30 hover:bg-primary/10"
                    onClick={() => handleInAppCall(entry)}
                    title="In-App Call"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCall(entry.phone_number)}
                    title="Phone Call"
                  >
                    <Phone className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-600 border-green-200 hover:bg-green-50"
                    onClick={() => handleWhatsApp(entry.phone_number)}
                    title="WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!inAppCall} onOpenChange={(o) => !o && setInAppCall(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>In-App Call</DialogTitle>
          </DialogHeader>
          {inAppCall && (
            <div className="flex flex-col items-center text-center py-4 space-y-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <PhoneCall className="w-10 h-10 text-primary animate-pulse" />
              </div>
              <div>
                <p className="text-lg font-semibold">{inAppCall.name}</p>
                <p className="text-sm text-muted-foreground">{inAppCall.phone_number}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Connecting via app · {fmtDuration(callSeconds)}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={() => setCallMuted(m => !m)}
                  title={callMuted ? 'Unmute' : 'Mute'}
                >
                  {callMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="rounded-full h-12 w-12"
                  onClick={() => setInAppCall(null)}
                  title="End"
                >
                  <PhoneOff className="w-5 h-5" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

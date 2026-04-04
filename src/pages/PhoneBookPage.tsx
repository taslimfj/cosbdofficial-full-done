import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Phone, MessageCircle, Plus, Trash2, Search } from 'lucide-react';
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

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['phone_book'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('phone_book')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as PhoneEntry[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (entry: typeof form) => {
      const { error } = await supabase.from('phone_book').insert({
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
      toast.success('ফোন নাম্বার যোগ হয়েছে');
    },
    onError: () => toast.error('সেভ করতে সমস্যা হয়েছে'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('phone_book').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['phone_book'] });
      toast.success('ডিলিট হয়েছে');
    },
    onError: () => toast.error('ডিলিট করতে সমস্যা হয়েছে'),
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ফোন বুক</h1>
          <p className="text-sm text-muted-foreground">জরুরী ফোন নাম্বার সমূহ</p>
        </div>
        {isAdmin && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> নতুন যোগ করুন</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>নতুন ফোন নাম্বার যোগ করুন</DialogTitle>
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
                  placeholder="নাম"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
                <Input
                  placeholder="ফোন নাম্বার (যেমন: +8801XXXXXXXXX)"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  required
                />
                <Textarea
                  placeholder="বিবরণ (ঐচ্ছিক)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
                <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                  সেভ করুন
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
          placeholder="নাম বা নাম্বার দিয়ে খুঁজুন..."
          className="pl-10"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">লোড হচ্ছে...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">কোনো নাম্বার পাওয়া যায়নি</p>
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
                        if (confirm('ডিলিট করতে চান?')) deleteMutation.mutate(entry.id);
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
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleCall(entry.phone_number)}
                  >
                    <Phone className="w-3.5 h-3.5 mr-1.5" /> কল
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-green-600 border-green-200 hover:bg-green-50"
                    onClick={() => handleWhatsApp(entry.phone_number)}
                  >
                    <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> WhatsApp
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

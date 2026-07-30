import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, CheckCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { enablePushForCurrentUser, pushSupported, silentSyncPush } from '@/lib/push';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

interface Notif {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  url: string | null;
  created_at: string;
  tag?: string | null;
}

// কাস্টমার শুধুমাত্র নিজের কিস্তি সংক্রান্ত notification দেখবে
const CUSTOMER_TAG_PREFIXES = ['cust-month-start-', 'cust-overdue-', 'cpr-decision-'];
function isCustomerNotif(n: Notif) {
  if (!n.tag) return n.title.includes('কিস্তি'); // ৫ দিন আগের reminder-এ tag থাকে না
  return CUSTOMER_TAG_PREFIXES.some(p => n.tag!.startsWith(p));
}


export function NotificationBell() {
  const { user, isCustomer } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    pushSupported() ? Notification.permission : 'unsupported'
  );

  const unread = items.filter(i => !i.is_read).length;

  const fetchItems = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, is_read, url, created_at, tag')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    const all = (data || []) as Notif[];
    setItems((isCustomer ? all.filter(isCustomerNotif) : all).slice(0, 30));
  };


  useEffect(() => {
    if (!user) return;
    fetchItems();
    // Auto-enable push: request permission automatically (once) so the user
    // doesn't need to click "Enable". If already granted, this just syncs the
    // subscription. If previously denied, browser silently keeps it denied.
    (async () => {
      if (!pushSupported()) return;
      const current = Notification.permission;
      if (current === 'granted') {
        await silentSyncPush(user.id);
      } else if (current === 'default') {
        try {
          const res = await enablePushForCurrentUser(user.id);
          setPerm(res === 'unsupported' ? 'unsupported' : (Notification.permission as NotificationPermission));
        } catch (_) { /* ignore */ }
      }
    })();
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (p) => setItems(prev => [p.new as any, ...prev].slice(0, 30)))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const enable = async () => {
    if (!user) return;
    const res = await enablePushForCurrentUser(user.id);
    setPerm(res === 'unsupported' ? 'unsupported' : (Notification.permission as NotificationPermission));
    if (res === 'granted') toast.success('Push notification চালু হয়েছে');
    else if (res === 'denied') toast.error('Notification permission blocked. Browser settings থেকে allow করুন।');
  };

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', user.id).eq('is_read', false);
    fetchItems();
  };

  const openItem = async (n: Notif) => {
    if (!n.is_read) await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
    setOpen(false);
    if (n.url) navigate(n.url);
    fetchItems();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 relative">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold">Notifications</h4>
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline flex items-center gap-1">
              <CheckCheck className="w-3 h-3" /> Mark all read
            </button>
          )}
        </div>


        <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">কোনো notification নেই</div>
          ) : items.map(n => (
            <button
              key={n.id}
              onClick={() => openItem(n)}
              className={`w-full text-left px-4 py-3 hover:bg-secondary/50 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
            >
              <div className="flex items-start gap-2">
                {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-primary shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

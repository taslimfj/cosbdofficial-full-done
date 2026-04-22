import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { toast } from 'sonner';
import { RotateCcw, Trash2, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function DeletedMembers() {
  const { role } = useAuth();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    fetchDeleted();
    const channel = supabase
      .channel('deleted-members')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchDeleted)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchDeleted = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_deleted', true)
      .order('updated_at', { ascending: false });
    setMembers(data || []);
    setLoading(false);
  };

  const handleRestore = async (m: any) => {
    setBusyId(m.id);
    const originalName = m.deleted_name || m.full_name?.replace(/^\[|\] \(মুছে ফেলা হয়েছে\)$/g, '') || 'Unnamed';
    const { error } = await supabase
      .from('profiles')
      .update({ is_deleted: false, full_name: originalName, deleted_name: null })
      .eq('id', m.id);
    if (error) toast.error(error.message);
    else toast.success(`${originalName} পুনরুদ্ধার হয়েছে`);
    setBusyId(null);
  };

  const handleHardDelete = async (m: any) => {
    setBusyId(m.id);
    // Delete dependent records first
    await supabase.from('deposits').delete().eq('member_id', m.id);
    await supabase.from('profit_distributions').delete().eq('member_id', m.id);
    const { error } = await supabase.from('profiles').delete().eq('id', m.id);
    if (error) toast.error(error.message);
    else toast.success('মেম্বার চিরতরে মুছে ফেলা হয়েছে');
    setBusyId(null);
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-subtle">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Deleted Members</h3>
        <span className="text-xs text-muted-foreground">{members.length}</span>
      </div>
      {loading ? (
        <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : members.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No deleted members.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {members.map(m => {
            const displayName = m.deleted_name || m.full_name || 'Unnamed';
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center text-xs font-semibold text-destructive shrink-0">
                  {displayName.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{m.phone || 'No phone'}</p>
                </div>
                {role === 'admin' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          disabled={busyId === m.id}
                          className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-primary disabled:opacity-50"
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>মেম্বার পুনরুদ্ধার করবেন?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {displayName} কে সক্রিয় মেম্বার হিসেবে ফিরিয়ে আনা হবে। বর্তমান ব্যালেন্স ০ থাকবে।
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>বাতিল</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRestore(m)}>পুনরুদ্ধার করুন</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          disabled={busyId === m.id}
                          className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50"
                          title="Delete forever"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>চিরতরে মুছে ফেলবেন?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {displayName} এবং সব লেনদেন/লাভ বণ্টনের রেকর্ড স্থায়ীভাবে মুছে যাবে। এই কাজ ফেরানো যাবে না।
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>বাতিল</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleHardDelete(m)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            চিরতরে মুছুন
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

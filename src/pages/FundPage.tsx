import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, ArrowDownLeft, ArrowUpRight, Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { generateFundSummaryPDF } from '@/lib/pdfGenerator';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export default function FundPage() {
  const { role, user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ type: 'in', amount: '', reason: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [balance, setBalance] = useState({ totalIn: 0, totalOut: 0 });
  const [showAll, setShowAll] = useState(false);
  const PREVIEW_LIMIT = 10;

  useEffect(() => { fetchTransactions(); }, []);

  const fetchTransactions = async () => {
    const { data } = await supabase.from('fund_transactions').select('*').order('created_at', { ascending: false });
    const txns = data || [];
    setTransactions(txns);
    setBalance({
      totalIn: txns.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0),
      totalOut: txns.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0),
    });
    setLoading(false);
  };

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!form.reason.trim()) { toast.error('Enter a reason'); return; }
    setSubmitting(true);
    let error;
    if (editingId) {
      ({ error } = await supabase.from('fund_transactions').update({
        type: form.type, amount, reason: form.reason.trim(),
      }).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('fund_transactions').insert({
        type: form.type, amount, reason: form.reason.trim(), created_by: user?.id,
      }));
    }
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editingId ? 'Transaction updated' : 'Transaction added');
    setShowDialog(false);
    setEditingId(null);
    setForm({ type: 'in', amount: '', reason: '' });
    fetchTransactions();
  };

  const openEdit = (tx: any) => {
    setEditingId(tx.id);
    setForm({ type: tx.type, amount: String(tx.amount), reason: tx.reason || '' });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('fund_transactions').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Transaction deleted');
    fetchTransactions();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Fund</h1>
          <p className="text-sm text-muted-foreground mt-1">Community fund transactions</p>
        </div>
        <div className="flex gap-2">
          <PdfPeriodButton onDownload={(p) => generateFundSummaryPDF(transactions, balance, p)} />
          {role === 'admin' && (
          <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) { setEditingId(null); setForm({ type: 'in', amount: '', reason: '' }); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Transaction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? 'Edit' : 'Add'} Fund Transaction</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in">Fund In</SelectItem>
                      <SelectItem value="out">Fund Out</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (৳)</Label>
                  <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for transaction" />
                </div>
                <Button className="w-full" onClick={handleSubmit} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} {editingId ? 'Save Changes' : 'Add Transaction'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total In</p>
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{formatBDT(balance.totalIn)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Total Out</p>
          <p className="text-xl font-bold text-destructive tabular-nums">{formatBDT(balance.totalOut)}</p>
        </div>
        <div className="bg-primary text-primary-foreground rounded-xl p-5 shadow-subtle">
          <p className="text-xs font-medium text-primary-foreground/70 uppercase tracking-wider mb-2">Net Balance</p>
          <p className="text-xl font-bold tabular-nums">{formatBDT(balance.totalIn - balance.totalOut)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-subtle overflow-hidden">
        {transactions.length === 0 ? (
          <div className="p-12 text-center"><p className="text-sm text-muted-foreground">No transactions recorded yet.</p></div>
        ) : (
          <div className="divide-y divide-border">
            {transactions.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  tx.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-destructive/10 text-destructive'
                }`}>
                  {tx.type === 'in' ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{tx.reason || 'Transaction'}</p>
                  <p className="text-xs text-muted-foreground">{tx.created_at ? format(new Date(tx.created_at), 'MMM d, yyyy · h:mm a') : ''}</p>
                </div>
                <p className={`text-sm font-semibold tabular-nums ${tx.type === 'in' ? 'text-emerald-600' : 'text-destructive'}`}>
                  {tx.type === 'in' ? '+' : '-'}{formatBDT(Number(tx.amount))}
                </p>
                {role === 'admin' && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(tx)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete transaction?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(tx.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

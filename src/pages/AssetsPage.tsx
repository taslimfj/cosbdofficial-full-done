import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Package, Loader2, Trash2 } from 'lucide-react';
import { PdfPeriodButton } from '@/components/PdfPeriodButton';
import { generateAssetsPDF } from '@/lib/pdfGenerator';

interface Asset {
  id: string;
  name: string;
  description: string | null;
  purchase_price: number;
  scrap_value: number | null;
  status: string;
  created_at: string;
  deleted_at: string | null;
}

export default function AssetsPage() {
  const { role, user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', purchase_price: '' });

  const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null);
  const [scrapValue, setScrapValue] = useState('');

  useEffect(() => { fetchAssets(); }, []);

  const fetchAssets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('assets' as any)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) toast.error(error.message);
    setAssets((data as any) || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    const price = parseFloat(form.purchase_price);
    if (!form.name.trim()) return toast.error('Asset name required');
    if (!price || price <= 0) return toast.error('Enter a valid purchase price');
    setSubmitting(true);

    // 1. Create fund withdrawal
    const reason = `Asset purchase: ${form.name.trim()}${form.description.trim() ? ` — ${form.description.trim()}` : ''}`;
    const { data: txn, error: txErr } = await supabase
      .from('fund_transactions')
      .insert({ type: 'out', amount: price, reason, created_by: user?.id })
      .select()
      .single();
    if (txErr) { setSubmitting(false); return toast.error(txErr.message); }

    // 2. Create asset
    const { error: aErr } = await supabase.from('assets' as any).insert({
      name: form.name.trim(),
      description: form.description.trim() || null,
      purchase_price: price,
      purchase_txn_id: txn.id,
      created_by: user?.id,
    } as any);
    setSubmitting(false);
    if (aErr) return toast.error(aErr.message);

    toast.success('Asset added & ৳' + price + ' deducted from fund');
    setShowAdd(false);
    setForm({ name: '', description: '', purchase_price: '' });
    fetchAssets();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const scrap = parseFloat(scrapValue);
    if (isNaN(scrap) || scrap < 0) return toast.error('Enter a valid scrap value (0 or more)');
    setSubmitting(true);

    let scrapTxnId: string | null = null;
    if (scrap > 0) {
      const { data: txn, error: txErr } = await supabase
        .from('fund_transactions')
        .insert({
          type: 'in',
          amount: scrap,
          reason: `Scrap value: ${deleteTarget.name} — scrap value deposit`,
          created_by: user?.id,
        })
        .select()
        .single();
      if (txErr) { setSubmitting(false); return toast.error(txErr.message); }
      scrapTxnId = txn.id;
    }

    const { error } = await supabase.from('assets' as any).update({
      status: 'deleted',
      scrap_value: scrap,
      scrap_txn_id: scrapTxnId,
      deleted_at: new Date().toISOString(),
    } as any).eq('id', deleteTarget.id);

    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(scrap > 0 ? `Asset removed; ৳${scrap} added to fund` : 'Asset removed');
    setDeleteTarget(null);
    setScrapValue('');
    fetchAssets();
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const active = assets.filter(a => a.status === 'active');
  const removed = assets.filter(a => a.status === 'deleted');

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">Purchased assets — auto-deducted from fund</p>
        </div>
        <div className="flex gap-2">
          <PdfPeriodButton onDownload={(p) => generateAssetsPDF(assets, p)} />
        {role === 'admin' && (
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Add Asset</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Asset</DialogTitle></DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Laptop" />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Details about the asset" />
                </div>
                <div className="space-y-2">
                  <Label>Purchase Price (৳)</Label>
                  <Input type="number" value={form.purchase_price} onChange={e => setForm(p => ({ ...p, purchase_price: e.target.value }))} placeholder="0" />
                  <p className="text-xs text-muted-foreground">This amount will be withdrawn from the fund.</p>
                </div>
                <Button className="w-full" onClick={handleAdd} disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save & Settle from Fund
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        </div>
      </div>

      {/* Active Assets */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Assets</h2>
        {active.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center">
            <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No assets yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map(a => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-5 shadow-subtle">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Package className="w-4 h-4" />
                    </div>
                    <h3 className="font-semibold text-foreground truncate">{a.name}</h3>
                  </div>
                  {role === 'admin' && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => { setDeleteTarget(a); setScrapValue(''); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
                {a.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{a.description}</p>}
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">Purchase Price</span>
                  <span className="text-sm font-semibold tabular-nums">{formatBDT(Number(a.purchase_price))}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{format(new Date(a.created_at), 'MMM d, yyyy')}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Removed Assets */}
      {removed.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Removed Assets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {removed.map(a => (
              <div key={a.id} className="bg-card border border-border rounded-xl p-5 shadow-subtle opacity-75">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
                    <Package className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-foreground truncate">{a.name}</h3>
                </div>
                {a.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{a.description}</p>}
                <div className="space-y-1.5 pt-3 border-t border-border text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Purchase</span><span className="tabular-nums">{formatBDT(Number(a.purchase_price))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Scrap value</span><span className="tabular-nums text-emerald-600">{formatBDT(Number(a.scrap_value || 0))}</span></div>
                  {a.deleted_at && <p className="text-muted-foreground pt-1">Removed {format(new Date(a.deleted_at), 'MMM d, yyyy')}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete dialog with scrap value */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setScrapValue(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Asset</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-muted-foreground">
              Removing <span className="font-medium text-foreground">{deleteTarget?.name}</span>. Enter the scrap value (resale amount). It will be deposited to the fund.
            </p>
            <div className="space-y-2">
              <Label>Scrap Value (৳)</Label>
              <Input type="number" value={scrapValue} onChange={e => setScrapValue(e.target.value)} placeholder="0" />
              <p className="text-xs text-muted-foreground">Enter 0 if there is no scrap value.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setDeleteTarget(null); setScrapValue(''); }}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={submitting}>
                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Confirm Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

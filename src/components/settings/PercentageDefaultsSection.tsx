import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type PctRow = {
  id?: string;
  fund_pct: string;
  media_person_pct: string;
  manager_pct: string;
  admin_pct: string;
};

export function PercentageDefaultsSection() {
  const [row, setRow] = useState<PctRow>({ fund_pct: '5', media_person_pct: '10', manager_pct: '10', admin_pct: '5' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (supabase as any)
      .from('percentage_defaults')
      .select('id, fund_pct, media_person_pct, manager_pct, admin_pct')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }: any) => {
        if (data) {
          setRow({
            id: data.id,
            fund_pct: String(data.fund_pct ?? '5'),
            media_person_pct: String(data.media_person_pct ?? '10'),
            manager_pct: String(data.manager_pct ?? '10'),
            admin_pct: String(data.admin_pct ?? '5'),
          });
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const payload = {
      fund_pct: parseFloat(row.fund_pct) || 0,
      media_person_pct: parseFloat(row.media_person_pct) || 0,
      manager_pct: parseFloat(row.manager_pct) || 0,
      admin_pct: parseFloat(row.admin_pct) || 0,
    };
    let error: any = null;
    if (row.id) {
      ({ error } = await (supabase as any).from('percentage_defaults').update(payload).eq('id', row.id));
    } else {
      const res = await (supabase as any).from('percentage_defaults').insert(payload).select('id').single();
      error = res.error;
      if (res.data?.id) setRow(prev => ({ ...prev, id: res.data.id }));
    }
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success('Percentage defaults saved');
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        এই default percentage গুলো নতুন Islamic Loan ও Project তৈরির সময় automatically apply হবে। এখানে পরিবর্তন করলে পরবর্তী নতুন Loan / Project থেকে তা কার্যকর হবে (পুরনো entry অপরিবর্তিত থাকবে)।
      </p>
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Fund %</Label>
            <Input type="number" value={row.fund_pct} onChange={e => setRow({ ...row, fund_pct: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">Loan ও Project — উভয় ক্ষেত্রে</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Admin %</Label>
            <Input type="number" value={row.admin_pct} onChange={e => setRow({ ...row, admin_pct: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">Loan ও Project — উভয় ক্ষেত্রে</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Media Person %</Label>
            <Input type="number" value={row.media_person_pct} onChange={e => setRow({ ...row, media_person_pct: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">শুধু Islamic Loan</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Manager %</Label>
            <Input type="number" value={row.manager_pct} onChange={e => setRow({ ...row, manager_pct: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">শুধু Project</p>
          </div>
        </div>
      </div>
      <Button className="w-full" onClick={save} disabled={saving}>
        {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Percentage Defaults
      </Button>
    </div>
  );
}

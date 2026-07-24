import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calculator } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatBDT, calculateProfitPercentage, calculateMonthlyInstallment } from '@/lib/finance';

export function LoanCalculator() {
  const [open, setOpen] = useState(false);
  const [purchase, setPurchase] = useState('');
  const [advance, setAdvance] = useState('');
  const [tenure, setTenure] = useState('3');
  const [pct, setPct] = useState('8');
  const [tenureOptions, setTenureOptions] = useState<{ months: number; profit_pct: number }[]>([
    { months: 3, profit_pct: 8 }, { months: 6, profit_pct: 16 }, { months: 12, profit_pct: 25 },
  ]);

  useEffect(() => {
    (supabase as any)
      .from('islamic_tenure_options')
      .select('months, profit_pct')
      .order('months')
      .then(({ data }: any) => {
        if (data && data.length) {
          setTenureOptions(data.map((d: any) => ({ months: Number(d.months), profit_pct: Number(d.profit_pct) })));
        }
      });
  }, []);

  // When tenure changes, suggest default percentage from DB (or fallback)
  const onTenureChange = (v: string) => {
    setTenure(v);
    const found = tenureOptions.find(o => o.months === parseInt(v));
    setPct(String(found ? found.profit_pct : calculateProfitPercentage(parseInt(v))));
  };


  const calc = useMemo(() => {
    const p = parseFloat(purchase) || 0;
    const adv = Math.max(0, Math.min(p, parseFloat(advance) || 0));
    const financed = Math.max(0, p - adv);
    const pctNum = Math.max(0, parseFloat(pct) || 0);
    const months = parseInt(tenure) || 1;
    const rawSell = financed + (financed * pctNum / 100);
    // ভগ্নাংশ বাদ — monthly integer, sell = monthly × months
    const monthly = calculateMonthlyInstallment(rawSell, months);
    const sellFinanced = monthly * months;
    const profit = Math.max(0, sellFinanced - financed);
    const totalSell = sellFinanced + adv;
    return { p, adv, financed, pctNum, profit, sellFinanced, totalSell, monthly };
  }, [purchase, advance, pct, tenure]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Loan calculator">
          <Calculator className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-4 h-4" /> লোন ক্যালকুলেটর
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>ক্রয়মূল্য (Purchase Price)</Label>
            <Input type="number" inputMode="decimal" value={purchase} onChange={e => setPurchase(e.target.value)} placeholder="যেমন: 50000" />
          </div>
          <div className="space-y-2">
            <Label>Advance (অগ্রিম)</Label>
            <Input type="number" inputMode="decimal" value={advance} onChange={e => setAdvance(e.target.value)} placeholder="যদি কোনো advance থাকে" />
            <p className="text-xs text-muted-foreground">Advance বাদ দিয়ে বাকি টাকার উপরে percentage apply হবে।</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>মেয়াদ (মাস)</Label>
              <Select value={tenure} onValueChange={onTenureChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 মাস</SelectItem>
                  <SelectItem value="6">6 মাস</SelectItem>
                  <SelectItem value="12">12 মাস</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Profit %</Label>
              <Input type="number" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
            <Row label="Financed (ক্রয়মূল্য − Advance)" value={formatBDT(calc.financed)} />
            <Row label={`লাভ (${calc.pctNum}%)`} value={formatBDT(calc.profit)} />
            <Row label="বিক্রয়মূল্য (Financed + লাভ)" value={formatBDT(calc.sellFinanced)} highlight />
            {calc.adv > 0 && (
              <Row label="মোট গ্রাহক প্রদেয় (Advance সহ)" value={formatBDT(calc.totalSell)} />
            )}
            <div className="border-t pt-2 mt-2">
              <Row label={`মাসিক কিস্তি (${tenure} মাস)`} value={formatBDT(calc.monthly)} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-bold text-primary' : 'font-medium'}>{value}</span>
    </div>
  );
}

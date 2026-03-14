import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Phone, MessageCircle, Loader2, Plus, Download, FileText } from 'lucide-react';
import { generateMemberPDF } from '@/lib/pdfGenerator';

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { role } = useAuth();
  const [member, setMember] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDepositDialog, setShowDepositDialog] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetchData();
  }, [id]);

  const fetchData = async () => {
    const [profileRes, depositsRes, distRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id!).single(),
      supabase.from('deposits').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
      supabase.from('profit_distributions').select('*').eq('member_id', id!).order('created_at', { ascending: false }),
    ]);
    setMember(profileRes.data);
    setDeposits(depositsRes.data || []);
    setDistributions(distRes.data || []);
    setLoading(false);
  };

  const handleAddDeposit = async () => {
    const amount = parseFloat(depositForm.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!depositForm.transactionNumber.trim()) { toast.error('Enter transaction number'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('deposits').insert({
      member_id: id!,
      amount,
      payment_method: depositForm.paymentMethod,
      transaction_number: depositForm.transactionNumber.trim(),
      status: 'approved',
    });

    if (!error) {
      // Update member's total_deposited
      await supabase.from('profiles').update({
        total_deposited: Number(member.total_deposited || 0) + amount,
      }).eq('id', id!);

      toast.success(`৳${amount} deposit recorded successfully`);
      setShowDepositDialog(false);
      setDepositForm({ amount: '', paymentMethod: 'bkash', transactionNumber: '' });
      fetchData();
    } else {
      toast.error(error.message);
    }
    setSubmitting(false);
  };

  const handleDownloadPDF = () => {
    if (!member) return;
    generateMemberPDF(member, deposits, distributions);
    toast.success('PDF downloaded');
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!member) return <div className="text-center py-12"><p className="text-muted-foreground">Member not found</p></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/members')} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-2">
            <Download className="w-4 h-4" /> PDF Report
          </Button>
          {role === 'admin' && (
            <Dialog open={showDepositDialog} onOpenChange={setShowDepositDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Deposit</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Deposit for {member.full_name}</DialogTitle></DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Amount (৳)</Label>
                    <Input type="number" value={depositForm.amount} onChange={e => setDepositForm(p => ({ ...p, amount: e.target.value }))} placeholder="0" />
                  </div>
                  <div className="space-y-2">
                    <Label>Payment Method</Label>
                    <Select value={depositForm.paymentMethod} onValueChange={v => setDepositForm(p => ({ ...p, paymentMethod: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bkash">bKash</SelectItem>
                        <SelectItem value="nagad">Nagad</SelectItem>
                        <SelectItem value="bank">Bank Transfer</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Transaction Number</Label>
                    <Input value={depositForm.transactionNumber} onChange={e => setDepositForm(p => ({ ...p, transactionNumber: e.target.value }))} placeholder="TXN-XXXXX" />
                  </div>
                  <Button className="w-full" onClick={handleAddDeposit} disabled={submitting}>
                    {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Record Deposit
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 shadow-subtle">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
            {member.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground">{member.full_name}</h1>
            <p className="text-sm text-muted-foreground">{member.phone || 'No phone'}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-foreground tabular-nums">{formatBDT(Number(member.total_deposited || 0))}</p>
            <p className="text-xs text-muted-foreground">Total Deposited</p>
          </div>
          {member.phone && (
            <div className="flex gap-2">
              <a href={`tel:${member.phone}`} className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-foreground"><Phone className="w-4 h-4" /></a>
              <a href={`https://wa.me/${member.phone?.replace(/[^0-9]/g, '')}`} target="_blank" className="p-2 rounded-full bg-secondary hover:bg-secondary/80 text-foreground"><MessageCircle className="w-4 h-4" /></a>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deposit History */}
        <div className="bg-card border border-border rounded-xl shadow-subtle">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Deposit History</h3>
            <span className="text-xs text-muted-foreground">{deposits.length} records</span>
          </div>
          {deposits.length === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No deposits yet</p></div>
          ) : (
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {deposits.map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatBDT(Number(d.amount))}</p>
                    <p className="text-xs text-muted-foreground">{d.payment_method} · {d.transaction_number}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      d.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                      d.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                      'bg-amber-50 text-amber-700'
                    }`}>{d.status}</span>
                    <p className="text-xs text-muted-foreground mt-1">{d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Profit History */}
        <div className="bg-card border border-border rounded-xl shadow-subtle">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Profit Distributions</h3>
          </div>
          {distributions.length === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No distributions yet</p></div>
          ) : (
            <div className="divide-y divide-border">
              {distributions.map(d => (
                <div key={d.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{formatBDT(Number(d.amount))}</p>
                    <p className="text-xs text-muted-foreground">{d.distribution_type} · {d.share_percentage?.toFixed(1)}%</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatBDT } from '@/lib/finance';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Phone, MessageCircle, Loader2 } from 'lucide-react';

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [member, setMember] = useState<any>(null);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [distributions, setDistributions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('deposits').select('*').eq('member_id', id).order('created_at', { ascending: false }),
      supabase.from('profit_distributions').select('*').eq('member_id', id).order('created_at', { ascending: false }),
    ]).then(([profileRes, depositsRes, distRes]) => {
      setMember(profileRes.data);
      setDeposits(depositsRes.data || []);
      setDistributions(distRes.data || []);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!member) return <div className="text-center py-12"><p className="text-muted-foreground">Member not found</p></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => navigate('/members')} className="gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to Members
      </Button>

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
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Deposit History</h3>
          </div>
          {deposits.length === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-muted-foreground">No deposits yet</p></div>
          ) : (
            <div className="divide-y divide-border">
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
                      'bg-warning/10 text-warning'
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

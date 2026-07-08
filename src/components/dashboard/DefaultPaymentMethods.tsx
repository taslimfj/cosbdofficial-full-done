import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PaymentMethodsCard, type PaymentMethod } from '@/components/PaymentMethodsCard';
import { Loader2 } from 'lucide-react';

export function DefaultPaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMethods = async () => {
    const { data } = await (supabase as any)
      .from('payment_method_defaults')
      .select('label, value, note, sort_order')
      .order('sort_order');
    setMethods((data || []).map((r: any) => ({ label: r.label, value: r.value, note: r.note })));
    setLoading(false);
  };

  useEffect(() => {
    fetchMethods();
    const channel = supabase
      .channel('payment-method-defaults')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_method_defaults' }, fetchMethods)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 flex justify-center shadow-subtle">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-subtle">
        <p className="text-sm text-muted-foreground">
          Admin এখনো কোনো default payment method যোগ করেননি। Islamic Loans পেজ থেকে যোগ করুন।
        </p>
      </div>
    );
  }

  return (
    <PaymentMethodsCard
      methods={methods}
      title="Default Payment Methods"
      subtitle="Islamic Loan installment এর জন্য"
    />
  );
}

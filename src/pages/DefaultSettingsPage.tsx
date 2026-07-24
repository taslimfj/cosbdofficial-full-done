import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentDefaultsSection } from '@/components/settings/PaymentDefaultsSection';
import { PercentageDefaultsSection } from '@/components/settings/PercentageDefaultsSection';
import { TenureDefaultsSection } from '@/components/settings/TenureDefaultsSection';


export default function DefaultSettingsPage() {
  const { role } = useAuth();
  if (role && role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Default Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Payment method ও profit percentage — উভয়ের default value এখান থেকে নিয়ন্ত্রণ করুন।
          </p>
        </div>
      </div>

      <Tabs defaultValue="payment" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="payment">Payment Default</TabsTrigger>
          <TabsTrigger value="percentage">Percentage Default</TabsTrigger>
        </TabsList>
        <TabsContent value="payment" className="mt-6">
          <PaymentDefaultsSection />
        </TabsContent>
        <TabsContent value="percentage" className="mt-6">
          <PercentageDefaultsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

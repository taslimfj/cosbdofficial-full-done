import { useEffect } from 'react';
import { getDate } from 'date-fns';
import { toast } from 'sonner';

export function MonthlyReminders() {
  useEffect(() => {
    const day = getDate(new Date());
    if (day === 1 || day === 2) {
      toast.error('New month started', {
        description: 'Please remember to pay your monthly installment.',
        duration: 10000,
        style: {
          backgroundColor: '#ef4444',
          color: '#ffffff',
          borderColor: '#dc2626',
        },
        className: 'bg-red-500 text-white border-red-600 font-medium shadow-xl',
      });
    }
    if (day === 15) {
      toast.warning('Mid-month Check', {
        description: "You haven't deposited your share this month yet.",
        duration: 8000,
      });
    }
  }, []);

  return null;
}

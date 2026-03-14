import { useEffect } from 'react';
import { getDate } from 'date-fns';
import { toast } from 'sonner';

export function MonthlyReminders() {
  useEffect(() => {
    const day = getDate(new Date());
    if (day === 1 || day === 2) {
      toast.info('New month started', {
        description: 'Please remember to pay your monthly installment.',
        duration: 8000,
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

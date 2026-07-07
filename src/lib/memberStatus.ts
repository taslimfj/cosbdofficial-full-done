// Consecutive-missed-installment tracking for members.
// Members must deposit once every calendar month. We count the number of
// consecutive prior months (before the current month) with no approved
// deposit. The current month is a grace period — never counted as missed.

export type DepositLike = { month_year?: string | null; created_at?: string | null; status?: string | null };

export interface MissedStatus {
  missed: number; // 0, 1, 2, 3+
  level: 'normal' | 'warn' | 'alert' | 'critical';
  message: string | null;
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeMissedInstallments(
  deposits: DepositLike[],
  memberJoinedAt?: string | null,
  now: Date = new Date(),
): MissedStatus {
  const paidMonths = new Set<string>();
  for (const d of deposits) {
    if (d.status && d.status !== 'approved') continue;
    const base = d.month_year || d.created_at;
    if (!base) continue;
    const dt = new Date(base);
    if (isNaN(dt.getTime())) continue;
    paidMonths.add(ymKey(dt));
  }

  const joined = memberJoinedAt ? new Date(memberJoinedAt) : null;
  const cursor = new Date(now.getFullYear(), now.getMonth() - 1, 1); // start at previous month
  let missed = 0;
  while (true) {
    if (joined && (cursor.getFullYear() < joined.getFullYear() ||
      (cursor.getFullYear() === joined.getFullYear() && cursor.getMonth() < joined.getMonth()))) break;
    const key = ymKey(cursor);
    if (paidMonths.has(key)) break;
    missed += 1;
    if (missed >= 6) break; // safety cap
    cursor.setMonth(cursor.getMonth() - 1);
  }

  if (missed <= 0) return { missed: 0, level: 'normal', message: null };
  if (missed === 1) return {
    missed: 1,
    level: 'warn',
    message: 'আপনি ১ মাস ইনস্টলমেন্ট দেননি। পরপর ৩ মাস না দিলে আপনার অ্যাকাউন্ট বাতিল হতে পারে।',
  };
  if (missed === 2) return {
    missed: 2,
    level: 'alert',
    message: 'আপনি পরপর ২ মাস ইনস্টলমেন্ট দেননি। আর ১ মাস না দিলে আপনার অ্যাকাউন্ট বাতিল হতে পারে।',
  };
  return {
    missed,
    level: 'critical',
    message: 'আপনি পরপর ৩ মাস বা তার বেশি ইনস্টলমেন্ট দেননি। আপনার অ্যাকাউন্ট বাতিলের ঝুঁকিতে রয়েছে।',
  };
}

export function statusRowClass(level: MissedStatus['level']): string {
  switch (level) {
    case 'warn': return 'bg-yellow-50 hover:bg-yellow-100/70 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20';
    case 'alert': return 'bg-pink-50 hover:bg-pink-100/70 dark:bg-pink-500/10 dark:hover:bg-pink-500/20';
    case 'critical': return 'bg-red-50 hover:bg-red-100/70 dark:bg-red-500/15 dark:hover:bg-red-500/25';
    default: return 'hover:bg-secondary/30';
  }
}

export function statusBannerClass(level: MissedStatus['level']): string {
  switch (level) {
    case 'warn': return 'bg-yellow-50 border-yellow-300 text-yellow-900 dark:bg-yellow-500/10 dark:text-yellow-200';
    case 'alert': return 'bg-pink-50 border-pink-300 text-pink-900 dark:bg-pink-500/10 dark:text-pink-200';
    case 'critical': return 'bg-red-50 border-red-300 text-red-900 dark:bg-red-500/10 dark:text-red-200';
    default: return '';
  }
}

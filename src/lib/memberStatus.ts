// Consecutive-missed-installment tracking for members.
// Members must deposit once every calendar month. We count the number of
// consecutive prior months (before the current month) with no approved
// deposit. The current month is a grace period — never counted as missed.

export type DepositLike = { month_year?: string | null; created_at?: string | null; status?: string | null };

export interface MissedStatus {
  missed: number; // 0, 1, 2, 3+
  level: 'normal' | 'warn' | 'alert' | 'critical';
  message: string | null;
  fineAmount: number;
  requiresAdminRecovery: boolean;
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function computeMissedInstallments(
  deposits: (DepositLike & { amount?: number | null })[],
  memberJoinedAt?: string | null,
  now: Date = new Date(),
): MissedStatus {
  const paidMonths = new Set<string>();
  for (const d of deposits) {
    if (d.status && d.status !== 'approved') continue;
    // Strictly positive deposits only (ignore withdrawals or fee deductions)
    if (d.amount !== undefined && d.amount !== null && Number(d.amount) <= 0) continue;
    const base = d.month_year || d.created_at;
    if (!base) continue;
    const dt = new Date(base);
    if (isNaN(dt.getTime())) continue;
    paidMonths.add(ymKey(dt));
  }

  // If the member has paid THIS month, they are fully current — no warning.
  const currentKey = ymKey(now);
  if (paidMonths.has(currentKey)) {
    return { missed: 0, level: 'normal', message: null, fineAmount: 0, requiresAdminRecovery: false };
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
    if (missed >= 12) break; // safety cap
    cursor.setMonth(cursor.getMonth() - 1);
  }

  if (missed <= 0) return { missed: 0, level: 'normal', message: null, fineAmount: 0, requiresAdminRecovery: false };
  if (missed === 1) return {
    missed: 1,
    level: 'warn',
    message: 'আপনি ১ মাস ইনস্টলমেন্ট দেননি। পরপর ৩ মাস না দিলে আপনার অ্যাকাউন্ট লক হতে পারে।',
    fineAmount: 0,
    requiresAdminRecovery: false,
  };
  if (missed === 2) return {
    missed: 2,
    level: 'alert',
    message: 'আপনি পরপর ২ মাস ইনস্টলমেন্ট দেননি। আর ১ মাস না দিলে আপনার অ্যাকাউন্ট লক হয়ে যাবে।',
    fineAmount: 0,
    requiresAdminRecovery: false,
  };

  // missed >= 3: Locked due to 3+ missed installments
  const overdueMonthsAfterLock = missed - 3; // 0 for 3 missed, 1 for 4 missed (+100), etc.
  const rawFine = overdueMonthsAfterLock > 0 ? overdueMonthsAfterLock * 100 : 0;
  const fineAmount = Math.min(500, rawFine);
  const requiresAdminRecovery = rawFine > 500;

  let msg = 'আপনি পরপর ৩ মাস বা তার বেশি ইনস্টলমেন্ট দেননি। আপনার অ্যাকাউন্ট স্বয়ংক্রিয়ভাবে লক করা হয়েছে।';
  if (requiresAdminRecovery) {
    msg = 'আপনার অ্যাকাউন্টটি সাময়িকভাবে বন্ধ করা হয়েছে। অ্যাকাউন্ট রিকভারি করতে অ্যাডমিনের সাথে যোগাযোগ করুন।';
  } else if (fineAmount > 0) {
    msg += ` আগে আপনার জরিমানার ৳${fineAmount} প্রদান করুন, তারপর জমা রিকুয়েস্ট পাঠান।`;
  }

  return {
    missed,
    level: 'critical',
    message: msg,
    fineAmount,
    requiresAdminRecovery,
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

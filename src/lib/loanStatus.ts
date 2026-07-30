// ─────────────────────────────────────────────────────────────
// Islamic Loan status helpers
//   • overdue detection (this-month installment missed)
//   • early-payoff months calculation
//   • customer rating (0-10, based on full history + loan count)
//   • unused early-payoff discount credit lookup by phone
// ─────────────────────────────────────────────────────────────

export type LoanLike = {
  id: string;
  code?: string;
  status?: string | null;
  created_at: string;
  issue_date?: string | null;
  tenure_months: number;
  monthly_installment: number | string;
  sell_price: number | string;
  remaining_amount: number | string;
  closed_at?: string | null;
  months_paid_early?: number | null;
  discount_credit_used?: boolean | null;
  borrower_phone?: string | null;
};

const loanStartDate = (loan: LoanLike) => new Date(loan.issue_date || loan.created_at);

const normPhone = (p?: string | null) => (p || '').replace(/[^0-9]/g, '').slice(-11);

/**
 * A loan is "overdue this month" if today's date has passed the installment
 * due-day (day-of-month from the user-selected issue_date) AND the number of expected
 * installments by now exceeds the number actually paid.
 */
export function isLoanOverdue(loan: LoanLike, now: Date = new Date()): boolean {
  if (!loan || loan.status !== 'active') return false;
  const remaining = Number(loan.remaining_amount);
  if (remaining <= 0) return false;

  const monthly = Number(loan.monthly_installment) || 0;
  if (monthly <= 0) return false;

  const start = loanStartDate(loan);
  const tenure = Number(loan.tenure_months) || 0;
  const dueDay = start.getDate();

  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (monthsElapsed < 1) return false; // grace: first month never overdue

  // Expected installments = full months elapsed, +1 if this month's due-day already passed
  let expected = monthsElapsed + (now.getDate() >= dueDay ? 1 : 0);
  expected = Math.min(expected, tenure);

  const paidAmount = Number(loan.sell_price) - remaining;
  const paidInstallments = Math.floor(paidAmount / monthly);

  return expected > paidInstallments;
}

/**
 * How many months earlier than tenure the loan was fully paid off.
 * Returns 0 for still-active loans or when closed_at is missing.
 */
export function computeMonthsEarly(loan: LoanLike): number {
  if (loan.status !== 'closed' || !loan.closed_at) return 0;
  const start = loanStartDate(loan);
  const end = new Date(loan.closed_at);
  const monthsUsed =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 0 : -1);
  const early = Number(loan.tenure_months) - Math.max(0, monthsUsed);
  return Math.max(0, early);
}

/**
 * Find latest closed loan for this phone that still has an UNUSED
 * early-payoff discount credit. That credit is spent on the next loan
 * only — never re-usable.
 */
export function findDiscountCreditForPhone(
  loans: LoanLike[],
  phone: string
): { months: number; fromLoanId: string; fromLoanCode?: string } | null {
  const target = normPhone(phone);
  if (!target || target.length < 6) return null;

  const candidates = loans
    .filter(l => l.status === 'closed')
    .filter(l => normPhone(l.borrower_phone) === target)
    .filter(l => !l.discount_credit_used)
    .filter(l => (l.months_paid_early || 0) > 0)
    .sort((a, b) => new Date(b.closed_at || b.created_at).getTime() - new Date(a.closed_at || a.created_at).getTime());

  if (!candidates.length) return null;
  const c = candidates[0];
  return { months: c.months_paid_early || 0, fromLoanId: c.id, fromLoanCode: c.code };
}

/**
 * Loyalty rating out of 10 based on full history + loan count.
 *   • Base 10
 *   • +0.4 per month early (each closed loan, capped +2 per loan)
 *   • +0.3 per additional successfully-closed loan (loyalty, cap +1.5)
 *   • −1 per late-close month (closed after tenure)
 *   • −2 per currently-overdue active loan
 * Result clamped 0..10, one decimal.
 */
export function computeCustomerRating(loans: LoanLike[], phone: string): {
  score: number;
  totalLoans: number;
  closedLoans: number;
  overdueActive: number;
  totalMonthsEarly: number;
} {
  const target = normPhone(phone);
  const own = loans.filter(l => normPhone(l.borrower_phone) === target);
  const closed = own.filter(l => l.status === 'closed');
  const active = own.filter(l => l.status === 'active');
  const overdueActive = active.filter(l => isLoanOverdue(l)).length;

  if (own.length === 0) {
    return { score: 10, totalLoans: 0, closedLoans: 0, overdueActive: 0, totalMonthsEarly: 0 };
  }

  let bonuses = 0;
  let penalties = overdueActive * 2;
  let totalMonthsEarly = 0;

  closed.forEach(l => {
    const early = l.months_paid_early || 0;
    if (early > 0) {
      totalMonthsEarly += early;
      bonuses += Math.min(early * 0.4, 2);
    } else if (l.closed_at) {
      // Late close?
      const start = loanStartDate(l);
      const end = new Date(l.closed_at);
      const monthsUsed =
        (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      const late = monthsUsed - Number(l.tenure_months);
      if (late > 0) penalties += late;
    }
  });

  const loyalty = Math.min(Math.max(0, closed.length - 1) * 0.3, 1.5);
  const raw = 10 + bonuses + loyalty - penalties;
  const score = Math.max(0, Math.min(10, Math.round(raw * 10) / 10));

  return {
    score,
    totalLoans: own.length,
    closedLoans: closed.length,
    overdueActive,
    totalMonthsEarly,
  };
}

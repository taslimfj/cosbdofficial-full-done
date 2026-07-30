// ─────────────────────────────────────────────────────────────
// Islamic Loan status helpers
//   • overdue detection (this-month installment missed)
//   • early-payoff months calculation
//   • customer rating (0-10, based on full history + loan count)
//   • unused early-payoff discount credit lookup by phone
// ─────────────────────────────────────────────────────────────

export type PaymentLike = {
  amount?: number | string;
  payment_type?: string | null;
  status?: string | null;
  payment_date?: string | null;
  created_at?: string | null;
};

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
  advance_amount?: number | string | null;
  closed_at?: string | null;
  months_paid_early?: number | null;
  discount_credit_used?: boolean | null;
  borrower_phone?: string | null;
  payments?: PaymentLike[];
};

const loanStartDate = (loan: LoanLike) => new Date(loan.issue_date || loan.created_at);

const normPhone = (p?: string | null) => (p || '').replace(/[^0-9]/g, '').slice(-11);

/** Distinct payment-months (based on user-selected payment_date) = installments paid. */
export function countPaidInstallments(loan: LoanLike): number | null {
  if (!loan.payments) return null;
  const months = new Set<string>();
  for (const p of loan.payments) {
    if ((p.payment_type || 'installment') === 'advance') continue;
    if ((p.status ?? 'approved') !== 'approved') continue;
    const d = p.payment_date || p.created_at;
    if (!d) continue;
    const dt = new Date(d);
    if (isNaN(dt.getTime())) continue;
    months.add(`${dt.getFullYear()}-${dt.getMonth()}`);
  }
  return months.size;
}

/**
 * A loan is "overdue" only if a due date has actually passed without a payment
 * recorded for that cycle. Installments are counted by distinct payment months
 * (user-selected payment_date), never by amount.
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

  // Count only due dates that have actually passed. The first installment is due
  // one month after issue_date (e.g. 9 May → first due date 9 Jun).
  let expected = monthsElapsed - (now.getDate() < dueDay ? 1 : 0);
  expected = Math.max(0, expected);
  expected = Math.min(expected, tenure);

  const byMonths = countPaidInstallments(loan);
  const paidInstallments = byMonths !== null
    ? byMonths
    // Fallback (no payment rows loaded): derive from amount, advance excluded.
    : Math.floor(
        Math.max(0, Number(loan.sell_price) - remaining - Number(loan.advance_amount || 0)) / monthly
      );

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

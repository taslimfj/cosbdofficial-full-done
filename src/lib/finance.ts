// Default balance/total display — hides fractional পয়সা, keeps precision in DB.
// Uses floor so partial paisa never "rounds up" to a taka it hasn't reached yet.
export const formatBDT = (amount: number): string => {
  const n = Math.floor(Number(amount) || 0);
  return '৳' + new Intl.NumberFormat('en-IN').format(n);
};

// Precise display — used for individual transaction rows and receipts where every paisa matters.
export const formatBDTDecimal = (amount: number): string => {
  return '৳' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
};

export const generateCode = (prefix: string): string => {
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${num}`;
};

// New code: {PREFIX}{2-letter name}{2-digit yearly serial}{2-digit year}
// e.g. ILRE0126  (Islamic Loan, borrower "Rete", 1st of 2026)
//      PRJSH0326 (Project,      name "Shop",    3rd of 2026)
export const buildEntityCode = (
  prefix: 'IL' | 'PRJ',
  name: string,
  yearlySerial: number,
  date: Date = new Date()
): string => {
  const letters = (name || '')
    .replace(/[^A-Za-z\u0980-\u09FF]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  const serial = String(Math.max(1, yearlySerial)).padStart(2, '0');
  const yr = String(date.getFullYear()).slice(-2);
  return `${prefix}${letters}${serial}${yr}`;
};

export const calculateProfitPercentage = (tenureMonths: number): number => {
  switch (tenureMonths) {
    case 3: return 8;
    case 6: return 16;
    case 12: return 25;
    default: return 0;
  }
};

export const calculateSellPrice = (purchasePrice: number, profitPct: number): number => {
  return purchasePrice * (1 + profitPct / 100);
};

// Monthly installment — ভগ্নাংশ বাদ দিয়ে integer নেওয়া হয় (যেমন 209.88 → 209)।
// তাই কার্যকর বিক্রয়মূল্য = monthly × tenure (একটু কমে যায়)।
export const calculateMonthlyInstallment = (sellPrice: number, tenureMonths: number): number => {
  if (!tenureMonths) return 0;
  return Math.floor(sellPrice / tenureMonths);
};

// Effective sell price = monthly installment × tenure (drops fractional bit)
export const calculateEffectiveSellPrice = (sellPrice: number, tenureMonths: number): number => {
  return calculateMonthlyInstallment(sellPrice, tenureMonths) * (tenureMonths || 0);
};

// Round to 2 decimals — used for profit/loss distribution amounts
export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export const calculateSharePercentage = (memberDeposit: number, totalInvestment: number): number => {
  if (totalInvestment === 0) return 0;
  return (memberDeposit / totalInvestment) * 100;
};

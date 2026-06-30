export const formatBDT = (amount: number): string => {
  return '৳' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatBDTDecimal = (amount: number): string => {
  return '৳' + new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

export const calculateMonthlyInstallment = (sellPrice: number, tenureMonths: number): number => {
  return sellPrice / tenureMonths;
};

export const calculateSharePercentage = (memberDeposit: number, totalInvestment: number): number => {
  if (totalInvestment === 0) return 0;
  return (memberDeposit / totalInvestment) * 100;
};

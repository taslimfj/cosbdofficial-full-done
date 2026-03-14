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

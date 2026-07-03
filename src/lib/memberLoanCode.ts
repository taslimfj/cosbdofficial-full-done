// Generate a human-readable loan code from member name + per-member serial + year.
// Example: MLN-TA-01-26  (Member Loan · TA=Taslim initials · 1st loan · 2026)
export function buildMemberLoanCode(fullName: string | undefined | null, serial: number, createdAt: string | Date): string {
  const letters = (fullName || '')
    .replace(/[^A-Za-z\u0980-\u09FF]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  const s = String(Math.max(1, serial)).padStart(2, '0');
  const d = new Date(createdAt);
  const yr = String(d.getFullYear()).slice(-2);
  return `MLN-${letters}-${s}-${yr}`;
}

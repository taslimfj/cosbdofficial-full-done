import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, subMonths } from 'date-fns';
import { BRAND, loadLogoDataUrl } from './brand';

const formatAmount = (amount: number) => `TK ${new Intl.NumberFormat('en-IN').format(amount)}`;
/** Prefer user-selected date over system created_at */
const effDate = (r: any): string | null => r?.issue_date || r?.payment_date || r?.month_year || r?.created_at || null;

export type ReportPeriod = '3m' | '6m' | '1y';

export const periodLabel = (p: ReportPeriod) =>
  p === '3m' ? 'Last 3 Months' : p === '6m' ? 'Last 6 Months' : 'Last 1 Year';

export const periodCutoff = (p: ReportPeriod) => {
  const m = p === '3m' ? 3 : p === '6m' ? 6 : 12;
  return subMonths(new Date(), m);
};

export const filterByPeriod = <T extends { created_at?: string | null }>(rows: T[], p: ReportPeriod) => {
  const cutoff = periodCutoff(p);
  return rows.filter(r => { const e = effDate(r); return e && new Date(e) >= cutoff; });
};

// ---------- Shared header / footer ----------
async function header(doc: jsPDF, title: string, period?: ReportPeriod) {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Logo
  try {
    const logo = await loadLogoDataUrl();
    doc.addImage(logo, 'PNG', 14, 10, 14, 14);
  } catch { /* ignore logo failure */ }
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(BRAND.name, 32, 17);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(110);
  doc.text(BRAND.slogan, 32, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 14, 17, { align: 'right' });
  doc.setDrawColor(200);
  doc.line(14, 27, pageWidth - 14, 27);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(title, 14, 35);
  if (period) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(`Period: ${periodLabel(period)}`, 14, 42);
    doc.setTextColor(0);
  }
}

function footer(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${BRAND.name} — ${BRAND.slogan}  ·  Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }
}

const tableStyle = {
  styles: { fontSize: 9 },
  headStyles: { fillColor: [41, 98, 255] as [number, number, number] },
  alternateRowStyles: { fillColor: [245, 247, 250] as [number, number, number] },
};


// ---------- Member individual ----------
export async function generateMemberPDF(member: any, deposits: any[], distributions: any[]) {
  const doc = new jsPDF();
  await header(doc, `Member Report: ${member.full_name || 'Unnamed'}`);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Phone: ${member.phone || 'N/A'}`, 14, 43);
  doc.text(`Total Deposited: ${formatAmount(Number(member.total_deposited || 0))}`, 14, 50);
  doc.text(`Member Since: ${member.created_at ? format(new Date(member.created_at), 'MMM d, yyyy') : 'N/A'}`, 14, 57);

  let startY = 65;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Deposit History', 14, startY); startY += 5;
  if (deposits.length) {
    autoTable(doc, {
      startY,
      head: [['Date', 'Amount', 'Method', 'TXN No.', 'Status']],
      body: deposits.map(d => [
        (effDate(d) ? format(new Date(effDate(d)!), 'MMM d, yyyy') : '-'),
        formatAmount(Number(d.amount)),
        d.payment_method || '-',
        d.transaction_number || '-',
        d.status || 'pending',
      ]),
      ...tableStyle,
    });
    startY = (doc as any).lastAutoTable.finalY + 10;
  } else { startY += 10; }

  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Profit Distributions', 14, startY); startY += 5;
  if (distributions.length) {
    autoTable(doc, {
      startY,
      head: [['Date', 'Amount', 'Type', 'Share %']],
      body: distributions.map(d => [
        (effDate(d) ? format(new Date(effDate(d)!), 'MMM d, yyyy') : '-'),
        formatAmount(Number(d.amount)),
        d.distribution_type || '-',
        d.share_percentage ? `${d.share_percentage.toFixed(1)}%` : '-',
      ]),
      ...tableStyle,
    });
  }
  footer(doc);
  doc.save(`${member.full_name || 'member'}-report.pdf`);
}

// ---------- Fund ----------
export async function generateFundSummaryPDF(allTransactions: any[], stats: { totalIn: number; totalOut: number }, period?: ReportPeriod) {
  const doc = new jsPDF();
  const transactions = period ? filterByPeriod(allTransactions, period) : allTransactions;
  const totalIn = transactions.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const totalOut = transactions.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);

  await header(doc, 'Fund Summary Report', period);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const y = period ? 50 : 43;
  doc.text(`Total Fund In: ${formatAmount(totalIn)}`, 14, y);
  doc.text(`Total Fund Out: ${formatAmount(totalOut)}`, 14, y + 7);
  doc.text(`Net Balance: ${formatAmount(totalIn - totalOut)}`, 14, y + 14);

  autoTable(doc, {
    startY: y + 22,
    head: [['Date', 'Type', 'Amount', 'Reason']],
    body: transactions.map(t => [
      (effDate(t) ? format(new Date(effDate(t)!), 'MMM d, yyyy') : '-'),
      t.type === 'in' ? 'Fund In' : 'Fund Out',
      formatAmount(Number(t.amount)),
      t.reason || '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`fund-summary-${period || 'all'}.pdf`);
}

// ---------- Member Loans (personal) ----------
export async function generateMemberLoansPDF(allLoans: any[], period: ReportPeriod) {
  const doc = new jsPDF();
  const loans = filterByPeriod(allLoans, period);
  await header(doc, 'Personal Loans Report', period);
  autoTable(doc, {
    startY: 50,
    head: [['Date', 'Member', 'Requested', 'Approved', 'Repaid', 'Status', 'Due']],
    body: loans.map(l => [
      (effDate(l) ? format(new Date(effDate(l)!), 'MMM d, yyyy') : '-'),
      l.member?.full_name || '-',
      formatAmount(Number(l.requested_amount || 0)),
      formatAmount(Number(l.approved_amount || 0)),
      formatAmount(Number(l.repaid_amount || 0)),
      l.status || '-',
      l.due_date ? format(new Date(l.due_date), 'MMM d, yyyy') : '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`member-loans-${period}.pdf`);
}

// ---------- Islamic Loans (independent project) ----------
export async function generateIslamicLoansPDF(allLoans: any[], allPayments: any[], period: ReportPeriod) {
  const doc = new jsPDF();
  const loans = filterByPeriod(allLoans, period);
  const payments = filterByPeriod(allPayments, period);
  await header(doc, 'Islamic Loans Report', period);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Loans created in period: ${loans.length}`, 14, 50);
  doc.text(`Payments received in period: ${payments.length}`, 14, 57);

  autoTable(doc, {
    startY: 65,
    head: [['Date', 'Code', 'Media Person', 'Purchase', 'Sell', 'Remaining', 'Tenure', 'Monthly']],
    body: loans.map(l => [
      (effDate(l) ? format(new Date(effDate(l)!), 'MMM d, yyyy') : '-'),
      l.code || '-',
      l.media_person?.full_name || '-',
      formatAmount(Number(l.purchase_price || 0)),
      formatAmount(Number(l.sell_price || 0)),
      formatAmount(Number(l.remaining_amount || 0)),
      `${l.tenure_months || 0}m`,
      formatAmount(Number(l.monthly_installment || 0)),
    ]),
    ...tableStyle,
  });

  const afterLoansY = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Payments', 14, afterLoansY);
  autoTable(doc, {
    startY: afterLoansY + 4,
    head: [['Date', 'Loan ID', 'Amount', 'Method', 'TXN No.']],
    body: payments.map(p => [
      (effDate(p) ? format(new Date(effDate(p)!), 'MMM d, yyyy') : '-'),
      (p.loan_id || '').slice(0, 8),
      formatAmount(Number(p.amount || 0)),
      p.payment_method || '-',
      p.transaction_number || '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`islamic-loans-${period}.pdf`);
}

// ---------- Assets ----------
export async function generateAssetsPDF(allAssets: any[], period: ReportPeriod) {
  const doc = new jsPDF();
  const assets = filterByPeriod(allAssets, period);
  await header(doc, 'Assets Report', period);
  const active = assets.filter(a => a.status === 'active');
  const removed = assets.filter(a => a.status === 'deleted');
  const totalSpent = assets.reduce((s, a) => s + Number(a.purchase_price || 0), 0);
  const totalScrap = removed.reduce((s, a) => s + Number(a.scrap_value || 0), 0);

  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Total assets purchased: ${formatAmount(totalSpent)}`, 14, 50);
  doc.text(`Total scrap recovered: ${formatAmount(totalScrap)}`, 14, 57);
  doc.text(`Active: ${active.length} · Removed: ${removed.length}`, 14, 64);

  autoTable(doc, {
    startY: 72,
    head: [['Date', 'Name', 'Description', 'Purchase', 'Status', 'Scrap']],
    body: assets.map(a => [
      (effDate(a) ? format(new Date(effDate(a)!), 'MMM d, yyyy') : '-'),
      a.name || '-',
      a.description || '-',
      formatAmount(Number(a.purchase_price || 0)),
      a.status || '-',
      a.scrap_value != null ? formatAmount(Number(a.scrap_value)) : '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`assets-${period}.pdf`);
}

// ---------- Projects ----------
export async function generateProjectsPDF(projects: any[], allTransactions: any[], period: ReportPeriod) {
  const doc = new jsPDF();
  const txns = filterByPeriod(allTransactions, period);
  await header(doc, 'Projects Report', period);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text(`Projects: ${projects.length} · Transactions in period: ${txns.length}`, 14, 50);

  autoTable(doc, {
    startY: 58,
    head: [['Code', 'Name', 'Manager %', 'Fund %', 'Status']],
    body: projects.map(p => [
      p.code || '-',
      p.name || '-',
      `${p.manager_profit_pct || 0}%`,
      `${p.fund_profit_pct || 0}%`,
      p.status || '-',
    ]),
    ...tableStyle,
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Transactions', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Type', 'Amount', 'Reason']],
    body: txns.map(t => [
      (effDate(t) ? format(new Date(effDate(t)!), 'MMM d, yyyy') : '-'),
      t.type || '-',
      formatAmount(Number(t.amount || 0)),
      t.reason || t.comments || '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`projects-${period}.pdf`);
}

// ---------- Dashboard overall summary ----------
export interface DashboardPDFData {
  members: any[];
  fundTxns: any[];
  deposits: any[];
  islamicLoans: any[];
  memberLoans: any[];
  assets: any[];
  distributions: any[];
}

export async function generateDashboardPDF(data: DashboardPDFData, period: ReportPeriod) {
  const doc = new jsPDF();
  const fundTxns = filterByPeriod(data.fundTxns, period);
  const deposits = filterByPeriod(data.deposits, period);
  const islamicLoans = filterByPeriod(data.islamicLoans, period);
  const memberLoans = filterByPeriod(data.memberLoans, period);
  const assets = filterByPeriod(data.assets, period);
  const distributions = filterByPeriod(data.distributions, period);

  const totalFundIn = fundTxns.filter(t => t.type === 'in').reduce((s, t) => s + Number(t.amount), 0);
  const totalFundOut = fundTxns.filter(t => t.type === 'out').reduce((s, t) => s + Number(t.amount), 0);
  const depositSum = deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const islamicSell = islamicLoans.reduce((s, l) => s + Number(l.sell_price || 0), 0);
  const islamicRemaining = islamicLoans.reduce((s, l) => s + Number(l.remaining_amount || 0), 0);
  const memberLoanApproved = memberLoans.reduce((s, l) => s + Number(l.approved_amount || 0), 0);
  const memberLoanRepaid = memberLoans.reduce((s, l) => s + Number(l.repaid_amount || 0), 0);
  const assetsCost = assets.reduce((s, a) => s + Number(a.purchase_price || 0), 0);
  const distSum = distributions.reduce((s, d) => s + Number(d.amount || 0), 0);

  await header(doc, 'Overall Summary Report', period);

  autoTable(doc, {
    startY: 50,
    head: [['Section', 'Metric', 'Value']],
    body: [
      ['Members', 'Total members', String(data.members.length)],
      ['Deposits', 'Total deposit activity', formatAmount(depositSum)],
      ['Fund', 'Fund In', formatAmount(totalFundIn)],
      ['Fund', 'Fund Out', formatAmount(totalFundOut)],
      ['Fund', 'Net change', formatAmount(totalFundIn - totalFundOut)],
      ['Islamic Loans', 'Loans created', String(islamicLoans.length)],
      ['Islamic Loans', 'Total sell price', formatAmount(islamicSell)],
      ['Islamic Loans', 'Outstanding (snapshot)', formatAmount(islamicRemaining)],
      ['Personal Loans', 'Approved amount', formatAmount(memberLoanApproved)],
      ['Personal Loans', 'Repaid amount', formatAmount(memberLoanRepaid)],
      ['Assets', 'Purchased value', formatAmount(assetsCost)],
      ['Profit', 'Distributions paid', formatAmount(distSum)],
    ],
    ...tableStyle,
  });

  const y = (doc as any).lastAutoTable.finalY + 10;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Fund Transactions (period)', 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Type', 'Amount', 'Reason']],
    body: fundTxns.slice(0, 50).map(t => [
      (effDate(t) ? format(new Date(effDate(t)!), 'MMM d, yyyy') : '-'),
      t.type === 'in' ? 'In' : 'Out',
      formatAmount(Number(t.amount)),
      t.reason || '-',
    ]),
    ...tableStyle,
  });

  footer(doc);
  doc.save(`overall-summary-${period}.pdf`);
}

// ---------- Cash in Hand ----------
export async function generateCashInHandPDF(
  allRows: Array<{ created_at: string | null; source: string; direction: 'in' | 'out'; amount: number; reason: string }>,
  period?: ReportPeriod
) {
  const doc = new jsPDF();
  const rows = period ? filterByPeriod(allRows, period) : allRows;
  const inn = rows.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0);
  const out = rows.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0);

  await header(doc, 'Cash in Hand Report', period);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  const y = period ? 50 : 43;
  doc.text(`Total In: ${formatAmount(inn)}`, 14, y);
  doc.text(`Total Out: ${formatAmount(out)}`, 14, y + 7);
  doc.text(`Net (Cash in Hand): ${formatAmount(inn - out)}`, 14, y + 14);

  autoTable(doc, {
    startY: y + 22,
    head: [['Date', 'Source', 'Type', 'Amount', 'Reason']],
    body: rows.map(r => [
      (effDate(r) ? format(new Date(effDate(r)!), 'MMM d, yyyy') : '-'),
      r.source,
      r.direction === 'in' ? 'In' : 'Out',
      formatAmount(r.amount),
      r.reason || '-',
    ]),
    ...tableStyle,
  });
  footer(doc);
  doc.save(`cash-in-hand-${period || 'all'}.pdf`);
}

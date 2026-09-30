import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { BRAND, loadLogoDataUrl } from './brand';

const fmt = (n: number) => `TK ${new Intl.NumberFormat('en-IN').format(Math.round(n))}`;
const fmtDate = (d?: string | null) => (d ? format(new Date(d), 'MMM d') : '-');
/** Prefer user-selected event date over system created_at so past-dated entries appear on their real date */
const eff = (r: any): string | null =>
  r?.issue_date || r?.payment_date || r?.month_year || r?.created_at || null;

export type OverallPeriod = 'month' | 'year';

export const overallPeriodLabel = (p: OverallPeriod) =>
  p === 'month' ? 'This Month' : 'This Year';

/** Fiscal year: Aug 1 → Jul 30 of the next year */
export function fiscalYearRange(now: Date = new Date()) {
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? y : y - 1; // Aug = 7
  const start = new Date(startYear, 7, 1, 0, 0, 0, 0);
  const end = new Date(startYear + 1, 6, 30, 23, 59, 59, 999);
  return { start, end };
}

const tableStyle = {
  styles: { fontSize: 8, cellPadding: 1.5 },
  headStyles: { fillColor: [41, 98, 255] as [number, number, number], fontSize: 8 },
  alternateRowStyles: { fillColor: [245, 247, 250] as [number, number, number] },
  margin: { left: 14, right: 14 },
};

export interface OverallSummaryData {
  members: any[]; // {id, full_name, is_deleted, is_customer}
  fundTxns: any[]; // {type: 'in'|'out'|'income'|'expense', amount, created_at, reason}
  deposits: any[]; // {member_id, amount, status, created_at, payment_method}
  islamicLoans: any[]; // {id, code, purchase_price, sell_price, created_at, borrower_name, media_person_id}
  islamicPayments: any[]; // {loan_id, amount, created_at, payment_method}
  projects: any[]; // {id, name, code}
  projectTxns: any[]; // {project_id, type, amount, created_at, reason, comments}
  memberLoans: any[]; // {id, member_id, approved_amount, requested_amount, status, created_at}
  memberRepayments: any[]; // {loan_id, amount, status, created_at}
  distributions?: any[]; // {member_id, amount, created_at}
}

async function drawHeader(doc: jsPDF, title: string, subtitle: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  try {
    const logo = await loadLogoDataUrl();
    doc.addImage(logo, 'PNG', 14, 10, 14, 14);
  } catch { /* ignore */ }
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(BRAND.name, 32, 17);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(110);
  doc.text(BRAND.slogan, 32, 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 14, 17, { align: 'right' });
  doc.setDrawColor(200);
  doc.line(14, 27, pageWidth - 14, 27);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 34);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90);
  doc.text(subtitle, 14, 40);
  doc.setTextColor(0);
}

function drawFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`${BRAND.name} — Page ${i} of ${total}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }
}

function inRange(dateStr: string | null | undefined, start: Date, end: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

function sectionTitle(doc: jsPDF, text: string, y: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 30) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(41, 98, 255);
  doc.text(text, 14, y);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  return y + 3;
}

function monthTitle(doc: jsPDF, text: string, y: number) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - 40) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(41, 98, 255);
  doc.rect(14, y, doc.internal.pageSize.getWidth() - 28, 8, 'F');
  doc.setTextColor(255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(text, 17, y + 5.5);
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
  return y + 12;
}

function renderMonthBlock(
  doc: jsPDF,
  data: OverallSummaryData,
  start: Date,
  end: Date,
  startY: number,
  showMonthTitle: boolean
): number {
  const memberById = new Map<string, string>();
  for (const m of data.members) memberById.set(m.id, m.full_name || 'Unknown');
  const loanCodeById = new Map<string, string>();
  const loanMemberById = new Map<string, string>();
  for (const l of data.memberLoans) {
    loanMemberById.set(l.id, memberById.get(l.member_id) || '-');
  }
  const islamicCodeById = new Map<string, string>();
  for (const l of data.islamicLoans) islamicCodeById.set(l.id, l.code || l.id.slice(0, 6));
  const projectById = new Map<string, string>();
  for (const p of data.projects) projectById.set(p.id, p.name || p.code || 'Project');

  let y = startY;
  if (showMonthTitle) y = monthTitle(doc, format(start, 'MMMM yyyy'), y);

  // Members: all active non-customer members, with month deposit/withdraw and cumulative balance up to end of month
  const monthDeposits = data.deposits.filter(d => d.status === 'approved' && inRange(eff(d), start, end));
  const perMember = new Map<string, { deposit: number; withdraw: number }>();
  for (const d of monthDeposits) {
    const amt = Number(d.amount || 0);
    const cur = perMember.get(d.member_id) || { deposit: 0, withdraw: 0 };
    if (amt >= 0) cur.deposit += amt;
    else cur.withdraw += Math.abs(amt);
    perMember.set(d.member_id, cur);
  }
  // Cumulative balance = all approved deposits (+ withdrawals as negative) + profit distributions, up to end of month
  const balanceByMember = new Map<string, number>();
  for (const d of data.deposits) {
    if (d.status !== 'approved') continue;
    const _de = eff(d); const dt = _de ? new Date(_de) : null;
    if (!dt || dt > end) continue;
    balanceByMember.set(d.member_id, (balanceByMember.get(d.member_id) || 0) + Number(d.amount || 0));
  }
  for (const r of (data.distributions || [])) {
    const _re = eff(r); const dt = _re ? new Date(_re) : null;
    if (!dt || dt > end) continue;
    balanceByMember.set(r.member_id, (balanceByMember.get(r.member_id) || 0) + Number(r.amount || 0));
  }

  const activeMembers = data.members
    .filter((m: any) => !m.is_deleted && !m.is_customer)
    .sort((a: any, b: any) => (a.full_name || '').localeCompare(b.full_name || ''));

  const totalCapital = Array.from(balanceByMember.values()).reduce((s, v) => s + v, 0);

  y = sectionTitle(doc, 'Members — Capital & Deposits', y);
  if (activeMembers.length === 0) {
    doc.setFontSize(9); doc.setTextColor(120);
    doc.text('No active members.', 14, y + 3);
    doc.setTextColor(0);
    y += 8;
  } else {
    const rows = activeMembers.map((m: any) => {
      const v = perMember.get(m.id);
      return [
        m.full_name || '-',
        v && v.deposit > 0 ? fmt(v.deposit) : '',
        v && v.withdraw > 0 ? fmt(v.withdraw) : '',
        fmt(balanceByMember.get(m.id) || 0),
      ];
    });
    // Append total row
    rows.push(['TOTAL CAPITAL', '', '', fmt(totalCapital)]);

    autoTable(doc, {
      startY: y,
      head: [['Member', 'Deposit (In)', 'Withdraw (Out)', 'Total Balance']],
      body: rows,
      ...tableStyle,
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  }


  // Cumulative Fund Balance up to end of period
  let fundBalanceCumulative = 0;
  for (const t of data.fundTxns) {
    const _fe = eff(t); const dt = _fe ? new Date(_fe) : null;
    if (!dt || dt > end) continue;
    const amt = Number(t.amount || 0);
    if (t.type === 'in' || t.type === 'income') fundBalanceCumulative += amt;
    else if (t.type === 'out' || t.type === 'expense') fundBalanceCumulative -= amt;
  }

  // Fund
  const monthFund = data.fundTxns.filter(t => inRange(eff(t), start, end));
  const fundIn = monthFund.filter(t => t.type === 'in' || t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
  const fundOut = monthFund.filter(t => t.type === 'out' || t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
  y = sectionTitle(doc, 'Fund Balance', y);
  autoTable(doc, {
    startY: y,
    head: [['Fund In (Period)', 'Fund Out (Period)', 'Net Period Change', 'Net Fund Balance (Total)']],
    body: [[fmt(fundIn), fmt(fundOut), fmt(fundIn - fundOut), fmt(fundBalanceCumulative)]],
    ...tableStyle,
  });
  y = (doc as any).lastAutoTable.finalY + 5;

  // Islamic Loans — created + installments
  const ilCreated = data.islamicLoans.filter(l => inRange(eff(l), start, end));
  const ilPays = data.islamicPayments.filter(p => inRange(eff(p), start, end));
  const ilInTotal = ilPays.reduce((s, p) => s + Number(p.amount || 0), 0);
  const ilOutTotal = ilCreated.reduce((s, l) => s + Number(l.purchase_price || 0), 0);

  y = sectionTitle(doc, 'Islamic Loans', y);
  autoTable(doc, {
    startY: y,
    head: [['Installments In (Period)', 'Purchases Out (Period)', 'Net Islamic Loans Change']],
    body: [[fmt(ilInTotal), fmt(ilOutTotal), fmt(ilInTotal - ilOutTotal)]],
    ...tableStyle,
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  if (ilCreated.length || ilPays.length) {
    if (ilCreated.length) {
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Code', 'Borrower', 'Purchase (Out)']],
        body: ilCreated.map(l => [fmtDate(eff(l)), l.code || '-', l.borrower_name || '-', fmt(Number(l.purchase_price || 0))]),
        ...tableStyle,
      });
      y = (doc as any).lastAutoTable.finalY + 3;
    }
    if (ilPays.length) {
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Loan Code', 'Installment (In)', 'Method']],
        body: ilPays.map(p => [fmtDate(eff(p)), islamicCodeById.get(p.loan_id) || '-', fmt(Number(p.amount || 0)), p.payment_method || '-']),
        ...tableStyle,
      });
      y = (doc as any).lastAutoTable.finalY + 5;
    }
  } else {
    y += 2;
  }

  // Projects
  const projTxns = data.projectTxns.filter(t => inRange(eff(t), start, end));
  const prjInTotal = projTxns.filter(t => t.type === 'income' || t.type === 'in').reduce((s, t) => s + Number(t.amount || 0), 0);
  const prjOutTotal = projTxns.filter(t => t.type === 'expense' || t.type === 'out').reduce((s, t) => s + Number(t.amount || 0), 0);

  y = sectionTitle(doc, 'Projects', y);
  autoTable(doc, {
    startY: y,
    head: [['Income In (Period)', 'Expense Out (Period)', 'Net Project Change']],
    body: [[fmt(prjInTotal), fmt(prjOutTotal), fmt(prjInTotal - prjOutTotal)]],
    ...tableStyle,
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  if (projTxns.length) {
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Project', 'Type', 'Amount', 'Reason']],
      body: projTxns.map(t => [
        fmtDate(eff(t)),
        projectById.get(t.project_id) || '-',
        t.type === 'income' || t.type === 'in' ? 'In' : 'Out',
        fmt(Number(t.amount || 0)),
        t.reason || t.comments || '-',
      ]),
      ...tableStyle,
    });
    y = (doc as any).lastAutoTable.finalY + 5;
  } else {
    y += 2;
  }

  // Member Loans — new + repayments
  const mlNew = data.memberLoans.filter(l => inRange(eff(l), start, end));
  const mlPays = data.memberRepayments.filter(r => r.status === 'approved' && inRange(eff(r), start, end));
  const mlInTotal = mlPays.reduce((s, r) => s + Number(r.amount || 0), 0);
  const mlOutTotal = mlNew.reduce((s, l) => s + Number(l.approved_amount || l.requested_amount || 0), 0);

  y = sectionTitle(doc, 'Member Loans', y);
  autoTable(doc, {
    startY: y,
    head: [['Repayments In (Period)', 'Disbursed Out (Period)', 'Net Member Loans Change']],
    body: [[fmt(mlInTotal), fmt(mlOutTotal), fmt(mlInTotal - mlOutTotal)]],
    ...tableStyle,
  });
  y = (doc as any).lastAutoTable.finalY + 3;

  if (mlNew.length || mlPays.length) {
    if (mlNew.length) {
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Member', 'Loan Amount (Out)', 'Status']],
        body: mlNew.map(l => [
          fmtDate(eff(l)),
          memberById.get(l.member_id) || '-',
          fmt(Number(l.approved_amount || l.requested_amount || 0)),
          l.status || '-',
        ]),
        ...tableStyle,
      });
      y = (doc as any).lastAutoTable.finalY + 3;
    }
    if (mlPays.length) {
      autoTable(doc, {
        startY: y,
        head: [['Date', 'Member', 'Repayment (In)']],
        body: mlPays.map(r => [
          fmtDate(eff(r)),
          loanMemberById.get(r.loan_id) || '-',
          fmt(Number(r.amount || 0)),
        ]),
        ...tableStyle,
      });
      y = (doc as any).lastAutoTable.finalY + 5;
    }
  } else {
    y += 2;
  }

  return y + 4;
}

export async function generateOverallSummaryPDF(
  data: OverallSummaryData,
  period: OverallPeriod,
  customRange?: { from: Date; to: Date }
) {
  const doc = new jsPDF();
  const now = new Date();

  if (period === 'month') {
    const start = customRange
      ? new Date(customRange.from.getFullYear(), customRange.from.getMonth(), customRange.from.getDate(), 0, 0, 0, 0)
      : startOfMonth(now);
    const end = customRange
      ? new Date(customRange.to.getFullYear(), customRange.to.getMonth(), customRange.to.getDate(), 23, 59, 59, 999)
      : endOfMonth(now);
    await drawHeader(
      doc,
      'Overall Summary — Date Range',
      `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`
    );
    renderMonthBlock(doc, data, start, end, 46, false);
    drawFooter(doc);
    doc.save(`overall-summary-${format(start, 'yyyy-MM-dd')}_to_${format(end, 'yyyy-MM-dd')}.pdf`);
    return;
  }

  const { start: yearStart, end: yearEnd } = fiscalYearRange(now);
  await drawHeader(
    doc,
    'Overall Summary — Fiscal Year',
    `${format(yearStart, 'MMM d, yyyy')} – ${format(yearEnd, 'MMM d, yyyy')} (month-by-month)`
  );
  let y = 46;
  for (let i = 0; i < 12; i++) {
    const mStart = addMonths(yearStart, i);
    if (mStart > yearEnd) break;
    const mEnd = endOfMonth(mStart) > yearEnd ? yearEnd : endOfMonth(mStart);
    y = renderMonthBlock(doc, data, mStart, mEnd, y, true);
  }

  drawFooter(doc);
  doc.save(`overall-summary-fy-${format(yearStart, 'yyyy')}-${format(yearEnd, 'yyyy')}.pdf`);
}

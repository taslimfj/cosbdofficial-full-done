import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { BRAND, loadLogoDataUrl } from './brand';

const fmt = (n: number) => 'TK ' + new Intl.NumberFormat('en-IN').format(Math.round(Number(n) || 0));
const fmt2 = (n: number) => 'TK ' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const pct = (n: number) => `${(Number(n) || 0).toFixed(2)}%`;

async function drawHeader(doc: jsPDF, subtitle: string, refCode: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(16, 122, 87);
  doc.rect(0, 0, pageWidth, 34, 'F');
  try {
    const logo = await loadLogoDataUrl();
    doc.addImage(logo, 'PNG', 14, 6, 22, 22);
  } catch { /* ignore */ }
  doc.setTextColor(255);
  doc.setFontSize(18); doc.setFont('helvetica', 'bold');
  doc.text(BRAND.name, 40, 15);
  doc.setFontSize(9); doc.setFont('helvetica', 'italic');
  doc.text(BRAND.slogan, 40, 21);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(subtitle, 40, 29);
  doc.setFontSize(9);
  doc.text(`Ref: ${refCode}`, pageWidth - 14, 15, { align: 'right' });
  doc.text(format(new Date(), 'dd MMM yyyy, hh:mm a'), pageWidth - 14, 22, { align: 'right' });
  doc.text('Admin Snapshot Report', pageWidth - 14, 29, { align: 'right' });
  doc.setTextColor(0);
}

function drawFooter(doc: jsPDF, label: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setDrawColor(220); doc.line(14, 283, pageWidth - 14, 283);
  doc.setTextColor(150); doc.setFontSize(8);
  doc.text(`${BRAND.name} — ${BRAND.slogan}`, pageWidth / 2, 289, { align: 'center' });
  doc.text(label, pageWidth / 2, 293, { align: 'center' });
}

function sectionTitle(doc: jsPDF, y: number, title: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0);
  doc.text(title, 14, y);
  doc.setDrawColor(200); doc.line(14, y + 2, pageWidth - 14, y + 2);
}

export interface IslamicLoanSnapshotData {
  loan: any;
  mediaPersonName?: string | null;
  secondaryMediaPersonName?: string | null;
  snapshot: Array<{
    member_name: string;
    deposit_snapshot: number;
    share_percentage: number;
    is_member_deleted?: boolean;
  }>;
  admins: Array<{ id: string; full_name: string | null }>;
}

export async function generateIslamicLoanSnapshotPDF(data: IslamicLoanSnapshotData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const loan = data.loan;
  const code = loan.code || loan.id.slice(0, 8);
  await drawHeader(doc, 'Islamic Loan — Snapshot Report', code);

  // Loan info
  sectionTitle(doc, 46, 'Loan Information');
  autoTable(doc, {
    startY: 51,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, textColor: [100,100,100] } },
    body: [
      ['Loan Code', String(code)],
      ['Loan ID', String(loan.id)],
      ['Status', String(loan.status || '-').toUpperCase()],
      ['Created At', loan.created_at ? format(new Date(loan.created_at), 'dd MMM yyyy') : '-'],
      ['Closed At', loan.closed_at ? format(new Date(loan.closed_at), 'dd MMM yyyy') : '-'],
      ['Borrower', loan.borrower_name || '-'],
      ['Borrower Phone', loan.borrower_phone || '-'],
      ['Relative Phone', loan.relative_phone || '-'],
      ['Product', loan.product_name || '-'],
      ['Tenure', `${loan.tenure_months || 0} months`],
      ['Purchase Price', fmt(loan.purchase_price)],
      ['Sell Price', fmt(loan.sell_price)],
      ['Monthly Installment', fmt(loan.monthly_installment)],
      ['Remaining', fmt(loan.remaining_amount)],
      ['Profit %', pct(loan.profit_percentage)],
      ['Discount %', pct(loan.discount_pct)],
    ],
  });
  let y = (doc as any).lastAutoTable.finalY + 8;

  // Media persons
  sectionTitle(doc, y, 'Media Persons');
  autoTable(doc, {
    startY: y + 5,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, textColor: [100,100,100] } },
    body: [
      ['Primary Media', data.mediaPersonName || '-'],
      ['Secondary Media', data.secondaryMediaPersonName || '-'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Distribution percentages
  const fundPct = Number(loan.fund_profit_pct) || 0;
  const mediaPct = Number(loan.media_person_profit_pct) || 0;
  const adminPct = Number(loan.admin_profit_pct) || 0;
  const memberPct = Math.max(0, 100 - fundPct - mediaPct - adminPct);

  sectionTitle(doc, y, 'Profit Distribution Structure (Snapshot)');
  autoTable(doc, {
    startY: y + 5,
    head: [['Recipient', 'Share %']],
    body: [
      ['Fund', pct(fundPct)],
      ['Media Person', pct(mediaPct)],
      ['Admin Pool', pct(adminPct)],
      ['Member Pool', pct(memberPct)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [16, 122, 87] },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // Admins snapshot
  if (data.admins?.length) {
    sectionTitle(doc, y, `Admins (Admin pool ${pct(adminPct)} equally split)`);
    const perAdminPct = data.admins.length ? adminPct / data.admins.length : 0;
    autoTable(doc, {
      startY: y + 5,
      head: [['#', 'Admin Name', 'Per-Admin Share %']],
      body: data.admins.map((a, i) => [
        String(i + 1),
        a.full_name || '-',
        pct(perAdminPct),
      ]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [16, 122, 87] },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // Member shares snapshot
  if (y > 240) { doc.addPage(); y = 20; }
  sectionTitle(doc, y, `Member Share Snapshot (Locked at Creation) — Member Pool ${pct(memberPct)}`);
  const totalDep = data.snapshot.reduce((s, r) => s + Number(r.deposit_snapshot || 0), 0);
  const totalPct = data.snapshot.reduce((s, r) => s + Number(r.share_percentage || 0), 0);
  autoTable(doc, {
    startY: y + 5,
    head: [['#', 'Member', 'Deposit Snapshot', 'Share %', 'Status']],
    body: [
      ...data.snapshot.map((r, i) => [
        String(i + 1),
        r.member_name || '-',
        fmt2(r.deposit_snapshot),
        pct(r.share_percentage),
        r.is_member_deleted ? 'DELETED' : 'Active',
      ]),
      [
        '', { content: 'TOTAL', styles: { fontStyle: 'bold' } },
        { content: fmt2(totalDep), styles: { fontStyle: 'bold' } },
        { content: pct(totalPct), styles: { fontStyle: 'bold' } },
        '',
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 122, 87] },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(doc, `Islamic Loan Snapshot — Page ${i} of ${pages}`);
  }
  doc.save(`islamic-loan-snapshot-${code}.pdf`);
}

export interface ProjectSnapshotData {
  project: any;
  managerName?: string | null;
  secondaryManagerName?: string | null;
  snapshot: Array<{
    member_name: string;
    deposit_snapshot: number;
    share_percentage: number;
    is_member_deleted?: boolean;
  }>;
  admins: Array<{ id: string; full_name: string | null }>;
}

export async function generateProjectSnapshotPDF(data: ProjectSnapshotData) {
  const doc = new jsPDF();
  const project = data.project;
  const code = project.code || project.id.slice(0, 8);
  await drawHeader(doc, 'Project — Snapshot Report', code);

  sectionTitle(doc, 46, 'Project Information');
  autoTable(doc, {
    startY: 51,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, textColor: [100,100,100] } },
    body: [
      ['Project Code', String(code)],
      ['Project ID', String(project.id)],
      ['Name', project.name || '-'],
      ['Status', String(project.status || '-').toUpperCase()],
      ['Created At', project.created_at ? format(new Date(project.created_at), 'dd MMM yyyy') : '-'],
      ['Closed At', project.closed_at ? format(new Date(project.closed_at), 'dd MMM yyyy') : '-'],
      ['Comments', project.comments || '-'],
    ],
  });
  let y = (doc as any).lastAutoTable.finalY + 8;

  sectionTitle(doc, y, 'Managers');
  autoTable(doc, {
    startY: y + 5,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60, textColor: [100,100,100] } },
    body: [
      ['Primary Manager', data.managerName || '-'],
      ['Secondary Manager', data.secondaryManagerName || '-'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  const fundPct = Number(project.fund_profit_pct) || 0;
  const mgrPct = Number(project.manager_profit_pct) || 0;
  const adminPct = Number(project.admin_profit_pct) || 0;
  const memberPct = Math.max(0, 100 - fundPct - mgrPct - adminPct);

  sectionTitle(doc, y, 'Profit Distribution Structure (Snapshot)');
  autoTable(doc, {
    startY: y + 5,
    head: [['Recipient', 'Share %']],
    body: [
      ['Fund', pct(fundPct)],
      ['Manager', pct(mgrPct)],
      ['Admin Pool', pct(adminPct)],
      ['Member Pool', pct(memberPct)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [16, 122, 87] },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  if (data.admins?.length) {
    sectionTitle(doc, y, `Admins (Admin pool ${pct(adminPct)} equally split)`);
    const perAdminPct = data.admins.length ? adminPct / data.admins.length : 0;
    autoTable(doc, {
      startY: y + 5,
      head: [['#', 'Admin Name', 'Per-Admin Share %']],
      body: data.admins.map((a, i) => [String(i + 1), a.full_name || '-', pct(perAdminPct)]),
      styles: { fontSize: 10 },
      headStyles: { fillColor: [16, 122, 87] },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  if (y > 240) { doc.addPage(); y = 20; }
  sectionTitle(doc, y, `Member Share Snapshot (Locked at Creation) — Member Pool ${pct(memberPct)}`);
  const totalDep = data.snapshot.reduce((s, r) => s + Number(r.deposit_snapshot || 0), 0);
  const totalPct = data.snapshot.reduce((s, r) => s + Number(r.share_percentage || 0), 0);
  autoTable(doc, {
    startY: y + 5,
    head: [['#', 'Member', 'Deposit Snapshot', 'Share %', 'Status']],
    body: [
      ...data.snapshot.map((r, i) => [
        String(i + 1),
        r.member_name || '-',
        fmt2(r.deposit_snapshot),
        pct(r.share_percentage),
        r.is_member_deleted ? 'DELETED' : 'Active',
      ]),
      [
        '', { content: 'TOTAL', styles: { fontStyle: 'bold' } },
        { content: fmt2(totalDep), styles: { fontStyle: 'bold' } },
        { content: pct(totalPct), styles: { fontStyle: 'bold' } },
        '',
      ],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [16, 122, 87] },
  });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    drawFooter(doc, `Project Snapshot — Page ${i} of ${pages}`);
  }
  doc.save(`project-snapshot-${code}.pdf`);
}

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { BRAND, loadLogoDataUrl } from './brand';

const fmt = (n: number) => 'TK ' + new Intl.NumberFormat('en-IN').format(Math.round(Number(n) || 0));
const pct = (n: number) => `${(Number(n) || 0).toFixed(2)}%`;

async function drawHeader(doc: jsPDF, subtitle: string, refCode: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(16, 122, 87);
  doc.rect(0, 0, pageWidth, 26, 'F');
  try {
    const logo = await loadLogoDataUrl();
    doc.addImage(logo, 'PNG', 12, 4, 18, 18);
  } catch { /* ignore */ }
  doc.setTextColor(255);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text(BRAND.name, 34, 12);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 34, 19);
  doc.setFontSize(8);
  doc.text(`Ref: ${refCode}`, pageWidth - 12, 12, { align: 'right' });
  doc.text(format(new Date(), 'dd MMM yyyy'), pageWidth - 12, 19, { align: 'right' });
  doc.setTextColor(0);
}

function drawFooter(doc: jsPDF) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setDrawColor(220); doc.line(12, pageHeight - 14, pageWidth - 12, pageHeight - 14);
  doc.setTextColor(150); doc.setFontSize(7);
  doc.text(`${BRAND.name} — ${BRAND.slogan}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
}

/** One blank box for manual Profit / Loss entry. */
function drawManualBox(doc: jsPDF, y: number) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const boxW = pageWidth - margin * 2;
  const boxH = 18;
  doc.setDrawColor(120); doc.setLineWidth(0.3);
  doc.rect(margin, y, boxW, boxH);
  doc.setFontSize(8); doc.setTextColor(90); doc.setFont('helvetica', 'bold');
  doc.text('Profit / Loss (Manual Entry):', margin + 2, y + 5);
  doc.setTextColor(0); doc.setFont('helvetica', 'normal');
  return y + boxH;
}

interface MemberInfo { id: string; full_name?: string | null; deleted_name?: string | null }
interface SnapshotRow { member_id?: string | null; member_name?: string | null; share_percentage: number; is_member_deleted?: boolean }

function buildMemberRows(opts: {
  allMembers: MemberInfo[];
  snapshot: SnapshotRow[];
  excludedIds: string[];
  mediaId1?: string | null;
  mediaId2?: string | null;
  perMediaPct: number;
  mediaLabel: 'media' | 'manager';
  adminIds: string[];
  perAdminPct: number;
}) {
  const excluded = new Set(opts.excludedIds.filter(Boolean));
  const memberById = new Map(opts.allMembers.map((m) => [m.id, m]));
  const adminSet = new Set(opts.adminIds.filter(Boolean));

  const rows = opts.snapshot
    .filter((s) => !!s.member_id && !s.is_member_deleted && !excluded.has(s.member_id) && (Number(s.share_percentage) || 0) > 0)
    .map((s) => {
      const memberId = s.member_id as string;
      const member = memberById.get(memberId);
      const base = Number(s.share_percentage) || 0;
      const name = s.member_name || member?.full_name || member?.deleted_name || 'Unknown';
      const tags: string[] = [];
      if (memberId === opts.mediaId1 || memberId === opts.mediaId2) {
        tags.push(`+${pct(opts.perMediaPct)} ${opts.mediaLabel}`);
      }
      if (adminSet.has(memberId)) {
        tags.push(`+${pct(opts.perAdminPct)} admin`);
      }
      const label = tags.length ? `${name}  (${tags.join(', ')})` : name;
      return { label, base };
    })
    .sort((a, b) => b.base - a.base);

  return rows;
}

export interface IslamicLoanSnapshotData {
  loan: any;
  mediaPersonId?: string | null;
  secondaryMediaPersonId?: string | null;
  snapshot: SnapshotRow[];
  allMembers: MemberInfo[];
  adminIds: string[];
  excludedIds?: string[];
}

export async function generateIslamicLoanSnapshotPDF(data: IslamicLoanSnapshotData) {
  const doc = new jsPDF();
  const loan = data.loan;
  const code = loan.code || loan.id.slice(0, 8);
  await drawHeader(doc, 'Islamic Loan — Snapshot', code);

  const mediaPct = Number(loan.media_person_profit_pct) || 0;
  const adminPct = Number(loan.admin_profit_pct) || 0;
  const mediaId1 = data.mediaPersonId || loan.media_person_id || null;
  const mediaId2 = data.secondaryMediaPersonId || loan.secondary_media_person_id || null;
  const bothMedia = mediaId1 && mediaId2 && mediaId1 !== mediaId2;
  const perMediaPct = bothMedia ? mediaPct / 2 : mediaPct;
  const perAdminPct = data.adminIds.length ? adminPct / data.adminIds.length : 0;

  let y = 32;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Loan Info', 12, y);
  doc.setDrawColor(200); doc.line(12, y + 1.5, doc.internal.pageSize.getWidth() - 12, y + 1.5);
  y += 3;

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] },
      3: { cellWidth: 60 },
    },
    body: [
      ['Borrower', loan.borrower_name || '-', 'Product', loan.product_name || '-'],
      ['Sell Price', fmt(loan.sell_price), 'Monthly', fmt(loan.monthly_installment)],
      ['Tenure', `${loan.tenure_months || 0} mo`, 'Status', String(loan.status || '-').toUpperCase()],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  y = drawManualBox(doc, y) + 5;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Member Share %', 12, y);
  doc.setDrawColor(200); doc.line(12, y + 1.5, doc.internal.pageSize.getWidth() - 12, y + 1.5);
  y += 3;

  const rows = buildMemberRows({
    allMembers: data.allMembers,
    snapshot: data.snapshot,
    excludedIds: data.excludedIds || (loan.excluded_member_ids as string[]) || [],
    mediaId1, mediaId2, perMediaPct, mediaLabel: 'media',
    adminIds: data.adminIds, perAdminPct,
  });
  const totalPct = rows.reduce((s, r) => s + r.base, 0);
  const body: any[] = rows.map((r, i) => [String(i + 1), r.label, pct(r.base)]);
  body.push(['', { content: 'TOTAL', styles: { fontStyle: 'bold' } }, { content: pct(totalPct), styles: { fontStyle: 'bold' } }]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Member', 'Share %']],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.1 },
    headStyles: { fillColor: [16, 122, 87], fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 28, halign: 'right' } },
  });

  drawFooter(doc);
  doc.save(`islamic-loan-snapshot-${code}.pdf`);
}

export interface ProjectSnapshotData {
  project: any;
  managerId?: string | null;
  secondaryManagerId?: string | null;
  snapshot: SnapshotRow[];
  allMembers: MemberInfo[];
  adminIds: string[];
  excludedIds?: string[];
}

export async function generateProjectSnapshotPDF(data: ProjectSnapshotData) {
  const doc = new jsPDF();
  const project = data.project;
  const code = project.code || project.id.slice(0, 8);
  await drawHeader(doc, 'Project — Snapshot', code);

  const mgrPct = Number(project.manager_profit_pct) || 0;
  const adminPct = Number(project.admin_profit_pct) || 0;
  const mgrId1 = data.managerId || project.manager_id || null;
  const mgrId2 = data.secondaryManagerId || project.secondary_manager_id || null;
  const bothMgr = mgrId1 && mgrId2 && mgrId1 !== mgrId2;
  const perMgrPct = bothMgr ? mgrPct / 2 : mgrPct;
  const perAdminPct = data.adminIds.length ? adminPct / data.adminIds.length : 0;

  let y = 32;
  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Project Info', 12, y);
  doc.setDrawColor(200); doc.line(12, y + 1.5, doc.internal.pageSize.getWidth() - 12, y + 1.5);
  y += 3;

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.2 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] },
      1: { cellWidth: 60 },
      2: { fontStyle: 'bold', cellWidth: 32, textColor: [90, 90, 90] },
      3: { cellWidth: 60 },
    },
    body: [
      ['Name', project.name || '-', 'Status', String(project.status || '-').toUpperCase()],
      ['Created', (project.issue_date || project.created_at) ? format(new Date(project.issue_date || project.created_at), 'dd MMM yyyy') : '-',
       'Closed', project.closed_at ? format(new Date(project.closed_at), 'dd MMM yyyy') : '-'],
    ],
  });
  y = (doc as any).lastAutoTable.finalY + 4;

  y = drawManualBox(doc, y) + 5;

  doc.setFontSize(11); doc.setFont('helvetica', 'bold');
  doc.text('Member Share %', 12, y);
  doc.setDrawColor(200); doc.line(12, y + 1.5, doc.internal.pageSize.getWidth() - 12, y + 1.5);
  y += 3;

  const rows = buildMemberRows({
    allMembers: data.allMembers,
    snapshot: data.snapshot,
    excludedIds: data.excludedIds || (project.excluded_member_ids as string[]) || [],
    mediaId1: mgrId1, mediaId2: mgrId2, perMediaPct: perMgrPct, mediaLabel: 'manager',
    adminIds: data.adminIds, perAdminPct,
  });
  const totalPct = rows.reduce((s, r) => s + r.base, 0);
  const body: any[] = rows.map((r, i) => [String(i + 1), r.label, pct(r.base)]);
  body.push(['', { content: 'TOTAL', styles: { fontStyle: 'bold' } }, { content: pct(totalPct), styles: { fontStyle: 'bold' } }]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Member', 'Share %']],
    body,
    styles: { fontSize: 8.5, cellPadding: 1.1 },
    headStyles: { fillColor: [16, 122, 87], fontSize: 9 },
    columnStyles: { 0: { cellWidth: 10 }, 2: { cellWidth: 28, halign: 'right' } },
  });

  drawFooter(doc);
  doc.save(`project-snapshot-${code}.pdf`);
}

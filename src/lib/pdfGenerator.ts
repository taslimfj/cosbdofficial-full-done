import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const formatAmount = (amount: number) => `TK ${new Intl.NumberFormat('en-IN').format(amount)}`;

export function generateMemberPDF(member: any, deposits: any[], distributions: any[]) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ShareeFund', 14, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 14, 20, { align: 'right' });

  // Member info
  doc.setDrawColor(200);
  doc.line(14, 25, pageWidth - 14, 25);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`Member Report: ${member.full_name || 'Unnamed'}`, 14, 35);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Phone: ${member.phone || 'N/A'}`, 14, 43);
  doc.text(`Total Deposited: ${formatAmount(Number(member.total_deposited || 0))}`, 14, 50);
  doc.text(`Member Since: ${member.created_at ? format(new Date(member.created_at), 'MMM d, yyyy') : 'N/A'}`, 14, 57);

  // Deposits Table
  let startY = 65;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Deposit History', 14, startY);
  startY += 5;

  if (deposits.length > 0) {
    autoTable(doc, {
      startY,
      head: [['Date', 'Amount', 'Method', 'TXN No.', 'Status']],
      body: deposits.map(d => [
        d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : '-',
        formatAmount(Number(d.amount)),
        d.payment_method || '-',
        d.transaction_number || '-',
        d.status || 'pending',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 98, 255] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
    startY = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('No deposits recorded', 14, startY + 5);
    startY += 15;
  }

  // Distributions Table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Profit Distributions', 14, startY);
  startY += 5;

  if (distributions.length > 0) {
    autoTable(doc, {
      startY,
      head: [['Date', 'Amount', 'Type', 'Share %']],
      body: distributions.map(d => [
        d.created_at ? format(new Date(d.created_at), 'MMM d, yyyy') : '-',
        formatAmount(Number(d.amount)),
        d.distribution_type || '-',
        d.share_percentage ? `${d.share_percentage.toFixed(1)}%` : '-',
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 98, 255] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('No distributions recorded', 14, startY + 5);
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`ShareeFund Report — Page ${i} of ${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
  }

  doc.save(`${member.full_name || 'member'}-report.pdf`);
}

export function generateFundSummaryPDF(transactions: any[], stats: { totalIn: number; totalOut: number }) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('ShareeFund', 14, 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, pageWidth - 14, 20, { align: 'right' });

  doc.setDrawColor(200);
  doc.line(14, 25, pageWidth - 14, 25);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text('Fund Summary Report', 14, 35);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total Fund In: ${formatAmount(stats.totalIn)}`, 14, 43);
  doc.text(`Total Fund Out: ${formatAmount(stats.totalOut)}`, 14, 50);
  doc.text(`Net Balance: ${formatAmount(stats.totalIn - stats.totalOut)}`, 14, 57);

  autoTable(doc, {
    startY: 65,
    head: [['Date', 'Type', 'Amount', 'Reason']],
    body: transactions.map(t => [
      t.created_at ? format(new Date(t.created_at), 'MMM d, yyyy') : '-',
      t.type === 'in' ? 'Fund In' : 'Fund Out',
      formatAmount(Number(t.amount)),
      t.reason || '-',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [41, 98, 255] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  doc.save('fund-summary-report.pdf');
}

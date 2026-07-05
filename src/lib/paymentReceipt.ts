import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

const formatAmount = (n: number) => 'TK ' + new Intl.NumberFormat('en-IN').format(n);

export interface ReceiptData {
  loan: {
    code?: string | null;
    id: string;
    borrower_name?: string | null;
    borrower_phone?: string | null;
    product_name?: string | null;
    tenure_months?: number | null;
    sell_price?: number | null;
    monthly_installment?: number | null;
    remaining_amount?: number | null;
  };
  payment: {
    id: string;
    amount: number;
    payment_type?: string | null;
    payment_method?: string | null;
    transaction_id?: string | null;
    created_at: string;
    approved_at?: string | null;
  };
  installmentNumber: number;
  totalInstallments: number;
  approverName?: string | null;
}

export function generatePaymentReceiptPDF(data: ReceiptData) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(16, 122, 87);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setTextColor(255);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('ShareeFund', 14, 15);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text('Payment Receipt', 14, 23);
  doc.setFontSize(9);
  doc.text(`Receipt #: ${data.payment.id.slice(0, 8).toUpperCase()}`, pageWidth - 14, 15, { align: 'right' });
  doc.text(format(new Date(), 'dd MMM yyyy, hh:mm a'), pageWidth - 14, 23, { align: 'right' });

  doc.setTextColor(0);

  // Loan summary
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Loan Information', 14, 42);
  doc.setDrawColor(200); doc.line(14, 44, pageWidth - 14, 44);

  autoTable(doc, {
    startY: 47,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: [100,100,100] } },
    body: [
      ['Loan Code', data.loan.code || data.loan.id.slice(0, 8)],
      ['Loan ID', data.loan.id],
      ['Borrower', data.loan.borrower_name || '-'],
      ['Phone', data.loan.borrower_phone || '-'],
      ['Product', data.loan.product_name || '-'],
      ['Tenure', `${data.loan.tenure_months || 0} months`],
      ['Total Sell Price', formatAmount(Number(data.loan.sell_price || 0))],
      ['Monthly Installment', formatAmount(Number(data.loan.monthly_installment || 0))],
    ],
  });

  let y = (doc as any).lastAutoTable.finalY + 8;

  // Payment details
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text('Payment Details', 14, y);
  doc.line(14, y + 2, pageWidth - 14, y + 2);

  autoTable(doc, {
    startY: y + 5,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, textColor: [100,100,100] } },
    body: [
      ['Installment No.', `${data.installmentNumber} of ${data.totalInstallments}`],
      ['Payment Type', (data.payment.payment_type || 'installment').toUpperCase()],
      ['Payment Method', data.payment.payment_method || '-'],
      ['Transaction ID', data.payment.transaction_id || '-'],
      ['Sent At', format(new Date(data.payment.created_at), 'dd MMM yyyy, hh:mm a')],
      ['Approved At', data.payment.approved_at ? format(new Date(data.payment.approved_at), 'dd MMM yyyy, hh:mm a') : '-'],
      ['Approved By', data.approverName || '-'],
    ],
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // Amount highlight
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(16, 122, 87);
  doc.roundedRect(14, y, pageWidth - 28, 24, 2, 2, 'FD');
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(80);
  doc.text('Amount Paid', 20, y + 10);
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(16, 122, 87);
  doc.text(formatAmount(Number(data.payment.amount)), pageWidth - 20, y + 15, { align: 'right' });
  doc.setTextColor(80); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  doc.text(`Remaining after this payment: ${formatAmount(Math.max(0, Number(data.loan.remaining_amount || 0)))}`, 20, y + 20);

  y += 32;

  doc.setTextColor(120); doc.setFontSize(9); doc.setFont('helvetica', 'italic');
  doc.text('This is a system-generated receipt and does not require a signature.', pageWidth / 2, y, { align: 'center' });
  doc.text('Please retain this receipt for your records.', pageWidth / 2, y + 5, { align: 'center' });

  // Footer
  doc.setDrawColor(220); doc.line(14, 285, pageWidth - 14, 285);
  doc.setTextColor(150); doc.setFontSize(8);
  doc.text('ShareeFund — Payment Receipt', pageWidth / 2, 291, { align: 'center' });

  doc.save(`receipt-${data.loan.code || data.loan.id.slice(0, 8)}-inst${data.installmentNumber}.pdf`);
}

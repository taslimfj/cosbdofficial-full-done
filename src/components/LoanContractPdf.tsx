import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { formatBDT } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  loan: any;
}

// Convert digit chars (0-9) in a string to Bengali numerals (০-৯).
const toBn = (val: string | number | null | undefined): string => {
  if (val === null || val === undefined) return '';
  const map = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
  return String(val).replace(/[0-9]/g, d => map[+d]);
};

export function LoanContractPdf({ loan }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const borrowerName = loan.borrower_name || loan.media_person?.full_name || '';
  const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
  const relPhone = loan.relative_phone || '';
  const productName = loan.product_name || '';
  const sellPrice = Number(loan.sell_price) || 0;
  const monthly = Number(loan.monthly_installment) || 0;
  const tenure = Number(loan.tenure_months) || 0;
  const startDate = loan.created_at ? new Date(loan.created_at) : new Date();
  const endDate = addMonths(startDate, tenure);
  const code = loan.code || '';

  const dueDateBn = `${toBn(format(endDate, 'dd'))}/${toBn(format(endDate, 'MM'))}/${toBn(format(endDate, 'yyyy'))}`;
  const startDateBn = format(startDate, 'dd/MM/yyyy');

  const handleDownload = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      // Make node visible off-screen for capture
      const node = ref.current;
      node.style.left = '0';
      node.style.top = '0';
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      node.style.left = '-10000px';
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
      const w = canvas.width * ratio;
      const h = canvas.height * ratio;
      pdf.addImage(imgData, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
      pdf.save(`contract-${code || 'loan'}.pdf`);
    } catch (e: any) {
      toast.error('PDF তৈরিতে সমস্যা: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleDownload} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
        চুক্তিপত্র PDF
      </Button>

      {/* Hidden contract template — rendered off-screen for html2canvas */}
      <div
        ref={ref}
        style={{
          position: 'fixed', left: '-10000px', top: 0,
          width: '794px', // ~ A4 @ 96dpi
          padding: '40px 50px',
          background: '#fff', color: '#111',
          fontFamily: '"Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Siyam Rupali", system-ui, sans-serif',
          fontSize: '14px', lineHeight: 1.7,
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #111', paddingBottom: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: '#666' }}>بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: 2, margin: '6px 0' }}>CIRCLE OF SUCCESS</h1>
          <div style={{ fontSize: 12, color: '#666' }}>Since : 2024</div>
        </div>

        {/* Date / ID */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18, fontSize: 14 }}>
          <span>Date : <b>{startDateBn}</b></span>
          <span>ID : <b>{code}</b></span>
        </div>

        {/* Title */}
        <h2 style={{ textAlign: 'center', fontSize: 22, fontWeight: 700, margin: '10px 0 22px' }}>
          ইসলামিক ঋণ চুক্তিনামা
        </h2>

        {/* Product / price / installment */}
        <div style={{ marginBottom: 6 }}>
          <b>পণ্য:</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 500, paddingLeft: 6 }}>{productName}</span>
        </div>
        <div style={{ marginBottom: 6 }}>
          <b>বিক্রয় মূল্য:</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 500, paddingLeft: 6 }}>{toBn(formatBDT(sellPrice))}</span>
        </div>
        <div style={{ marginBottom: 18 }}>
          <b>কিস্তির পরিমাণ:</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 220, paddingLeft: 6 }}>{toBn(formatBDT(monthly))}</span>
          <span style={{ marginLeft: 12 }}>মাসিক</span>
        </div>

        {/* Main clause */}
        <p style={{ textAlign: 'justify', margin: '18px 0' }}>
          <b style={{ borderBottom: '1px dotted #333', padding: '0 6px' }}>{borrowerName}</b>
          {' '}কে{' '}
          <b style={{ borderBottom: '1px dotted #333', padding: '0 6px' }}>{toBn(tenure)}</b>
          {' '}মাসের কিস্তি সুবিধা চুক্তিতে পণ্যটি বিক্রয় করা হলো। তিনি পণ্যটির সম্পূর্ণ মূল্য{' '}
          <b style={{ borderBottom: '1px dotted #333', padding: '0 6px' }}>{dueDateBn}</b>
          {' '}তারিখ এর মধ্যে পরিশোধ করিতে বাধ্য থাকিবেন অন্যথায় আইনানুগ ব্যবস্থা গ্রহণ করা হবে এবং এর সকল দায়ভার মাধ্যম গ্রহণ করিবে।
        </p>

        {/* Phones */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, gap: 30 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6 }}>
              <b>মোবাইল ১=</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 200, paddingLeft: 6 }}>{toBn(borrowerPhone)}</span>
            </div>
            <div>
              <b>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;২=</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 200, paddingLeft: 6 }}></span>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6 }}>
              <b>পারিবারিক সদস্য:</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 180, paddingLeft: 6 }}>{toBn(relPhone)}</span>
            </div>
            <div>
              <b>সম্পর্ক:</b> <span style={{ borderBottom: '1px dotted #333', display: 'inline-block', minWidth: 180, paddingLeft: 6 }}></span>
            </div>
          </div>
        </div>

        {/* Conditions */}
        <div style={{ marginTop: 24 }}>
          <b>শর্ত:</b>
          <ol style={{ paddingLeft: 20, margin: '6px 0' }}>
            <li>মাসিক ভিত্তিতে প্রতি মাসের ১০ তারিখের ভিতরে টাকা পরিশোধ করতে হবে।</li>
            <li>সাপ্তাহিক ভিত্তিতে প্রতি সপ্তাহের সোমবারের মধ্যে টাকা পরিশোধ করতে হবে।</li>
            <li>মোবাইল ব্যাংকিং এর মাধ্যমে পাঠালে বিকাশে হাজারে ১২ টাকা ৫০ পয়সা, নগদে ১৫ টাকা খরচ সহকারে পাঠাতে হবে।</li>
          </ol>
        </div>

        {/* Bank info */}
        <div style={{ marginTop: 18, fontSize: 13 }}>
          <b>ব্যাংক অ্যাকাউন্ট</b>
          <div>ইসলামী ব্যাংক বাংলাদেশ, বরিশাল শাখা</div>
          <div>নাম: Rahmatullah Mohamed Taslim</div>
          <div>অ্যাকাউন্ট নাম্বার: ২০৫০১১১৬৭০০৬৯৪৩০৫</div>
          <div>রাউটিং নাম্বার: ১২৫০৬০২৮৮</div>
          <div>Visa কার্ড নাম্বার: ৪১৭০৩৩১০১৬০১৩৩৯৮</div>
          <div>বিকাশ / নগদ : ০১৫৬৮০০৫৩৯৯</div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 60, gap: 30 }}>
          {['ক্রেতা', 'বিক্রেতা', 'মাধ্যম'].map(label => (
            <div key={label} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #111', paddingTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

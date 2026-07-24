import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Loader2 } from 'lucide-react';
import { formatBDT } from '@/lib/finance';
import { format, addMonths } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { BRAND, loadLogoDataUrl } from '@/lib/brand';

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
  const [defaults, setDefaults] = useState<Array<{ label: string; value: string }>>([]);
  const [logoUrl, setLogoUrl] = useState<string>('');

  useEffect(() => {
    (supabase as any)
      .from('payment_method_defaults')
      .select('label,value,sort_order')
      .order('sort_order')
      .then(({ data }: any) => {
        if (Array.isArray(data)) setDefaults(data);
      });
    loadLogoDataUrl().then(setLogoUrl).catch(() => {});
  }, []);

  const borrowerName = loan.borrower_name || loan.media_person?.full_name || '';
  const borrowerPhone = loan.borrower_phone || loan.media_person?.phone || '';
  const relPhone = loan.relative_phone || '';
  const relName = loan.relative_name || '';
  const relationship = loan.relationship || '';
  const productName = loan.product_name || '';
  const sellPrice = Number(loan.sell_price) || 0;
  const monthly = Number(loan.monthly_installment) || 0;
  const tenure = Number(loan.tenure_months) || 0;
  const startDate = loan.issue_date
    ? new Date(loan.issue_date + 'T00:00:00')
    : (loan.created_at ? new Date(loan.created_at) : new Date());
  const endDate = addMonths(startDate, tenure);
  const code = loan.code || '';

  const dueDateBn = `${toBn(format(endDate, 'dd'))}/${toBn(format(endDate, 'MM'))}/${toBn(format(endDate, 'yyyy'))}`;
  const startDateBn = `${toBn(format(startDate, 'dd'))}/${toBn(format(startDate, 'MM'))}/${toBn(format(startDate, 'yyyy'))}`;
  const generatedAt = format(new Date(), 'MMM d, yyyy h:mm a');

  const handleDownload = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const node = ref.current;
      node.style.left = '0';
      node.style.top = '0';
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      node.style.left = '-10000px';
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      // Fill the whole page (pad style) — width match, height scaled proportionally
      const w = pageW;
      const h = (canvas.height * pageW) / canvas.width;
      const y = h <= pageH ? 0 : 0;
      pdf.addImage(imgData, 'JPEG', 0, y, w, Math.min(h, pageH));
      pdf.save(`contract-${code || 'loan'}.pdf`);
    } catch (e: any) {
      toast.error('PDF তৈরিতে সমস্যা: ' + (e?.message || ''));
    } finally {
      setBusy(false);
    }
  };

  // A4 @ 96dpi ≈ 794 × 1123 px
  const PAGE_W = 794;
  const PAGE_H = 1123;

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
          width: `${PAGE_W}px`,
          height: `${PAGE_H}px`,
          background: '#ffffff',
          color: '#111',
          fontFamily: '"Noto Sans Bengali", "SolaimanLipi", "Kalpurush", "Siyam Rupali", system-ui, sans-serif',
          fontSize: '14px',
          lineHeight: 1.7,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: '40px 56px 32px',
        }}
      >
        {/* ===== Pad Header ===== */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {logoUrl && (
            <img src={logoUrl} alt="" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1, color: '#0f172a' }}>
              {BRAND.name}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
              {BRAND.slogan}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 10, color: '#64748b' }}>
            Generated: {generatedAt}
          </div>
        </div>
        <div style={{ height: 2, background: '#0f172a', marginTop: 10 }} />
        <div style={{ height: 1, background: '#0f172a', marginTop: 2, opacity: 0.35 }} />

        {/* ===== Body ===== */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', paddingTop: 22 }}>
          <div style={{ textAlign: 'center', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
            بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
          </div>
          <h2 style={{ textAlign: 'center', fontSize: 24, fontWeight: 700, margin: '4px 0 6px' }}>
            ইসলামিক ঋণ চুক্তিনামা
          </h2>
          <div style={{ width: 90, height: 3, background: '#0f172a', margin: '0 auto 22px', borderRadius: 2 }} />

          {/* Date / ID row */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 6,
            background: '#f8fafc', marginBottom: 20, fontSize: 13,
          }}>
            <span>তারিখ: <b>{startDateBn}</b></span>
            <span>চুক্তি নং: <b>{code || '—'}</b></span>
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', rowGap: 10, columnGap: 12, marginBottom: 18 }}>
            <div style={{ color: '#475569' }}>পণ্য</div>
            <div><b>{productName || '—'}</b></div>
            <div style={{ color: '#475569' }}>বিক্রয় মূল্য</div>
            <div><b>{toBn(formatBDT(sellPrice))}</b></div>
            <div style={{ color: '#475569' }}>মাসিক কিস্তি</div>
            <div><b>{toBn(formatBDT(monthly))}</b></div>
            <div style={{ color: '#475569' }}>মেয়াদ</div>
            <div><b>{toBn(tenure)} মাস</b></div>
            <div style={{ color: '#475569' }}>পরিশোধের শেষ তারিখ</div>
            <div><b>{dueDateBn}</b></div>
          </div>

          {/* Main clause */}
          <p style={{ textAlign: 'justify', margin: '6px 0 18px' }}>
            <b>{borrowerName}</b> কে <b>{toBn(tenure)}</b> মাসের কিস্তি সুবিধা চুক্তিতে উপরোক্ত পণ্যটি বিক্রয় করা হলো।
            তিনি পণ্যটির সম্পূর্ণ মূল্য <b>{dueDateBn}</b> তারিখের মধ্যে পরিশোধ করিতে বাধ্য থাকিবেন;
            অন্যথায় আইনানুগ ব্যবস্থা গ্রহণ করা হবে এবং এর সকল দায়ভার মাধ্যম গ্রহণ করিবে।
          </p>

          {/* Contacts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 4 }}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>ক্রেতার যোগাযোগ</div>
              <div style={{ marginBottom: 4 }}>
                মোবাইল: <b style={{ paddingLeft: 6 }}>{toBn(borrowerPhone) || '—'}</b>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6, color: '#0f172a' }}>পারিবারিক সদস্য</div>
              <div style={{ marginBottom: 4 }}>
                নাম: <b style={{ paddingLeft: 6 }}>{relName || '—'}</b>
              </div>
              <div style={{ marginBottom: 4 }}>
                মোবাইল: <b style={{ paddingLeft: 6 }}>{toBn(relPhone) || '—'}</b>
              </div>
              <div>
                সম্পর্ক: <b style={{ paddingLeft: 6 }}>{relationship || '—'}</b>
              </div>
            </div>
          </div>

          {/* Condition */}
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>শর্ত</div>
            <ol style={{ paddingLeft: 22, margin: 0 }}>
              <li>মোবাইল ব্যাংকিং এর মাধ্যমে পাঠালে বিকাশে হাজারে ১২ টাকা ৫০ পয়সা, নগদে ১৫ টাকা খরচ সহকারে পাঠাতে হবে।</li>
            </ol>
          </div>

          {/* Payment defaults */}
          {defaults.length > 0 && (
            <div style={{
              marginTop: 18, padding: '10px 14px', border: '1px solid #e2e8f0',
              borderRadius: 6, background: '#f8fafc', fontSize: 13,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#0f172a' }}>পেমেন্ট মাধ্যম</div>
              {defaults.map((d, i) => (
                <div key={i}>{d.label}: <b>{toBn(d.value)}</b></div>
              ))}
            </div>
          )}

          {/* Spacer pushes signatures to bottom */}
          <div style={{ flex: 1 }} />

          {/* Signatures — pinned near the bottom */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 30, marginTop: 40 }}>
            {['ক্রেতা', 'বিক্রেতা', 'মাধ্যম'].map(label => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ borderTop: '1px solid #0f172a', paddingTop: 6, fontSize: 13 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== Pad Footer ===== */}
        <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 14, paddingTop: 8, textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>
          {BRAND.name} — {BRAND.slogan}
        </div>
      </div>
    </>
  );
}

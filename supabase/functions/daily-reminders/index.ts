// Daily reminders cron job.
// Called by pg_cron twice daily. Inserts notifications, which auto-fire push.
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Bangladesh time = UTC+6
function bdNow(): Date {
  const now = new Date();
  return new Date(now.getTime() + 6 * 60 * 60 * 1000);
}
function ym(d: Date) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }
function fmtDate(d: Date) {
  return d.toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Dhaka' });
}
function lastDayOfMonth(y: number, mZero: number) { return new Date(Date.UTC(y, mZero + 1, 0)); }

async function insertNotifs(sb: any, rows: any[]) {
  if (!rows.length) return;
  // Dedup via tag: don't insert if same tag exists for user in last 12h.
  const filtered: any[] = [];
  for (const r of rows) {
    if (!r.tag) { filtered.push(r); continue; }
    const { data } = await sb.from('notifications')
      .select('id').eq('user_id', r.user_id).eq('tag', r.tag)
      .gte('created_at', new Date(Date.now() - 12 * 3600 * 1000).toISOString()).limit(1);
    if (!data || data.length === 0) filtered.push(r);
  }
  if (filtered.length) await sb.from('notifications').insert(filtered);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Require shared secret (set on the pg_cron http_post header as x-cron-secret)
    const { data: expected } = await sb.rpc('get_internal_secret', { _name: 'cron_secret' });
    const provided = req.headers.get('x-cron-secret') || '';
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const now = bdNow();
    const dayOfMonth = now.getUTCDate();
    const monthKey = ym(now);
    const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

    const rows: any[] = [];

    // --- Members + admin: monthly installment reminders ---
    const { data: memberIds } = await sb.from('user_roles').select('user_id, role').in('role', ['admin', 'member']);
    const allMemberUserIds = (memberIds || []).map((r: any) => r.user_id);

    // Approved deposits this calendar month
    const { data: monthDeposits } = await sb.from('deposits')
      .select('member_id')
      .eq('status', 'approved')
      .gte('month_year', monthStart);
    const paidThisMonth = new Set((monthDeposits || []).map((d: any) => d.member_id));

    if (dayOfMonth === 1) {
      for (const uid of allMemberUserIds) {
        rows.push({
          user_id: uid,
          title: 'নতুন মাস শুরু',
          message: 'নতুন মাস শুরু হয়ে গেছে — এই মাসের installment জমা দিন।',
          url: '/',
          tag: `month-start-${monthKey}`,
        });
      }
    }
    if (dayOfMonth >= 16) {
      for (const uid of allMemberUserIds) {
        if (!paidThisMonth.has(uid)) {
          rows.push({
            user_id: uid,
            title: '১৫ তারিখ অতিবাহিত',
            message: '১৫ তারিখ পার হয়ে গেছে, আপনি এখনো এই মাসের installment জমা দেননি।',
            url: '/',
            tag: `mid-month-${monthKey}`,
          });
        }
      }
    }

    // --- Customer islamic-loan reminders ---
    const { data: loans } = await sb.from('islamic_loans')
      .select('id, code, customer_user_id, monthly_installment, remaining_amount, status')
      .eq('status', 'active')
      .not('customer_user_id', 'is', null);

    const yEnd = now.getUTCFullYear();
    const mZeroEnd = now.getUTCMonth();
    const dueDate = lastDayOfMonth(yEnd, mZeroEnd);
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));

    // Previous month window (for overdue warnings)
    const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const thisMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevDue = lastDayOfMonth(prevMonthStart.getUTCFullYear(), prevMonthStart.getUTCMonth());
    const prevKey = ym(prevMonthStart);

    for (const l of (loans || [])) {
      const monthlyAmount = Math.min(Number(l.monthly_installment || 0), Number(l.remaining_amount || 0));
      if (monthlyAmount <= 0) continue;

      const uid = l.customer_user_id;
      const link = `/islamic-loans/${l.id}`;
      const dueStr = fmtDate(dueDate);

      const { data: allPaidRows } = await sb.from('islamic_loan_payments')
        .select('amount, created_at')
        .eq('loan_id', l.id)
        .gte('created_at', prevMonthStart.toISOString());
      const rowsPrev = (allPaidRows || []).filter((r: any) => new Date(r.created_at) < thisMonthStart);
      const rowsThis = (allPaidRows || []).filter((r: any) => new Date(r.created_at) >= thisMonthStart);
      const paidPrev = rowsPrev.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const paidAmount = rowsThis.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      // Overdue warning: previous month's installment was not paid
      if (paidPrev < monthlyAmount) {
        rows.push({
          user_id: uid,
          title: '⚠️ কিস্তি বকেয়া',
          message: `Loan ${l.code || ''} — ${fmtDate(prevDue)} তারিখের মধ্যে আপনি ৳${Math.max(0, monthlyAmount - paidPrev).toLocaleString('en-IN')} কিস্তিটি পরিশোধ করেননি। অনুগ্রহ করে যত দ্রুত সম্ভব পরিশোধ করুন, অন্যথায় যথাযথ আইনানুগ ব্যবস্থা গ্রহণ করা হবে।`,
          url: link,
          tag: `cust-overdue-${l.id}-${prevKey}-${dayOfMonth}`,
        });
      }

      if (paidAmount >= monthlyAmount) continue; // এই মাসের কিস্তি পরিশোধ হয়ে গেছে
      const remaining = Math.max(0, monthlyAmount - paidAmount);

      // মাসের ১ তারিখে: এই মাসের কিস্তির পরিমাণ
      if (dayOfMonth === 1) {
        rows.push({
          user_id: uid,
          title: 'এই মাসের কিস্তি',
          message: `Loan ${l.code || ''} — এই মাসে আপনার ৳${remaining.toLocaleString('en-IN')} কিস্তি পরিশোধ করতে হবে। শেষ তারিখ: ${dueStr}।`,
          url: link,
          tag: `cust-month-start-${l.id}-${monthKey}`,
        });
        continue;
      }

      // শেষ তারিখের ৫ দিন আগে থেকে → দিনে দুইবার
      if (daysUntilDue >= 0 && daysUntilDue <= 5) {
        rows.push({
          user_id: uid,
          title: '⏰ কিস্তি পরিশোধের সময়',
          message: `Loan ${l.code || ''} — আপনার এই মাসের ৳${remaining.toLocaleString('en-IN')} কিস্তি বাকি আছে। পরিশোধের শেষ তারিখ: ${dueStr}।`,
          url: link,
          // tag নেই → দিনে দুইবার পাঠানো যায়
        });
      }
    }


    await insertNotifs(sb, rows);
    return new Response(JSON.stringify({ inserted: rows.length, dayOfMonth, daysUntilDue }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('daily-reminders error', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

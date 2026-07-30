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
function addMonthsClamped(dateText: string, months: number) {
  const [year, month, day] = dateText.slice(0, 10).split('-').map(Number);
  const targetFirst = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth(), Math.min(day, lastDay)));
}

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
      .select('id, code, customer_user_id, monthly_installment, remaining_amount, status, issue_date, created_at, tenure_months')
      .eq('status', 'active')
      .not('customer_user_id', 'is', null);

    let lastDaysUntilDue: number | null = null;

    for (const l of (loans || [])) {
      const monthlyAmount = Math.min(Number(l.monthly_installment || 0), Number(l.remaining_amount || 0));
      if (monthlyAmount <= 0) continue;

      const uid = l.customer_user_id;
      const link = `/islamic-loans/${l.id}`;
      const issueText = String(l.issue_date || l.created_at).slice(0, 10);
      const issueDate = new Date(`${issueText}T00:00:00Z`);
      if (now < issueDate) continue;

      const elapsedMonths = Math.max(0,
        (now.getUTCFullYear() - issueDate.getUTCFullYear()) * 12 +
        (now.getUTCMonth() - issueDate.getUTCMonth()));
      let installmentNo = Math.max(1, elapsedMonths);
      let dueDate = addMonthsClamped(issueText, installmentNo);
      if (now.getTime() > dueDate.getTime()) {
        installmentNo += 1;
        dueDate = addMonthsClamped(issueText, installmentNo);
      }
      installmentNo = Math.min(installmentNo, Number(l.tenure_months || installmentNo));
      dueDate = addMonthsClamped(issueText, installmentNo);
      const cycleStart = installmentNo === 1 ? issueDate : addMonthsClamped(issueText, installmentNo - 1);
      const previousCycleStart = installmentNo <= 1 ? null : addMonthsClamped(issueText, installmentNo - 2);
      const previousDue = installmentNo <= 1 ? null : cycleStart;
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 3600 * 1000));
      lastDaysUntilDue = daysUntilDue;
      const dueStr = fmtDate(dueDate);

      const { data: allPaidRows } = await sb.from('islamic_loan_payments')
        .select('amount, payment_date, created_at, payment_type')
        .eq('loan_id', l.id)
        .neq('payment_type', 'advance');
      const paidDate = (r: any) => new Date(`${String(r.payment_date || r.created_at).slice(0, 10)}T00:00:00Z`);
      const rowsThis = (allPaidRows || []).filter((r: any) => {
        const d = paidDate(r);
        return d >= cycleStart && d <= dueDate;
      });
      const rowsPrev = previousCycleStart && previousDue ? (allPaidRows || []).filter((r: any) => {
        const d = paidDate(r);
        return d >= previousCycleStart && d < previousDue;
      }) : [];
      const paidPrev = rowsPrev.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const paidAmount = rowsThis.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      // Overdue warning: previous month's installment was not paid
      if (previousDue && paidPrev < monthlyAmount) {
        const previousKey = `${previousDue.getUTCFullYear()}-${String(previousDue.getUTCMonth() + 1).padStart(2, '0')}-${String(previousDue.getUTCDate()).padStart(2, '0')}`;
        rows.push({
          user_id: uid,
          title: '⚠️ কিস্তি বকেয়া',
          message: `Loan ${l.code || ''} — ${fmtDate(previousDue)} তারিখের মধ্যে আপনি ৳${Math.max(0, monthlyAmount - paidPrev).toLocaleString('en-IN')} কিস্তিটি পরিশোধ করেননি। অনুগ্রহ করে যত দ্রুত সম্ভব পরিশোধ করুন, অন্যথায় যথাযথ আইনানুগ ব্যবস্থা গ্রহণ করা হবে।`,
          url: link,
          tag: `cust-overdue-${l.id}-${previousKey}-${dayOfMonth}`,
        });
      }

      if (paidAmount >= monthlyAmount) continue; // এই মাসের কিস্তি পরিশোধ হয়ে গেছে
      const remaining = Math.max(0, monthlyAmount - paidAmount);

      // মাসের ১ তারিখে: এই মাসের কিস্তির পরিমাণ
      if (now.getUTCDate() === cycleStart.getUTCDate() && now.getUTCMonth() === cycleStart.getUTCMonth()) {
        rows.push({
          user_id: uid,
          title: 'এই মাসের কিস্তি',
          message: `Loan ${l.code || ''} — এই মাসে আপনার ৳${remaining.toLocaleString('en-IN')} কিস্তি পরিশোধ করতে হবে। শেষ তারিখ: ${dueStr}।`,
          url: link,
          tag: `cust-cycle-start-${l.id}-${installmentNo}`,
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
    return new Response(JSON.stringify({ inserted: rows.length, dayOfMonth, daysUntilDue: lastDaysUntilDue }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('daily-reminders error', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

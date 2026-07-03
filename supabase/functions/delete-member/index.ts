import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function must<T>(result: PromiseLike<{ data: T; error: any }> | { data: T; error: any }) {
  const awaited = await result;
  if (awaited.error) throw awaited.error;
  return awaited.data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authenticate caller
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = userData.user.id;

    // Caller must be admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) {
      return json({ error: "Admin only" }, 403);
    }

    const { memberId, loanPaymentConfirmed } = await req.json();
    if (!memberId || typeof memberId !== "string") {
      return json({ error: "memberId required" }, 400);
    }
    if (memberId === callerId) {
      return json({ error: "Cannot delete yourself" }, 400);
    }

    // 1. Personal loans must be marked paid/confirmed before deletion
    const { data: mLoans } = await admin
      .from("member_loans")
      .select("id, requested_amount, approved_amount, repaid_amount, status")
      .eq("member_id", memberId);
    const outstandingTotal = (mLoans || []).reduce((sum: number, loan: any) => {
      if (!["approved", "pending"].includes(loan.status)) return sum;
      const principal = Number(loan.approved_amount || loan.requested_amount || 0);
      const repaid = Number(loan.repaid_amount || 0);
      return sum + Math.max(0, principal - repaid);
    }, 0);

    if (outstandingTotal > 0 && loanPaymentConfirmed !== true) {
      return json({
        error: `Personal loan must be paid before deletion. Outstanding: ${outstandingTotal}`,
      }, 400);
    }

    // 2. Wipe child rows that don't cascade
    // member_loan_repayments via member_loans
    const mLoanIds = (mLoans || []).map((l: any) => l.id);
    if (mLoanIds.length) {
      await must(admin.from("member_loan_repayments").delete().in("loan_id", mLoanIds));
    }

    // islamic loan payments via islamic_loans (where this user is customer)
    const { data: iLoans } = await admin.from("islamic_loans").select("id").eq("customer_user_id", memberId);
    const iLoanIds = (iLoans || []).map((l: any) => l.id);
    if (iLoanIds.length) {
      await must(admin.from("islamic_loan_payments").delete().in("loan_id", iLoanIds));
      await must(admin.from("islamic_loan_member_shares").delete().in("loan_id", iLoanIds));
      await must(admin.from("islamic_loans").delete().in("id", iLoanIds));
    }

    // Null-out FKs that don't cascade
    await must(admin.from("islamic_loans").update({ media_person_id: null }).eq("media_person_id", memberId));
    await must(admin.from("projects").update({ manager_id: null }).eq("manager_id", memberId));
    await must(admin.from("projects").update({ secondary_manager_id: null }).eq("secondary_manager_id", memberId));
    await must(admin.from("project_member_shares")
      .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
      .eq("member_id", memberId));
    await must(admin.from("islamic_loan_member_shares")
      .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
      .eq("member_id", memberId));

    // Direct deletes
    await must(admin.from("profit_distributions").delete().eq("member_id", memberId));
    await must(admin.from("deposits").delete().eq("member_id", memberId));
    await must(admin.from("member_loans").delete().eq("member_id", memberId));
    await must(admin.from("customer_payment_requests").delete().eq("customer_id", memberId));
    await must(admin.from("project_fund_requests").delete().eq("requested_by", memberId));
    await must(admin.from("notifications").delete().eq("user_id", memberId));
    await must(admin.from("user_roles").delete().eq("user_id", memberId));
    await must(admin.from("phone_book").delete().eq("user_id", memberId));

    // Delete the login account. Do not report success unless auth deletion succeeds.
    let { error: delErr } = await admin.auth.admin.deleteUser(memberId);
    if (delErr) {
      await must(admin.from("profiles").delete().eq("id", memberId));
      const retry = await admin.auth.admin.deleteUser(memberId);
      delErr = retry.error;
    }

    if (delErr) {
      throw new Error(`Login account could not be deleted: ${delErr.message}`);
    }

    const { data: verifyData, error: verifyError } = await admin.auth.admin.getUserById(memberId);
    if (!verifyError && verifyData?.user) {
      throw new Error("Login account still exists. Delete was not completed.");
    }

    return json({ success: true });
  } catch (error: any) {
    return json({ error: error?.message ?? String(error) }, 400);
  }
});

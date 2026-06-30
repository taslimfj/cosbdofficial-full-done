import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { memberId } = await req.json();
    if (!memberId || typeof memberId !== "string") {
      return new Response(JSON.stringify({ error: "memberId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (memberId === callerId) {
      return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Wipe child rows that don't cascade
    // member_loan_repayments via member_loans
    const { data: mLoans } = await admin.from("member_loans").select("id").eq("member_id", memberId);
    const mLoanIds = (mLoans || []).map((l: any) => l.id);
    if (mLoanIds.length) {
      await admin.from("member_loan_repayments").delete().in("loan_id", mLoanIds);
    }

    // islamic loan payments via islamic_loans (where this user is customer)
    const { data: iLoans } = await admin.from("islamic_loans").select("id").eq("customer_user_id", memberId);
    const iLoanIds = (iLoans || []).map((l: any) => l.id);
    if (iLoanIds.length) {
      await admin.from("islamic_loan_payments").delete().in("loan_id", iLoanIds);
      await admin.from("islamic_loan_member_shares").delete().in("loan_id", iLoanIds);
      await admin.from("islamic_loans").delete().in("id", iLoanIds);
    }

    // Null-out FKs that don't cascade
    await admin.from("islamic_loans").update({ media_person_id: null }).eq("media_person_id", memberId);
    await admin.from("projects").update({ manager_id: null }).eq("manager_id", memberId);
    await admin.from("projects").update({ secondary_manager_id: null }).eq("secondary_manager_id", memberId);
    await admin.from("project_member_shares").update({ member_id: null }).eq("member_id", memberId);
    await admin.from("islamic_loan_member_shares").update({ member_id: null }).eq("member_id", memberId);

    // Direct deletes
    await admin.from("profit_distributions").delete().eq("member_id", memberId);
    await admin.from("deposits").delete().eq("member_id", memberId);
    await admin.from("member_loans").delete().eq("member_id", memberId);
    await admin.from("customer_payment_requests").delete().eq("customer_id", memberId);
    await admin.from("project_fund_requests").delete().eq("requested_by", memberId);
    await admin.from("notifications").delete().eq("user_id", memberId);
    await admin.from("user_roles").delete().eq("user_id", memberId);
    await admin.from("phone_book").delete().eq("user_id", memberId);

    // 2. Delete auth user (cascades profile via FK)
    const { error: delErr } = await admin.auth.admin.deleteUser(memberId);
    if (delErr) {
      // Fall back: delete profile directly
      await admin.from("profiles").delete().eq("id", memberId);
      // Try again
      await admin.auth.admin.deleteUser(memberId).catch(() => {});
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

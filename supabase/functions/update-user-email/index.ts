import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.24.1";


const BodySchema = z.object({
  email: z.string().trim().email().max(254),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function cleanupStaleUser(admin: any, userId: string) {
  const run = async (label: string, fn: () => Promise<any>) => {
    try {
      const res = await fn();
      if (res?.error) {
        console.error(`[cleanup:${label}] error`, res.error);
      }
      return res;
    } catch (e) {
      console.error(`[cleanup:${label}] throw`, e);
      throw new Error(`cleanup step '${label}' failed: ${(e as any)?.message || JSON.stringify(e)}`);
    }
  };

  await run("islamic_loans.media", () => admin.from("islamic_loans").update({ media_person_id: null }).eq("media_person_id", userId));
  await run("projects.manager", () => admin.from("projects").update({ manager_id: null }).eq("manager_id", userId));
  await run("projects.secondary", () => admin.from("projects").update({ secondary_manager_id: null }).eq("secondary_manager_id", userId));
  await run("project_member_shares", () => admin.from("project_member_shares")
    .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
    .eq("member_id", userId));
  await run("islamic_loan_member_shares.upd", () => admin.from("islamic_loan_member_shares")
    .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
    .eq("member_id", userId));

  const { data: islamicLoans } = await run("islamic_loans.select", () => admin.from("islamic_loans").select("id").eq("customer_user_id", userId));
  const islamicLoanIds = (islamicLoans || []).map((loan: any) => loan.id);
  if (islamicLoanIds.length) {
    await run("islamic_loan_payments.del", () => admin.from("islamic_loan_payments").delete().in("loan_id", islamicLoanIds));
    await run("islamic_loan_member_shares.del", () => admin.from("islamic_loan_member_shares").delete().in("loan_id", islamicLoanIds));
    await run("islamic_loans.del", () => admin.from("islamic_loans").delete().in("id", islamicLoanIds));
  }

  const { data: memberLoans } = await run("member_loans.select", () => admin.from("member_loans").select("id").eq("member_id", userId));
  const memberLoanIds = (memberLoans || []).map((loan: any) => loan.id);
  if (memberLoanIds.length) await run("member_loan_repayments.del", () => admin.from("member_loan_repayments").delete().in("loan_id", memberLoanIds));

  await run("profit_distributions.del", () => admin.from("profit_distributions").delete().eq("member_id", userId));
  await run("deposits.del", () => admin.from("deposits").delete().eq("member_id", userId));
  await run("member_loans.del", () => admin.from("member_loans").delete().eq("member_id", userId));
  await run("customer_payment_requests.del", () => admin.from("customer_payment_requests").delete().eq("customer_user_id", userId));
  await run("project_fund_requests.del", () => admin.from("project_fund_requests").delete().eq("requested_by", userId));
  await run("notifications.del", () => admin.from("notifications").delete().eq("user_id", userId));
  await run("user_roles.del", () => admin.from("user_roles").delete().eq("user_id", userId));
  await run("phone_book.del", () => admin.from("phone_book").delete().eq("created_by", userId));
  await run("assets.del", () => admin.from("assets").delete().eq("created_by", userId));
  await run("fund_transactions.del", () => admin.from("fund_transactions").delete().eq("created_by", userId));
  await run("project_transactions.del", () => admin.from("project_transactions").delete().eq("created_by", userId));
  await run("tutorials.del", () => admin.from("tutorials").delete().eq("created_by", userId));
  await run("project_fund_requests.decided.null", () => admin.from("project_fund_requests").update({ decided_by: null }).eq("decided_by", userId));
  await run("profiles.del", () => admin.from("profiles").delete().eq("id", userId));

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser failed: ${error.message || JSON.stringify(error)}`);
}



Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let step = "init";
  try {
    step = "create-admin-client";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    step = "read-token";
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    step = "getUser";
    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Unauthorized", step, callerError }, 401);

    step = "parse-body";
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: "Valid email required" }, 400);

    const targetEmail = parsed.data.email.toLowerCase();
    const currentUserId = callerData.user.id;
    const currentEmail = callerData.user.email?.toLowerCase();

    if (targetEmail === currentEmail) {
      return json({ success: true, unchanged: true });
    }

    step = "list-users";
    let matchedUser: any | null = null;
    for (let page = 1; page <= 10; page += 1) {
      const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) throw listError;
      matchedUser = usersData.users.find((user: any) => user.email?.toLowerCase() === targetEmail) || null;
      if (matchedUser || usersData.users.length < 1000) break;
    }

    if (matchedUser && matchedUser.id !== currentUserId) {
      step = "check-profile";
      const { data: profile } = await admin
        .from("profiles")
        .select("id, is_deleted")
        .eq("id", matchedUser.id)
        .maybeSingle();

      if (profile && !profile.is_deleted) {
        return json({ error: "এই ইমেইলটি অন্য active account-এ ব্যবহার হচ্ছে।" }, 409);
      }

      step = "cleanup-stale";
      await cleanupStaleUser(admin, matchedUser.id);
    }

    step = "update-user";
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(currentUserId, {
      email: targetEmail,
      email_confirm: true,
    });
    if (updateError) throw updateError;

    return json({ success: true, email: updated.user?.email || targetEmail });

  } catch (error: any) {
    console.error("update-user-email error:", error);
    const message =
      error?.message ||
      error?.error_description ||
      error?.msg ||
      (typeof error === "string" ? error : null) ||
      JSON.stringify(error, Object.getOwnPropertyNames(error || {})) ||
      "Unknown error";
    return json({ error: message, step, details: error }, 400);
  }
});
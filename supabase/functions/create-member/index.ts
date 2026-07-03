import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.24.1";

const BodySchema = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(4).max(32),
});

const defaultPassword = "123456";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const { data: callerData, error: callerError } = await admin.auth.getUser(token);
    if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401);

    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Admin only" }, 403);

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

    const { fullName, phone } = parsed.data;
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 4) return json({ error: "Invalid phone number" }, 400);

    const email = `${digits}@sharee.local`;

    const { data: activeProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .eq("is_deleted", false)
      .eq("is_customer", false)
      .maybeSingle();
    if (activeProfile?.id) {
      return json({ error: "এই ফোন নম্বরে একটি active member account আছে।" }, 409);
    }

    let existingUserId: string | null = null;
    for (let page = 1; page <= 10; page += 1) {
      const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listError) throw listError;
      const found = usersData.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
      if (found) {
        existingUserId = found.id;
        break;
      }
      if (usersData.users.length < 1000) break;
    }

    if (existingUserId) {
      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id, is_deleted, is_customer")
        .eq("id", existingUserId)
        .maybeSingle();

      if (existingProfile && !existingProfile.is_deleted) {
        return json({ error: "এই login information দিয়ে একটি active account আছে।" }, 409);
      }

      await admin.from("islamic_loans").update({ media_person_id: null }).eq("media_person_id", existingUserId);
      await admin.from("projects").update({ manager_id: null }).eq("manager_id", existingUserId);
      await admin.from("projects").update({ secondary_manager_id: null }).eq("secondary_manager_id", existingUserId);
      await admin.from("project_member_shares")
        .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
        .eq("member_id", existingUserId);
      await admin.from("islamic_loan_member_shares")
        .update({ member_id: null, member_name: "Deleted Member", is_member_deleted: true })
        .eq("member_id", existingUserId);

      const { data: staleIslamicLoans } = await admin.from("islamic_loans").select("id").eq("customer_user_id", existingUserId);
      const staleIslamicLoanIds = (staleIslamicLoans || []).map((loan: any) => loan.id);
      if (staleIslamicLoanIds.length) {
        await admin.from("islamic_loan_payments").delete().in("loan_id", staleIslamicLoanIds);
        await admin.from("islamic_loan_member_shares").delete().in("loan_id", staleIslamicLoanIds);
        await admin.from("islamic_loans").delete().in("id", staleIslamicLoanIds);
      }

      const { data: staleLoans } = await admin.from("member_loans").select("id").eq("member_id", existingUserId);
      const staleLoanIds = (staleLoans || []).map((loan: any) => loan.id);
      if (staleLoanIds.length) await admin.from("member_loan_repayments").delete().in("loan_id", staleLoanIds);
      await admin.from("profit_distributions").delete().eq("member_id", existingUserId);
      await admin.from("deposits").delete().eq("member_id", existingUserId);
      await admin.from("member_loans").delete().eq("member_id", existingUserId);
      await admin.from("customer_payment_requests").delete().eq("customer_user_id", existingUserId);
      await admin.from("project_fund_requests").delete().eq("requested_by", existingUserId);
      await admin.from("notifications").delete().eq("user_id", existingUserId);
      await admin.from("user_roles").delete().eq("user_id", existingUserId);
      await admin.from("phone_book").delete().eq("user_id", existingUserId);
      await admin.from("profiles").delete().eq("id", existingUserId);

      const { error: staleDeleteError } = await admin.auth.admin.deleteUser(existingUserId);
      if (staleDeleteError) throw staleDeleteError;
    }

    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone, role: "member", is_customer: false },
    });
    if (createError) throw createError;
    if (!userData.user?.id) throw new Error("Member account could not be created");

    const { error: profileError } = await admin.from("profiles").upsert({
      id: userData.user.id,
      full_name: fullName,
      phone,
      is_customer: false,
      is_deleted: false,
      deleted_name: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: roleError } = await admin
      .from("user_roles")
      .upsert({ user_id: userData.user.id, role: "member" }, { onConflict: "user_id,role" });
    if (roleError) throw roleError;

    return json({ success: true, userId: userData.user.id, password: defaultPassword });
  } catch (error: any) {
    return json({ error: error?.message ?? String(error) }, 400);
  }
});
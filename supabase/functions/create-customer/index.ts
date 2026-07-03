import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { phone, fullName } = await req.json();
    if (!phone || typeof phone !== "string") {
      return new Response(JSON.stringify({ error: "phone required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const digits = phone.replace(/[^0-9]/g, "");
    if (digits.length < 4) {
      return new Response(JSON.stringify({ error: `invalid phone: "${phone}" (${digits.length} digits)` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = `${digits}@sharee.local`;
    const password = "123456";

    // Check existing user
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .eq("is_customer", true)
      .maybeSingle();

    if (existing?.id) {
      return new Response(JSON.stringify({ success: true, userId: existing.id, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      phone: undefined,
      user_metadata: {
        full_name: fullName || phone,
        phone,
        role: "member", // role is 'member' but is_customer=true distinguishes
        is_customer: true,
      },
    });

    if (createError && `${createError.message}`.toLowerCase().includes("already")) {
      let foundId: string | null = null;
      for (let page = 1; page <= 10; page += 1) {
        const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (listError) throw listError;
        const found = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (found) {
          foundId = found.id;
          break;
        }
        if (list.users.length < 1000) break;
      }

      if (foundId) {
        const { data: existingProfile } = await supabaseAdmin
          .from("profiles")
          .select("id, is_deleted, is_customer")
          .eq("id", foundId)
          .maybeSingle();

        if (existingProfile && !existingProfile.is_deleted && existingProfile.is_customer) {
          return new Response(JSON.stringify({ success: true, userId: foundId, reused: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (existingProfile && !existingProfile.is_deleted && !existingProfile.is_customer) {
          return new Response(JSON.stringify({ error: "এই login information দিয়ে একটি active member account আছে।" }), {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin.from("customer_payment_requests").delete().eq("customer_user_id", foundId);
        await supabaseAdmin.from("notifications").delete().eq("user_id", foundId);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", foundId);
        await supabaseAdmin.from("phone_book").delete().eq("created_by", foundId);
        await supabaseAdmin.from("profiles").delete().eq("id", foundId);
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(foundId);
        if (deleteError) throw deleteError;

        const retry = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          phone: undefined,
          user_metadata: {
            full_name: fullName || phone,
            phone,
            role: "member",
            is_customer: true,
          },
        });
        userData = retry.data;
        createError = retry.error;
      }
    }

    if (createError) throw createError;

    return new Response(JSON.stringify({ success: true, userId: userData.user?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? String(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

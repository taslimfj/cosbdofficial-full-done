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

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
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

    if (createError) {
      // If user already exists in auth but not in profiles, try fetching
      if (`${createError.message}`.toLowerCase().includes("already")) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const found = list.users.find((u) => u.email === email);
        if (found) {
          return new Response(JSON.stringify({ success: true, userId: found.id, reused: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      throw createError;
    }

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

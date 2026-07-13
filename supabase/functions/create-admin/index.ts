import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth: require caller to be admin, unless no admin exists yet (bootstrap).
    const { count: adminCount } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true })
      .eq("role", "admin");

    const isBootstrap = !adminCount || adminCount === 0;

    if (!isBootstrap) {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return json({ error: "Unauthorized" }, 401);

      const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
      if (callerError || !callerData.user) return json({ error: "Unauthorized" }, 401);

      const { data: roleRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", callerData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!roleRow) return json({ error: "Admin only" }, 403);
    }

    const { email, password, fullName, role } = await req.json();
    if (!email || !password || !fullName) {
      return json({ error: "email, password, fullName required" }, 400);
    }

    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "admin", is_customer: false },
    });
    if (createError) throw createError;

    if (role === "admin" && userData.user) {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .upsert([
          { user_id: userData.user.id, role: "admin" },
          { user_id: userData.user.id, role: "member" },
        ], { onConflict: "user_id,role" });
      if (roleError) throw roleError;
    }

    return json({ success: true, userId: userData.user?.id });
  } catch (error: any) {
    return json({ error: error?.message ?? String(error) }, 400);
  }
});

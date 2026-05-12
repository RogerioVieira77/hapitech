import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Check caller is owner or admin of an org
    const { data: membership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", caller.id)
      .single();

    if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Sem permissão para convidar membros" }), { status: 403, headers: corsHeaders });
    }

    const { name, email, role } = await req.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Nome e email são obrigatórios" }), { status: 400, headers: corsHeaders });
    }

    const memberRole = role || "member";
    if (!["admin", "member"].includes(memberRole)) {
      return new Response(JSON.stringify({ error: "Role inválida" }), { status: 400, headers: corsHeaders });
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email.toLowerCase());

    let userId: string;

    if (existingUser) {
      // Check if already a member
      const { data: existingMember } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("organization_id", membership.organization_id)
        .eq("user_id", existingUser.id)
        .maybeSingle();

      if (existingMember) {
        return new Response(JSON.stringify({ error: "Usuário já é membro desta organização" }), { status: 400, headers: corsHeaders });
      }

      userId = existingUser.id;
    } else {
      // Invite new user
      const siteUrl = Deno.env.get("SITE_URL") || "https://bot-mastermind-suite.lovable.app";
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: name },
        redirectTo: `${siteUrl}/auth`,
      });

      if (inviteErr) {
        return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400, headers: corsHeaders });
      }

      userId = inviteData.user.id;

      // Create profile
      await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        display_name: name,
      });
    }

    // Add as org member
    const { error: memberErr } = await supabaseAdmin
      .from("organization_members")
      .insert({
        organization_id: membership.organization_id,
        user_id: userId,
        role: memberRole,
      });

    if (memberErr) {
      return new Response(JSON.stringify({ error: memberErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

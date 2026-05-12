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

    // Verify caller is authenticated and is super_admin or admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !caller) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: isSuperAdmin } = await supabaseAdmin.rpc("has_role", { _user_id: caller.id, _role: "super_admin" });
    const { data: isOrgAdmin } = await supabaseAdmin.rpc("has_org_role", { _user_id: caller.id, _role: "owner" });
    const { data: isOrgAdminRole } = await supabaseAdmin.rpc("has_org_role", { _user_id: caller.id, _role: "admin" });
    if (!isSuperAdmin && !isOrgAdmin && !isOrgAdminRole) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });

    // Handle DELETE - remove team member
    if (req.method === "DELETE") {
      const { user_id } = await req.json();
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), { status: 400, headers: corsHeaders });
      }

      // Don't allow deleting yourself
      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Você não pode remover a si mesmo" }), { status: 400, headers: corsHeaders });
      }

      // Delete user roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);

      // Delete profile
      await supabaseAdmin.from("profiles").delete().eq("user_id", user_id);

      // Delete user from auth
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(user_id);
      if (deleteErr) {
        return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle PATCH - update member role
    if (req.method === "PATCH") {
      const { user_id, role } = await req.json();
      if (!user_id || !role) {
        return new Response(JSON.stringify({ error: "user_id e role são obrigatórios" }), { status: 400, headers: corsHeaders });
      }

      if (user_id === caller.id) {
        return new Response(JSON.stringify({ error: "Você não pode alterar seu próprio papel" }), { status: 400, headers: corsHeaders });
      }

      // Update user_roles
      await supabaseAdmin.from("user_roles").delete().eq("user_id", user_id);
      if (role !== "user") {
        await supabaseAdmin.from("user_roles").insert({ user_id, role });
      }

      // Update organization_members role too
      const { data: callerMembership } = await supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", caller.id)
        .single();

      if (callerMembership) {
        const orgRole = role === "admin" ? "admin" : "member";
        await supabaseAdmin
          .from("organization_members")
          .update({ role: orgRole })
          .eq("organization_id", callerMembership.organization_id)
          .eq("user_id", user_id);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Handle POST - invite team member (name + email only)
    const { name, email, role } = await req.json();

    if (!email || !name) {
      return new Response(JSON.stringify({ error: "Nome e email são obrigatórios" }), { status: 400, headers: corsHeaders });
    }

    // Get caller's org
    const { data: callerMembership } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", caller.id)
      .single();

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email.toLowerCase());

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Generate invite link via Supabase admin API
      const siteUrl = Deno.env.get("SITE_URL") || "https://bot-mastermind-suite.lovable.app";
      const { data: inviteData, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { display_name: name, invited_to_org: true },
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

    // Assign role if provided
    if (role && role !== "user") {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
      await supabaseAdmin.from("user_roles").insert({ user_id: userId, role });
    }

    // Add to organization with correct role mapping (admin -> admin, user -> member)
    if (callerMembership) {
      const orgRole = role === "admin" ? "admin" : "member";
      // Remove existing membership if any
      await supabaseAdmin
        .from("organization_members")
        .delete()
        .eq("organization_id", callerMembership.organization_id)
        .eq("user_id", userId);
      // Insert with correct role
      await supabaseAdmin
        .from("organization_members")
        .insert({
          organization_id: callerMembership.organization_id,
          user_id: userId,
          role: orgRole,
        });
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders });
  }
});

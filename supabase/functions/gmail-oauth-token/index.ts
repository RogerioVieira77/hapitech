import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { code, redirect_uri, client_id, client_secret } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: "Authorization code required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange code for tokens
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: client_id || Deno.env.get("GOOGLE_CLIENT_ID") || "",
        client_secret: client_secret || Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
        redirect_uri: redirect_uri || "postmessage",
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("Token exchange error:", errText);
      return new Response(JSON.stringify({ error: "Token exchange failed", details: errText }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokens = await tokenResp.json();
    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: "No refresh token received. Make sure to use access_type=offline and prompt=consent." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email
    const userInfoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const userInfo = await userInfoResp.json();
    const email = userInfo.email;

    // Save to smtp_settings
    const { data: settings } = await adminClient
      .from("smtp_settings")
      .select("id")
      .limit(1)
      .single();

    if (settings) {
      await adminClient
        .from("smtp_settings")
        .update({
          gmail_oauth_refresh_token: refreshToken,
          gmail_oauth_email: email,
          use_gmail_oauth: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settings.id);
    }

    console.log(`Gmail OAuth connected for: ${email}`);

    return new Response(JSON.stringify({ success: true, email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Gmail OAuth error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

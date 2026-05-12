import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // List calendars using provider token
    if (action === "list-calendars") {
      const { provider_token } = await req.json();
      if (!provider_token) {
        return new Response(JSON.stringify({ error: "No provider token" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const calResponse = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList",
        {
          headers: { Authorization: `Bearer ${provider_token}` },
        }
      );

      if (!calResponse.ok) {
        const errText = await calResponse.text();
        console.error("Google Calendar API error:", errText);
        return new Response(
          JSON.stringify({ error: "Failed to fetch calendars", details: errText }),
          { status: calResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const calData = await calResponse.json();
      const calendars = (calData.items || []).map((cal: any) => ({
        id: cal.id,
        summary: cal.summary,
        description: cal.description,
        primary: cal.primary || false,
        accessRole: cal.accessRole,
      }));

      // Also get the user's email
      const userInfoResp = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${provider_token}` } }
      );
      const userInfo = userInfoResp.ok ? await userInfoResp.json() : { email: user.email };

      return new Response(
        JSON.stringify({ calendars, email: userInfo.email }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save a calendar connection
    if (action === "save-connection") {
      const body = await req.json();
      const { google_email, calendar_id, calendar_name, display_name, is_always_open, business_hours, provider_token, provider_refresh_token } = body;

      const { data, error } = await supabase
        .from("google_calendar_connections")
        .insert({
          user_id: user.id,
          google_email,
          calendar_id,
          calendar_name,
          display_name,
          is_always_open: is_always_open ?? true,
          business_hours: business_hours ?? [],
          provider_token: provider_token || null,
          provider_refresh_token: provider_refresh_token || null,
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, connection: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update connection (business hours, etc.)
    if (action === "update-connection") {
      const body = await req.json();
      const { id, ...updates } = body;

      const { data, error } = await supabase
        .from("google_calendar_connections")
        .update(updates)
        .eq("id", id)
        .eq("user_id", user.id)
        .select()
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true, connection: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete connection
    if (action === "delete-connection") {
      const { id } = await req.json();
      const { error } = await supabase
        .from("google_calendar_connections")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

    const {
      connection_id,
      summary,
      description,
      start_time,
      end_time,
      attendee_email,
      attendee_name,
      add_google_meet,
    } = await req.json();

    // Get the calendar connection
    const { data: connection, error: connError } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connection_id)
      .eq("user_id", user.id)
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: "Calendar connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const providerToken = connection.provider_token;
    if (!providerToken) {
      return new Response(JSON.stringify({ error: "No provider token. Please reconnect." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build event payload
    const event: any = {
      summary: summary || "Agendamento",
      description: description || "",
      start: {
        dateTime: start_time,
        timeZone: "America/Sao_Paulo",
      },
      end: {
        dateTime: end_time,
        timeZone: "America/Sao_Paulo",
      },
    };

    if (attendee_email) {
      event.attendees = [
        { email: attendee_email, displayName: attendee_name || "" },
      ];
      event.sendUpdates = "all";
    }

    const settings = connection.settings || {};
    if (add_google_meet || settings.google_meet) {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const calendarId = encodeURIComponent(connection.calendar_id);
    const conferenceParam = (add_google_meet || settings.google_meet) ? "&conferenceDataVersion=1" : "";

    const eventResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all${conferenceParam}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!eventResp.ok) {
      const errText = await eventResp.text();
      console.error("Google Calendar create event error:", errText);
      return new Response(JSON.stringify({ error: "Failed to create event", details: errText }), {
        status: eventResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventData = await eventResp.json();

    return new Response(JSON.stringify({
      success: true,
      event_id: eventData.id,
      html_link: eventData.htmlLink,
      meet_link: eventData.hangoutLink || eventData.conferenceData?.entryPoints?.[0]?.uri || null,
      start: eventData.start,
      end: eventData.end,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

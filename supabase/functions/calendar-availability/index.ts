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

    const { date, connection_id } = await req.json();

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
      return new Response(JSON.stringify({ error: "No provider token available. Please reconnect Google Calendar." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query Google Calendar freebusy API
    const targetDate = date || new Date().toISOString().split("T")[0];
    const timeMin = `${targetDate}T00:00:00Z`;
    const timeMax = `${targetDate}T23:59:59Z`;

    const freebusyResp = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: connection.calendar_id }],
        }),
      }
    );

    if (!freebusyResp.ok) {
      const errText = await freebusyResp.text();
      console.error("Google FreeBusy API error:", errText);
      return new Response(JSON.stringify({ error: "Failed to check availability", details: errText }), {
        status: freebusyResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const freebusyData = await freebusyResp.json();
    const busySlots = freebusyData.calendars?.[connection.calendar_id]?.busy || [];

    // Calculate available slots based on business hours
    const settings = connection.settings || {};
    const businessHours = connection.business_hours || [];
    const isAlwaysOpen = connection.is_always_open;

    let availableSlots: { start: string; end: string }[] = [];

    if (isAlwaysOpen) {
      // All day available minus busy slots
      availableSlots = calculateAvailableSlots(
        `${targetDate}T08:00:00`,
        `${targetDate}T20:00:00`,
        busySlots,
        settings.restrict_hours || false
      );
    } else {
      // Use business hours for the day of week
      const dayOfWeek = new Date(targetDate).getDay();
      const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      const dayName = dayNames[dayOfWeek];
      const dayHours = businessHours.find((h: any) => h.day === dayName);

      if (dayHours?.enabled) {
        availableSlots = calculateAvailableSlots(
          `${targetDate}T${dayHours.start}:00`,
          `${targetDate}T${dayHours.end}:00`,
          busySlots,
          settings.restrict_hours || false
        );
      }
    }

    return new Response(JSON.stringify({
      date: targetDate,
      calendar_name: connection.display_name,
      busy_slots: busySlots,
      available_slots: availableSlots,
      is_always_open: isAlwaysOpen,
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

function calculateAvailableSlots(
  dayStart: string,
  dayEnd: string,
  busySlots: { start: string; end: string }[],
  restrictToFullHours: boolean
): { start: string; end: string }[] {
  const slots: { start: string; end: string }[] = [];
  let current = new Date(dayStart);
  const end = new Date(dayEnd);

  // Sort busy slots
  const sorted = busySlots
    .map((s) => ({ start: new Date(s.start), end: new Date(s.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const busy of sorted) {
    if (current < busy.start) {
      slots.push({
        start: current.toISOString(),
        end: busy.start.toISOString(),
      });
    }
    if (busy.end > current) {
      current = busy.end;
    }
  }

  if (current < end) {
    slots.push({
      start: current.toISOString(),
      end: end.toISOString(),
    });
  }

  if (restrictToFullHours) {
    return slots.map((slot) => {
      const s = new Date(slot.start);
      s.setMinutes(0, 0, 0);
      if (s < new Date(slot.start)) s.setHours(s.getHours() + 1);
      return { start: s.toISOString(), end: slot.end };
    }).filter((s) => new Date(s.start) < new Date(s.end));
  }

  return slots;
}

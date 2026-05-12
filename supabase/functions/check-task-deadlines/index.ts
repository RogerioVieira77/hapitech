import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get today and tomorrow dates in YYYY-MM-DD format
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getTime() + 86400000)
      .toISOString()
      .split("T")[0];

    // Find pending tasks due today or tomorrow
    const { data: tasks, error: tasksError } = await supabase
      .from("lead_tasks")
      .select("id, title, due_date, user_id, lead_id")
      .eq("status", "pending")
      .in("due_date", [today, tomorrow]);

    if (tasksError) throw tasksError;

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No upcoming deadlines", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead names for context
    const leadIds = [...new Set(tasks.map((t) => t.lead_id))];
    const { data: leads } = await supabase
      .from("leads")
      .select("id, name")
      .in("id", leadIds);
    const leadMap = new Map((leads || []).map((l) => [l.id, l.name]));

    // Check for already sent notifications today to avoid duplicates
    const todayStart = `${today}T00:00:00.000Z`;
    const { data: existingNotifs } = await supabase
      .from("notifications")
      .select("metadata")
      .eq("type", "task_deadline")
      .gte("created_at", todayStart);

    const alreadyNotified = new Set(
      (existingNotifs || [])
        .map((n: any) => n.metadata?.task_id)
        .filter(Boolean)
    );

    // Create notifications for each task
    const notifications = tasks
      .filter((task) => !alreadyNotified.has(task.id))
      .map((task) => {
        const leadName = leadMap.get(task.lead_id) || "Lead";
        const isToday = task.due_date === today;
        const urgency = isToday ? "vence hoje" : "vence amanhã";

        return {
          user_id: task.user_id,
          title: `⏰ Tarefa ${urgency}!`,
          message: `"${task.title}" (${leadName}) ${urgency}.`,
          type: "task_deadline",
          metadata: {
            task_id: task.id,
            lead_id: task.lead_id,
            due_date: task.due_date,
          },
        };
      });

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("notifications")
        .insert(notifications);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        message: "Deadline notifications sent",
        count: notifications.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error checking task deadlines:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

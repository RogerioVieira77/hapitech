import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 10000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { widgetId, messages } = body as {
      widgetId: string;
      messages: { role: "user" | "assistant"; content: string }[];
    };

    // ── Input validation ──────────────────────────────────────────────────
    if (!widgetId || typeof widgetId !== "string") {
      return new Response(JSON.stringify({ error: "widgetId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (messages.length > MAX_MESSAGES) {
      return new Response(JSON.stringify({ error: "Too many messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const msg of messages) {
      if (!msg.content || typeof msg.content !== "string") {
        return new Response(JSON.stringify({ error: "Invalid message content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(JSON.stringify({ error: "Message too long" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!["user", "assistant"].includes(msg.role)) {
        return new Response(JSON.stringify({ error: "Invalid message role" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Fetch widget config ───────────────────────────────────────────────
    const { data: widget, error: wErr } = await supabase
      .from("widget_connections")
      .select("id, agent_id, welcome_message, is_active, user_id")
      .eq("id", widgetId)
      .single();

    if (wErr || !widget) {
      return new Response(JSON.stringify({ error: "Widget not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!widget.is_active) {
      return new Response(JSON.stringify({ error: "Widget is inactive" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Fetch agent config ────────────────────────────────────────────────
    let instructions = "Você é um assistente virtual prestativo e amigável.";
    let model = "gpt-4o-mini";
    let temperature = 0.7;

    if (widget.agent_id) {
      const { data: agent } = await supabase
        .from("agents")
        .select("instructions, model, temperature, status")
        .eq("id", widget.agent_id)
        .single();

      if (agent) {
        if (agent.status === "paused") {
          return new Response(JSON.stringify({ error: "Agente pausado" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        instructions = agent.instructions;
        model = agent.model;
        temperature = agent.temperature;
      }
    }

    // ── Fetch AI provider API key ─────────────────────────────────────────
    const { data: providers } = await supabase
      .from("ai_providers")
      .select("api_key, name")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1);

    const provider = providers?.[0];

    let apiKey = provider?.api_key;
    let baseURL = "https://api.openai.com/v1";

    if (model.startsWith("claude")) {
      baseURL = "https://api.anthropic.com/v1";
    } else if (model.startsWith("gemini")) {
      baseURL = "https://generativelanguage.googleapis.com/v1beta/openai";
    } else if (model.startsWith("deepseek")) {
      baseURL = "https://api.deepseek.com/v1";
    } else if (model.startsWith("mistral")) {
      baseURL = "https://api.mistral.ai/v1";
    }

    if (!apiKey) {
      apiKey = Deno.env.get("LOVABLE_API_KEY");
      baseURL = "https://api.openai.com/v1";
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No AI provider configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Call AI (streaming) ───────────────────────────────────────────────
    const aiResp = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature,
        stream: true,
        messages: [
          { role: "system", content: instructions },
          ...messages,
        ],
      }),
    });

    if (!aiResp.ok) {
      console.error("AI API error:", await aiResp.text());
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Stream back ───────────────────────────────────────────────────────
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = aiResp.body!.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          await writer.write(encoder.encode(decoder.decode(value)));
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("widget-chat error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

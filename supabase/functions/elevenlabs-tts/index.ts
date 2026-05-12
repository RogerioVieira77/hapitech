import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth check ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, agent_id, text } = await req.json();

    // ── Resolve API key from agent's stored key (server-side only) ────────
    let apiKey: string | null = null;

    if (agent_id) {
      const { data: agentData } = await supabaseAdmin
        .from("agents")
        .select("elevenlabs_api_key, user_id")
        .eq("id", agent_id)
        .single();

      // Verify agent belongs to the authenticated user
      if (!agentData || agentData.user_id !== user.id) {
        return new Response(JSON.stringify({ error: "Agent not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      apiKey = agentData.elevenlabs_api_key;
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No ElevenLabs API key configured for this agent" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: list_voices
    if (action === "list_voices") {
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": apiKey },
      });

      if (!response.ok) {
        console.error("ElevenLabs voices error:", await response.text());
        return new Response(JSON.stringify({ error: "Failed to fetch voices" }), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const voices = (data.voices || []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
        preview_url: v.preview_url,
      }));

      return new Response(JSON.stringify({ voices }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: tts
    if (action === "tts") {
      if (!text) {
        return new Response(JSON.stringify({ error: "text is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let voiceId = "iP95p4xoKVk53GoZ742B";
      let model = "eleven_multilingual_v2";
      let stability = 0.5;
      let similarity_boost = 0.75;
      let style = 0.5;
      let speed = 1.0;
      let use_speaker_boost = true;

      if (agent_id) {
        const { data: agentConfig } = await supabaseAdmin
          .from("agents")
          .select("elevenlabs_voice_id, elevenlabs_model, elevenlabs_stability, elevenlabs_similarity, elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost")
          .eq("id", agent_id)
          .single();

        if (agentConfig) {
          voiceId = agentConfig.elevenlabs_voice_id || voiceId;
          model = agentConfig.elevenlabs_model || model;
          stability = agentConfig.elevenlabs_stability ?? stability;
          similarity_boost = agentConfig.elevenlabs_similarity ?? similarity_boost;
          style = agentConfig.elevenlabs_style ?? style;
          speed = agentConfig.elevenlabs_speed ?? speed;
          use_speaker_boost = agentConfig.elevenlabs_speaker_boost ?? use_speaker_boost;
        }
      }

      const ttsResponse = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: { stability, similarity_boost, style, use_speaker_boost, speed },
          }),
        }
      );

      if (!ttsResponse.ok) {
        console.error("ElevenLabs TTS error:", await ttsResponse.text());
        return new Response(JSON.stringify({ error: "Text-to-speech failed" }), {
          status: ttsResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const audioBuffer = await ttsResponse.arrayBuffer();

      return new Response(audioBuffer, {
        headers: { ...corsHeaders, "Content-Type": "audio/mpeg" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("elevenlabs-tts error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

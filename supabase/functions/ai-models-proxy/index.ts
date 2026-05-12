import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Curated model lists ──────────────────────────────────────────────────────

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
  { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
  { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
];

const GOOGLE_MODELS = [
  { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro Preview" },
  { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash" },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
  { id: "google/gemini-2.0-flash", name: "Gemini 2.0 Flash" },
  { id: "google/gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  { id: "google/gemini-1.5-flash", name: "Gemini 1.5 Flash" },
];

const DEEPSEEK_MODELS = [
  { id: "deepseek-chat", name: "DeepSeek Chat (V3)" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)" },
  { id: "deepseek-coder", name: "DeepSeek Coder" },
];

const GROK_MODELS = [
  { id: "grok-3", name: "Grok 3" },
  { id: "grok-3-fast", name: "Grok 3 Fast" },
  { id: "grok-3-mini", name: "Grok 3 Mini" },
  { id: "grok-3-mini-fast", name: "Grok 3 Mini Fast" },
  { id: "grok-2-1212", name: "Grok 2" },
  { id: "grok-2-vision-1212", name: "Grok 2 Vision" },
];

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B Versatile" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B Instant" },
  { id: "llama3-70b-8192", name: "Llama 3 70B" },
  { id: "llama3-8b-8192", name: "Llama 3 8B" },
  { id: "gemma2-9b-it", name: "Gemma 2 9B" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B" },
  { id: "deepseek-r1-distill-llama-70b", name: "DeepSeek R1 Distill Llama 70B" },
  { id: "qwen-qwq-32b", name: "Qwen QwQ 32B" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", name: "Llama 4 Scout 17B" },
  { id: "meta-llama/llama-4-maverick-17b-128e-instruct", name: "Llama 4 Maverick 17B" },
];

const MISTRAL_MODELS = [
  { id: "mistral-large-latest", name: "Mistral Large" },
  { id: "mistral-medium-latest", name: "Mistral Medium" },
  { id: "mistral-small-latest", name: "Mistral Small" },
  { id: "open-mistral-nemo", name: "Mistral Nemo" },
  { id: "codestral-latest", name: "Codestral" },
  { id: "pixtral-large-latest", name: "Pixtral Large" },
  { id: "open-mixtral-8x22b", name: "Mixtral 8x22B" },
];

const DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  deepseek: "DeepSeek",
  grok: "Grok (xAI)",
  groq: "Groq",
  mistral: "Mistral AI",
};

// ── Fetch live models ────────────────────────────────────────────────────────

async function fetchOpenAIModels(apiKey: string) {
  const uniqueModels: { id: string }[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (let page = 0; page < 20; page++) {
    const url = new URL("https://api.openai.com/v1/models");
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("OpenAI /v1/models error:", res.status, body);
      throw new Error(`OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    const pageModels = (Array.isArray(data?.data) ? data.data : data) as { id: string }[];

    for (const model of pageModels || []) {
      if (!model?.id || seen.has(model.id)) continue;
      seen.add(model.id);
      uniqueModels.push({ id: model.id });
    }

    const hasMore = Boolean(data?.has_more);
    const lastId =
      typeof data?.last_id === "string"
        ? data.last_id
        : pageModels?.[pageModels.length - 1]?.id;

    if (!hasMore || !lastId || !pageModels?.length) break;
    after = lastId;
  }

  console.log(`OpenAI returned ${uniqueModels.length} total models`);

  // Exclude only non-LLM endpoints (keep chat/reasoning/audio-capable LLMs)
  const excludePatterns = [
    "embedding",
    "whisper",
    "tts-",
    "text-to-speech",
    "transcribe",
    "moderation",
    "dall-e",
    "gpt-image",
  ];

  const filtered = uniqueModels.filter((m) => {
    const id = m.id.toLowerCase();
    return !excludePatterns.some((p) => id.includes(p));
  });

  console.log(`After filtering: ${filtered.length} LLM models`);

  const finalModels = filtered.length > 0 ? filtered : uniqueModels;

  return finalModels
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((m) => ({
      id: m.id,
      name: m.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }));
}

async function fetchGroqModels(apiKey: string) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return GROQ_MODELS;
    const data = await res.json();
    return (data.data as { id: string }[])
      .filter((m) => !m.id.includes("whisper") && !m.id.includes("guard"))
      .map((m) => ({
        id: m.id,
        name: m.id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
  } catch {
    return GROQ_MODELS;
  }
}

async function validateKey(providerName: string, apiKey: string): Promise<boolean> {
  try {
    if (providerName === "openai") {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }
    if (providerName === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      return res.ok;
    }
    if (providerName === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }
    if (providerName === "mistral") {
      const res = await fetch("https://api.mistral.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }
    // Basic length check for providers without easy validation endpoints
    return apiKey.length > 10;
  } catch {
    return false;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, providerId, providerName, apiKey, modelId, enabled, credits } = await req.json();

    // ── list_providers ────────────────────────────────────────────────────────
    if (action === "list_providers") {
      const { data: providers } = await supabase
        .from("ai_providers")
        .select("id, name, display_name, is_active, created_at")
        .order("created_at");
      return new Response(JSON.stringify({ providers: providers || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── fetch_models ──────────────────────────────────────────────────────────
    if (action === "fetch_models") {
      const { data: provider } = await supabase
        .from("ai_providers")
        .select("*")
        .eq("id", providerId)
        .single();

      if (!provider) {
        return new Response(JSON.stringify({ error: "Provider not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let models: { id: string; name: string }[] = [];

      switch (provider.name) {
        case "openai":    models = await fetchOpenAIModels(provider.api_key); break;
        case "anthropic": models = ANTHROPIC_MODELS; break;
        case "google":    models = GOOGLE_MODELS; break;
        case "deepseek":  models = DEEPSEEK_MODELS; break;
        case "grok":      models = GROK_MODELS; break;
        case "groq":      models = await fetchGroqModels(provider.api_key); break;
        case "mistral":   models = MISTRAL_MODELS; break;
      }

      console.log(`[fetch_models] Provider: ${provider.name}, fetched ${models.length} models`);
      if (models.length > 0) {
        console.log(`[fetch_models] First 5: ${models.slice(0, 5).map(m => m.id).join(", ")}`);
      }

      // Batch upsert for efficiency
      if (models.length > 0) {
        const rows = models.map(model => ({
          provider_id: provider.id,
          model_id: model.id,
          display_name: model.name,
        }));
        const { error: upsertError } = await supabase.from("ai_models").upsert(
          rows,
          { onConflict: "provider_id,model_id", ignoreDuplicates: true }
        );
        if (upsertError) {
          console.error("[fetch_models] Upsert error:", upsertError);
        }
      }

      const { data: dbModels, error: selectError } = await supabase
        .from("ai_models")
        .select("*")
        .eq("provider_id", provider.id)
        .order("display_name");

      if (selectError) {
        console.error("[fetch_models] Select error:", selectError);
      }
      console.log(`[fetch_models] DB returned ${dbModels?.length ?? 0} models`);

      return new Response(JSON.stringify({ models: dbModels || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── update_credits ────────────────────────────────────────────────────────
    if (action === "update_credits") {
      const { error } = await supabase
        .from("ai_models")
        .update({ credits_per_response: credits })
        .eq("id", modelId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── toggle_model ──────────────────────────────────────────────────────────
    if (action === "toggle_model") {
      const { error } = await supabase
        .from("ai_models")
        .update({ is_enabled: enabled })
        .eq("id", modelId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── save_provider ─────────────────────────────────────────────────────────
    if (action === "save_provider") {
      const valid = await validateKey(providerName, apiKey);
      if (!valid) {
        return new Response(
          JSON.stringify({ error: "Chave de API inválida ou sem permissão" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: existing } = await supabase
        .from("ai_providers")
        .select("id")
        .eq("name", providerName)
        .single();

      if (existing) {
        await supabase
          .from("ai_providers")
          .update({ api_key: apiKey, is_active: true })
          .eq("name", providerName);
      } else {
        await supabase.from("ai_providers").insert({
          name: providerName,
          display_name: DISPLAY_NAMES[providerName] || providerName,
          api_key: apiKey,
          is_active: true,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── delete_provider ───────────────────────────────────────────────────────
    if (action === "delete_provider") {
      // Delete related models first (foreign key constraint)
      const { error: modelsError } = await supabase.from("ai_models").delete().eq("provider_id", providerId);
      if (modelsError) {
        console.error("[delete_provider] Error deleting models:", modelsError);
      }
      const { error: providerError } = await supabase.from("ai_providers").delete().eq("id", providerId);
      if (providerError) {
        console.error("[delete_provider] Error deleting provider:", providerError);
        throw new Error("Erro ao remover provedor: " + providerError.message);
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
    console.error("ai-models-proxy error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

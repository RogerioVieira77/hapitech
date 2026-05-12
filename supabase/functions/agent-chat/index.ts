import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "text-embedding-3-small";

// ── Model resolver ────────────────────────────────────────────────────────────
function resolveModel(model: string): string {
  const VALID_MODELS = new Set([
    "google/gemini-2.5-pro",
    "google/gemini-3-pro-preview",
    "google/gemini-3-flash-preview",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "openai/gpt-5",
    "openai/gpt-5-mini",
    "openai/gpt-5-nano",
    "openai/gpt-5.2",
  ]);
  if (!model || !VALID_MODELS.has(model)) {
    if (model?.includes("gpt-4o") || model?.includes("gpt-4.1") || model?.includes("gpt-4")) return "google/gemini-3-flash-preview";
    if (model?.includes("gpt-3.5") || model?.includes("gpt-3")) return "google/gemini-2.5-flash-lite";
    if (model?.includes("gemini")) return "google/gemini-3-flash-preview";
    console.log(`[model] Unknown model '${model}' — falling back to gemini-3-flash-preview`);
    return "google/gemini-3-flash-preview";
  }
  return model;
}

// gpt-5 and o1/o3/o4 reasoning models only accept temperature=1; omit it for those
const FIXED_TEMP_PREFIXES = ["o1", "o3", "o4", "gpt-5"];

function modelSupportsTemperature(model: string): boolean {
  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  return !FIXED_TEMP_PREFIXES.some(prefix => modelName.startsWith(prefix));
}

function applyTokenLimit(body: Record<string, unknown>, model: string, tokenLimit = 4096) {
  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  const usesNewParam = FIXED_TEMP_PREFIXES.some(prefix => modelName.startsWith(prefix));
  delete body.max_tokens;
  delete body.max_completion_tokens;
  body[usesNewParam ? "max_completion_tokens" : "max_tokens"] = tokenLimit;
}

// ── Business hours check ─────────────────────────────────────────────────────
interface DaySchedule { enabled: boolean; start: string; end: string }
interface BusinessHours { allowAnytime: boolean; days: Record<string, DaySchedule> }

const DAY_KEY_MAP: Record<number, string> = {
  0: "dom", 1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sab",
};

function isWithinBusinessHours(businessHours: BusinessHours | null | undefined, timezone: string): { open: boolean; message: string } {
  if (!businessHours || businessHours.allowAnytime) {
    return { open: true, message: "" };
  }

  try {
    // Get current time in the agent's timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const dayOfWeek = now.toLocaleDateString("en-US", { timeZone: timezone || "America/Sao_Paulo", weekday: "short" });
    
    // Map JS day index
    const jsDay = new Date(now.toLocaleString("en-US", { timeZone: timezone || "America/Sao_Paulo" })).getDay();
    const dayKey = DAY_KEY_MAP[jsDay];
    
    if (!dayKey || !businessHours.days[dayKey]) {
      return { open: true, message: "" };
    }

    const dayConfig = businessHours.days[dayKey];
    
    if (!dayConfig.enabled) {
      return {
        open: false,
        message: `Olá! Nosso atendimento está fechado hoje. Por favor, entre em contato em um dia útil. 🕐`,
      };
    }

    // Parse current time
    const hourPart = parts.find(p => p.type === "hour")?.value || "0";
    const minutePart = parts.find(p => p.type === "minute")?.value || "0";
    const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);

    // Parse configured hours
    const [startH, startM] = dayConfig.start.split(":").map(Number);
    const [endH, endM] = dayConfig.end.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      return {
        open: false,
        message: `Olá! Nosso horário de atendimento é das ${dayConfig.start} às ${dayConfig.end}. No momento estamos fora do horário. Retornaremos em breve! 🕐`,
      };
    }

    return { open: true, message: "" };
  } catch (err) {
    console.error("[business-hours] Error checking hours:", err);
    return { open: true, message: "" }; // fail-open
  }
}

// ── Generate embedding for a query text ──────────────────────────────────────
async function embedQuery(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Semantic RAG: embed the question and retrieve top-K chunks ────────────────
async function semanticKnowledgeSearch(
  supabase: any,
  agentId: string,
  userQuestion: string,
  apiKey: string,
): Promise<string> {
  try {
    const { data: links } = await supabase
      .from("agent_knowledge_files")
      .select("knowledge_file_id")
      .eq("agent_id", agentId);

    if (!links || links.length === 0) return "";

    const fileIds = links.map((l: { knowledge_file_id: string }) => l.knowledge_file_id);

    const { count } = await supabase
      .from("knowledge_chunks")
      .select("id", { count: "exact", head: true })
      .in("knowledge_file_id", fileIds);

    if (!count || count === 0) {
      return await loadKnowledgeFallback(supabase, fileIds);
    }

    const queryEmbedding = await embedQuery(userQuestion, apiKey);
    if (!queryEmbedding) {
      return await loadKnowledgeFallback(supabase, fileIds);
    }

    const { data: chunks, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      knowledge_file_ids: fileIds,
      match_count: 6,
      match_threshold: 0.25,
    });

    if (error) {
      console.error("[RAG] match_knowledge_chunks error:", error);
      return await loadKnowledgeFallback(supabase, fileIds);
    }

    if (!chunks || chunks.length === 0) {
      const { data: fallbackChunks } = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: JSON.stringify(queryEmbedding),
        knowledge_file_ids: fileIds,
        match_count: 3,
        match_threshold: 0.0,
      });
      if (!fallbackChunks || fallbackChunks.length === 0) return "";
      const sections = fallbackChunks.map((c: { content: string }) => c.content).join("\n\n---\n\n");
      return `\n\n## Base de Conhecimento (trechos relevantes)\n\n${sections}`;
    }

    const sections = chunks.map((c: { content: string; similarity: number }) =>
      `[Relevância: ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`
    ).join("\n\n---\n\n");

    console.log(`[RAG] Semantic search: ${chunks.length} chunks retrieved (scores: ${chunks.map((c: {similarity: number}) => c.similarity.toFixed(2)).join(", ")})`);

    return `\n\n## Base de Conhecimento (trechos relevantes)\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections}`;
  } catch (err) {
    console.error("[RAG] Error in semantic search:", err);
    return "";
  }
}

// ── Fallback: load full content when no embeddings exist yet ─────────────────
async function loadKnowledgeFallback(
  supabase: any,
  fileIds: string[],
): Promise<string> {
  const { data: files } = await supabase
    .from("knowledge_files")
    .select("id, file_name, storage_path, source_type, source_url, content")
    .in("id", fileIds);

  if (!files || files.length === 0) return "";

  const sections: string[] = [];
  for (const file of files) {
    let text = file.content || "";
    if (!text) {
      try {
        const { data: blob } = await supabase.storage.from("knowledge").download(file.storage_path);
        if (blob) text = await blob.text();
      } catch { /* skip */ }
    }
    if (text?.trim()) {
      const label = file.source_url ? `Conteúdo do site: ${file.source_url}` : file.file_name;
      sections.push(`--- ${label} ---\n${text.slice(0, 6000)}`);
    }
  }

  if (sections.length === 0) return "";
  return `\n\n## Base de Conhecimento\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections.join("\n\n")}`;
}

// ── Build system prompt from agent data ──────────────────────────────────────
function buildSystemPrompt(agent: Record<string, unknown>, fallbackInstructions?: string): string {
  const base = (agent.instructions as string)?.trim()
    || fallbackInstructions?.trim()
    || "Você é um assistente de IA útil e amigável. Responda de forma clara e concisa em português.";

  let prompt = base;

  // Contexto do produto/serviço
  const productExtras: string[] = [];
  if (agent.product_name) productExtras.push(`Produto/Serviço: ${agent.product_name}`);
  if (agent.product_description) productExtras.push(`Descrição: ${agent.product_description}`);
  if (agent.official_site) productExtras.push(`Site oficial: ${agent.official_site}`);
  if (productExtras.length > 0) {
    prompt += `\n\n## Sobre o Produto/Serviço\n${productExtras.join("\n")}`;
  }

  // Seções de prompt estruturado
  if ((agent.prompt_o_que_fazer as string)?.trim()) {
    prompt += `\n\n## O que você DEVE fazer\n${agent.prompt_o_que_fazer}`;
  }
  if ((agent.prompt_como_pergunta as string)?.trim()) {
    prompt += `\n\n## Como conduzir a conversa\n${agent.prompt_como_pergunta}`;
  }
  if ((agent.prompt_nao_fazer as string)?.trim()) {
    prompt += `\n\n## O que você NÃO deve fazer\n${agent.prompt_nao_fazer}`;
  }

  // Regras de comportamento das configurações
  const rules: string[] = [];
  if (agent.use_emojis === false) rules.push("- NÃO use emojis nas respostas.");
  else rules.push("- Você PODE usar emojis nas respostas.");
  if (agent.sign_agent_name === true) rules.push(`- SEMPRE finalize suas mensagens com uma linha em branco seguida do seu nome em negrito. Formato exato:\n\n[sua resposta aqui]\n\n*${agent.name || "Assistente"}*\n\nNunca esqueça de adicionar a assinatura *${agent.name || "Assistente"}* ao final.`);
  if (agent.restrict_topics === true) rules.push("- Responda APENAS sobre tópicos relacionados ao produto/serviço configurado. Recuse educadamente outros assuntos.");
  if (agent.split_responses === true) {
    const maxChars = agent.split_response_max_chars ? ` Cada parte deve ter no máximo ${agent.split_response_max_chars} caracteres.` : "";
    rules.push(`- Se a resposta for longa, divida em partes menores e envie separadamente.${maxChars}`);
  }
  if (agent.allow_reminders === true) rules.push("- Você pode registrar lembretes para o usuário quando solicitado.");
  if (agent.agent_timezone) rules.push(`- Seu fuso horário é ${agent.agent_timezone}. Use isso para datas e horários.`);
  if (agent.max_response_chars && Number(agent.max_response_chars) > 0) {
    rules.push(`- IMPORTANTE: Sua resposta DEVE ter no MÁXIMO ${agent.max_response_chars} caracteres. Resuma o conteúdo para caber nesse limite. Seja conciso e direto.`);
  }
  if (rules.length > 0) {
    prompt += `\n\n## Regras de comportamento\n${rules.join("\n")}`;
  }

  return prompt;
}

// ── Helper: create SSE response with a single message ────────────────────────
function createSingleMessageResponse(message: string): Response {
  const sseData = `data: ${JSON.stringify({
    choices: [{ delta: { content: message }, index: 0 }],
  })}\n\ndata: [DONE]\n\n`;
  
  return new Response(sseData, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, instructions, model, temperature, agentId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Fetch full agent data if agentId provided ─────────────────────────────
    let agentData: Record<string, unknown> | null = null;
    if (agentId) {
      const { data } = await supabase
        .from("agents")
        .select("status, instructions, model, temperature, use_emojis, sign_agent_name, restrict_topics, split_responses, split_response_max_chars, allow_reminders, smart_training_search, agent_timezone, prompt_o_que_fazer, prompt_como_pergunta, prompt_nao_fazer, product_name, product_description, official_site, name, max_response_chars, max_interactions, response_delay_seconds, split_delay_ms, communication_style, purpose, user_id")
        .eq("id", agentId)
        .maybeSingle();
      agentData = data;
    }

    // ── Check agent status (paused agents do nothing) ─────────────────────────
    if (agentData && (agentData as any).status === "paused") {
      return new Response(JSON.stringify({ error: "Agente pausado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Business hours check removed (column doesn't exist on agents table) ──

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id ?? null;

      if (userId) {
        let creditsRequired = 2;
        // Use the ORIGINAL model from the agent (before resolveModel), to match ai_models table
        const originalModel = model || (agentData?.model as string) || "google/gemini-3-flash-preview";
        const modelId = originalModel.replace(/^[^/]+\//, "");
        const { data: modelData } = await supabase
          .from("ai_models")
          .select("credits_per_response")
          .or(`model_id.eq.${modelId},model_id.eq.${originalModel}`)
          .eq("is_enabled", true)
          .maybeSingle();

        if (modelData?.credits_per_response) creditsRequired = modelData.credits_per_response;
        console.log(`[credits] originalModel=${originalModel} modelId=${modelId} creditsRequired=${creditsRequired}`);

        const { data: creditData } = await supabase
          .from("user_credits")
          .select("balance")
          .eq("user_id", userId)
          .maybeSingle();

        if (!creditData) {
          return new Response(
            JSON.stringify({ error: "Você não possui créditos. Contate o administrador." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (creditData.balance < creditsRequired) {
          return new Response(
            JSON.stringify({
              error: `Créditos insuficientes. Você tem ${creditData.balance} crédito(s), mas este modelo requer ${creditsRequired}.`,
            }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // ── Semantic RAG ──────────────────────────────────────────────────────
        let knowledgeContext = "";
        if (agentId && messages?.length > 0) {
          const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
          const query = lastUserMsg?.content || "";
          knowledgeContext = await semanticKnowledgeSearch(supabase, agentId, query, LOVABLE_API_KEY);
        }

        const systemPrompt = agentData
          ? buildSystemPrompt(agentData, instructions) + knowledgeContext
          : (instructions?.trim() || "Você é um assistente de IA útil e amigável. Responda de forma clara e concisa em português.") + knowledgeContext;

        const aiModel = resolveModel(model || (agentData?.model as string) || "google/gemini-3-flash-preview");
        const temp = typeof temperature === "number" ? temperature : ((agentData?.temperature as number) ?? 0.7);

        console.log(`[agent-chat] agentId=${agentId} model=${aiModel} hasPromptFields=${!!agentData?.prompt_o_que_fazer}`);

        const maxChars = agentData?.max_response_chars ? Number(agentData.max_response_chars) : 0;
        const reqBody1: Record<string, unknown> = {
          model: aiModel,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          stream: true,
        };
        applyTokenLimit(reqBody1, aiModel, 4096);
        if (modelSupportsTemperature(aiModel)) reqBody1.temperature = temp;

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(reqBody1),
        });

        if (!response.ok) {
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit atingido. Tente novamente em instantes." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          const t = await response.text();
          console.error("AI gateway error:", response.status, t);
          return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabase.rpc("deduct_credits", {
          _user_id: userId,
          _amount: creditsRequired,
          _model_id: model || "google/gemini-3-flash-preview",
          _agent_id: agentId || null,
          _description: `Resposta do modelo ${aiModel}`,
        });

        return new Response(response.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
    }

    // ── No auth / fallback (widget, test chat sem login) ──────────────────────
    // Credit check using agent owner's user_id
    const agentOwnerId = agentData?.user_id as string | null;
    if (agentOwnerId) {
      let creditsRequired = 2;
      const originalModel = model || (agentData?.model as string) || "google/gemini-3-flash-preview";
      const modelId = originalModel.replace(/^[^/]+\//, "");
      const { data: modelData } = await supabase
        .from("ai_models")
        .select("credits_per_response")
        .or(`model_id.eq.${modelId},model_id.eq.${originalModel}`)
        .eq("is_enabled", true)
        .maybeSingle();
      if (modelData?.credits_per_response) creditsRequired = modelData.credits_per_response;

      const { data: creditData } = await supabase
        .from("user_credits")
        .select("balance")
        .eq("user_id", agentOwnerId)
        .maybeSingle();

      if (!creditData || creditData.balance < creditsRequired) {
        console.log(`[credits] No-auth path: insufficient credits for agent owner ${agentOwnerId}. balance=${creditData?.balance ?? 0} < cost=${creditsRequired}`);
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. O proprietário do agente não possui créditos suficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    let knowledgeContext = "";
    if (agentId && messages?.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      const query = lastUserMsg?.content || "";
      knowledgeContext = await semanticKnowledgeSearch(supabase, agentId, query, LOVABLE_API_KEY!);
    }

    const systemPrompt = agentData
      ? buildSystemPrompt(agentData, instructions) + knowledgeContext
      : (instructions?.trim() || "Você é um assistente de IA útil e amigável. Responda de forma clara e concisa em português.") + knowledgeContext;

    const aiModel = resolveModel(model || (agentData?.model as string) || "google/gemini-3-flash-preview");
    const temp = typeof temperature === "number" ? temperature : ((agentData?.temperature as number) ?? 0.7);

    const reqBody2: Record<string, unknown> = {
      model: aiModel,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: true,
    };
    applyTokenLimit(reqBody2, aiModel, 4096);
    if (modelSupportsTemperature(aiModel)) reqBody2.temperature = temp;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(reqBody2),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits from agent owner after successful response
    if (agentOwnerId) {
      const originalModel = model || (agentData?.model as string) || "google/gemini-3-flash-preview";
      const modelId = originalModel.replace(/^[^/]+\//, "");
      const { data: md } = await supabase
        .from("ai_models")
        .select("credits_per_response")
        .or(`model_id.eq.${modelId},model_id.eq.${originalModel}`)
        .eq("is_enabled", true)
        .maybeSingle();
      await supabase.rpc("deduct_credits", {
        _user_id: agentOwnerId,
        _amount: md?.credits_per_response ?? 2,
        _model_id: originalModel,
        _agent_id: agentId || null,
        _description: `Resposta do modelo ${aiModel}`,
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("agent-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

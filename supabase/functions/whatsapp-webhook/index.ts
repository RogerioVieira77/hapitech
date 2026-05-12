import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Evolution API fallback credentials
const DEFAULT_EVO_URL = "https://evo-api.meuvendedoronline.com.br";
const DEFAULT_EVO_KEY = "WNP0Qd5UqOjgtTnoYQMwhlSCUE5YPNA6";

const EMBEDDING_MODEL = "text-embedding-3-small";

// ── In-memory fallback rate tracker (persists across invocations in same isolate) ──
const FALLBACK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const FALLBACK_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between alerts
interface AiCallRecord { ts: number; isFallback: boolean }
const aiCallRecords: AiCallRecord[] = [];
let lastFallbackAlertTs = 0;

function trackAiCall(isFallback: boolean) {
  const now = Date.now();
  aiCallRecords.push({ ts: now, isFallback });
  // Prune old entries
  while (aiCallRecords.length > 0 && aiCallRecords[0].ts < now - FALLBACK_WINDOW_MS) {
    aiCallRecords.shift();
  }
}

function getFallbackRate(): { rate: number; total: number; fallbacks: number } {
  const now = Date.now();
  const recent = aiCallRecords.filter(r => r.ts >= now - FALLBACK_WINDOW_MS);
  const total = recent.length;
  const fallbacks = recent.filter(r => r.isFallback).length;
  return { rate: total > 0 ? fallbacks / total : 0, total, fallbacks };
}

async function checkFallbackRateAndNotify(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  channel: string,
) {
  const { rate, total, fallbacks } = getFallbackRate();
  if (total < 4) return; // Need minimum sample size
  if (rate <= 0.5) return; // Under threshold
  const now = Date.now();
  if (now - lastFallbackAlertTs < FALLBACK_ALERT_COOLDOWN_MS) return; // Cooldown
  lastFallbackAlertTs = now;
  const pct = Math.round(rate * 100);
  console.warn(JSON.stringify({
    tag: "FALLBACK_RATE_ALERT",
    channel,
    rate: pct,
    total,
    fallbacks,
  }));
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      title: `⚠️ Taxa de fallback de IA alta: ${pct}%`,
      message: `Nos últimos 10 minutos, ${fallbacks} de ${total} chamadas no canal ${channel} usaram modelo de fallback. Verifique a configuração do modelo do agente.`,
      type: "ai_alert",
    });
  } catch (e) {
    console.error("Failed to insert fallback alert notification:", e);
  }
}

// ── Transcribe audio using OpenAI Whisper ────────────────────────────────────
async function transcribeAudio(audioBytes: Uint8Array, mimetype: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  try {
    // Try to get OpenAI API key from ai_providers table
    const { data: provider } = await supabase
      .from("ai_providers")
      .select("api_key")
      .eq("name", "openai")
      .eq("is_active", true)
      .maybeSingle();

    const openaiKey = provider?.api_key;
    if (!openaiKey) {
      console.error("No active OpenAI provider found — cannot transcribe audio");
      return "";
    }

    const ext = mimetype.includes("ogg") || mimetype.includes("opus") ? "ogg"
      : mimetype.includes("mp4") || mimetype.includes("m4a") ? "m4a"
      : mimetype.includes("webm") ? "webm"
      : mimetype.includes("wav") ? "wav"
      : "ogg";
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes], { type: mimetype }), `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: formData,
    });
    if (!response.ok) {
      console.error("Whisper transcription failed:", response.status, await response.text());
      return "";
    }
    const data = await response.json();
    return data.text?.trim() || "";
  } catch (err) {
    console.error("Transcription error:", err);
    return "";
  }
}

// ── Generate embedding for a query text ──────────────────────────────────────
async function embedQuery(text: string, apiKey: string): Promise<number[] | null> {
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

// ── Fallback: load full content when no embeddings exist yet ─────────────────
async function loadKnowledgeFallback(
  supabase: ReturnType<typeof createClient>,
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
      const label = file.source_url ? `Site: ${file.source_url}` : file.file_name;
      sections.push(`--- ${label} ---\n${text.slice(0, 6000)}`);
    }
  }
  if (sections.length === 0) return "";
  return `\n\n## Base de Conhecimento\n\nUse as informações abaixo para responder perguntas. Priorize sempre esse conteúdo.\n\n${sections.join("\n\n")}`;
}

// ── Semantic RAG: embed the question and retrieve top-K chunks ────────────────
async function semanticKnowledgeSearch(
  supabase: ReturnType<typeof createClient>,
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

    // Check if embeddings exist for any of the files
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

    if (error || !chunks || chunks.length === 0) {
      // Try with lower threshold before giving up
      const { data: fallbackChunks } = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: JSON.stringify(queryEmbedding),
        knowledge_file_ids: fileIds,
        match_count: 3,
        match_threshold: 0.0,
      });
      if (!fallbackChunks || fallbackChunks.length === 0) return "";
      const content = fallbackChunks.map((c: { content: string }) => c.content).join("\n\n---\n\n");
      return `\n\n## Base de Conhecimento (trechos relevantes)\n\n${content}`;
    }

    const sections = chunks.map((c: { content: string; similarity: number }) =>
      `[Relevância: ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`
    ).join("\n\n---\n\n");

    console.log(`[RAG] Semantic: ${chunks.length} chunks (scores: ${chunks.map((c: { similarity: number }) => c.similarity.toFixed(2)).join(", ")})`);

    return `\n\n## Base de Conhecimento (trechos relevantes)\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections}`;
  } catch (err) {
    console.error("[RAG] Error:", err);
    return "";
  }
}

// Map legacy/invalid model names to valid gateway models
function resolveModel(model: string): string {
  const normalized = (model || "").trim().toLowerCase();

  const directMap: Record<string, string> = {
    "gpt-5": "openai/gpt-5",
    "gpt-5-mini": "openai/gpt-5-mini",
    "gpt-5-nano": "openai/gpt-5-nano",
    "gpt-5.2": "openai/gpt-5.2",
  };
  if (directMap[normalized]) return directMap[normalized];

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
    // Map legacy OpenAI model names to valid equivalents
    if (normalized.includes("gpt-4o") || normalized.includes("gpt-4.1") || normalized.includes("gpt-4")) {
      return "google/gemini-3-flash-preview";
    }
    if (normalized.includes("gpt-3.5") || normalized.includes("gpt-3")) {
      return "google/gemini-2.5-flash-lite";
    }
    if (normalized.includes("gemini")) {
      return "google/gemini-3-flash-preview";
    }
    // Default fallback
    console.log(`[model] Unknown model '${model}' — falling back to gemini-3-flash-preview`);
    return "google/gemini-3-flash-preview";
  }
  return model;
}

// ── Build system prompt respecting agent settings ─────────────────────────────
// ── Transfer rule interface ───────────────────────────────────────────────────
interface TransferRule {
  id: number;
  targetType: string; // "agente" | "humano"
  targetAgentId?: string; // specific agent id or "todos"
  instructions: string;
  returnOnFinish: boolean;
  silentTransfer: boolean;
  tags?: string[]; // tags to auto-assign when this rule triggers
}

function buildTransferPromptSection(transferRules: TransferRule[], agentNames: Record<string, string>): string {
  if (!transferRules || transferRules.length === 0) return "";
  
  let section = `\n\n## Regras de Transferência\n`;
  section += `⚠️ REGRA CRÍTICA: Você NÃO PODE transferir o cliente nas seguintes situações:\n`;
  section += `- Saudações (oi, olá, bom dia, etc.)\n`;
  section += `- Perguntas sobre VOCÊ (qual seu nome, quem é você, o que você faz, etc.)\n`;
  section += `- Perguntas genéricas sobre o produto/serviço\n`;
  section += `- Qualquer mensagem que NÃO contenha um pedido EXPLÍCITO de falar com humano/atendente/vendedor/comercial\n`;
  section += `- Nas primeiras 3 mensagens da conversa, NUNCA transfira independente do conteúdo\n\n`;
  section += `Você SÓ pode transferir quando o cliente disser algo como: "quero falar com um atendente", "me transfira", "quero falar com humano", "pode me transferir para o comercial", etc.\n`;
  section += `Se a condição da regra diz "o cliente solicitar EXPLICITAMENTE", isso significa que o cliente DEVE usar palavras como "transferir", "falar com", "atendente", "humano", "vendedor", "comercial", "suporte".\n`;
  section += `Perguntar "qual seu nome?" NÃO é pedir transferência. Perguntar "tem vendedor?" NÃO é pedir transferência. Apenas pedidos DIRETOS contam.\n\n`;
  section += `REGRAS (use o marcador EXATO indicado para cada regra):\n\n`;
  
  for (const rule of transferRules) {
    let marker = "";
    let targetDesc = "";
    if (rule.targetType === "humano") {
      if (rule.targetAgentId && rule.targetAgentId !== "todos") {
        marker = `[TRANSFERIR:humano:${rule.targetAgentId}]`;
        targetDesc = `o atendente "${agentNames[rule.targetAgentId] || "Atendente"}"`;
      } else {
        marker = `[TRANSFERIR:humano]`;
        targetDesc = "qualquer atendente humano";
      }
    } else if (rule.targetType === "agente") {
      if (rule.targetAgentId && rule.targetAgentId !== "todos") {
        marker = `[TRANSFERIR:agente:${rule.targetAgentId}]`;
        targetDesc = `o agente "${agentNames[rule.targetAgentId] || "Agente"}"`;
      } else {
        marker = `[TRANSFERIR:agente:todos]`;
        targetDesc = "qualquer agente disponível";
      }
    }
    const silentNote = rule.silentTransfer ? " NÃO avise o cliente sobre a transferência." : " Avise o cliente que está sendo transferido.";
    section += `- Quando: ${rule.instructions || "o cliente solicitar EXPLICITAMENTE falar com alguém"} → Transferir para ${targetDesc}.${silentNote}\n`;
    section += `  MARCADOR EXATO: ${marker}\n\n`;
  }
  
  section += `IMPORTANTE: Copie o marcador EXATAMENTE como indicado acima (incluindo o ID). O marcador deve ser a ÚLTIMA coisa na mensagem.\n`;
  section += `NÃO modifique os IDs. NÃO omita os IDs. Use exatamente o marcador correspondente à regra que foi ativada.\n`;
  section += `REPITO: NUNCA use marcadores de transferência a menos que o cliente PEÇA EXPLICITAMENTE para ser transferido.`;
  return section;
}

// Find matching transfer rule for a detected transfer
function findMatchingTransferRule(transferRules: TransferRule[], transferType: string, targetId: string | null): TransferRule | null {
  // Exact match first
  if (targetId) {
    const exact = transferRules.find(r => r.targetType === transferType && r.targetAgentId === targetId);
    if (exact) return exact;
  }
  // If AI sent without ID, find the first rule matching the type
  const typeMatch = transferRules.find(r => r.targetType === transferType);
  return typeMatch || null;
}

// ── Process transfer and tag markers in AI response ──────────────────────────
function extractMarkers(reply: string): { cleanReply: string; transferType: string | null; targetId: string | null; tagName: string | null } {
  let text = reply;
  
  // Extract tag marker [ETIQUETA:nome]
  const tagRegex = /\[ETIQUETA:([^\]]+)\]/g;
  let tagName: string | null = null;
  const tagMatch = text.match(tagRegex);
  if (tagMatch) {
    const parsed = tagMatch[0].match(/\[ETIQUETA:([^\]]+)\]/);
    tagName = parsed?.[1]?.trim() || null;
    text = text.replace(tagRegex, "").trim();
  }
  
  // Extract transfer marker [TRANSFERIR:type:id]
  const transferRegex = /\[TRANSFERIR:(agente|humano)(?::([^\]]+))?\]\s*$/;
  const match = text.match(transferRegex);
  if (!match) return { cleanReply: text, transferType: null, targetId: null, tagName };
  
  return {
    cleanReply: text.replace(transferRegex, "").trim(),
    transferType: match[1],
    targetId: match[2] || null,
    tagName,
  };
}

function buildSystemPrompt(agent: Record<string, unknown>): string {
  let prompt = (agent.instructions as string) || "Você é um assistente de IA útil e amigável.";

  // Trabalho context
  const extras: string[] = [];
  if (agent.product_name) extras.push(`Produto/Serviço: ${agent.product_name}`);
  if (agent.product_description) extras.push(`Descrição: ${agent.product_description}`);
  if (agent.official_site) extras.push(`Site oficial: ${agent.official_site}`);
  if (extras.length > 0) prompt += `\n\n## Sobre o Produto\n${extras.join("\n")}`;

  // Prompt sections
  if (agent.prompt_o_que_fazer) prompt += `\n\n## O que fazer\n${agent.prompt_o_que_fazer}`;
  if (agent.prompt_como_pergunta) prompt += `\n\n## Como perguntar\n${agent.prompt_como_pergunta}`;
  if (agent.prompt_nao_fazer) prompt += `\n\n## O que NÃO fazer\n${agent.prompt_nao_fazer}`;

  // Config rules
  const rules: string[] = [];
  if (agent.use_emojis === false) rules.push("- NÃO use emojis nas respostas.");
  else rules.push("- Você PODE usar emojis nas respostas.");
  if (agent.sign_agent_name === true) rules.push(`- SEMPRE finalize suas mensagens com uma linha em branco seguida do seu nome em negrito. Formato exato:\n\n[sua resposta aqui]\n\n*${agent.name || "Assistente"}*\n\nNunca esqueça de adicionar a assinatura *${agent.name || "Assistente"}* ao final.`);
  if (agent.restrict_topics === true) rules.push("- Responda APENAS sobre tópicos relacionados ao produto/serviço. Recuse educadamente outros assuntos.");
  if (agent.split_responses === true) {
    const maxChars = agent.split_response_max_chars ? ` Cada parte deve ter no máximo ${agent.split_response_max_chars} caracteres.` : "";
    rules.push(`- Se a resposta for longa, divida em partes menores e envie separadamente.${maxChars}`);
  }
  if (agent.allow_reminders === true) rules.push("- Você pode registrar lembretes para o usuário quando solicitado.");
  if (agent.agent_timezone) rules.push(`- Seu timezone é ${agent.agent_timezone}. Use isso para datas e horários.`);
  if (agent.max_response_chars && Number(agent.max_response_chars) > 0) {
    rules.push(`- IMPORTANTE: Sua resposta DEVE ter no MÁXIMO ${agent.max_response_chars} caracteres. Resuma o conteúdo para caber nesse limite. Seja conciso e direto.`);
  }
  if (rules.length > 0) prompt += `\n\n## Regras de comportamento\n${rules.join("\n")}`;

  return prompt;
}

// ── Build calendar prompt section ────────────────────────────────────────────
interface CalendarConnection {
  id: string;
  display_name: string;
  calendar_id: string;
  settings: Record<string, unknown>;
  fields: Record<string, unknown>;
  is_always_open: boolean;
  business_hours: Array<{ day: string; enabled: boolean; start: string; end: string }>;
}

function buildCalendarPromptSection(calendarConnections: CalendarConnection[]): string {
  if (!calendarConnections || calendarConnections.length === 0) return "";

  let section = `\n\n## Agendamento no Google Calendar\n`;
  section += `Você tem acesso ao Google Calendar do usuário e pode agendar reuniões/consultas.\n\n`;
  
  section += `### Agendas disponíveis:\n`;
  for (const conn of calendarConnections) {
    const f = conn.fields || {};
    const s = conn.settings || {};
    section += `- "${conn.display_name}" (ID: ${conn.id})\n`;
    
    // Build required fields list per connection
    const requiredFields: string[] = [];
    requiredFields.push("Data desejada");
    requiredFields.push("Horário desejado");
    if (f.request_name !== false) requiredFields.push("Nome completo do participante");
    if (f.request_company) requiredFields.push("Empresa do participante");
    if (f.request_subject) requiredFields.push("Assunto/motivo da reunião");
    if (f.request_email) requiredFields.push("E-mail do participante (para envio do convite)");
    
    section += `  Campos obrigatórios: ${requiredFields.join(", ")}\n`;
    
    // Duration
    const durationType = f.duration_type || "variable";
    if (durationType === "30min") {
      section += `  Duração fixa: 30 minutos\n`;
    } else if (durationType === "60min") {
      section += `  Duração fixa: 1 hora\n`;
    } else if (durationType === "90min") {
      section += `  Duração fixa: 1 hora e 30 minutos\n`;
    } else {
      section += `  Duração: Variável (perguntar ao cliente)\n`;
    }
    
    if (f.send_summary) {
      section += `  Resumo: Anexar um resumo da conversa no agendamento\n`;
    }
    if (s.google_meet) {
      section += `  Google Meet: HABILITADO (link gerado automaticamente)\n`;
    }
  }

  section += `\n### FLUXO OBRIGATÓRIO DE PERGUNTAS:\n`;
  section += `Você DEVE seguir este fluxo SEMPRE, perguntando uma informação por vez:\n\n`;
  
  const firstConn = calendarConnections[0];
  const ff = firstConn.fields || {};
  
  let stepNum = 1;
  section += `${stepNum}. Pergunte a **data** desejada para o agendamento.\n`;
  stepNum++;
  section += `${stepNum}. Com a data, consulte os horários disponíveis usando:\n`;
  section += `   **[CONSULTAR_HORARIOS:YYYY-MM-DD:CONNECTION_ID]**\n`;
  section += `   Exemplo: [CONSULTAR_HORARIOS:2025-03-15:${firstConn.id}]\n`;
  stepNum++;
  section += `${stepNum}. Apresente os horários disponíveis e peça para o cliente escolher.\n`;
  stepNum++;
  
  if (ff.request_name !== false) {
    section += `${stepNum}. Pergunte o **nome completo** do participante.\n`;
    stepNum++;
  }
  if (ff.request_company) {
    section += `${stepNum}. Pergunte o **nome da empresa** do participante.\n`;
    stepNum++;
  }
  if (ff.request_subject) {
    section += `${stepNum}. Pergunte o **assunto** ou motivo da reunião.\n`;
    stepNum++;
  }
  if (ff.request_email) {
    section += `${stepNum}. Pergunte o **e-mail** do participante (para enviar o convite na agenda).\n`;
    stepNum++;
  }
  
  const durationType = ff.duration_type || "variable";
  if (durationType === "variable") {
    section += `${stepNum}. Pergunte **quanto tempo** será necessário para a reunião.\n`;
    stepNum++;
  }
  
  section += `${stepNum}. Somente após ter TODAS as informações, use o marcador:\n`;
  section += `   **[AGENDAR:CONNECTION_ID|START_ISO|END_ISO|NOME|EMAIL|ASSUNTO]**\n`;
  section += `   Exemplo: [AGENDAR:${firstConn.id}|2025-03-15T10:00:00|2025-03-15T11:00:00|João Silva|joao@email.com|Consulta inicial]\n`;
  section += `   - Se e-mail não foi coletado, use "sem_email" no campo EMAIL.\n`;
  section += `   - Se assunto não foi coletado, use "Reunião" como padrão.\n`;
  stepNum++;
  section += `${stepNum}. Você receberá a confirmação e deve informar ao cliente.\n`;

  section += `\n### REGRAS IMPORTANTES:\n`;
  section += `- NUNCA agende sem ter coletado TODAS as informações obrigatórias listadas acima.\n`;
  section += `- Pergunte UMA informação por vez, de forma natural e educada.\n`;
  section += `- SEMPRE consulte os horários disponíveis ANTES de confirmar um horário.\n`;
  section += `- Use formato ISO 8601 para datas: YYYY-MM-DDTHH:MM:SS\n`;
  section += `- O timezone é America/Sao_Paulo\n`;
  section += `- Se o horário desejado não estiver disponível, sugira alternativas.\n`;
  section += `- O marcador deve ser a ÚLTIMA coisa na mensagem.\n`;
  if (ff.send_summary) {
    section += `- Ao agendar, inclua um breve resumo da conversa na descrição do evento.\n`;
  }

  return section;
}

// ── Extract calendar markers from AI response ───────────────────────────────
function extractCalendarMarkers(reply: string): {
  cleanReply: string;
  consultarHorarios: { date: string; connectionId: string } | null;
  agendar: { connectionId: string; startTime: string; endTime: string; name: string; email: string; subject: string } | null;
} {
  let text = reply;

  // Check for [CONSULTAR_HORARIOS:DATE:CONNECTION_ID] — tolerate trailing *, whitespace, markdown
  const consultarRegex = /\[CONSULTAR_HORARIOS:(\d{4}-\d{2}-\d{2}):([^\]]+)\][*\s]*/;
  const consultarMatch = text.match(consultarRegex);
  if (consultarMatch) {
    return {
      cleanReply: text.replace(consultarRegex, "").trim(),
      consultarHorarios: { date: consultarMatch[1], connectionId: consultarMatch[2] },
      agendar: null,
    };
  }

  // Check for [AGENDAR:CONNECTION_ID|START|END|NAME|EMAIL|SUBJECT] — tolerate trailing *, whitespace
  const agendarRegex = /\[AGENDAR:([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]*)\|([^\]]*)\][*\s]*/;
  const agendarMatch = text.match(agendarRegex);
  if (agendarMatch) {
    return {
      cleanReply: text.replace(agendarRegex, "").trim(),
      consultarHorarios: null,
      agendar: {
        connectionId: agendarMatch[1],
        startTime: agendarMatch[2],
        endTime: agendarMatch[3],
        name: agendarMatch[4],
        email: agendarMatch[5],
        subject: agendarMatch[6],
      },
    };
  }

  return { cleanReply: text, consultarHorarios: null, agendar: null };
}

// ── Refresh Google OAuth token if expired ────────────────────────────────────
async function refreshGoogleToken(
  supabase: ReturnType<typeof createClient>,
  connectionId: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      console.error("[calendar] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET for token refresh");
      return null;
    }

    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!resp.ok) {
      console.error("[calendar] Token refresh failed:", await resp.text());
      return null;
    }

    const data = await resp.json();
    const newToken = data.access_token;
    if (!newToken) return null;

    // Save the new token
    await supabase
      .from("google_calendar_connections")
      .update({ provider_token: newToken })
      .eq("id", connectionId);

    console.log("[calendar] Token refreshed successfully");
    return newToken;
  } catch (err) {
    console.error("[calendar] Token refresh error:", err);
    return null;
  }
}

// ── Get a valid Google token, refreshing if needed ───────────────────────────
async function getValidGoogleToken(
  supabase: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
): Promise<string | null> {
  const token = connection.provider_token as string | null;
  const refreshToken = connection.provider_refresh_token as string | null;
  
  // If we have a token, use it directly — if it fails the caller handles the 401
  // and we refresh lazily. This avoids an extra round-trip on every call.
  if (token) return token;

  // No token at all, try refresh
  if (!refreshToken) return null;
  return await refreshGoogleToken(supabase, connection.id as string, refreshToken);
}

// ── Retry with refreshed token on 401 ────────────────────────────────────────
async function fetchWithTokenRefresh(
  supabase: ReturnType<typeof createClient>,
  connection: Record<string, unknown>,
  url: string,
  options: RequestInit,
  token: string,
): Promise<Response> {
  const resp = await fetch(url, { ...options, headers: { ...options.headers as Record<string, string>, Authorization: `Bearer ${token}` } });
  if (resp.status === 401) {
    const refreshToken = connection.provider_refresh_token as string | null;
    if (!refreshToken) return resp;
    const newToken = await refreshGoogleToken(supabase, connection.id as string, refreshToken);
    if (!newToken) return resp;
    console.log("[calendar] Retrying with refreshed token");
    return fetch(url, { ...options, headers: { ...options.headers as Record<string, string>, Authorization: `Bearer ${newToken}` } });
  }
  return resp;
}

// ── Call calendar availability edge function ─────────────────────────────────
async function checkCalendarAvailability(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  connectionId: string,
  date: string,
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    
    // Get connection
    const { data: connection } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle();

    if (!connection) {
      console.error("[calendar] Connection not found for availability check");
      return "No momento não consigo verificar a agenda. Por favor, me informe o horário de sua preferência que verifico a disponibilidade.";
    }

    const token = await getValidGoogleToken(supabase, connection as Record<string, unknown>);
    if (!token) {
      console.error("[calendar] Token refresh failed for connection", connectionId);
      return "No momento não consigo verificar a agenda. Por favor, me informe o horário de sua preferência que verifico a disponibilidade.";
    }

    const targetDate = date;
    const timeMin = `${targetDate}T00:00:00-03:00`;
    const timeMax = `${targetDate}T23:59:59-03:00`;

    const freebusyResp = await fetchWithTokenRefresh(
      supabase, connection as Record<string, unknown>,
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: "America/Sao_Paulo",
          items: [{ id: connection.calendar_id }],
        }),
      },
      token,
    );

    if (!freebusyResp.ok) {
      const errText = await freebusyResp.text();
      console.error("FreeBusy error:", errText);
      return "No momento não consigo verificar a agenda. Por favor, me informe o horário de sua preferência que verifico a disponibilidade.";
    }

    const freebusyData = await freebusyResp.json();
    const busySlots = freebusyData.calendars?.[connection.calendar_id]?.busy || [];

    // Calculate available slots based on business hours
    const isAlwaysOpen = connection.is_always_open;
    const businessHours = connection.business_hours || [];
    const settings = connection.settings || {};

    let dayStart = `${targetDate}T08:00:00`;
    let dayEnd = `${targetDate}T20:00:00`;

    if (!isAlwaysOpen) {
      const dayOfWeek = new Date(targetDate + "T12:00:00-03:00").getDay();
      const dayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
      const dayName = dayNames[dayOfWeek];
      const dayHoursEntry = businessHours.find((h: any) => h.day === dayName);

      if (!dayHoursEntry?.enabled) {
        return `Não há expediente em ${dayName}. Por favor, escolha outro dia.`;
      }
      dayStart = `${targetDate}T${dayHoursEntry.start}:00`;
      dayEnd = `${targetDate}T${dayHoursEntry.end}:00`;
    }

    // Calculate free slots
    const slots: string[] = [];
    let current = new Date(dayStart + "-03:00");
    const end = new Date(dayEnd + "-03:00");
    const sorted = busySlots
      .map((s: any) => ({ start: new Date(s.start), end: new Date(s.end) }))
      .sort((a: any, b: any) => a.start.getTime() - b.start.getTime());

    for (const busy of sorted) {
      if (current < busy.start) {
        const startStr = current.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        const endStr = busy.start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        slots.push(`${startStr} - ${endStr}`);
      }
      if (busy.end > current) current = busy.end;
    }
    if (current < end) {
      const startStr = current.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const endStr = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      slots.push(`${startStr} - ${endStr}`);
    }

    if (slots.length === 0) {
      return `Não há horários disponíveis em ${targetDate}. Sugira que o cliente escolha outra data.`;
    }

    return `Horários disponíveis em ${targetDate}:\n${slots.map(s => `• ${s}`).join("\n")}\n\nApresente estas opções ao cliente e pergunte qual horário prefere.`;
  } catch (err) {
    console.error("Calendar availability error:", err);
    return "Erro ao consultar disponibilidade do calendário.";
  }
}

// ── Create calendar event ───────────────────────────────────────────────────
async function createCalendarEvent(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  connectionId: string,
  startTime: string,
  endTime: string,
  name: string,
  email: string,
  subject: string,
): Promise<string> {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    
    const { data: connection } = await supabase
      .from("google_calendar_connections")
      .select("*")
      .eq("id", connectionId)
      .maybeSingle();

    if (!connection) {
      console.error("[calendar] Connection not found for event creation");
      return "No momento não consigo acessar a agenda para criar o agendamento. Por favor, tente novamente em alguns instantes.";
    }

    const token = await getValidGoogleToken(supabase, connection as Record<string, unknown>);
    if (!token) {
      console.error("[calendar] Token refresh failed for event creation, connection", connectionId);
      return "No momento não consigo acessar a agenda para criar o agendamento. Por favor, tente novamente em alguns instantes.";
    }

    const settings = connection.settings || {};
    const event: Record<string, unknown> = {
      summary: subject || "Agendamento",
      description: `Agendamento com ${name}${email ? ` (${email})` : ""}`,
      start: { dateTime: startTime, timeZone: "America/Sao_Paulo" },
      end: { dateTime: endTime, timeZone: "America/Sao_Paulo" },
    };

    if (email) {
      event.attendees = [{ email, displayName: name || "" }];
      event.sendUpdates = "all";
    }

    if (settings.google_meet) {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }

    const calendarId = encodeURIComponent(connection.calendar_id);
    const conferenceParam = settings.google_meet ? "&conferenceDataVersion=1" : "";

    const eventResp = await fetchWithTokenRefresh(
      supabase, connection as Record<string, unknown>,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all${conferenceParam}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
      token,
    );

    if (!eventResp.ok) {
      const errText = await eventResp.text();
      console.error("Create event error:", errText);
      return "Erro ao criar o evento no calendário. Tente novamente.";
    }

    const eventData = await eventResp.json();
    const meetLink = eventData.hangoutLink || eventData.conferenceData?.entryPoints?.[0]?.uri || null;
    
    let result = `✅ Agendamento criado com sucesso!\n`;
    result += `📅 Data: ${new Date(startTime).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n`;
    result += `🕐 Horário: ${new Date(startTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })} - ${new Date(endTime).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}\n`;
    result += `👤 Participante: ${name}\n`;
    if (subject) result += `📋 Assunto: ${subject}\n`;
    if (meetLink) result += `🔗 Link do Google Meet: ${meetLink}\n`;
    result += `\nInforme estes detalhes ao cliente de forma amigável.`;
    
    return result;
  } catch (err) {
    console.error("Create event error:", err);
    return "Erro ao criar o evento no calendário.";
  }
}

// ── Call the AI gateway ───────────────────────────────────────────────────────
// Models that don't support custom temperature (must use default = 1)
// gpt-5 series and o1/o3/o4 reasoning models only accept temperature=1
const FIXED_TEMPERATURE_PREFIXES = ["o1", "o3", "o4", "gpt-5"];

function modelSupportsTemperature(model: string): boolean {
  // Extract the model name after the provider prefix (e.g. "openai/gpt-5-mini" -> "gpt-5-mini")
  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  return !FIXED_TEMPERATURE_PREFIXES.some(prefix => modelName.startsWith(prefix));
}

async function callAgentAI(
  lovableApiKey: string,
  systemPrompt: string,
  model: string,
  temperature: number,
  history: { role: string; content: string }[],
  maxResponseChars?: number
): Promise<string> {
  const resolvedModel = resolveModel(model);
  const fallbackModels = [resolvedModel, "google/gemini-3-flash-preview", "google/gemini-2.5-flash-lite"]
    .filter((m, i, arr) => arr.indexOf(m) === i);

  const t0 = Date.now();
  const attempts: { model: string; status: number; ms: number; reason: string }[] = [];

  for (const modelToTry of fallbackModels) {
    const body: Record<string, unknown> = {
      model: modelToTry,
      messages: [{ role: "system", content: systemPrompt }, ...history],
      stream: false,
    };

    if (modelSupportsTemperature(modelToTry)) {
      body.temperature = typeof temperature === "number" ? temperature : 0.7;
    }

    const modelName = modelToTry.includes("/") ? modelToTry.split("/").pop()! : modelToTry;
    const usesNewParam = FIXED_TEMPERATURE_PREFIXES.some(prefix => modelName.startsWith(prefix));
    body[usesNewParam ? "max_completion_tokens" : "max_tokens"] = 4096;

    const attemptStart = Date.now();
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const attemptMs = Date.now() - attemptStart;

    if (response.ok) {
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || "";
      const finishReason = data?.choices?.[0]?.finish_reason || "unknown";
      const usage = data?.usage;
      attempts.push({ model: modelToTry, status: 200, ms: attemptMs, reason: finishReason });

      const isFallback = modelToTry !== resolvedModel;
      trackAiCall(isFallback);

      console.log(JSON.stringify({
        tag: "AI_CALL_OK",
        requested_model: model,
        resolved_model: resolvedModel,
        used_model: modelToTry,
        fallback: isFallback,
        finish_reason: finishReason,
        response_chars: content.length,
        prompt_tokens: usage?.prompt_tokens ?? null,
        completion_tokens: usage?.completion_tokens ?? null,
        total_ms: Date.now() - t0,
        attempt_ms: attemptMs,
        attempts: attempts.length,
        attempts_detail: attempts,
      }));

      if (!content) {
        console.warn(`AI returned empty content. Model: ${modelToTry}, finish_reason: ${finishReason}`);
      }
      return content;
    }

    const errText = await response.text();
    attempts.push({ model: modelToTry, status: response.status, ms: attemptMs, reason: errText.substring(0, 100) });

    const shouldTryNextModel = (response.status === 403 || response.status === 404) && modelToTry !== fallbackModels[fallbackModels.length - 1];
    if (shouldTryNextModel) {
      console.log(JSON.stringify({
        tag: "AI_FALLBACK",
        failed_model: modelToTry,
        status: response.status,
        attempt_ms: attemptMs,
        next_model: fallbackModels[fallbackModels.indexOf(modelToTry) + 1],
      }));
      continue;
    }

    console.error(JSON.stringify({
      tag: "AI_CALL_FAIL",
      requested_model: model,
      resolved_model: resolvedModel,
      last_model: modelToTry,
      status: response.status,
      total_ms: Date.now() - t0,
      attempts: attempts.length,
      attempts_detail: attempts,
      error: errText.substring(0, 200),
    }));
    throw new Error(`AI gateway error ${response.status}: ${errText}`);
  }

  console.error(JSON.stringify({
    tag: "AI_ALL_FAILED",
    requested_model: model,
    resolved_model: resolvedModel,
    total_ms: Date.now() - t0,
    attempts_detail: attempts,
  }));
  throw new Error("All fallback models failed");
}

// ── Split text into parts respecting sentence/paragraph boundaries ────────────
// This regex matches sentences ending with . ! or ? but IGNORES dots inside
// emails (user@domain.com), URLs (https://…), numbers (3.14), and abbreviations.
function splitIntoSentences(text: string): string[] {
  // Split on sentence-ending punctuation ONLY when followed by a space + uppercase
  // letter or end-of-string, avoiding splits inside emails/URLs/numbers.
  const result: string[] = [];
  // Use a safer approach: split on newlines first, then by ". " patterns
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) { result.push("\n"); continue; }
    // Split by ". " / "! " / "? " but only when the dot is NOT preceded by
    // common patterns that indicate it's part of an email/URL/number
    const sentenceRegex = /(.+?(?:[.!?](?:\s|$)))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = sentenceRegex.exec(line)) !== null) {
      const sentence = match[1];
      // Check if the period is inside an email/URL by looking for @ or :// nearby
      const dotPos = sentence.lastIndexOf(".");
      const hasEmailOrUrl = sentence.includes("@") || sentence.includes("://") || sentence.includes("www.");
      if (hasEmailOrUrl && dotPos > 0 && dotPos < sentence.length - 2) {
        // Don't split here, continue accumulating
        continue;
      }
      result.push(sentence);
      lastIndex = sentenceRegex.lastIndex;
    }
    if (lastIndex < line.length) {
      result.push(line.substring(lastIndex));
    }
  }
  return result;
}

function splitTextIntoParts(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const parts: string[] = [];
  // Try to split by double newline (paragraphs) first
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if (!para.trim()) continue;

    // If the paragraph itself is too long, split by sentence
    if (para.length > maxChars) {
      const sentences = splitIntoSentences(para);
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars && current.trim()) {
          parts.push(current.trim());
          current = sentence;
        } else {
          current += sentence;
        }
      }
    } else {
      const candidate = current ? current + "\n\n" + para : para;
      if (candidate.length > maxChars && current.trim()) {
        parts.push(current.trim());
        current = para;
      } else {
        current = candidate;
      }
    }
  }

  if (current.trim()) parts.push(current.trim());
  return parts.filter(p => p.trim().length > 0);
}

// Send WhatsApp message via Evolution API
async function sendWhatsAppMessage(
  evoUrl: string,
  evoKey: string,
  instanceName: string,
  remoteJid: string,
  text: string
): Promise<void> {
  const resp = await fetch(`${evoUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evoKey },
    body: JSON.stringify({
      number: remoteJid,
      text,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    console.error(`Failed to send WhatsApp message [${resp.status}]:`, body.substring(0, 300));
  } else {
    console.log(`WhatsApp reply sent to ${remoteJid}`);
  }
}

// Send WhatsApp audio via Evolution API - tries sendWhatsAppAudio first, then sendMedia fallback
async function sendWhatsAppAudio(
  evoUrl: string,
  evoKey: string,
  instanceName: string,
  remoteJid: string,
  audioBase64: string,
): Promise<boolean> {
  // Attempt 1: sendWhatsAppAudio endpoint with raw base64 (no data URI prefix)
  try {
    const resp1 = await fetch(`${evoUrl}/message/sendWhatsAppAudio/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        number: remoteJid,
        audio: audioBase64,
        delay: 0,
        encoding: true,
      }),
    });
    if (resp1.ok) {
      console.log(`WhatsApp audio sent via sendWhatsAppAudio to ${remoteJid}`);
      return true;
    }
    const body1 = await resp1.text();
    console.warn(`sendWhatsAppAudio attempt failed [${resp1.status}]:`, body1.substring(0, 300));
  } catch (err) {
    console.warn("sendWhatsAppAudio attempt error:", err);
  }

  // Attempt 2: sendMedia with raw base64
  try {
    const resp2 = await fetch(`${evoUrl}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evoKey },
      body: JSON.stringify({
        number: remoteJid,
        mediatype: "audio",
        mimetype: "audio/mpeg",
        media: audioBase64,
        fileName: "audio.mp3",
      }),
    });
    if (resp2.ok) {
      console.log(`WhatsApp audio sent via sendMedia to ${remoteJid}`);
      return true;
    }
    const body2 = await resp2.text();
    console.error(`sendMedia fallback failed [${resp2.status}]:`, body2.substring(0, 300));
  } catch (err) {
    console.error("sendMedia fallback error:", err);
  }

  return false;
}

// Generate TTS audio via ElevenLabs
async function generateTTS(
  apiKey: string,
  text: string,
  voiceId: string,
  model: string,
  stability: number,
  similarityBoost: number,
  style: number,
  speed: number,
  useSpeakerBoost: boolean,
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: model || "eleven_multilingual_v2",
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
            style,
            use_speaker_boost: useSpeakerBoost,
            speed,
          },
        }),
      }
    );
    if (!response.ok) {
      const errText = await response.text();
      console.error(`ElevenLabs TTS error [${response.status}]:`, errText.substring(0, 200));
      return null;
    }
    const audioBuffer = await response.arrayBuffer();
    // Use chunked base64 encoding to avoid stack overflow on large buffers
    const bytes = new Uint8Array(audioBuffer);
    const CHUNK_SIZE = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  } catch (err) {
    console.error("generateTTS error:", err);
    return null;
  }
}

// Fire webhook rules for a given event
async function fireWebhookRules(
  webhookRules: Array<{ event: string; url: string }> | null | undefined,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!webhookRules || !Array.isArray(webhookRules)) return;
  const matching = webhookRules.filter(r => r.event === eventType && r.url);
  for (const rule of matching) {
    try {
      console.log(`[webhook-rule] Firing ${eventType} -> ${rule.url}`);
      await fetch(rule.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: eventType, timestamp: new Date().toISOString(), ...payload }),
      });
    } catch (e) {
      console.error(`[webhook-rule] Failed to fire ${eventType}:`, e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    // Respond immediately so Evolution API doesn't retry
    // All processing (including delay) happens in background via waitUntil
    const processPromise = handleWebhook(supabase, body, supabaseUrl, serviceKey).catch(err =>
      console.error("Background processing error:", err)
    );
    // @ts-ignore – EdgeRuntime is available in Supabase edge runtime
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processPromise);
    } else {
      // Fallback: await directly (no delay risk in dev/test)
      await processPromise;
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Webhook error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function handleWebhook(supabase: ReturnType<typeof createClient>, body: Record<string, unknown>, supabaseUrl: string, serviceKey: string) {
  console.log("Webhook received:", JSON.stringify(body).substring(0, 1000));

  const event = (body as Record<string, unknown>).event || (body as Record<string, unknown>).type;

    // Handle messages.upsert from Evolution API
    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      const data = body.data || body;
      const instance = body.instance || body.instanceName || data.instance;
      const instanceName = typeof instance === "string" ? instance : instance?.instanceName;

      const key = data.key || data.message?.key || {};
      const remoteJid = key.remoteJid || data.remoteJid;
      const fromMe = key.fromMe || false;
      const msg = data.message || {};

      // Extract text content
      const textContent =
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        data.body ||
        msg.body ||
        "";

      // Extract media info
      let mediaType: string | null = null;
      let mediaUrl: string | null = null;
      let caption = "";

      if (msg.imageMessage) {
        mediaType = "image";
        mediaUrl = msg.imageMessage.url || null;
        caption = msg.imageMessage.caption || "";
      } else if (msg.videoMessage) {
        mediaType = "video";
        mediaUrl = msg.videoMessage.url || null;
        caption = msg.videoMessage.caption || "";
      } else if (msg.audioMessage) {
        mediaType = "audio";
        mediaUrl = msg.audioMessage.url || null;
      } else if (msg.documentMessage) {
        mediaType = "document";
        mediaUrl = msg.documentMessage.url || null;
        caption = msg.documentMessage.fileName || msg.documentMessage.caption || "";
      } else if (msg.stickerMessage) {
        mediaType = "sticker";
        mediaUrl = msg.stickerMessage.url || null;
      }

      const messageContent = textContent || caption;
      const displayContent =
        messageContent ||
        (mediaType
          ? `[${
              mediaType === "image"
                ? "Imagem"
                : mediaType === "video"
                ? "Vídeo"
                : mediaType === "audio"
                ? "Áudio"
                : mediaType === "document"
                ? "Documento"
                : "Sticker"
            }]`
          : "");

      if (!remoteJid || (!displayContent && !mediaType)) {
        console.log("Skipping: no remoteJid or content");
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Skip group messages
      if (remoteJid.includes("@g.us")) {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find the connection by instance name
      let connectionQuery = supabase.from("wuzapi_connections").select("*");
      if (instanceName) {
        connectionQuery = connectionQuery.eq("phone_number", instanceName);
      }
      const { data: connections } = await connectionQuery;

      if (!connections || connections.length === 0) {
        console.log("No connection found for instance:", instanceName);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const connection = connections[0];
      const userId = connection.user_id;
      const contactPhone = remoteJid.replace("@s.whatsapp.net", "");
      // pushName belongs to the message SENDER – when fromMe is true,
      // pushName is the account owner's name, not the contact's name.
      const contactName = fromMe ? contactPhone : (data.pushName || contactPhone);

      // Fetch profile picture in background — don't block the flow
      let profilePictureUrl: string | null = null;
      const profilePicPromise = (async () => {
        try {
          const evoUrl = (Deno.env.get("EVO_URL") || DEFAULT_EVO_URL).replace(/\/$/, "");
          const evoKey = Deno.env.get("EVO_KEY") || DEFAULT_EVO_KEY;
          if (evoUrl && evoKey && instanceName) {
            const picResp = await fetch(
              `${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoKey },
                body: JSON.stringify({ number: contactPhone }),
              }
            );
            if (picResp.ok) {
              const picData = await picResp.json();
              return picData?.profilePictureUrl || picData?.picture || picData?.url || null;
            }
          }
        } catch { /* ignore */ }
        return null;
      })();

      // Upsert conversation — run in parallel with profile pic fetch
      const [profilePicResult, convResult] = await Promise.all([
        profilePicPromise,
        supabase
          .from("conversations")
          .select("*")
          .eq("user_id", userId)
          .eq("remote_jid", remoteJid)
          .maybeSingle(),
      ]);
      profilePictureUrl = profilePicResult;
      const existingConv = convResult.data;

      let conversationId: string;
      let isAiActive = true;
      let conversationAgentId: string | null = null;
      let conversationReopenedAt: string | null = null;

      if (existingConv) {
        conversationId = existingConv.id;
        isAiActive = existingConv.is_ai_active ?? true;
        conversationAgentId = existingConv.agent_id || null;

        const updates: Record<string, unknown> = {
          last_message: displayContent,
          last_message_at: new Date().toISOString(),
          last_message_sender: fromMe ? "agent" : "user",
          last_message_media_type: mediaType || null,
          contact_name: fromMe
            ? existingConv.contact_name || contactPhone
            : (contactName !== contactPhone
              ? contactName
              : existingConv.contact_name || contactName),
        };
        if (profilePictureUrl && !existingConv.profile_picture_url) {
          updates.profile_picture_url = profilePictureUrl;
        }
        if (!fromMe) {
          updates.unread_count = (existingConv.unread_count || 0) + 1;
          // Reopen resolved conversations when user sends a new message
          if ((existingConv as any).is_resolved) {
            updates.is_resolved = false;
            updates.is_ai_active = true;
            updates.assigned_to = null;
            // Mark reopen timestamp so we can filter old history
            (updates as any).updated_at = new Date().toISOString();
            conversationReopenedAt = new Date().toISOString();
          }
        }
        await supabase.from("conversations").update(updates).eq("id", conversationId);

        // Create persistent notification for new incoming message
        if (!fromMe) {
          const notifTarget = existingConv.assigned_to || existingConv.user_id;
          const senderLabel = contactName || contactPhone || remoteJid;
          try {
            await supabase.from("notifications").insert({
              user_id: notifTarget,
              type: "new_message",
              title: `Nova mensagem de ${senderLabel}`,
              message: displayContent?.substring(0, 200) || "[mídia]",
              metadata: { conversation_id: conversationId, remote_jid: remoteJid },
            });
          } catch (e) { console.error("Failed to create notification:", e); }
        }
      } else {
        // Find the agent linked to this connection
        const { data: linkedAgent } = await supabase
          .from("agents")
          .select("id, webhook_rules")
          .eq("connection_id", connection.id)
          .eq("status", "active")
          .maybeSingle();

        conversationAgentId = linkedAgent?.id || null;

        const { data: newConv, error: convError } = await supabase
          .from("conversations")
          .insert({
            user_id: userId,
            connection_id: connection.id,
            agent_id: conversationAgentId,
            remote_jid: remoteJid,
            contact_name: contactName,
            contact_phone: contactPhone,
            last_message: displayContent,
            last_message_at: new Date().toISOString(),
            last_message_sender: fromMe ? "agent" : "user",
            last_message_media_type: mediaType || null,
            unread_count: fromMe ? 0 : 1,
            is_ai_active: true,
            profile_picture_url: profilePictureUrl,
          })
          .select()
          .single();

        if (convError) {
          console.error("Error creating conversation:", convError);
          throw convError;
        }
        conversationId = newConv.id;
        isAiActive = true;

        // Fire primeiro_atendimento + iniciar_atendimento webhook events
        if (linkedAgent?.webhook_rules && !fromMe) {
          const webhookPayload = { contact_name: contactName, contact_phone: contactPhone, remote_jid: remoteJid, conversation_id: newConv.id, agent_id: conversationAgentId, channel: "whatsapp" };
          fireWebhookRules(linkedAgent.webhook_rules as any, "primeiro_atendimento", webhookPayload);
          fireWebhookRules(linkedAgent.webhook_rules as any, "iniciar_atendimento", webhookPayload);
        }

        // Create notification for new conversation
        if (!fromMe) {
          try {
            await supabase.from("notifications").insert({
              user_id: userId,
              type: "new_message",
              title: `Nova conversa de ${contactName || contactPhone || remoteJid}`,
              message: displayContent?.substring(0, 200) || "[mídia]",
              metadata: { conversation_id: newConv.id, remote_jid: remoteJid },
            });
          } catch (e) { console.error("Failed to create notification:", e); }
        }
      }

      // Insert message (dedup by message_id)
      const sender = fromMe ? "agent" : "user";
      const messageId = key.id || `${Date.now()}`;

      const { data: existing } = await supabase
        .from("messages")
        .select("id")
        .eq("message_id", messageId)
        .maybeSingle();

      let audioBytes: Uint8Array | null = null;
      let audioMimetype: string | null = null;

      if (!existing) {
        // If there's media, try to download via Evolution API and upload to Supabase Storage
        let storedMediaUrl: string | null = null;
        if (mediaType && instanceName) {
          try {
            const evoUrl = (Deno.env.get("EVO_URL") || DEFAULT_EVO_URL).replace(/\/$/, "");
            const evoKey = Deno.env.get("EVO_KEY") || DEFAULT_EVO_KEY;
            if (evoUrl && evoKey) {
              const mediaResp = await fetch(
                `${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: evoKey },
                  body: JSON.stringify({
                    message: { key, message: msg },
                    convertToMp4: mediaType === "video",
                  }),
                }
              );
              if (mediaResp.ok) {
                const mediaData = await mediaResp.json();
                const base64 = mediaData?.base64 || mediaData?.data;
                const mimetype =
                  mediaData?.mimetype ||
                  msg[`${mediaType}Message`]?.mimetype ||
                  "application/octet-stream";
                if (base64) {
                  const binaryString = atob(base64);
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  const ext =
                    mimetype.includes("jpeg") || mimetype.includes("jpg")
                      ? "jpg"
                      : mimetype.includes("png")
                      ? "png"
                      : mimetype.includes("webp")
                      ? "webp"
                      : mimetype.includes("mp4")
                      ? "mp4"
                      : mimetype.includes("ogg") || mimetype.includes("opus")
                      ? "ogg"
                      : mimetype.includes("pdf")
                      ? "pdf"
                      : mimetype.includes("webm")
                      ? "webm"
                      : "bin";
                  const filePath = `${userId}/${conversationId}/${messageId}.${ext}`;

                  const { error: uploadError } = await supabase.storage
                    .from("chat-media")
                    .upload(filePath, bytes, { contentType: mimetype, upsert: true });

                  if (!uploadError) {
                    storedMediaUrl = filePath;
                    console.log("Media uploaded to storage:", storedMediaUrl);
                  } else {
                    console.error("Storage upload error:", uploadError);
                  }
                  // Capture audio bytes for transcription
                  if (mediaType === "audio") {
                    audioBytes = bytes;
                    audioMimetype = mimetype;
                  }
                }
              }
            }
          } catch (mediaErr) {
            console.error("Media download error:", mediaErr);
          }
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          user_id: userId,
          remote_jid: remoteJid,
          content: displayContent,
          sender,
          message_id: messageId,
          media_type: mediaType,
          media_url: storedMediaUrl || mediaUrl,
          timestamp: new Date().toISOString(),
        });

        console.log(`Message saved: ${sender} -> ${remoteJid}`);
      } else {
        console.log(`Duplicate message_id ${messageId} — skipping AI routing`);
        return;
      }

      // ── AI ROUTING ──────────────────────────────────────────────────────────
      // Transcribe audio if needed
      let aiTextContent = textContent.trim();
      let audioTranscriptionFailed = false;
      if (!aiTextContent && mediaType === "audio" && audioBytes && audioMimetype) {
        const transcribed = await transcribeAudio(audioBytes, audioMimetype, supabase);
        if (transcribed) {
          aiTextContent = transcribed;
          console.log("Audio transcribed:", transcribed.substring(0, 100));
          // Update stored message and conversation with transcribed text so the AI history is accurate
          await supabase.from("messages").update({ content: transcribed }).eq("message_id", messageId);
          await supabase.from("conversations").update({ last_message: transcribed }).eq("id", conversationId);
        } else {
          audioTranscriptionFailed = true;
          console.log("Audio transcription failed — will send fallback text reply");
        }
      }

      // Re-check is_ai_active from DB right before calling AI (human may have toggled it off)
      if (!fromMe && isAiActive && aiTextContent) {
        const { data: freshConv } = await supabase
          .from("conversations")
          .select("is_ai_active")
          .eq("id", conversationId)
          .maybeSingle();
        if (freshConv && freshConv.is_ai_active === false) {
          console.log(`[whatsapp] AI was deactivated for conversation ${conversationId} — skipping AI reply`);
          isAiActive = false;
        }
      }

      // Only respond to incoming user messages when AI is active
      if (!fromMe && isAiActive && aiTextContent) {
        // Resolve the agent: prefer conversation's agent_id, fallback to connection-linked agent
        let agentId = conversationAgentId;

        if (!agentId) {
          const { data: linkedAgent } = await supabase
            .from("agents")
            .select("id")
            .eq("connection_id", connection.id)
            .eq("status", "active")
            .maybeSingle();
          agentId = linkedAgent?.id || null;

          // Persist agent on conversation so future messages skip this lookup
          if (agentId) {
            await supabase
              .from("conversations")
              .update({ agent_id: agentId })
              .eq("id", conversationId);
          }
        }

        if (!agentId) {
          console.log("No active agent linked to this connection — skipping AI reply");
        } else {
          // Fetch agent config
          const { data: agent } = await supabase
            .from("agents")
            .select("status, instructions, model, temperature, use_emojis, sign_agent_name, restrict_topics, split_responses, split_response_max_chars, split_delay_ms, max_response_chars, prompt_o_que_fazer, prompt_como_pergunta, prompt_nao_fazer, product_name, product_description, purpose, communication_style, official_site, agent_timezone, response_delay_seconds, max_interactions, allow_reminders, smart_training_search, name, webhook_rules, transfer_rules, elevenlabs_enabled, elevenlabs_api_key, elevenlabs_voice_id, elevenlabs_model, elevenlabs_stability, elevenlabs_similarity, elevenlabs_style, elevenlabs_speed, elevenlabs_speaker_boost, elevenlabs_audio_on_audio, elevenlabs_always_audio")
            .eq("id", agentId)
            .maybeSingle();

          if (!agent) {
            console.log("Agent not found:", agentId);
          } else if ((agent as any).status === "paused") {
            console.log(`[whatsapp] Agent ${agentId} is paused — skipping AI reply`);
          } else {
            const agentWebhookRules = (agent as any).webhook_rules;
            const webhookPayload = { contact_name: contactName, contact_phone: contactPhone, remote_jid: remoteJid, conversation_id: conversationId, agent_id: agentId, message: displayContent, channel: "whatsapp" };
            
            // Fire nova_mensagem webhook (fire-and-forget)
            fireWebhookRules(agentWebhookRules, "nova_mensagem", webhookPayload);

            // ── Check max_interactions limit ──────────────────────────
            const maxInteractions = typeof (agent as any).max_interactions === "number" && (agent as any).max_interactions > 0
              ? (agent as any).max_interactions : null;

            const lovableApiKey = (Deno.env.get("LOVABLE_API_KEY") || "").trim();
            if (!lovableApiKey) {
              console.error("LOVABLE_API_KEY not configured — cannot call AI");
            } else {
              // ── PARALLEL: fetch history, RAG, calendar, transfer names, interaction count ──
              // Use conversation updated_at as baseline for max_interactions count
              // so the counter resets when AI is re-enabled via toggle
              const convUpdatedAt = existingConv?.updated_at || null;
              
              let historyQuery = supabase
                .from("messages")
                .select("content, sender, timestamp")
                .eq("conversation_id", conversationId)
                .order("timestamp", { ascending: false })
                .limit(20);
              if (conversationReopenedAt) {
                historyQuery = historyQuery.gte("timestamp", conversationReopenedAt);
              }

              const transferRules: TransferRule[] = Array.isArray((agent as any).transfer_rules) ? (agent as any).transfer_rules : [];
              const targetAgentIds = transferRules
                .filter(r => r.targetType === "agente" && r.targetAgentId && r.targetAgentId !== "todos")
                .map(r => r.targetAgentId!);
              const targetHumanIds = transferRules
                .filter(r => r.targetType === "humano" && r.targetAgentId)
                .map(r => r.targetAgentId!);

              // Count interactions only since last AI re-activation (updated_at)
              let interactionCountQuery: any = supabase
                .from("messages")
                .select("id", { count: "exact", head: true })
                .eq("conversation_id", conversationId);
              if (maxInteractions && convUpdatedAt) {
                interactionCountQuery = interactionCountQuery.gte("timestamp", convUpdatedAt);
              }

              const [
                historyResult,
                knowledgeContext,
                calendarResult,
                interactionCountResult,
                targetAgentsResult,
                humanProfilesResult,
              ] = await Promise.all([
                historyQuery,
                semanticKnowledgeSearch(supabase, agentId, aiTextContent, lovableApiKey),
                supabase.from("google_calendar_connections")
                  .select("id, display_name, calendar_id, settings, fields, is_always_open, business_hours")
                  .eq("user_id", userId),
                maxInteractions
                  ? interactionCountQuery
                  : Promise.resolve({ count: 0 }),
                targetAgentIds.length > 0
                  ? supabase.from("agents").select("id, name").in("id", targetAgentIds)
                  : Promise.resolve({ data: [] }),
                targetHumanIds.length > 0
                  ? supabase.from("profiles").select("user_id, display_name").in("user_id", targetHumanIds)
                  : Promise.resolve({ data: [] }),
              ]);

              // Check interaction limit — deactivate AI visibly when reached
              if (maxInteractions && interactionCountResult.count && interactionCountResult.count >= maxInteractions) {
                console.log(`[max_interactions] Limit reached (${interactionCountResult.count}/${maxInteractions}) — deactivating AI`);
                await supabase.from("conversations").update({ is_ai_active: false }).eq("id", conversationId);
              } else {
              try {
                if (knowledgeContext) {
                  console.log(`[RAG] Semantic knowledge loaded for agent ${agentId}`);
                }

                // Build transfer prompt
                let transferPrompt = "";
                if (transferRules.length > 0) {
                  const agentNames: Record<string, string> = {};
                  for (const ta of (targetAgentsResult as any).data || []) {
                    agentNames[ta.id] = ta.name;
                  }
                  for (const hp of (humanProfilesResult as any).data || []) {
                    agentNames[hp.user_id] = hp.display_name || "Atendente";
                  }
                  transferPrompt = buildTransferPromptSection(transferRules, agentNames);
                }

                // Build calendar prompt
                let calendarPrompt = "";
                const calendarConns = calendarResult.data;
                if (calendarConns && calendarConns.length > 0) {
                  calendarPrompt = buildCalendarPromptSection(calendarConns as CalendarConnection[]);
                  console.log(`[calendar] ${calendarConns.length} calendar(s) available for agent ${agentId}`);
                }

                const history = (historyResult.data || [])
                  .reverse()
                  .map((m: any) => ({
                    role: m.sender === "agent" ? "assistant" : "user",
                    content: m.content,
                  }));

                console.log(`Calling AI agent ${agentId} for conversation ${conversationId} with model ${agent.model}`);

                // ── Pre-check credits BEFORE calling AI ──────────────────
                {
                  const origModel = agent.model || "google/gemini-3-flash-preview";
                  const origModelId = origModel.replace(/^[^\/]+\//, "");
                  const { data: mdl } = await supabase
                    .from("ai_models")
                    .select("credits_per_response")
                    .or(`model_id.eq.${origModelId},model_id.eq.${origModel}`)
                    .eq("is_enabled", true)
                    .maybeSingle();
                  const cost = mdl?.credits_per_response ?? 2;
                  const { data: crd } = await supabase
                    .from("user_credits")
                    .select("balance")
                    .eq("user_id", userId)
                    .maybeSingle();
                  if (!crd || crd.balance < cost) {
                    console.log(`[credits] Insufficient: balance=${crd?.balance ?? 0} < cost=${cost} for model ${origModel}. Skipping AI response.`);
                    return new Response(JSON.stringify({ status: "skipped", reason: "insufficient_credits" }), {
                      headers: { ...corsHeaders, "Content-Type": "application/json" },
                    });
                  }
                }

                const maxCharsVal = typeof (agent as any).max_response_chars === "number" && (agent as any).max_response_chars > 0
                  ? (agent as any).max_response_chars : undefined;
                const systemPromptFull = buildSystemPrompt(agent) + transferPrompt + calendarPrompt + knowledgeContext;
                let aiReply = "";
                try {
                  aiReply = await callAgentAI(
                    lovableApiKey,
                    systemPromptFull,
                    agent.model,
                    agent.temperature,
                    history,
                    maxCharsVal
                  );
                  console.log(`AI response received: ${aiReply ? aiReply.substring(0, 100) + '...' : '(empty)'} [length=${aiReply.length}]`);
                  // Check fallback rate and notify if too high
                  checkFallbackRateAndNotify(supabase, userId, "whatsapp").catch(() => {});
                } catch (aiCallErr) {
                  console.error(`AI gateway call failed for model ${agent.model} (resolved: ${resolveModel(agent.model)}):`, aiCallErr instanceof Error ? aiCallErr.message : aiCallErr);
                  throw aiCallErr;
                }

                // ── Process calendar markers (loop up to 2 times for consult→reply flow) ──
                for (let calLoop = 0; calLoop < 2 && aiReply.trim(); calLoop++) {
                  const calMarkers = extractCalendarMarkers(aiReply);
                  console.log(`[calendar] calLoop=${calLoop}, hasConsultar=${!!calMarkers.consultarHorarios}, hasAgendar=${!!calMarkers.agendar}, replyTail="${aiReply.slice(-80)}"`);
                  if (calMarkers.consultarHorarios) {
                    console.log(`[calendar] Checking availability for ${calMarkers.consultarHorarios.date}`);
                    const availabilityResult = await checkCalendarAvailability(
                      supabaseUrl,
                      serviceKey,
                      userId,
                      calMarkers.consultarHorarios.connectionId,
                      calMarkers.consultarHorarios.date,
                    );
                    
                    // Re-call AI with availability info — instruct it NOT to emit markers again
                    const updatedHistory = [
                      ...history,
                      { role: "assistant", content: calMarkers.cleanReply || "Vou verificar os horários disponíveis..." },
                      { role: "system", content: `[RESULTADO DA CONSULTA DE HORÁRIOS]\n${availabilityResult}\n\nIMPORTANTE: NÃO emita [CONSULTAR_HORARIOS] novamente. Apresente os horários acima ao cliente de forma amigável e pergunte qual ele prefere.` },
                    ];
                    
                    try {
                      aiReply = await callAgentAI(lovableApiKey, systemPromptFull, agent.model, agent.temperature, updatedHistory, maxCharsVal);
                      console.log(`[calendar] AI follow-up response: ${aiReply.substring(0, 200)}...`);
                      // Safety: if AI still emitted a CONSULTAR marker, strip it and use availability directly
                      const recheck = extractCalendarMarkers(aiReply);
                      if (recheck.consultarHorarios) {
                        console.warn("[calendar] AI re-emitted CONSULTAR marker after receiving results — using availability text directly");
                        const stripped = aiReply.replace(/\[CONSULTAR_HORARIOS:[^\]]*\][*\s]*/g, "").trim();
                        aiReply = stripped || availabilityResult;
                      }
                      // Update history
                      history.push({ role: "assistant", content: calMarkers.cleanReply || "Verificando horários..." });
                      history.push({ role: "user", content: `[Sistema: horários consultados]` });
                    } catch (err) {
                      console.error("[calendar] Follow-up AI call failed:", err);
                      aiReply = calMarkers.cleanReply || "Desculpe, houve um erro ao consultar os horários.";
                      break;
                    }
                    break; // Don't loop again — we already have the availability result
                  }
                  
                  if (calMarkers.agendar) {
                    console.log(`[calendar] Creating event: ${JSON.stringify(calMarkers.agendar)}`);
                    const eventResult = await createCalendarEvent(
                      supabaseUrl,
                      serviceKey,
                      userId,
                      calMarkers.agendar.connectionId,
                      calMarkers.agendar.startTime,
                      calMarkers.agendar.endTime,
                      calMarkers.agendar.name,
                      calMarkers.agendar.email,
                      calMarkers.agendar.subject,
                    );

                    // ── Register as task in /tarefas ──────────────────────────
                    if (eventResult.includes("✅")) {
                      try {
                        // Find or create a lead for this contact
                        let leadId: string | null = null;
                        const { data: existingLead } = await supabase
                          .from("leads")
                          .select("id")
                          .eq("user_id", userId)
                          .eq("name", calMarkers.agendar.name || contactName || "Contato WhatsApp")
                          .maybeSingle();

                        if (existingLead) {
                          leadId = existingLead.id;
                        } else {
                          const { data: newLead } = await supabase
                            .from("leads")
                            .insert({
                              user_id: userId,
                              name: calMarkers.agendar.name || contactName || "Contato WhatsApp",
                              email: calMarkers.agendar.email || null,
                              phone: contactPhone || null,
                              source: "whatsapp",
                              stage: "lead",
                            })
                            .select("id")
                            .single();
                          if (newLead) leadId = newLead.id;
                        }

                        if (leadId) {
                          // The AI sends startTime without timezone (e.g. "2025-03-15T15:00:00")
                          // but it's meant as America/Sao_Paulo time. Append offset so it's stored correctly.
                          let startTimeWithTz = calMarkers.agendar.startTime;
                          if (startTimeWithTz && !startTimeWithTz.match(/[Z+-]\d/)) {
                            startTimeWithTz = startTimeWithTz + "-03:00";
                          }
                          const startDt = new Date(startTimeWithTz);
                          const taskTitle = calMarkers.agendar.subject || `Reunião com ${calMarkers.agendar.name || contactName}`;
                          const timeStr = startDt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                          const dateStr = startDt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
                          await supabase.from("lead_tasks").insert({
                            lead_id: leadId,
                            user_id: userId,
                            title: taskTitle,
                            description: `[DT:${startTimeWithTz}]\nAgendamento via WhatsApp.\nParticipante: ${calMarkers.agendar.name || contactName}\n${calMarkers.agendar.email ? `E-mail: ${calMarkers.agendar.email}\n` : ""}Horário: ${dateStr} às ${timeStr}`,
                            task_type: "meeting",
                            due_date: startTimeWithTz,
                            status: "pending",
                          } as any);
                          console.log(`[calendar] Task registered in lead_tasks for lead ${leadId}`);
                        }
                      } catch (taskErr) {
                        console.error("[calendar] Failed to create lead_task:", taskErr);
                      }
                    }
                    
                    // Re-call AI with event result to get a nice confirmation message
                    const updatedHistory = [
                      ...history,
                      { role: "assistant", content: calMarkers.cleanReply || "Agendando..." },
                      { role: "system", content: `[RESULTADO DO AGENDAMENTO]\n${eventResult}\n\nIMPORTANTE: NÃO emita [AGENDAR] ou [CONSULTAR_HORARIOS] novamente. Confirme o agendamento ao cliente de forma amigável com os detalhes acima.` },
                    ];
                    
                    try {
                      aiReply = await callAgentAI(lovableApiKey, systemPromptFull, agent.model, agent.temperature, updatedHistory, maxCharsVal);
                      console.log(`[calendar] AI confirmation response: ${aiReply.substring(0, 200)}...`);
                      // Safety: if AI still emitted markers, use eventResult directly
                      if (aiReply.match(/\[AGENDAR:[^\]]*\]/) || aiReply.match(/\[CONSULTAR_HORARIOS:[^\]]*\]/)) {
                        console.warn("[calendar] AI re-emitted markers in confirmation — using event result directly");
                        const stripped = aiReply
                          .replace(/\[AGENDAR:[^\]]*\][*\s]*/g, "")
                          .replace(/\[CONSULTAR_HORARIOS:[^\]]*\][*\s]*/g, "")
                          .trim();
                        aiReply = stripped || eventResult;
                      }
                    } catch (err) {
                      console.error("[calendar] Confirmation AI call failed:", err);
                      aiReply = eventResult.includes("✅") ? eventResult : (calMarkers.cleanReply || eventResult);
                    }
                    break; // Don't loop after scheduling
                  }
                  
                  break; // No calendar markers, exit loop
                }

                if (!aiReply.trim()) {
                  console.warn(`AI returned empty response for conversation ${conversationId} — skipping reply`);
                }

                if (aiReply.trim()) {
                  // ── Strip any leftover calendar/internal markers the AI may have leaked ──
                  aiReply = aiReply
                    .replace(/\[CONSULTAR_HORARIOS:[^\]]*\][*\s]*/g, "")
                    .replace(/\[AGENDAR:[^\]]*\][*\s]*/g, "")
                    .trim();

                  if (!aiReply) {
                    console.warn("AI reply was only calendar markers — skipping");
                  }
                }

                if (aiReply.trim()) {
                  // ── Check for transfer marker ──────────────────────────
                  const { cleanReply, transferType, targetId, tagName } = extractMarkers(aiReply);
                  
                  if (transferType) {
                    // Find matching rule to get configured tags and fallback targetId
                    const matchedRule = findMatchingTransferRule(transferRules, transferType, targetId);
                    // If AI omitted the ID, use the rule's configured targetAgentId
                    const effectiveTargetId = targetId || (matchedRule?.targetAgentId && matchedRule.targetAgentId !== "todos" ? matchedRule.targetAgentId : null);
                    console.log(`[transfer] Detected transfer: type=${transferType}, aiTarget=${targetId}, effectiveTarget=${effectiveTargetId}, matchedRule=${matchedRule?.id}`);
                    
                    if (transferType === "humano") {
                      const updateData: Record<string, unknown> = { is_ai_active: false };
                      if (effectiveTargetId) {
                        updateData.assigned_to = effectiveTargetId;
                        console.log(`[transfer] Assigning conversation ${conversationId} to user ${effectiveTargetId}`);
                      }
                      await supabase.from("conversations").update(updateData).eq("id", conversationId);
                      console.log(`[transfer] Conversation ${conversationId} transferred to human`);
                      
                      // Create notification for the assigned user
                      if (effectiveTargetId) {
                        try {
                          await supabase.from("notifications").insert({
                            user_id: effectiveTargetId,
                            title: "Nova transferência recebida",
                            message: `Conversa com ${contactName || remoteJid} foi transferida para você`,
                            type: "transfer",
                            metadata: { conversation_id: conversationId, contact_name: contactName },
                          });
                        } catch (notifErr) {
                          console.error("Failed to create transfer notification:", notifErr);
                        }
                      }
                      fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "humano", transfer_user_id: effectiveTargetId });
                    } else if (transferType === "agente" && (targetId || matchedRule?.targetAgentId) && (targetId || matchedRule?.targetAgentId) !== "todos") {
                      const effectiveAgentTarget = targetId || matchedRule?.targetAgentId;
                      await supabase.from("conversations").update({ agent_id: effectiveAgentTarget }).eq("id", conversationId);
                      console.log(`[transfer] Conversation ${conversationId} transferred to agent ${effectiveAgentTarget}`);
                      fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "agente", transfer_agent_id: effectiveAgentTarget });
                    } else {
                      await supabase.from("conversations").update({ is_ai_active: false }).eq("id", conversationId);
                      console.log(`[transfer] Conversation ${conversationId} transferred to any agent (todos)`);
                      fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "todos" });
                    }

                    // ── Auto-tag from rule config ──────────────────────────
                    const ruleTags = matchedRule?.tags || [];
                    // Also include AI-detected tag if present
                    const allTags = [...ruleTags];
                    if (tagName && !allTags.some(t => t.toLowerCase() === tagName.toLowerCase())) {
                      allTags.push(tagName);
                    }
                    for (const tn of allTags) {
                      try {
                        let { data: existingTag } = await supabase
                          .from("tags")
                          .select("id")
                          .eq("user_id", userId)
                          .ilike("name", tn)
                          .maybeSingle();
                        if (!existingTag) {
                          const { data: newTag } = await supabase
                            .from("tags")
                            .insert({ user_id: userId, name: tn, color: "#6366f1" })
                            .select("id")
                            .single();
                          existingTag = newTag;
                        }
                        if (existingTag) {
                          const { data: existingLink } = await supabase
                            .from("conversation_tags")
                            .select("id")
                            .eq("conversation_id", conversationId)
                            .eq("tag_id", existingTag.id)
                            .maybeSingle();
                          if (!existingLink) {
                            await supabase.from("conversation_tags").insert({
                              conversation_id: conversationId,
                              tag_id: existingTag.id,
                            });
                            console.log(`[tag] Added tag "${tn}" to conversation ${conversationId}`);
                          }
                        }
                      } catch (tagErr) {
                        console.error(`Failed to auto-tag "${tn}":`, tagErr);
                      }
                    }
                  } else if (tagName) {
                    // Tag without transfer
                    try {
                      let { data: existingTag } = await supabase
                        .from("tags")
                        .select("id")
                        .eq("user_id", userId)
                        .ilike("name", tagName)
                        .maybeSingle();
                      if (!existingTag) {
                        const { data: newTag } = await supabase
                          .from("tags")
                          .insert({ user_id: userId, name: tagName, color: "#6366f1" })
                          .select("id")
                          .single();
                        existingTag = newTag;
                      }
                      if (existingTag) {
                        const { data: existingLink } = await supabase
                          .from("conversation_tags")
                          .select("id")
                          .eq("conversation_id", conversationId)
                          .eq("tag_id", existingTag.id)
                          .maybeSingle();
                        if (!existingLink) {
                          await supabase.from("conversation_tags").insert({
                            conversation_id: conversationId,
                            tag_id: existingTag.id,
                          });
                          console.log(`[tag] Added tag "${tagName}" to conversation ${conversationId}`);
                        }
                      }
                    } catch (tagErr) {
                      console.error("Failed to auto-tag conversation:", tagErr);
                    }
                  }

                  // ── Truncate to max_response_chars if configured ──────────
                  const maxRespChars = typeof (agent as any).max_response_chars === "number" && (agent as any).max_response_chars > 0
                    ? (agent as any).max_response_chars
                    : null;
                  const truncatedReply = maxRespChars && cleanReply.length > maxRespChars
                    ? cleanReply.slice(0, maxRespChars).trimEnd()
                    : cleanReply;
                  // ── Deduct credits (fire-and-forget for speed) ──────────
                  (async () => {
                    try {
                      const origMdl = agent.model || "google/gemini-3-flash-preview";
                      const origMdlId = origMdl.replace(/^[^/]+\//, "");
                      const { data: modelData } = await supabase
                        .from("ai_models")
                        .select("credits_per_response")
                        .or(`model_id.eq.${origMdlId},model_id.eq.${origMdl}`)
                        .eq("is_enabled", true)
                        .maybeSingle();
                      const creditsToDeduct = modelData?.credits_per_response ?? 2;
                      await supabase.rpc("deduct_credits", {
                        _user_id: userId,
                        _amount: creditsToDeduct,
                        _model_id: agent.model || "google/gemini-3-flash-preview",
                        _agent_id: agentId,
                        _description: `WhatsApp: resposta do agente (${agent.model})`,
                      });
                      console.log(`Credits deducted: ${creditsToDeduct} for user ${userId}`);
                    } catch (creditErr) {
                      console.error("Failed to deduct credits:", creditErr);
                    }
                  })();

                  // Save AI reply parts individually so chat UI matches what the client sees
                  const shouldSplitForSave = agent.split_responses === true;
                  const maxCharsForSave = typeof agent.split_response_max_chars === "number" && agent.split_response_max_chars > 0
                    ? agent.split_response_max_chars
                    : 300;
                  const replyParts = shouldSplitForSave ? splitTextIntoParts(truncatedReply, maxCharsForSave) : [truncatedReply];
                  const saveTs = Date.now();
                  const savePromise = (async () => {
                    for (let si = 0; si < replyParts.length; si++) {
                      await supabase.from("messages").insert({
                        conversation_id: conversationId,
                        user_id: userId,
                        remote_jid: remoteJid,
                        content: replyParts[si],
                        sender: "agent",
                        message_id: `ai-${saveTs}-${si}`,
                        timestamp: new Date(Date.now() + si).toISOString(),
                      });
                    }
                    const lastPart = replyParts[replyParts.length - 1];
                    await supabase.from("conversations").update({
                      last_message: lastPart,
                      last_message_at: new Date().toISOString(),
                      last_message_sender: "agent",
                    }).eq("id", conversationId);
                  })();

                  // Send via Evolution API — start sending immediately
                  const evoUrl = (Deno.env.get("EVO_URL") || DEFAULT_EVO_URL).replace(/\/$/, "");
                  const evoKey = Deno.env.get("EVO_KEY") || DEFAULT_EVO_KEY;
                  if (evoUrl && evoKey && instanceName) {
                    const isAiStillActive = async () => {
                      const { data: liveConv } = await supabase
                        .from("conversations")
                        .select("is_ai_active")
                        .eq("id", conversationId)
                        .maybeSingle();
                      return liveConv?.is_ai_active !== false;
                    };

                    // ── Apply response delay before sending ──────────────────
                    const delaySecs = typeof agent.response_delay_seconds === "number" ? agent.response_delay_seconds : 0;
                    if (delaySecs > 0) {
                      console.log(`[delay] Waiting ${delaySecs}s before sending reply...`);
                      await new Promise(resolve => setTimeout(resolve, delaySecs * 1000));
                    }

                    // Hard stop: user may have disabled AI during generation/delay
                    if (!(await isAiStillActive())) {
                      console.log(`[whatsapp] AI disabled after generation for conversation ${conversationId} — aborting send`);
                    } else {
                      // ── ElevenLabs TTS: generate audio if configured ─────────
                      const elEnabled = (agent as any).elevenlabs_enabled === true;
                      const elApiKey = (agent as any).elevenlabs_api_key as string | null;
                      const elAlwaysAudio = (agent as any).elevenlabs_always_audio === true;
                      const elAudioOnAudio = (agent as any).elevenlabs_audio_on_audio === true;
                      const incomingWasAudio = mediaType === "audio";
                      const shouldSendAudio = elEnabled && elApiKey && (elAlwaysAudio || (elAudioOnAudio && incomingWasAudio));

                      if (shouldSendAudio) {
                        console.log(`[tts] Generating ElevenLabs TTS (always=${elAlwaysAudio}, audioOnAudio=${elAudioOnAudio}, incomingAudio=${incomingWasAudio})`);
                        const audioBase64 = await generateTTS(
                          elApiKey!,
                          truncatedReply,
                          (agent as any).elevenlabs_voice_id || "iP95p4xoKVk53GoZ742B",
                          (agent as any).elevenlabs_model || "eleven_multilingual_v2",
                          (agent as any).elevenlabs_stability ?? 0.5,
                          (agent as any).elevenlabs_similarity ?? 0.75,
                          (agent as any).elevenlabs_style ?? 0.5,
                          (agent as any).elevenlabs_speed ?? 1.0,
                          (agent as any).elevenlabs_speaker_boost ?? true,
                        );
                        if (!(await isAiStillActive())) {
                          console.log(`[whatsapp] AI disabled before TTS send for conversation ${conversationId} — aborting send`);
                        } else if (audioBase64) {
                          const audioSent = await sendWhatsAppAudio(evoUrl, evoKey, instanceName, remoteJid, audioBase64);
                          if (audioSent) {
                            console.log(`[tts] Audio response sent successfully to ${remoteJid}`);
                          } else {
                            console.log("[tts] Audio send failed, falling back to text");
                            await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, truncatedReply);
                          }
                        } else {
                          console.log("[tts] TTS generation failed, falling back to text");
                          await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, truncatedReply);
                        }
                      } else {
                        // ── Split response if configured ─────────────────────────
                        const shouldSplit = agent.split_responses === true;
                        const maxChars = typeof agent.split_response_max_chars === "number" && agent.split_response_max_chars > 0
                          ? agent.split_response_max_chars
                          : 300;
                        const partDelayMs = typeof (agent as any).split_delay_ms === "number" && (agent as any).split_delay_ms >= 0
                          ? (agent as any).split_delay_ms
                          : 800;

                        if (shouldSplit) {
                          const parts = splitTextIntoParts(truncatedReply, maxChars);
                          console.log(`[split] Splitting reply into ${parts.length} parts (maxChars=${maxChars}, delayMs=${partDelayMs})`);
                          for (let i = 0; i < parts.length; i++) {
                            if (!(await isAiStillActive())) {
                              console.log(`[whatsapp] AI disabled during split send for conversation ${conversationId} — stopping remaining parts`);
                              break;
                            }
                            await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, parts[i]);
                            if (i < parts.length - 1 && partDelayMs > 0) {
                              await new Promise(resolve => setTimeout(resolve, partDelayMs));
                            }
                          }
                        } else {
                          if (await isAiStillActive()) {
                            await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, truncatedReply);
                          } else {
                            console.log(`[whatsapp] AI disabled before final send for conversation ${conversationId} — aborting send`);
                          }
                        }
                      }
                    }
                  } else {
                    console.log("EVO_URL/EVO_KEY not configured — AI reply saved but not sent");
                  }
                  // Ensure DB writes complete
                  await savePromise;
                }
              } catch (aiErr) {
                const aiErrorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);
                console.error("AI reply error:", aiErrorMessage);
                // Fire nao_soube_responder webhook
                fireWebhookRules(agentWebhookRules, "nao_soube_responder", { ...webhookPayload, error: aiErrorMessage });

                // Fallback: never stay silent with active AI
                const fallbackMsg = aiErrorMessage.includes("403")
                  ? "Estou com instabilidade temporária no motor de IA. Tente novamente em instantes."
                  : "Desculpe, tive uma falha para responder agora. Pode tentar novamente?";

                try {
                  await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    remote_jid: remoteJid,
                    content: fallbackMsg,
                    sender: "agent",
                    message_id: `ai-fallback-${Date.now()}`,
                    timestamp: new Date().toISOString(),
                  });

                  await supabase.from("conversations").update({
                    last_message: fallbackMsg,
                    last_message_at: new Date().toISOString(),
                    last_message_sender: "agent",
                  }).eq("id", conversationId);

                  const evoUrl = (Deno.env.get("EVO_URL") || DEFAULT_EVO_URL).replace(/\/$/, "");
                  const evoKey = Deno.env.get("EVO_KEY") || DEFAULT_EVO_KEY;
                  if (evoUrl && evoKey && instanceName) {
                    await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, fallbackMsg);
                  }
                } catch (fallbackErr) {
                  console.error("Fallback reply failed:", fallbackErr);
                }
              }
              } // end else (interaction limit not reached)
            }
          }
        }
      }

      // ── FALLBACK: audio transcription failed → reply asking for text ────────
      if (!fromMe && isAiActive && audioTranscriptionFailed && !aiTextContent) {
        const fallbackMsg = "Desculpe, não consegui entender o áudio. Poderia enviar sua mensagem em texto, por favor? 🙏";
        const evoUrl = (Deno.env.get("EVO_URL") || DEFAULT_EVO_URL).replace(/\/$/, "");
        const evoKey = Deno.env.get("EVO_KEY") || DEFAULT_EVO_KEY;
        if (evoUrl && evoKey && instanceName) {
          const { data: liveConv } = await supabase
            .from("conversations")
            .select("is_ai_active")
            .eq("id", conversationId)
            .maybeSingle();
          if (liveConv?.is_ai_active === false) {
            console.log(`[whatsapp] AI disabled before fallback send for conversation ${conversationId} — skipping fallback`);
          } else {
            // Save fallback reply as message
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              user_id: userId,
              remote_jid: remoteJid,
              content: fallbackMsg,
              sender: "agent",
              message_id: `fallback-${Date.now()}`,
              timestamp: new Date().toISOString(),
            });
            await supabase.from("conversations").update({
              last_message: fallbackMsg,
              last_message_at: new Date().toISOString(),
              last_message_sender: "agent",
              last_message_media_type: null,
            }).eq("id", conversationId);
            await sendWhatsAppMessage(evoUrl, evoKey, instanceName, remoteJid, fallbackMsg);
            console.log("Sent audio fallback text reply");
          }
        }
      }
      // ── END AI ROUTING ──────────────────────────────────────────────────────
    }
}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "text-embedding-3-small";

// ── In-memory fallback rate tracker ──
const FALLBACK_WINDOW_MS = 10 * 60 * 1000;
const FALLBACK_ALERT_COOLDOWN_MS = 30 * 60 * 1000;
interface AiCallRecord { ts: number; isFallback: boolean }
const aiCallRecords: AiCallRecord[] = [];
let lastFallbackAlertTs = 0;

function trackAiCall(isFallback: boolean) {
  const now = Date.now();
  aiCallRecords.push({ ts: now, isFallback });
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
  if (total < 4) return;
  if (rate <= 0.5) return;
  const now = Date.now();
  if (now - lastFallbackAlertTs < FALLBACK_ALERT_COOLDOWN_MS) return;
  lastFallbackAlertTs = now;
  const pct = Math.round(rate * 100);
  console.warn(JSON.stringify({ tag: "FALLBACK_RATE_ALERT", channel, rate: pct, total, fallbacks }));
  try {
    await (supabase as any).from("notifications").insert({
      user_id: userId,
      title: `⚠️ Taxa de fallback de IA alta: ${pct}%`,
      message: `Nos últimos 10 min, ${fallbacks} de ${total} chamadas (${channel}) usaram modelo de fallback. Verifique o modelo do agente.`,
      type: "ai_alert",
    });
  } catch (e) {
    console.error("Failed to insert fallback alert notification:", e);
  }
}

// ── Transcribe audio using Whisper via Lovable AI Gateway ────────────────────
async function transcribeAudio(audioBytes: Uint8Array, mimetype: string, apiKey: string): Promise<string> {
  try {
    const ext = mimetype.includes("ogg") || mimetype.includes("opus") ? "ogg"
      : mimetype.includes("mp4") || mimetype.includes("m4a") ? "m4a"
      : mimetype.includes("webm") ? "webm"
      : mimetype.includes("wav") ? "wav"
      : "ogg";
    const formData = new FormData();
    formData.append("file", new Blob([audioBytes as any], { type: mimetype }), `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });
    if (!response.ok) {
      console.error("Whisper transcription failed:", response.status, await response.text());
      return "";
    }
    const data = await response.json();
    return data.text?.trim() || "";
  } catch (err) {
    console.error("Whisper transcription error:", err);
    return "";
  }
}

async function downloadAudioFromUrl(url: string): Promise<{ bytes: Uint8Array; mimetype: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    const mimetype = resp.headers.get("content-type") || "audio/ogg";
    return { bytes: new Uint8Array(buffer), mimetype };
  } catch { return null; }
}

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
  } catch { return null; }
}

async function loadKnowledgeFallback(
  supabase: any,
  fileIds: string[],
): Promise<string> {
  const { data: files } = await supabase.from("knowledge_files")
    .select("id, file_name, storage_path, source_type, source_url, content").in("id", fileIds);
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
  return `\n\n## Base de Conhecimento\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections.join("\n\n")}`;
}

// ── Semantic RAG ─────────────────────────────────────────────────────────────
async function semanticKnowledgeSearch(
  supabase: any,
  agentId: string,
  userQuestion: string,
  apiKey: string,
): Promise<string> {
  try {
    const { data: links } = await supabase.from("agent_knowledge_files")
      .select("knowledge_file_id").eq("agent_id", agentId);
    if (!links || links.length === 0) return "";
    const fileIds = links.map((l: { knowledge_file_id: string }) => l.knowledge_file_id);

    const { count } = await supabase.from("knowledge_chunks")
      .select("id", { count: "exact", head: true }).in("knowledge_file_id", fileIds);

    if (!count || count === 0) return await loadKnowledgeFallback(supabase, fileIds);

    const queryEmbedding = await embedQuery(userQuestion, apiKey);
    if (!queryEmbedding) return await loadKnowledgeFallback(supabase, fileIds);

    const { data: chunks, error } = await supabase.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      knowledge_file_ids: fileIds,
      match_count: 6,
      match_threshold: 0.25,
    });

    if (error || !chunks || chunks.length === 0) {
      const { data: fallback } = await supabase.rpc("match_knowledge_chunks", {
        query_embedding: JSON.stringify(queryEmbedding),
        knowledge_file_ids: fileIds,
        match_count: 3,
        match_threshold: 0.0,
      });
      if (!fallback || fallback.length === 0) return "";
      return `\n\n## Base de Conhecimento (trechos relevantes)\n\n${fallback.map((c: { content: string }) => c.content).join("\n\n---\n\n")}`;
    }

    const sections = chunks.map((c: { content: string; similarity: number }) =>
      `[Relevância: ${(c.similarity * 100).toFixed(0)}%]\n${c.content}`
    ).join("\n\n---\n\n");

    console.log(`[RAG] Telegram: ${chunks.length} chunks retrieved`);
    return `\n\n## Base de Conhecimento (trechos relevantes)\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections}`;
  } catch (err) {
    console.error("[RAG] telegram-webhook error:", err);
    return "";
  }
}

// ── Model resolver ─────────────────────────────────────────────────────────────
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
    if (normalized.includes("gpt-4o") || normalized.includes("gpt-4.1") || normalized.includes("gpt-4")) {
      return "google/gemini-3-flash-preview";
    }
    if (normalized.includes("gpt-3.5") || normalized.includes("gpt-3")) {
      return "google/gemini-2.5-flash-lite";
    }
    if (normalized.includes("gemini")) {
      return "google/gemini-3-flash-preview";
    }
    console.log(`[model] Unknown model '${model}' — falling back to gemini-3-flash-preview`);
    return "google/gemini-3-flash-preview";
  }
  return model;
}

// ── Transfer rule interface ───────────────────────────────────────────────────
interface TransferRule {
  id: number;
  targetType: string;
  targetAgentId?: string;
  instructions: string;
  returnOnFinish: boolean;
  silentTransfer: boolean;
  tags?: string[];
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

function findMatchingTransferRule(transferRules: TransferRule[], transferType: string, targetId: string | null): TransferRule | null {
  if (targetId) {
    const exact = transferRules.find(r => r.targetType === transferType && r.targetAgentId === targetId);
    if (exact) return exact;
  }
  const typeMatch = transferRules.find(r => r.targetType === transferType);
  return typeMatch || null;
}

function extractMarkers(reply: string): { cleanReply: string; transferType: string | null; targetId: string | null; tagName: string | null } {
  let text = reply;
  const tagRegex = /\[ETIQUETA:([^\]]+)\]/g;
  let tagName: string | null = null;
  const tagMatch = text.match(tagRegex);
  if (tagMatch) {
    const parsed = tagMatch[0].match(/\[ETIQUETA:([^\]]+)\]/);
    tagName = parsed?.[1]?.trim() || null;
    text = text.replace(tagRegex, "").trim();
  }
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

// ── Build system prompt respecting agent settings ─────────────────────────────
function buildSystemPrompt(agent: Record<string, unknown>): string {
  let prompt = (agent.instructions as string) || "Você é um assistente de IA útil e amigável.";

  const extras: string[] = [];
  if (agent.product_name) extras.push(`Produto/Serviço: ${agent.product_name}`);
  if (agent.product_description) extras.push(`Descrição: ${agent.product_description}`);
  if (agent.official_site) extras.push(`Site oficial: ${agent.official_site}`);
  if (extras.length > 0) prompt += `\n\n## Sobre o Produto\n${extras.join("\n")}`;

  if (agent.prompt_o_que_fazer) prompt += `\n\n## O que fazer\n${agent.prompt_o_que_fazer}`;
  if (agent.prompt_como_pergunta) prompt += `\n\n## Como perguntar\n${agent.prompt_como_pergunta}`;
  if (agent.prompt_nao_fazer) prompt += `\n\n## O que NÃO fazer\n${agent.prompt_nao_fazer}`;

  const rules: string[] = [];
  if (agent.use_emojis === false) rules.push("- NÃO use emojis nas respostas.");
  else rules.push("- Você PODE usar emojis nas respostas.");
  if (agent.sign_agent_name === true) rules.push(`- SEMPRE finalize suas mensagens com uma linha em branco seguida do seu nome em negrito. Formato exato:\n\n[sua resposta aqui]\n\n*${agent.name || "Assistente"}*\n\nNunca esqueça de adicionar a assinatura *${agent.name || "Assistente"}* ao final.`);
  if (agent.restrict_topics === true) rules.push("- Responda APENAS sobre tópicos relacionados ao produto/serviço. Recuse educadamente outros assuntos.");
  if (agent.split_responses === true) {
    const maxChars = agent.split_response_max_chars ? ` Cada parte deve ter no máximo ${agent.split_response_max_chars} caracteres.` : "";
    rules.push(`- Se a resposta for longa, divida em partes menores.${maxChars}`);
  }
  if (agent.allow_reminders === true) rules.push("- Você pode registrar lembretes para o usuário quando solicitado.");
  if (agent.agent_timezone) rules.push(`- Seu timezone é ${agent.agent_timezone}. Use isso para datas e horários.`);
  if (agent.max_response_chars && Number(agent.max_response_chars) > 0) {
    rules.push(`- IMPORTANTE: Sua resposta DEVE ter no MÁXIMO ${agent.max_response_chars} caracteres. Resuma o conteúdo para caber nesse limite. Seja conciso e direto.`);
  }
  if (rules.length > 0) prompt += `\n\n## Regras de comportamento\n${rules.join("\n")}`;

  return prompt;
}

// ── AI Gateway ────────────────────────────────────────────────────────────────
const FIXED_TEMPERATURE_PREFIXES = ["o1", "o3", "o4", "gpt-5"];

function modelSupportsTemperature(model: string): boolean {
  const modelName = model.includes("/") ? model.split("/").pop()! : model;
  return !FIXED_TEMPERATURE_PREFIXES.some(prefix => modelName.startsWith(prefix));
}

async function callAgentAI(
  lovableApiKey: string,
  instructions: string,
  model: string,
  temperature: number,
  history: { role: string; content: string }[],
  knowledgeContext: string = "",
  maxResponseChars?: number
): Promise<string> {
  const systemPrompt = (instructions || "Você é um assistente útil e amigável.") + knowledgeContext;
  const resolvedModel = resolveModel(model);

  const t0 = Date.now();
  const attempts: { model: string; status: number; ms: number; reason: string }[] = [];

  // Build fallback chain
  const fallbackModels = [resolvedModel, "google/gemini-3-flash-preview", "google/gemini-2.5-flash-lite"]
    .filter((m, i, arr) => arr.indexOf(m) === i);

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

    if (maxResponseChars && maxResponseChars > 0) {
      const tokenLimit = Math.max(256, Math.ceil(maxResponseChars / 2.5));
      body[usesNewParam ? "max_completion_tokens" : "max_tokens"] = tokenLimit;
    } else {
      body[usesNewParam ? "max_completion_tokens" : "max_tokens"] = 4096;
    }

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
        channel: "telegram",
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
        channel: "telegram",
        failed_model: modelToTry,
        status: response.status,
        attempt_ms: attemptMs,
        next_model: fallbackModels[fallbackModels.indexOf(modelToTry) + 1],
      }));
      continue;
    }

    console.error(JSON.stringify({
      tag: "AI_CALL_FAIL",
      channel: "telegram",
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
    channel: "telegram",
    requested_model: model,
    resolved_model: resolvedModel,
    total_ms: Date.now() - t0,
    attempts_detail: attempts,
  }));
  throw new Error("All fallback models failed");
}

// ── Split text into parts respecting sentence/paragraph boundaries ────────────
function splitIntoSentences(text: string): string[] {
  const result: string[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) { result.push("\n"); continue; }
    const sentenceRegex = /(.+?(?:[.!?](?:\s|$)))/g;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = sentenceRegex.exec(line)) !== null) {
      const sentence = match[1];
      const dotPos = sentence.lastIndexOf(".");
      const hasEmailOrUrl = sentence.includes("@") || sentence.includes("://") || sentence.includes("www.");
      if (hasEmailOrUrl && dotPos > 0 && dotPos < sentence.length - 2) {
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
  const paragraphs = text.split(/\n\n+/);
  let current = "";
  for (const para of paragraphs) {
    if (!para.trim()) continue;
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

// ── Send Telegram message ─────────────────────────────────────────────────────
async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<void> {
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

// ── Send Telegram audio ───────────────────────────────────────────────────────
async function sendTelegramAudio(
  botToken: string,
  chatId: number | string,
  audioUrl: string,
  mimeType?: string,
): Promise<boolean> {
  // Download the audio from the URL
  const audioResp = await fetch(audioUrl);
  if (!audioResp.ok) {
    throw new Error(`Failed to download audio: ${audioResp.status}`);
  }
  const audioBlob = await audioResp.blob();

  // Determine file extension from mimeType
  let ext = "ogg";
  if (mimeType?.includes("mp3") || mimeType?.includes("mpeg")) ext = "mp3";
  else if (mimeType?.includes("mp4") || mimeType?.includes("m4a")) ext = "m4a";
  else if (mimeType?.includes("wav")) ext = "wav";
  else if (mimeType?.includes("webm")) ext = "webm";

  // Try sendVoice first (better UX for voice messages)
  const voiceForm = new FormData();
  voiceForm.append("chat_id", String(chatId));
  voiceForm.append("voice", audioBlob, `voice.${ext}`);

  const voiceResp = await fetch(`https://api.telegram.org/bot${botToken}/sendVoice`, {
    method: "POST",
    body: voiceForm,
  });

  if (voiceResp.ok) {
    const voiceResult = await voiceResp.json();
    if (voiceResult.ok) return true;
  }

  // Fallback: if sendVoice rejects the format, send as audio file (sendAudio)
  const audioForm = new FormData();
  audioForm.append("chat_id", String(chatId));
  audioForm.append("audio", audioBlob, `audio.${ext}`);

  const audioSendResp = await fetch(`https://api.telegram.org/bot${botToken}/sendAudio`, {
    method: "POST",
    body: audioForm,
  });

  if (!audioSendResp.ok) {
    throw new Error(`sendAudio failed: ${audioSendResp.status}`);
  }

  const audioResult = await audioSendResp.json();
  if (!audioResult.ok) {
    throw new Error(`Telegram sendAudio error: ${JSON.stringify(audioResult)}`);
  }
  return true;
}

// ── Send Telegram photo ───────────────────────────────────────────────────────
async function sendTelegramPhoto(
  botToken: string,
  chatId: number | string,
  photoUrl: string,
  caption?: string,
): Promise<void> {
  // Download the photo
  const photoResp = await fetch(photoUrl);
  if (!photoResp.ok) throw new Error(`Failed to download photo: ${photoResp.status}`);
  const photoBlob = await photoResp.blob();

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", photoBlob, "photo.jpg");
  if (caption) form.append("caption", caption);

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw new Error(`sendPhoto failed: ${resp.status}`);
}

// ── Send Telegram video ───────────────────────────────────────────────────────
async function sendTelegramVideo(
  botToken: string,
  chatId: number | string,
  videoUrl: string,
  caption?: string,
): Promise<void> {
  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) throw new Error(`Failed to download video: ${videoResp.status}`);
  const videoBlob = await videoResp.blob();

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("video", videoBlob, "video.mp4");
  if (caption) form.append("caption", caption);

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw new Error(`sendVideo failed: ${resp.status}`);
}

// ── Send Telegram document ────────────────────────────────────────────────────
async function sendTelegramDocument(
  botToken: string,
  chatId: number | string,
  docUrl: string,
  fileName: string,
  caption?: string,
): Promise<void> {
  const docResp = await fetch(docUrl);
  if (!docResp.ok) throw new Error(`Failed to download document: ${docResp.status}`);
  const docBlob = await docResp.blob();

  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", docBlob, fileName);
  if (caption) form.append("caption", caption);

  const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!resp.ok) throw new Error(`sendDocument failed: ${resp.status}`);
}

// ── Get Telegram profile photo ────────────────────────────────────────────────
async function getTelegramProfilePhoto(botToken: string, userId: number): Promise<string | null> {
  try {
    const photosResp = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`,
    );
    if (!photosResp.ok) return null;
    const photosData = await photosResp.json();
    if (!photosData.ok || !photosData.result?.photos?.length) return null;

    const fileId = photosData.result.photos[0][0]?.file_id;
    if (!fileId) return null;

    const fileResp = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
    );
    if (!fileResp.ok) return null;
    const fileData = await fileResp.json();
    if (!fileData.ok || !fileData.result?.file_path) return null;

    return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
  } catch {
    return null;
  }
}

// ── Download Telegram file ────────────────────────────────────────────────────
async function getTelegramFileUrl(botToken: string, fileId: string): Promise<string | null> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.ok || !data.result?.file_path) return null;
    return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
  } catch {
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

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lovableApiKey = (Deno.env.get("LOVABLE_API_KEY") || "").trim();

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);

    // ── Manual send action ──────────────────────────────────────────────────
    if (url.searchParams.get("action") === "send") {
      const { botToken, chatId, text } = await req.json();
      if (!botToken || !chatId || !text) {
        return new Response(JSON.stringify({ ok: false, error: "Missing botToken, chatId, or text" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const tgResp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      const tgData = await tgResp.json();
      return new Response(JSON.stringify(tgData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Register webhook action ─────────────────────────────────────────────
    if (url.searchParams.get("action") === "register") {
      const { botToken, connectionId } = await req.json();
      if (!botToken || !connectionId) {
        return new Response(JSON.stringify({ ok: false, error: "Missing botToken or connectionId" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook?connId=${connectionId}`;
      const tgResp = await fetch(
        `https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      );
      const tgData = await tgResp.json();

      if (tgData.ok) {
        // Save webhook_url to DB
        await supabase
          .from("telegram_connections")
          .update({ webhook_url: webhookUrl })
          .eq("id", connectionId);
      }

      return new Response(JSON.stringify(tgData), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Incoming webhook from Telegram ──────────────────────────────────────
    const connId = url.searchParams.get("connId");
    if (!connId) {
      return new Response(JSON.stringify({ ok: true, msg: "No connId" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch connection info
    const { data: conn } = await supabase
      .from("telegram_connections")
      .select("id, bot_token, user_id")
      .eq("id", connId)
      .maybeSingle();

    if (!conn?.bot_token || !conn?.user_id) {
      return new Response(JSON.stringify({ ok: true, msg: "Connection not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const message = body.message || body.edited_message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Respond immediately so Telegram doesn't retry; process in background
    const processPromise = processTelegramMessage(supabase, lovableApiKey, conn, body, message).catch(err =>
      console.error("Telegram background processing error:", err)
    );
    // @ts-ignore
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(processPromise);
    } else {
      await processPromise;
    }
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("telegram-webhook error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processTelegramMessage(
  supabase: ReturnType<typeof createClient>,
  lovableApiKey: string,
  conn: { id: string; bot_token: string; user_id: string },
  _body: Record<string, unknown>,
  message: Record<string, unknown>,
) {
  const botToken = conn.bot_token;
  const userId = conn.user_id;
  const telegramConnId = conn.id;

  const chatId = message.chat?.id;
  const fromId = message.from?.id;
  const fromName = message.from?.first_name
    ? `${message.from.first_name}${message.from.last_name ? " " + message.from.last_name : ""}`
    : message.from?.username || "Unknown";

  if (!chatId) return;

    // ── Determine content type ──────────────────────────────────────────────
    let textContent = message.text || message.caption || "";
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;

    if (message.photo) {
      // Largest photo
      const photo = message.photo[message.photo.length - 1];
      mediaUrl = await getTelegramFileUrl(botToken, photo.file_id);
      mediaType = "image";
    } else if (message.video) {
      mediaUrl = await getTelegramFileUrl(botToken, message.video.file_id);
      mediaType = "video";
    } else if (message.audio) {
      mediaUrl = await getTelegramFileUrl(botToken, message.audio.file_id);
      mediaType = "audio";
    } else if (message.voice) {
      mediaUrl = await getTelegramFileUrl(botToken, message.voice.file_id);
      mediaType = "audio";
    } else if (message.document) {
      mediaUrl = await getTelegramFileUrl(botToken, message.document.file_id);
      mediaType = "document";
    } else if (message.sticker) {
      textContent = `[Sticker: ${message.sticker.emoji || "🎭"}]`;
    }

    const remoteJid = `telegram:${chatId}`;
    const contactName = fromName;
    const contactPhone = fromId ? String(fromId) : null;

    // ── Fetch profile picture (async, non-blocking) ─────────────────────────
    let profilePictureUrl: string | null = null;
    if (fromId) {
      profilePictureUrl = await getTelegramProfilePhoto(botToken, fromId).catch(() => null);
    }

    // ── Find or create conversation ─────────────────────────────────────────
    const { data: existingConv } = await supabase
      .from("conversations")
      .select("id, is_ai_active, agent_id, unread_count, updated_at")
      .eq("user_id", userId)
      .eq("remote_jid", remoteJid)
      .maybeSingle();

    let conversationId: string;
    let isAiActive = true;
    let conversationAgentId: string | null = null;
    let conversationReopenedAt: string | null = null;

    if (existingConv) {
      conversationId = existingConv.id;
      isAiActive = existingConv.is_ai_active ?? true;
      conversationAgentId = existingConv.agent_id || null;

      const tgUpdates: Record<string, unknown> = {
        last_message: textContent || `[${mediaType || "media"}]`,
        last_message_at: new Date().toISOString(),
        last_message_sender: "user",
        last_message_media_type: mediaType,
        unread_count: (existingConv.unread_count || 0) + 1,
        profile_picture_url: profilePictureUrl ?? undefined,
      };
      // Reopen resolved conversations when user sends a new message
      if ((existingConv as any).is_resolved) {
        tgUpdates.is_resolved = false;
        tgUpdates.is_ai_active = true;
        tgUpdates.assigned_to = null;
        tgUpdates.updated_at = new Date().toISOString();
        conversationReopenedAt = new Date().toISOString();
      }
      await supabase.from("conversations").update(tgUpdates).eq("id", conversationId);

      // Create persistent notification for new incoming Telegram message
      const notifTarget = (existingConv as any).assigned_to || userId;
      const senderLabel = firstName || username || chatId;
      try {
        await supabase.from("notifications").insert({
          user_id: notifTarget,
          type: "new_message",
          title: `Nova mensagem de ${senderLabel}`,
          message: (textContent || `[${mediaType || "media"}]`).substring(0, 200),
          metadata: { conversation_id: conversationId, remote_jid: remoteJid },
        });
      } catch (e) { console.error("Failed to create Telegram notification:", e); }
    } else {
      // Find agent linked to this telegram connection via telegram_connection_id
      const { data: linkedAgent } = await supabase
        .from("agents")
        .select("id, webhook_rules")
        .eq("telegram_connection_id", telegramConnId)
        .eq("status", "active")
        .maybeSingle();

      conversationAgentId = linkedAgent?.id || null;

      // Will fire primeiro_atendimento after conv is created
      const linkedWebhookRules = linkedAgent?.webhook_rules;

      const { data: newConv, error: convError } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          connection_id: null, // Telegram — no wuzapi connection
          agent_id: conversationAgentId,
          remote_jid: remoteJid,
          contact_name: contactName,
          contact_phone: contactPhone,
          last_message: textContent || `[${mediaType || "media"}]`,
          last_message_at: new Date().toISOString(),
          last_message_sender: "user",
          last_message_media_type: mediaType,
          profile_picture_url: profilePictureUrl,
          unread_count: 1,
          is_ai_active: true,
        })
        .select()
        .single();

      if (convError || !newConv) {
        console.error("Failed to create conversation:", convError);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      conversationId = newConv.id;

      // Fire primeiro_atendimento + iniciar_atendimento webhook events
      if (linkedWebhookRules) {
        const webhookPayload = { contact_name: contactName, contact_phone: contactPhone, remote_jid: remoteJid, conversation_id: newConv.id, agent_id: conversationAgentId, channel: "telegram" };
        fireWebhookRules(linkedWebhookRules as any, "primeiro_atendimento", webhookPayload);
        fireWebhookRules(linkedWebhookRules as any, "iniciar_atendimento", webhookPayload);
      }

      // Create notification for new Telegram conversation
      try {
        await supabase.from("notifications").insert({
          user_id: userId,
          type: "new_message",
          title: `Nova conversa de ${contactName || username || chatId}`,
          message: (textContent || `[${mediaType || "media"}]`).substring(0, 200),
          metadata: { conversation_id: newConv.id, remote_jid: remoteJid },
        });
      } catch (e) { console.error("Failed to create Telegram notification:", e); }
    }

    // ── Save incoming message ───────────────────────────────────────────────
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      user_id: userId,
      remote_jid: remoteJid,
      content: textContent || `[${mediaType || "media"}]`,
      sender: "user",
      message_id: `tg-${message.message_id}`,
      media_url: mediaUrl,
      media_type: mediaType,
      timestamp: new Date().toISOString(),
    });

    // ── AI routing ────────────────────────────────────────────────────────────
    // Transcribe audio if needed
    let aiTextContent = textContent.trim();
    if (!aiTextContent && mediaType === "audio" && mediaUrl) {
      const lovableKey = (Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim();
      const audioData = await downloadAudioFromUrl(mediaUrl);
      if (audioData) {
        const transcribed = await transcribeAudio(audioData.bytes, audioData.mimetype, lovableKey);
        if (transcribed) {
          aiTextContent = transcribed;
          console.log("Audio transcribed:", transcribed.substring(0, 100));
        }
      }
    }

    // Re-check is_ai_active from DB right before calling AI (human may have toggled it off)
    if (isAiActive && aiTextContent) {
      const { data: freshConv } = await supabase
        .from("conversations")
        .select("is_ai_active")
        .eq("id", conversationId)
        .maybeSingle();
      if (freshConv && freshConv.is_ai_active === false) {
        console.log(`[telegram] AI was deactivated for conversation ${conversationId} — skipping AI reply`);
        isAiActive = false;
      }
    }

    if (isAiActive && aiTextContent) {
      let agentId = conversationAgentId;

      if (!agentId) {
        const { data: linkedAgent } = await supabase
          .from("agents")
          .select("id")
          .eq("telegram_connection_id", telegramConnId)
          .eq("status", "active")
          .maybeSingle();
        agentId = linkedAgent?.id || null;

        if (agentId) {
          await supabase
            .from("conversations")
            .update({ agent_id: agentId })
            .eq("id", conversationId);
        }
      }

      if (!agentId) {
        console.log("No active agent linked to this Telegram connection — skipping AI reply");
      } else {
        const { data: agent } = await supabase
          .from("agents")
          .select("status, instructions, model, temperature, use_emojis, sign_agent_name, restrict_topics, split_responses, split_response_max_chars, split_delay_ms, max_response_chars, prompt_o_que_fazer, prompt_como_pergunta, prompt_nao_fazer, product_name, product_description, purpose, communication_style, official_site, agent_timezone, response_delay_seconds, max_interactions, allow_reminders, smart_training_search, name, webhook_rules, transfer_rules")
          .eq("id", agentId)
          .maybeSingle();

        if (!agent) {
          console.log("Agent not found:", agentId);
        } else if ((agent as any).status === "paused") {
          console.log(`[telegram] Agent ${agentId} is paused — skipping AI reply`);
        } else {
          const agentWebhookRules = (agent as any).webhook_rules;
          const webhookPayload = { contact_name: contactName, contact_phone: contactPhone, remote_jid: remoteJid, conversation_id: conversationId, agent_id: agentId, message: aiTextContent, channel: "telegram" };
          
          // Fire nova_mensagem webhook
          fireWebhookRules(agentWebhookRules, "nova_mensagem", webhookPayload);
          // Last 20 messages as history (filtered after reopen)
          let tgHistoryQuery = supabase
            .from("messages")
            .select("content, sender, timestamp")
            .eq("conversation_id", conversationId)
            .order("timestamp", { ascending: false })
            .limit(20);
          
          if (conversationReopenedAt) {
            tgHistoryQuery = tgHistoryQuery.gte("timestamp", conversationReopenedAt);
          }
          
          const { data: history } = await tgHistoryQuery;

          const chatHistory = (history || [])
            .reverse()
            .map((m: { content: string; sender: string }) => ({
              role: m.sender === "user" ? "user" : "assistant",
              content: m.content,
            }));

          // ── Check max_interactions limit ──────────────────────────
          const maxInteractions = typeof (agent as any).max_interactions === "number" && (agent as any).max_interactions > 0
            ? (agent as any).max_interactions : null;
          if (maxInteractions) {
            // Count only messages since last AI re-activation (updated_at) so toggle-on resets the counter
            const convUpdatedAt = existingConv?.updated_at || null;
            let countQuery = supabase
              .from("messages")
              .select("id", { count: "exact", head: true })
              .eq("conversation_id", conversationId);
            if (convUpdatedAt) {
              countQuery = countQuery.gte("timestamp", convUpdatedAt);
            }
            const { count } = await countQuery;
            if (count && count >= maxInteractions) {
              console.log(`[max_interactions] Limit reached (${count}/${maxInteractions}) — deactivating AI`);
              await supabase.from("conversations").update({ is_ai_active: false }).eq("id", conversationId);
            }
          }

          if (!lovableApiKey) {
            console.error("LOVABLE_API_KEY not configured — cannot call AI");
          } else if (maxInteractions && chatHistory.length >= maxInteractions) {
            console.log("[max_interactions] Skipping AI call due to interaction limit");
          } else {
            try {
              // Semantic RAG: search only relevant chunks
              const knowledgeContext = await semanticKnowledgeSearch(
                supabase, agentId, aiTextContent, lovableApiKey
              );

              // ── Build transfer rules prompt section ──────────────────
              const transferRules: TransferRule[] = Array.isArray((agent as any).transfer_rules) ? (agent as any).transfer_rules : [];
              let transferPrompt = "";
                if (transferRules.length > 0) {
                  const targetAgentIds = transferRules
                    .filter(r => r.targetType === "agente" && r.targetAgentId && r.targetAgentId !== "todos")
                    .map(r => r.targetAgentId!);
                  const targetHumanIds = transferRules
                    .filter(r => r.targetType === "humano" && r.targetAgentId)
                    .map(r => r.targetAgentId!);
                  const agentNames: Record<string, string> = {};
                  if (targetAgentIds.length > 0) {
                    const { data: targetAgents } = await supabase
                      .from("agents")
                      .select("id, name")
                      .in("id", targetAgentIds);
                    for (const ta of targetAgents || []) {
                      agentNames[ta.id] = ta.name;
                    }
                  }
                  if (targetHumanIds.length > 0) {
                    const { data: humanProfiles } = await supabase
                      .from("profiles")
                      .select("user_id, display_name")
                      .in("user_id", targetHumanIds);
                    for (const hp of humanProfiles || []) {
                      agentNames[hp.user_id] = hp.display_name || "Atendente";
                    }
                  }
                  transferPrompt = buildTransferPromptSection(transferRules, agentNames);
                }

              console.log(`Calling AI agent ${agentId} for Telegram conversation ${conversationId}, RAG: ${knowledgeContext.length} chars`);

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

              const systemPrompt = buildSystemPrompt(agent as Record<string, unknown>) + transferPrompt + knowledgeContext;
              const maxCharsForCall = typeof (agent as any).max_response_chars === "number" && (agent as any).max_response_chars > 0
                ? (agent as any).max_response_chars : 0;

              const aiReply = await callAgentAI(
                lovableApiKey,
                systemPrompt,
                agent.model,
                agent.temperature,
                chatHistory,
                "",
                maxCharsForCall > 0 ? maxCharsForCall : undefined
              );

              // Check fallback rate and notify if too high
              checkFallbackRateAndNotify(supabase, userId, "telegram").catch(() => {});

              if (aiReply) {
                // ── Check for transfer marker ──────────────────────────
                const { cleanReply, transferType, targetId, tagName } = extractMarkers(aiReply);
                
                if (transferType) {
                  const matchedRule = findMatchingTransferRule(transferRules, transferType, targetId);
                  const effectiveTargetId = targetId || (matchedRule?.targetAgentId && matchedRule.targetAgentId !== "todos" ? matchedRule.targetAgentId : null);
                  console.log(`[transfer] Telegram: Detected transfer: type=${transferType}, aiTarget=${targetId}, effectiveTarget=${effectiveTargetId}`);
                  
                  if (transferType === "humano") {
                    const updateData: Record<string, unknown> = { is_ai_active: false };
                    if (effectiveTargetId) {
                      updateData.assigned_to = effectiveTargetId;
                    }
                    await supabase.from("conversations").update(updateData).eq("id", conversationId);
                    
                    if (effectiveTargetId) {
                      try {
                        await supabase.from("notifications").insert({
                          user_id: effectiveTargetId,
                          title: "Nova transferência recebida",
                          message: `Conversa Telegram transferida para você`,
                          type: "transfer",
                          metadata: { conversation_id: conversationId },
                        });
                      } catch (notifErr) {
                        console.error("Failed to create transfer notification:", notifErr);
                      }
                    }
                    fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "humano", transfer_user_id: effectiveTargetId });
                  } else if (transferType === "agente" && (targetId || matchedRule?.targetAgentId) && (targetId || matchedRule?.targetAgentId) !== "todos") {
                    const effectiveAgentTarget = targetId || matchedRule?.targetAgentId;
                    await supabase.from("conversations").update({ agent_id: effectiveAgentTarget }).eq("id", conversationId);
                    fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "agente", transfer_agent_id: effectiveAgentTarget });
                  } else {
                    await supabase.from("conversations").update({ is_ai_active: false }).eq("id", conversationId);
                    fireWebhookRules(agentWebhookRules, "transferencia", { ...webhookPayload, transfer_target: "todos" });
                  }

                  // ── Auto-tag from rule config ──────────────────────────
                  const ruleTags = matchedRule?.tags || [];
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

                const maxRespChars = typeof (agent as any).max_response_chars === "number" && (agent as any).max_response_chars > 0
                  ? (agent as any).max_response_chars
                  : null;
                const truncatedReply = maxRespChars && cleanReply.length > maxRespChars
                  ? cleanReply.slice(0, maxRespChars).trimEnd()
                  : cleanReply;

                // ── Deduct credits for AI usage ──────────────────────────
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
                    _description: `Telegram: resposta do agente (${agent.model})`,
                  });
                  console.log(`Credits deducted: ${creditsToDeduct} for user ${userId}`);
                } catch (creditErr) {
                  console.error("Failed to deduct credits:", creditErr);
                }

                // Save AI reply parts individually so chat UI matches what the client sees
                const shouldSplitForSave = agent.split_responses === true;
                const maxCharsForSave = typeof agent.split_response_max_chars === "number" && agent.split_response_max_chars > 0
                  ? agent.split_response_max_chars
                  : 300;
                const replyPartsForSave = shouldSplitForSave ? splitTextIntoParts(truncatedReply, maxCharsForSave) : [truncatedReply];
                const saveTs = Date.now();
                for (let si = 0; si < replyPartsForSave.length; si++) {
                  await supabase.from("messages").insert({
                    conversation_id: conversationId,
                    user_id: userId,
                    remote_jid: remoteJid,
                    content: replyPartsForSave[si],
                    sender: "agent",
                    message_id: `tg-ai-${saveTs}-${si}`,
                    timestamp: new Date(Date.now() + si).toISOString(),
                  });
                }
                const lastSavedPart = replyPartsForSave[replyPartsForSave.length - 1];
                await supabase.from("conversations").update({
                  last_message: lastSavedPart,
                  last_message_at: new Date().toISOString(),
                  last_message_sender: "agent",
                  last_message_media_type: null,
                }).eq("id", conversationId);

                // ── Apply response delay before sending ──────────────
                const delaySecs = typeof agent.response_delay_seconds === "number" ? agent.response_delay_seconds : 0;
                if (delaySecs > 0) {
                  console.log(`[delay] Telegram: waiting ${delaySecs}s before sending reply...`);
                  await new Promise(resolve => setTimeout(resolve, delaySecs * 1000));
                }

                const isAiStillActive = async () => {
                  const { data: liveConv } = await supabase
                    .from("conversations")
                    .select("is_ai_active")
                    .eq("id", conversationId)
                    .maybeSingle();
                  return liveConv?.is_ai_active !== false;
                };

                if (!(await isAiStillActive())) {
                  console.log(`[telegram] AI disabled after generation for conversation ${conversationId} — aborting send`);
                } else {
                  // ── Split response if configured ─────────────────────
                  const shouldSplit = agent.split_responses === true;
                  const maxChars = typeof agent.split_response_max_chars === "number" && agent.split_response_max_chars > 0
                    ? agent.split_response_max_chars
                    : 300;
                  const partDelayMs = typeof (agent as any).split_delay_ms === "number" && (agent as any).split_delay_ms >= 0
                    ? (agent as any).split_delay_ms
                    : 800;

                  if (shouldSplit) {
                    const parts = splitTextIntoParts(truncatedReply, maxChars);
                    console.log(`[split] Telegram: splitting into ${parts.length} parts (maxChars=${maxChars}, delayMs=${partDelayMs})`);
                    for (let i = 0; i < parts.length; i++) {
                      if (!(await isAiStillActive())) {
                        console.log(`[telegram] AI disabled during split send for conversation ${conversationId} — stopping remaining parts`);
                        break;
                      }
                      await sendTelegramMessage(botToken, chatId, parts[i]);
                      if (i < parts.length - 1 && partDelayMs > 0) {
                        await new Promise(resolve => setTimeout(resolve, partDelayMs));
                      }
                    }
                  } else {
                    await sendTelegramMessage(botToken, chatId, truncatedReply);
                  }
                }
              }
            } catch (aiErr) {
              const aiErrorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);
              console.error("AI call failed:", aiErrorMessage);
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
                  message_id: `tg-ai-fallback-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                });

                await supabase.from("conversations").update({
                  last_message: fallbackMsg,
                  last_message_at: new Date().toISOString(),
                  last_message_sender: "agent",
                  last_message_media_type: null,
                }).eq("id", conversationId);

                await sendTelegramMessage(botToken, chatId, fallbackMsg);
              } catch (fallbackErr) {
                console.error("Telegram fallback reply failed:", fallbackErr);
              }
            }
          }
        }
      }
    }
}

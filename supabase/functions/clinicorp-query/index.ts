import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Clinicorp API base URL
const CLINICORP_BASE = "https://api.clinicorp.com/v1";

// Solar Market API base URL
const SM_BASE = "https://business.solarmarket.com.br/api/v2";

// ─── Clinicorp helpers ────────────────────────────────────────────────────────

async function clinicorpFetch(
  path: string,
  clinicId: string,
  apiKey: string,
  params: Record<string, string> = {},
) {
  const url = new URL(`${CLINICORP_BASE}/${path}`);
  url.searchParams.set("clinic_id", clinicId);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Clinicorp API error [${res.status}]: ${body}`);
  }

  return res.json();
}

// ─── Tool implementations ─────────────────────────────────────────────────────

async function getAppointments(
  clinicId: string,
  apiKey: string,
  args: { date?: string; patient_name?: string; status?: string },
) {
  const params: Record<string, string> = {};
  if (args.date) params.date = args.date;
  if (args.patient_name) params.patient_name = args.patient_name;
  if (args.status) params.status = args.status;

  const data = await clinicorpFetch("appointments", clinicId, apiKey, params);

  const appointments = Array.isArray(data) ? data : data.appointments ?? data.data ?? [];

  if (!appointments.length) {
    return "Nenhum agendamento encontrado para os critérios informados.";
  }

  const lines = appointments.slice(0, 15).map((a: Record<string, unknown>) => {
    const date = a.date ?? a.scheduled_at ?? a.start_time ?? "–";
    const patient = a.patient_name ?? a.patient ?? a.nome ?? "–";
    const dentist = a.dentist_name ?? a.professional ?? a.dentista ?? "–";
    const status = a.status ?? "–";
    const procedure = a.procedure ?? a.treatment ?? a.procedimento ?? "";
    return `• ${date} | ${patient} | ${dentist}${procedure ? ` | ${procedure}` : ""} | ${status}`;
  });

  return `**Agendamentos encontrados (${appointments.length}):**\n${lines.join("\n")}`;
}

async function getPatients(
  clinicId: string,
  apiKey: string,
  args: { name?: string; phone?: string; cpf?: string },
) {
  const params: Record<string, string> = {};
  if (args.name) params.name = args.name;
  if (args.phone) params.phone = args.phone;
  if (args.cpf) params.cpf = args.cpf;

  const data = await clinicorpFetch("patients", clinicId, apiKey, params);

  const patients = Array.isArray(data) ? data : data.patients ?? data.data ?? [];

  if (!patients.length) {
    return "Nenhum paciente encontrado com esses dados.";
  }

  const lines = patients.slice(0, 10).map((p: Record<string, unknown>) => {
    const name = p.name ?? p.nome ?? "–";
    const phone = p.phone ?? p.telefone ?? p.celular ?? "–";
    const email = p.email ?? "–";
    const lastVisit = p.last_visit ?? p.ultima_visita ?? "–";
    return `• **${name}** | Tel: ${phone} | E-mail: ${email} | Última visita: ${lastVisit}`;
  });

  return `**Pacientes encontrados (${patients.length}):**\n${lines.join("\n")}`;
}

async function getTodaySchedule(clinicId: string, apiKey: string) {
  const today = new Date().toISOString().split("T")[0];
  return getAppointments(clinicId, apiKey, { date: today });
}

// ─── Solar Market helpers ──────────────────────────────────────────────────────

async function smFetch(path: string, token: string) {
  const res = await fetch(`${SM_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Solar Market API [${res.status}]: ${text}`);
  }
  return res.json();
}

async function smGetClients(token: string, args: { name?: string; phone?: string; email?: string; limit?: string }) {
  const params = new URLSearchParams();
  if (args.name) params.set("name", args.name);
  if (args.phone) params.set("phone", args.phone);
  if (args.email) params.set("email", args.email);
  params.set("limit", args.limit || "10");
  const data = await smFetch(`clients?${params}`, token);
  const clients = data?.data || data || [];
  if (!Array.isArray(clients) || !clients.length) return "Nenhum cliente encontrado na Solar Market.";
  const lines = clients.slice(0, 10).map((c: any) =>
    `• **${c.name || "–"}** | Tel: ${c.primaryPhone || c.phone || "–"} | E-mail: ${c.email || "–"} | CPF/CNPJ: ${c.cnpjCpf || "–"}`
  );
  return `**Clientes Solar Market (${clients.length}):**\n${lines.join("\n")}`;
}

async function smGetProjects(token: string, args: { name?: string; clientId?: string; limit?: string }) {
  const params = new URLSearchParams();
  if (args.name) params.set("name", args.name);
  if (args.clientId) params.set("clientId", args.clientId);
  params.set("limit", args.limit || "10");
  const data = await smFetch(`projects?${params}`, token);
  const projects = data?.data || data || [];
  if (!Array.isArray(projects) || !projects.length) return "Nenhum projeto encontrado na Solar Market.";
  const lines = projects.slice(0, 10).map((p: any) =>
    `• **${p.name || "Projeto #" + p.id}** | Cliente: ${p.client?.name || p.clientId || "–"} | Status: ${p.status || "–"} | Criado: ${p.createdAt || "–"}`
  );
  return `**Projetos Solar Market (${projects.length}):**\n${lines.join("\n")}`;
}

async function smGetProposals(token: string, args: { project_id: string }) {
  const data = await smFetch(`projects/${args.project_id}/proposals`, token);
  const proposals = data?.data || data || [];
  if (!Array.isArray(proposals) || !proposals.length) return "Nenhuma proposta encontrada para este projeto.";
  const lines = proposals.slice(0, 5).map((p: any) =>
    `• **Proposta #${p.id || "–"}** | Valor: R$ ${p.totalPrice?.toLocaleString("pt-BR") || p.value || "–"} | Potência: ${p.power || p.potency || "–"} kWp | Status: ${p.status || "–"}`
  );
  return `**Propostas Solar Market (${proposals.length}):**\n${lines.join("\n")}`;
}

async function smGetFunnels(token: string) {
  const data = await smFetch("funnels", token);
  const funnels = data?.data || data || [];
  if (!Array.isArray(funnels) || !funnels.length) return "Nenhum funil encontrado na Solar Market.";
  const lines = funnels.map((f: any) => {
    const stages = f.stages?.map((s: any) => s.name).join(" → ") || "";
    return `• **${f.name || "Funil #" + f.id}**${stages ? ": " + stages : ""}`;
  });
  return `**Funis Solar Market (${funnels.length}):**\n${lines.join("\n")}`;
}

// ─── Tool definitions (OpenAI-compatible) ─────────────────────────────────────

const CLINICORP_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_appointments",
      description:
        "Busca agendamentos na clínica. Use quando o paciente perguntar sobre consultas, horários ou agenda.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Data no formato YYYY-MM-DD (opcional).",
          },
          patient_name: {
            type: "string",
            description: "Nome parcial ou completo do paciente (opcional).",
          },
          status: {
            type: "string",
            description: "Filtro por status: scheduled, completed, cancelled (opcional).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_patients",
      description:
        "Busca dados de pacientes cadastrados. Use quando precisar de informações de contato ou histórico.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do paciente (opcional)." },
          phone: { type: "string", description: "Telefone do paciente (opcional)." },
          cpf: { type: "string", description: "CPF do paciente (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_today_schedule",
      description: "Retorna todos os agendamentos de hoje na clínica.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const SOLARMARKET_TOOLS = [
  {
    type: "function",
    function: {
      name: "sm_get_clients",
      description: "Busca clientes cadastrados na Solar Market. Use para encontrar dados de clientes de energia solar.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do cliente (opcional)." },
          phone: { type: "string", description: "Telefone do cliente (opcional)." },
          email: { type: "string", description: "E-mail do cliente (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sm_get_projects",
      description: "Busca projetos de energia solar na Solar Market. Projetos contêm informações de dimensionamento e propostas.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Nome do projeto (opcional)." },
          clientId: { type: "string", description: "ID do cliente associado (opcional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sm_get_proposals",
      description: "Busca propostas comerciais de um projeto de energia solar na Solar Market. Contém valores, potência e equipamentos.",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string", description: "ID do projeto (obrigatório)." },
        },
        required: ["project_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sm_get_funnels",
      description: "Lista os funis de vendas e suas etapas na Solar Market.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ── Model resolution ──────────────────────────────────────────────────────────

function resolveModel(model: string): string {
  const m = model?.trim();
  if (!m) return "google/gemini-3-flash-preview";
  
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
  
  if (VALID_MODELS.has(m)) return m;
  
  // Map legacy/unsupported models to Gemini (OpenAI models may return 403)
  if (m.includes("gpt-4o") || m.includes("gpt-4.1") || m.includes("gpt-4") || m.startsWith("gpt-")) return "google/gemini-3-flash-preview";
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return "google/gemini-3-flash-preview";
  if (m.startsWith("claude-")) return "google/gemini-3-flash-preview";
  if (m.startsWith("google/")) return m;
  
  const map: Record<string, string> = {
    "deepseek-chat": "google/gemini-3-flash-preview",
    "deepseek-reasoner": "google/gemini-3-flash-preview",
    "deepseek-coder": "google/gemini-3-flash-preview",
    "grok-3": "google/gemini-3-flash-preview",
    "grok-3-fast": "google/gemini-3-flash-preview",
    "grok-3-mini": "google/gemini-3-flash-preview",
    "grok-3-mini-fast": "google/gemini-3-flash-preview",
    "grok-2-1212": "google/gemini-3-flash-preview",
    "grok-2-vision-1212": "google/gemini-3-flash-preview",
    "mistral-large-latest": "google/gemini-3-flash-preview",
    "mistral-medium-latest": "google/gemini-3-flash-preview",
    "mistral-small-latest": "google/gemini-3-flash-preview",
  };
  if (map[m]) return map[m];
  if (m.includes("llama") || m.includes("mixtral") || m.includes("gemma") || m.includes("qwen")) return "google/gemini-3-flash-preview";
  console.log(`[model] Unknown model '${m}' — falling back to gemini-3-flash-preview`);
  return "google/gemini-3-flash-preview";
}

function modelSupportsTemperature(model: string): boolean {
  const m = model.toLowerCase();
  if (m.startsWith("o1") || m.startsWith("o3") || m.startsWith("o4")) return false;
  if (m.includes("gpt-5") && !m.includes("mini")) return false;
  return true;
}

// ── Semantic RAG helpers ───────────────────────────────────────────────────────

const EMBEDDING_MODEL = "text-embedding-3-small";

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

async function loadKnowledgeFallback(sb: any, fileIds: string[]): Promise<string> {
  const { data: files } = await sb.from("knowledge_files")
    .select("id, file_name, storage_path, source_type, source_url, content").in("id", fileIds);
  if (!files || files.length === 0) return "";
  const sections: string[] = [];
  for (const file of files) {
    let text = file.content || "";
    if (!text) {
      try {
        const { data: blob } = await sb.storage.from("knowledge").download(file.storage_path);
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

async function semanticKnowledgeSearch(
  sb: any,
  agentId: string,
  userQuestion: string,
  apiKey: string,
): Promise<string> {
  try {
    const { data: links } = await sb.from("agent_knowledge_files")
      .select("knowledge_file_id").eq("agent_id", agentId);
    if (!links || links.length === 0) return "";
    const fileIds = links.map((l: { knowledge_file_id: string }) => l.knowledge_file_id);

    const { count } = await sb.from("knowledge_chunks")
      .select("id", { count: "exact", head: true }).in("knowledge_file_id", fileIds);

    if (!count || count === 0) return await loadKnowledgeFallback(sb, fileIds);

    const queryEmbedding = await embedQuery(userQuestion, apiKey);
    if (!queryEmbedding) return await loadKnowledgeFallback(sb, fileIds);

    const { data: chunks, error } = await sb.rpc("match_knowledge_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      knowledge_file_ids: fileIds,
      match_count: 6,
      match_threshold: 0.25,
    });

    if (error || !chunks || chunks.length === 0) {
      const { data: fallback } = await sb.rpc("match_knowledge_chunks", {
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

    return `\n\n## Base de Conhecimento (trechos relevantes)\n\nUse as informações abaixo para responder. Priorize sempre esse conteúdo.\n\n${sections}`;
  } catch (err) {
    console.error("[RAG] clinicorp-query error:", err);
    return "";
  }
}

// ─── MCP Protocol helpers ─────────────────────────────────────────────────────

interface McpServer { name: string; server_url: string }
interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  _mcpServerUrl: string;
  _mcpServerName: string;
}

async function fetchMcpTools(server: McpServer): Promise<McpTool[]> {
  try {
    console.log(`[MCP] Fetching tools from ${server.name}: ${server.server_url}`);
    const res = await fetch(server.server_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
    });
    if (!res.ok) {
      console.warn(`[MCP] ${server.name} returned ${res.status}`);
      return [];
    }
    const contentType = res.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("text/event-stream")) {
      // SSE response - parse events
      const text = await res.text();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try { data = JSON.parse(line.slice(6)); break; } catch {}
        }
      }
    } else {
      data = await res.json();
    }
    const tools = data?.result?.tools || [];
    console.log(`[MCP] ${server.name}: ${tools.length} tools found`);
    return tools.map((t: any) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
      _mcpServerUrl: server.server_url,
      _mcpServerName: server.name,
    }));
  } catch (err) {
    console.error(`[MCP] Error fetching tools from ${server.name}:`, err);
    return [];
  }
}

async function callMcpTool(serverUrl: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  try {
    console.log(`[MCP] Calling tool ${toolName} on ${serverUrl}`);
    const res = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: toolName, arguments: args },
        id: 2,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return `Erro ao executar ferramenta: ${res.status} - ${t}`;
    }
    const contentType = res.headers.get("content-type") || "";
    let data: any;
    if (contentType.includes("text/event-stream")) {
      const text = await res.text();
      const lines = text.split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try { data = JSON.parse(line.slice(6)); break; } catch {}
        }
      }
    } else {
      data = await res.json();
    }
    const content = data?.result?.content;
    if (Array.isArray(content)) {
      return content.map((c: any) => c.text || JSON.stringify(c)).join("\n");
    }
    return JSON.stringify(data?.result || data);
  } catch (err) {
    console.error(`[MCP] Error calling tool ${toolName}:`, err);
    return `Erro ao executar ferramenta: ${err instanceof Error ? err.message : "erro desconhecido"}`;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase env vars not configured");
    }
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request
    const { messages, instructions, model, temperature, user_id, agent_id, mcp_servers } = await req.json();

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch agent data for max_response_chars and other settings
    let agentData: Record<string, unknown> | null = null;
    if (agent_id) {
      const { data } = await sb
        .from("agents")
        .select("status, max_response_chars, use_emojis, sign_agent_name, restrict_topics, allow_reminders, agent_timezone, name, max_interactions")
        .eq("id", agent_id)
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

    // ── Check & deduct credits upfront ───────────────────────────────────────
    // Use the ORIGINAL model (before resolution) to look up credits in ai_models
    const originalModel = model || "google/gemini-3-flash-preview";
    const aiModel = resolveModel(originalModel);
    const originalModelId = originalModel.replace(/^[^/]+\//, "");
    const resolvedModelId = aiModel.replace(/^[^/]+\//, "");
    
    // Try original model first, then resolved model
    const { data: modelData } = await sb
      .from("ai_models")
      .select("credits_per_response")
      .or(`model_id.eq.${originalModelId},model_id.eq.${originalModel},model_id.eq.${resolvedModelId},model_id.eq.${aiModel}`)
      .eq("is_enabled", true)
      .maybeSingle();
    const creditsRequired = modelData?.credits_per_response ?? 2;
    console.log(`[credits] originalModel=${originalModel} resolvedModel=${aiModel} creditsRequired=${creditsRequired}`);

    const { data: creditData } = await sb
      .from("user_credits")
      .select("balance")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!creditData || creditData.balance < creditsRequired) {
      return new Response(
        JSON.stringify({ error: `Créditos insuficientes. Saldo: ${creditData?.balance ?? 0}, necessário: ${creditsRequired}.` }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch Clinicorp connection for user
    const { data: conn } = await sb
      .from("clinicorp_connections")
      .select("clinic_id, api_key, clinic_name")
      .eq("user_id", user_id)
      .eq("is_connected", true)
      .maybeSingle();

    const hasClinicorp = !!conn;

    // Fetch Solar Market connection for user
    const { data: smConn } = await sb
      .from("solarmarket_connections")
      .select("api_key, company_name")
      .eq("user_id", user_id)
      .eq("is_connected", true)
      .maybeSingle();

    const hasSolarMarket = !!smConn;

    // ── Fetch MCP tools ──────────────────────────────────────────────────────
    const mcpServerList: McpServer[] = Array.isArray(mcp_servers) ? mcp_servers : [];
    let allMcpTools: McpTool[] = [];
    if (mcpServerList.length > 0) {
      const toolResults = await Promise.all(mcpServerList.map(s => fetchMcpTools(s)));
      allMcpTools = toolResults.flat();
      console.log(`[MCP] Total MCP tools available: ${allMcpTools.length}`);
    }

    // Build combined tools array (Clinicorp + SolarMarket + MCP)
    const allTools: any[] = [];
    if (hasClinicorp) allTools.push(...CLINICORP_TOOLS);
    if (hasSolarMarket) allTools.push(...SOLARMARKET_TOOLS);
    for (const mcpTool of allMcpTools) {
      allTools.push({
        type: "function",
        function: {
          name: `mcp__${mcpTool._mcpServerName}__${mcpTool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
          description: `[${mcpTool._mcpServerName}] ${mcpTool.description || mcpTool.name}`,
          parameters: mcpTool.inputSchema || { type: "object", properties: {} },
        },
      });
    }
    const hasTools = allTools.length > 0;

    // ── Semantic RAG knowledge search ────────────────────────────────────────
    let knowledgeContext = "";
    if (agent_id && messages?.length > 0) {
      const lastUserMsg = [...messages].reverse().find((m: { role: string }) => m.role === "user");
      const query = lastUserMsg?.content || "";
      knowledgeContext = await semanticKnowledgeSearch(sb, agent_id, query, LOVABLE_API_KEY);
    }

    // Build system prompt with Clinicorp + SolarMarket + MCP context + knowledge
    const clinicContext = hasClinicorp
      ? `\n\nVocê tem acesso ao sistema Clinicorp da clínica "${conn.clinic_name ?? "da clínica"}". Quando o paciente perguntar sobre agendamentos, consultas, horários ou informações de pacientes, utilize as ferramentas disponíveis para buscar dados em tempo real.`
      : "";

    const smContext = hasSolarMarket
      ? `\n\nVocê tem acesso ao CRM Solar Market da empresa "${smConn.company_name ?? "empresa"}". Use as ferramentas sm_* para consultar clientes, projetos, propostas comerciais e funis de vendas de energia solar.`
      : "";

    const mcpContext = allMcpTools.length > 0
      ? `\n\nVocê tem acesso a ferramentas externas via servidores MCP (${mcpServerList.map(s => s.name).join(", ")}). Use essas ferramentas quando fizer sentido para responder às perguntas do usuário.`
      : "";

    let baseInstructions = instructions?.trim()
      || "Você é um assistente de IA útil e amigável. Responda de forma clara e concisa em português.";

    // Apply max_response_chars limit
    const maxChars = agentData?.max_response_chars ? Number(agentData.max_response_chars) : 0;
    if (maxChars > 0) {
      baseInstructions += `\n\nIMPORTANTE: Sua resposta DEVE ter no MÁXIMO ${maxChars} caracteres. Resuma o conteúdo para caber nesse limite. Seja conciso e direto.`;
    }
    if (agentData?.sign_agent_name === true) {
      const agentName = (agentData.name as string) || "Assistente";
      baseInstructions += `\n\nSEMPRE finalize suas mensagens com uma linha em branco seguida do seu nome em negrito. Formato exato:\n\n[sua resposta aqui]\n\n*${agentName}*\n\nNunca esqueça de adicionar a assinatura *${agentName}* ao final.`;
    }

    const systemPrompt = baseInstructions + clinicContext + smContext + mcpContext + knowledgeContext;

    const temp = modelSupportsTemperature(aiModel) && typeof temperature === "number" ? temperature : undefined;

    const maxTokensLimit = maxChars > 0 ? Math.ceil(maxChars / 2.5) : undefined;

    // First AI call — may request a tool
    const firstRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        ...(temp !== undefined ? { temperature: temp } : {}),
        ...(maxTokensLimit ? { max_tokens: maxTokensLimit } : {}),
        tools: hasTools ? allTools : undefined,
        tool_choice: hasTools ? "auto" : undefined,
        stream: false,
      }),
    });

    if (!firstRes.ok) {
      if (firstRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit atingido. Tente novamente em instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (firstRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await firstRes.text();
      console.error("AI gateway error (first call):", firstRes.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const firstData = await firstRes.json();
    const choice = firstData.choices?.[0];
    const toolCalls = choice?.message?.tool_calls;

    if (toolCalls && toolCalls.length > 0 && hasTools) {
      // ── Tool call path ────────────────────────────────────────────────────
      const toolCall = toolCalls[0];
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, unknown> = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch { /* ignore */ }

      let toolResult = "";
      try {
        // Check if it's a Clinicorp tool
        if (hasClinicorp && toolName === "get_appointments") {
          toolResult = await getAppointments(conn!.clinic_id, conn!.api_key, toolArgs as { date?: string; patient_name?: string; status?: string });
        } else if (hasClinicorp && toolName === "get_patients") {
          toolResult = await getPatients(conn!.clinic_id, conn!.api_key, toolArgs as { name?: string; phone?: string; cpf?: string });
        } else if (hasClinicorp && toolName === "get_today_schedule") {
          toolResult = await getTodaySchedule(conn!.clinic_id, conn!.api_key);
        // Solar Market tools
        } else if (hasSolarMarket && toolName === "sm_get_clients") {
          toolResult = await smGetClients(smConn!.api_key, toolArgs as any);
        } else if (hasSolarMarket && toolName === "sm_get_projects") {
          toolResult = await smGetProjects(smConn!.api_key, toolArgs as any);
        } else if (hasSolarMarket && toolName === "sm_get_proposals") {
          toolResult = await smGetProposals(smConn!.api_key, toolArgs as any);
        } else if (hasSolarMarket && toolName === "sm_get_funnels") {
          toolResult = await smGetFunnels(smConn!.api_key);
        } else if (toolName.startsWith("mcp__")) {
          // MCP tool call - find the original tool and server
          const mcpTool = allMcpTools.find(t => {
            const mappedName = `mcp__${t._mcpServerName}__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
            return mappedName === toolName;
          });
          if (mcpTool) {
            toolResult = await callMcpTool(mcpTool._mcpServerUrl, mcpTool.name, toolArgs);
          } else {
            toolResult = "Ferramenta MCP não encontrada.";
          }
        } else {
          toolResult = "Ferramenta não reconhecida.";
        }
      } catch (toolErr) {
        console.error("Tool execution error:", toolErr);
        toolResult = `Erro ao executar ${toolName}: ${toolErr instanceof Error ? toolErr.message : "erro desconhecido"}`;
      }

      // Second AI call with tool result, streaming
      const secondRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
            choice.message,
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: toolResult,
            },
          ],
          ...(temp !== undefined ? { temperature: temp } : {}),
          ...(maxTokensLimit ? { max_tokens: maxTokensLimit } : {}),
          stream: true,
        }),
      });

      if (!secondRes.ok) {
        const t = await secondRes.text();
        console.error("AI gateway error (second call):", secondRes.status, t);
        return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Deduct credits
      await sb.rpc("deduct_credits", {
        _user_id: user_id,
        _amount: creditsRequired,
        _model_id: aiModel,
        _agent_id: agent_id || null,
        _description: `Chat agente (Clinicorp tool): ${aiModel}`,
      });

      return new Response(secondRes.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    // No tool call — stream the direct response
    const streamRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        ...(temp !== undefined ? { temperature: temp } : {}),
        ...(maxTokensLimit ? { max_tokens: maxTokensLimit } : {}),
        stream: true,
      }),
    });

    if (!streamRes.ok) {
      if (streamRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit atingido. Tente novamente em instantes." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (streamRes.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await streamRes.text();
      console.error("AI gateway error (stream):", streamRes.status, t);
      return new Response(JSON.stringify({ error: "Erro no gateway de IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduct credits
    await sb.rpc("deduct_credits", {
      _user_id: user_id,
      _amount: creditsRequired,
      _model_id: aiModel,
      _agent_id: agent_id || null,
      _description: `Chat agente: ${aiModel}`,
    });

    return new Response(streamRes.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("clinicorp-query error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

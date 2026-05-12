import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SM_BASE = "https://business.solarmarket.com.br/api/v2";

// ─── Solar Market API helper ──────────────────────────────────────────────────

async function smFetch(
  path: string,
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>,
) {
  const opts: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  };
  if (body && method !== "GET") opts.body = JSON.stringify(body);

  const res = await fetch(`${SM_BASE}/${path}`, opts);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Solar Market API [${res.status}]: ${text}`);
  }

  return res.json();
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function listClients(token: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return smFetch(`clients${qs ? `?${qs}` : ""}`, token);
}

async function createClient_(token: string, data: Record<string, unknown>) {
  return smFetch("clients", token, "POST", data);
}

async function updateClient(token: string, id: string, data: Record<string, unknown>) {
  return smFetch(`clients/${id}`, token, "PATCH", data);
}

async function listProjects(token: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return smFetch(`projects${qs ? `?${qs}` : ""}`, token);
}

async function createProject(token: string, data: Record<string, unknown>) {
  return smFetch("projects", token, "POST", data);
}

async function updateProject(token: string, id: string, data: Record<string, unknown>) {
  return smFetch(`projects/${id}`, token, "PATCH", data);
}

async function getProjectProposals(token: string, projectId: string) {
  return smFetch(`projects/${projectId}/proposals`, token);
}

async function listFunnels(token: string) {
  return smFetch("funnels", token);
}

async function listCustomFields(token: string) {
  return smFetch("custom-fields", token);
}

async function listProjectCustomFields(token: string, projectId: string) {
  return smFetch(`projects/${projectId}/custom-fields`, token);
}

async function listProjectFunnels(token: string, projectId: string) {
  return smFetch(`projects/${projectId}/funnels`, token);
}

async function listUsers(token: string) {
  return smFetch("users", token);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { action, params, data } = await req.json();

    // ── Validate API key (public action — no auth needed) ─────────────────
    if (action === "validate_key") {
      const apiKey = params?.api_key;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ valid: false, error: "api_key é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      try {
        const res = await fetch(`${SM_BASE}/funnels`, {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        });
        if (res.status === 401 || res.status === 403) {
          await res.text();
          return new Response(
            JSON.stringify({ valid: false, error: "Chave de API inválida ou sem permissão" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        if (!res.ok) {
          await res.text();
          return new Response(
            JSON.stringify({ valid: false, error: "Erro ao validar chave" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        await res.json();
        return new Response(
          JSON.stringify({ valid: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      } catch {
        return new Response(
          JSON.stringify({ valid: false, error: "Erro ao validar" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Auth check for all other actions ───────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user }, error: authError } = await sb.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "action é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch user's Solar Market connection (using authenticated user.id)
    const { data: conn, error: connError } = await sb
      .from("solarmarket_connections")
      .select("api_key, company_name")
      .eq("user_id", user.id)
      .eq("is_connected", true)
      .maybeSingle();

    if (connError) throw connError;

    if (!conn) {
      return new Response(
        JSON.stringify({ error: "Nenhuma conexão Solar Market encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = conn.api_key;
    let result: unknown;

    switch (action) {
      case "list_clients":
        result = await listClients(token, params || {});
        break;
      case "create_client":
        result = await createClient_(token, data || {});
        break;
      case "update_client":
        if (!params?.id) throw new Error("params.id é obrigatório");
        result = await updateClient(token, params.id, data || {});
        break;
      case "list_projects":
        result = await listProjects(token, params || {});
        break;
      case "create_project":
        result = await createProject(token, data || {});
        break;
      case "update_project":
        if (!params?.id) throw new Error("params.id é obrigatório");
        result = await updateProject(token, params.id, data || {});
        break;
      case "get_proposals":
        if (!params?.project_id) throw new Error("params.project_id é obrigatório");
        result = await getProjectProposals(token, params.project_id);
        break;
      case "list_funnels":
        result = await listFunnels(token);
        break;
      case "list_project_funnels":
        if (!params?.project_id) throw new Error("params.project_id é obrigatório");
        result = await listProjectFunnels(token, params.project_id);
        break;
      case "list_custom_fields":
        result = await listCustomFields(token);
        break;
      case "list_project_custom_fields":
        if (!params?.project_id) throw new Error("params.project_id é obrigatório");
        result = await listProjectCustomFields(token, params.project_id);
        break;
      case "list_users":
        result = await listUsers(token);
        break;
      default:
        return new Response(
          JSON.stringify({ error: "Ação desconhecida" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[solarmarket-query] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

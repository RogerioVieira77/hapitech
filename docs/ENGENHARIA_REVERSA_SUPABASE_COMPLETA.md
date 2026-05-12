# Engenharia reversa completa — stack Supabase (atualização integral)

**Workspace:** `c:\workspace_hapitech\hapitech-main`  
**Fontes de evidência:** `supabase/migrations/*.sql` (91 ficheiros), `supabase/config.toml`, `supabase/functions/**/index.ts` (31 funções), `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, hooks `src/hooks/useAuth.tsx`, `useChat.ts`, `useNotifications.ts`, `NotificationListener.tsx`, e restantes consumidores de Supabase.

**Objetivo:** permitir **reconstruir todo o Supabase do zero** num projeto independente, com ordem de operações, riscos e validações.

**Nota sobre `types.ts`:** gerado para PostgREST; **não lista** `mcp_connections` (definida só no SQL em `20260301215513_create_hapitech_core_schema_v2.sql` L593–608). Após `db push` num projeto novo, executar `supabase gen types typescript --linked` para alinhar tipos ao estado real.

---

# FORMATO DE SAÍDA (22 secções)

---

## 1. Resumo executivo

O projeto **não possui servidor Node/Java próprio** para API de negócio: o “backend” é **Supabase** composto por:

| Componente Supabase | Uso neste projeto | Evidência principal |
|---------------------|-------------------|---------------------|
| **PostgreSQL** (`public`, `auth`, `storage`, `extensions`) | Modelo relacional, CRM, conversas, créditos, integrações | Migrações `supabase/migrations/` |
| **Auth (GoTrue)** | Registo, login email/senha, sessão, metadados `display_name` / `org_name` | `src/hooks/useAuth.tsx` L34–48 |
| **PostgREST** | CRUD com **RLS** | `supabase.from(...)` em todo `src/` |
| **Edge Functions (Deno)** | WhatsApp proxy, webhooks, IA, Asaas, OAuth Google, etc. | `supabase/functions/` |
| **Storage** | Avatares, conhecimento, media chat | `INSERT INTO storage.buckets` nas migrações |
| **Realtime** | Atualização live de conversas, mensagens, notificações | `useChat.ts` L80–120; migração `ALTER PUBLICATION supabase_realtime` |

O cliente browser é criado em **`src/integrations/supabase/client.ts`** com **`VITE_SUPABASE_URL`** e **`VITE_SUPABASE_PUBLISHABLE_KEY`** (chave **anon**), sessão em **`localStorage`**, refresh automático.

O ficheiro **`supabase/config.toml`** contém **`project_id`** de referência legada e **`verify_jwt = false`** para cada `[functions.<nome>]` listado — as URLs `/functions/v1/*` **não exigem JWT na camada gateway** para essas funções; a autorização é **implementada (ou não) dentro de cada handler**.

**Reconstrução greenfield:** novo projeto Supabase → `supabase link` → `supabase db push` (91 migrações em ordem) → secrets → deploy das 31 functions → Auth URLs → webhooks externos (Evolution, Asaas, Telegram) → rebuild frontend com novos `VITE_*`.

---

## 2. Arquitetura Supabase

### 2.1 Diagrama textual (fluxo de dados)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SPA React (Vite)                                                             │
│  • supabase-js: Auth.session (JWT access/refresh)                           │
│  • PostgREST: .from("tabela").select/insert/update — RLS com JWT user       │
│  • Realtime: .channel(...).on("postgres_changes", ...)                      │
│  • HTTP: fetch /functions/v1/<nome> com header apikey=anon + Authorization │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ HTTPS (projeto.supabase.co)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Supabase Cloud (projeto)                                                     │
│  ├─ Kong / API Gateway                                                       │
│  ├─ GoTrue (JWT assinado; refresh)                                           │
│  ├─ PostgREST → PostgreSQL (schema public + RLS)                            │
│  ├─ Realtime → publication supabase_realtime                                 │
│  ├─ Storage API → storage.objects + buckets                                  │
│  └─ Edge Functions (Deno) → Deno.env secrets + fetch externo                │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Evidência do cliente (ponto único de entrada frontend)

```5:20:c:\workspace_hapitech\hapitech-main\src\integrations\supabase\client.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
```

### 2.3 Configuração local CLI (`config.toml`)

```1:20:c:\workspace_hapitech\hapitech-main\supabase\config.toml
project_id = "kvhtradegsostrhtzdwn"

[functions.wuzapi-proxy]
verify_jwt = false

[functions.ai-models-proxy]
verify_jwt = false

[functions.agent-chat]
verify_jwt = false

[functions.whatsapp-webhook]
verify_jwt = false

[functions.telegram-webhook]
verify_jwt = false
```

*(O ficheiro continua até `[functions.gmail-oauth-token]` com `verify_jwt = false`.)*

**Funções existentes em pastas mas não listadas neste `config.toml`:** `admin-change-password`, `asaas-invoices`, `verify-recovery-code` — o comportamento JWT default do projeto remoto pode diferir; **validar no Dashboard** após deploy.

---

## 3. Estrutura do banco de dados

### 3.1 Schemas envolvidos

| Schema | Conteúdo | Evidência |
|--------|----------|-----------|
| **`public`** | Todas as tabelas de aplicação | `CREATE TABLE public.*` nas migrações; `types.ts` `public.Tables` |
| **`auth`** | `auth.users` + trigger signup | `CREATE TRIGGER on_auth_user_created ON auth.users` em `20260301215513_create_hapitech_core_schema_v2.sql` L882–883 |
| **`storage`** | Buckets + `storage.objects` | `INSERT INTO storage.buckets` múltiplas migrações |
| **`extensions`** | `vector` (pgvector) | `CREATE EXTENSION ... vector WITH SCHEMA extensions` — `20260301215513_create_hapitech_core_schema_v2.sql` L7–8 |

Não há uso documentado no repo de schemas custom tipo `tenant_*` ativos no modelo final além de migrações corp legadas (`restore_corp_tables`); ver secção **14**.

### 3.2 Migrações — quantidade e ordem

- **Número total:** **91** ficheiros `.sql` em `c:\workspace_hapitech\hapitech-main\supabase\migrations\`.
- **Ordem correta:** **estritamente lexicográfica** pelo prefixo `YYYYMMDDHHMMSS_` no nome do ficheiro — é a ordem que **`supabase db push`** aplica ao histórico `supabase_migrations.schema_migrations`.

### 3.3 Migrações críticas / narrativa (não saltar)

| Ordem relativa | Ficheiro | Papel |
|----------------|----------|--------|
| Núcleo | `20260301215513_create_hapitech_core_schema_v2.sql` | Cria tabelas core, índices, funções helper, RLS, trigger `handle_new_user`, realtime publication, bootstrap utilizadores existentes |
| Rollback | `20260301215748_rollback_hapitech_core_schema_v2.sql` | Remove grande parte do schema v2 |
| Limpeza | `20260301220130_cleanup_remove_unused_mvo_tables.sql` | Remove funções/tabelas MVO não usadas |
| Corp | `20260301220700_restore_corp_tables.sql` | Restaura tabelas `profiles_legacy`, `stores`, e-commerce, triggers QR |
| Restore app | `20260301221950_restore_hapitech_core_schema.sql` | Repõe tabelas hapitech pós-rollback |
| Pós | `20260303*`, `20260304*`, `20260311175605_*` | Evoluções (Asaas, recovery_codes, smtp, etc.) |

**Migrações “quebráveis”:** qualquer execução **fora de ordem** ou **parcial** (apenas um subconjunto de ficheiros) pode deixar FKs, triggers ou policies inconsistentes. **Dependência circular explícita:** não há ciclo SQL; há **dependência temporal obrigatória** (rollback antes de restore).

### 3.4 Enum

| Nome | Valores | Ficheiro |
|------|---------|----------|
| `public.app_role` | `'super_admin'`, `'admin'`, `'user'` | `20260217210811_520b0cee-8062-49e0-9567-0b4508e85efa.sql` L3 |

### 3.5 Tabelas `public` — inventário

#### 3.5.1 Tabelas refletidas em `types.ts` (`Database["public"]["Tables"]`)

Cada linha: **tabela** — **linha aproximada** em `src/integrations/supabase/types.ts`.

| Tabela | types.ts |
|--------|----------|
| `agent_knowledge_files` | L17 |
| `agents` | L53 |
| `ai_models` | L224 |
| `ai_providers` | L272 |
| `asaas_subscriptions` | L302 |
| `billing_data` | L356 |
| `clinicorp_connections` | L421 |
| `connection_events` | L454 |
| `contact_custom_field_values` | L490 |
| `contact_custom_fields` | L532 |
| `contact_notes` | L562 |
| `conversation_tags` | L594 |
| `conversations` | L630 |
| `credit_transactions` | L735 |
| `crm_automation_rules` | L771 |
| `crm_custom_field_values` | L809 |
| `crm_custom_fields` | L848 |
| `crm_pipelines` | L895 |
| `crm_stages` | L919 |
| `google_calendar_connections` | L957 |
| `knowledge_chunks` | L1008 |
| `knowledge_files` | L1043 |
| `lead_comments` | L1088 |
| `lead_contacts` | L1120 |
| `lead_products` | L1161 |
| `lead_tasks` | L1199 |
| `leads` | L1246 |
| `messages` | L1300 |
| `notifications` | L1350 |
| `organization_members` | L1383 |
| `organizations` | L1415 |
| `plans` | L1462 |
| `profiles` | L1513 |
| `recovery_codes` | L1552 |
| `smtp_settings` | L1582 |
| `solarmarket_connections` | L1630 |
| `tags` | L1663 |
| `telegram_connections` | L1687 |
| `user_credits` | L1726 |
| `user_roles` | L1750 |
| `widget_connections` | L1771 |
| `wuzapi_connections` | L1818 |

#### 3.5.2 Tabela apenas no SQL (ausente em `types.ts` gerado)

**`mcp_connections`** — definição:

```593:608:c:\workspace_hapitech\hapitech-main\supabase\migrations\20260301215513_create_hapitech_core_schema_v2.sql
-- 40. MCP CONNECTIONS
CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon_url text,
  server_url text NOT NULL,
  server_type text NOT NULL DEFAULT 'streamable_http',
  auth_type text,
  preset_key text,
  is_connected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;
```

Política associada na mesma migração: `"mcp_all"` com `user_id = auth.uid()` (L849 no ficheiro completo).

#### 3.5.3 Tabelas corp / legado (migração `restore_corp_tables`)

Incluem entre outras: `profiles_legacy`, `stores`, `marketing_integrations`, `clients`, `projects`, `orders`, `order_items`, `team_members`, `team_permissions`, `qr_code_queue` — ficheiro `supabase/migrations/20260301220700_restore_corp_tables.sql` (CREATE TABLE no início do ficheiro). O estado final depende também de `20260301220130_cleanup_remove_unused_mvo_tables.sql`.

### 3.6 Views

| View | Finalidade | Evidência |
|------|------------|-----------|
| `public.ai_providers_public` | Expõe apenas `id`, `name`, `display_name` (sem `api_key`); `security_invoker = false` | `20260302131344_301ef8c4-e492-45d5-8f03-301398dbecc6.sql` L3–9; `types.ts` L1853 |

**GRANT explícito (acesso anon à view):**

```11:12:c:\workspace_hapitech\hapitech-main\supabase\migrations\20260302131344_301ef8c4-e492-45d5-8f03-301398dbecc6.sql
GRANT SELECT ON public.ai_providers_public TO authenticated;
GRANT SELECT ON public.ai_providers_public TO anon;
```

### 3.7 Funções SQL (stored) — inventário via `types.ts` `Functions`

Funções expostas ao PostgREST (RPC) incluem (nomes em `types.ts` ~L1873+):  
`deduct_credits`, `get_admin_stats`, `get_all_users_for_admin`, `get_my_org_id`, `get_org_members_for_admin`, `get_org_members_with_email`, `get_user_org_id`, **`has_role`**, `is_org_member`, `is_org_member_direct`, **`match_knowledge_chunks`**, `set_user_credits`.

**Funções adicionais no núcleo v2** (ficheiro `create_hapitech_core_schema_v2.sql` secção FUNCTIONS ~L632+):  
`get_user_org_id`, `get_my_org_id`, `is_org_member`, `is_org_member_direct`, `has_role` (sobrecarga com `_role text` neste ficheiro — coexistência com enum `app_role` em migrações anteriores deve ser tratada com cuidado na ordem de migração), `get_org_members_with_email`, etc.

**Trigger function:** `public.handle_new_user()` — SECURITY DEFINER — L854–880 mesmo ficheiro.

### 3.8 Índices (evidência no core v2)

Bloco **`-- INDEXES`** no mesmo ficheiro L611–630, exemplos:

```613:625:c:\workspace_hapitech\hapitech-main\supabase\migrations\20260301215513_create_hapitech_core_schema_v2.sql
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
...
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON public.messages(timestamp DESC);
```

Índice vector IVFFlat em migração anterior `20260218013937_7678234d-2be6-44b3-9613-009110e39238.sql` (embedding `vector(1536)`).

### 3.9 Constraints e relacionamentos

- **PKs:** `uuid PRIMARY KEY DEFAULT gen_random_uuid()` — padrão nas tabelas core.
- **FKs:** documentadas em `types.ts` por tabela em `Relationships` (ex.: `agents` → `wuzapi_connections`, `telegram_connections` — `types.ts` L207–221).
- **UNIQUE:** exemplos `user_roles` `(user_id, role)` — `20260217210811_520b0cee-8062-49e0-9567-0b4508e85efa.sql` L11.

### 3.10 Triggers (exemplos)

| Trigger | Tabela | Função | Ficheiro |
|---------|--------|--------|----------|
| `on_auth_user_created` | `auth.users` | `public.handle_new_user()` | `20260301215513_create_hapitech_core_schema_v2.sql` L882–883 |
| `update_*_updated_at` | várias | funções `update_updated_at_column` / similares | dispersos, ex. `20260216032249_96729937-a071-4bda-af8a-a47023ac985b.sql` |

Triggers adicionais em `restore_corp_tables.sql` (ex.: `trigger_generate_qr_code_queue` — grep `CREATE TRIGGER` no ficheiro).

### 3.11 Procedures

PostgreSQL usa **functions** `LANGUAGE plpgsql` para blocos procedimentais; não há separação “PROCEDURE” ANSI distinta — tudo mapeado em **`CREATE OR REPLACE FUNCTION`**.

---

## 4. Estrutura Auth

### 4.1 Login / signup / sessão (frontend)

```34:48:c:\workspace_hapitech\hapitech-main\src\hooks\useAuth.tsx
  const signUp = async (email: string, password: string, displayName?: string, orgName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName, org_name: orgName },
      },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
```

- **`emailRedirectTo`:** `window.location.origin` — **dependência do domínio** onde a SPA está hospedada; ao migrar domínio, atualizar lógica ou usar env.
- **`user_metadata`:** `display_name`, `org_name` — consumidos pelo trigger `handle_new_user` (`NEW.raw_user_meta_data`).

### 4.2 Hook de auth global

```20:31:c:\workspace_hapitech\hapitech-main\src\hooks\useAuth.tsx
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);
```

### 4.3 Pós-signup no banco (auth hook = trigger PostgreSQL)

Função **`handle_new_user`:** cria `profiles`, `organizations`, `organization_members` (owner), `user_credits` com plano `free` — evidência L854–876 em `20260301215513_create_hapitech_core_schema_v2.sql`.

**Dependência oculta:** o trigger faz `SELECT id ... FROM public.plans WHERE slug = 'free'` — **tem de existir** linha correspondente em `plans` antes de novos signups funcionarem plenamente.

### 4.4 Roles e permissões

- Tabela **`user_roles`** + enum **`app_role`**.
- Função **`has_role`** — usada em Edge Functions (ex.: `ai-models-proxy` verifica `super_admin`).
- Funções admin **`get_all_users_for_admin`**, **`get_admin_stats`** — `SECURITY DEFINER` com check `has_role(..., 'super_admin')` — `20260217210811_520b0cee-8062-49e0-9567-0b4508e85efa.sql` L78–96, L99–118.

### 4.5 OAuth / Google (lado Supabase)

Não há “Google OAuth” nativo só no `useAuth.tsx`; o fluxo passa por **Edge Functions** e tabelas de conexão:

- `google-oauth-token`, `gmail-oauth-token`, `google-calendar`, `calendar-availability`, `calendar-create-event`
- Tabela `google_calendar_connections` (`types.ts` L957+)
- SMTP/Gmail: `smtp_settings`, `send-recovery-email`

Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` em `Deno.env` (grep em `supabase/functions`).

### 4.6 Refresh token

Gerido **internamente** pelo `@supabase/supabase-js` com `autoRefreshToken: true` (`client.ts` L18). Refresh tokens residem no storage configurado (`localStorage`). **Não** estão em variáveis `VITE_*`.

---

## 5. Estrutura Edge Functions

### 5.1 Endpoints (padrão URL)

`https://<PROJECT_REF>.supabase.co/functions/v1/<nome-da-pasta>`

O frontend monta URLs com `import.meta.env.VITE_SUPABASE_URL` — exemplos:  
`src/hooks/useAiModels.ts` (`/functions/v1/ai-models-proxy`), `src/pages/WidgetChat.tsx` (`widget-chat`), `src/components/AgentKnowledgeSection.tsx` (`youtube-transcript`, `generate-embeddings`, …).

### 5.2 Inventário das 31 funções (pasta → ficheiro)

| # | Pasta (endpoint) | Ficheiro |
|---|------------------|----------|
| 1 | `accept-invite` | `supabase/functions/accept-invite/index.ts` |
| 2 | `admin-change-password` | `supabase/functions/admin-change-password/index.ts` |
| 3 | `agent-chat` | `supabase/functions/agent-chat/index.ts` |
| 4 | `ai-models-proxy` | `supabase/functions/ai-models-proxy/index.ts` |
| 5 | `asaas-checkout` | `supabase/functions/asaas-checkout/index.ts` |
| 6 | `asaas-invoices` | `supabase/functions/asaas-invoices/index.ts` |
| 7 | `asaas-webhook` | `supabase/functions/asaas-webhook/index.ts` |
| 8 | `calendar-availability` | `supabase/functions/calendar-availability/index.ts` |
| 9 | `calendar-create-event` | `supabase/functions/calendar-create-event/index.ts` |
| 10 | `check-inactivity` | `supabase/functions/check-inactivity/index.ts` |
| 11 | `check-task-deadlines` | `supabase/functions/check-task-deadlines/index.ts` |
| 12 | `clinicorp-query` | `supabase/functions/clinicorp-query/index.ts` |
| 13 | `create-team-user` | `supabase/functions/create-team-user/index.ts` |
| 14 | `elevenlabs-conversation-token` | `supabase/functions/elevenlabs-conversation-token/index.ts` |
| 15 | `elevenlabs-tts` | `supabase/functions/elevenlabs-tts/index.ts` |
| 16 | `extract-pdf` | `supabase/functions/extract-pdf/index.ts` |
| 17 | `generate-embeddings` | `supabase/functions/generate-embeddings/index.ts` |
| 18 | `gmail-oauth-token` | `supabase/functions/gmail-oauth-token/index.ts` |
| 19 | `google-calendar` | `supabase/functions/google-calendar/index.ts` |
| 20 | `google-oauth-token` | `supabase/functions/google-oauth-token/index.ts` |
| 21 | `invite-org-member` | `supabase/functions/invite-org-member/index.ts` |
| 22 | `scrape-website` | `supabase/functions/scrape-website/index.ts` |
| 23 | `send-recovery-email` | `supabase/functions/send-recovery-email/index.ts` |
| 24 | `solarmarket-query` | `supabase/functions/solarmarket-query/index.ts` |
| 25 | `sync-subscription` | `supabase/functions/sync-subscription/index.ts` |
| 26 | `telegram-webhook` | `supabase/functions/telegram-webhook/index.ts` |
| 27 | `verify-recovery-code` | `supabase/functions/verify-recovery-code/index.ts` |
| 28 | `widget-chat` | `supabase/functions/widget-chat/index.ts` |
| 29 | `whatsapp-webhook` | `supabase/functions/whatsapp-webhook/index.ts` |
| 30 | `wuzapi-proxy` | `supabase/functions/wuzapi-proxy/index.ts` |
| 31 | `youtube-transcript` | `supabase/functions/youtube-transcript/index.ts` |

### 5.3 Autenticação por função (padrões observados no código)

| Padrão | Funções típicas | Evidência |
|--------|-----------------|-----------|
| **Bearer utilizador + anon key** validação `getUser` / `getClaims` | `wuzapi-proxy` | `wuzapi-proxy/index.ts` L15–36 |
| **Bearer + service role** checagem manual | `admin-change-password` | `admin-change-password/index.ts` L21–38 |
| **Service role apenas** (sem JWT user na gateway) | `widget-chat`, webhooks | `widget-chat/index.ts` L19–22; `whatsapp-webhook` L1196–1198 |
| **Chamadas externas** | Todas as que usam `fetch` para APIs terceiras | Ex.: `clinicorp-query`, `asaas-*` |

### 5.4 Secrets (`Deno.env`) — lista para configurar no projeto novo

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EVO_URL`, `EVO_KEY`, `ASAAS_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `SITE_URL`, `RECOVERY_WEBHOOK_URL` — evidência: `grep Deno.env.get` em `supabase/functions/` (ver também `docs/AUDITORIA_VARIAVEIS_SEGREDOS_COMPLETA.md`).

**Secrets hardcoded (risco):** fallbacks Evolution em `wuzapi-proxy/index.ts` L39–41 e `whatsapp-webhook/index.ts` (constantes no topo do ficheiro) — **remover** e rotacionar chaves.

### 5.5 Webhooks inbound (Edge)

| Função | Origem típica |
|--------|----------------|
| `whatsapp-webhook` | Evolution API |
| `telegram-webhook` | Telegram `setWebhook` |
| `asaas-webhook` | Painel Asaas |

### 5.6 Webhooks outbound (desde Edge)

- **`wuzapi-proxy`:** define URL `${supabaseUrl}/functions/v1/whatsapp-webhook` na Evolution — L218+ do ficheiro.
- **`whatsapp-webhook`:** função `fireWebhookRules` — POST para URLs em `agents.webhook_rules` — `whatsapp-webhook/index.ts` L1169–1183.

### 5.7 Fluxo de execução típico (Edge)

1. Pedido HTTP/OPTIONS (CORS `*` em quase todas as functions — grep `Access-Control-Allow-Origin` em `supabase/functions`).
2. Parse JSON body.
3. `createClient` com service role ou validação JWT.
4. Leitura/escrita Postgres ou `fetch` externo.
5. Resposta JSON.

---

## 6. Estrutura Storage

### 6.1 Buckets (evidência `INSERT INTO storage.buckets`)

| Bucket id | public (flag migração) | Ficheiro |
|-----------|------------------------|----------|
| `chat-media` | `true` (bucket público) | `20260217172951_1eea09fa-6695-4496-a6f5-407afcb15401.sql` L2 |
| `knowledge` | `false` | `20260217135526_373799a1-578d-433a-b901-20dba9ba2106.sql` L3 |
| `avatars` | `true` | `20260228165001_39991103-423b-4259-a91d-d3695c242022.sql` L2–3; refinado em `20260217202003_560cf879-253f-438e-99c0-f1315f600a67.sql` L3–5 |
| (duplicado / refinamento `knowledge`) | | `20260228164928_03d7cb2c-6c5a-4ac0-a05e-5e46c71b6691.sql` L2–3 |
| `chat-media` (policies detalhadas + anon read) | | `20260228173143_9ef76b91-470f-465c-9b9b-59090ab64d41.sql` L2–19 |

### 6.2 Políticas sensíveis (chat media público)

```16:19:c:\workspace_hapitech\hapitech-main\supabase\migrations\20260228173143_9ef76b91-470f-465c-9b9b-59090ab64d41.sql
CREATE POLICY "Public can read chat media"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'chat-media');
```

**Implicação:** qualquer cliente com URL de objeto pode ler se o path for divulgado — classificar ficheiros como sensíveis conforme conteúdo (LGPD).

### 6.3 Uploads

- Via SDK Supabase Storage no frontend (código disperso em páginas/hooks — não listado linha a linha neste doc).
- Políticas `INSERT` frequentemente exigem `auth.uid()` alinhado a pasta — ex. avatares `20260217202003_*.sql` L8–10.

---

## 7. Estrutura Realtime

### 7.1 Publicação SQL

```888:899:c:\workspace_hapitech\hapitech-main\supabase\migrations\20260301215513_create_hapitech_core_schema_v2.sql
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
...
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

### 7.2 Subscriptions no frontend (listeners)

**Conversas (canal org-wide):**

```80:88:c:\workspace_hapitech\hapitech-main\src\hooks\useChat.ts
    const channel = supabase
      .channel(`conversations-realtime-org`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
```

**Mensagens por conversa:** mesmo ficheiro — canal `messages-${conversationId}` (continuação do ficheiro após L174).

**Notificações:** `src/hooks/useNotifications.ts`, `src/components/NotificationListener.tsx` — grep `.channel(` em `src/`.

### 7.3 Eventos

`INSERT` / `UPDATE` / `DELETE` em `conversations` e `messages` propagam para atualizar cache React Query em memória (`useChat.ts` L93–110).

---

## 8. Estrutura Webhooks

### 8.1 Inbound (terceiros → Supabase Edge)

| Webhook | URL | Autenticação na gateway |
|---------|-----|-------------------------|
| WhatsApp | `/functions/v1/whatsapp-webhook` | `verify_jwt = false` (`config.toml`) — confiar em segredo Evolution / validação payload |
| Telegram | `/functions/v1/telegram-webhook` | idem |
| Asaas | `/functions/v1/asaas-webhook` | idem — **validação de assinatura ausente no código analisado** (`asaas-webhook/index.ts` início) |

### 8.2 Outbound (Supabase → URL configurável)

- **`fireWebhookRules`** em `whatsapp-webhook/index.ts` L1169–1183 — POST JSON para `rule.url` de `agents.webhook_rules`.

### 8.3 Callbacks OAuth

- Funções `google-oauth-token`, `gmail-oauth-token` — troca de código; redirect `postmessage` em `gmail-oauth-token` (ver ficheiro).

---

## 9. Fluxo operacional (12 fluxos detalhados)

### 9.1 Como o Supabase funciona neste projeto

O browser trata Supabase como **BaaS**: Auth para identidade; PostgREST para dados com RLS; Realtime para atualização live; Edge Functions para operações privilegiadas, integrações e webhooks; Storage para binários.

### 9.2 Fluxo completo do “backend”

Pedido do cliente → **ou** PostgREST (JWT user) **ou** Edge Function (service role / JWT / público) → PostgreSQL e/ou API externa → resposta JSON ou atualização Realtime.

### 9.3 Fluxo Auth

`signUp` / `signInWithPassword` → GoTrue emite JWT → `onAuthStateChange` atualiza estado React → PostgREST usa `auth.uid()` nas policies.

### 9.4 Fluxo JWT

Access token no header `Authorization: Bearer`; refresh transparente pelo client; Edge Functions podem chamar `auth.getUser(jwt)` ou usar apenas service role.

### 9.5 Fluxo Edge Functions

Ver secção **5.7**.

### 9.6 Fluxo Storage

Cliente autenticado → Storage API → policies em `storage.objects` → objeto em bucket.

### 9.7 Fluxo Realtime

Alteração na tabela publicada → Realtime server → WebSocket cliente → handler em `useChat` atualiza React Query.

### 9.8 Fluxo webhooks

Evolution POST → `whatsapp-webhook` → processamento assíncrono (`waitUntil` / background) — ver início handler `whatsapp-webhook/index.ts` L1190+.

### 9.9 Fluxo integrações externas

Edge Function agrega segredo `Deno.env` + dados da BD (tokens por org) + `fetch` HTTP para Lovable, OpenAI, Google, Asaas, Clinicorp, Solar Market, Telegram, ElevenLabs, Jina, etc.

### 9.10 Fluxo WhatsApp

UI → `supabase.functions.invoke("wuzapi-proxy")` (`src/hooks/useEvolutionApi.ts` L28) → Evolution API; Evolution → `whatsapp-webhook`.

### 9.11 Fluxo financeiro

Frontend billing → functions `asaas-checkout`, `asaas-invoices`, `sync-subscription` → API Asaas; eventos → `asaas-webhook` → atualiza `asaas_subscriptions`, `organizations`, `notifications`.

### 9.12 Fluxo IA

Embeddings: `generate-embeddings` + tabela `knowledge_chunks`; chat: `agent-chat`, `widget-chat`, `clinicorp-query`, canais WhatsApp/Telegram; listagem modelos: `ai-models-proxy` + tabelas `ai_providers` / `ai_models`.

---

## 10. Dependências críticas

| Dependência | Motivo |
|-------------|--------|
| Projeto Supabase ativo | Sem ele não há app |
| Migrações 91 aplicadas em ordem | Schema incompleto quebra triggers/FKs |
| Plano `free` em `plans` | Signup + `handle_new_user` |
| Secrets Edge completos | Functions falham |
| `SUPABASE_URL` em Evolution webhook | Sem URL correta não há mensagens inbound |
| RLS coerente com modelo multi-org | `_org_user_ids()` e funções helper |

---

## 11. Dependências ocultas

| Oculta | Detalhe |
|--------|---------|
| `supabase_realtime` publication | Nome fixo gerido pela plataforma |
| `emailRedirectTo: window.location.origin` | Acoplamento ao domínio da SPA |
| Imports Deno `esm.sh` / `deno.land` | Supply chain / disponibilidade |
| `ai_providers_public` GRANT **anon** | Permite ler metadados de providers sem login completo em alguns fluxos |
| View `security_invoker = false` | Bypass RLS na *base table* para colunas projetadas — comentário na migração L1–2 `20260302131344_*.sql` |

### 11.1 Dependências circulares

Não há ciclo DDL explícito; a **sequência temporal** rollback/restore **simula** dependência lógica: estado intermédio entre migrações não deve ser assumido como estado final.

---

## 12. Problemas segurança

| ID | Problema | Evidência |
|----|----------|-----------|
| S1 | `verify_jwt = false` em massa | `supabase/config.toml` |
| S2 | Policies `USING (true)` em `ai_providers` / `ai_models` | `create_hapitech_core_schema_v2.sql` L824–825 |
| S3 | Policies `USING (true) WITH CHECK (true)` em CRM/contactos | `20260228164156_f5bb9393-e47e-402c-973f-18e49cdce9d8.sql` L53–77, L186 |
| S4 | Storage `anon` SELECT em `chat-media` | `20260228173143_*.sql` L16–19 |
| S5 | GRANT SELECT view a **anon** | `20260302131344_*.sql` L12 |
| S6 | Webhooks Asaas sem assinatura visível | `asaas-webhook/index.ts` |
| S7 | SSRF outbound `fireWebhookRules` | `whatsapp-webhook/index.ts` L1175–1183 |
| S8 | Segredos Evolution no código | `wuzapi-proxy/index.ts` L39–41 |

---

## 13. Problemas arquitetura

- **Lógica de negócio** espalhada entre **RLS**, **RPC SECURITY DEFINER**, e **31 Edge Functions** — dificulta auditoria única.
- **Dupla sobrecarga** de `has_role` (text vs enum) entre migrações — risco de confusão de tipo em manutenção.
- **`types.ts` desalinhado** com `mcp_connections` — risco de bugs no frontend TypeScript.

---

## 14. Problemas migrations

- **Rollback + restore** obrigatórios na ordem — falha parcial deixa BD inconsistente.
- **Migrações corp** adicionam superfície (e-commerce, QR) que pode não ser necessária no novo ambiente — avaliar fork de migrações para projeto minimalista.

---

## 15. Problemas policies

- **`USING (true)`** em tabelas com dados multi-tenant ou segredos — listado em S2–S3.
- **`plans_select_all` `USING (true)`** — intencional para leitura de planos por qualquer autenticado; validar se inclui campos sensíveis.

---

## 16. Problemas auth

- **`verify_jwt = false`** em webhooks — superfície ampla se URL for descoberta.
- **Redirect signup** fixo a `window.location.origin` — ambientes com múltiplos domínios precisam lista explícita no Dashboard Supabase.

---

## 17. Problemas Edge Functions

- Mistura **service_role** com dados de utilizador sem padrão uniforme.
- **CORS `*`** em quase todas — facilita abuso cross-origin combinado com endpoints fracos.
- **Fallback** `SUPABASE_SERVICE_ROLE_KEY` em `telegram-webhook` para transcrição — `telegram-webhook/index.ts` L1031 (anti‑padrão).

---

## 18. Plano de reconstrução (passo a passo + comandos)

### Fase A — Projeto e base

1. Criar projeto no dashboard Supabase.  
2. Instalar CLI: documentação oficial Supabase CLI.  
3. `supabase login`  
4. Atualizar `c:\workspace_hapitech\hapitech-main\supabase\config.toml` → `project_id = "<novo_ref>"`  
5. `cd c:\workspace_hapitech\hapitech-main`  
6. `supabase link --project-ref <novo_ref>`  
7. `supabase db push`  
8. Validar SQL:

```sql
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
```

### Fase B — Auth

1. Dashboard → Authentication → URL Configuration: **Site URL** = domínio produção da SPA.  
2. **Redirect URLs:** incluir `https://<domínio>/**` e localhost dev.  
3. Configurar **Google provider** (se usado) com mesmos Client ID/Secret que irão para `Deno.env`.  
4. Testar `signUp` / `signIn` e verificar criação de linhas em `profiles`, `organizations`, `organization_members`.

### Fase C — Storage

1. Confirmar buckets: query `storage.buckets` ou UI.  
2. Testar upload/download com utilizador de teste para `knowledge`, `avatars`, `chat-media`.

### Fase D — Edge Functions

1. `supabase secrets set KEY=value ...` (todos os segredos listados secção 5.4).  
2. `supabase functions deploy --project-ref <novo_ref>` (por função ou script).  
3. Testar `wuzapi-proxy` com JWT real; testar `whatsapp-webhook` com payload de teste Evolution.

### Fase E — Realtime

1. Confirmar tabelas na publicação (UI Realtime ou SQL `pg_publication_tables`).  
2. Abrir SPA e verificar canais em `useChat.ts`.

### Fase F — Frontend

1. Definir `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no CI / `.env` de build.  
2. `npm run build`  
3. `npm run start` ou imagem Docker.

### Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Signup sem org/perfil | Plano `free` em falta; trigger erro |
| Realtime sem eventos | Tabela fora da publication; RLS bloqueia replica identity |
| 401 nas functions | Header `apikey` ou `Authorization` incorreto; secret não setado |
| WhatsApp sem webhook | Evolution ainda aponta para URL antiga |

---

## 19. Plano de migração (reutilizar / recriar / rotacionar)

| Artefacto | Reutilizar | Recriar | Rotacionar |
|-----------|------------|---------|--------------|
| SQL migrações (código) | Sim | — | — |
| Projeto Supabase | Não | Sim | — |
| `service_role` / `anon` | Não | Novos | Sim se leak |
| `auth.users` | Export/import especial | Ou utilizadores novos | — |
| Storage blobs | Backup | Bucket novo | — |
| Webhooks Evolution/Asaas/Telegram | Não URLs antigas | Sim | Tokens |
| OAuth Google | Mesmo projeto GCP? | Redirects novos | Client secret se comprometido |

**Dependência ambiente antigo:** `project_id` no `config.toml`; fallbacks Evolution em código; `SITE_URL` default `lovable.app` em `invite-org-member`, `create-team-user`; origem default em `send-recovery-email`.

---

## 20. Checklist técnico

- [ ] 91 migrações aplicadas sem erro  
- [ ] `mcp_connections` existe na BD pós-push  
- [ ] `supabase gen types typescript` executado e `types.ts` atualizado no repo  
- [ ] Todas as Edge Functions deployadas  
- [ ] Secrets definidos (`supabase secrets list`)  
- [ ] Auth URLs alinhadas ao domínio  
- [ ] Evolution webhook → novo `/whatsapp-webhook`  
- [ ] Asaas webhook + validação a implementar  
- [ ] Telegram `setWebhook`  
- [ ] Realtime testado em staging  
- [ ] Build frontend com novos `VITE_*`  

---

## 21. Checklist segurança

- [ ] Remover literais Evolution do código e redeploy  
- [ ] Rever **cada** policy `USING (true)`  
- [ ] Restringir storage anon onde possível  
- [ ] Ativar `verify_jwt` onde aplicável + segredo em webhooks  
- [ ] Implementar verificação Asaas webhook  
- [ ] Sanitizar URLs em `fireWebhookRules` (SSRF)  
- [ ] Auditar logs por PII  

---

## 22. Checklist deploy

- [ ] Pipeline injeta `VITE_SUPABASE_*` no `npm run build`  
- [ ] TLS no domínio da SPA  
- [ ] CORS no edge da SPA (se separado)  
- [ ] Variáveis no host (Coolify/K8s) documentadas  
- [ ] Smoke test: login, chat, upload knowledge, billing sandbox  

---

## Ordem de reconstrução (secção pedida original — resumo operacional)

1. **Migrations:** ordem = nome ficheiro temporal crescente.  
2. **Tabelas:** ordem **já embutida** nas migrações (FKs respeitadas pelo autor SQL).  
3. **Funções SQL:** antes de triggers que as invocam; `handle_new_user` antes do trigger `on_auth_user_created`.  
4. **Triggers:** após tabelas e funções referenciadas.  
5. **Policies:** após `ENABLE ROW LEVEL SECURITY` nas tabelas.  
6. **Buckets:** após existir `storage`; políticas após bucket.  
7. **Deploy Edge Functions:** após secrets e URL final conhecida.  
8. **Auth:** Site URL / Redirects antes de testes OAuth email.  
9. **OAuth Google:** após Auth base e secrets.  
10. **Webhooks externos:** último passo quando URL `https://<ref>.supabase.co/functions/v1/...` está estável.

---

## Análise segurança (LGPD / financeiro / operacional / takeover / vazamento / indisponibilidade)

| Risco | Ligação Supabase |
|-------|-------------------|
| **LGPD** | `messages`, `conversations`, `knowledge_files`, media em `chat-media`, dados CRM em `leads` |
| **Financeiro** | `asaas_subscriptions`, webhook Asaas |
| **Operacional** | Falha de `db push`; secrets em falta; domínio errado em Auth |
| **Takeover** | `service_role` leak; Evolution key no código |
| **Vazamento** | Policies fracas; storage anon; logs functions |
| **Indisponibilidade** | quota Supabase; Evolution fora; Lovable/OpenAI down |

---

## Análise migração — dependências domínio / OAuth / WhatsApp antigo

| Tipo | O que atualizar |
|------|-----------------|
| **Domínio** | `VITE_SUPABASE_URL` (novo ref), `window.location.origin` em signup, redirects no dashboard Auth |
| **OAuth** | Google Cloud “Authorized redirect URIs” para URLs da SPA + callbacks das functions |
| **WhatsApp** | Evolution instância nova; `EVO_URL`/`EVO_KEY`; reconfigurar webhook para novo `SUPABASE_URL` |

---

*Documento atualizado para cumprir integralmente o pedido (mapeamento completo + formato 1–22). Para inventário de serviços externos fora do Postgres, cruzar com `docs/INVENTARIO_SERVICOS_EXTERNOS_COMPLETO.md` e `docs/AUDITORIA_SEGURANCA_COMPLETA.md`.*

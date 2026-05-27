# hapitechAI — Arquitetura Técnica

**Última atualização:** maio de 2026

**Público:** desenvolvedores que trabalham no projeto

**Documentos relacionados:**

- [001 - Visão Geral e Plano de Desenvolvimento](./001%20-%20Visão%20Geral%20e%20Plano%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [002 - Arquitetura Técnica](./002%20-%20Arquitetura%20Técnica%20-%20hapitechAI.md)
- [003 - Módulos e Requisitos](./003%20-%20Módulos%20e%20Requisitos%20-%20hapitechAI.md)
- [004 - Guia de Desenvolvimento](./004%20-%20Guia%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md)
- [EXTRA - Lovable Project Info](./Extra%20-%20Lovable%20Project%20Info.md)

---

## 1. Visão Geral da Arquitetura

### 1.1 Estilo arquitetural

hapitechAI segue três pilares arquiteturais combinados:

- **SPA (Single Page Application):** frontend React servido como arquivos estáticos — sem SSR, sem Next.js
- **BaaS (Backend as a Service):** Supabase substitui um servidor de aplicação proprietário (autenticação, banco, storage, realtime, CRUD com RLS)
- **Serverless por edge (Deno):** toda lógica que exige chamadas externas ou processamento fora do banco vive em Supabase Edge Functions — sem servidor Node/Python dedicado

Não existe camada de API REST proprietária. O frontend fala diretamente com Supabase JS, que roteada para PostgREST (CRUD + RLS), Auth (GoTrue), Storage, Realtime e Edge Functions.

### 1.2 Diagrama de contexto

```
┌─────────────────────────────────────────────────────────────────┐
│  Cliente / Browser                                              │
│  SPA React (Docker · Node 22 Alpine · serve :3000)             │
└────────────────────┬────────────────────────────────────────────┘
                     │  supabase-js (HTTPS + WSS)
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Supabase Platform                                              │
│  ├─ PostgREST ──→ PostgreSQL (schema public + pgvector + RLS)  │
│  ├─ GoTrue (Auth · JWT · email/senha)                          │
│  ├─ Storage (avatars · knowledge · chat-media)                 │
│  ├─ Realtime (Postgres CDC · WebSocket)                        │
│  └─ Edge Functions (31 funções Deno)                           │
│        │                                                        │
│        ├──→ Evolution API ──→ Baileys ──→ WhatsApp             │
│        ├──→ Telegram Bot API ──→ Telegram                      │
│        ├──→ AI Providers (OpenAI · Anthropic · Gemini · ...)   │
│        ├──→ ElevenLabs (TTS)                                    │
│        ├──→ Asaas (billing)                                     │
│        └──→ Google APIs (OAuth · Calendar · Gmail)             │
└─────────────────────────────────────────────────────────────────┘

Inbound (webhooks de serviços externos → Edge Functions):
  Evolution API   ──POST /whatsapp-webhook──→ mensagens WhatsApp
  Telegram API    ──POST /telegram-webhook──→ mensagens Telegram
  Asaas           ──POST /asaas-webhook────→ confirmações de pagamento
```

---

## 2. Frontend

### 2.1 Estrutura de diretórios

```
src/
  assets/
    custom-icons/   — ícones SVG da aplicação
    mcp/            — assets para MCP integrations
    providers/      — logos de provedores de IA
  components/       — componentes reutilizáveis (sem lógica de rota)
  hooks/            — custom hooks (auth, queries, realtime)
  i18n/             — internacionalização (pt-BR, en)
  integrations/
    supabase/       — cliente Supabase, tipos gerados, helpers de query
  lib/              — utilitários (cn, formatters)
  pages/            — 22 páginas/rotas (um arquivo por rota)
  test/             — setup Vitest + mocks globais
  App.tsx           — definição de rotas (React Router v6)
  main.tsx          — entry point, providers globais
```

### 2.2 Roteamento

React Router v6. Todas as rotas definidas em `App.tsx`. Padrão:

- Rotas autenticadas: redirect para `/auth` se sem sessão válida
- Rota `/widget/:id/iframe` — pública, sem autenticação (widget embeddable)
- Rota `/gmail-oauth-callback` — pública, callback OAuth Google

### 2.3 Estado e data fetching

| Responsabilidade | Solução |
|-----------------|---------|
| Queries e cache de servidor | TanStack Query v5 (`useQuery`, `useMutation`) |
| Operações no banco | Supabase JS (PostgREST via `supabase.from(...)`) |
| Uploads de arquivo | Supabase Storage JS |
| Realtime (mensagens, notifs) | Supabase Realtime JS (`supabase.channel(...)`) |
| Estado de sessão/org | `useAuth` hook (contexto React local) |
| Estado de UI local | `useState` / `useReducer` por componente |

Não há gerenciador de estado global (sem Redux, sem Zustand). O cache do TanStack Query funciona como fonte de verdade para dados do servidor.

### 2.4 Componentes principais

| Componente | Responsabilidade |
|-----------|----------------|
| `AppLayout` | Layout raiz: sidebar + conteúdo principal |
| `AppSidebar` | Navegação lateral com módulos principais |
| `AgentChat` | Chat ao vivo (IA + assumir controle humano) |
| `AgentEditor` | Formulário de criação/edição de agentes |
| `AgentKnowledgeSection` | Gestão de base de conhecimento por agente |
| `ModelSelectorModal` | Seleção e troca de modelo de IA |
| `ContactDetailPanel` | Painel lateral de detalhes de contato |
| `LeadDetailPanel` | Painel lateral de detalhes de lead |
| `CommandPalette` | Paleta de comandos global (⌘K / Ctrl+K) |
| `NotificationListener` | Subscriber Realtime global para notificações |
| `AudioPlayer` | Player de mensagens de voz |
| `ChatMediaContent` | Renderização de mídia inline em conversas |
| `CrmAutomationView` | Configuração de regras de automação CRM |
| `McpIntegrations` | Gestão de conexões MCP |
| `ElevenLabsSection` | Config ElevenLabs por agente |
| `GoogleCalendarWizard` | Wizard de conexão Google Calendar |

---

## 3. Backend — Supabase

### 3.1 Autenticação (GoTrue)

- Provedor: email/senha
- JWT assinado pelo Supabase; payload inclui `sub` (user_id) e claims customizados
- Tabela `profiles` sincronizada com `auth.users` via trigger `on_auth_user_created`
- Multi-tenancy: cada usuário pertence a uma `organization` via `organization_members`
- Convites: edge function `invite-org-member` envia email com magic link
- Recovery/change-email: usa `SITE_URL` (deve ser configurado como secret — não hardcoded)

### 3.2 Banco de Dados

PostgreSQL gerenciado pelo Supabase. 91 migrations em `supabase/migrations/`. Extensões ativas:

| Extensão | Uso |
|---------|-----|
| `pgvector` | Embeddings de conhecimento (`vector(1536)`) |
| `uuid-ossp` | Geração de UUIDs como PKs |
| `pg_cron` (se habilitado) | Jobs agendados |

#### Tabelas principais

| Tabela | Descrição |
|--------|-----------| 
| `organizations` | Tenant raiz; toda entidade de negócio pertence a uma org |
| `profiles` | Usuários (espelho de `auth.users` + dados extras) |
| `organization_members` | Relação N:N usuário ↔ org com role (`owner`, `admin`, `member`) |
| `agents` | Agentes de IA configurados pela org |
| `conversations` | Conversas (WhatsApp, Telegram, widget, interno) |
| `messages` | Mensagens de uma conversa (role: user/assistant/system) |
| `contacts` | Contatos/clientes da org |
| `leads` | Leads CRM com estágio e pontuação |
| `tasks` | Tarefas associadas a contatos ou conversas |
| `knowledge_bases` | Base de conhecimento vinculada a um agente |
| `knowledge_items` | Itens individuais (arquivo ou URL) com status de ingestão |
| `knowledge_chunks` | Chunks de texto com coluna `embedding vector(1536)` |
| `whatsapp_connections` | Instâncias Evolution API (número, status, QR) |
| `telegram_connections` | Bots Telegram (token, username) |
| `widget_configurations` | Configs visuais de widgets (cor, ícone, posição) |
| `ai_providers` | Chaves de API de IA por org (OpenAI, Anthropic, etc.) |
| `credits` | Saldo atual de créditos por org |
| `credit_transactions` | Histórico de uso e recarga |
| `notifications` | Notificações in-app por usuário |
| `automation_rules` | Regras CRM (ex: inatividade X min → fechar conversa) |
| `mcp_connections` | Conexões MCP (Model Context Protocol) por org |

#### Multi-tenancy e RLS

Todas as tabelas de negócio têm coluna `organization_id`. As políticas RLS filtram por org do JWT:

```sql
-- Padrão SELECT
USING (
  organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
)

-- Padrão INSERT
WITH CHECK (
  organization_id = (
    SELECT organization_id FROM profiles WHERE id = auth.uid()
  )
)
```

> ⚠️ **Débito crítico:** tabela `ai_providers` tem política `USING (true)`, expondo chaves de API de IA para qualquer usuário autenticado. Ver [005](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

#### pgvector e RAG

A coluna `embedding` em `knowledge_chunks` é `vector(1536)`. A função SQL `match_knowledge_chunks` realiza busca por similaridade coseno:

```sql
SELECT *, 1 - (embedding <=> query_embedding) AS similarity
FROM knowledge_chunks
WHERE knowledge_base_id = $1
ORDER BY embedding <=> query_embedding
LIMIT $2;
```

### 3.3 Storage

| Bucket | Conteúdo | Visibilidade |
|--------|---------|-------------|
| `avatars` | Fotos de perfil de usuários e agentes | Privado (autenticado, por org) |
| `knowledge` | Arquivos da base de conhecimento (PDF, TXT, CSV) | Privado (autenticado, por org) |
| `chat-media` | Imagens, áudios e documentos de conversas | Privado (autenticado, por org) |

### 3.4 Realtime

Supabase Realtime (Postgres CDC via WebSocket) usado para:

| Canal | Evento | Consumer |
|-------|--------|---------|
| `messages` | INSERT (nova mensagem) | `AgentChat`, chat pages |
| `conversations` | UPDATE (status, IA on/off) | Lista de conversas |
| `notifications` | INSERT | `NotificationListener` |
| `leads` / `contacts` | INSERT/UPDATE | CRM views |

O componente `NotificationListener` gerencia as subscriptions globais durante a sessão do usuário.

---

## 4. Edge Functions

### 4.1 Padrão de implementação

Todas as funções seguem estrutura Deno:

```typescript
// supabase/functions/<nome>/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // lógica da função
});
```

> ⚠️ `verify_jwt = false` em `supabase/config.toml` para todas as funções. A validação JWT deve ser feita manualmente via `createClient` com o Bearer token do header `Authorization`. A consistência dessa validação varia por função — ver [005](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

### 4.2 Catálogo por domínio

#### Chat / IA

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `agent-chat` | POST (frontend) | Chat interno via painel hapitechAI |
| `clinicorp-query` | POST (frontend/webhook) | Fluxo principal de resposta IA (inclui RAG, tool calls, histórico) |
| `widget-chat` | POST (público, sem auth) | Chat via widget embeddable em sites externos |
| `ai-models-proxy` | POST (frontend) | Lista modelos disponíveis por provedor de IA |

#### WhatsApp

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `wuzapi-proxy` | POST (frontend) | Proxy autenticado para Evolution API: envio de mensagens, criação de instância, obtenção de QR |
| `whatsapp-webhook` | POST (Evolution API) | Recebe eventos inbound (mensagens, status), grava no DB, aciona resposta IA |

#### Telegram

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `telegram-webhook` | POST (Telegram API) | Recebe updates, grava mensagens, aciona resposta IA |
| `setup-telegram-webhook` | POST (frontend) | Registra URL de webhook na Telegram Bot API |

#### Base de Conhecimento

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `generate-embeddings` | POST (frontend) | Processa arquivo/URL → divide em chunks → gera embeddings → grava `knowledge_chunks` |
| `scrape-website` | POST (frontend) | Scraping de URL para ingestão de conteúdo |
| `youtube-transcript` | POST (frontend) | Extrai transcrição de YouTube via Jina Reader |

#### Billing (Asaas)

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `asaas-checkout` | POST (frontend) | Cria cobrança ou assinatura no Asaas |
| `asaas-invoices` | POST (frontend) | Lista faturas do cliente |
| `asaas-webhook` | POST (Asaas) | Confirma pagamentos, atualiza créditos na org |
| `sync-subscription` | POST / cron | Sincroniza status de assinatura com Asaas |

#### Google OAuth / Produtividade

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `google-oauth-token` | POST (frontend) | Troca código OAuth por access_token (Calendar) |
| `gmail-oauth-token` | POST (frontend) | Troca código OAuth por access_token (Gmail) |
| `google-calendar` | POST (frontend / IA) | Lista eventos do calendário |
| `calendar-availability` | POST (frontend / IA) | Verifica disponibilidade em slots de tempo |
| `calendar-create-event` | POST (frontend / IA) | Cria evento no Google Calendar |

#### Voz

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `elevenlabs-tts` | POST (frontend / IA) | Gera áudio TTS via ElevenLabs |
| `elevenlabs-conversation-token` | POST (frontend) | Gera token para conversa de voz ElevenLabs |

#### Usuários / Org

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `invite-org-member` | POST (frontend) | Envia convite de email para novo membro |
| `create-org-with-owner` | POST (Auth hook / frontend) | Cria org e vincula owner no signup |
| `delete-organization` | POST (superadmin) | Remove organização e todos os dados associados |

#### Integrações diversas

| Função | Trigger | Responsabilidade |
|--------|---------|----------------|
| `clinicorp-webhook` | POST (Clinicorp) | Recebe eventos do sistema Clinicorp |
| `solar-market-query` | POST (frontend / IA) | Consulta API Solar Market |
| `fetch-cep` | POST (frontend) | Consulta ViaCEP — endereço por CEP |
| `check-automation-rules` | POST / cron | Avalia regras de automação CRM (inatividade, etc.) |

---

## 5. Fluxos de Dados

### 5.1 Mensagem WhatsApp inbound

```
[WhatsApp] → [Evolution API] → POST /whatsapp-webhook
  1. Valida x-api-key (EVO_KEY)
  2. Identifica conversação ou cria nova em `conversations`
  3. Grava mensagem em `messages` (role: user)
  4. Busca agente vinculado à conexão WhatsApp
  5. Verifica se IA está ativa para a conversa
  6. Se ativa → chama /clinicorp-query:
     a. Recupera histórico de mensagens recentes
     b. RAG: busca `knowledge_chunks` por similaridade de embedding
     c. Monta prompt (system + contexto + histórico + mensagem)
     d. Chama AI provider (OpenAI / Anthropic / Gateway)
     e. Grava resposta em `messages` (role: assistant)
  7. POST /wuzapi-proxy → Evolution API → envia mensagem no WhatsApp
```

### 5.2 Chat pelo painel (frontend → IA)

```
[Frontend AgentChat]
  → POST /agent-chat (autenticado via JWT)
    1. Valida sessão do usuário
    2. Busca configuração do agente
    3. RAG (se knowledge base ativa)
    4. Chama AI provider
    5. Grava mensagem no DB
  ← Resposta IA
  ← Realtime broadcast → frontend atualiza chat em tempo real
```

### 5.3 Ingestão de conhecimento

```
[Frontend — upload ou URL]
  1. Upload arquivo → Supabase Storage (bucket `knowledge`)
  2. Grava `knowledge_item` (status: processing)
  3. POST /generate-embeddings:
     a. Lê arquivo do Storage (ou scrape da URL)
     b. Divide texto em chunks (com overlap configurável)
     c. Para cada chunk: POST AI Gateway → embedding vector(1536)
     d. Grava `knowledge_chunk` com embedding e metadata
  4. Atualiza `knowledge_item` (status: ready)
```

### 5.4 Billing — confirmação de pagamento

```
[Asaas]
  → POST /asaas-webhook
    1. Valida payload (⚠️ sem validação de assinatura HMAC — débito)
    2. Atualiza status da assinatura no DB
    3. Credita créditos na org (INSERT em `credit_transactions`)
    4. Atualiza `credits` da org
```

---

## 6. Integrações Externas

| Serviço | Protocolo | Direção | Edge Functions envolvidas |
|---------|----------|---------|----|
| Evolution API | REST HTTP | Bidirecional | `wuzapi-proxy`, `whatsapp-webhook` |
| Telegram Bot API | REST HTTP | Bidirecional | `telegram-webhook`, `setup-telegram-webhook` |
| Lovable AI Gateway | REST (OpenAI-compat) | Outbound | `clinicorp-query`, `agent-chat`, `generate-embeddings` |
| OpenAI API | REST | Outbound | via config `ai_providers` |
| Anthropic API | REST | Outbound | via config `ai_providers` |
| Google Gemini | REST (OpenAI-compat) | Outbound | via config `ai_providers` |
| Groq API | REST (OpenAI-compat) | Outbound | via config `ai_providers` |
| Mistral API | REST (OpenAI-compat) | Outbound | via config `ai_providers` |
| DeepSeek API | REST (OpenAI-compat) | Outbound | via config `ai_providers` |
| ElevenLabs | REST | Outbound | `elevenlabs-tts`, `elevenlabs-conversation-token` |
| Asaas | REST | Bidirecional | `asaas-checkout`, `asaas-invoices`, `asaas-webhook` |
| Google OAuth 2.0 | OAuth 2.0 | Bidirecional | `google-oauth-token`, `gmail-oauth-token` |
| Gmail API | REST | Outbound | via tokens OAuth |
| Google Calendar API | REST | Outbound | `google-calendar`, `calendar-availability`, `calendar-create-event` |
| Jina Reader | REST | Outbound | `youtube-transcript`, `scrape-website` |
| ViaCEP | REST | Outbound | `fetch-cep` |
| Clinicorp | REST | Bidirecional | `clinicorp-webhook`, `clinicorp-query` |
| Solar Market | REST | Outbound | `solar-market-query` |

---

## 7. Decisões Arquiteturais Relevantes

| Decisão | Justificativa | Trade-off |
|---------|-------------|----------|
| BaaS (Supabase) sem servidor próprio | Velocidade de desenvolvimento; origem no Lovable | Menos controle sobre lógica de negócio; vendor lock-in parcial |
| Edge Functions (Deno) vs Node | Padrão do Supabase; latência global de edge | Ecossistema Deno menor; imports via URL (fragibilidade) |
| RLS no banco como camada de autorização | Autorização centralizada e consistente sem lógica duplicada na API | Políticas complexas difíceis de testar; `verify_jwt = false` reduz o benefício |
| Multi-provedor de IA por org | Flexibilidade de modelo por caso de uso | Chaves armazenadas em DB (aumenta superfície de ataque) |
| pgvector para RAG | Sem serviço externo de vector store; dados co-localizados com o resto | Escalabilidade limitada vs. Pinecone/Weaviate para volumes muito grandes |
| Lovable AI Gateway como default | Provedor fornecido pelo ambiente de origem Lovable | Dependência de domínio externo (`ai.gateway.lovable.dev`); deve ser substituível |
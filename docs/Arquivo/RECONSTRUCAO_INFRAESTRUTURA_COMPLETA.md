# Documentação de engenharia reversa — reconstrução de infraestrutura independente

**Projeto:** `hapitech-main` (nome npm interno: `vite_react_shadcn_ts`)  
**Origem:** código recebido via ZIP (sem garantia de paridade com Git remoto).  
**Objetivo deste documento:** permitir reconstruir aplicação e operações num ambiente **novo**, sem dependência do Coolify/DNS/Supabase/Evolution anteriores.

---

## 1. Resumo executivo

- **Frontend:** SPA React 18 + Vite 5 + TypeScript; estado servidor principalmente via **Supabase** (`@supabase/supabase-js`) + TanStack Query; UI Radix/shadcn + Tailwind.
- **Backend “da aplicação”:** não há servidor Node/Java próprio no repositório; a lógica servidor está em **Supabase Edge Functions** (Deno), sob `/functions/v1/*`.
- **Dados:** PostgreSQL gerido pelo **Supabase**, schema predominante `public`, **RLS** extensivo; extensão **vector** (pgvector) para embeddings.
- **Deploy documentado no código:** `nixpacks.toml` → Node 22 → `npm install` → `npm run build` → `npm run start` (`serve` na porta **3000**, artefacto estático `dist/`).
- **CI:** `.github/workflows/ci.yml` — lint, testes (continua mesmo com falha), build; **não** faz deploy nem Docker build.
- **Integrações críticas:** Supabase (Auth, DB, Storage, Functions), **Evolution API** (WhatsApp via proxy/webhook), **Lovable AI Gateway** (`ai.gateway.lovable.dev`) para chat/embeddings em vários fluxos, **APIs OpenAI diretas** onde há chave OpenAI na BD, **Google OAuth/Calendar**, **Telegram Bot API**, **ElevenLabs**, **Asaas** (billing BR), **Clinicorp** e **Solar Market** (HTTP externos hardcoded nas functions).

**Risco estrutural:** chaves e URLs de infra antiga aparecem como **fallback no código-fonte** (ver secção 9) — qualquer clone público expõe superfície de ataque se não forem removidas/substituídas.

---

## 2. Arquitetura geral

### 2.1 Diagrama textual (componentes lógicos)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Browser (utilizador final / widget iframe)                                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │ HTTPS
                                │  • REST + Auth JWT (Supabase)
                                │  • invoke Edge Functions: /functions/v1/*
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Supabase Cloud (projeto dedicado)                                           │
│  • GoTrue (Auth) • PostgREST • Realtime • Storage • PostgreSQL + RLS        │
│  • Edge Functions (Deno) — 31 handlers em supabase/functions/*/index.ts      │
└───────┬─────────────────┬───────────────────────┬─────────────────────────────┘
        │                 │                       │
        │                 │                       │
        ▼                 ▼                       ▼
┌───────────────┐ ┌───────────────────┐ ┌─────────────────────────────────────┐
│ Evolution API │ │ Lovable Gateway    │ │ APIs públicas (Telegram, Google,    │
│ (WhatsApp)    │ │ OpenAI (direct)    │ │ ElevenLabs, Asaas, Clinicorp, SM…)   │
└───────────────┘ └───────────────────┘ └─────────────────────────────────────┘
```

### 2.2 Relação frontend ↔ Supabase

| Componente | Evidência |
|-----------|-----------|
| Cliente Supabase | `c:\workspace_hapitech\hapitech-main\src\integrations\supabase\client.ts` — `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)` |
| Tipos gerados | `src\integrations\supabase\types.ts` (referenciado pelo client) |
| Chamadas HTTP às functions | Múltiplos ficheiros sob `src\` — padrão `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<nome>` |

### 2.3 Relação Supabase ↔ Edge Functions

- Funções listadas como pastas em `c:\workspace_hapitech\hapitech-main\supabase\functions\` (31× `index.ts`).
- Configuração JWT: `c:\workspace_hapitech\hapitech-main\supabase\config.toml` define `verify_jwt = false` para **todas** as funções nomeadas — **implicação de segurança:** validação de identidade deve estar **dentro** do código TS ou por segredo partilhado; não confiar só na camada Supabase Gateway JWT para estas rotas.

### 2.4 Relação WhatsApp ↔ Evolution API

| Caminho | Papel |
|---------|--------|
| `supabase\functions\wuzapi-proxy\index.ts` | Proxy HTTP do browser/app para Evolution; lê `EVO_URL`, `EVO_KEY`; **fallback hardcoded** para URL e chave se env não existir |
| `supabase\functions\whatsapp-webhook\index.ts` | Webhook receptor de eventos WhatsApp; mesmos defaults no topo do ficheiro |

### 2.5 Docker / deploy

| Artefacto | Existe no ZIP? | Função |
|-----------|----------------|--------|
| `Dockerfile` | **Sim** (raiz do repositório) | Multi-stage Node 22 Alpine → `serve dist` na porta 3000 |
| `docker-compose*.yml` | Exemplo em `infra/docker-compose.stack.example.yml` | Stack referência (não era parte do ZIP original) |
| `nixpacks.toml` | **Sim** | Build estático + `serve` porta 3000 |

Deploy típico “Coolify ou PaaS”: container gerado por Nixpacks ou imagem Node que executa `npm run start` após build.

### 2.6 Relação APIs externas ↔ sistema

- **Chaves por utilizador/organização** armazenadas em tabelas (ex.: providers OpenAI, tokens Solar Market) — consumidas nas Edge Functions com **service role**.
- **Chaves globais** via `Deno.env` nos secrets do Supabase.

---

## 3. Fluxo da aplicação (end-to-end)

### 3.1 Arranque UI

1. `src\main.tsx` monta React (não lido aqui, mas padrão Vite).
2. `src\App.tsx` envolve com `QueryClientProvider`, `AuthProvider`, `LanguageProvider`, `BrowserRouter`.
3. Rotas públicas: `/auth`, `/reset-password`, `/gmail-oauth-callback`, `/widget/:id/iframe`.
4. Rotas protegidas: encapsuladas em `ProtectedRoute` → layout `AppLayout` — dashboard, CRM, chat, billing, etc.

**Evidência de rotas:** `c:\workspace_hapitech\hapitech-main\src\App.tsx` linhas 55–88 (aprox.).

### 3.2 Fluxo de autenticação

1. **Cliente:** Supabase Auth (`supabase.auth`) via `client.ts`.
2. **Sessão:** persistência em `localStorage` configurada em `createClient` (`persistSession: true`).
3. **Proteção de rotas:** `ProtectedRoute` consulta estado de sessão (hook `useAuth`).
4. **Convites / utilizadores de equipa:** Edge Functions `invite-org-member`, `accept-invite`, `create-team-user` — usam `SUPABASE_SERVICE_ROLE_KEY` e opcionalmente `SITE_URL` (default Lovable em código).

### 3.3 Fluxo Supabase (dados)

1. Frontend usa **anon key** → PostgREST aplica **RLS**.
2. Operações privilegiadas (webhooks, billing, IA com bypass RLS) → Edge Functions com **service role**.

### 3.4 Fluxo Edge Functions (genérico)

1. Pedido HTTP `POST/GET` para `https://<project>.supabase.co/functions/v1/<nome>`.
2. Headers típicos: `Authorization: Bearer <JWT utilizador>` **ou** `apikey: <anon>` conforme implementação da função.
3. Função usa `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` para ler/escrever BD.

### 3.5 Fluxo WhatsApp / Evolution

1. **Outbound/config:** UI → `wuzapi-proxy` → Evolution API (`EVO_URL` + autenticação `EVO_KEY`).
2. **Inbound:** WhatsApp → (configuração webhook na Evolution apontando para) `whatsapp-webhook` → processamento → BD / IA → envio de resposta via Evolution.

### 3.6 Fluxo APIs externas (nomeadas no código)

| Domínio | Ficheiro-base |
|---------|----------------|
| `ai.gateway.lovable.dev` | `whatsapp-webhook\index.ts`, `telegram-webhook\index.ts`, `generate-embeddings\index.ts`, `agent-chat\index.ts`, … |
| `api.openai.com` | `whatsapp-webhook\index.ts` (transcrição quando há chave OpenAI na BD) |
| `api.telegram.org` | `telegram-webhook\index.ts`, `check-inactivity\index.ts` |
| `oauth2.googleapis.com`, `www.googleapis.com/calendar` | `whatsapp-webhook\index.ts`, `google-oauth-token\index.ts`, `google-calendar\index.ts`, … |
| `api.elevenlabs.io` | `elevenlabs-tts\index.ts`, `elevenlabs-conversation-token\index.ts`, `whatsapp-webhook\index.ts` |
| `api.asaas.com` (implícito via SDK uso HTTP nas functions Asaas) | `asaas-checkout`, `asaas-invoices`, `sync-subscription` |
| `api.clinicorp.com` | `clinicorp-query\index.ts` |
| `business.solarmarket.com.br` | `solarmarket-query\index.ts`, `clinicorp-query\index.ts` |
| `r.jina.ai` | `youtube-transcript\index.ts` (leitura alternativa de página YouTube) |

### 3.7 Fluxo financeiro (Asaas)

1. Checkout / faturas / sync: functions `asaas-checkout`, `asaas-invoices`, `sync-subscription` — requerem `ASAAS_API_KEY`.
2. Webhook: `asaas-webhook` — eventos `PAYMENT_*`, `SUBSCRIPTION_*`; atualiza `asaas_subscriptions` e relação com `plans`.

### 3.8 Fluxo IA

1. **Lista de modelos / proxy de chat:** `ai-models-proxy` — contacta APIs OpenAI, Anthropic, Google, etc., com chaves lidas da BD (providers).
2. **Embeddings:** `generate-embeddings` → Lovable gateway com `LOVABLE_API_KEY`.
3. **Agentes WhatsApp/Telegram:** orquestram modelos via gateway + histórico na BD.

### 3.9 Fluxo OAuth Google

- Troca de tokens: `google-oauth-token\index.ts`, `gmail-oauth-token\index.ts` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- Calendário: `google-calendar`, `calendar-availability`, `calendar-create-event`.

### 3.10 Fluxo Webhooks

| Função | Origem típica |
|--------|----------------|
| `whatsapp-webhook` | Evolution / WhatsApp |
| `telegram-webhook` | Telegram setWebhook |
| `asaas-webhook` | Painel Asaas (URL pública HTTPS) |
| `widget-chat` | sites externos (widget embutido) |

---

## 4. Tecnologias (inventário)

### 4.1 Frontend (package.json)

| Tecnologia | Finalidade | Criticidade | Onde |
|------------|------------|-------------|------|
| React 18 | UI | Alta | `src/**` |
| Vite 5 | Bundler / dev server | Alta | `vite.config.ts` |
| TypeScript | Tipagem | Alta | Todo `src` |
| Tailwind + tailwindcss-animate | Estilos | Alta | `tailwind.config.ts`, componentes |
| Radix UI (@radix-ui/*) | Primitivos acessíveis | Alta | `src/components/ui/*` |
| @tanstack/react-query | Cache/fetch servidor | Alta | `App.tsx`, hooks |
| react-router-dom v6 | Rotas | Alta | `App.tsx` |
| @supabase/supabase-js | Cliente backend-as-a-service | **Crítica** | `integrations/supabase`, páginas |
| react-hook-form + zod | Formulários | Média | várias páginas |
| recharts | Gráficos | Média | relatórios |
| framer-motion | Animações | Baixa–média | UI |
| @elevenlabs/react | Voz / agente | Média** | componentes voz |
| cmdk, emoji-mart, etc. | UX | Baixa | UI |

** depende de funcionalidades ativadas.

### 4.2 Backend serverless

| Tecnologia | Finalidade | Onde |
|------------|------------|------|
| Deno (runtime Supabase Functions) | Execução Edge | `supabase/functions/**/*.ts` |
| Imports `deno.land`, `esm.sh` | Stdlib / supabase-js no Deno | cada `index.ts` |

### 4.3 Base de dados / plataforma

| Tecnologia | Finalidade |
|------------|------------|
| PostgreSQL (Supabase) | Persistência |
| pgvector (`vector`) | Embeddings | migrações referem extensão |
| Supabase Auth | Identidade |
| Supabase Storage | Ficheiros |

---

## 5. Serviços externos (catálogo)

Para cada serviço: finalidade, criticidade, riscos.

| Serviço | Finalidade | Criticidade | Risco operacional | Risco segurança | Dependência infra antiga |
|---------|------------|-------------|-------------------|-----------------|--------------------------|
| Supabase | DB, Auth, Storage, Functions | **Crítica** | Indisponibilidade plataforma | Keys mal geridas | Nenhuma se novo projeto |
| Evolution API | WhatsApp Business | **Crítica** para canal WA | Instância fora, SSL, rate limits | API key global | URL/chave antigas hardcoded como fallback |
| Lovable AI Gateway | Chat completions, embeddings | **Alta** onde usado | Vendor lock-in / quota | Key `LOVABLE_API_KEY` em secrets | Conta Lovable |
| OpenAI API | STT direto, modelos OpenAI | Alta quando modelo OpenAI | Custos, quota | Chaves na BD (por org) | Não |
| Google Cloud OAuth | Gmail/calendar | Média–Alta | Mudança de redirect URIs | Client secret | Console Google projeto antigo |
| Telegram | Bot | Média | Bot token na BD | Webhook URL pública | Bot pode estar ligado a URL antiga |
| ElevenLabs | TTS / conv AI | Média | Quota | `ELEVENLABS_API_KEY` | Conta ElevenLabs |
| Asaas | Pagamentos BR | **Alta** para billing | Webhook URL, chave API | `ASAAS_API_KEY` | Conta Asaas / URLs webhook |
| Clinicorp | API dentário | Baixa–média (feature) | API externa | Tokens por clínica | Conta Clinicorp |
| Solar Market | API energia solar | Baixa–média | API externa | Bearer tokens | Conta SM |
| Jina (`r.jina.ai`) | Scraping YouTube | Baixa | Serviço terceiro | — | Não |
| YouTube | Conteúdo | Baixa | ToS | — | Não |

---

## 6. Infraestrutura no repositório

### 6.1 Como a aplicação “sobe”

1. `npm install`
2. `npm run build` → `vite build` → saída `dist/`
3. `npm run start` → `serve dist -s -l 3000` (servidor estático)

**Evidência:** `c:\workspace_hapitech\hapitech-main\package.json` scripts; `c:\workspace_hapitech\hapitech-main\nixpacks.toml`.

### 6.2 Portas

| Serviço | Porta | Evidência |
|---------|-------|-----------|
| Produção (serve) | **3000** | `package.json` `"start": "serve dist -s -l 3000"` |
| Dev Vite | **8080** | `vite.config.ts` `server.port` |

### 6.3 CI/CD

- **GitHub Actions:** apenas validação e artefacto `dist` — **não** define Kubernetes, Docker, nem deploy Coolify.

### 6.4 Proxy reverso / Nginx / Coolify

- **Não versionados.** Em produção espera-se TLS no edge (Traefik, Caddy, Nginx, Cloudflare) e proxy para o processo Node `serve` ou CDN estático.

### 6.5 Variáveis de ambiente — frontend (build-time)

Prefixo `VITE_*` — embutidas no bundle.

| Variável | Uso |
|----------|-----|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon (pública no browser) |
| `VITE_GOOGLE_CLIENT_ID` | OAuth Google no cliente (opcional em `.env` exemplo) |

**Evidência:** `src\integrations\supabase\client.ts`; grep em `src\` por `import.meta.env.VITE_`.

### 6.6 Secrets — Edge Functions (agregado único)

Variáveis referenciadas via `Deno.env.get(...)` no código:

- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `LOVABLE_API_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `EVO_URL`, `EVO_KEY`
- `ASAAS_API_KEY`
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`
- `SITE_URL`
- `RECOVERY_WEBHOOK_URL`

(Conjunto derivado de grep em `supabase\functions`.)

---

## 7. Supabase — reconstrução

### 7.1 Migrações

- **Contagem:** 91 ficheiros `.sql` em `c:\workspace_hapitech\hapitech-main\supabase\migrations\`.
- **Ordem:** prefixo temporal `YYYYMMDDHHMMSS_*` — inclui narrativa interna (ex.: `create_hapitech_core_schema_v2` seguido de `rollback_*` e `restore_*`); **deve** ser aplicada sequencialmente como histórico, não cherry-pick manual salvo análise de dependências.

### 7.2 Storage (buckets referenciados em migrações)

Evidências de `INSERT INTO storage.buckets`:

- `chat-media` (público leitura em parte)
- `knowledge`
- Outros em migrações `20260217172951_*`, `20260217202003_*`, `20260228164928_*`, `20260228165001_*`, `20260228173143_*`

### 7.3 RLS / policies

- Centenas de políticas ao longo das migrações; padrão multi-tenant por organização em tabelas principais.

### 7.4 Edge Functions

- **31** funções com `index.ts`.
- Deploy: Supabase CLI `supabase functions deploy` por função ou conjunto, após `supabase link` ao novo `project_ref`.
- **JWT:** `supabase\config.toml` define explicitamente `verify_jwt = false` apenas para os nomes listados nesse ficheiro (linhas 3–85). Pastas presentes em `supabase\functions\` mas **absentes** do `config.toml` — por exemplo `admin-change-password`, `asaas-invoices`, `verify-recovery-code` — podem usar o **comportamento por defeito** da plataforma (tipicamente verificação JWT ativa). **Validar no dashboard Supabase** após deploy ou adicionar blocos `[functions.<nome>]` por consistência.

Evidência de lista explícita: `c:\workspace_hapitech\hapitech-main\supabase\config.toml`.

### 7.5 Auth / JWT

- JWT de utilizador emitido por Supabase Auth; Edge Functions podem validar manualmente o header `Authorization`.

---

## 8. Evolution API — reconstrução

1. **Nova instância Evolution** (Docker dedicado ou serviço gerido), domínio próprio, TLS.
2. Gerar **nova API key**; **nunca** reutilizar literais do código-fonte.
3. Configurar **webhook** na Evolution para `https://<novo-projeto>.supabase.co/functions/v1/whatsapp-webhook` (confirmar método/autenticação esperados no início de `whatsapp-webhook\index.ts`).
4. Definir secrets no Supabase: `EVO_URL`, `EVO_KEY`.
5. **Remover ou neutralizar** defaults em `wuzapi-proxy\index.ts` e `whatsapp-webhook\index.ts` (linhas com `DEFAULT_EVO_URL` / `DEFAULT_EVO_KEY`) numa alteração de código futura — hoje são **risco de segurança e continuidade**.

---

## 9. Segurança (achados)

| Achado | Severidade | Evidência |
|--------|------------|-----------|
| URL e API key Evolution como fallback no repositório | **Crítica** | `supabase\functions\whatsapp-webhook\index.ts` linhas 8–10; `wuzapi-proxy\index.ts` linhas 40–41 |
| `verify_jwt = false` para todas as Edge Functions nomeadas | **Alta** | `supabase\config.toml` |
| CORS `Access-Control-Allow-Origin: *` em várias functions | Média | cabeçalhos em `index.ts` das functions |
| Chaves de API de terceiros em BD (providers) | Média (gestão de segredos) | modelo de negócio — exige políticas RLS corretas |
| Anon key no bundle frontend | Inerente | mitigado por RLS |

---

## 10. Dependências críticas

1. Projeto Supabase ativo com migrações aplicadas.
2. Secrets das Edge Functions configurados.
3. Evolution operacional se WhatsApp for necessário.
4. `LOVABLE_API_KEY` (ou substituição arquitetural) para funcionalidades que usam gateway.
5. Asaas + webhook HTTPS público para billing.
6. OAuth Google com redirect URIs alinhados ao **novo** domínio da app.

---

## 11. Riscos operacionais

- Perda de **histórico de utilizadores** se não migrar schema `auth` e dados.
- Perda de **ficheiros Storage** se não copiar buckets.
- Webhooks externos (Asaas, Telegram, Evolution) continuam a apontar para URLs antigas até reconfiguração.
- **PG cron / jobs:** investigar migrações para `cron.schedule` ou triggers (não inventariado linha-a-linha neste doc — recomenda-se grep `cron` nas migrações).

---

## 12. Riscos de continuidade de negócio

- Lock-in em **Lovable gateway** para vários fluxos de IA.
- Dependência de **Evolution** para WhatsApp (instância própria tem custo operacional).
- **Asaas** como backbone de subscrição — mudança de conta implica reconfiguração de webhooks e IDs.

---

## 13. Pontos críticos da migração

1. Aplicar **todas** as 91 migrações em ordem no novo projeto.
2. Deploy de **todas** as Edge Functions e secrets.
3. Atualizar **frontend** `VITE_*` e rebuild.
4. Reconfigurar **todos** os webhooks externos.
5. Rotacionar credenciais que estiveram em código ou repositório partilhado.
6. Definir `SITE_URL` para o domínio final (convites/recuperação).

---

## 14. O que obrigatoriamente deve ser recriado

- Projeto Supabase (novo).
- Instância Evolution (se WhatsApp).
- DNS + TLS + reverse proxy para frontend.
- Secrets em Supabase Functions.
- Contas desenvolvedor: Google OAuth, Asaas, ElevenLabs, Lovable (ou substitutos), Telegram bot.

---

## 15. O que pode ser reutilizado

- Código-fonte deste ZIP (com auditoria de secrets).
- Migrações SQL e pasta `supabase/functions`.
- Pipeline CI como qualidade de código (opcional).

---

## 16. Checklist técnico inicial

- [ ] Criar organização/projeto Supabase novo.
- [ ] `supabase link` + `supabase db push` (ou pipeline SQL supervisionado).
- [ ] Verificar tabelas em `public` e buckets em Storage.
- [ ] `supabase secrets set` para todas as variáveis listadas na secção 6.6.
- [ ] Deploy das 31 Edge Functions.
- [ ] Configurar Auth redirect URLs para novo domínio.
- [ ] Build frontend com novos `VITE_SUPABASE_*`.
- [ ] Subir hosting (Coolify ou outro) com porta 3000 ou CDN estático.
- [ ] Evolution nova instância + webhook + teste de mensagem.
- [ ] Asaas webhook + pagamento teste sandbox.
- [ ] Remover literais sensíveis do código e rodar nova imagem build.

---

## Referências de ficheiros principais

| Caminho | Conteúdo |
|---------|----------|
| `c:\workspace_hapitech\hapitech-main\package.json` | Scripts e dependências npm |
| `c:\workspace_hapitech\hapitech-main\vite.config.ts` | Config Vite / porta dev |
| `c:\workspace_hapitech\hapitech-main\nixpacks.toml` | Build Nixpacks |
| `c:\workspace_hapitech\hapitech-main\.github\workflows\ci.yml` | CI |
| `c:\workspace_hapitech\hapitech-main\src\App.tsx` | Rotas e providers |
| `c:\workspace_hapitech\hapitech-main\src\integrations\supabase\client.ts` | Cliente Supabase |
| `c:\workspace_hapitech\hapitech-main\supabase\config.toml` | project_id legado + JWT functions |
| `c:\workspace_hapitech\hapitech-main\supabase\migrations\` | 91 migrações SQL |
| `c:\workspace_hapitech\hapitech-main\supabase\functions\` | Edge Functions Deno |

---

*Documento gerado por engenharia reversa do código no workspace; comportamento em runtime (ex.: valores exatos em produção) pode diferir se houver alterações não incluídas no ZIP.*

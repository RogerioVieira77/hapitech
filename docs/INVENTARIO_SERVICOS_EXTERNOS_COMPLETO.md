# Inventário completo — serviços externos, APIs, webhooks e dependências

**Raiz do projeto:** `c:\workspace_hapitech\hapitech-main`  
**Escopo:** URLs, hosts, integrações e credenciais referenciadas no código-fonte (`.ts`, `.tsx`, migrações `.sql` relevantes).

**Legenda de classificação de risco (uso neste documento):**

| Classe | Significado |
|--------|-------------|
| **CRÍTICO** | Sem isto a app ou canal principal deixa de funcionar em produção |
| **ALTO** | Grande parte das funcionalidades afetada ou segurança grave |
| **MÉDIO** | Funcionalidades específicas ou impacto parcial |
| **BAIXO** | Auxiliar, fallback ou apenas UX/documentação |

Para cada serviço principal, segue o quadro com os **26 campos** solicitados (quando não aplicável: "—").

---

## 1. Resumo executivo

O projeto depende de **Supabase** (PostgreSQL, Auth, Storage, Realtime, Edge Functions) como backbone. **Fora** da plataforma, há **dezenas de endpoints HTTPS** para: **Evolution API** (WhatsApp/Baileys indireto), **Lovable AI Gateway**, **OpenAI**, **Anthropic**, **Google** (OAuth, Gmail, Calendar, Gemini API compat), **Groq**, **Mistral**, **DeepSeek**, **ElevenLabs**, **Telegram**, **Asaas**, **Clinicorp**, **Solar Market**, **YouTube**, **Jina Reader**, **ViaCEP**, **api.qrserver.com** (migração corp). **Não** há Stripe, Mercado Pago, PayPal, Resend, SendGrid ou Mailgun no código. **SMTP** é genérico (servidor configurável na BD). **Coolify, Cloudflare, DNS** não aparecem como SDK — são implícitos na infra escolhida. **URLs antigas** (`*.lovable.app`, `evo-api.meuvendedoronline.com.br`, `noreply@meuvendedoronline.com`) e **segredo Evolution em texto plano** no repositório são **ALTO/CRÍTICO** para segurança e migração.

---

## 2. Inventário completo de serviços externos (por serviço)

### 2.1 Supabase (projeto cloud)

| # | Campo | Conteúdo |
|---|--------|----------|
| 1 | Nome | Supabase (hosted) |
| 2 | Finalidade | PostgreSQL, Auth, Storage, Realtime, Edge Functions |
| 3 | Criticidade | **CRÍTICO** |
| 4 | Onde | Todo `src/` via `@supabase/supabase-js`; `supabase/functions/**` |
| 5 | Ficheiros | `src\integrations\supabase\client.ts`; todas as Edge Functions |
| 6 | Como autentica | Front: anon JWT + RLS; Functions: `SUPABASE_SERVICE_ROLE_KEY` |
| 7 | Credencial | `anon` (pública no bundle), `service_role` (segredo servidor), DB password (CLI) |
| 8 | ENV | Front: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| 9 | Dependências | Rede HTTPS egress; projeto Supabase ativo |
| 10 | Fluxo | Browser → `*.supabase.co` REST/Auth/Realtime → Postgres |
| 11 | Impacto se falhar | Indisponibilidade total da aplicação |
| 12 | Impacto se perder acesso | Perda de dados/controlo — precisa backup legal |
| 13 | Ambiente antigo | Sim se mantiver mesmo `project_ref` |
| 14 | Domínio antigo | Indireto (redirect OAuth configurado no dashboard) |
| 15 | Servidor antigo | Não (hosted) |
| 16 | Supabase antigo | Sim se não migrar projeto |
| 17 | WhatsApp antigo | Não direto |
| 18 | DNS antigo | Indireto (Site URL / redirects) |
| 19 | Risco operacional | **CRÍTICO** — quota, incidentes plataforma |
| 20 | Risco segurança | Expor `service_role`; RLS mal configurado |
| 21 | Risco LGPD | Dados pessoais na BD — tratamento e sub-processador Supabase |
| 22 | Risco financeiro | Plano Supabase + egress |
| 23 | Rotação tokens | Sim service_role se vazar; anon menos crítica |
| 24 | Recriação completa | Novo projeto Supabase possível com migrações |
| 25 | Reutilizar | Sim (novo projeto) ou não (greenfield) |
| 26 | Complexidade migração | Alta — migrações + functions + secrets + Auth URLs |

**Realtime — evidência:** `src\hooks\useChat.ts` (canais `conversations-realtime-org`, `messages-${id}`); `useNotifications.ts`; `NotificationListener.tsx`.

---

### 2.2 PostgreSQL (dentro do Supabase)

| # | Campo | Conteúdo |
|---|--------|----------|
| 1 | Nome | PostgreSQL |
| 2 | Finalidade | Dados relacionais, RLS, funções SQL, pgvector |
| 3 | Criticidade | **CRÍTICO** |
| 4 | Onde | Migrações `supabase\migrations\` |
| 5 | Ficheiros | Ex.: `20260218013937_7678234d-2be6-44b3-9613-009110e39238.sql` (`CREATE EXTENSION vector`; índice IVFFlat) |
| 6–7 | Auth | Via Supabase connection pooling / role `postgres` no dashboard |
| 8 | ENV | Implícito no Supabase; não no front |
| 19 | Classificação risco | **CRÍTICO** |

---

### 2.3 Supabase Storage

| # | Campo | Conteúdo |
|---|--------|----------|
| 2 | Finalidade | Ficheiros (ex.: media chat, knowledge) |
| 3 | Criticidade | **ALTO** para features de ficheiros |
| 5 | Ficheiros | Migrações com `INSERT INTO storage.buckets` — ex. `20260217172951_*`, `20260217135526_*` (`knowledge`), `20260228173143_*` (`chat-media`) |
| 21 | LGPD | Conteúdo de conversas/ficheiros pode ser dados pessoais |

---

### 2.4 Evolution API + WhatsApp (Baileys como motor típico)

| # | Campo | Conteúdo |
|---|--------|----------|
| 1 | Nome | Evolution API (HTTP) |
| 2 | Finalidade | Instâncias WhatsApp, QR, webhooks receção mensagens |
| 3 | Criticidade | **CRÍTICO** para canal WhatsApp |
| 4 | Onde | `wuzapi-proxy`, `whatsapp-webhook`; UI `useEvolutionApi.ts`, `useWhatsAppConnectionMonitor.ts`, `Chat.tsx` |
| 5 | Ficheiros | `supabase\functions\wuzapi-proxy\index.ts`; `supabase\functions\whatsapp-webhook\index.ts`; `src\hooks\useEvolutionApi.ts` |
| 6 | Como autentica | Header/API key Evolution (`EVO_KEY`) |
| 7 | Credencial | `EVO_KEY` + URL base `EVO_URL` |
| 8 | ENV | `EVO_URL`, `EVO_KEY` |
| 9 | Dependências | Instância Evolution acessível das Edge Functions (egress Supabase) |
| 10 | Fluxo | Front → `wuzapi-proxy` → Evolution `/instance`, `/webhook/*`; Evolution → POST `whatsapp-webhook` |
| 11 | Impacto se falhar | WhatsApp para de enviar/receber |
| 12 | Perda acesso | Reinstância + novo pareamento QR |
| 13–18 | Ambiente/domínio antigo | **Fallback URL fixa** `https://evo-api.meuvendedoronline.com.br` em `whatsapp-webhook\index.ts` L9 e `wuzapi-proxy\index.ts` L40 — dependência explícita de infra antiga se secrets não forem definidos |
| 19 | Risco operacional | **ALTO** |
| 20 | Risco segurança | **CRÍTICO** — literal de API key no código `wuzapi-proxy\index.ts` L41 e `whatsapp-webhook` (DEFAULT_EVO_KEY próximo às linhas 9–10); **rotacionar e remover** |
| 21 | LGPD | Mensagens WhatsApp = dados pessoais |
| 22 | Financeiro | Custo VM/serviço Evolution |
| 23 | Rotação | **Sim**, obrigatória após exposição |
| 24 | Recriação | Nova VM Evolution + novos webhooks apontando para novo `SUPABASE_URL` |
| 25 | Reutilizar | Não recomendado — novo deployment |
| 26 | Migração | Alta — QR, sessões, webhook URL |

**Baileys:** não import direto no repo Node; string `WHATSAPP-BAILEYS` como tipo de integração ao criar instância — `wuzapi-proxy\index.ts` L172, L289.

**Meta Cloud API:** não há Graph API Facebook/WhatsApp Business Cloud explícita no código pesquisado.

**Webhooks WhatsApp — evidência dinâmica (não hardcoded host Supabase):** URL construída como `` `${supabaseUrl}/functions/v1/whatsapp-webhook` `` — `wuzapi-proxy\index.ts` L219–246, L309–324, L369–384, L474–481.

---

### 2.5 Lovable AI Gateway (`ai.gateway.lovable.dev`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 1 | Nome | Lovable AI Gateway |
| 2 | Finalidade | Chat completions, embeddings, transcrições (substituto OpenAI-compat) |
| 3 | Criticidade | **CRÍTICO** onde não há provider próprio na tabela `ai_providers` |
| 5 | Ficheiros | `agent-chat\index.ts` L121, L402, L487; `generate-embeddings\index.ts` L32; `telegram-webhook`, `whatsapp-webhook`, `clinicorp-query`, etc. |
| 7 | Credencial | `LOVABLE_API_KEY` (Bearer) |
| 8 | ENV | `LOVABLE_API_KEY` |
| 20 | Lock-in | **Alto** — vendor específico |
| 23 | Rotação | Sim |

---

### 2.6 OpenAI (`api.openai.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 2 | Finalidade | Modelos, `/v1/models`, transcrições áudio (`/v1/audio/transcriptions`), chat via baseURL |
| 5 | Ficheiros | `whatsapp-webhook\index.ts` L96; `ai-models-proxy\index.ts` L90, L175; `widget-chat\index.ts` L130, L155 |
| 7 | Credencial | Chave em `ai_providers.api_key` na BD ou fallback env |
| 19 | Classificação | **ALTO** quando modelo OpenAI escolhido |

---

### 2.7 Anthropic (`api.anthropic.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `widget-chat\index.ts` L133; `ai-models-proxy\index.ts` L181–184 |
| 7 | `x-api-key` + `anthropic-version` | Validação em `validateKey` |

---

### 2.8 Google — OAuth2, UserInfo, Calendar, Gemini compat

| # | Campo | Conteúdo |
|---|--------|----------|
| 2 | Finalidade | Tokens OAuth; lista calendários; eventos; userinfo; Gemini via endpoint OpenAI-compat |
| 5 | Ficheiros | `oauth2.googleapis.com/token` — `google-oauth-token\index.ts` L49; `gmail-oauth-token\index.ts` L29; `google-calendar\index.ts`; `calendar-availability\index.ts` L68; `calendar-create-event\index.ts` L106; `whatsapp-webhook\index.ts` L566, L672, L808; `widget-chat\index.ts` L135 (`generativelanguage.googleapis.com/v1beta/openai`) |
| 7 | Credencial | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` env; refresh tokens na BD para Gmail |
| 8 | ENV | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; opcional front `VITE_GOOGLE_CLIENT_ID` |
| 14 | Domínio antigo | Redirect URIs devem coincidir com domínio registado no Google Cloud Console |
| 23 | Rotação | Secrets Google OAuth se comprometidos |

---

### 2.9 Gmail API (`gmail.googleapis.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `send-recovery-email\index.ts` L48 (`.../messages/send`) |
| 10 | Fluxo | Refresh token → access token → envio MIME |

---

### 2.10 Groq (`api.groq.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `ai-models-proxy\index.ts` L156, L187 |

---

### 2.11 Mistral (`api.mistral.ai`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `ai-models-proxy\index.ts` L193; `widget-chat\index.ts` L139 |

---

### 2.12 DeepSeek (`api.deepseek.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `widget-chat\index.ts` L137 |

---

### 2.13 ElevenLabs (`api.elevenlabs.io`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `elevenlabs-tts\index.ts` L69, L131; `elevenlabs-conversation-token\index.ts` L57; `whatsapp-webhook\index.ts` L1127 |
| 8 | ENV | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` |
| 3 | Criticidade | **MÉDIO**–**ALTO** para voz |

---

### 2.14 Telegram Bot API (`api.telegram.org`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `telegram-webhook\index.ts` (múltiplos `fetch` L540+); `check-inactivity\index.ts` L34; `src\hooks\useTelegramConnections.ts`, `useTelegramConnectionMonitor.ts` |
| 7 | Credencial | `bot_token` armazenado na BD (`telegram_connections`) |
| 10 | Fluxo | `setWebhook` para URL pública das functions |

---

### 2.15 Asaas (`api.asaas.com` / sandbox)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `asaas-checkout\index.ts` L11–12; `asaas-invoices`; `sync-subscription`; `asaas-webhook` |
| 8 | ENV | `ASAAS_API_KEY` |
| 3 | Criticidade | **CRÍTICO** para billing/subscrições |
| 14 | Webhook URL | Deve apontar para novo domínio/project |

**Stripe / Mercado Pago / PayPal:** **ausência** confirmada por grep global — não são dependências deste repositório.

---

### 2.16 Clinicorp (`api.clinicorp.com`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `clinicorp-query\index.ts` L10 |
| 7 | Bearer por clínica (BD) |

---

### 2.17 Solar Market (`business.solarmarket.com.br`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `solarmarket-query\index.ts` L10; `clinicorp-query\index.ts` L13 |

---

### 2.18 YouTube + Jina Reader

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `youtube-transcript\index.ts` — `www.youtube.com` L24; `r.jina.ai` L100 |

---

### 2.19 ViaCEP (`viacep.com.br`)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `src\components\BillingDataForm.tsx` L114 |
| 3 | Criticidade | **BAIXO** — auxiliar endereço |

---

### 2.20 api.qrserver.com (QR Code HTTP)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `supabase\migrations\20260301220700_restore_corp_tables.sql` L275 |
| 3 | Criticidade | **BAIXO** / legado corp |

---

### 2.21 SMTP genérico (não Resend/SendGrid)

| # | Campo | Conteúdo |
|---|--------|----------|
| 2 | Finalidade | Envio e-mail recuperação quando Gmail não usado |
| 5 | Ficheiros | `send-recovery-email\index.ts` L241–269 (SMTP); `src\components\SmtpSettingsTab.tsx`; tabela `smtp_settings` |
| 7 | Host/port/user/password na BD | — |
| 25 | Reutilizar | Sim — qualquer servidor SMTP |

---

### 2.22 Webhooks definidos pelo utilizador (regras)

| # | Campo | Conteúdo |
|---|--------|----------|
| 2 | Finalidade | Disparar HTTP para URLs configuradas em `webhook_rules` |
| 5 | Ficheiros | `whatsapp-webhook\index.ts` L1168–1185 (`rule.url`) |
| 20 | Segurança | SSRF potencial se URLs não validadas — rever política |

---

### 2.23 RECOVERY_WEBHOOK_URL

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `send-recovery-email\index.ts` L142 |
| 10 | Fluxo | Opcional — notificação externa ao pedir recuperação |

---

### 2.24 CDN / imports Deno (runtime Edge)

| Serviço | URL | Finalidade |
|---------|-----|------------|
| deno.land/std | `https://deno.land/std@0.168.0/http/server.ts` (maioria); **0.190.0** em `accept-invite\index.ts` | Servidor HTTP Edge |
| esm.sh | `https://esm.sh/@supabase/supabase-js@2`, `unpdf` em `extract-pdf\index.ts` L13 | Bundling módulos Deno |

**Risco operacional:** **MÉDIO** — dependência de disponibilidade esm.sh/deno.land no deploy/build da function.

---

### 2.25 GitHub (CI)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `.github\workflows\ci.yml` |
| 2 | Finalidade | Lint, test, build artefacto |
| 3 | Criticidade | **BAIXO** para runtime produção (não bloqueia app em si) |

---

### 2.26 Docker Hub (implícito)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `Dockerfile` L2 `FROM node:22-alpine` |
| 26 | Migração | Usar mirror/registry próprio se política exigir |

---

### 2.27 MCP / integrações documentadas (links apenas na UI)

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | `src\components\McpIntegrations.tsx` — placeholders Canva, Shopify, Zapier, n8n, Notion, Vapi |
| 3 | Criticidade | **BAIXO** — URLs de exemplo até utilizador configurar |

---

### 2.28 Coolify / Cloudflare / DNS / SSL

| # | Campo | Conteúdo |
|---|--------|----------|
| 5 | Ficheiros | **Nenhum** no código-fonte |
| Nota | Implícitos na infra de deploy; TLS obrigatório para OAuth e webhooks |

---

## 3. Serviços críticos (lista curta)

1. Supabase (Auth, DB, Storage, Realtime, Functions) — **CRÍTICO**  
2. Evolution API (se WhatsApp requerido) — **CRÍTICO**  
3. Asaas (se billing ativo) — **CRÍTICO**  
4. Lovable Gateway OU chaves nos `ai_providers` — **CRÍTICO** para IA integrada  
5. Google OAuth (Gmail/Calendar/recuperação conforme features) — **ALTO**  

---

## 4. Dependências críticas

- Projeto Supabase + migrações aplicadas  
- Secrets Edge Functions completos  
- Evolution + webhook HTTPS público  
- Asaas webhook + API key  
- `LOVABLE_API_KEY` ou preenchimento de `ai_providers`  

---

## 5. Dependências ocultas

- **esm.sh** / **deno.land** para resolver imports das Functions  
- **Webhook URL** derivada de `SUPABASE_URL` (dinâmica mas acoplada ao projeto)  
- **Integration string Baileys** dentro Evolution — não é pacote npm separado  
- **ViaCEP**, **qrserver**, **Jina** como dependências não óbvias  

---

## 6. Serviços ligados ao ambiente antigo (evidência em código)

| Evidência | Ficheiro:linha |
|-----------|----------------|
| `https://evo-api.meuvendedoronline.com.br` | `whatsapp-webhook\index.ts` ~L9; `wuzapi-proxy\index.ts` ~L40 |
| API key Evolution em literal | `wuzapi-proxy\index.ts` **L41**; `whatsapp-webhook` DEFAULT_EVO_KEY ~L10 |
| `https://bot-mastermind-suite.lovable.app` | `invite-org-member\index.ts` ~L74; `create-team-user\index.ts` ~L123 |
| `https://conversational-iq-suite.lovable.app` | `send-recovery-email\index.ts` ~L92 |
| `noreply@meuvendedoronline.com` | `send-recovery-email\index.ts` ~L164 |

---

## 7. Serviços que exigem recriação

- Novo projeto Supabase (se cutover completo)  
- Nova instância Evolution + sessões WhatsApp  
- Webhooks Asaas/Telegram apontados para novas URLs  
- Opcional: contas em Clinicorp/Solar Market/ElevenLabs/OpenAI conforme uso  

---

## 8. Serviços que exigem rotação de tokens

| Serviço | Motivo |
|---------|--------|
| Evolution | Segredo exposto no código + novo deployment |
| Supabase service_role | Se vazado |
| ASAAS_API_KEY | Segredo financeiro |
| GOOGLE_* OAuth | Se projeto Google novo ou comprometido |
| LOVABLE_API_KEY | Segredo IA |
| ELEVENLABS_* | Segredo |
| Tokens Telegram / Solar / Clinicorp na BD | Migração ou leak |

---

## 9. Serviços que exigem migração (config)

- Redirect URIs Google  
- Webhook Asaas  
- Webhook Telegram (`setWebhook`)  
- Evolution webhooks (`wuzapi-proxy` define URL Supabase)  
- `SITE_URL` env  

---

## 10. Serviços com risco segurança (destaque)

| Item | Classificação |
|------|---------------|
| Literais Evolution URL/key | **CRÍTICO** |
| `verify_jwt = false` em muitas functions (`supabase\config.toml`) | **ALTO** |
| CORS `*` em várias functions | **MÉDIO**–**ALTO** |
| Webhooks outbound para URLs em `webhook_rules` | **MÉDIO** (SSRF) |

---

## 11. Serviços com risco operacional

- Indisponibilidade Lovable Gateway  
- Quotas OpenAI/ElevenLabs/Telegram  
- Asaas indisponível → billing  
- Evolution instável → WhatsApp  

---

## 12. Serviços com risco LGPD

- Supabase (todos dados clientes/conversas)  
- WhatsApp/Telegram (conteúdo mensagens)  
- Gmail API (e-mails)  
- Solar Market / Clinicorp (dados negócio cliente)  
- Webhooks personalizados (dados enviados a terceiros)  

---

## 13. Serviços com risco financeiro

- Asaas (cobranças)  
- OpenAI / Lovable / ElevenLabs / Groq (consumo API)  
- Supabase plan  
- Infra Evolution (VM)  

---

## 14. Checklist técnico de migração

- [ ] Novo `SUPABASE_URL` e keys no front (rebuild)  
- [ ] `supabase secrets set` todos (`EVO_*`, `LOVABLE_*`, `ASAAS_*`, `GOOGLE_*`, …)  
- [ ] Deploy todas Edge Functions  
- [ ] Configurar Evolution webhooks para `/functions/v1/whatsapp-webhook`  
- [ ] Asaas: nova URL webhook HTTPS  
- [ ] Telegram: `setWebhook` nova URL  
- [ ] Google Cloud: authorized redirect URIs  
- [ ] Definir `SITE_URL` para domínio final  
- [ ] Importar ou reconstruir dados Storage  
- [ ] Remover literais sensíveis do código e novo deploy  

---

## 15. Checklist de segurança

- [ ] Rotacionar `EVO_KEY` e apagar do repositório  
- [ ] Auditar exposição `service_role`  
- [ ] Rever `verify_jwt` por função no dashboard Supabase  
- [ ] Restringir CORS em produção onde possível  
- [ ] Validar URLs em `webhook_rules` contra SSRF  
- [ ] Auditar `ai_providers` na BD (chaves por organização)  

---

## 16. Checklist operacional

- [ ] Monitor quotas APIs IA  
- [ ] Alertas Asaas webhook falhos  
- [ ] Estado Evolution (sessão/desligada)  
- [ ] Logs Edge Functions Supabase  
- [ ] Plano backup Postgres + Storage  

---

## Apêndice A — Webhooks hardcoded vs dinâmicos

| Tipo | Evidência |
|------|-----------|
| URL Supabase → Evolution | Montada com `SUPABASE_URL` — `wuzapi-proxy\index.ts` L219+ |
| Domínios Lovable fallback | Strings fixas em invite/recovery |
| Asaas | Sem URL fixa no código — configurado no painel Asaas para URL pública da function |
| Telegram | `setWebhook` com URL construída em runtime (`useTelegramConnections.ts` ~L160) |

---

## Apêndice B — APIs sem autenticação nas Edge Functions

Várias funções têm `verify_jwt = false` no `config.toml`; algumas implementam checagem manual (ex. `ai-models-proxy` verifica JWT super_admin — `ai-models-proxy\index.ts` L211–243). **Todas** devem ser revistas individualmente.

---

*Documento baseado exclusivamente em ficheiros do workspace atual; integrações configuradas apenas em runtime (dashboards externos) não aparecem aqui.*

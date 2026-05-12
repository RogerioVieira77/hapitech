# Auditoria completa — variáveis de ambiente, segredos e configurações sensíveis

**Raiz:** `c:\workspace_hapitech\hapitech-main`  
**Metodologia:** `grep` por `Deno.env.get`, `import.meta.env`, leitura de `.env`, `supabase/config.toml`, `Dockerfile`, `.github/workflows/ci.yml`.  
**Nota legal/técnica:** valores secretos (JWT, API keys) **não** são copiados integralmente neste documento — apenas localização e classificação. Revogar credenciais se este repositório foi exposto.

---

## Convenção de classificação de sensibilidade

| Nível | Descrição |
|-------|-----------|
| **Pública** | Pode estar no bundle frontend (ex.: anon Supabase) |
| **Confidencial** | Servidor apenas; vazamento prejudica operação |
| **Secreta** | Servidor apenas; vazamento compromete dados ou dinheiro |
| **Crítica** | Bypass de segurança total se exposta (ex.: `service_role`) |

---

## Inventário por variável (campos 1–22)

### Front-end — prefixo `VITE_*` (incorporadas no build)

#### `VITE_SUPABASE_URL`

| # | Campo | Valor |
|---|--------|--------|
| 1 | Nome | `VITE_SUPABASE_URL` |
| 2 | Finalidade | URL base do projeto Supabase (REST, Auth, Functions, Storage) |
| 3 | Onde | Todas as chamadas `import.meta.env.VITE_SUPABASE_URL` |
| 4 | Ficheiros | `src\integrations\supabase\client.ts` L5–6; `src\lib\media.ts` L4; `WidgetChat.tsx` L16–17; `useAiModels.ts` L23; `AgentKnowledgeSection.tsx` (múltiplas); `Teams.tsx`; `Chat.tsx`; `ElevenLabsSection.tsx`; `VoiceAgentWidget.tsx`; `Integrations.tsx`; `useGoogleCalendar.ts`; `useTelegramConnections.ts`; `useChat.ts`; `AgentEditor.tsx`; `AgentChat.tsx` L21 |
| 5 | Fluxo | Montagem de URLs `/functions/v1/*` e cliente Supabase |
| 6 | Obrigatória | **Sim** para produção |
| 7 | Opcional | Não |
| 8 | Crítica | **Sim** |
| 9 | Sensibilidade | **Pública** (URL do projeto é identificável no browser) |
| 10 | Impacto se faltar | Build falha ou runtime erro em `client.ts` |
| 11 | Impacto se exposta | Baixa por si — URL é pública |
| 12 | Comprometimento | Baixo isoladamente |
| 13–18 | Ambiente/domínio antigo | Acoplada ao **project ref** em `https://<ref>.supabase.co` |
| 19 | Rotação | Trocar ao mudar projeto Supabase |
| 20 | Recriação | Novo valor ao novo projeto |
| 21 | Reutilizar | Não entre projetos diferentes |
| 22 | Complexidade migração | Baixa — uma variável CI/CD |

#### `VITE_SUPABASE_PUBLISHABLE_KEY` (alias semântico “anon key”)

| 1 | Nome | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| 2 | Finalidade | Chave **anon** PostgREST / invoke functions com header `apikey` |
| 4 | Ficheiros | `client.ts` L6; `WidgetChat.tsx` L17; `AgentChat.tsx` L47 (fallback token); `AgentKnowledgeSection.tsx`; `VoiceAgentWidget.tsx`; `Integrations.tsx`; `useGoogleCalendar.ts`; `useTelegramConnections.ts`; `useChat.ts`; `Chat.tsx` L403, L444 |
| 9 | Sensibilidade | **Pública** por desenho Supabase — proteção via **RLS** |
| 11–12 | Exposição | Esperada no JS; abuso se RLS falhar → **CRÍTICO** |
| 19 | Rotação | Possível no dashboard Supabase (anon rotation) |

#### `VITE_SUPABASE_PROJECT_ID`

| 4 | Ficheiros | Presente em `.env` raiz — **sem referências em `src/`** (grep zero matches) |
| 6 | Obrigatória | **Não** para o código atual |
| Nota | Variável **órfã / não utilizada** pelo frontend |

#### `VITE_GOOGLE_CLIENT_ID`

| 4 | Ficheiros | `.env` linha com `VITE_GOOGLE_CLIENT_ID` (pode estar vazio `""`) |
| 4 | Uso em código | **Nenhuma** ocorrência em `src/` no grep a `VITE_GOOGLE` além de potencial uso indireto — **não** encontrado consumo `import.meta.env.VITE_GOOGLE_CLIENT_ID` nos ficheiros listados |
| 6 | Obrigatória | Opcional / legado se OAuth cliente não implementado nestes paths |
| Nota | OAuth Google no servidor usa `GOOGLE_CLIENT_ID` nas Edge Functions; este `VITE_*` pode ser preparação futura ou fluxo em ficheiro não coberto — **verificar** `SmtpSettingsTab` / OAuth manual |

---

### Edge Functions — `Deno.env` (secrets Supabase Dashboard / CLI)

#### `SUPABASE_URL`

| 2 | Finalidade | Igual ao URL do projeto (inject automático em deploy ou manual) |
| 4 | Ficheiros | Todas as functions que usam `createClient` — ex. `wuzapi-proxy\index.ts` L23; `whatsapp-webhook\index.ts` L1196; lista completa no grep do repositório |
| 9 | Sensibilidade | **Pública** como string URL — não é segredo |
| 13–15 | Supabase antigo | **Sim** se apontar para projeto legado |

#### `SUPABASE_ANON_KEY`

| 2 | Finalidade | Cliente com privilégios anon (validação JWT utilizador em proxy) |
| 4 | Ficheiros | `wuzapi-proxy\index.ts` L24; `asaas-checkout` L72; `asaas-invoices` L45; `sync-subscription` L37; `admin-change-password` L17; `send-recovery-email` L278 |
| 9 | Sensibilidade | **Confidencial** em servidor — não deve ir para logs |
| 11 | Exposição | Permite chamadas como cliente anon |

#### `SUPABASE_SERVICE_ROLE_KEY`

| 2 | Finalidade | Bypass RLS — admin DB / Auth admin |
| 4 | Ficheiros | Praticamente todas as Edge Functions (30+) |
| 9 | Sensibilidade | **Crítica** |
| 11–12 | Exposição | **Takeover total** de dados e identidades |
| 19 | Rotação | **Obrigatória** se vazamento |

#### `LOVABLE_API_KEY`

| 4 | Ficheiros | `generate-embeddings\index.ts` L61; `agent-chat\index.ts` L302; `telegram-webhook` L744, L1031; `widget-chat` L143; `whatsapp-webhook` L1659; `clinicorp-query` L524 |
| 9 | Sensibilidade | **Secreta** |
| 12 | Telegram fallback | Usa `SUPABASE_SERVICE_ROLE_KEY` como fallback de transcrição em `telegram-webhook` L1031 — **risco de design** |

#### `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

| 4 | Ficheiros | `google-oauth-token\index.ts` L17–18; `gmail-oauth-token` L34–35; `send-recovery-email` L217–218; `whatsapp-webhook` L559–560 (opcional para alguns fluxos) |
| 9 | **Secreta** (client secret) |
| 14 | Domínio antigo | Redirect URIs no Google Cloud devem coincidir com app |

#### `EVO_URL` / `EVO_KEY`

| 4 | Ficheiros | `wuzapi-proxy\index.ts` L40–41 com **fallback hardcoded**; `whatsapp-webhook` L1332–1333 (DEFAULT constants L9–10); `check-inactivity` L83–84 (sem fallback URL no código além de string vazia) |
| 9 | **Secreta** (`EVO_KEY`) |
| 13–17 | WhatsApp antigo | Fallback URL `evo-api.meuvendedoronline.com.br` **acopla infra legada** |
| **CRÍTICO** | Literais no repositório — ver secção “Secrets hardcoded” |

#### `ASAAS_API_KEY`

| 4 | Ficheiros | `asaas-checkout` L9; `asaas-invoices` L9; `sync-subscription` L9 |
| 9 | **Crítica** financeira |

#### `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID`

| 4 | Ficheiros | `elevenlabs-conversation-token\index.ts` L40, L48 |

#### `SITE_URL`

| 4 | Ficheiros | `invite-org-member\index.ts` L74; `create-team-user\index.ts` L123 — default `https://bot-mastermind-suite.lovable.app` |
| 14 | Domínio antigo | **Sim** se `SITE_URL` não definido |

#### `RECOVERY_WEBHOOK_URL`

| 4 | Ficheiros | `send-recovery-email\index.ts` L142 — opcional |

---

## Secrets e constantes hardcoded (código-fonte)

| Item | Local | Classificação risco |
|------|--------|---------------------|
| `DEFAULT_EVO_URL = "https://evo-api.meuvendedoronline.com.br"` | `supabase\functions\whatsapp-webhook\index.ts` ~L9 | **CRÍTICO** — acoplamento infra antiga |
| `DEFAULT_EVO_KEY = "<string literal>"` | `whatsapp-webhook\index.ts` ~L10 | **CRÍTICO** — token exposto em Git |
| Mesmo padrão URL + key literal | `wuzapi-proxy\index.ts` L40–41 | **CRÍTICO** |
| `siteUrl` default Lovable | `invite-org-member`, `create-team-user` ~L74, ~L123 | **ALTO** — redirects errados |
| `origin` default recuperação | `send-recovery-email\index.ts` ~L92 `conversational-iq-suite.lovable.app` | **ALTO** |
| Remetente email default | `send-recovery-email` ~L164 `noreply@meuvendedoronline.com` | **MÉDIO** |
| `project_id` legado | `supabase\config.toml` L1 `kvhtradegsostrhtzdwn` | **MÉDIO** — referência CLI/local |

---

## Arquivo `.env` local (raiz do projeto)

**Caminho:** `c:\workspace_hapitech\hapitech-main\.env`

Chaves presentes (nomes apenas): `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_GOOGLE_CLIENT_ID`.

**Risco:** ficheiro costuma ser `.gitignore`; se versionado, **rotacionar** anon key e qualquer outro segredo. **Não** commitar.

**Observação:** `VITE_SUPABASE_PUBLISHABLE_KEY` contém JWT role `anon` — tratar como público por desenho mas revogar se repo público.

---

## Ficheiros sem variáveis sensíveis embutidas

| Ficheiro | Observação |
|----------|------------|
| `Dockerfile` | Sem ENV — build não injeta `VITE_*` (requer `ARG`/`ENV` ou CI para build reprodutível) |
| `.github/workflows/ci.yml` | **Sem** secrets ou `VITE_*` — `npm run build` pode falhar sem env ou usar valores default vazios |
| `vite.config.ts` | Sem `loadEnv` explícito |
| `nixpacks.toml` | Sem lista ENV |

**Gap:** CI não define `VITE_SUPABASE_*` — build pode passar só se código tolerar undefined ou se runner tiver env global (não visível no YAML).

---

## Variáveis implícitas (não `process.env`)

| Origem | Descrição |
|--------|-----------|
| Tabela `ai_providers` | `api_key` por provider OpenAI/Anthropic/etc. |
| Tabela `smtp_settings` | Host, port, user, password, Gmail refresh |
| Tabela `telegram_connections` | `bot_token` |
| Tabela `google_calendar_connections` / OAuth tokens | Refresh/access conforme migrações |
| `webhook_rules` em agentes | URLs arbitrárias — não são ENV |

---

## Duplicação e consistência

- `SUPABASE_URL` repetido em dezenas de functions — **mesmo nome**, correto.
- `telegram-webhook` L1031: fallback `LOVABLE_API_KEY` → `SUPABASE_SERVICE_ROLE_KEY` — **duplicação semântica perigosa** para áudio.

---

## Variáveis faltando / não documentadas no repo

- **`.env.example`** — **ausente** (glob zero ficheiros).
- **Secrets Docker** — não usados.
- Documentação centralizada de todas as keys Supabase — apenas este audit.

---

## Classificação global de risco (serviço/segredo)

| Item | Nível |
|------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | **CRÍTICO** |
| `EVO_KEY` literal no código | **CRÍTICO** |
| `ASAAS_API_KEY` | **CRÍTICO** |
| `GOOGLE_CLIENT_SECRET` | **ALTO** |
| `LOVABLE_API_KEY` | **ALTO** |
| `SUPABASE_ANON_KEY` em Edge | **ALTO** (contexto servidor) |
| `VITE_*` anon no bundle | **MÉDIO** (esperado) |
| URLs default `lovable.app` | **ALTO** operacional |

---

## Checklists (resumo — espelham pedido seções 17–19)

### Migração técnica

- [ ] Definir todas `Deno.env` no projeto Supabase novo  
- [ ] Rebuild frontend com novos `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`  
- [ ] Atualizar `supabase/config.toml` `project_id`  
- [ ] Remover literais Evolution do código e redeploy  
- [ ] Definir `SITE_URL` produção  
- [ ] Configurar `RECOVERY_WEBHOOK_URL` se usado  
- [ ] CI: injetar `VITE_*` como secrets GitHub Actions se build na pipeline  

### Segurança

- [ ] Rotacionar `service_role` se exposto  
- [ ] Rotacionar Evolution key e URL de fallback  
- [ ] Auditar `telegram-webhook` fallback para service_role  
- [ ] Garantir `.env` em `.gitignore`  
- [ ] Rever funções com `verify_jwt = false`  

### Rotação de segredos

- [ ] Evolution API key  
- [ ] Asaas  
- [ ] Lovable  
- [ ] ElevenLabs  
- [ ] Google OAuth secret  
- [ ] Anon key (se repositório público)  
- [ ] Tokens em BD (`ai_providers`, SMTP, Telegram) conforme política  

---

## Análise LGPD / financeiro / operacional / takeover / vazamento

| Risco | Ligação |
|-------|---------|
| LGPD | `service_role` → acesso a dados pessoais na BD; Evolution/WhatsApp |
| Financeiro | `ASAAS_API_KEY`; webhooks pagamento |
| Operacional | `SITE_URL` errado → convites/recovery quebrados |
| Takeover | `service_role` + Evolution key hardcoded |
| Vazamento | Keys em código e `.env` commitado |
| Indisponibilidade | CI sem `VITE_*` → build quebrado em PR |

---

*Última atualização derivada do estado do workspace; alterações locais não commitadas podem diferir.*

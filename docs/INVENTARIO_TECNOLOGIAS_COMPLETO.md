# Inventário completo de tecnologias — hapitech-main

**Escopo:** código em `c:\workspace_hapitech\hapitech-main`  
**Gestor de pacotes:** apenas **npm** (`package-lock.json` presente; **sem** `pnpm-lock.yaml` nem `yarn.lock`).  
**Evidência de ausência:** pesquisa por `pnpm-lock.yaml` / `yarn.lock` — zero ficheiros.

---

## 1. Resumo executivo

| Camada | Tecnologia dominante |
|--------|----------------------|
| Frontend | React 18 + TypeScript + Vite 5 + Tailwind 3 + Radix UI (padrão shadcn) + TanStack Query 5 |
| Estado global | **Não** há Zustand, Redux, MobX, Recoil ou Jotai no código (`grep` em `src` sem correspondências) |
| Backend na repo | Apenas **Edge Functions** Deno em `supabase/functions/**`; servidor HTTP Node **não** existe na app |
| Empacotamento runtime | **Dockerfile** multi-stage Node 22 Alpine + `serve` porta **3000**; **sem** `docker-compose` |
| CI | GitHub Actions — lint, test (continua com erro), build, artefacto `dist/` |
| Plataforma dados | Supabase (PostgreSQL + Auth + Storage + Functions); extensão **vector** (pgvector) nas migrações |
| WhatsApp | Evolution API via **`wuzapi-proxy`** + **`whatsapp-webhook`**; frontend usa `useEvolutionApi` → `functions.invoke("wuzapi-proxy")` |

---

## 2. Inventário completo de tecnologias

Cada entrada segue: **Nome · Finalidade · Criticidade · Onde · Ficheiros · Dependências · Ocultas · ENV · Portas · Serviços · Container · Infra · Auth · Tokens · Risco op. · Risco seg. · Reutilizar · Substituir**

### 2.1 Frontend — runtime e build

#### React (^18.3.1)

1. **Nome:** React  
2. **Finalidade:** Biblioteca UI declarativa  
3. **Criticidade:** Crítica  
4. **Onde:** Toda a árvore `src/`  
5. **Ficheiros:** `package.json` L60–61; `src/main.tsx`, `src/App.tsx`, páginas e componentes  
6. **Dependências:** `react-dom` peer  
7. **Ocultas:** Resolução forçada em `vite.config.ts` L17–22 para evitar duplicação de cópias de React  
8. **ENV:** Nenhuma específica de React  
9. **Portas:** Dev **8080** (`vite.config.ts` L10); prod via `serve` **3000**  
10. **Serviços:** Nenhum servidor próprio além do bundle  
11. **Container:** Opcional — imagem no `Dockerfile` serve estático  
12. **Infra:** TLS no reverse proxy recomendado  
13. **Autenticação:** Via Supabase no cliente  
14. **Tokens:** JWT sessão Supabase no browser  
15. **Risco operacional:** Baixo (ecossistema maduro)  
16. **Risco segurança:** XSS usual em SPA — mitigar sanitização e CSP no edge  
17. **Reutilizada:** Sim  
18. **Substituir:** Não necessário para reconstrução fiel  

#### TypeScript (^5.8.3)

1. **Nome:** TypeScript  
2. **Finalidade:** Tipagem estática  
3. **Criticidade:** Alta  
4. **Onde:** `src/**/*.ts`, `src/**/*.tsx`  
5. **Ficheiros:** `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`; `eslint.config.js`  
6. **Dependências:** `@types/react`, `@types/react-dom`, `@types/node`  
7. **Ocultas:** Config paths `@/` → `./src` (`vite.config.ts` L18)  
8. **ENV:** —  
9. **Portas:** —  
10. **Serviços:** —  
11. **Container:** Compila em build; não runtime TS em prod  
12. **Infra:** —  
13. **Auth:** —  
14. **Tokens:** —  
15. **Risco operacional:** Baixo  
16. **Risco segurança:** Ajuda a evitar bugs de tipo  
17. **Reutilizada:** Sim  
18. **Substituir:** Não  

#### Vite (^5.4.19) + @vitejs/plugin-react-swc (^3.11.0)

1. **Nome:** Vite + SWC  
2. **Finalidade:** Bundler e dev server rápido; transpilação JSX via SWC  
3. **Criticidade:** Crítica para build  
4. **Onde:** CLI `npm run dev` / `npm run build`  
5. **Ficheiros:** `vite.config.ts`; `package.json` scripts L7–8  
6. **Dependências:** `vite`, `@vitejs/plugin-react-swc`  
7. **Ocultas:** `lovable-tagger` só em desenvolvimento (`vite.config.ts` L15)  
8. **ENV:** `import.meta.env.VITE_*` injetadas em build  
9. **Portas:** Dev **8080**  
10. **Serviços:** —  
11. **Container:** Build dentro do stage `builder` no `Dockerfile` L16  
12. **Infra:** Variáveis `VITE_*` devem existir **no momento do build** em pipelines  
13. **Auth:** —  
14. **Tokens:** Chave anon embutida no bundle (pública por desenho Supabase)  
15. **Risco operacional:** Médio se `VITE_*` erradas em CI — app aponta para projeto errado  
16. **Risco segurança:** Chaves em `.env` commitadas por engano — usar secrets CI  
17. **Reutilizada:** Sim  
18. **Substituir:** Opcional (Webpack/Rspack) sem ganho mandatório  

#### Tailwind CSS (^3.4.17) + tailwindcss-animate + @tailwindcss/typography + postcss + autoprefixer

1. **Nome:** Tailwind + plugins  
2. **Finalidade:** Utility-first CSS; animações; prose em markdown  
3. **Criticidade:** Alta  
4. **Onde:** Classes em componentes  
5. **Ficheiros:** `tailwind.config.ts`, `postcss.config.js`, `src/index.css`  
6. **Dependências:** PostCSS, Autoprefixer  
7. **Ocultas:** Merge via `tailwind-merge` em utils  
8. **ENV:** —  
9. **Portas:** —  
10. **Serviços:** —  
11. **Container:** CSS pré-compilado no `dist`  
12. **Infra:** —  
13–18. Reutilizar sim; substituir só por decisão de design  

#### shadcn/ui (padrão) — Radix UI packages + class-variance-authority + clsx + tailwind-merge

1. **Nome:** Conjunto Radix (`@radix-ui/react-*`) + CVA + clsx  
2. **Finalidade:** Componentes acessíveis (dialog, select, tabs, …) estilo shadcn  
3. **Criticidade:** Alta  
4. **Onde:** `src/components/ui/*.tsx` (**50** ficheiros listados)  
5. **Ficheiros exemplo:** `src/components/ui/button.tsx`, `dialog.tsx`, …  
6. **Dependências:** Listagem completa em `package.json` L22–48  
7. **Ocultas:** `cmdk` para command palette (`command.tsx`)  
8. **ENV:** —  
9–14. —  
15. **Risco operacional:** Baixo  
16. **Risco segurança:** Depende de uso correto de sanitização em conteúdo dinâmico  
17. **Reutilizada:** Sim  
18. **Substituir:** Não obrigatório  

#### TanStack React Query (^5.83.0)

1. **Nome:** @tanstack/react-query  
2. **Finalidade:** Cache, fetching, mutations — **substitui** Redux/Zustand para estado servidor  
3. **Criticidade:** Crítica  
4. **Onde:** `App.tsx` `QueryClientProvider`; hooks em `src/hooks/`  
5. **Ficheiros:** `src/App.tsx` L34–44; ex.: `src/hooks/useEvolutionApi.ts` L4–5  
6. **Dependências:** React 18  
7. **Ocultas:** Dedupe em `vite.config.ts` L24  
8. **ENV:** —  
9–14. —  
15. **Risco operacional:** Invalidação incorreta pode mostrar dados stale  
16. **Risco segurança:** Dados em cache em memória — sessão depende de Auth  
17. **Reutilizada:** Sim  
18. **Substituir:** Opcional  

#### React Router DOM (^6.30.1)

1. **Nome:** react-router-dom v6  
2. **Finalidade:** Rotas SPA  
3. **Criticidade:** Alta  
4. **Onde:** `BrowserRouter`, `Routes`, `Route`  
5. **Ficheiros:** `src/App.tsx` L55–89  
6–18. Rotas públicas `/auth`, `/reset-password`, `/widget/:id/iframe`; área protegida com `ProtectedRoute`  

#### react-hook-form (^7.61.1) + @hookform/resolvers (^3.10.0) + zod (^3.25.76)

1. **Nome:** RHF + Zod  
2. **Finalidade:** Formulários validados  
3. **Criticidade:** Média–Alta  
4. **Onde:** Formulários em páginas/componentes  
5. **Ficheiros:** `src/components/ui/form.tsx`; uso disperso  
6–18. Validação cliente; dados sensíveis seguem para Supabase  

#### Outras bibliotecas UI/UX (package.json dependencies)

| Pacote | Finalidade | Ficheiros / evidência |
|--------|------------|------------------------|
| `@elevenlabs/react` | SDK/UI voz ElevenLabs | Componentes de voz/agente |
| `@emoji-mart/data`, `@emoji-mart/react` | Emojis | Chat |
| `@hello-pangea/dnd` | Drag-and-drop | Boards/listas |
| `cmdk` | Command palette | `components/ui/command.tsx` |
| `date-fns` | Datas | Vários |
| `embla-carousel-react` | Carrosséis | `components/ui/carousel.tsx` |
| `framer-motion` | Animações | UI |
| `input-otp` | OTP inputs | `components/ui/input-otp.tsx` |
| `lucide-react` | Ícones | Amplo em `src/` |
| `next-themes` | Tema claro/escuro | `hooks/useTheme.ts` |
| `react-day-picker` | Calendário | `components/ui/calendar.tsx` |
| `react-resizable-panels` | Painéis redimensionáveis | Layout |
| `recharts` | Gráficos | Relatórios/dashboard |
| `sonner` | Toasts | `App.tsx`, hooks |
| `vaul` | Drawer | `components/ui/drawer.tsx` |

#### serve (^14.2.4)

1. **Nome:** `serve` (Static CLI)  
2. **Finalidade:** Servir `dist/` em produção  
3. **Criticidade:** Alta no caminho atual  
4. **Onde:** `npm run start`  
5. **Ficheiros:** `package.json` L10; `nixpacks.toml` L11  
6–14. Porta **3000**; sem TLS nativo — TLS no proxy  
15–18. **Substituir** por Nginx/Caddy só no edge container é comum  

#### lovable-tagger (^1.1.13) — devDependency

1. **Nome:** lovable-tagger  
2. **Finalidade:** Instrumentação dev (Lovable)  
3. **Criticidade:** Baixa (dev)  
4. **Onde:** `vite.config.ts` L4, L15 — só `mode === "development"`  
5. **Ficheiros:** `vite.config.ts`  
6–18. Não afeta bundle produção se plugin condicionado; remover se não usar Lovable  

### 2.2 Qualidade e testes

| Pacote | Finalidade | Ficheiros |
|--------|------------|-----------|
| eslint ^9 | Lint | `eslint.config.js` |
| typescript-eslint ^8 | Regras TS | `eslint.config.js` |
| vitest ^3 | Testes unitários | `npm run test`; ficheiros `*.test.*` |
| @testing-library/react | Testes componentes | devDependency |
| jsdom | Ambiente DOM nos testes | devDependency |

### 2.3 Backend serverless (Supabase Edge Functions — Deno)

**Runtime:** Deno na **infraestrutura Supabase**, não Node no projeto.

**Imports recorrentes (evidência):**

- `https://deno.land/std@0.168.0/http/server.ts` — maioria das functions  
- **Exceção:** `accept-invite/index.ts` usa `std@0.190.0/http/server.ts` — **drift de versão** entre functions  
- `https://esm.sh/@supabase/supabase-js@2` — cliente admin em todas  

**Lista de pastas (31 functions):**  
`agent-chat`, `extract-pdf`, `asaas-checkout`, `accept-invite`, `asaas-webhook`, `check-task-deadlines`, `create-team-user`, `google-oauth-token`, `admin-change-password`, `invite-org-member`, `youtube-transcript`, `gmail-oauth-token`, `send-recovery-email`, `wuzapi-proxy`, `solarmarket-query`, `telegram-webhook`, `scrape-website`, `google-calendar`, `asaas-invoices`, `elevenlabs-tts`, `elevenlabs-conversation-token`, `check-inactivity`, `ai-models-proxy`, `calendar-availability`, `generate-embeddings`, `verify-recovery-code`, `widget-chat`, `calendar-create-event`, `clinicorp-query`, `sync-subscription`, `whatsapp-webhook`

**Config JWT:** `supabase/config.toml` — `verify_jwt = false` para cada `[functions.<nome>]` listado; funções **sem** entrada explícita podem comportar-se diferente no dashboard (validar após deploy).

### 2.4 Banco de dados

| Item | Evidência |
|------|-----------|
| PostgreSQL | Plataforma Supabase |
| Migrações | `supabase/migrations/*.sql` — **91** ficheiros |
| Extensão vector | `20260218013937_7678234d-2be6-44b3-9613-009110e39238.sql` L2–18 (`CREATE EXTENSION vector`; coluna `embedding vector(1536)`); variantes em `create_hapitech_core_schema_v2` / restore |
| Triggers | Ex.: `on_auth_user_created` — `20260216032249_96729937-a071-4bda-af8a-a47023ac985b.sql`; múltiplos `update_*_updated_at` |
| Funções SQL | `match_knowledge_chunks` / similar em migrações com `vector_cosine_ops` |
| RLS | Centenas de `CREATE POLICY` nas migrações |
| Storage buckets | `INSERT INTO storage.buckets` — ex. `20260217172951_*`, `20260217135526_*` (`knowledge`), `chat-media`, etc. |

**Nota:** `grep` por `cron.` / `pg_cron` nas migrações — **sem correspondências**; agendamentos externos devem usar **Supabase Scheduled Functions** ou cron externo a invocar URLs das Edge Functions (configuração **fora** deste repositório).

### 2.5 Infraestrutura no repositório

| Artefacto | Caminho | Conteúdo |
|-----------|---------|----------|
| Dockerfile | `c:\workspace_hapitech\hapitech-main\Dockerfile` | Node 22 Alpine builder → `npm ci` → `npm run build` → stage final `serve dist -s -l 3000`, **EXPOSE 3000** |
| docker-compose | — | **Não existe** no projeto |
| nixpacks.toml | `nixpacks.toml` | Node 22, `npm install`, `npm run build`, start `npm run start` |
| CI | `.github/workflows/ci.yml` | Ubuntu, Node 22, `npm ci`, lint, test (`continue-on-error: true`), build, upload `dist/` |
| Coolify / Nginx | — | **Não versionados** — implícitos apenas em deploy escolhido pelo operador |

### 2.6 Hooks customizados (`src/hooks/` — 34 ficheiros)

Lista de ficheiros (evidência `glob`):  
`useKnowledgeFiles.ts`, `useNotificationSound.ts`, `usePlan.ts`, `useClinicorpConnections.ts`, `useTags.ts`, `useCrmStages.ts`, `useTheme.ts`, `useAiModels.ts`, `useLeads.ts`, `useCrmCustomFields.ts`, `use-toast.ts`, `useChat.ts`, `useConnectionEvents.ts`, `useOrgUserIds.ts`, `useAgentKnowledge.ts`, `useTelegramConnectionMonitor.ts`, `useContactCustomFields.ts`, `useAuth.tsx`, `useAgents.ts`, `useLeadContacts.ts`, `use-mobile.tsx`, `useUserRole.ts`, `useWidgetConnections.ts`, `useGoogleCalendar.ts`, `useLeadDetail.ts`, `useOrganization.ts`, `useWhatsAppConnectionMonitor.ts`, `useSettings.ts`, `useMediaUrl.ts`, `useTelegramConnections.ts`, `useEvolutionApi.ts`, `useLanguage.tsx`, `useNotifications.ts`, `useSolarMarketConnections.ts`

**Providers React:** `AuthProvider` (`useAuth.tsx`), `LanguageProvider` (`useLanguage.tsx`), `TooltipProvider`, `QueryClientProvider` — `src/App.tsx`.

---

## 3. Inventário de serviços externos (URLs e SDKs no código)

| Serviço | URL / endpoint | Ficheiro(s) |
|---------|----------------|-------------|
| Supabase | `SUPABASE_URL` (env) | Todas as Edge Functions + `client.ts` |
| Lovable AI Gateway | `https://ai.gateway.lovable.dev/v1/*` | `whatsapp-webhook`, `telegram-webhook`, `generate-embeddings`, `agent-chat`, … |
| OpenAI | `https://api.openai.com/v1/` | `ai-models-proxy/index.ts`; STT em `whatsapp-webhook` |
| Google OAuth | `https://oauth2.googleapis.com/token` | `send-recovery-email`, `whatsapp-webhook`, … |
| Gmail API | `https://gmail.googleapis.com/gmail/v1/...` | `send-recovery-email/index.ts` L48 |
| Google Calendar API | `https://www.googleapis.com/calendar/v3/` | `whatsapp-webhook`, calendar functions |
| Telegram Bot API | `https://api.telegram.org/bot...` | `telegram-webhook`, `check-inactivity` |
| ElevenLabs | `https://api.elevenlabs.io/v1/` | `elevenlabs-tts`, `elevenlabs-conversation-token`, `whatsapp-webhook` |
| Evolution API | Base `EVO_URL` + fallback literal em código | `wuzapi-proxy/index.ts`, `whatsapp-webhook/index.ts` |
| Asaas | API HTTP nas functions Asaas | `asaas-checkout`, `asaas-invoices`, `sync-subscription`, `asaas-webhook` |
| Clinicorp | `https://api.clinicorp.com/v1` | `clinicorp-query/index.ts` L10 |
| Solar Market | `https://business.solarmarket.com.br/api/v2` | `solarmarket-query/index.ts` L10; `clinicorp-query` L13 |
| Jina Reader | `https://r.jina.ai/` | `youtube-transcript/index.ts` |
| YouTube | páginas públicas | `youtube-transcript` |

**SMTP:** não é serviço SaaS fixo — envio via **SMTP configurável** na tabela `smtp_settings` ou **Gmail API** — `send-recovery-email/index.ts` L85–269; UI `src/components/SmtpSettingsTab.tsx`.

---

## 4. Dependências críticas

1. **Supabase projeto** ativo + migrações aplicadas  
2. **`@supabase/supabase-js`** no front  
3. **Edge Functions** deployadas + secrets (`Deno.env`)  
4. **Evolution API** (se WhatsApp)  
5. **`LOVABLE_API_KEY`** onde gateway é usado  
6. **Asaas** (`ASAAS_API_KEY`) para billing  
7. **Google OAuth** (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) para Gmail/calendar/recovery  

---

## 5. Dependências ocultas

| Oculta | Descrição |
|--------|-----------|
| Supabase CLI | Deploy migrations/functions — não está em `package.json` |
| Deno | Fornecido pela plataforma Supabase ao executar functions |
| TLS no proxy | Obrigatório em produção — não no repo |
| DNS | Webhooks Asaas/Telegram/Evolution precisam URL pública HTTPS |
| Instância Evolution | Container/imagem Evolution **não** está neste repo |
| `lovable-tagger` | Só desenvolvimento |
| Versões Deno std **duplicadas** | `0.168.0` vs `0.190.0` em `accept-invite` — risco de comportamento divergente |

---

## 6. Dependências potencialmente não utilizadas ou redundantes

**Verificação:** não foi executado **depcheck** automatizado neste documento. Recomendação: `npx depcheck` no projeto.

**Afirmações seguras pelo código:**

- **Zustand / Redux / MobX / Recoil / Jotai:** **não** há imports — não são dependências do projeto (`grep` zero em `src`).

---

## 7. Dependências inseguras / superfície de ataque

| Problema | Evidência |
|----------|-----------|
| Fallback URL + API key Evolution **no código-fonte** | `supabase/functions/whatsapp-webhook/index.ts` L8–10; `wuzapi-proxy/index.ts` L40–41 |
| CORS `*` em várias Edge Functions | Cabeçalhos `Access-Control-Allow-Origin: *` em múltiplos `index.ts` |
| `verify_jwt = false` nas functions nomeadas em `config.toml` | Exige validação manual dentro do handler |
| JWT/anon embutidos no bundle | Desenho Supabase — mitigar com RLS |

**Auditoria npm:** executar localmente `npm audit` (requer rede/atualização da base de vulnerabilidades). **Não** incluído aqui para evitar dados desatualizados.

---

## 8. Dependências obsoletas / deprecação

- Versões fixadas em `package.json` com `^` — árvore exata em `package-lock.json`.  
- **next-themes** nome sugere ecossistema Next.js mas é agnóstico — não está obsoleto por si.  
- **Vite 5** e **React 18** são linhas atuais; atualização major deve ser planeada com changelog.

---

## 9. Requisitos infraestrutura

| Requisito | Detalhe |
|-----------|---------|
| SO build | Linux (CI Ubuntu) ou Windows/macOS dev — Node 22 |
| RAM/CPU | Build Vite moderado; Edge Functions escalam no Supabase |
| Rede egress | Functions chamam dezenas de APIs HTTPS |
| SSL | Obrigatório para webhooks e OAuth redirects |
| IPv4/IPv6 | `vite` dev host `::` — dual stack dev |

---

## 10. Requisitos deploy

1. `npm ci` ou `npm install`  
2. Definir `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` no **build**  
3. `npm run build`  
4. Servir `dist/` — `serve`, CDN estático, ou `Dockerfile` fornecido  

---

## 11. Requisitos Docker

| Item | Evidência |
|------|-----------|
| Imagem base | `node:22-alpine` — `Dockerfile` L2, L20 |
| Multi-stage | Builder + runtime — L2–35 |
| Porta | **3000** — L32, L35 |
| Ordem | install → build → copiar só `dist` para imagem final |

**Compose:** não aplicável — ficheiro inexistente.

---

## 12. Requisitos Supabase

1. Projeto novo  
2. `supabase link` + `supabase db push` (91 migrações)  
3. Ativar extensões compatíveis (`vector`)  
4. Configurar Storage conforme migrações  
5. Deploy das **31** Edge Functions  
6. Secrets: ver secção 14  

---

## 13. Requisitos Evolution API

1. Instância própria Evolution (container típico **fora** deste repo)  
2. Definir `EVO_URL`, `EVO_KEY` nos secrets Supabase  
3. Webhook WhatsApp → `whatsapp-webhook`  
4. Frontend chama `wuzapi-proxy` — `useEvolutionApi.ts` L28–32  

---

## 14. Requisitos segurança

- Rodar chaves hardcoded no código  
- Rotacionar todas as keys ao mudar de infra  
- Restringir CORS em produção se possível  
- Rever JWT por função no dashboard Supabase  

**Variáveis `Deno.env` agregadas (Edge Functions):**  
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EVO_URL`, `EVO_KEY`, `ASAAS_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `SITE_URL`, `RECOVERY_WEBHOOK_URL` — conforme `grep Deno.env.get` em `supabase/functions`.

**Frontend:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, opcional `VITE_GOOGLE_CLIENT_ID` (`.env` exemplo).

---

## 15. Checklist técnico

- [ ] Node **22** alinhado a `Dockerfile` / CI / `nixpacks.toml`  
- [ ] `npm ci` reprodutível com `package-lock.json`  
- [ ] Build com todas `VITE_*`  
- [ ] Imagem Docker ou Nixpacks + reverse proxy TLS  
- [ ] Supabase: migrações + functions + secrets  
- [ ] Evolution nova instância + secrets  
- [ ] Asaas webhook URL HTTPS  
- [ ] Google Cloud Console: redirect URIs novos domínios  
- [ ] Telegram webhook URL atualizado  
- [ ] Remover/rodar secrets hardcoded Evolution no código  
- [ ] Opcional: unificar versão `deno.land/std` em `accept-invite`  

---

## Referências de ficheiros obrigatórios (análise pedida)

| Ficheiro | Motivo |
|----------|--------|
| `c:\workspace_hapitech\hapitech-main\package.json` | Dependências npm |
| `c:\workspace_hapitech\hapitech-main\package-lock.json` | Lockfile |
| `c:\workspace_hapitech\hapitech-main\Dockerfile` | Container produção |
| `c:\workspace_hapitech\hapitech-main\vite.config.ts` | Vite / alias / plugin dev |
| `c:\workspace_hapitech\hapitech-main\nixpacks.toml` | Deploy Nixpacks |
| `c:\workspace_hapitech\hapitech-main\supabase\config.toml` | Functions JWT / project_id |
| `c:\workspace_hapitech\hapitech-main\supabase\functions\**\index.ts` | Deno / integrações |
| `c:\workspace_hapitech\hapitech-main\src\integrations\supabase\client.ts` | Cliente Supabase |
| `c:\workspace_hapitech\hapitech-main\src\hooks\useEvolutionApi.ts` | Fluxo Evolution no front |
| `c:\workspace_hapitech\hapitech-main\.github\workflows\ci.yml` | CI/CD |

---

*Documento gerado a partir do estado atual do workspace; execute ferramentas adicionais (`npm audit`, `depcheck`) para dados dinâmicos de vulnerabilidade e uso exato de cada pacote npm.*

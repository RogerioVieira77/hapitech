# hapitechAI — Visão Geral e Plano de Desenvolvimento

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

## 1. Visão do Produto

### 1.1 O que é hapitechAI

hapitechAI é uma plataforma SaaS para criação, gerenciamento e operação de **agentes de IA conversacionais**. Empresas usam a plataforma para configurar agentes que atendem clientes via WhatsApp, Telegram e widget web — com base de conhecimento própria, múltiplos modelos de IA e CRM integrado.

### 1.2 Para quem

- Empresas que usam WhatsApp e/ou Telegram como canal principal de atendimento ao cliente
- Times de vendas e suporte que precisam escalar atendimento sem aumentar equipe
- Negócios que querem automação de qualificação de leads com IA

### 1.3 Proposta de valor

- Criar e configurar agentes de IA em minutos, sem código
- Conectar WhatsApp (via Evolution API/Baileys) e Telegram nativamente
- Base de conhecimento própria por agente, com RAG (a IA responde só com o que a empresa definiu)
- CRM integrado: conversas, leads e contatos num só lugar, com transição IA → humano
- Multi-modelo: escolha entre OpenAI, Anthropic, Google Gemini, Groq, Mistral e DeepSeek por agente
- Widget embeddable em qualquer site

---

## 2. Stack Tecnológico

| Camada | Tecnologia | Notas |
|--------|-----------|-------|
| **Frontend** | React 18 + TypeScript 5 + Vite 5 | SPA; sem SSR |
| **UI** | shadcn/ui (Radix UI) + Tailwind CSS 3 | Design system padrão |
| **Data fetching** | TanStack Query 5 + Supabase JS | Sem Zustand/Redux — sem estado global externo |
| **Backend** | Supabase (PostgreSQL + Auth + Storage + Realtime) | Sem servidor Node/Java próprio |
| **Serverless** | Supabase Edge Functions (Deno) | 31 funções em `supabase/functions/` |
| **Banco de dados** | PostgreSQL + pgvector | 91 migrations; RLS extensivo; schema `public` |
| **WhatsApp** | Evolution API + Baileys | Proxy via edge function `wuzapi-proxy` |
| **Telegram** | Telegram Bot API | Via edge function `telegram-webhook` |
| **Widget público** | Edge function `widget-chat` | Iframe embeddable sem autenticação |
| **IA — modelos** | OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek | Chaves por organização, armazenadas na BD |
| **IA — gateway** | Lovable AI Gateway (`ai.gateway.lovable.dev`) | Provedor padrão para chat e embeddings |
| **Voz** | ElevenLabs TTS | Áudio em conversas WhatsApp |
| **Billing** | Asaas | Cobranças e créditos; mercado brasileiro |
| **OAuth / Produtividade** | Google OAuth 2.0, Gmail API, Google Calendar | Para agentes com integração Google |
| **Conhecimento externo** | YouTube Transcript, Jina Reader, scraper | Ingestão de conteúdo para base de conhecimento |
| **Build** | Vite + Docker (Node 22 Alpine + `serve` porta 3000) | Nixpacks para deploy via Coolify |
| **CI** | GitHub Actions | Lint, testes (Vitest), build |
| **Deploy** | Coolify + VPS + Cloudflare | CDN/WAF via Cloudflare; orquestração Docker |

---

## 3. Mapa de Módulos

### 3.1 Módulos principais

| # | Módulo | Rota | Descrição |
|---|--------|------|-----------|
| 1 | **Dashboard** | `/` | KPIs (mensagens, leads, créditos, economia de tempo), gráfico de atividade, conversas recentes, status dos agentes |
| 2 | **Agentes** | `/agents` | Criação e edição de agentes: nome, instruções de personalidade, modelo de IA, temperatura, conversation starters, seção de conhecimento |
| 3 | **Base de Conhecimento** | `/knowledge` | Upload de arquivos (PDF, TXT, CSV) e URLs; RAG configurável (só base vs. conhecimento geral + base); embeddings pgvector no Supabase Storage |
| 4 | **Integrações** | `/integrations` | WhatsApp (QR Code via Evolution API), Telegram, widget web customizável (cores, ícone, código embed), Google Calendar/Gmail, MCP connections, provedores de IA |
| 5 | **CRM & Chat** | `/crm`, `/chat`, `/contacts` | Chat ao vivo (IA + assumir controle humano), lista de conversas com filtros (IA atendendo / aguardando humano), contatos, leads, automações CRM, histórico de mensagens |
| 6 | **Financeiro** | `/billing` | Plano atual, histórico de faturas, recarga de créditos, assinatura gerenciada via Asaas |

### 3.2 Módulos transversais

| Módulo | Rota / Local | Descrição |
|--------|-------------|-----------|
| **Autenticação** | `/auth`, `/reset-password` | Email/senha + sessão Supabase Auth; convites de equipe; recovery por email |
| **Equipe / Multi-org** | `/teams` | Organizações com múltiplos usuários e papéis |
| **Notificações** | `NotificationListener` | Realtime Supabase; notificações in-app |
| **Configurações** | `/settings`, `/profile` | Perfil, provedores de IA por organização, preferências |
| **Relatórios** | `/reports` | Relatórios de uso e atendimento |
| **Tarefas** | `/tasks` | Gestão de tarefas vinculadas a contatos/conversas |
| **Atendimentos** | `/atendimentos` | Visão consolidada de atendimentos em andamento |
| **Super Admin** | `/super-admin` | Painel administrativo para gestão da plataforma |
| **Widget público** | `/widget/:id/iframe` | Chat embeddable sem login; rota pública |
| **OAuth callbacks** | `/gmail-oauth-callback` | Callback de autorização Google |

---

## 4. Estado Atual do Projeto

hapitechAI está **em produção** com clientes ativos.

A aplicação opera sobre uma infraestrutura que foi criada durante a fase de prototipagem via Lovable. Essa infraestrutura está sendo **migrada para um ambiente novo e controlado** (Fase 2 em andamento).

**Impacto para devs:** ao trabalhar no projeto, considere que:
- Existem segredos de infra legada hardcoded em algumas edge functions — **não reutilize esses valores**
- O `project_id` em `supabase/config.toml` aponta para o projeto legado — use `supabase link` para o projeto correto no seu ambiente
- O `SITE_URL` padrão em algumas funções aponta para `*.lovable.app` — deve ser sobrescrito via secret

> Para a lista completa de débitos técnicos, status da migração e checklist de segurança, ver [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

---

## 5. Fases de Desenvolvimento

### Fase 0 — Prototipagem via Lovable *(concluída)*

**Contexto:** o projeto foi criado na plataforma Lovable (geração de código por IA com Vite + React + Supabase como template). O código reflete essa origem: nome interno do pacote `vite_react_shadcn_ts`, `project_id` Lovable em `supabase/config.toml`, referências a domínios `*.lovable.app` em edge functions e uso do Lovable AI Gateway como provedor de IA principal.

**Entregável:** SPA funcional com todos os módulos em estado inicial, conectada ao Supabase e Evolution API do ambiente de origem.

---

### Fase 1 — MVP em produção *(concluída)*

**Status:** em uso por clientes

**O que foi construído:**

- 6 módulos principais implementados e funcionais
- 31 Edge Functions cobrindo WhatsApp, Telegram, IA multi-provedor, billing, OAuth Google, widget, knowledge
- 91 migrations SQL com schema completo, RLS e extensão pgvector
- Integração WhatsApp completa via Evolution API + Baileys (criar instância, QR, envio, recebimento, mídia)
- Multi-provedor de IA por organização (OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek)
- RAG com embeddings pgvector: agentes respondem a partir da base de conhecimento
- Billing via Asaas (cobranças recorrentes, créditos, webhooks)
- Widget público embeddable em sites externos
- Automações CRM (regras de inatividade, check de tarefas)
- Integração Google Calendar e Gmail para agentes

**Débitos identificados ao fim desta fase:**

- Segredos de infra hardcoded em `wuzapi-proxy` e `whatsapp-webhook`
- `verify_jwt = false` em todas as edge functions sem validação manual consistente por handler
- Políticas RLS permissivas (`USING (true)`) em tabelas com dados sensíveis (chaves de API de IA)
- URLs de domínios legados (`*.lovable.app`, domínio antigo Evolution) embutidas em código
- Ausência de ambientes staging/production separados no CI/CD

---

### Fase 2 — Migração de infraestrutura + hardening *(em andamento)*

**Objetivo:** assumir controle total da infraestrutura, remover dependências do ambiente de origem e corrigir débitos críticos de segurança identificados na Fase 1.

**Escopo:**
- Novo projeto Supabase com migrações aplicadas do zero
- Nova instância Evolution API com `EVO_KEY` rotacionada e sem fallback hardcoded no código
- Remoção de todos os segredos literais das edge functions
- Revisão de `verify_jwt` por função e reforço das políticas RLS
- Pipeline CI/CD com ambientes `staging` e `production` separados
- VPS nova + Coolify + Cloudflare (WAF, CDN, TLS full strict)
- Observabilidade básica (uptime checks, alertas de erro)

> Checklist detalhado, prioridades e status de cada item: ver [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

---

### Fase 3 — Expansão de funcionalidades *(roadmap)*

Itens em definição para após a estabilização da Fase 2:

- Analytics avançados de uso dos agentes (taxa de resolução, tempo médio, CSAT)
- Integrações adicionais de canal (Instagram/Facebook Messenger, email)
- Melhorias no CRM: funil de vendas, automações mais complexas, scoring de leads
- API pública para integrações externas (webhooks outbound configuráveis por evento)
- Melhorias de performance: streaming de respostas IA no frontend, lazy loading de histórico
- Observabilidade avançada: APM no frontend (Sentry), métricas de latência por edge function

---

## 6. Infraestrutura — Resumo

### Topologia atual (legado)

```
Usuário
  └─→ VPS legada (Coolify)
        └─→ SPA React (Docker · Node 22 Alpine · serve porta 3000)
                └─→ Supabase (projeto existente · supabase.co)
                      ├─ PostgreSQL + pgvector + RLS (91 migrations)
                      ├─ GoTrue (Auth · email/senha · JWT)
                      ├─ PostgREST (CRUD com RLS)
                      ├─ Realtime (conversas, mensagens, notificações)
                      ├─ Storage (avatares · knowledge · chat-media)
                      └─ Edge Functions — 31 funções Deno
                            └─→ Evolution API (servidor legado)
                                  └─→ Baileys → WhatsApp
```

### Topologia alvo (Fase 2)

```
Usuário
  └─→ Cloudflare (WAF · CDN · TLS Full Strict)
        └─→ VPS nova (Coolify · Docker)
              └─→ SPA React (build com VITE_* do projeto novo)
                      └─→ Supabase NOVO (projeto isolado)
                            └─→ Edge Functions
                                  └─→ Evolution API NOVA (EVO_KEY rotacionada)
                                        └─→ Baileys → WhatsApp
```

### Variáveis de ambiente obrigatórias

| Escopo | Variável | Descrição |
|--------|----------|-----------|
| Frontend (build) | `VITE_SUPABASE_URL` | URL do projeto Supabase |
| Frontend (build) | `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave anon (pública) |
| Edge Functions | `SUPABASE_SERVICE_ROLE_KEY` | Chave service role — **crítica, nunca expor** |
| Edge Functions | `EVO_URL` | URL da instância Evolution API |
| Edge Functions | `EVO_KEY` | API key da Evolution API — **rotacionar a cada deploy** |
| Edge Functions | `LOVABLE_API_KEY` | Gateway de IA principal (Lovable) |
| Edge Functions | `ASAAS_API_KEY` | Billing Asaas |
| Edge Functions | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| Edge Functions | `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` | Voz ElevenLabs |
| Edge Functions | `SITE_URL` | URL pública da app (convites, recovery) — **obrigatório sobrescrever** |

> Setup local passo a passo e guia completo de variáveis: ver [004 - Guia de Desenvolvimento](./004%20-%20Guia%20de%20Desenvolvimento%20-%20hapitechAI.md).

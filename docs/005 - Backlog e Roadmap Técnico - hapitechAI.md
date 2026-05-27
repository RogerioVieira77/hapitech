# hapitechAI — Backlog e Roadmap Técnico

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

**Fonte primária deste documento:** arquivos de engenharia reversa em `docs/Arquivo/`, em especial:

- `AUDITORIA_SEGURANCA_COMPLETA.md`
- `AUDITORIA_VARIAVEIS_SEGREDOS_COMPLETA.md`
- `PLANO_ENTERPRISE_RECONSTRUCAO_INFRA_TOTAL.md`
- `CHECKLIST_FINAL_ENTERPRISE_MIGRACAO_PRODUCAO.md`
- `RUNBOOK_EXECUTIVO_CUTOVER_E_CHECKLIST_GO_LIVE.md`

Para detalhes operacionais completos e runbooks de execução, consulte os documentos acima.

---

## Convenções

### Classificação de prioridade de vulnerabilidades

| Tag | Significado |
|-----|------------|
| `V-CRIT` | Crítico — compromete segurança, dados ou financeiro diretamente |
| `V-ALT` | Alto — exposição severa, exploração real plausível |
| `V-MED` | Médio — risco real, impacto limitado ou difícil exploração direta |
| `V-BAIXO` | Baixo — higiene de código, sem impacto imediato |

### Prioridade de backlog

| Tag | Significado |
|-----|------------|
| `P0` | Bloqueante para produção segura |
| `P1` | Alta prioridade, próximo sprint |
| `P2` | Importante, sem urgência imediata |
| `P3` | Posterior / roadmap |

---

## 1. Dívida de segurança

Esta seção cataloga vulnerabilidades identificadas na auditoria estática do código-fonte. Cada item tem um ID rastreável. Para o relatório completo com evidências de arquivo e linha, consultar `docs/Arquivo/AUDITORIA_SEGURANCA_COMPLETA.md`.

### V-CRIT-01 — Credenciais Evolution API hardcoded no código-fonte

| Campo | Detalhe |
|-------|---------|
| **Tipo** | CWE-798 — credenciais embutidas |
| **Prioridade** | P0 |
| **Arquivos** | `supabase/functions/wuzapi-proxy/index.ts` (fallback URL + key literal); `supabase/functions/whatsapp-webhook/index.ts` (constantes DEFAULT_EVO_*) |
| **Impacto** | Qualquer pessoa com acesso ao repositório ou artefato de build pode operar a instância Evolution. Controle total do canal WhatsApp da organização. Abuso de envio de mensagens e custo de infra. |
| **LGPD** | Mensagens de titulares acessíveis via API comprometida |
| **Correção** | Remover literais; tornar `EVO_URL` e `EVO_KEY` obrigatórios via `Deno.env.get()` sem fallback; rotacionar a chave na instância Evolution; auditar logs de acesso à API |

### V-CRIT-02 — `verify_jwt = false` para todas as 31 Edge Functions

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Falha de controle de acesso — configuração insegura |
| **Prioridade** | P0 |
| **Arquivo** | `supabase/config.toml` — todas as entradas `[functions.*] verify_jwt = false` |
| **Impacto** | O gateway Supabase não valida o JWT antes de encaminhar a requisição. A autorização depende integralmente de código implementado dentro de cada handler. Funções sem validação manual (ex.: `widget-chat`, webhooks) ficam publicamente acessíveis via URL. |
| **Correção** | Ativar `verify_jwt = true` em funções que exigem usuário autenticado. Para webhooks externos (Asaas, Evolution, Telegram) manter `false` com mitigação forte por segredo/HMAC documentada explicitamente. Auditar cada função individualmente. |

### V-CRIT-03 — Webhook Asaas sem validação de assinatura

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Ausência de autenticação de mensagem (HMAC) |
| **Prioridade** | P0 |
| **Arquivo** | `supabase/functions/asaas-webhook/index.ts` — processa `event`/`payment` sem verificação de assinatura |
| **Impacto** | Qualquer requisição POST para o endpoint pode alterar estado de subscrição, `organizations.subscription_status`, créditos e notificações financeiras. Risco de fraude. |
| **Correção** | Validar token secreto Asaas no header/query conforme documentação Asaas; implementar idempotência por `payment.id` para prevenir double-processing; considerar lista branca de IPs Asaas como camada adicional |

### V-CRIT-04 — RLS com `USING (true)` na tabela `ai_providers` (chaves de API expostas)

| Campo | Detalhe |
|-------|---------|
| **Tipo** | CWE-200 — autorização fraca |
| **Prioridade** | P0 |
| **Arquivos** | Migrations `20260301215513` e `20260301221950` — `FOR SELECT USING (true)` em `ai_providers` e `ai_models` |
| **Impacto** | Qualquer usuário autenticado pode ler a coluna `api_key` de providers de IA de qualquer organização. Abuso de quota OpenAI/Anthropic. |
| **Correção** | Substituir `USING (true)` por política com filtro de `organization_id` por membro; nunca expor coluna `api_key` via SELECT direto ao cliente; acesso à chave apenas via Edge Function com service_role |

### V-ALT-01 — RLS com `USING (true)` em tabelas de dados CRM e contatos

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Escalada horizontal de dados entre organizações |
| **Prioridade** | P1 |
| **Arquivos** | Migrations que definem `FOR ALL USING (true) WITH CHECK (true)` em `contact_custom_field_values`, `conversation_tags`, `crm_automation_rules` e outras |
| **Impacto** | Sem filtro por `organization_id`, dados de CRM/contatos de uma organização podem ser acessados por membros de outra se a query não filtrar explicitamente |
| **Correção** | Restringir todas as políticas RLS para filtrar por `organization_id` via `auth.uid()` e relacionamento de membros |

### V-ALT-02 — SSRF via regras de webhook (`fireWebhookRules`)

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Server-Side Request Forgery |
| **Prioridade** | P1 |
| **Arquivo** | `supabase/functions/whatsapp-webhook/index.ts` — `fetch(rule.url)` sem validação de destino |
| **Impacto** | Um usuário com acesso à configuração de regras pode apontar webhooks para redes internas, cloud metadata (169.254.169.254) ou serviços locais |
| **Correção** | Validar URL de destino contra lista de bloqueio de IPs privados e metadata; exigir HTTPS; implementar allow-list de domínios se possível |

### V-ALT-03 — SSRF via `scrape-website`

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Server-Side Request Forgery |
| **Prioridade** | P1 |
| **Arquivo** | `supabase/functions/scrape-website/index.ts` — `fetch(url)` direto sem validação |
| **Impacto** | Usuário autenticado pode forçar o servidor a contatar IPs internos da infraestrutura cloud |
| **Correção** | Mesma abordagem de V-ALT-02: validação de URL antes do fetch |

### V-ALT-04 — Fallback de token anon em `AgentChat.tsx`

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Bypass de autenticação |
| **Prioridade** | P1 |
| **Arquivo** | `src/components/AgentChat.tsx` — fallback para `VITE_SUPABASE_PUBLISHABLE_KEY` quando sessão não existe |
| **Impacto** | Chamadas à Edge Function podem ocorrer com token anon onde se esperava JWT de usuário; créditos e controle de acesso se comportam como se fosse usuário anônimo |
| **Correção** | Exigir sessão explícita antes de invocar funções que consomem créditos; não fazer fallback para anon em fluxos autenticados |

### V-ALT-05 — `service_role` como fallback em transcrição de áudio (Telegram)

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Vazamento potencial de segredo supremo |
| **Prioridade** | P1 |
| **Arquivo** | `supabase/functions/telegram-webhook/index.ts` — `SUPABASE_SERVICE_ROLE_KEY` passado como argumento para `transcribeAudio` quando `LOVABLE_API_KEY` está ausente |
| **Impacto** | Se `transcribeAudio` enviar esse valor para uma API externa, o service_role key — que bypassa toda RLS — vaza para terceiros |
| **Correção** | Não usar service_role como credencial de autenticação para APIs externas; criar chave dedicada para transcrição; validar que o valor nunca sai da edge function |

### V-ALT-06 — CORS universal (`*`) em todas as Edge Functions

| Campo | Detalhe |
|-------|---------|
| **Tipo** | Configuração insegura de CORS |
| **Prioridade** | P2 |
| **Arquivos** | Header `Access-Control-Allow-Origin: *` em dezenas de funções |
| **Impacto** | Facilita exploração cross-site quando combinado com V-CRIT-02 (sem JWT). Funções que aceitam qualquer origem ficam mais expostas a abuso |
| **Correção** | Restringir para o domínio de produção da SPA em funções que processam dados de usuário; manter `*` apenas em funções públicas por design (ex.: `widget-chat`) |

### V-MED-01 — Logs com dados sensíveis

| Arquivo | Dado exposto | Correção |
|---------|-------------|---------|
| `asaas-webhook/index.ts` | `console.log` com objeto `event` e `payment.id` completos | Reduzir log a campos não-sensíveis ou mascarar |

### V-MED-02 — Dockerfile sem usuário não-root

| Arquivo | Situação | Correção |
|---------|---------|---------|
| `Dockerfile` | Execução em container como root | Adicionar `RUN adduser -D appuser` + `USER appuser` antes do CMD |

### V-MED-03 — CI sem `npm audit` e sem scan de segredos

| Situação | Correção |
|---------|---------|
| `.github/workflows/ci.yml` não executa `npm audit` nem verifica segredos commitados | Adicionar step `npm audit --audit-level=high` e integrar ferramenta de scan de segredos (ex.: `trufflehog`, `gitleaks`) |

---

## 2. Débitos técnicos operacionais

Itens que não são vulnerabilidades de segurança diretas mas que afetam confiabilidade, manutenibilidade e operação correta do sistema.

| ID | Descrição | Prioridade | Arquivo(s) |
|----|-----------|-----------|-----------|
| DT-01 | `continue-on-error: true` nos testes do CI — falhas nos testes não bloqueiam o pipeline | P1 | `.github/workflows/ci.yml` |
| DT-02 | Dockerfile sem ARG para `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` — build Docker não injeta variáveis de ambiente do frontend | P1 | `Dockerfile` |
| DT-03 | Ausência de pipeline CD versionado — deploy é manual via Coolify sem rastreabilidade | P1 | — |
| DT-04 | `mcp_connections` existe no SQL mas está ausente do `types.ts` gerado — acesso à tabela é feito sem tipagem | P2 | `src/integrations/supabase/types.ts` |
| DT-05 | Divergência `npm ci` (Docker) vs `npm install` (Nixpacks) — builds podem divergir | P2 | `nixpacks.toml`, `Dockerfile` |
| DT-06 | Dependências de URLs legadas (`*.lovable.app`, `meuvendedoronline.com.br`) em fallbacks de Edge Functions | P1 | `supabase/functions/` (várias) |
| DT-07 | `project_id = "kvhtradegsostrhtzdwn"` aponta para projeto Supabase legado em `config.toml` | P0 | `supabase/config.toml` |
| DT-08 | Cobertura de testes muito baixa — sem baseline de cobertura mínima definida | P2 | `src/test/` |
| DT-09 | Sem rotação programada de secrets — secrets podem estar desatualizados em produção | P1 | — |
| DT-10 | `supabase functions deploy` sem pipeline automatizado — funções são deployadas manualmente | P1 | — |

---

## 3. Plano de migração de infraestrutura

O projeto está operando em infraestrutura originalmente provisionada por terceiros (plataforma Lovable) e requer migração para ambiente próprio, seguro e auditável. Esta seção resume as fases do plano completo.

**Para a execução completa com checklists detalhados e critérios de saída por gate, consultar:**
- `docs/Arquivo/PLANO_ENTERPRISE_RECONSTRUCAO_INFRA_TOTAL.md`
- `docs/Arquivo/CHECKLIST_FINAL_ENTERPRISE_MIGRACAO_PRODUCAO.md`
- `docs/Arquivo/RUNBOOK_EXECUTIVO_CUTOVER_E_CHECKLIST_GO_LIVE.md`

### 3.1 Arquitetura alvo

| Camada | Tecnologia | Função |
|--------|-----------|--------|
| Edge / CDN / WAF | Cloudflare (DNS proxied, WAF, rate limit, TLS Full Strict) | DDoS, cache estático, ocultar IP de origem |
| Compute | VPS Linux (KVM) dedicada | Coolify + Docker Engine |
| Orquestração | Docker Compose gerenciado via Coolify | Evolution API, SPA, serviços auxiliares |
| Backend SaaS | Supabase **novo** projeto | PostgreSQL, Auth, Storage, Realtime, Edge Functions |
| WhatsApp | Evolution API nova instância (imagem pinada por digest) | Webhooks apenas para novo URL Supabase |
| Repositório | Git privado (org nova, MFA obrigatório) | Source of truth; branch protection |
| CI/CD | GitHub Actions com environments (staging / production) | Build + secrets por ambiente |
| Observabilidade | Uptime externo + métricas host + Sentry (frontend) | SLO e alertas |
| Segredos | Secrets por environment no GitHub / secrets Supabase | Sem literais no repositório |

### 3.2 Fases de migração

| Fase | Nome | Critério de saída |
|------|------|------------------|
| **F0** | Governação e inventário | RACI definido; inventário de segredos aprovado; matriz LGPD aprovada |
| **F1** | Git novo | Repo privado; branch protection; primeiro merge com 2 revisores |
| **F2** | Cloudflare / DNS | DNS propagado em staging; WAF rules baseline ativo |
| **F3** | VPS | SO instalado; hardening CIS nível 1; SSH só chave Ed25519 |
| **F4** | Docker | Engine + Compose plugin; logging driver configurado |
| **F5** | Coolify | Instalação limpa; HTTPS admin; MFA ativo; backup interno configurado |
| **F6** | Proxy/TLS | Certificados válidos; HSTS; SSL Labs grade A mínimo |
| **F7** | Supabase novo | Migrações aplicadas; RLS smoke tests verdes; `verify_jwt` revisado; secrets configurados |
| **F8** | Evolution nova | Instâncias novas; `EVO_KEY` forte gerada; webhooks apontando para novo URL; **código sem fallback legado** |
| **F9** | Observabilidade | Uptime checks; alertas ativos; dashboards básicos operacionais |
| **F10** | Backup/DR | RPO/RTO documentados; restore testado em sandbox; DR drill realizado |
| **F11** | Cutover | Plano de rollback documentado; janela de manutenção comunicada; legado em read-only por 30 dias |

### 3.3 Dependências de código a neutralizar antes do cutover

Os seguintes itens de código **devem ser corrigidos antes** do cutover para produção, independentemente das fases de infra:

1. Remover fallbacks `EVO_URL`/`EVO_KEY` hardcoded (V-CRIT-01)
2. Remover fallbacks de domínios `*.lovable.app` e `meuvendedoronline.com.br` em Edge Functions (DT-06)
3. Revisar `verify_jwt` por função conforme matriz documentada (V-CRIT-02)
4. Implementar validação HMAC no `asaas-webhook` (V-CRIT-03)
5. Corrigir políticas RLS em `ai_providers`/`ai_models` (V-CRIT-04)
6. Atualizar `supabase/config.toml` com o novo `project_id` (DT-07)
7. Atualizar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` para o novo projeto

---

## 4. Roadmap técnico

### Fase 0 — Urgente (antes de qualquer deploy em produção independente)

Itens que bloqueiam a operação segura do sistema. Executar antes de qualquer outro trabalho de produto.

| ID | Item | Prioridade |
|----|------|-----------|
| V-CRIT-01 | Remover credenciais Evolution hardcoded e rotacionar chave | P0 |
| V-CRIT-02 | Auditar e ativar `verify_jwt` por função conforme necessidade | P0 |
| V-CRIT-03 | Implementar validação HMAC + idempotência no `asaas-webhook` | P0 |
| V-CRIT-04 | Corrigir RLS de `ai_providers`/`ai_models` para restringir por `organization_id` | P0 |
| DT-07 | Vincular `supabase/config.toml` ao projeto de produção correto | P0 |
| DT-06 | Remover fallbacks de domínios legados das Edge Functions | P0 |
| F0–F3 | Governação, Git novo, Cloudflare, VPS (infra base) | P0 |

### Fase 1 — Consolidação (infra e segurança operacional)

Após Fase 0, estabelecer a base operacional sólida.

| ID | Item | Prioridade |
|----|------|-----------|
| DT-01 | Corrigir `continue-on-error` nos testes — testes devem bloquear CI | P1 |
| DT-02 | Adicionar ARG no Dockerfile para variáveis `VITE_*` | P1 |
| DT-03 | Implementar pipeline CD versionado (adaptar `github-actions-cd.example.yml`) | P1 |
| DT-09 | Implementar rotação periódica de secrets | P1 |
| DT-10 | Automatizar deploy de Edge Functions no pipeline CD | P1 |
| V-ALT-01 | Corrigir RLS com `USING (true)` em tabelas CRM/contatos | P1 |
| V-ALT-02 | Implementar validação de URL em `fireWebhookRules` (SSRF) | P1 |
| V-ALT-03 | Implementar validação de URL em `scrape-website` (SSRF) | P1 |
| V-ALT-04 | Corrigir fallback anon em `AgentChat.tsx` | P1 |
| V-ALT-05 | Remover `service_role` como credencial de transcrição no Telegram | P1 |
| F4–F8 | Docker, Coolify, Proxy, Supabase novo, Evolution nova | P1 |

### Fase 2 — Expansão de produto

Com infra estável, entregar novas funcionalidades de alto valor.

| Área | Item |
|------|------|
| Agentes | Suporte a mais provedores de IA (interface unificada já existe) |
| Integrações | Novos canais além de WhatsApp/Telegram (ex.: Instagram DM) |
| CRM | Automações mais sofisticadas; funil de vendas avançado |
| Conhecimento | Melhoria do pipeline RAG (chunking, re-ranking, feedback de relevância) |
| MCP | Ferramentas MCP adicionais para agentes |
| Relatórios | Dashboard analítico com métricas de conversas e conversão |
| Billing | Planos de crédito mais flexíveis; faturamento automático via Asaas |

### Fase 3 — Escala

| Área | Item |
|------|------|
| Multi-região | Supabase com read replicas; CDN para assets de conhecimento |
| Observabilidade | Distributed tracing end-to-end; APM para Edge Functions |
| Performance | Pré-computação de embeddings; cache de respostas de agentes |
| Segurança | SOC 2 readiness; pen test externo; DPIA formal (LGPD) |
| Produto | App mobile nativo (React Native) para operadores |

---

## 5. Backlog priorizado

Lista consolidada de itens executáveis, ordenada por prioridade. Para cada item marcar `[ ]` quando concluído.

### P0 — Bloqueante para produção segura

- [ ] **SEC-01** Remover credenciais Evolution hardcoded (`wuzapi-proxy`, `whatsapp-webhook`) e rotacionar chave na instância
- [ ] **SEC-02** Auditar cada uma das 31 Edge Functions e definir matriz `verify_jwt = true/false` com justificativa
- [ ] **SEC-03** Implementar validação HMAC no `asaas-webhook` + idempotência por `payment.id`
- [ ] **SEC-04** Corrigir política RLS de `ai_providers` e `ai_models` — filtrar por `organization_id`
- [ ] **INF-01** Atualizar `supabase/config.toml` com `project_id` do projeto de produção
- [ ] **INF-02** Remover todos os fallbacks de domínios legados (`*.lovable.app`, `meuvendedoronline.com.br`) das Edge Functions
- [ ] **INF-03** Provisionar VPS nova e executar hardening CIS nível 1
- [ ] **INF-04** Instalar e configurar Coolify com MFA e backup interno
- [ ] **INF-05** Criar projeto Supabase novo; aplicar migrações; validar RLS; configurar secrets
- [ ] **INF-06** Provisionar instância Evolution nova com `EVO_KEY` forte; atualizar webhooks

### P1 — Alta prioridade

- [ ] **CI-01** Remover `continue-on-error: true` dos testes no CI — testes devem bloquear pipeline
- [ ] **CI-02** Adicionar `ARG VITE_SUPABASE_URL` e `ARG VITE_SUPABASE_PUBLISHABLE_KEY` no `Dockerfile`
- [ ] **CI-03** Implementar pipeline CD versionado baseado em `infra/ci/github-actions-cd.example.yml`
- [ ] **CI-04** Integrar `npm audit --audit-level=high` no CI
- [ ] **SEC-05** Corrigir políticas RLS `USING (true)` em tabelas CRM/contatos
- [ ] **SEC-06** Validar URL antes de `fetch()` em `fireWebhookRules` (bloquear IPs privados e metadata)
- [ ] **SEC-07** Validar URL antes de `fetch()` em `scrape-website`
- [ ] **SEC-08** Corrigir fallback anon em `AgentChat.tsx` — exigir sessão antes de invocar funções com créditos
- [ ] **SEC-09** Remover `service_role` como argumento de transcrição em `telegram-webhook`
- [ ] **SEC-10** Restringir CORS para domínio de produção nas funções que processam dados de usuário
- [ ] **OPS-01** Implementar rotação periódica de todos os secrets (EVO_KEY, ASAAS_API_KEY, ELEVENLABS_API_KEY, GOOGLE_CLIENT_SECRET)
- [ ] **OPS-02** Automatizar deploy de Edge Functions como etapa do pipeline CD
- [ ] **OPS-03** Configurar uptime checks externos (ex.: BetterStack, UptimeRobot) para URL de produção e funções críticas
- [ ] **OPS-04** Configurar Sentry no frontend para captura de erros em produção

### P2 — Importante

- [ ] **SEC-11** Mascarar dados sensíveis em `console.log` do `asaas-webhook`
- [ ] **SEC-12** Adicionar usuário não-root no `Dockerfile` (`adduser` + `USER`)
- [ ] **SEC-13** Integrar scan de segredos no CI (ex.: `gitleaks`, `trufflehog`)
- [ ] **DT-01** Regenerar `types.ts` e confirmar que `mcp_connections` está tipada; corrigir se ausente
- [ ] **DT-02** Alinhar Nixpacks para usar `npm ci` em vez de `npm install`
- [ ] **TEST-01** Definir baseline de cobertura mínima (ex.: 50% crítico) e enforçar no CI
- [ ] **TEST-02** Ampliar cobertura de testes para fluxos críticos: auth, billing, webhook WhatsApp
- [ ] **DOC-01** Documentar matriz de `verify_jwt` por função (resultado de SEC-02) neste arquivo

### P3 — Posterior / roadmap

- [ ] **PROD-01** Suporte a canais adicionais (Instagram DM, webchat embeddable v2)
- [ ] **PROD-02** Melhoria do pipeline RAG — re-ranking, feedback de relevância, chunking adaptativo
- [ ] **PROD-03** Dashboard analítico de conversas e taxa de resolução por agente
- [ ] **PROD-04** MFA para login de usuários finais (TOTP)
- [ ] **PROD-05** App mobile nativo para operadores (React Native)
- [ ] **COMP-01** DPIA formal conforme LGPD para processamento de mensagens WhatsApp/Telegram
- [ ] **COMP-02** Documentar base legal para cada subcontratante (OpenAI, ElevenLabs, Asaas, Evolution)
- [ ] **COMP-03** Implementar política de retenção e expurgo de dados por tabela

---

## 6. Referências de segredos conhecidos a rotacionar

Antes do cutover para produção independente, os seguintes segredos devem ser rotacionados (gerados do zero na nova infraestrutura). **Nunca reutilizar valores do ambiente legado.**

| Secret | Onde gerar / rotacionar |
|--------|------------------------|
| `EVO_KEY` | Painel da instância Evolution nova |
| `ASAAS_API_KEY` | Dashboard Asaas → API Keys |
| `ASAAS_WEBHOOK_TOKEN` | Dashboard Asaas → Webhooks |
| `ELEVENLABS_API_KEY` | Dashboard ElevenLabs → API Keys |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console — novo OAuth2 client |
| `TELEGRAM_WEBHOOK_SECRET` | Gerar string aleatória longa; registrar via `setWebhook` com `secret_token` |
| `SUPABASE_SERVICE_ROLE_KEY` | Obtido do novo projeto Supabase |
| `SUPABASE_ANON_KEY` | Obtido do novo projeto Supabase |
| `VITE_SUPABASE_URL` | URL do novo projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key do novo projeto Supabase |

Para inventário completo com localização atual de cada secret, consultar `docs/Arquivo/AUDITORIA_VARIAVEIS_SEGREDOS_COMPLETA.md`.

1. Este backlog é a base operacional do desenvolvimento do sistema Sindiflow.
2. A ordem dos épicos respeita as dependências técnicas e de produto.
3. Nenhuma tarefa de fase posterior deve bloquear o MVP.
4. Tudo que envolver integrações externas deve entrar apenas depois do domínio principal estar estável.
5. Cada tarefa só pode ser considerada concluída quando atender os critérios de aceite definidos neste documento.

---

## 2. Convenções

### Prioridade

- `P0`: bloqueante para início ou MVP
- `P1`: alta prioridade dentro da fase atual
- `P2`: importante, mas não bloqueante
- `P3`: posterior

### Status inicial

Todas as tarefas deste documento começam implicitamente como `todo`.

### Tipos

- `infra`
- `backend`
- `frontend`
- `data`
- `qa`
- `produto-tecnico`

---

## 3. Ordem macro de execução

### Fase A. Fundação

1. ambiente
2. backend core
3. frontend base
4. autenticação
5. banco e migrations

### Fase B. Núcleo funcional

1. admin
2. financeiro
3. dashboard
4. jornada do morador

### Fase C. Operação do condomínio

1. manutenção
2. facilities
3. ocorrências
4. comunicados
5. notificações

### Fase D. Expansão

1. contas a pagar
2. relatórios
3. assembleias
4. portaria
5. integrações bancárias

### Fase E. Escala

1. observabilidade avançada
2. backup
3. app nativo
4. IA assistiva

---

## 4. Épicos e tarefas

## EPIC-00: Bootstrap do Novo Produto

**Objetivo:** criar a nova base do projeto sem depender estruturalmente da codebase antiga.

**Dependências:** nenhuma

### Tarefas

#### BT-001 — Definir estrutura física do repositório
- Tipo: `infra`
- Prioridade: `P0`
- Entregáveis:
  - pasta [frontend](/opt/unicomunitaria/docker/sistema-de-condominios/frontend)
  - reorganização planejada de [backend](/opt/unicomunitaria/docker/sistema-de-condominios/backend) para o novo padrão modular
  - estrutura `core/`, `modules/`, `tests/`, `scripts/`
- Critérios de aceite:
  - estrutura final do repositório refletida no código real
  - a nova estrutura não depende de `services/` ou `apps/web` para funcionar

#### BT-002 — Criar documento de setup inicial do ambiente
- Tipo: `produto-tecnico`
- Prioridade: `P0`
- Entregáveis:
  - instruções de bootstrap local
  - fluxo de variáveis de ambiente
  - comandos de migração e execução
- Critérios de aceite:
  - qualquer dev consegue subir ambiente local com instruções únicas

#### BT-003 — Criar `.env.example` da nova versão
- Tipo: `infra`
- Prioridade: `P0`
- Dependências: `BT-001`
- Entregáveis:
  - variáveis de app
  - db
  - redis
  - jwt
  - email
  - WhatsApp
- Critérios de aceite:
  - todas as variáveis obrigatórias documentadas
  - nenhum segredo inseguro hardcoded

---

## EPIC-01: Infraestrutura de Desenvolvimento e Deploy Inicial

**Objetivo:** ter um ambiente reproduzível e leve para desenvolvimento e staging.

**Dependências:** `BT-001`, `BT-003`

### Tarefas

#### INF-001 — Criar `docker-compose.staging.yml`
- Tipo: `infra`
- Prioridade: `P0`
- Entregáveis:
  - postgres
  - redis
  - backend
  - frontend
- Critérios de aceite:
  - ambiente sobe com um comando
  - todos os serviços têm healthcheck mínimo quando aplicável

#### INF-002 — Criar Dockerfile do novo backend
- Tipo: `infra`
- Prioridade: `P0`
- Dependências: `INF-001`
- Critérios de aceite:
  - build funciona localmente
  - imagem roda com usuário não-root

#### INF-003 — Criar Dockerfile do novo frontend
- Tipo: `infra`
- Prioridade: `P0`
- Dependências: `INF-001`
- Critérios de aceite:
  - build funciona localmente
  - dev e build de produção suportados

#### INF-004 — Criar scripts de setup e reset de ambiente
- Tipo: `infra`
- Prioridade: `P1`
- Dependências: `INF-001`
- Entregáveis:
  - `scripts/setup.sh`
  - `scripts/reset-db.sh`
  - `scripts/run-dev.sh`
- Critérios de aceite:
  - ambiente pode ser recriado com previsibilidade

---

## EPIC-02: Backend Core

**Objetivo:** estabelecer a espinha dorsal do backend modular.

**Dependências:** `INF-001`, `INF-002`

### Tarefas

#### CORE-001 — Inicializar FastAPI da nova aplicação
- Tipo: `backend`
- Prioridade: `P0`
- Entregáveis:
  - `main.py`
  - ciclo de vida da aplicação
  - registro de routers por módulo
- Critérios de aceite:
  - app sobe sem erro
  - rota `/health/live` responde

#### CORE-002 — Implementar `config.py` com Pydantic Settings
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `CORE-001`
- Critérios de aceite:
  - settings validados na inicialização
  - segredos obrigatórios sem default inseguro

#### CORE-003 — Implementar banco assíncrono com SQLAlchemy 2.0 Async
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `CORE-002`
- Critérios de aceite:
  - `AsyncSession` funcional
  - conexão com PostgreSQL validada por teste simples

#### CORE-004 — Configurar Alembic como única fonte de evolução do schema
- Tipo: `data`
- Prioridade: `P0`
- Dependências: `CORE-003`
- Critérios de aceite:
  - ambiente de migrations funcional
  - comando de upgrade aplica migrations sem uso de `create_all`

#### CORE-005 — Padronizar resposta e tratamento de erro da API
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `CORE-001`
- Critérios de aceite:
  - erros retornam payload padronizado
  - paginação padronizada disponível para listagens

#### CORE-006 — Implementar middlewares essenciais
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `CORE-001`
- Escopo:
  - security headers
  - correlation id
  - audit log
  - rate limit
- Critérios de aceite:
  - headers de segurança presentes
  - request id disponível nos logs

#### CORE-007 — Implementar logging JSON
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `CORE-006`
- Critérios de aceite:
  - logs estruturados em ambiente local e staging

#### CORE-008 — Implementar health checks e readiness
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `CORE-003`
- Critérios de aceite:
  - endpoints de saúde verificam app, db e redis

#### CORE-009 — Implementar módulo de storage com filesystem local
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `CORE-001`
- Escopo:
  - interface `StorageProvider` em `core/storage/`
  - implementação `LocalStorageProvider` (filesystem + volume Docker)
  - configuração `max_upload_size_mb` no `config.py`
  - endpoint genérico de serve de arquivos
- Critérios de aceite:
  - upload e download funcionais
  - módulos de domínio usam interface, não acessam filesystem diretamente
  - volume mapeado no docker-compose

---

## EPIC-03: Autenticação, Autorização e Tenancy

**Objetivo:** garantir identidade, papéis e isolamento por condomínio.

**Dependências:** `CORE-002`, `CORE-003`, `CORE-006`

### Tarefas

#### AUTH-001 — Modelar usuário, papel e vínculo com condomínio
- Tipo: `backend`
- Prioridade: `P0`
- Critérios de aceite:
  - modelo contempla `admin`, `sindico`, `morador`, `funcionario`
  - vínculo com `condominio_id` disponível

#### AUTH-002 — Implementar login com JWT e refresh token
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `AUTH-001`
- Critérios de aceite:
  - login retorna access token e refresh token
  - refresh funciona

#### AUTH-003 — Implementar hash de senha com bcrypt
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `AUTH-001`
- Critérios de aceite:
  - criação e verificação de senha testadas

#### AUTH-004 — Implementar dependências de autorização por papel
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `AUTH-002`
- Critérios de aceite:
  - rotas podem exigir papéis específicos

#### AUTH-005 — Implementar enforcement de multi-tenancy
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `AUTH-002`
- Critérios de aceite:
  - todas as queries dos módulos centrais filtram `condominio_id`
  - testes cobrem vazamento cross-tenant

#### AUTH-006 — Implementar recuperação e troca de senha
- Tipo: `backend`
- Prioridade: `P2`
- Dependências: `AUTH-002`, `NOTIF-002`

#### AUTH-007 — Implementar auto-registro de morador
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `AUTH-001`, `ADM-005`
- Escopo:
  - endpoint público de registro (`POST /auth/register`)
  - criação de `Usuario` com status `pendente`
  - match automático por CPF se pré-cadastrado pelo síndico
  - fluxo de aprovação/rejeição de vínculo pelo síndico
  - endpoints: `GET /admin/vinculos-pendentes`, `POST /admin/vinculos/{id}/aprovar`, `POST /admin/vinculos/{id}/rejeitar`
- Critérios de aceite:
  - morador consegue se registrar sem intervenção do síndico
  - CPF pré-cadastrado gera vínculo automático
  - CPF não cadastrado gera solicitação pendente visível ao síndico
  - morador pendente não acessa funcionalidades protegidas
  - testes cobrem ambos os fluxos (match e pendente)

---

## EPIC-04: Frontend Base e Jornada Mobile-First

**Objetivo:** criar a aplicação web principal com foco forte na experiência do morador e do síndico.

**Dependências:** `INF-003`, `AUTH-002`

### Tarefas

#### FE-001 — Inicializar projeto Next.js 16 + TypeScript
- Tipo: `frontend`
- Prioridade: `P0`
- Critérios de aceite:
  - app sobe localmente
  - App Router configurado

#### FE-002 — Configurar Tailwind, shadcn/ui e design tokens
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FE-001`
- Critérios de aceite:
  - sistema visual básico pronto
  - componentes base disponíveis

#### FE-003 — Configurar client HTTP, React Query e auth store
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FE-001`, `AUTH-002`
- Critérios de aceite:
  - autenticação persistida
  - interceptação de token e refresh operando

#### FE-004 — Criar layout do síndico
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FE-002`
- Critérios de aceite:
  - sidebar
  - header
  - navegação protegida

#### FE-005 — Criar layout do morador mobile-first
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FE-002`
- Critérios de aceite:
  - navegação otimizada para celular
  - primeira dobra útil em telas de 375px+

#### FE-006 — Criar fluxo de login
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FE-003`
- Critérios de aceite:
  - login funcional com tratamento de erro e loading

#### FE-007 — Implementar guards de rota por perfil
- Tipo: `frontend`
- Prioridade: `P1`
- Dependências: `FE-003`, `FE-006`

#### FE-008 — Garantir experiência PWA inicial
- Tipo: `frontend`
- Prioridade: `P1`
- Dependências: `FE-005`
- Escopo:
  - manifest
  - ícones
  - configuração inicial para instalação
- Critérios de aceite:
  - app instalável em dispositivos suportados

---

## EPIC-05: Módulo Admin

**Objetivo:** entregar a fundação cadastral e a relação síndico <-> morador.

**Dependências:** `CORE-004`, `AUTH-005`, `FE-004`, `FE-005`

### Tarefas backend

#### ADM-001 — Modelar entidades `Condominio`, `Unidade`, `Morador`, `Usuario`
- Tipo: `data`
- Prioridade: `P0`
- Critérios de aceite:
  - modelos e migrations criados
  - constraints de domínio aplicadas

#### ADM-002 — Criar repositórios e serviços do módulo admin
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `ADM-001`

#### ADM-003 — Implementar CRUD de condomínios
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `ADM-002`

#### ADM-004 — Implementar CRUD de unidades
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `ADM-002`

#### ADM-005 — Implementar CRUD de moradores
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `ADM-002`

#### ADM-006 — Implementar vínculo usuário <-> morador
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `ADM-005`, `AUTH-001`

#### ADM-007 — Implementar validações de CPF, CNPJ e placa
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `ADM-001`

### Tarefas frontend

#### ADM-008 — Criar telas de condomínio, unidades e moradores para síndico
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `ADM-003`, `ADM-004`, `ADM-005`

#### ADM-009 — Criar visão do morador com perfil e unidade
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `ADM-006`, `FE-005`

### QA

#### ADM-010 — Cobrir módulo admin com testes de rota, serviço e tenancy
- Tipo: `qa`
- Prioridade: `P0`
- Dependências: `ADM-003`, `ADM-004`, `ADM-005`

---

## EPIC-06: Módulo Financeiro do MVP

**Objetivo:** entregar o núcleo financeiro real do sistema sem depender de banco no primeiro ciclo.

**Dependências:** `ADM-001`, `AUTH-005`, `FE-004`, `FE-005`

### Tarefas backend

#### FIN-001 — Modelar entidades financeiras principais
- Tipo: `data`
- Prioridade: `P0`
- Escopo:
  - `ContaCondominio`
  - `TaxaCondominial`
  - `Cobranca`
  - `Pagamento`
  - `LancamentoFinanceiro`
  - `CategoriaFinanceira`
- Critérios de aceite:
  - migrations aplicadas
  - unique constraints por competência e unidade

#### FIN-002 — Implementar serviço de geração mensal de cobranças
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FIN-001`
- Critérios de aceite:
  - geração por competência
  - prevenção de duplicidade

#### FIN-003 — Implementar baixa manual e semiautomática de pagamentos
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FIN-001`
- Critérios de aceite:
  - pagamento liquida cobrança
  - lançamento financeiro correspondente gerado

#### FIN-004 — Implementar cálculo de multa, juros e atraso
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FIN-001`

#### FIN-005 — Implementar indicadores de inadimplência
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FIN-002`, `FIN-003`, `FIN-004`

#### FIN-006 — Implementar comprovante e recibo
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `FIN-003`

#### FIN-007 — Criar contratos de integração futura
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `FIN-001`
- Escopo:
  - `BoletoProvider`
  - `PixProvider`
  - `BankReconciliationProvider`

### Tarefas frontend

#### FIN-008 — Criar tela do síndico para cobranças
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FIN-002`

#### FIN-009 — Criar tela do síndico para pagamentos e inadimplência
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FIN-003`, `FIN-005`

#### FIN-010 — Criar visão do morador para cobranças e recibos
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FIN-006`, `FE-005`

### QA

#### FIN-011 — Testar regras financeiras centrais
- Tipo: `qa`
- Prioridade: `P0`
- Dependências: `FIN-002`, `FIN-003`, `FIN-004`, `FIN-005`
- Escopo:
  - duplicidade
  - atraso
  - baixa
  - tenancy

---

## EPIC-07: Dashboard Inicial

**Objetivo:** dar visão executiva simples para o síndico e visão pessoal para o morador.

**Dependências:** `ADM-008`, `FIN-009`

### Tarefas

#### DASH-001 — Implementar endpoint de resumo do síndico
- Tipo: `backend`
- Prioridade: `P0`
- Critérios de aceite:
  - total previsto
  - total recebido
  - inadimplência
  - chamados abertos
  - reservas próximas

#### DASH-002 — Implementar endpoint de resumo do morador
- Tipo: `backend`
- Prioridade: `P0`
- Critérios de aceite:
  - cobranças pendentes
  - reservas futuras
  - chamados abertos
  - comunicados recentes

#### DASH-003 — Criar dashboard do síndico
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `DASH-001`

#### DASH-004 — Criar home mobile do morador
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `DASH-002`

---

## EPIC-08: Módulo Manutenção

**Objetivo:** resolver abertura e tratamento de solicitações operacionais.

**Dependências:** `ADM-009`, `DASH-004`

### Tarefas backend

#### MAN-001 — Modelar entidades de manutenção
- Tipo: `data`
- Prioridade: `P0`
- Escopo:
  - `SolicitacaoManutencao`
  - `OrdemServico`
  - `CategoriaServico`
  - `Fornecedor`
  - `TimelineEvento`

#### MAN-002 — Implementar abertura de solicitação pelo morador
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `MAN-001`

#### MAN-003 — Implementar triagem e geração de OS
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `MAN-002`

#### MAN-004 — Implementar mudança de status e timeline
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `MAN-003`

#### MAN-005 — Preparar vínculo opcional com financeiro
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `MAN-003`, `FIN-001`

### Tarefas frontend

#### MAN-006 — Criar abertura de chamado no portal do morador
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `MAN-002`

#### MAN-007 — Criar listagem e gestão de OS para síndico
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `MAN-003`, `MAN-004`

#### MAN-008 — Criar acompanhamento de chamado no mobile do morador
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `MAN-004`

### QA

#### MAN-009 — Testar fluxo completo de solicitação -> OS -> conclusão
- Tipo: `qa`
- Prioridade: `P0`
- Dependências: `MAN-004`

---

## EPIC-09: Módulo Facilities

**Objetivo:** controlar áreas comuns e reservas.

**Dependências:** `ADM-009`

### Tarefas backend

#### FAC-001 — Modelar áreas comuns e reservas
- Tipo: `data`
- Prioridade: `P0`

#### FAC-002 — Implementar regras configuráveis de reserva
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FAC-001`

#### FAC-003 — Implementar validação de conflito de reservas
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `FAC-001`

#### FAC-004 — Implementar fluxo de aprovação manual/automática
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `FAC-002`, `FAC-003`

### Tarefas frontend

#### FAC-005 — Criar tela do síndico para cadastro de áreas comuns
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FAC-001`

#### FAC-006 — Criar agenda de disponibilidade para o morador
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FAC-003`

#### FAC-007 — Criar fluxo de reserva mobile-first
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `FAC-002`, `FAC-003`

### QA

#### FAC-008 — Testar conflitos, aprovação e limites de reserva
- Tipo: `qa`
- Prioridade: `P0`
- Dependências: `FAC-004`

---

## EPIC-10: Módulo Ocorrências

**Objetivo:** registrar incidentes do condomínio sem acoplamento com segurança eletrônica.

**Dependências:** `ADM-009`

### Tarefas

#### OCO-001 — Modelar ocorrência, categoria, tratativa e anexos
- Tipo: `data`
- Prioridade: `P1`

#### OCO-002 — Implementar registro de ocorrência
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `OCO-001`

#### OCO-003 — Implementar atualização de status e tratativa
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `OCO-002`

#### OCO-004 — Criar telas de ocorrência para síndico e morador
- Tipo: `frontend`
- Prioridade: `P1`
- Dependências: `OCO-002`, `OCO-003`

#### OCO-005 — Cobrir ocorrência com testes mínimos
- Tipo: `qa`
- Prioridade: `P1`
- Dependências: `OCO-003`

---

## EPIC-11: Módulo Social e Comunicados

**Objetivo:** criar a base de comunicação do condomínio.

**Dependências:** `ADM-009`, `FE-005`

### Tarefas backend

#### SOC-001 — Modelar comunicado e notificações registradas
- Tipo: `data`
- Prioridade: `P0`

#### SOC-002 — Implementar CRUD de comunicados
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `SOC-001`

#### SOC-003 — Implementar segmentação por todos, bloco e unidade
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `SOC-002`

### Tarefas frontend

#### SOC-004 — Criar gestão de comunicados para síndico
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `SOC-002`

#### SOC-005 — Criar feed de comunicados do morador
- Tipo: `frontend`
- Prioridade: `P0`
- Dependências: `SOC-002`, `FE-005`

### QA

#### SOC-006 — Testar publicação, segmentação e visualização
- Tipo: `qa`
- Prioridade: `P0`
- Dependências: `SOC-003`

---

## EPIC-12: Notificações por E-mail e WhatsApp

**Objetivo:** implementar os dois canais oficiais do MVP.

**Dependências:** `SOC-002`, `FIN-006`, `INF-001`

### Tarefas backend

#### NOTIF-001 — Criar módulo de notificações com contrato por canal
- Tipo: `backend`
- Prioridade: `P0`
- Critérios de aceite:
  - interface unificada disponível
  - domínio não depende de SDK externo

#### NOTIF-002 — Implementar provider de e-mail
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `NOTIF-001`

#### NOTIF-003 — Implementar provider de WhatsApp (log-only no MVP)
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `NOTIF-001`
- Nota: No MVP, a implementação é log-only (registra em log a mensagem que seria enviada). A interface abstrata garante que toda lógica de domínio já defina quando e o quê notificar por WhatsApp. O provider real será conectado quando um fornecedor for definido, sem retrabalho.
- Critérios de aceite:
  - provider implementa a interface `NotificationChannel`
  - mensagens são registradas em log estruturado com destinatário, template e payload
  - domínio não tem conhecimento de que o envio é simulado

#### NOTIF-004 — Implementar fila leve para envio assíncrono
- Tipo: `backend`
- Prioridade: `P0`
- Dependências: `NOTIF-002`
- Nota: NOTIF-003 (WhatsApp log-only) é P1 e pode ser integrado à fila depois, sem bloquear este item.

#### NOTIF-005 — Implementar registro de entrega, falha e retry
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `NOTIF-004`

#### NOTIF-006 — Disparar notificações a partir de eventos de domínio
- Tipo: `backend`
- Prioridade: `P1`
- Dependências: `SOC-002`, `FIN-006`, `MAN-004`, `NOTIF-004`

### QA

#### NOTIF-007 — Testar envio, fallback e reprocessamento
- Tipo: `qa`
- Prioridade: `P1`
- Dependências: `NOTIF-005`

---

## EPIC-13: Qualidade, Testes e Seeds

**Objetivo:** reduzir regressão e acelerar desenvolvimento local.

**Dependências:** `CORE-004`, `FE-001`

### Tarefas

#### QA-001 — Criar factories e fixtures de backend
- Tipo: `qa`
- Prioridade: `P0`

#### QA-002 — Criar seeds de demo para condomínio piloto
- Tipo: `data`
- Prioridade: `P0`
- Dependências: `ADM-001`, `FIN-001`, `MAN-001`, `FAC-001`, `SOC-001`
- Escopo do seed:
  - 1 condomínio com 2 blocos (A e B)
  - ~10 unidades distribuídas entre os blocos (6 no bloco A, 4 no bloco B)
  - ~15 moradores (mix de proprietários, inquilinos e dependentes)
  - 1 síndico vinculado ao condomínio
  - 1 funcionário (zelador)
  - 3 meses de cobranças (com registros pagos, pendentes e vencidos)
  - ~5 solicitações de manutenção em status variados (aberta, em andamento, concluída)
  - 3 áreas comuns cadastradas (salão de festas, churrasqueira, quadra)
  - ~4 reservas (aprovadas, pendentes, passadas)
  - ~5 comunicados de exemplo (aviso, emergência, informativo)
- Critérios de aceite:
  - seed executável por comando único (`python -m scripts.seed` ou equivalente)
  - seed é idempotente (pode ser reexecutado sem duplicar dados)
  - todos os perfis de usuário representados com senhas conhecidas para testes
  - dados coerentes entre si (cobrança referencia unidades reais, etc.)

#### QA-003 — Configurar testes de integração backend
- Tipo: `qa`
- Prioridade: `P0`

#### QA-004 — Configurar Vitest e Testing Library no frontend
- Tipo: `qa`
- Prioridade: `P1`
- Dependências: `FE-001`

#### QA-005 — Configurar Playwright para jornadas críticas
- Tipo: `qa`
- Prioridade: `P1`
- Dependências: `FE-006`
- Jornadas mínimas:
  - login
  - geração de cobrança
  - pagamento
  - abertura de chamado
  - reserva
  - publicação de comunicado

---

## EPIC-14: Relatórios e Expansão Administrativa

**Objetivo:** ampliar a capacidade operacional após estabilizar o MVP.

**Dependências:** `FIN-011`, `NOTIF-006`

### Tarefas

#### EXP-001 — Implementar contas a pagar
- Tipo: `backend`
- Prioridade: `P2`

#### EXP-002 — Implementar fluxo de caixa e demonstrativos
- Tipo: `backend`
- Prioridade: `P2`

#### EXP-003 — Implementar geração de PDF para recibos e relatórios
- Tipo: `backend`
- Prioridade: `P2`

#### EXP-004 — Criar telas de contas a pagar e fluxo de caixa
- Tipo: `frontend`
- Prioridade: `P2`

#### EXP-005 — Implementar assembleias básicas
- Tipo: `backend`
- Prioridade: `P2`

#### EXP-006 — Implementar portaria básica
- Tipo: `backend`
- Prioridade: `P2`

---

## EPIC-15: Integrações Bancárias Futuras

**Objetivo:** adicionar automação financeira sem acoplar o núcleo do produto.

**Dependências:** `FIN-007`, `EXP-002`

### Tarefas

#### BANK-001 — Escolher fornecedor bancário ou gateway
- Tipo: `produto-tecnico`
- Prioridade: `P3`

#### BANK-002 — Implementar emissão de boleto real
- Tipo: `backend`
- Prioridade: `P3`
- Dependências: `BANK-001`

#### BANK-003 — Implementar Pix
- Tipo: `backend`
- Prioridade: `P3`
- Dependências: `BANK-001`

#### BANK-004 — Implementar conciliação automática
- Tipo: `backend`
- Prioridade: `P3`
- Dependências: `BANK-001`

---

## 5. Backlog mínimo do MVP

O MVP só pode começar desenvolvimento funcional depois de concluir estes itens:

1. `BT-001`
2. `BT-003`
3. `INF-001`
4. `CORE-001`
5. `CORE-002`
6. `CORE-003`
7. `CORE-004`
8. `AUTH-001`
9. `AUTH-002`
10. `FE-001`
11. `FE-002`
12. `FE-003`
13. `FE-004`
14. `FE-005`

O MVP funcional inicial deve obrigatoriamente concluir:

1. `ADM-001` até `ADM-010`
2. `FIN-001` até `FIN-011`
3. `DASH-001` até `DASH-004`
4. `MAN-001` até `MAN-009`
5. `FAC-001` até `FAC-008`
6. `SOC-001` até `SOC-006`
7. `NOTIF-001` até `NOTIF-006`

---

## 6. Dependências críticas

1. Sem `CORE-004`, nenhum módulo deve criar tabela fora de migration.
2. Sem `AUTH-005`, nenhum módulo de domínio está apto para produção.
3. Sem `FE-005`, a prioridade de experiência do morador não está atendida.
4. Sem `FIN-003`, o produto ainda não resolve o ciclo financeiro mínimo.
5. Sem `NOTIF-003`, a relação síndico <-> morador fica incompleta para o MVP definido.

---

## 7. Critério de pronto por tarefa

Cada tarefa deve atender todos os itens abaixo, quando aplicável:

1. código implementado
2. testes mínimos cobrindo o comportamento crítico
3. logs e erros coerentes
4. controle de permissão aplicado
5. filtro por `condominio_id` aplicado
6. documentação técnica atualizada se a tarefa alterar contrato relevante
7. interface concluída, quando a tarefa incluir frontend

---

## 8. Recomendação de execução imediata

A melhor sequência para iniciar o desenvolvimento é:

1. `BT-001`, `BT-003`
2. `INF-001` até `INF-004`
3. `CORE-001` até `CORE-008`
4. `AUTH-001` até `AUTH-005`
5. `FE-001` até `FE-006`
6. `ADM-001` até `ADM-010`
7. `FIN-001` até `FIN-011`
8. `DASH-001` até `DASH-004`
9. `MAN-001` até `MAN-009`
10. `FAC-001` até `FAC-008`
11. `SOC-001` até `SOC-006`
12. `NOTIF-001` até `NOTIF-006`

Essa sequência mantém o produto centrado no que foi definido como núcleo real: síndico, morador, financeiro, comunicação e operação do condomínio.
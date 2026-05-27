# Auditoria de segurança — relatório técnico

**Projeto:** `hapitech-main`  
**Escopo:** código-fonte (`src/`, `supabase/`), config (`supabase/config.toml`, `Dockerfile`), CI (`.github/workflows/ci.yml`).  
**Metodologia:** revisão estática (grep, leitura de handlers), sem pentest dinâmico.  
**Dependências npm:** execução de `npm audit` recomendada em ambiente com rede — **não** concluída neste relatório por limitação de sandbox/rede.

---

## 1. Resumo executivo

Foram identificadas **vulnerabilidades e decisões de desenho de risco elevado a crítico**, nomeadamente:

1. **`verify_jwt = false`** para dezenas de Edge Functions em `supabase/config.toml` — a gateway Supabase **não exige JWT**; toda a autorização depende de código manual por função (erros = superfície pública).
2. **Credenciais Evolution API em texto plano** no repositório (`wuzapi-proxy`, `whatsapp-webhook`) — **crítico** para takeover do canal WhatsApp e infra legada.
3. **Webhook Asaas** sem validação aparente de assinatura/token no handler analisado — risco de **manipulação de estado financeiro** se o endpoint URL vazar ou for enumerável.
4. **Políticas RLS permissivas** `USING (true)` / `WITH CHECK (true)` em tabelas sensíveis (ex.: dados CRM/custom fields, **leitura global de `ai_providers`/`ai_models`**) — exposição de **chaves API de IA** a qualquer utilizador autenticado conforme migrações.
5. **CORS `Access-Control-Allow-Origin: *`** na maioria das Edge Functions — facilita abuso cross-origin de endpoints já públicos.
6. **SSRF:** `fireWebhookRules` em `whatsapp-webhook` faz `fetch` para URLs **controladas por dados na BD**; `scrape-website` faz `fetch(url)` após autenticação — vetores SSRF **internos/cloud metadata**.
7. **Frontend:** fallback do token para **`VITE_SUPABASE_PUBLISHABLE_KEY`** em `AgentChat.tsx` — pode permitir chamadas como “anon” onde se esperava JWT de utilizador.
8. **Telegram:** uso de **`SUPABASE_SERVICE_ROLE_KEY`** como fallback para transcrever áudio quando `LOVABLE_API_KEY` falta — anti‑padrão de segurança extremamente grave se valor incorreto for passado a API externa.

**Classificação global de exposição:** **ALTA** até correções prioritárias (JWT nas functions, rotação segredos, RLS restritivo nas chaves IA, validação webhooks financeiros).

---

## 2. Vulnerabilidades críticas

### V-CRIT-01 — Segredo Evolution API hardcoded

| # | Campo | Detalhe |
|---|--------|---------|
| 1 | Nome | API Key Evolution em código-fonte |
| 2 | Tipo | CWE-798 (credenciais embutidas) |
| 3 | Severidade | **CRÍTICO** |
| 4 | Impacto técnico | Qualquer leitor do repo ou artefacto de build pode usar a mesma instância Evolution |
| 5 | Impacto operacional | Impossível garantir confidencialidade do canal WhatsApp |
| 6 | Impacto financeiro | Abuso de envio de mensagens/custo infra |
| 7 | Impacto LGPD | Mensagens de titulares acessíveis via API comprometida |
| 8 | Impacto segurança | Controlo total da integração WhatsApp da organização legada |
| 9 | Impacto takeover | **Sim** — cliente Evolution pode ser operado por terceiros |
| 10 | Continuidade | Migração obrigatória de chaves e URL |
| 11 | Ficheiros | `supabase/functions/wuzapi-proxy/index.ts` L39–41 (fallback URL + key literal); `whatsapp-webhook/index.ts` constantes ~L9–10 e uso L1332+ |
| 12 | Fluxo | Proxy WhatsApp → Evolution HTTP |
| 13 | Facilidade | **Trivial** — clone do repo |
| 14 | Risco real | **Muito alto** |
| 15 | Correção | Remover literais; obrigar `EVO_*` nos secrets; rotacionar chave na Evolution; auditoria de logs de acesso |
| 16 | Prioridade | **P0** |

### V-CRIT-02 — Desativação de verificação JWT na gateway (verify_jwt = false)

| 1 | Nome | JWT não validado na entrada das Functions nomeadas |
| 2 | Tipo | Falha de controlo de acesso / configuração insegura |
| 3 | Severidade | **CRÍTICO** |
| 11 | Ficheiros | `supabase/config.toml` — todas as entradas `[functions.*] verify_jwt = false` (L3–85) |
| 12 | Fluxo | Qualquer cliente HTTP pode invocar URL da function; autorização só se implementada corretamente **dentro** do handler |
| 14 | Risco real | Funções sem validação manual (`widget-chat`, webhooks) ficam **totalmente públicos** na URL pública |
| 15 | Correção | Por função: ativar `verify_jwt = true` onde adequado; para webhooks usar segredo compartilhado/HMAC no corpo ou header; manter `false` só com mitigação forte documentada |
| 16 | Prioridade | **P0** |

### V-CRIT-03 — Webhook Asaas sem validação de assinatura (evidência no handler)

| 1 | Nome | Possível falsificação de webhook de pagamento |
| 2 | Tipo | Integridade / autenticação de mensagem ausente |
| 3 | Severidade | **CRÍTICO** (financeiro) |
| 11 | Ficheiros | `supabase/functions/asaas-webhook/index.ts` — processa JSON `event`/`payment` sem verificação de assinatura nas linhas analisadas (L14–75) |
| 4–10 | Impactos | Alteração de estado de subscrição, notificações, `organizations.subscription_status` — fraude/negócio |
| 15 | Correção | Validar token secreto do Asaas no header/query conforme documentação Asaas; lista branca IP se aplicável; idempotência por `payment.id` |
| 16 | Prioridade | **P0** |

### V-CRIT-04 — RLS: leitura global de `ai_providers` / `ai_models` (chaves API)

| 1 | Nome | Exposição de chaves de API de IA na BD via política permissiva |
| 2 | Tipo | CWE-200 / autorização fraca |
| 3 | Severidade | **CRÍTICO** |
| 11 | Ficheiros | `supabase/migrations/20260301215513_create_hapitech_core_schema_v2.sql` L824–825 `FOR SELECT USING (true)` em `ai_providers` e `ai_models`; similar em `20260301221950_restore_hapitech_core_schema.sql` L710–711 |
| 4 | Impacto técnico | Qualquer role que consiga `SELECT` sob RLS (tipicamente autenticado) pode ler **`api_key`** de providers |
| 7 | LGPD | Indireto — dados podem incluir metadados de integração |
| 9 | Takeover | Uso abusivo de quotas OpenAI/Anthropic em nome do cliente |
| 15 | Correção | Políticas por `organization_id` / membro; nunca `USING (true)` para tabela com segredos; colunas sensíveis apenas via Edge Function |
| 16 | Prioridade | **P0** |

---

## 3. Vulnerabilidades altas

### V-ALT-01 — Políticas `USING (true)` em tabelas de dados CRM/contactos

| 3 | Severidade | **ALTO** |
| 11 | Ficheiros | Ex.: `20260228164156_f5bb9393-e47e-402c-973f-18e49cdce9d8.sql` L53–77 — `FOR ALL USING (true) WITH CHECK (true)` em `contact_custom_field_values`, `conversation_tags`, `crm_automation_rules`, etc. |
| 4 | Impacto | Escalada horizontal de dados entre utilizadores se não existir outra camada de filtro |
| 15 | Correção | Restringir com `auth.uid()` e filiais de organização conforme modelo multi-tenant |

### V-ALT-02 — SSRF via regras de webhook (`fireWebhookRules`)

| 11 | Ficheiros | `supabase/functions/whatsapp-webhook/index.ts` L1169–1183 |
| 4 | Servidor faz POST para `rule.url` sem lista branca — titular malicioso ou conta comprometida pode apontar para redes internas |
| 3 | **ALTO** |
| 15 | Bloquear IPs privados, metadata URLs, resolver DNS re-bind; permitir apenas HTTPS domínios aprovados |

### V-ALT-03 — SSRF / abuse via `scrape-website`

| 11 | Ficheiros | `supabase/functions/scrape-website/index.ts` L54–99 — `fetch(url)` direto e via Jina |
| 4 | Utilizador autenticado pode forçar servidor a contactar IPs internos (cloud metadata, localhost) |
| 3 | **ALTO** |

### V-ALT-04 — Fallback JWT anon em chat agente

| 11 | Ficheiros | `src/components/AgentChat.tsx` L46–47 |
| 4 | Chamadas à function podem usar anon key em vez de sessão — créditos/autorização podem comportar-se como anon |
| 3 | **ALTO** |

### V-ALT-05 — Uso de service_role como segredo de transcrição (Telegram)

| 11 | Ficheiros | `supabase/functions/telegram-webhook/index.ts` L1031 |
| 4 | Se função `transcribeAudio` enviar esta string a uma API que não seja Supabase, **vazamento de segredo supremo** |
| 3 | **ALTO**–**CRÍTICO** conforme implementação de `transcribeAudio` |

### V-ALT-06 — CORS universal (`*`)

| 11 | Dezenas de ficheiros em `supabase/functions/**` — exemplo `wuzapi-proxy/index.ts` L4 |
| 4 | Facilita exploração cross-site de endpoints já públicos ou com auth fraca |
| 3 | **ALTO** (combinado com V-CRIT-02) |

---

## 4. Vulnerabilidades médias

- **Logs com dados sensíveis:** `asaas-webhook` L35 `console.log("Asaas webhook received:", event, payment?.id)` — vazamento em logs centralizados.
- **`whatsapp-webhook`** processamento em background — superfície DoS se não houver rate limit na CDN Supabase.
- **Dockerfile** (`Dockerfile` L1–35): imagem `node:22-alpine`, sem utilizador não‑root explícito — endurecimento opcional.
- **CI** sem `npm audit` obrigatório nem scan de segredos no YAML.

---

## 5. Vulnerabilidades baixas

- **`chart.tsx`** `dangerouslySetInnerHTML` para tema Recharts — revisar se input externo chega ao `_style`.
- **Comentários / placeholders** em migrações com `example.com` — sem impacto runtime.

---

## 6. Riscos operacionais

- Dependência de **URLs legadas** (`lovable.app`, `meuvendedoronline.com.br`) em redirects e fallbacks — fluxos de convite/recuperação quebrados ou redirecionamento errado após migração.
- **`npm audit`** não integrado no CI — vulnerabilidades conhecidas em deps podem persistir.

---

## 7. Riscos LGPD

- Tratamento de **mensagens WhatsApp/Telegram**, **e-mails**, **dados CRM**, **gravações de voz**, **calendário Google** — bases legais e subcontratação (OpenAI, Lovable, ElevenLabs, Asaas) devem estar documentadas.
- **Webhooks outbound** podem enviar dados pessoais a URLs arbitrárias (`fireWebhookRules`) — transferência internacional / terceiros não controlados.

---

## 8. Riscos financeiros

- **Asaas webhook** manipulável (V-CRIT-03).
- **Chaves IA** expostas via RLS (V-CRIT-04) — abuso de quota.

---

## 9. Riscos takeover

- **Evolution key** no código + controlo de instância.
- **service_role** se vazar via logs ou `.env` commitado.
- **Domínio OAuth** antigo — atacante com projeto Google antigo não revogado (cenário organizacional).

---

## 10. Dependências inseguras

- Execução local recomendada: `npm audit` e atualização de majors com changelog.
- Runtime Edge: imports `esm.sh` / `deno.land` — cadeia de suprimento (supply chain).

---

## 11. Dependências do ambiente antigo

- `supabase/config.toml` `project_id = "kvhtradegsostrhtzdwn"`.
- Fallbacks Evolution e domínios Lovable / meuvendedoronline em functions (convite, recovery, remetente).

---

## 12. Segredos expostos

| Local | Tipo |
|-------|------|
| `wuzapi-proxy/index.ts` | String API Evolution |
| `whatsapp-webhook/index.ts` | Constantes DEFAULT_EVO_* |
| `.env` local (se versionado) | JWT anon e URL projeto |
| Tabela `ai_providers` | Coluna `api_key` com política SELECT ampla |

---

## 13. Webhooks inseguros

| Webhook | Problema |
|---------|----------|
| Asaas | Sem assinatura verificada no código analisado |
| Evolution → `whatsapp-webhook` | URL pública; mitigação deve ser segredo na Evolution + validação payload |
| Regras agente → URL arbitrária | SSRF |

---

## 14. Problemas Supabase

- **verify_jwt** global false nas funções listadas.
- **RLS** excessivamente permissivo em tabelas críticas.
- **Storage:** rever migrações — buckets `chat-media` com políticas anon read em algumas migrações (ver inventário storage anterior).

---

## 15. Problemas Evolution API

- Credenciais no código; webhook configurado por `SUPABASE_URL` — ao mudar projeto, atualizar Evolution.

---

## 16. Problemas OAuth

- Redirects dependentes de `SITE_URL` e Google Console — domínio antigo quebra fluxo.
- `send-recovery-email` usa origem do header ou default Lovable — phishing/open redirect se Origin manipulável **(rever validação de lista de origens permitidas)**.

---

## 17. Problemas infraestrutura

- **Docker:** sem multi-stage env para `VITE_*` — risco de imagem com URL errada se build sem ARG.
- **TLS:** não no repo — obrigatório em produção para cookies/OAuth.

---

## 18. Problemas deploy

- **GitHub Actions** build sem injetar `VITE_SUPABASE_*` — artefacto potencialmente inválido ou empty env.

---

## 19. Plano de correção (priorizado)

| Ordem | Ação |
|-------|------|
| P0 | Remover literais Evolution; rotacionar chaves |
| P0 | Validar webhooks Asaas (secret/HMAC) |
| P0 | Corrigir RLS em `ai_providers` / `ai_models` |
| P0 | Auditar cada function com `verify_jwt = false` — adicionar auth ou secret específico |
| P1 | SSRF: sanitizar URLs em webhooks e scrape |
| P1 | Remover fallback `anon` em `AgentChat`; remover fallback service_role em Telegram |
| P1 | Restringir CORS a origens conhecidas |
| P2 | Non-root Docker, CI com audit e secret scan |

---

## 20. Plano de rotação de segredos

1. Evolution **nova key** após remoção do código.  
2. **Supabase** service_role e anon se repositório exposto.  
3. **Asaas** API key e revalidar webhook URL.  
4. **Google** OAuth client secret.  
5. **Lovable**, **ElevenLabs**, tokens **Telegram**/**Solar**/**Clinicorp** na BD.  
6. **Reemitir** refresh tokens Gmail se SMTP OAuth comprometido.

---

## 21. Checklist de segurança

- [ ] Nenhum segredo em Git  
- [ ] `verify_jwt` revisado por função  
- [ ] Webhooks financeiros autenticados  
- [ ] RLS sem `USING (true)` em dados multi-tenant ou segredos  
- [ ] CORS restrito  
- [ ] SSRF mitigado  
- [ ] npm audit + Dependabot  
- [ ] Logs sem PII/financeiros  

---

## 22. Checklist de migração segura

- [ ] Novo projeto Supabase + novo service_role  
- [ ] Novos secrets Edge  
- [ ] Evolution nova instância + webhook URL novo  
- [ ] Google OAuth redirects atualizados  
- [ ] Asaas webhook URL + teste assinatura  
- [ ] Remover fallbacks Lovable/meuvendedor no código  
- [ ] Retestar RLS com utilizadores de teste por organização  

---

*Este relatório não substitui pentest, revisão de código por pares nem auditoria jurídica LGPD.*

# Plano enterprise completo — migração, takeover operacional, cutover e produção (nova infra independente)

**Versão:** 1.0  
**Âmbito:** hapitech-main (SPA Vite/React + Supabase + Edge Functions + Evolution/WhatsApp + integrações externas).  
**Objetivo estratégico:** **reconstruir toda a operação** numa **nova infraestrutura segura, escalável e totalmente desacoplada** do ambiente antigo — **sem** objectivo de recuperar o legado; o objectivo é **eliminar dependências**, **identidades**, **DNS**, **certificados**, **webhooks**, **OAuth redirects**, **segredos** e **processos** associados ao antigo.  
**Documentos de suporte:** `docs/CHECKLIST_FINAL_ENTERPRISE_MIGRACAO_PRODUCAO.md`, `docs/PLANO_ENTERPRISE_RECONSTRUCAO_INFRA_TOTAL.md`, `docs/DOCUMENTACAO_OPERACIONAL_ENTERPRISE_COMPLETA.md`, `docs/ENGENHARIA_REVERSA_*`, `docs/AUDITORIA_*`, `docs/INVENTARIO_SERVICOS_EXTERNOS_COMPLETO.md`.

---

## Índice de saída (conforme pedido)

1. [Resumo executivo](#1-resumo-executivo)  
2. [Estratégia de migração](#2-estratégia-de-migração)  
3. [Cronograma de migração](#3-cronograma-de-migração)  
4. [Arquitetura origem / destino](#4-arquitetura-origem--destino)  
5. [Matriz de riscos](#5-matriz-de-riscos)  
6. [Matriz de rollback](#6-matriz-de-rollback)  
7. [Plano de auditoria (ETAPA 1)](#7-plano-de-auditoria-etapa-1)  
8. [Plano de infraestrutura (ETAPAS 3–5)](#8-plano-de-infraestrutura-etapas-3-5)  
9. [Plano Supabase (ETAPA 6)](#9-plano-supabase-etapa-6)  
10. [Plano Edge Functions (ETAPA 7)](#10-plano-edge-functions-etapa-7)  
11. [Plano Evolution API (ETAPA 8)](#11-plano-evolution-api-etapa-8)  
12. [Plano CI/CD (ETAPAS 2 e 10)](#12-plano-cicd-etapas-2-e-10)  
13. [Plano staging (ETAPA 11)](#13-plano-staging-etapa-11)  
14. [Plano de testes (ETAPA 12)](#14-plano-de-testes-etapa-12)  
15. [Plano de cutover (ETAPAS 13–14)](#15-plano-de-cutover-etapas-13-14)  
16. [Plano de rollback](#16-plano-de-rollback)  
17. [Plano pós-cutover (ETAPA 15)](#17-plano-pós-cutover-etapa-15)  
18. [Plano de revogação de acessos antigos (ETAPA 17)](#18-plano-de-revogação-de-acessos-antigos-etapa-17)  
19. [Plano de desativação do ambiente antigo (ETAPA 18)](#19-plano-de-desativação-do-ambiente-antigo-etapa-18)  
20. [Checklist final de produção](#20-checklist-final-de-produção)  
21. [Checklist de rollback](#21-checklist-de-rollback)  
22. [Checklist de auditoria final](#22-checklist-de-auditoria-final)  
23. [Anexo A — Estratégias de cutover (detalhe)](#anexo-a--estratégias-de-cutover-detalhe)  
24. [Anexo B — Freeze operacional](#anexo-b--freeze-operacional)  
25. [Anexo C — GO / NO-GO](#anexo-c--go--no-go)  
26. [Anexo D — Testes obrigatórios por domínio](#anexo-d--testes-obrigatórios-por-domínio)  
27. [Anexo E — Validação pós-cutover](#anexo-e--validação-pós-cutover)  
28. [Anexo F — Detalhamento das 18 etapas (20 campos cada)](#anexo-f--detalhamento-das-18-etapas-20-campos-cada)  
29. [Anexo G — Revogação e desativação (passo a passo expandido)](#anexo-g--revogação-e-desativação-passo-a-passo-expandido)

---

## 1. Resumo executivo

Este plano descreve a **transição controlada** da operação actual para uma **stack nova**: Git privado, VPS endurecida, Docker/Coolify, proxy TLS, projeto **Supabase novo**, **Edge Functions** redesenhadas em termos de segredos e política JWT, **Evolution API** nova com volumes e webhooks alinhados, **Cloudflare/DNS** novo ou zona repontada de forma irreversível para o destino, e **CI/CD** com ambientes isolados. O **takeover operacional** implica **RACI**, **inventário de segredos**, **matriz LGPD**, **runbooks** e **evidências** por gate.

O **cutover** não é um “deploy único”: é uma **sequência ordenada** de alterações de **identidade** (chaves, tokens), **configuração** (redirects OAuth, webhooks externos), **tráfego** (DNS, proxy) e **dados** (migração PG/Storage), com **rollback** e **contingência** pré-definidos. A **independência total** exige, no fim, **prova negativa**: nenhum hostname, API key, PAT, webhook ou certificado do ambiente antigo pode ser necessário para o funcionamento da produção nova.

**Pontos críticos do código e config actuais** (neutralizar antes da independência): fallbacks `EVO_URL` / `EVO_KEY` e domínios `*.lovable.app` em Edge Functions; `verify_jwt` em massa `false` em `supabase/config.toml`; literais de projectos antigos; webhooks Asaas/Telegram/Evolution ainda a bater em URLs antigas; `VITE_SUPABASE_*` injectados a partir de pipelines ou ficheiros legados.

**Princípios de decisão:** (1) **estabilidade** > velocidade; (2) **segurança** e **LGPD** como gates duros; (3) **rollback sempre mais barato** que incidente prolongado; (4) **observabilidade antes** de abrir tráfego; (5) **prova de restore** antes de GO.

---

## 2. Estratégia de migração

### 2.1 Paradigma: “parallel run” controlado + cutover de tráfego

A estratégia recomendada é **construir o destino em paralelo** (staging e pré-produção **isolados**), executar **migração de dados** para o projeto Supabase novo com **validação de integridade**, alinhar **todas** as integrações externas a **URLs novas** em janela controlada, e só então **alterar DNS** (ou CNAME de produção) para o origin novo. Isto maximiza **rollback** (reverter DNS e webhooks) e minimiza **downtime** percebido se TTL e smoke tests forem disciplinados.

**Não** se assume continuidade do legado além do período de **paridade operacional** documentado (ex.: 48–168 horas): após validação, o legado passa a **read-only** e depois a **desligado**, com **revogação** sistemática.

### 2.2 Objectivos operacionais mapeados

| Objectivo | Realização no plano |
|-----------|---------------------|
| Assumir controlo total | RACI, runbooks, acesso MFA, repositório privado, pipelines com environments |
| Eliminar acessos antigos | ETAPA 17 + secção 18 |
| Eliminar dependências antigas | Código sem fallback; secrets novos; DNS final só destino |
| Continuidade de negócio | Parallel run, smoke, comunicação, janela |
| Segurança | Hardening, WAF, RLS, rotação, JWT policy |
| Estabilidade | Healthchecks, limits, observabilidade pré-cutover |
| Rollback | Matriz secção 6 + Anexo A.9 |
| Observabilidade | Logs, uptime, alertas, dashboards |
| Governança | Gates, assinaturas, auditoria |
| Minimizar downtime | TTL baixo só após staging estável; blue-green lógico via DNS |
| Minimizar risco operacional | Freeze (Anexo B), testes (Anexo D), NO-GO (Anexo C) |

### 2.3 “Zero-downtime” — o que é realisticamente possível

**Zero-downtime absoluto** é raro quando mudam **project_id** Supabase, **OAuth** e **webhooks** simultaneamente. O que se consegue é **“near-zero”** para o utilizador final se: (a) o **front novo** já estiver servido num hostname de **staging** com dados espelhados; (b) o **cutover** for **DNS + config OAuth** numa janela curta; (c) **sessões** de utilizador tolerarem redirect novo (utilizadores podem ter de voltar a autenticar em Google OAuth). Para **WhatsApp**, pode haver **breve interrupção** de entrega se webhooks falharem entre troca Evolution ↔ Supabase — mitigação: **ordem** na secção 15 e Anexo A.

---

## 3. Cronograma de migração

**Nota:** durações são **indicativas**; dependem de volume de dados, número de instâncias Evolution e aprovações DPO/legal.

| Semana | Fase macro | Etapas (ver Anexo F) | Entregáveis |
|--------|------------|----------------------|-------------|
| W1 | Governação e auditoria | 1 | Inventário segredos, matriz dados, lista integrações |
| W2 | Identidade e código | 2, (início 7) | Repo privado, branch protection, remoção fallbacks em branch |
| W3 | Infra base | 3, 4, 5 | VPS, hardening, Docker, compose, proxy TLS staging |
| W4 | Plataforma dados | 6, 7 | Supabase novo, migrations, RLS, Edge deploy staging |
| W5 | Mensageria | 8 | Evolution nova, volumes, webhook staging |
| W6 | Perímetro | 9 | Cloudflare staging, WAF log-only → block |
| W7 | Pipeline | 10 | CI/CD com secrets por environment |
| W8 | Qualidade | 11, 12 | Staging completo, testes integrados assinados |
| W9 | Pré-cutover | 13 | Congelamentos, comunicação, dry-run |
| W10 | Cutover prod | 14 | DNS, OAuth, webhooks, GO |
| W11–W12 | Estabilização | 15, 16 | Burn-in, ajustes, validação observabilidade |
| W13+ | Encerramento legado | 17, 18 | Revogação, desativação, auditoria final |

**Diagrama textual (dependência linear principal)**

```
ETAPA1 ─► ETAPA2 ─► ETAPA3 ─► ETAPA4 ─► ETAPA5 ─► ETAPA6 ─► ETAPA7 ─► ETAPA8
   │                                                                        │
   └──────────────────────────────────────► ETAPA9 (paralelo desde W3)     │
                                                                            ▼
ETAPA10 ◄──────────────────────────────────────────────────────────── ETAPA6–8
   │
   ▼
ETAPA11 ─► ETAPA12 ─► ETAPA13 ─► ETAPA14 ─► ETAPA15 ─► ETAPA16 ─► ETAPA17 ─► ETAPA18
```

---

## 4. Arquitetura origem / destino

### 4.1 Origem (legado — a eliminar)

- **Git / CI:** repositório e tokens com histórico de exposição potencial; workflows sem CD completo ou com segredos partilhados.  
- **DNS / TLS:** zona ou registos apontando para origin antigo; certificados emitidos para infra antiga.  
- **Supabase:** `project_ref` antigo; `anon` / `service_role` antigos; Storage e PG com dados de produção até migração.  
- **Edge Functions:** URLs `https://<REF_ANTIGO>.supabase.co/functions/v1/...` referenciadas em webhooks externos.  
- **Evolution:** instância antiga; `EVO_KEY` antigo; webhooks para REF antigo.  
- **Integrações:** Asaas, Telegram, Google OAuth, IA (OpenAI/Lovable/etc.) com URLs e chaves configuradas no tempo.

### 4.2 Destino (nova operação)

```
                    ┌─────────────────────────────────────┐
                    │           Cloudflare (novo)          │
                    │  DNS + WAF + RL + TLS + (CDN est.)   │
                    └──────────────────┬──────────────────┘
                                       │ 443
                    ┌──────────────────▼──────────────────┐
                    │     VPS nova: UFW + fail2ban        │
                    │  ┌─────────────────────────────┐   │
                    │  │ Reverse proxy (TLS ACME)     │   │
                    │  └───────────┬─────────────────┘   │
                    │  ┌───────────▼─────────────────┐   │
                    │  │ Coolify / Docker             │   │
                    │  │  ┌──────┐    ┌──────────┐   │   │
                    │  │  │ SPA  │    │ Evolution│   │   │
                    │  │  └─┬────┘    └────┬─────┘   │   │
                    │  └────┼──────────────┼─────────┘   │
                    └───────┼──────────────┼─────────────┘
                            │              │ webhook HTTPS
                            ▼              ▼
                    ┌───────────────────────────────┐
                    │   Supabase NOVO (PG/Auth/     │
                    │   Storage/Realtime/Edge)      │
                    └───────────────────────────────┘
```

**Front:** build com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` **do projeto novo** apenas.  
**Back:** RLS e policies como fonte de verdade de autorização; `service_role` **só** em Edge/CI, nunca no browser.

### 4.3 Dependências ocultas (alto risco)

| Dependência oculta | Onde surge | Mitigação |
|--------------------|------------|-----------|
| Redirect URI OAuth esquecido (mobile ou subdomínio) | Google Cloud Console | Inventário todos os client IDs |
| Webhook Asaas em “ambiente secundário” | Painel Asaas | Lista por conta + ambiente |
| Cron externo (Zapier, n8n) a chamar Edge antiga | Fornecedor não documentado | Questionário stakeholders |
| Email magic link com domínio antigo em templates Supabase | Auth templates | Revisão todos os templates |
| CORS no Storage para `localhost` ou domínio antigo | Supabase dashboard | CORS mínimo necessário |
| `Realtime` channels com URL hardcoded em cliente antigo | PWA instalada | Comunicação + versão nova |
| Certificados internos Coolify vs público Cloudflare | Misconfig TLS | SSL Labs + curl verbose |
| Sessão WhatsApp no volume Evolution | Perda volume = novo QR | Backup volume + procedimento |

---

## 5. Matriz de riscos

| ID | Risco | Prob. | Impacto | Criticidade | Mitigação | Owner |
|----|-------|-------|---------|-------------|-----------|-------|
| R1 | Perda dados na migração PG | M | Catastrófico | CRÍTICO | Dump + checksum + restore test | DBA/SRE |
| R2 | RLS mais restritivo que legado | M | Alto | CRÍTICO | Matriz testes papel×tabela | Dev |
| R3 | Webhook duplicado Asaas (antigo+novo) | A | Médio | ALTO | Desactivar antigo após smoke | FinOps |
| R4 | OAuth Google bloqueia utilizadores | M | Alto | CRÍTICO | Pre-validar todos redirect URIs | Sec |
| R5 | Evolution desligada durante cutover | M | Alto | ALTO | Ordem cutover + contingência | SRE |
| R6 | Secrets Edge incompletos | A | Alto | CRÍTICO | Script verificação env vs doc | Dev |
| R7 | `verify_jwt` incorrecto pós-deploy | M | Segurança | CRÍTICO | Testes negativos sem JWT | Sec |
| R8 | DNS TTL alto prolonga rollback | M | Médio | MÉDIO | Baixar TTL 48h antes | SRE |
| R9 | Custos Supabase/região inesperados | B | Médio | MÉDIO | Billing alerts | FinOps |
| R10 | Violação LGPD (subprocessador) | B | Legal | CRÍTICO | DPA + registo actividades | DPO |
| R11 | Insider com SSH legado | B | Segurança | ALTO | Revogação chaves ETAPA 17 | Sec |
| R12 | PII em logs após aumento verbosidade | M | LGPD | ALTO | Mascaramento + revisão | Dev |

---

## 6. Matriz de rollback

| Gatilho (exemplo) | Sistema afectado | Acção imediata | Ordem | Dados a preservar | Tempo alvo |
|-------------------|------------------|----------------|--------|-------------------|------------|
| Taxa erro 5xx > X% pós-DNS | App | Reverter DNS para origin anterior | 1 | Nenhuma perda se só DNS | minutos–horas |
| Login OAuth falha massivo | Auth | Reverter redirect URIs **e** DNS se necessário | 1–2 | Sessões podem resetar | horas |
| Webhook Asaas 100% falha | Billing | Reapontar webhook legado temporariamente | 2 | Risco duplicidade — usar fila | horas |
| Edge `whatsapp-webhook` 5xx | WA | Reverter webhook Evolution para URL antiga **só** se legado ainda existir | 3 | Mensagens podem duplicar — procedimento | horas |
| Corrupção PG pós-migração | Supabase | **Não** promover; restore em instância isolada | 1 | Backup imutável | horas–dias |
| Imagem Docker defectiva | Compute | Deploy digest anterior no Coolify | 1 | — | minutos |

**Regra:** rollback de **dados** é o mais lento e arriscado; por isso a migração PG deve estar **congelada** e **validada** antes do cutover de DNS (Anexo B).

---

## 7. Plano de auditoria (ETAPA 1)

**Finalidade:** obter **foto completa** do legado — técnica, segurança, dados pessoais, financeiro e operacional — para que nenhuma dependência escape à ETAPA 18.

**Entregáveis:** actualização de `docs/AUDITORIA_VARIAVEIS_SEGREDOS_COMPLETA.md`, `docs/AUDITORIA_SEGURANCA_COMPLETA.md`, `docs/INVENTARIO_SERVICOS_EXTERNOS_COMPLETO.md`, diagrama de fluxos de dados (LGPD), lista de contas admin (Git, CF, Supabase, VPS, Asaas).

**Actividades chave:** (1) export audit log Git; (2) listar todos os deploy keys e PATs; (3) inventariar Edge Functions e `Deno.env`; (4) mapear webhooks em cada painel externo; (5) identificar dados pessoais por tabela/storage; (6) revisar retenção e bases legais.

**Gate de saída:** documento de auditoria **aprovado** por Segurança + DPO (quando aplicável) antes de ETAPA 6 com dados reais de clientes.

---

## 8. Plano de infraestrutura (ETAPAS 3–5)

**ETAPA 3 — VPS:** dimensionamento (CPU/RAM/disco IOPS), IP estático, região, política de patches.  
**ETAPA 4 — Hardening:** CIS ou STIG adaptado; SSH só chave; desactivar serviços desnecessários; `ufw` default deny; fail2ban; AIDE opcional; auditoria de portas (`ss -tulpn`).

**ETAPA 5 — Docker:** Engine pinado; logging driver; `docker compose` versionado (`infra/docker-compose.stack.example.yml` como base); volumes nomeados e **backup**; healthchecks; **não** expor API Docker; política de imagens por **digest**.

**Coolify (se usado):** instalação limpa; MFA; backup da DB interna do Coolify; segredo dos webhooks de deploy.

---

## 9. Plano Supabase (ETAPA 6)

**Criação:** novo projeto na organização correcta; região alinhada a **residência de dados** (LGPD).  
**Migrations:** `supabase/migrations` aplicadas em ordem; verificar extensões (`vector`, etc.).  
**RLS:** testes automatizados e manuais por papel (`authenticated`, roles custom).  
**Auth:** Site URL, redirect URLs, SMTP, templates de email sem domínios antigos.  
**Storage:** buckets (`knowledge`, `chat-media`, …) com policies e CORS restritos.

**Migração de dados:** estratégia `pg_dump` / replicação lógica / ferramenta oficial; **janela** de consistência; validação por contagens e checksums amostrais; **não** apagar legado até ETAPA 18.

---

## 10. Plano Edge Functions (ETAPA 7)

**Inventário:** 31 funções (ver `docs/ENGENHARIA_REVERSA_EDGE_FUNCTIONS_COMPLETA.md`).  
**Secrets:** `supabase secrets set` para todas as variáveis usadas; **nunca** commit.  
**JWT:** rever `supabase/config.toml` por função; endurecer `verify_jwt=true` onde o contrato for exclusivamente utilizador autenticado ou header interno; webhooks **públicos** com validação alternativa (token HMAC, assinatura, IP allowlist se existir).

**Deploy:** staging primeiro; logs sem PII; CORS restrito quando aplicável.

---

## 11. Plano Evolution API (ETAPA 8)

**Nova instância:** imagem pinada por digest; `EVO_KEY` forte e único; volume persistente para sessões; limite de exposição (tunnel / allowlist).  
**Ligação ao Supabase novo:** `wuzapi-proxy` e `whatsapp-webhook` devem usar **URL e secrets** do projeto novo; eliminar fallbacks de URL/key no código.

**Webhooks:** Evolution → `https://<NOVO_REF>.supabase.co/functions/v1/whatsapp-webhook` (+ token se implementado).  
**Validação:** QR em número piloto; envio texto/mídia; reconexão; consistência `wuzapi_connections` / nomes de instância.

---

## 12. Plano CI/CD (ETAPAS 2 e 10)

**ETAPA 2 — Git privado:** migrar histórico ou snapshot limpo (decisão legal/compliance); **LFS** se necessário; branch protection; CODEOWNERS em `supabase/` e `infra/`.

**ETAPA 10 — CI/CD:** pipelines com **environments** `staging` / `production`; secrets `VITE_*` por ambiente; build reprodutível (`Dockerfile` com `ARG`/`ENV` alinhados); opcionalmente push de imagem com digest; deploy para Coolify via API com token **rotativo**.

---

## 13. Plano staging (ETAPA 11)

**Ambiente:** hostname dedicado (ex.: `staging.app.exemplo.pt`); projeto Supabase **staging** ou mesmo projeto com dados anonimizados (preferível projeto separado para evitar vazamento).  
**Dados:** subconjunto ou anonimização; **nunca** usar cópia completa de produção em staging sem controlo DPO.

**Deploy:** automático a partir de `develop` ou tag `rc-*`; smoke diário.

---

## 14. Plano de testes (ETAPA 12)

Ver **Anexo D** para lista completa. **Critério global:** todos os testes **CRÍTICOS** verdes na semana anterior ao cutover; testes **ALTO** com plano de excepção documentado se falharem.

**Automação:** onde não existir E2E, usar checklist manual filmado ou registado em ticket com evidência.

---

## 15. Plano de cutover (ETAPAS 13–14)

**ETAPA 13 — Pré-cutover:** congelamentos (Anexo B); dry-run com checklist; comunicação; equipa war-room; backups verificados; TTL DNS baixo.

**ETAPA 14 — Cutover:** sequência em Anexo A (DNS, SSL, webhooks, OAuth, Supabase URL no front, Evolution). **Smoke imediato** após cada sub-faixa quando possível.

---

## 16. Plano de rollback

Rollback **em camadas**: (1) DNS; (2) deploy imagem; (3) webhooks externos; (4) Edge Functions por versão; (5) dados — **último recurso** com restore isolado. Ver secção 6 e **Anexo A.9**.

**Comunicação:** qualquer rollback > 15 min de indisponibilidade deve seguir runbook de incidente.

---

## 17. Plano pós-cutover (ETAPA 15)

**Burn-in:** 7–14 dias com revisão diária de dashboards, erros, latência, quotas Asaas/OpenAI, filas webhook.  
**Ajustes finos:** rate limits, WAF tuning, custos.  
**Documentação:** actualizar URLs e contactos em `docs/DOCUMENTACAO_OPERACIONAL_ENTERPRISE_COMPLETA.md`.

---

## 18. Plano de revogação de acessos antigos (ETAPA 17)

Execução **só após** ETAPA 16 (validação final) positiva. Ver também **Anexo G.1** (passo a passo expandido).

**Ordem sugerida:** (1) revogar PATs e deploy keys Git legados; (2) revogar tokens API Coolify/registry legados; (3) rotacionar `service_role` e `anon` no projeto **novo** se houve partilha indevida durante migração; (4) desactivar contas SSH e chaves na VPS antiga; (5) remover utilizadores Supabase dashboard legado; (6) desligar OAuth client legado ou remover URIs antigos após confirmação de zero tráfego.

---

## 19. Plano de desativação do ambiente antigo (ETAPA 18)

**Pré-requisito:** evidência de **independência completa** (checklist secção 22).  
**Ordem:** parar ingestão (webhooks → novo); colocar legado **read-only**; **backup final** imutável; export legal se necessário; encerrar VMs; cancelar projectos; arquivar DNS; **documentar** data e responsável.

---

## 20. Checklist final de produção

- [ ] GO formal assinado (Anexo C.1) por Owner + SRE + Segurança (+ DPO se dados pessoais).  
- [ ] DNS produção aponta **só** para infra nova.  
- [ ] SSL válido (edge + origin se Full strict).  
- [ ] `VITE_SUPABASE_*` de produção correctos no artefacto implantado.  
- [ ] Todas as Edge Functions deployadas com secrets completos.  
- [ ] Webhooks Asaas, Telegram, Evolution confirmados em logs (evento teste).  
- [ ] OAuth Google login e recovery testados.  
- [ ] WhatsApp piloto envia e recebe.  
- [ ] Pagamentos (Asaas) fluxo crítico testado em valor controlado ou sandbox conforme política.  
- [ ] Backups automáticos activos; último restore test < política interna.  
- [ ] Alertas e uptime activos.  
- [ ] Plano rollback distribuído à equipa war-room.

---

## 21. Checklist de rollback

- [ ] Gatilho documentado (Anexo C.3) atingido — decisão por SRE + Owner.  
- [ ] DNS revertido **ou** tráfego desviado para origin estável documentado.  
- [ ] Webhooks revertidos **apenas** se legado ainda operacional e aprovado (evitar duplicados).  
- [ ] Imagem Docker anterior (digest) identificada e redeployed.  
- [ ] Edge Functions: commit/tag anterior deployada.  
- [ ] Base de dados: **não** rollback destrutivo sem restore em ambiente isolado validado.  
- [ ] Post-mortem agendado em 5 dias úteis.

---

## 22. Checklist de auditoria final

- [ ] Nenhum secret do legado em uso nos pipelines produtivos.  
- [ ] Git audit: sem PATs órfãos; MFA 100% admins.  
- [ ] Cloudflare audit: sem regras a apontar para IP legado.  
- [ ] Supabase legado: encerrado ou arquivado com export.  
- [ ] Evolution legado: instâncias paradas; volumes arquivados cifrados.  
- [ ] LGPD: registo de actividades actualizado; incidentes nulos ou tratados.  
- [ ] Evidências arquivadas (PDFs exports, hashes de dumps).  
- [ ] `docs/CHECKLIST_FINAL_ENTERPRISE_MIGRACAO_PRODUCAO.md` revisto e tickado.

---

## Anexo A — Estratégias de cutover (detalhe)

### A.1 Near zero-downtime (estratégia)

1. Servir produção **nova** em hostname temporário ou `prod-new.` com certificado válido até smoke completo.  
2. Reduzir TTL DNS (ex.: 300s) **≥48h** antes.  
3. No momento cutover: alterar CNAME/A **apenas** após checklist pré-cutover verde.  
4. Manter origin antigo **read-only** durante burn-in para rollback rápido de DNS.  
5. Comunicar possível re-login OAuth.

### A.2 Troca DNS

- Listar **todos** os RRsets (apex, `www`, `api`, `staging`, TXT para SPF/DKIM se aplicável).  
- Validar com `dig @1.1.1.1`, `dig @8.8.8.8`, e ferramentas de propagação.  
- **Não** remover zona antiga até ETAPA 18; pode manter **parked** sem tráfego.

### A.3 Troca SSL

- Garantir certificado **origin** válido antes de Cloudflare **Full (strict)**.  
- Renovação ACME automatizada; alarme de expiração T-30 dias.

### A.4 Troca webhooks

**Ordem recomendada:** primeiro assegurar que **URL nova** responde `200` a health/ping; depois Asaas → Telegram → Evolution (Evolution último se maior risco de perda mensagens).  
- Após cada troca: **evento sintético** ou reenvio do fornecedor; verificar linha nos logs Edge.

### A.5 Troca OAuth

- Actualizar **Authorized redirect URIs** e **JavaScript origins** no Google Cloud Console.  
- Testar fluxo completo em browser limpo (sem cache de consent).

### A.6 Troca Supabase

- Congelar escrita no legado (ETAPA 13) antes do dump final incremental.  
- Aplicar incremental no novo; validar contagens.  
- Actualizar **só então** `VITE_SUPABASE_URL` e anon key no build prod.

### A.7 Troca Evolution API

- Nova Evolution com volume; **novo** `EVO_KEY` nas secrets Supabase; redeploy funções que consomem Evolution.  
- Actualizar webhooks Evolution; **re-parear** QR se instância nova (planejar comunicação com negócio).

### A.8 Troca produção

- Checklist secção 20; assinatura GO; war-room; comunicado a stakeholders.

### A.9 Estratégia rollback

- **DNS primeiro** (mais rápido).  
- **Deploy segundo**.  
- **Webhooks terceiro** (sincronizado com DNS se URLs incluem hostname).  
- **Dados último** — só com backup validado.

### A.10 Estratégia contingência

- **Legado read-only** por X dias.  
- **Comunicação de degradação** se partial go (ex.: WA atrasado mas app up — apenas se aceite pelo negócio).  
- **Fornecedor:** contactos prioritários Asaas/Evolution em runbook.

---

## Anexo B — Freeze operacional

| Tipo | O que congela | Início típico | Fim típico | Excepções |
|------|---------------|---------------|------------|-----------|
| **Freeze deploy** | Novas features na `main` | T-48h cutover | T+72h pós-cutover | hotfix segurança com 2 aprovadores |
| **Freeze banco** | DDL e DML massivos em prod legado | T-24h | Após dump final | — |
| **Freeze migrations** | Novos ficheiros `supabase/migrations` | T-72h | Após burn-in estável | hotfix com migração reversível |
| **Freeze DNS** | Alterações não relacionadas | T-7d | T+14d | rollback |
| **Freeze produção** | Mudanças config prod (WAF, limits) | T-24h | T+7d | tuning emergência |
| **Freeze integrações** | Novos fornecedores / chaves | T-7d | T+30d | excepção documentada |

---

## Anexo C — GO / NO-GO

### C.1 GO produção (todos necessários)

- Restore test documentado e **bem-sucedido** em janela ≤ política.  
- Staging com smoke **100%** dos fluxos CRÍTICOS (Anexo D).  
- Observabilidade mínima: uptime + alertas + logs acessíveis.  
- Plano rollback assinado e testado em **staging** (simulação).  
- MFA em todas as consolas admin do **destino**.  
- DPO/Security sign-off em dados pessoais.

### C.2 NO-GO produção (qualquer um)

- Falha em teste CRÍTICO de auth, pagamento ou RLS.  
- Secrets Edge incompletos ou `verify_jwt` em estado inseguro não aceite pelo risk register.  
- Backup último **irrecuperável** ou não testado.  
- Equipa war-room incompleta na janela.

### C.3 Rollback obrigatório

- Indisponibilidade > limiar definido (ex.: 15 min) **e** causa não identificada em 30 min.  
- Perda ou corrupção de dados detectada.  
- Incidente de segurança (credential leak) durante cutover.

### C.4 Abortar migração (antes ou durante)

- Falha catastrófica em restore test **antes** de cutover — **abort** e replaneamento.  
- Decisão legal (DPO) suspende transferência internacional de dados.

### C.5 Bloquear cutover

- TTL DNS ainda alto sem plano aceite.  
- OAuth não testado em staging com domínio final.  
- Webhook Asaas sem validação de assinatura quando política exige.

---

## Anexo D — Testes obrigatórios por domínio

| Domínio | Teste mínimo | Ferramenta / evidência |
|---------|--------------|------------------------|
| Frontend | Login, dashboard core, build sem env missing | Browser + CI |
| Supabase | CRUD com JWT real; RLS negativo | `curl` / app |
| Auth | Email+password, magic link, Google OAuth | Browser limpo |
| Edge Functions | Smoke por função crítica (lista eng. reversa) | Dashboard logs |
| WhatsApp | In/out texto+mídia | Dispositivo real |
| Webhooks | Asaas, Telegram, Evolution evento teste | Logs correlacionados |
| Pagamentos | Cobrança sandbox ou micro-valor | Painel Asaas |
| IA | Resposta agente sem 5xx | UI + logs |
| Uploads | Storage buckets políticas | UI |
| OAuth | Redirect completo | Network tab |
| DNS | `dig` multi-resolver | CLI |
| SSL | SSL Labs + `curl -vI` | Externo |
| Containers | `docker ps` healthy; restart policy | SSH |
| Monitoramento | Alerta sintético | Pager/e-mail |
| Backups | Último backup < RPO | Dashboard Supabase |
| Restore | Restore sandbox | Relatório datado |

---

## Anexo E — Validação pós-cutover

| Área | Como validar | Duração recomendada |
|------|--------------|---------------------|
| Produção | Smoke completo + utilizadores piloto | T+0 a T+72h |
| Observabilidade | Dashboards sem gaps; alertas teste | T+0 |
| Logs | Busca por `5xx`, `ECONNREFUSED`, `JWT` | T+0 a T+7d |
| Uptime | Checks multi-região ≥ SLO | Contínuo |
| Webhooks | Taxa sucesso vs baseline legado | T+24h |
| WhatsApp | Latência entrega; erros Evolution | T+24h |
| Supabase | Quotas, slow queries | T+7d |
| CI/CD | Pipeline verde pós-hotfix simulado | T+7d |

---

## Anexo F — Detalhamento das 18 etapas (20 campos cada)

*Legenda criticidade: **CRÍTICO** / **ALTO** / **MÉDIO** / **BAIXO**.*

---

### ETAPA 1 — Auditoria completa

1. **Objetivo:** inventariar **tudo** o que o legado usa — para nada ficar “implícito” na ETAPA 18.  
2. **Ordem correcta:** primeiro ETAPA 1; bloqueia decisões de ETAPA 6–8 sem inventário de integrações.  
3. **Dependências:** acesso read-only a Git, Cloudflare, Supabase dashboard, Asaas, Evolution, VPS; NDA interno.  
4. **Pré-requisitos:** RACI; canal seguro para partilha de exports.  
5. **Execução passo a passo:** (a) reunir credenciais MFA temporárias; (b) export audit logs; (c) percorrer `docs/AUDITORIA_*` e actualizar; (d) entrevista donos de integração (marketing, finanças); (e) mapear PII; (f) fotografar configs DNS/WAF.  
6. **Validações:** inventário sem linhas “TBD”; aprovação formal.  
7. **Smoke tests:** N/A (não produtivo).  
8. **Health checks:** N/A.  
9. **Critérios de sucesso:** documento assinado; lista completa de webhooks e secrets.  
10. **Critérios de falha:** lacunas >5% nas integrações conhecidas — repetir auditoria.  
11. **Riscos operacionais:** tempo subestimado — mitigar com checklist externo.  
12. **Riscos segurança:** exposição de exports — cifrar e expirar links.  
13. **Riscos LGPD:** descoberta tardia de subprocessador — incluir no registo.  
14. **Riscos financeiros:** descoberta de contas duplicadas Asaas — consolidar.  
15. **Riscos continuidade:** nenhum se só leitura.  
16. **Impacto downtime:** nulo.  
17. **Estratégia rollback:** repetir auditoria; não há rollback técnico.  
18. **Estratégia contingência:** auditor externo se conflito interno.  
19. **Tempo estimado:** 5–15 dias úteis.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 2 — Novo Git privado

1. **Objetivo:** **fonte da verdade** sob controlo da organização, MFA, sem histórico indesejado (decisão explícita).  
2. **Ordem correcta:** após ETAPA 1; antes de ETAPA 10 produtivo.  
3. **Dependências:** org GitHub/GitLab; política de licenças.  
4. **Pré-requisitos:** decisão “histórico completo vs snapshot”.  
5. **Execução:** criar repo privado; configurar branch protection; CODEOWNERS; migrar código; desactivar webhooks Lovable se existirem; rotacionar URLs remotos em máquinas locais.  
6. **Validações:** primeiro CI verde no novo remoto.  
7. **Smoke:** clone limpo + `npm ci` + build.  
8. **Health checks:** CI status checks obrigatórios.  
9. **Sucesso:** nenhum colaborador usa remoto antigo.  
10. **Falha:** secrets no histórico — usar `git filter-repo` ou novo snapshot sem secrets.  
11. **Operacional:** confusão de remotes — documentar `git remote -v` padrão.  
12. **Segurança:** leak em fork — desactivar forks públicos.  
13. **LGPD:** se histórico contiver dados — política de scrubbing.  
14. **Financeiro:** custo seats.  
15. **Continuidade:** overlap read-only no antigo.  
16. **Downtime:** nulo.  
17. **Rollback:** manter antigo read-only até cutover.  
18. **Contingência:** mirror duplo (GitHub + GitLab privado).  
19. **Tempo:** 2–5 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 3 — Novo VPS

1. **Objetivo:** compute dedicado para Docker/Coolify/proxy.  
2. **Ordem:** após decisão região; paralelo a ETAPA 9 (DNS) em preparação.  
3. **Dependências:** fornecedor VPS; chaves SSH novas.  
4. **Pré-requisitos:** sizing aprovado.  
5. **Execução:** criar VM; IP estático; SO LTS; utilizador ops; desactivar password root.  
6. **Validações:** `ping`, `ssh`, disco, rede.  
7. **Smoke:** `uptime`.  
8. **Health:** monitoring agent opcional.  
9. **Sucesso:** SSH só chave; patch inicial aplicado.  
10. **Falha:** IP em blacklist — novo IP ou pedido delist.  
11. **Operacional:** latência cross-region.  
12. **Segurança:** exposição 22 público sem restrição — corrigir antes de seguir.  
13. **LGPD:** região fora EE — aprovação DPO.  
14. **Financeiro:** custo mensal previsível.  
15. **Continuidade:** segunda VPS DR opcional.  
16. **Downtime:** n/a.  
17. **Rollback:** destruir VM e reprovisionar.  
18. **Contingência:** segunda região.  
19. **Tempo:** 1–2 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 4 — Hardening Linux

1. **Objetivo:** superfície de ataque mínima.  
2. **Ordem:** imediatamente após ETAPA 3.  
3. **Dependências:** baseline CIS ou checklist interno.  
4. **Pré-requisitos:** acesso root inicial seguro.  
5. **Execução:** updates; sshd_config; ufw; fail2ban; sysctl; desinstalar pacotes inúteis; logging central opcional.  
6. **Validações:** scan porta externo; grep `PasswordAuthentication`.  
7. **Smoke:** login falha com password.  
8. **Health:** fail2ban `status`.  
9. **Sucesso:** relatório hardening anexado.  
10. **Falha:** portas extra abertas — fechar.  
11. **Operacional:** bloqueio admin errado — manter break-glass.  
12. **Segurança:** lockout admins — documentar IP bastion.  
13. **LGPD:** logs com IP — base legal.  
14. **Financeiro:** ferramenta CIS comercial opcional.  
15. **Continuidade:** se lockout — console out-of-band fornecedor.  
16. **Downtime:** minutos em reboot.  
17. **Rollback:** snapshot VPS pré-hardening.  
18. **Contingência:** imagem golden reprodutível.  
19. **Tempo:** 1–3 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 5 — Nova infra Docker

1. **Objetivo:** runtime consistente para app e Evolution.  
2. **Ordem:** após ETAPA 4.  
3. **Dependências:** compose versionado; registry se privado.  
4. **Pré-requisitos:** Docker instalado.  
5. **Execução:** definir redes; volumes; limits CPU/mem; logging; healthchecks; secrets via env Coolify **não** em Git.  
6. **Validações:** `docker compose config`; `docker compose up -d`.  
7. **Smoke:** curl localhost health.  
8. **Health:** Docker healthcheck verde.  
9. **Sucesso:** política restart testada (`docker restart`).  
10. **Falha:** dependência circular compose — corrigir.  
11. **Operacional:** logs cheios disco — rotação.  
12. **Segurança:** socket Docker exposto — negado.  
13. **LGPD:** volumes com PII — cifrar backups.  
14. **Financeiro:** registry privado.  
15. **Continuidade:** réplica futura documentada.  
16. **Downtime:** restart segundos.  
17. **Rollback:** `compose down` + volume snapshot.  
18. **Contingência:** VM extra com compose igual.  
19. **Tempo:** 2–5 dias.  
20. **Criticidade:** **ALTO**.

---

### ETAPA 6 — Novo Supabase

1. **Objetivo:** backend completo **novo** com dados migrados e políticas correctas.  
2. **Ordem:** após ETAPA 5 (ou paralelo se sem dependência de rede interna).  
3. **Dependências:** migrations; decisão região; acesso org Supabase.  
4. **Pré-requisitos:** ETAPA 1 inventário dados.  
5. **Execução:** criar projeto; aplicar migrations; configurar Auth/Storage; migrar dados; testes RLS; preparar service_role para Edge.  
6. **Validações:** contagens tabelas; checksum amostral; testes integração.  
7. **Smoke:** login app contra projeto novo (staging).  
8. **Health:** Supabase dashboard status.  
9. **Sucesso:** nenhum teste RLS crítico falha.  
10. **Falha:** divergência schema — corrigir migrations e repetir.  
11. **Operacional:** janela longa de cópia — comunicar.  
12. **Segurança:** service_role em log — sanitizar.  
13. **LGPD:** minimização — anonimizar staging.  
14. **Financeiro:** upgrade plano por storage.  
15. **Continuidade:** legado read-only durante cópia final.  
16. **Downtime:** possível read-only legado — planear.  
17. **Rollback:** não promover DNS; restore novo projeto a partir de backup.  
18. **Contingência:** projeto paralelo “B” se corrupção.  
19. **Tempo:** 5–20 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 7 — Novas Edge Functions

1. **Objetivo:** lógica serverless no **project_ref** novo com segurança alinhada.  
2. **Ordem:** após ETAPA 6 base; pode sobrepor testes com staging.  
3. **Dependências:** secrets; `config.toml`; CLI `supabase`.  
4. **Pré-requisitos:** lista de 31 funções e env vars.  
5. **Execução:** `supabase secrets set`; endurecer JWT onde aplicável; deploy `--project-ref` novo; corrigir CORS; remover fallbacks.  
6. **Validações:** teste cada webhook público com token/HMAC.  
7. **Smoke:** `curl` com payload assinado simulado.  
8. **Health:** logs sem stacktraces PII.  
9. **Sucesso:** todas funções `ACTIVE`.  
10. **Falha:** timeout cold start — aumentar plano ou optimizar.  
11. **Operacional:** limites rate Asaas/OpenAI.  
12. **Segurança:** função pública sem validação — **NO-GO**.  
13. **LGPD:** logs de WA com telefone — política retenção.  
14. **Financeiro:** invocações excessivas IA.  
15. **Continuidade:** versionamento por git tag nas deploys.  
16. **Downtime:** deploy segundos por função.  
17. **Rollback:** deploy commit anterior.  
18. **Contingência:** feature flag nas funções (se implementado).  
19. **Tempo:** 3–10 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 8 — Nova Evolution API

1. **Objetivo:** canal WhatsApp no **stack novo**.  
2. **Ordem:** após ETAPA 7 com `wuzapi-proxy`/`whatsapp-webhook` estáveis em staging.  
3. **Dependências:** imagem; volume; `EVO_KEY`; DNS interno opcional.  
4. **Pré-requisitos:** backup de volume testado.  
5. **Execução:** subir container; configurar Evolution; criar instância teste; apontar webhook; validar QR.  
6. **Validações:** mensagem echo; mídia.  
7. **Smoke:** webhook recebido nos logs Supabase.  
8. **Health:** endpoint Evolution interno.  
9. **Sucesso:** piloto WA aprovado pelo negócio.  
10. **Falha:** banimento número — plano número backup.  
11. **Operacional:** instabilidade Baileys — monitorização.  
12. **Segurança:** Evolution exposto público — tunnel apenas.  
13. **LGPD:** conteúdo conversas — retenção.  
14. **Financeiro:** custo número WA Business.  
15. **Continuidade:** segunda instância standby.  
16. **Downtime:** reconexão QR minutos–horas.  
17. **Rollback:** webhook volta temporariamente para legado **se ainda existir** (risco duplicado — controlado).  
18. **Contingência:** fila mensagens lado Evolution se disponível.  
19. **Tempo:** 3–7 dias.  
20. **Criticidade:** **CRÍTICO** para negócio dependente de WA.

---

### ETAPA 9 — Novo Cloudflare / DNS

1. **Objetivo:** perímetro seguro e DNS controlado.  
2. **Ordem:** preparação cedo; cutover DNS em ETAPA 14.  
3. **Dependências:** domínio; acesso registrar.  
4. **Pré-requisitos:** lista RRsets da ETAPA 1.  
5. **Execução:** criar zona; importar DNS; WAF; rate limits; Page Rules; preparar origin IPs novos.  
6. **Validações:** `dig` staging.  
7. **Smoke:** request através CF a staging.  
8. **Health:** CF analytics sem 5xx anómalo.  
9. **Sucesso:** políticas baseline activas.  
10. **Falha:** loop redirect — corrigir rules.  
11. **Operacional:** cache agressivo quebra deploy — rules bypass.  
12. **Segurança:** WAF desligado — não aceite.  
13. **LGPD:** IP logs — política.  
14. **Financeiro:** plano CF Business se necessário.  
15. **Continuidade:** DNS secundário opcional.  
16. **Downtime:** segundos em mudança record.  
17. **Rollback:** valor RRset anterior.  
18. **Contingência:** modo “DNS only” temporário.  
19. **Tempo:** 2–5 dias prep + cutover.  
20. **Criticidade:** **CRÍTICO** no cutover.

---

### ETAPA 10 — Novo CI/CD

1. **Objetivo:** entrega reprodutível com secrets por ambiente.  
2. **Ordem:** após ETAPA 2; maduro antes de ETAPA 14.  
3. **Dependências:** runners; Coolify API; registry.  
4. **Pré-requisitos:** `Dockerfile` com ARGs VITE.  
5. **Execução:** workflows; environments; approvals produção; SBOM opcional.  
6. **Validações:** pipeline staging verde com secrets reais staging.  
7. **Smoke:** deploy automático staging.  
8. **Health:** job summary sem secrets.  
9. **Sucesso:** nenhum secret em log Actions.  
10. **Falha:** secret partilhado staging/prod — separar.  
11. **Operacional:** fila de runners longa — escalar.  
12. **Segurança:** PR de fork com secrets — regras GitHub.  
13. **LGPD:** artefactos com build env — política retenção.  
14. **Financeiro:** minutos Actions.  
15. **Continuidade:** pipeline manual documentado se CI down.  
16. **Downtime:** nulo se só pipeline.  
17. **Rollback:** revert workflow + redeploy digest anterior.  
18. **Contingência:** deploy manual SSH documentado (break-glass).  
19. **Tempo:** 5–10 dias.  
20. **Criticidade:** **ALTO**.

---

### ETAPA 11 — Deploy staging

1. **Objetivo:** ambiente espelho funcional **não produtivo**.  
2. **Ordem:** após ETAPAS 5–8 mínimo viável.  
3. **Dependências:** DNS staging; secrets staging.  
4. **Pré-requisitos:** CI staging.  
5. **Execução:** deploy app; configurar CF staging; smoke.  
6. **Validações:** checklist staging 2 páginas críticas por role.  
7. **Smoke:** login + WA teste + webhook teste.  
8. **Health:** uptime check staging.  
9. **Sucesso:** stakeholders assinam UAT parcial.  
10. **Falha:** env errado — corrigir Coolify/GitHub env.  
11. **Operacional:** dados staging desactualizados — refresh periódico.  
12. **Segurança:** staging público sem IP allowlist — mitigar.  
13. **LGPD:** não usar PII real.  
14. **Financeiro:** custo duplicado APIs.  
15. **Continuidade:** staging ≠ prod configs.  
16. **Downtime:** n/a.  
17. **Rollback:** redeploy anterior.  
18. **Contingência:** vídeo walkthrough para UAT remoto.  
19. **Tempo:** 3–7 dias.  
20. **Criticidade:** **ALTO**.

---

### ETAPA 12 — Testes integrados

1. **Objetivo:** prova holística pré-cutover.  
2. **Ordem:** após ETAPA 11.  
3. **Dependências:** Anexo D; dados teste.  
4. **Pré-requisitos:** congelamento feature (Anexo B leve).  
5. **Execução:** testes manuais + automáticos; registo evidências.  
6. **Validações:** taxa falha zero em CRÍTICOS.  
7. **Smoke:** suite mínima 30 min.  
8. **Health:** métricas baseline.  
9. **Sucesso:** acta de testes assinada.  
10. **Falha:** abrir bugs P0 — bloqueiam ETAPA 14.  
11. **Operacional:** tempo equipa QA.  
12. **Segurança:** testes incluem abuse cases (webhook sem assinatura).  
13. **LGPD:** dados teste fictícios.  
14. **Financeiro:** custos APIs teste.  
15. **Continuidade:** repetir após hotfix.  
16. **Downtime:** n/a.  
17. **Rollback:** repetir ciclo testes.  
18. **Contingência:** testes canário com % utilizadores — só se política aceitar.  
19. **Tempo:** 5–10 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 13 — Pré-cutover

1. **Objetivo:** preparar janela e congelamentos duros.  
2. **Ordem:** imediatamente antes de ETAPA 14.  
3. **Dependências:** ETAPA 12 verde; backups OK.  
4. **Pré-requisitos:** comunicação clientes internos/externos.  
5. **Execução:** dry-run checklist; war-room; rever TTL DNS; dump final incremental planeado.  
6. **Validações:** todos GO Anexo C.1.  
7. **Smoke:** dry-run sem alterar DNS prod (ambiente espelho).  
8. **Health:** sistemas em verde.  
9. **Sucesso:** acta pré-cutover.  
10. **Falha:** qualquer NO-GO — adiar.  
11. **Operacional:** fadiga equipa — rodízio.  
12. **Segurança:** credenciais war-room canal cifrado.  
13. **LGPD:** comunicação não expõe dados.  
14. **Financeiro:** horas extra — aprovado.  
15. **Continuidade:** plano comunicação status.  
16. **Downtime:** preparar mensagem expectativa.  
17. **Rollback:** abort antes de DNS — baixo custo.  
18. **Contingência:** adiar 1 semana com comunicação.  
19. **Tempo:** 2–4 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 14 — Cutover produção

1. **Objetivo:** tráfego e integrações **finais** no destino.  
2. **Ordem:** seguir Anexo A estritamente.  
3. **Dependências:** ETAPA 13; equipa presente.  
4. **Pré-requisitos:** checklist secção 20 preparado para tick.  
5. **Execução:** dump incremental final; aplicar; deploy prod; OAuth; webhooks; DNS; smoke imediato.  
6. **Validações:** smoke pós cada bloco.  
7. **Smoke:** login, pagamento leitura, WA piloto.  
8. **Health:** error rate < limiar.  
9. **Sucesso:** acta GO assinada.  
10. **Falha:** acionar Anexo C.3.  
11. **Operacional:** pressão tempo — timer visível.  
12. **Segurança:** expor credenciais em chat — proibido.  
13. **LGPD:** minimizar cópias dumps em discos locais — apagar após upload seguro.  
14. **Financeiro:** custo janela fora horário.  
15. **Continuidade:** legado read-only paralelo.  
16. **Downtime:** alvo minutos (realista: até 1h em cenários OAuth+DNS).  
17. **Rollback:** DNS primeiro.  
18. **Contingência:** degradar funcionalidades não críticas (só com aprovação).  
19. **Tempo:** 4–12 horas janela + 24h vigilância.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 15 — Pós-cutover

1. **Objetivo:** burn-in e estabilização.  
2. **Ordem:** após ETAPA 14.  
3. **Dependências:** observabilidade activa.  
4. **Pré-requisitos:** checklist secção 20 tickado.  
5. **Execução:** monitorização reforçada; triagem erros; tuning WAF; suporte utilizadores.  
6. **Validações:** Anexo E.  
7. **Smoke:** diário automatizado.  
8. **Health:** SLO semanais.  
9. **Sucesso:** período burn-in sem P0.  
10. **Falha:** P0 — incidente formal.  
11. **Operacional:** carga imprevista Black Friday etc.  
12. **Segurança:** picos 401/403 — possível ataque — analisar.  
13. **LGPD:** pedidos titulares atendidos no novo sistema.  
14. **Financeiro:** custos IA disparam — caps.  
15. **Continuidade:** on-call definido.  
16. **Downtime:** incidentes isolados.  
17. **Rollback:** ainda possível DNS se legado vivo.  
18. **Contingência:** escalar fornecedor.  
19. **Tempo:** 7–14 dias.  
20. **Criticidade:** **ALTO**.

---

### ETAPA 16 — Validação final

1. **Objetivo:** **prova** de independência e qualidade.  
2. **Ordem:** antes de ETAPA 17.  
3. **Dependências:** ETAPA 15 completa.  
4. **Pré-requisitos:** métricas 7 dias mínimo recomendado.  
5. **Execução:** revisão checklist secção 22; teste regressão; penetration test leve opcional.  
6. **Validações:** sign-off segurança.  
7. **Smoke:** suite completa.  
8. **Health:** zero alarmes críticos abertos >24h.  
9. **Sucesso:** acta validação final.  
10. **Falha:** prolongar burn-in.  
11. **Operacional:** falsos positivos alertas — afinar.  
12. **Segurança:** vulnerabilidade nova — patch.  
13. **LGPD:** gap processual — corrigir antes revogação.  
14. **Financeiro:** reconciliar custos.  
15. **Continuidade:** documentar lições.  
16. **Downtime:** n/a.  
17. **Rollback:** N/A (validação não destrutiva).  
18. **Contingência:** auditor externo.  
19. **Tempo:** 3–7 dias.  
20. **Criticidade:** **CRÍTICO** gate antes revogação.

---

### ETAPA 17 — Revogação acessos antigos

1. **Objetivo:** **eliminar** superfície legada de autenticação.  
2. **Ordem:** só após ETAPA 16.  
3. **Dependências:** lista completa da ETAPA 1 actualizada.  
4. **Pré-requisitos:** evidência zero tráfego legado.  
5. **Execução:** ver **Anexo G.1** abaixo (expandido).  
6. **Validações:** tentativa login com PAT antigo falha.  
7. **Smoke:** `git fetch` com PAT antigo — denied.  
8. **Health:** N/A.  
9. **Sucesso:** todos tokens antigos inválidos.  
10. **Falha:** serviço ainda usa token — re-auditar.  
11. **Operacional:** quebra CI esquecido — corrigir antes de revogar tudo em bloco.  
12. **Segurança:** revogação em massa sem comunicação — erro humano.  
13. **LGPD:** logs de revogação retidos.  
14. **Financeiro:** licenças antigas canceladas.  
15. **Continuidade:** fase revogação por sistemas (Git, depois CF, etc.).  
16. **Downtime:** possível se algo esquecido.  
17. **Rollback:** emitir novo token temporário controlado.  
18. **Contingência:** janela de revogação em duas vagas.  
19. **Tempo:** 2–5 dias.  
20. **Criticidade:** **CRÍTICO**.

---

### ETAPA 18 — Desativação ambiente antigo

1. **Objetivo:** custo zero e risco zero do legado.  
2. **Ordem:** **sempre** após ETAPA 17 e backups finais.  
3. **Dependências:** aprovação financeira/legal.  
4. **Pré-requisitos:** export final e hashes.  
5. **Execução:** ver **Anexo G.2**.  
6. **Validações:** `dig` não resolve para IP antigo **ou** serviço off.  
7. **Smoke:** URL legado retorna erro esperado.  
8. **Health:** N/A.  
9. **Sucesso:** custos legado encerrados; documentação arquivada.  
10. **Falha:** descoberta dependência — reativar read-only temporário.  
11. **Operacional:** apagar dados sem backup legal — proibido.  
12. **Segurança:** discos sem wipe seguro — risco.  
13. **LGPD:** prazo conservação atendido.  
14. **Financeiro:** evitar custos fantasma.  
15. **Continuidade:** arquivo offline 7 anos se política.  
16. **Downtime:** legado off — esperado.  
17. **Rollback:** reativar VM só com aprovação excepcional.  
18. **Contingência:** arquivo frio em vez de delete.  
19. **Tempo:** 1–3 dias exec + arquivo contínuo.  
20. **Criticidade:** **ALTO** (irreversível).

---

## Anexo G — Revogação e desativação (passo a passo expandido)

### G.1 Revogação do ambiente antigo — passo a passo expandido

### Acessos e identidades

1. **Inventariar** todas as contas com acesso admin: GitHub/GitLab org, Supabase org, Cloudflare account, VPS fornecedor, Asaas, Google Cloud, painel Evolution, Coolify, registos DNS.  
2. **Remover** utilizadores que não pertencem à equipa actual; forçar **re-auth MFA** nos restantes.  
3. **Revogar PATs** pessoais e **Fine-grained tokens**; substituir por **GitHub App** ou token de máquina com âmbito mínimo no destino.  
4. **Revogar deploy keys** do repositório antigo; desactivar **webhooks** do remoto antigo (Lovable, integrações CI antigas).

### SSH e infra

5. Na **VPS antiga**, remover `authorized_keys` de todos excepto break-glass documentado; depois **shutdown**; snapshot final apenas se política exigir.  
6. **Desactivar** utilizadores Linux antigos; auditar `crontab` e `systemd timers` de terceiros.

### Tokens e API keys

7. **Supabase legado:** após export: **pausar** API keys no dashboard se disponível; destruir projeto após período legal.  
8. **Evolution:** invalidar `EVO_KEY` antigo na config antiga; apagar container.  
9. **Asaas / OpenAI / ElevenLabs / Lovable:** rotacionar chaves que alguma vez estiveram no legado; actualizar **só** secrets no **novo** Supabase.

### OAuth

10. No **Google Cloud Console**, remover redirect URIs que apontam para domínios descontinuados; rotacionar **client secret** se política exigir; manter apenas client IDs em uso pelo destino.

### Webhooks

11. **Asaas:** URL webhook → confirmar só URL nova; desactivar URL antiga.  
12. **Telegram:** `deleteWebhook` no bot antigo **apenas** quando novo confirmado.  
13. **Evolution:** limpar webhook global/instance para URL antiga.

### DNS e SSL

14. **DNS:** remover ou actualizar A/CNAME que ainda resolvem para IP antigo; manter **TXT** legais (SPF/DKIM) apontando para **serviços activos** (novo mail se mudou).  
15. **SSL:** revogar/reemitir não é típico; deixar expirar certificados legados ao desligar host; no Cloudflare, remover origin antigo dos pools/load balance.

### Sessões e secrets

16. **Invalidar sessões** de utilizadores na app (forçar logout global) **opcional** pós-cutover se houver risco de token JWT antigo long-lived — avaliar modelo Auth.  
17. **Secrets:** destruir cópias em cofres pessoais, `.env` locais da equipa (comunicação), e backups não cifrados.

---

### G.2 Desativação do ambiente antigo — ordem, riscos e independência

### Ordem correcta de desligamento

1. **Parar ingestão:** webhooks e cron externos já **só** no novo (verificação).  
2. **Read-only legado:** Supabase legado sem writes (se possível); app legado off.  
3. **Backup final** cifrado (PG + Storage manifest + Evolution volume hash).  
4. **Export legal/compliance** para arquivo WORM.  
5. **Desligar** Evolution legado → Docker stop + volume offline.  
6. **Desligar** app legado / proxy legado.  
7. **Pausar/destruir** projeto Supabase legado conforme política de retenção.  
8. **Desligar** VPS legado; **wipe** discos se sensível.  
9. **DNS:** remover apontamentos; manter arquivo de zona exportada em Git privado.  
10. **Revogar** credenciais cloud do legado (última passagem).

### Riscos do desligamento

- **Risco:** descobrir sistema batch a usar SQL direto no PG legado — **mitigação:** scan de conexões antes de off.  
- **Risco:** relatório financeiro mensal ainda a puxar API legado — **mitigação:** reconciliação com Asaas no projeto novo.

### Dependências ocultas

- **Licenças** amarradas a domínio antigo.  
- **Deep links** em e-mails antigos — manter redirect 301 controlado **temporariamente** no novo domínio.

### Backups finais

- Dois médios distintos (ex.: object storage imutável + tape virtual).  
- Registo de **hash SHA-256** do arquivo.

### Auditoria final

- Checklist secção 22; **prova de independência:** desligar legado 24h em **janela de teste** (se política permitir simulação) e observar **zero** erros nos sistemas novos.

### Validação de independência completa

| Teste | Procedimento |
|-------|--------------|
| DNS | `dig` apex/`www` → IP ou CNAME **novos** apenas |
| Supabase | `project_ref` em toda a codebase e secrets **só** novo |
| Webhooks | Painéis externos **sem** URL antiga |
| OAuth | Google Console **sem** URI antiga necessária |
| Git | Remotes e Actions **só** repo novo |
| Evolution | Instância antiga **stopped** e sem tráfego rede |
| Custos | Fatura sem linhas do legado |

---

## Manutenção deste documento

**Owner:** SRE + Owner produto. **Revisão:** após cada migração major ou DR drill. **Versão seguinte:** incrementar `1.1` ao integrar métricas reais de duração da primeira migração executada.

---

*Fim do plano enterprise — migração, takeover, cutover e produção.*

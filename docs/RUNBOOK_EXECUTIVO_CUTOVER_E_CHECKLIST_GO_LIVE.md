# Runbook executivo do dia do cutover + checklist final de GO-LIVE

**Versão:** 1.0  
**Classificação interna:** operacional / produção  
**Contexto crítico:** projeto recebido **apenas via ZIP**; **sem confiança** no ambiente antigo nem no antigo fornecedor de desenvolvimento; **Git original fora de controlo**; **servidor antigo, Supabase antigo e Coolify antigo não reutilizáveis**; objectivo **não** é recuperar legado — é **virada definitiva** para stack **nova e independente**, com **risco mínimo**, **rollback garantido** e **observabilidade activa**.

**Público:** Arquitecto enterprise, SRE, DevOps, Linux, Docker, Supabase, Segurança, Cloudflare, CI/CD, operações críticas, Owner de produto, DPO (quando aplicável).

**Documentos relacionados:** `docs/PLANO_ENTERPRISE_MIGRACAO_CUTOVER_TAKEOVER_PRODUCAO.md`, `docs/CHECKLIST_FINAL_ENTERPRISE_MIGRACAO_PRODUCAO.md`, `docs/DOCUMENTACAO_OPERACIONAL_ENTERPRISE_COMPLETA.md`, `docs/AUDITORIA_*`, `docs/ENGENHARIA_REVERSA_*`.

---

## Legenda de classificação (Parte 2 — checklists)

| Severidade | Significado |
|------------|-------------|
| **CRÍTICO** | Bloqueia GO-LIVE se não cumprido (ou viola segurança/compliance) |
| **ALTO** | Degradação severa ou downtime prolongado se falhar |
| **MÉDIO** | Recuperável em horas; excepção documentada só com aprovação |
| **BAIXO** | Higiene, melhoria contínua, risco residual aceite por escrito |

| Obrigatoriedade | Significado |
|-----------------|---------------|
| **obrigatório** | Tem de estar verde antes de declarar GO-LIVE |
| **recomendado** | Fortemente desejável; falha exige waver assinado |
| **opcional** | Nice-to-have; não bloqueia GO |

---

## Índice de saída (20 secções)

1. [Resumo executivo](#1-resumo-executivo)  
2. [Estratégia de cutover](#2-estratégia-de-cutover)  
3. [Cronograma operacional](#3-cronograma-operacional)  
4. [Runbook completo (por horário)](#4-runbook-completo-por-horário)  
4A. [Procedimentos detalhados por domínio](#4a-procedimentos-detalhados-por-domínio)  
5. [Plano de rollback](#5-plano-de-rollback)  
6. [Plano de contingência](#6-plano-de-contingência)  
7. [Matriz de riscos](#7-matriz-de-riscos)  
8. [Checklist infraestrutura](#8-checklist-infraestrutura)  
9. [Checklist Docker](#9-checklist-docker)  
10. [Checklist Supabase](#10-checklist-supabase)  
11. [Checklist Evolution API](#11-checklist-evolution-api)  
12. [Checklist segurança](#12-checklist-segurança)  
13. [Checklist DNS / Cloudflare](#13-checklist-dns--cloudflare)  
14. [Checklist observabilidade](#14-checklist-observabilidade)  
15. [Checklist backup / recovery](#15-checklist-backup--recovery)  
16. [Checklist validação produção](#16-checklist-validação-produção)  
17. [Checklist desativação ambiente antigo](#17-checklist-desativação-ambiente-antigo)  
18. [Checklist GO / NO-GO](#18-checklist-go--no-go)  
19. [Plano de auditoria pós GO-LIVE](#19-plano-de-auditoria-pós-go-live)  
20. [Critérios de sucesso definitivo](#20-critérios-de-sucesso-definitivo)

**Anexos:** [A — Arquitetura textual final](#anexo-a--arquitetura-textual-final) · [B — Diagrama textual do cutover](#anexo-b--diagrama-textual-do-cutover) · [C — Matriz rollback (gatilhos)](#anexo-c--matriz-rollback-gatilhos) · [D — Plano observabilidade](#anexo-d--plano-observabilidade) · [E — Plano recovery / DR](#anexo-e--plano-recovery--dr) · [F — Plano de comunicação](#anexo-f--plano-de-comunicação)

---

## 1. Resumo executivo

Este documento é o **guia operacional oficial** da **janela de cutover**: define **quem faz o quê**, **quando**, **como validar**, **quando abortar ou reverter**, e **que evidências arquivar**. O cenário assume que **não há confiança** no legado: **não** se depende de SSH, backups, pipelines ou credenciais do antigo servidor, Supabase ou Coolify. A **continuidade** assenta em **dados e configurações já materializados no destino** (novo projeto Supabase, novo VPS, novo Git, novos segredos, novos webhooks e OAuth), com o legado tratado apenas como **referência estática** (código ZIP, exports que a equipa tenha gerado de forma independente) — **nunca** como dependência runtime.

**Objectivos da virada:** eliminar dependências antigas; assumir controlo total; minimizar downtime e risco; validar produção; garantir rollback, segurança, continuidade de negócio, estabilidade, observabilidade e **independência operacional** (nenhum componente de produção novo deve precisar do IP, URL ou chave do ambiente antigo após o GO-LIVE declarado e após a fase de revogação).

**Princípio operacional:** *fail-safe* — em dúvida, **NO-GO** ou **rollback**; nunca “seguir em frente” sem evidência escrita ou log correlacionado.

---

## 2. Estratégia de cutover

### 2.1 Premissas do cenário REAL (ZIP, zero confiança)

- O **código fonte** de verdade pós-takeover é o repositório **novo** (importado do ZIP ou reconstituído), com **histórico controlado** a partir da data de takeover.  
- **Não** existe rollback “para o servidor antigo” como solução preferencial — o rollback operacional é **DNS para um origin estável já preparado** (ex.: release anterior na **mesma** infra nova) ou **reversão de configuração** (webhooks, deploy), **não** reactivação do host legado (proibido por política de risco).  
- **Supabase antigo** não é reutilizado; o cutover é **promoção de tráfego** para o **project_ref** novo já alimentado com dados migrados e validados **antes** de T0.  
- **Coolify antigo** ignorado; apenas **Coolify novo** (ou outro orquestrador aprovado) na VPS nova.

### 2.2 Estratégia “near” zero-downtime

**Realidade:** com mudança simultânea de **DNS**, **OAuth redirects**, **webhooks** (Asaas, Telegram, Evolution) e **URL Supabase** embutida no frontend (`VITE_SUPABASE_*`), o downtime percebido pode ser **zero para utilizadores já com sessão** apenas em parte dos casos; **OAuth** e **WhatsApp** são os maiores vectores de interrupção.

**Como minimizar downtime**

1. **Pré-aquecer** o ambiente novo com hostname **staging** ou `prod-new.<domínio>` com TLS válido e smoke completo **antes** de T0.  
2. **Reduzir TTL** DNS (ex.: 300 s) **≥48 h antes** de T0 (fase T-48h / T-24h).  
3. **Congelar** alterações (deploy, migrations, DNS decorativo) conforme [Anexo F](#anexo-f--plano-de-comunicação).  
4. No **T0**, executar alterações na **ordem** que minimiza janela sem webhook válido (ver [Anexo B](#anexo-b--diagrama-textual-do-cutover)).  
5. Manter **equipa war-room** e **playbooks** de rollback abertos em ecrã.

### 2.3 Troca DNS segura e validação de propagação

- Manter **lista versionada** de RRsets (apex, `www`, subdomínios API, registos TXT SPF/DKIM, etc.).  
- Alterar primeiro em **ambiente de teste** (`dig` contra `1.1.1.1`, `8.8.8.8`, `9.9.9.9`).  
- Após alteração em produção: **validação obrigatória** com `dig +trace` / ferramentas de propagação e **teste HTTPS** desde **3 redes** (operador móvel, fibra, cloud VM outra região).  
- **Não** remover registos TXT críticos (verificação de domínio, SPF) sem mapear para o **novo** serviço de email.

### 2.4 Evitar quebra de webhooks

- **Antes** de T0: URL destino **200/204** em endpoint de health (se existir) ou validação com **assinatura** de teste do fornecedor.  
- **Ordem sugerida:** validar **Asaas** (ambiente alinhado à política) → **Telegram** `setWebhook` → **Evolution** por último se for o maior impacto em mensagens em tempo real.  
- **Evitar duplicidade:** desactivar URL antiga **só** após **200** consistente na nova e **entrada de log** correlacionada na Edge Function correspondente.

### 2.5 Evitar quebra OAuth

- No **Google Cloud Console** (ou IdP equivalente): **Authorized redirect URIs** e **JavaScript origins** devem incluir **exactamente** o hostname **final** de produção (e staging separado).  
- Testar em **T-6h** ou **T-3h** com browser **perfil limpo** (sem cache de consent).  
- Comunicar **re-consent** ou re-login possível após virada.

### 2.6 Evitar quebra WhatsApp (Evolution)

- **Volumes** Evolution com **backup** imediatamente antes de T0; não recriar container sem `docker volume` mapeado.  
- **Webhook** Evolution → `https://<NOVO_REF>.supabase.co/functions/v1/whatsapp-webhook` (e token de validação se implementado).  
- **QR Code:** se **nova** instância, planear janela de re-pareamento; se **migração de volume**, validar reconexão em **T-1h**.

### 2.7 Evitar perda de sessões

- **Evolution:** persistência em volume nomeado; `docker inspect` antes e depois de restart.  
- **Utilizadores app:** JWT Supabase Auth — sessões podem continuar se **JWT secret** e **URL** forem consistentes; se **project** mudou, utilizadores **precisam** de novo login — comunicar.  
- **OAuth Google:** tokens refresh podem invalidar se client mudou — testar fluxo completo.

### 2.8 Validar produção sem interromper operação (pré-T0)

- Servir build de produção no hostname **prod-new** ou staging com **mesmos** `VITE_*` do futuro cutover (ou feature-flag interna).  
- **Canary interno:** grupo de utilizadores piloto com UAT assinado.  
- **Monitorização** comparativa: error rate staging vs baseline (não há baseline legado confiável — usar pilotos).

---

## 3. Cronograma operacional

| Marco temporal | Foco principal | Saída obrigatória |
|----------------|----------------|-------------------|
| **T-48h** | TTL DNS, comunicação, freeze alargado | Lista DNS final + TTL ≤300s activo |
| **T-24h** | Validação infra + Docker + volumes + SSL | Acta “pronto para cutover técnico” |
| **T-12h** | Supabase (RLS, Auth, Storage, Edge) + dados | Smoke CRÍTICO verde |
| **T-6h** | Evolution + webhooks em modo verificação | QR/sessão OK; webhooks teste |
| **T-3h** | OAuth + deploy final artefacto | Browser limpo login OK |
| **T-1h** | War-room, backups, congelamento duro | Checklist GO parcial assinado |
| **T-30m / T-15m / T-5m** | Leitura final, dry-run comandos | Nenhum NO-GO |
| **T0** | Sequência cutover (DNS / config / webhooks) | Acta T0 iniciada |
| **T+5m → T+1h** | Smoke intensivo, alertas | Error rate dentro limiar |
| **T+6h / T+24h / T+48h** | Burn-in, revogação planead, auditoria inicial | Relatório T+48h |

---

## 4. Runbook completo (por horário)

*Cada bloco temporal inclui os **20 campos** exigidos: (1) Objetivo … (20) Evidências necessárias.*

---

### T-48h

1. **Objetivo:** preparar **propagação DNS rápida** e **comunicação** externa/interna; iniciar **freeze** alargado de mudanças não essenciais.  
2. **Responsável:** **SRE (líder de janela)** + Owner produto (comunicação) + Segurança (revisão de superfície).  
3. **Pré-requisitos:** novo ambiente **já** em smoke contínuo em hostname não produtivo; lista de RRsets aprovada; acesso MFA a Cloudflare/registo DNS.  
4. **Dependências:** aprovação de janela; calendário livre de releases paralelos.  
5. **Execução detalhada:** (a) reduzir TTL dos RRsets de produção para valor acordado (ex.: 300); (b) publicar comunicado “janela T0” a stakeholders; (c) abrir ticket war-room com links para este runbook; (d) verificar que **não** há dependência de deploy no **Coolify legado**; (e) confirmar que backups do **novo** Supabase cumprem RPO.  
6. **Comandos necessários (exemplos):** `dig A app.exemplo.com @1.1.1.1` (registar saída); no painel DNS, aplicar TTL; `whois` se mudança de nameservers (evitar T0 se mudar NS).  
7. **Validações obrigatórias:** TTL efectivo visível nos resolvers públicos; comunicação enviada com ID de mail/ticket.  
8. **Smoke tests:** pedido HTTPS ao hostname **novo** (staging/prod-new) retorna 200 e certificado válido.  
9. **Health checks:** uptime check staging verde; disco VPS novo <70% uso.  
10. **Critérios GO:** TTL baixo propagado **ou** plano escrito se domínio não permitir TTL baixo.  
11. **Critérios NO-GO:** impossibilidade de baixar TTL sem quebrar CDN dependente — escalar para decisão **adiar T0**.  
12. **Riscos:** TTL ainda alto → rollback DNS lento; comunicação incompleta → pressão política durante incidente.  
13. **Impacto operacional:** equipa em modo preparação; mudanças bloqueadas.  
14. **Impacto segurança:** exposição de detalhes internos na comunicação — usar linguagem neutra.  
15. **Impacto financeiro:** nulo ou mínimo (só custos já contratados).  
16. **Impacto LGPD:** comunicação não deve mencionar categorias especiais de dados.  
17. **Estratégia rollback:** ainda não há virada — **abort** adiando T0 é preferível a corrigir à pressa.  
18. **Estratégia contingência:** se T0 precisar mover-se +72h, manter staging estável e repetir T-48h.  
19. **Logs necessários:** export de zona DNS **antes** e **depois**; registo de comunicações.  
20. **Evidências necessárias:** PDF ou screenshot TTL; link ticket comunicação; acta assinada T-48h.

---

### T-24h

1. **Objetivo:** **validação integral** da infra nova (VPS, Linux, Docker, volumes, proxy, SSL) sem tocar ainda no tráfego produtivo principal.  
2. **Responsável:** **SRE** + **Especialista Linux/Docker** (pode ser a mesma pessoa em equipa pequena).  
3. **Pré-requisitos:** T-48h GO; credenciais SSH **novas**; acesso read-only a monitoring.  
4. **Dependências:** VPS nova acessível; compose aplicado; certificados válidos.  
5. **Execução detalhada:** percorrer secções **8 e 9** deste documento como script; gravar outputs; validar **persistência** (path de volumes Evolution e dados); validar **proxy** e **SSL** com `curl -vI`; validar **UFW** e **fail2ban**.  
6. **Comandos necessários:** `ssh -i <key> user@vps 'uptime; df -h; free -h; sudo ufw status verbose; sudo fail2ban-client status; docker ps --format \"table {{.Names}}\t{{.Status}}\"; docker volume ls'`; `curl -vI https://app-staging.exemplo.com`; `openssl s_client -connect app-staging.exemplo.com:443 -servername app-staging.exemplo.com </dev/null 2>/dev/null | openssl x509 -noout -dates`.  
7. **Validações obrigatórias:** todos os containers `healthy` ou `running` com política de restart; apenas portas esperadas em `ss -tulpn`.  
8. **Smoke tests:** abrir SPA staging; login; chamada API Supabase visível na rede (sem segredos em screenshot).  
9. **Health checks:** endpoint de readiness do proxy; Docker healthchecks.  
10. **Critérios GO:** zero NO-GO da checklist infra + Docker.  
11. **Critérios NO-GO:** disco quase cheio; container restart loop; SSL inválido.  
12. **Riscos:** descoberta tardia de misconfig — corrigir antes T-12h ou adiar T0.  
13. **Impacto operacional:** 2–4 horas de trabalho concentrado.  
14. **Impacto segurança:** se SSH ainda aceita password — **bloquear T0**.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** staging não deve usar cópia integral de PII real sem DPO.  
17. **Estratégia rollback:** corrigir infra nova; **não** envolver legado.  
18. **Estratégia contingência:** segunda VM espelho (DR) se disponível.  
19. **Logs necessários:** `journalctl` relevante; logs do proxy; logs Docker.  
20. **Evidências necessárias:** ficheiro texto com saídas de comandos; checklist 8–9 tickado.

---

### T-12h

1. **Objetivo:** validar **Supabase** (PG, Auth, RLS, Storage, Edge, webhooks de entrada **para o project_ref novo**).  
2. **Responsável:** **Especialista Supabase** + Dev backend.  
3. **Pré-requisitos:** migrations aplicadas; dados migrados e reconciliados; secrets Edge definidos.  
4. **Dependências:** T-24h GO; URL e keys do **projeto novo** apenas.  
5. **Execução detalhada:** executar checklist **secção 10**; testes RLS representativos; upload/download Storage; invocar Edge críticas com tokens válidos; verificar logs sem vazamento de `service_role`.  
6. **Comandos necessários:** `supabase functions list --project-ref <NOVO>` (CLI autenticada); `curl -i -H "Authorization: Bearer <JWT>" -H "apikey: <ANON>" https://<NOVO_REF>.supabase.co/rest/v1/<tabela>?limit=1`; testes `curl` para webhooks com payloads de teste **fornecidos pelo runbook interno** (sem dados reais).  
7. **Validações obrigatórias:** políticas RLS negam acesso sem JWT; funções `ACTIVE`; Storage CORS não aberto a `* ` em produção sem waver.  
8. **Smoke tests:** login; criação leitura registo autorizado; Edge `whatsapp-webhook` responde 401/400 controlado sem payload (comportamento esperado documentado).  
9. **Health checks:** dashboard Supabase sem incidentes; latência queries aceitável.  
10. **Critérios GO:** checklist 10 sem itens CRÍTICOS em falta.  
11. **Critérios NO-GO:** falha RLS; erro 500 massivo em REST.  
12. **Riscos:** divergência de schema entre ZIP e migrations — exige hotfix **antes** T0 ou adiar.  
13. **Impacto operacional:** possível correção de policies — documentar versão.  
14. **Impacto segurança:** `verify_jwt` incorrecto em função sensível — **NO-GO**.  
15. **Impacto financeiro:** quotas — verificar limites plano.  
16. **Impacto LGPD:** dados em logs de debug — desactivar verbosidade.  
17. **Estratégia rollback:** reverter deploy Edge para versão anterior; **não** tocar DNS.  
18. **Estratégia contingência:** read-only temporário na app se writes arriscados (só com aprovação negócio).  
19. **Logs necessários:** Supabase logs API; Edge logs; Postgres logs se disponíveis.  
20. **Evidências necessárias:** export CSV contagens chave tabelas; screenshots dashboard (sem segredos).

---

### T-6h

1. **Objetivo:** validar **Evolution API** (containers, sessões, QR, webhooks, mensagens, reconexão).  
2. **Responsável:** **DevOps** + owner funcional WhatsApp.  
3. **Pré-requisitos:** Evolution no **novo** Docker; `EVO_KEY` nos secrets Supabase; Edge `wuzapi-proxy` / `whatsapp-webhook` alinhados ao **NOVO_REF**.  
4. **Dependências:** T-12h GO; conectividade HTTPS outbound da VPS para Supabase.  
5. **Execução detalhada:** percorrer checklist **secção 11**; enviar mensagem teste; receber; reiniciar container e verificar reconexão automática; confirmar webhook com evento sintético.  
6. **Comandos necessários:** `docker logs evolution --tail 200`; `docker inspect evolution --format '{{json .Mounts}}' | jq`; teste API Evolution com header de auth (guardar comandos **sem** colar keys em chats).  
7. **Validações obrigatórias:** volume montado; após restart, sessão não perdida **ou** procedimento de QR documentado.  
8. **Smoke tests:** mensagem eco piloto.  
9. **Health checks:** latência interna; fila de erros vazia.  
10. **Critérios GO:** envio/recepção OK; webhook visto nos logs Supabase.  
11. **Critérios NO-GO:** Evolution só em logs de erro de auth.  
12. **Riscos:** bloqueio de IP pela Meta/cloud — ter plano B (outbound IP).  
13. **Impacto operacional:** possível re-QR — comunicar negócio.  
14. **Impacto segurança:** Evolution UI exposta na internet — tunnel/VPN apenas.  
15. **Impacto financeiro:** custo número business.  
16. **Impacto LGPD:** conteúdo mensagens em logs — mascarar.  
17. **Estratégia rollback:** manter ordem de troca webhook Evolution **após** outros sistemas estáveis; rollback = reverter URL webhook no painel Evolution **só** se ainda existir instância paralela (neste cenário **não** há legado — rollback é **correção forward** na mesma infra).  
18. **Estratégia contingência:** instância secundária standby (se política).  
19. **Logs necessários:** Docker evolution; Edge `whatsapp-webhook`.  
20. **Evidências necessárias:** IDs mensagem teste; timestamps correlacionados.

---

### T-3h

1. **Objetivo:** fechar **OAuth**, **deploy final** do frontend e **validação CI/CD** do artefacto que irá receber tráfego pós-DNS.  
2. **Responsável:** **Dev lead** + Segurança (OAuth).  
3. **Pré-requisitos:** redirect URIs finais no Google Console; build com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do **novo** projeto.  
4. **Dependências:** pipeline produção verde; artefacto imutável (tag/digest).  
5. **Execução detalhada:** (a) deploy no Coolify **novo**; (b) validar variáveis de ambiente no runtime; (c) login Google em browser limpo; (d) email/password se aplicável.  
6. **Comandos necessários:** `curl -sS https://app.exemplo.com | head` (após DNS **ainda** pode apontar ao antigo — usar hostname **prod-new** para validação pré-DNS); inspeccionar headers `content-security-policy` se existir.  
7. **Validações obrigatórias:** artefacto corresponde ao commit/tag aprovado; **não** há `lovable.app` ou URL Supabase antiga no bundle (grep em artefacto CI).  
8. **Smoke tests:** login completo OAuth.  
9. **Health checks:** 200 em `/`; assets 200.  
10. **Critérios GO:** OAuth OK; bundle sem referências ao legado.  
11. **Critérios NO-GO:** redirect mismatch `redirect_uri_mismatch`.  
12. **Riscos:** esquecer JavaScript origin — bloqueia login massivo.  
13. **Impacto operacional:** necessidade de hotfix front — arrisca T0.  
14. **Impacto segurança:** expor client_secret em repo — auditoria imediata.  
15. **Impacto financeiro:** builds extra em minutos CI.  
16. **Impacto LGPD:** consent screen incorrecto — revisão legal.  
17. **Estratégia rollback:** redeploy digest anterior no **mesmo** Coolify novo.  
18. **Estratégia contingência:** manter prod-new com login OK enquanto DNS ainda antigo.  
19. **Logs necessários:** logs proxy; logs browser console capturados de forma anonimizada.  
20. **Evidências necessárias:** screenshot OAuth sucesso (sem tokens); output pipeline com digest.

---

### T-1h

1. **Objetivo:** **congelamento duro**, **war-room**, revisão **GO/NO-GO**, backups finais **no destino**.  
2. **Responsável:** **Owner produto** (decisão GO) + **SRE** (execução técnica) + **Segurança** (sign-off).  
3. **Pré-requisitos:** T-3h GO; todos os checklists CRÍTICOS **obrigatórios** em verde ou waivers assinados (máx. recomendado).  
4. **Dependências:** equipa presente; canal voz/chat dedicado; cofre de credenciais aberto.  
5. **Execução detalhada:** leitura em voz alta da sequência **T0**; designação de **executor DNS**, **executor webhooks**, **executor monitorização**; verificar relógios NTP; último backup Supabase manual se política exigir; export DNS actual.  
6. **Comandos necessários:** `date -u`; `timedatectl status`; snapshot/backup comandos específicos do fornecedor.  
7. **Validações obrigatórias:** lista de presença war-room; ninguém em férias sem substituto.  
8. **Smoke tests:** repetir smoke mínimo (30 min checklist).  
9. **Health checks:** todos verdes.  
10. **Critérios GO:** assinatura **pré-GO** no checklist secção 18.  
11. **Critérios NO-GO:** qualquer item CRÍTICO obrigatório em falta — **adiar T0**.  
12. **Riscos:** erro humano por fadiga — rodízio 15 min.  
13. **Impacto operacional:** equipa em standby total.  
14. **Impacto segurança:** partilha de segredos em chat não cifrado — proibido.  
15. **Impacto financeiro:** horas war-room.  
16. **Impacto LGPD:** DPO em cópia se dados sensíveis em jogo.  
17. **Estratégia rollback:** plano lido em voz alta; responsáveis nomeados.  
18. **Estratégia contingência:** abort T0 se condição meteorológica organizacional má (ex.: incidente paralelo empresa).  
19. **Logs necessários:** gravação de decisões no ticket (texto).  
20. **Evidências necessárias:** acta T-1h assinada digitalmente.

---

### T-30min

1. **Objetivo:** **pausa técnica** — zero alterações espontâneas; só leitura e confirmação.  
2. **Responsável:** SRE líder.  
3. **Pré-requisitos:** T-1h GO.  
4. **Dependências:** nenhuma alteração pendente em PR.  
5. **Execução detalhada:** re-executar `dig` baseline; confirmar que monitores estão a alertar canal correcto; testar envio mensagem **silenciosa** piloto.  
6. **Comandos necessários:** `dig A app.exemplo.com @1.1.1.1 +short`; `curl -o /dev/null -s -w '%{http_code}' https://prod-new.exemplo.com/`.  
7. **Validações obrigatórias:** valores DNS **ainda** pré-cutover documentados.  
8. **Smoke tests:** mínimos.  
9. **Health checks:** verde.  
10. **Critérios GO:** calmaria técnica.  
11. **Critérios NO-GO:** apareceu incidente novo — reavaliar GO.  
12. **Riscos:** último minuto hotfix — **evitar**.  
13. **Impacto operacional:** baixo.  
14. **Impacto segurança:** hotfix sem review — alto.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** nulo.  
17. **Estratégia rollback:** abort até incidente resolvido.  
18. **Estratégia contingência:** deslocar T0 +30m **uma única vez** se política permitir.  
19. **Logs necessários:** prints de estado.  
20. **Evidências necessárias:** screenshot monitoring.

---

### T-15min

1. **Objetivo:** **sincronizar relógios humanos** — countdown, confirmação final.  
2. **Responsável:** Owner produto + SRE.  
3. **Pré-requisitos:** T-30min OK.  
4. **Dependências:** n/a.  
5. **Execução detalhada:** confirmar **ordem T0** escrita no quadro; confirmar **quem** executa cada passo; desactivar autoscale agressivo se causar restart durante pico (se aplicável).  
6. **Comandos necessários:** n/a (gestão).  
7. **Validações obrigatórias:** todos em mute exceto executor de comando.  
8. **Smoke tests:** n/a.  
9. **Health checks:** verde.  
10. **Critérios GO:** confirmação verbal “pronto”.  
11. **Critérios NO-GO:** alguém reporta anomalia — abort.  
12. **Riscos:** falha de comunicação.  
13. **Impacto operacional:** stress.  
14. **Impacto segurança:** baixo.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** nulo.  
17. **Estratégia rollback:** abort.  
18. **Estratégia contingência:** countdown pausa.  
19. **Logs necessários:** ticket tempo real.  
20. **Evidências necessárias:** mensagem “GO T0” no canal auditável.

---

### T-5min

1. **Objetivo:** **última verificação** de acessos (MFA, VPN) e de janelas de manutenção de terceiros.  
2. **Responsável:** Segurança + SRE.  
3. **Pré-requisitos:** T-15min OK.  
4. **Dependências:** fornecedores críticos sem manutenção própria.  
5. **Execução detalhada:** verificar status page Cloudflare/Supabase/registo; confirmar telefone de escalação Asaas se pagamentos em jogo.  
6. **Comandos necessários:** status APIs públicas via `curl` headers.  
7. **Validações obrigatórias:** status verde.  
8. **Smoke tests:** n/a.  
9. **Health checks:** verde.  
10. **Critérios GO:** sem incidente terceiro.  
11. **Critérios NO-GO:** incidente terceiro global — avaliar adiar.  
12. **Riscos:** outage cloud regional.  
13. **Impacto operacional:** pode forçar adiamento.  
14. **Impacto segurança:** phishing durante janela — alertar equipa.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** nulo.  
17. **Estratégia rollback:** abort T0.  
18. **Estratégia contingência:** novo T0 em 24h.  
19. **Logs necessários:** capturas status page.  
20. **Evidências necessárias:** anexo ao ticket.

---

### T0 (início da virada)

1. **Objetivo:** executar a **sequência de cutover** na ordem aprovada (ver Anexo B) até DNS e integrações refletirem o **destino**.  
2. **Responsável:** **SRE executor** + **Executor webhooks** + **Executor DNS** (podem ser roles distintas).  
3. **Pré-requisitos:** mensagem “GO T0” registada; acta T-1h assinada.  
4. **Dependências:** acessos MFA válidos; backups do destino concluídos.  
5. **Execução detalhada (ordem típica sem legado):**  
   - **(A)** Aplicar **dump incremental final** ou última sincronização de dados acordada para Supabase **novo** (se ainda não aplicado em T-12h — preferível ter concluído antes).  
   - **(B)** **Deploy** artefacto final no origin **novo** (Coolify novo).  
   - **(C)** **Deploy Edge Functions** versão aprovada + `supabase secrets` finais.  
   - **(D)** **Actualizar webhooks** externos (Asaas → Telegram → Evolution conforme risco).  
   - **(E)** **Alterar DNS** produção para o origin novo (ou activar CNAME que apontava a prod-new).  
   - **(F)** **Validar propagação** e smoke imediato.  
6. **Comandos necessários:** passos DNS no UI Cloudflare/registo (documentar valores **antes/depois**); `dig` multi-resolver; `curl -vI https://app.exemplo.com`; invocar webhooks de teste nos painéis fornecedores.  
7. **Validações obrigatórias:** cada passo (A–F) com **sub-check** verde antes do seguinte.  
8. **Smoke tests:** login; página principal; uma operação crítica de negócio; WhatsApp piloto; leitura webhook Asaas (sandbox ou modo leitura conforme política).  
9. **Health checks:** error rate < limiar; latência < limiar; disco estável.  
10. **Critérios GO:** smoke T0 verde em **todos** os fluxos CRÍTICOS definidos na secção 18.  
11. **Critérios NO-GO:** erro massivo auth; 5xx sustentado > limiar; perda dados detectada.  
12. **Riscos:** janela longa sem rollback claro — mitigar com ordem estrita.  
13. **Impacto operacional:** possível interrupção breve; comunicação pré-enviada.  
14. **Impacto segurança:** pico de scans após DNS — WAF activo.  
15. **Impacto financeiro:** falha pagamento — impacto directo receita.  
16. **Impacto LGPD:** se dados em trânsito — minimizar dumps locais; apagar ficheiros temporários.  
17. **Estratégia rollback:** ver [secção 5](#5-plano-de-rollback) e [Anexo C](#anexo-c--matriz-rollback-gatilhos).  
18. **Estratégia contingência:** **rollback DNS** para valor **pré-T0** **apenas** se ainda existir origin estável **documentado** (ex.: prod-new servindo tráfego internamente) — neste cenário ZIP, preferir **manter DNS** e **reverter deploy** no **novo** origin.  
19. **Logs necessários:** logs proxy 5xx; Supabase API logs; Edge logs; Cloudflare analytics.  
20. **Evidências necessárias:** CSV com timestamps de cada passo; screenshots DNS; IDs de deploy.

---

### T+5min

1. **Objetivo:** **detecção precoce** de falha catastrófica.  
2. **Responsável:** SRE monitorização.  
3. **Pré-requisitos:** T0 executado.  
4. **Dependências:** dashboards activos.  
5. **Execução detalhada:** observar taxa 5xx, latência p95, erros Auth; verificar fila webhooks; testar login de 2 contas distintas.  
6. **Comandos necessários:** queries dashboard; `curl` repetido com intervalo.  
7. **Validações obrigatórias:** nenhum alerta CRÍTICO disparado >2 ciclos consecutivos.  
8. **Smoke tests:** login rápido.  
9. **Health checks:** uptime probe prod verde.  
10. **Critérios GO:** estabilidade.  
11. **Critérios NO-GO:** alerta CRÍTICO confirmado — iniciar **decisão rollback em 15 min**.  
12. **Riscos:** falso positivo — procedimento de confirmação dupla.  
13. **Impacto operacional:** equipa em tensão máxima.  
14. **Impacto segurança:** bloqueios WAF a utilizadores legítimos — afinar após estabilidade.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** nulo.  
17. **Estratégia rollback:** janela **curta** para rollback DNS ainda viável se TTL baixo.  
18. **Estratégia contingência:** feature degrade (só com aprovação).  
19. **Logs necessários:** export 5 min de access logs.  
20. **Evidências necessárias:** gráfico error rate anexado.

---

### T+15min

1. **Objetivo:** primeira expansão de smoke **além** do mínimo T+5min; confirmar que **webhooks** e **Auth** mantêm taxa de sucesso após primeira rodada de tráfego real.  
2. **Responsável:** **SRE** (coordenação) + **Dev** (interpretação de erros de aplicação).  
3. **Pré-requisitos:** T+5min sem alerta CRÍTICO confirmado; canais de log acessíveis.  
4. **Dependências:** identificação de `request_id` / `trace` entre proxy, app e Supabase.  
5. **Execução detalhada:** (a) executar subset **CRÍTICO** do checklist secção 16 (login, página inicial, uma operação de escrita autorizada); (b) verificar nos logs Edge as primeiras chamadas `whatsapp-webhook` / `asaas-webhook` / `telegram-webhook` sem stack exception; (c) comparar contagem 2xx vs 5xx nos últimos 15 min no proxy; (d) validar que **não** há pico de `429` inesperado (rate limit mal calibrado).  
6. **Comandos necessários:** `curl -sS -o /dev/null -w '%{http_code}' https://app.exemplo.com/` repetido 5×; consultas dashboard Cloudflare “Security events”; filtro logs por nome da função Edge.  
7. **Validações obrigatórias:** taxa 5xx **abaixo** do limiar interino definido no acta T0 (ex.: <1% em endpoints principais); nenhum erro de “Invalid JWT” em massa para utilizadores legítimos.  
8. **Smoke tests:** login com **duas** contas de perfis diferentes (ex.: admin vs operador) se existir RBAC.  
9. **Health checks:** Docker `healthy`; Evolution sem restart count incrementado anormalmente.  
10. **Critérios GO:** subset CRÍTICO verde; webhooks com **pelo menos** um evento processado com sucesso **ou** confirmação explícita de ausência de tráfego esperado no período.  
11. **Critérios NO-GO:** falha **Auth** generalizada; webhook crítico com **100%** falha comprovada.  
12. **Riscos:** confundir erro de cache CDN com erro real — usar query string de cache-bust **controlada** ou purge selectivo.  
13. **Impacto operacional:** início de carga real — suporte em prontidão.  
14. **Impacto segurança:** primeiro pico de tentativas de login — WAF e MFA absorvem; monitorizar geo anómala.  
15. **Impacto financeiro:** chamadas a APIs de terceiros sob carga real — observar quotas.  
16. **Impacto LGPD:** logs de debug temporários **desligados**; não copiar payloads WA para tickets.  
17. **Estratégia rollback:** ainda em janela favorável para **rollback de deploy** (rápido) ou **DNS** (se TTL baixo); decisão em **≤15 min** se NO-GO.  
18. **Estratégia contingência:** se apenas um webhook falhar, isolar causa (Edge vs fornecedor) antes de rollback global.  
19. **Logs necessários:** fatia de access log do proxy (15 min); logs Supabase API; logs Edge filtrados.  
20. **Evidências necessárias:** acta **T+15min** com tabela (métrica, valor, limiar, OK/NOK).

---

### T+30min

1. **Objetivo:** **consolidar** smoke alargado; validar **integrações** e **persistência** sob duração útil (~30 min pós-T0); preparar decisão para **T+1h**.  
2. **Responsável:** **SRE** + **QA** (se disponível) + ponto de contacto **negócio** para 1 fluxo real controlado.  
3. **Pré-requisitos:** T+15min GO; nenhum incidente P0 em investigação sem dono.  
4. **Dependências:** acesso a painel Asaas (leitura) e Evolution admin (protegido) para confirmação visual.  
5. **Execução detalhada:** (a) percorrer **maior parte** do checklist secção 16 (incluindo uploads leves, IA não destrutiva se política permitir, leitura de estado de pagamentos); (b) validar **reconexão** Evolution apenas se política permitir restart **não** destrutivo (preferir observar métricas sem restart se risco); (c) correlacionar IDs de mensagens / eventos financeiros entre fornecedor e logs Edge; (d) verificar **crescimento** de disco e memória.  
6. **Comandos necessários:** `docker stats --no-stream`; `df -h`; scripts internos de teste de API (sem segredos em linha de comando — usar env file temporário seguro).  
7. **Validações obrigatórias:** taxa sucesso webhooks ≥ limiar acordado; latência p95 abaixo do limiar; **backups** pós-cutover agendados **não** falharam (ver secção 15).  
8. **Smoke tests:** suite média (20–40 min) conforme catálogo de testes da organização.  
9. **Health checks:** uptime externo verde em **≥2** regiões; alertas **silenciosos** (sem disparos falsos recorrentes).  
10. **Critérios GO:** suite **CRÍTICA** completa verde; itens **ALTO** com no máximo **1** waver assinado.  
11. **Critérios NO-GO:** falha **pagamentos** ou **WA** em fluxo marcado como bloqueante; ou evidência de **fuga** de dados em logs.  
12. **Riscos:** utilizadores com DNS em cache antigo prolongado — suporte com script de diagnóstico `dig` para cliente.  
13. **Impacto operacional:** volume de tickets pode subir — FAQ pré-aprovado.  
14. **Impacto segurança:** rate limit pode bloquear utilizadores corporativos atrás do mesmo NAT — afinar após T+30min com dados.  
15. **Impacto financeiro:** custos IA/terceiros — primeiro dia pode ser atípico; não confundir com fuga.  
16. **Impacto LGPD:** dados em tickets de suporte — treinamento rápido pós-cutover.  
17. **Estratégia rollback:** idem T+15min; se estabilidade **boa**, desencorajar rollback por ruído não confirmado.  
18. **Estratégia contingência:** degradar feature **não** crítica (ex.: relatório pesado) se aliviar sistema — só com waver.  
19. **Logs necessários:** agregados 30 min por serviço; export resumido (sem PII) para arquivo.  
20. **Evidências necessárias:** acta **T+30min** anexada ao ticket principal com lista de testos e resultado PASS/FAIL.

---

### T+1h

1. **Objetivo:** **primeira declaração** de GO-LIVE **condicional** ou decisão de rollback.  
2. **Responsável:** Owner produto + SRE.  
3. **Pré-requisitos:** T+30min OK.  
4. **Dependências:** evidências anexadas.  
5. **Execução detalhada:** reunião 15 min; decisão documentada; se GO: comunicar “produção no novo ambiente” conforme Anexo F.  
6. **Comandos necessários:** n/a.  
7. **Validações obrigatórias:** checklist secção 18 parcialmente assinado “GO condicional”.  
8. **Smoke tests:** regressão curta.  
9. **Health checks:** SLO 1h inicial.  
10. **Critérios GO:** secção 18 GO condicional permitido.  
11. **Critérios NO-GO:** violação SLO — rollback.  
12. **Riscos:** pressão política para declarar sucesso cedo — resistir sem dados.  
13. **Impacto operacional:** comunicação externa.  
14. **Impacto segurança:** pico tráfego — observar WAF.  
15. **Impacto financeiro:** nulo.  
16. **Impacto LGPD:** comunicação sem dados pessoais.  
17. **Estratégia rollback:** ainda viável rollback DNS/deploy conforme matriz.  
18. **Estratégia contingência:** equipa reforçada +2h.  
19. **Logs necessários:** agregado 1h.  
20. **Evidências necessárias:** acta T+1h.

---

### T+6h

1. **Objetivo:** **burn-in** inicial; validar **observabilidade** e **backups** pós-cutover.  
2. **Responsável:** SRE.  
3. **Pré-requisitos:** GO condicional ou GO pleno.  
4. **Dependências:** alertas funcionando.  
5. **Execução detalhada:** rever secções **14 e 15**; verificar job backup Supabase; spot-check logs PII.  
6. **Comandos necessários:** API backup status se disponível; scripts housekeeping disco.  
7. **Validações obrigatórias:** backup pós-T0 agendado/correu.  
8. **Smoke tests:** amostragem aleatória funcionalidades.  
9. **Health checks:** verde.  
10. **Critérios GO:** sem incidente P0.  
11. **Critérios NO-GO:** incidente P0 — rollback ou hotfix controlado.  
12. **Riscos:** degradação lenta (memory leak).  
13. **Impacto operacional:** turnos.  
14. **Impacto segurança:** scan vulnerabilidades — monitorizar.  
15. **Impacto financeiro:** custo egress.  
16. **Impacto LGPD:** retenção logs — conforme política.  
17. **Estratégia rollback:** prioridade **hotfix** se rollback DNS já não desejável.  
18. **Estratégia contingência:** escalar fornecedor.  
19. **Logs necessários:** agregados 6h.  
20. **Evidências necessárias:** relatório T+6h PDF.

---

### T+24h

1. **Objetivo:** **declaração GO-LIVE plena** (se critérios atingidos) ou plano de correção.  
2. **Responsável:** Owner + SRE + Segurança.  
3. **Pré-requisitos:** 24h de métricas; zero P0 aberto >4h.  
4. **Dependências:** feedback negócio/suporte.  
5. **Execução detalhada:** revisão formal secção **18** e **20**; iniciar planeamento **revogação** (secção 17) **não executar ainda** se política exigir espera 48h.  
6. **Comandos necessários:** queries métricas; revisão custos.  
7. **Validações obrigatórias:** webhooks estáveis; OAuth estável; WA estável.  
8. **Smoke tests:** suite regressão média.  
9. **Health checks:** SLO 24h.  
10. **Critérios GO:** assinatura GO pleno.  
11. **Critérios NO-GO:** SLO violado — plano correcção.  
12. **Riscos:** problemas só visíveis após 1 ciclo negócio completo.  
13. **Impacto operacional:** suporte pode normalizar.  
14. **Impacto segurança:** rever tentativas falhadas MFA.  
15. **Impacto financeiro:** reconciliar APIs pagas.  
16. **Impacto LGPD:** pedidos titulares se processados no novo ambiente.  
17. **Estratégia rollback:** menos atrativo — preferir **forward fix**.  
18. **Estratégia contingência:** post-mortem agendado se incidentes P2+.  
19. **Logs necessários:** arquivo 24h agregado.  
20. **Evidências necessárias:** acta T+24h.

---

### T+48h

1. **Objetivo:** **encerramento formal** da janela de cutover; handover para operação “steady state”; **início** auditoria pós GO-LIVE (secção 19).  
2. **Responsável:** SRE + Segurança + DPO (pontual).  
3. **Pré-requisitos:** T+24h GO pleno **ou** plano excepção aprovado.  
4. **Dependências:** checklist observabilidade e backup verdes.  
5. **Execução detalhada:** revisão secção **17** (desativação legado) — neste cenário **sem confiança no antigo**, a desativação é sobretudo **revogação de credenciais e apontadores públicos** que ainda possam existir (OAuth URIs antigos, webhooks mortos, DNS órfão); **não** há “servidor antigo” a desligar sob controlo — documentar **não uso** e **prova** de que produção não resolve para IPs antigos.  
6. **Comandos necessários:** `dig` produção; `curl -sS -o /dev/null -w '%{remote_ip}' https://app.exemplo.com` repetido em múltiplos locais; grep em repositório **novo** por strings de URL antiga Supabase (`grep -R \"supabase.co\"` controlado).  
7. **Validações obrigatórias:** nenhuma referência runtime ao project_ref antigo.  
8. **Smoke tests:** amostra final.  
9. **Health checks:** verde.  
10. **Critérios GO:** critérios secção **20** iniciados.  
11. **Critérios NO-GO:** ainda há tráfego ou config a apontar para antigo — abrir incidente “dependência residual”.  
12. **Riscos:** dependência humana (alguém com `.env` antigo) — campanha interna.  
13. **Impacto operacional:** retorno a on-call normal.  
14. **Impacto segurança:** início rotação final de segredos expostos na fase de migração.  
15. **Impacto financeiro:** fecho de custos da janela.  
16. **Impacto LGPD:** actualizar registo de actividades.  
17. **Estratégia rollback:** N/A steady state; incidentes seguem ITIL.  
18. **Estratégia contingência:** auditoria externa se achados graves.  
19. **Logs necessários:** sumário 48h.  
20. **Evidências necessárias:** relatório final T+48h + anexo grep/curl.

---

## 4A. Procedimentos detalhados por domínio

*Procedimentos de apoio ao runbook; executar na janela **T-24h** a **T+1h** conforme indicado em cada bloco.*

### 4A.1 Infraestrutura — validação VPS

| Passo | Acção | Comando / evidência |
|-------|--------|---------------------|
| 1 | Confirmar região, tipo VM, IP estático | Painel fornecedor + screenshot |
| 2 | Verificar carga e uptime | `uptime`; load average vs CPUs |
| 3 | Verificar espaço em disco | `df -h`; alerta se >75% |
| 4 | Verificar relógio (cutover sincronizado) | `timedatectl status` |
| 5 | Confirmar que **não** existe dependência de rede ao IP legado | `ip route`; regras documentadas |

### 4A.2 Linux — validação pós-hardening

| Passo | Acção | Comando / evidência |
|-------|--------|---------------------|
| 1 | Estado firewall | `sudo ufw status verbose` |
| 2 | SSH só chave | `sudo grep -E '^PasswordAuthentication|^PermitRootLogin' /etc/ssh/sshd_config` |
| 3 | fail2ban | `sudo fail2ban-client status` |
| 4 | Portas em escuta | `sudo ss -tulpn` + comparar com baseline aprovado |
| 5 | Actualizações pendentes críticas | `sudo apt list --upgradable` (decisão documentada) |

### 4A.3 Docker — validação

| Passo | Acção | Comando / evidência |
|-------|--------|---------------------|
| 1 | Versão Engine | `docker version` |
| 2 | Containers | `docker ps -a` |
| 3 | Restart policy | `docker inspect <c> --format '{{.HostConfig.RestartPolicy.Name}}'` |
| 4 | Health | `docker inspect <c> --format '{{json .State.Health}}'` |
| 5 | Uso de recursos | `docker stats --no-stream` |

### 4A.4 Volumes e persistência

| Passo | Acção | Comando / evidência |
|-------|--------|---------------------|
| 1 | Listar volumes | `docker volume ls` |
| 2 | Mapear mounts Evolution | `docker inspect evolution --format '{{json .Mounts}}' \| jq` |
| 3 | Escrever ficheiro teste em path montado (não produtivo) e verificar sobrevivência | `docker restart evolution` + re-leitura |
| 4 | Confirmar backup de volume agendado | política + log de job |

### 4A.5 Proxy reverso e SSL

| Passo | Acção | Comando / evidência |
|-------|--------|---------------------|
| 1 | TLS handshake | `curl -vI https://<hostname>/` |
| 2 | Cadeia e datas | `openssl s_client -connect <hostname>:443 -servername <hostname> </dev/null 2>/dev/null \| openssl x509 -noout -issuer -dates` |
| 3 | HSTS (se política) | headers `strict-transport-security` |
| 4 | Origem upstream saudável | logs do proxy sem upstream refused |

### 4A.6 Supabase — banco

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Confirmar `project_ref` **novo** em todas as configs | grep controlado em repo + env CI |
| 2 | Contagens pós-migração vs esperado | SQL agregado arquivado |
| 3 | Integridade amostral | checksums ou amostragem de registos chave |

### 4A.7 Supabase — Auth

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Site URL e redirects **só** domínios novos | screenshot dashboard |
| 2 | Templates de email sem links legados | revisão manual |
| 3 | Teste login / recovery | vídeo interno ou ticket com timestamps |

### 4A.8 Supabase — RLS e policies

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Teste **permitido** com JWT válido | resultado OK |
| 2 | Teste **negado** sem JWT ou JWT outro tenant | 401/empty conforme esperado |
| 3 | Matriz papel × tabela | folha assinada QA |

### 4A.9 Supabase — Edge Functions

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | `supabase functions list` no ref novo | output arquivado |
| 2 | Invocar função interna com JWT válido | log sem 500 |
| 3 | Invocar webhook **sem** assinatura válida | rejeição documentada |

### 4A.10 Supabase — Storage e webhooks de entrada

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Upload + download ficheiro teste | hash igual |
| 2 | CORS | não aberto além do necessário |
| 3 | Webhook WA/Asaas/Telegram | linha de log correlacionada |

### 4A.11 Evolution API — containers, sessões, QR, webhooks, mensagens, reconexão

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | `docker ps` nome imagem digest | registo |
| 2 | Sessão persistente | restart test sem perda **ou** QR planeado |
| 3 | QR piloto | captura de ecrã interna policy-compliant |
| 4 | Webhook URL = `https://<NOVO_REF>.supabase.co/functions/v1/whatsapp-webhook` (+ token se houver) | screenshot painel |
| 5 | Envio e recepção | IDs mensagem |
| 6 | Reconexão | logs limpos após reconnect |

### 4A.12 Cloudflare / DNS — troca, propagação, SSL, WAF, proxy, rate limiting

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Export zona pré-mudança | ficheiro versionado |
| 2 | Aplicar alteração RRset | screenshot “after” |
| 3 | Propagação | `dig` de 3 resolvers + 1 VM cloud outra região |
| 4 | SSL | SSL Labs ou `curl` cadeia |
| 5 | WAF | regra simulada bloqueada em log |
| 6 | Proxy orange/grey conforme desenho | screenshot |
| 7 | Rate limit | teste controlado (sem abuso) — bloqueio esperado |

### 4A.13 Deploy — frontend, Edge, produção, CI/CD, rollback deploy

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Disparar pipeline produção a partir de tag aprovada | link run |
| 2 | Verificar digest imagem implantada | Coolify / registry |
| 3 | `supabase functions deploy` com versão commit | log CLI |
| 4 | Smoke pós-deploy | acta |
| 5 | Rollback deploy | redeploy digest **N-1** em ambiente isolado **antes** de T0 (ensaio) |

### 4A.14 Segurança — rotação, revogação (contexto sem confiança no legado)

| Passo | Acção | Evidência |
|-------|--------|-----------|
| 1 | Assumir **comprometimento potencial** de qualquer segredo alguma vez fora do cofre org | política escrita |
| 2 | Emitir **novos** segredos para **todos** os sistemas | lista de rotação assinada |
| 3 | Revogar PATs/deploy keys **não** controlados pela org | audit log Git |
| 4 | Remover URIs OAuth legados | screenshot Google Console |
| 5 | Remover webhooks URL antiga nos painéis externos | screenshot |
| 6 | Nunca usar chaves `anon`/`service_role` do project_ref antigo | grep em CI + envs |

---

## 5. Plano de rollback

### 5.1 Princípios (cenário ZIP / sem legado confiável)

- O **rollback preferencial** é **reverter estado no DESTINO** (deploy anterior, DNS para “origin B” ainda na **nova** VPS, secrets anteriores compatíveis), **não** voltar ao servidor antigo.  
- **Rollback de base de dados** é **lento e perigoso** — só com **backup imutável** restaurado em **instância isolada** e validação de integridade **antes** de promover.  
- **Tempo máximo** para decisão de rollback DNS/deploy: **15 minutos** após confirmação de incidente CRÍTICO (ajustável por política); **60 minutos** para conclusão da manobra técnica alvo.

### 5.2 Rollback DNS

**Quando:** erro massivo só após mudança DNS; utilizadores externos afectados.  
**Como:** restaurar valores RRsets do **export T-1h** (Cloudflare version history ou Git de infra).  
**Validação:** `dig` mostra valores anteriores; tráfego regressa a origin documentado (deve ser **ainda** infra **nova** se legado proibido).  
**Impacto:** pode re-expor config antiga de hostname — **evitar** se origin antigo for inseguro; neste caso usar **CNAME para release anterior** na mesma infra.

### 5.3 Rollback deploy (frontend)

**Como:** Coolify novo → redeploy imagem **digest anterior**; invalidar cache Cloudflare se necessário (Purge Cache selective).  
**Validação:** `curl` headers `etag` / versão build visível na UI “About”.

### 5.4 Rollback containers (Docker)

**Como:** `docker compose` com revisão Git anterior + `docker compose up -d`; **não** remover volumes Evolution.  
**Validação:** `docker ps`; healthchecks verdes.

### 5.5 Rollback base de dados

**Como:** restaurar backup para **branch** ou projeto sandbox; validar; **só** promover se política de dados permitir swap — frequentemente **forward migration fix** é preferível.  
**Impacto:** alto risco de perda de writes pós-T0.

### 5.6 Rollback Edge Functions

**Como:** `supabase functions deploy` a partir de commit/tag anterior; garantir **secrets** compatíveis com essa versão.  
**Validação:** logs sem erro de env ausente.

### 5.7 Rollback “Supabase” (projecto)

**Não há** rollback para project_ref antigo (proibido). Rollback = **estado anterior dos dados no NOVO** via restore backup do **novo** projeto.

### 5.8 Rollback Evolution API

**Como:** reverter config webhook para URL estável anterior **na mesma** Evolution se mudança foi só config; se container recriado sem volume — **restaurar volume** a partir de backup **antes** de aceitar tráfego.

---

## 6. Plano de contingência

| Cenário | Contingência imediata | Responsável |
|---------|------------------------|-------------|
| DNS propagação assimétrica | Manter comunicado; aumentar testes multi-região; **não** fazer segunda mudança cega | SRE |
| OAuth down | Verificar Google status; rollback redirect **não** ajuda se problema é Google — comunicar | Owner |
| Webhook Asaas falha | Modo leitura manual + reconciliação posterior (negócio) | FinOps + Dev |
| Evolution perde sessão | Restaurar volume; QR emergência | DevOps |
| Supabase quota | Upgrade plano temporário | Owner |
| Ataque DDoS | Cloudflare under attack mode | SRE |
| Equipa indisponível | Abort T0 | Owner |

---

## 7. Matriz de riscos

| Risco | Severidade | Prob. | Impacto | Mitigação | Contingência | Rollback |
|-------|------------|-------|---------|-----------|---------------|----------|
| DNS incorrecto / TTL alto | CRÍTICO | M | Alto | T-48h TTL; double-check RRsets | Comunicar; corrigir forward | DNS revert / CNAME release |
| SSL / cert chain | CRÍTICO | M | Alto | ACME staging; monitor expiração | Modo TLS flexível **temporário** só se política aceitar | Corrigir origin cert |
| Supabase RLS erro | CRÍTICO | M | Muito alto | Testes T-12h | Hotfix policies | Forward fix + restore se necessário |
| Docker restart loop | ALTO | M | Alto | T-24h validation | Scale resources | Compose revert |
| WhatsApp / Evolution | CRÍTICO | M | Alto | Volume backup; webhook ordem | QR suporte | Volume restore / config revert |
| Edge Functions erro | CRÍTICO | M | Alto | Deploy staging; logs | Hotfix deploy | Functions revert |
| OAuth redirect | CRÍTICO | M | Alto | T-3h browser limpo | Comunicado login | Revert URI + deploy |
| Pagamentos webhook | CRÍTICO | B | Muito alto | Assinatura + idempotência | Reprocess manual | Revert webhook URL |
| IA quota / key | ALTO | M | Médio | Rate limit app; fallbacks | Desactivar feature IA | Rotate key / limit |
| Uploads Storage CORS | ALTO | M | Médio | CORS explícito T-12h | Ajuste imediato | Redeploy config |
| Perda sessão utilizador | MÉDIO | A | Médio | Comunicar re-login | — | — |
| Perda webhook evento | ALTO | M | Médio | Idempotência; reconciliação | Pedido reenvio fornecedor | Reprocess |
| Downtime percebido | ALTO | M | Alto | Sequência T0; TTL | Status page | Rollback deploy/DNS |
| Backup falhou | CRÍTICO | B | Catastrófico | Alertas backup | Abort T0 | — |
| LGPD exposição logs | ALTO | M | Legal | mascarar PII | parar log verboso | purge logs conforme política |
| Custo burst APIs | MÉDIO | M | Financeiro | caps | desligar feature | billing alert |

---

## 8. Checklist infraestrutura

| # | Item | S | Obrig. |
|---|------|---|--------|
| 8.1 | VPS validada (recursos, NTP, disco, rede) | CRÍTICO | obrigatório |
| 8.2 | Linux hardened (CIS ou equivalente documentado) | CRÍTICO | obrigatório |
| 8.3 | Firewall activo (default deny; só portas aprovadas) | CRÍTICO | obrigatório |
| 8.4 | SSH seguro (só chave; sem root login password) | CRÍTICO | obrigatório |
| 8.5 | Fail2Ban (ou equivalente) activo | ALTO | obrigatório |
| 8.6 | Docker validado (`docker info`, storage driver) | CRÍTICO | obrigatório |
| 8.7 | Volumes persistentes mapeados e listados | CRÍTICO | obrigatório |
| 8.8 | Backup de volumes testado (Evolution, dados) | CRÍTICO | obrigatório |
| 8.9 | Monitoramento activo (host + HTTP) | CRÍTICO | obrigatório |
| 8.10 | Logs centralizados ou rotação configurada | ALTO | recomendado |
| 8.11 | Actualizações automáticas de segurança (unattended) | MÉDIO | recomendado |
| 8.12 | Inventário portas `ss -tulpn` arquivado | MÉDIO | obrigatório |
| 8.13 | Break-glass console fornecedor documentado | BAIXO | recomendado |

---

## 9. Checklist Docker

| # | Item | S | Obrig. |
|---|------|---|--------|
| 9.1 | Containers activos e versão imagem pinada (digest) | CRÍTICO | obrigatório |
| 9.2 | Restart policies aplicadas (`unless-stopped` ou doc.) | ALTO | obrigatório |
| 9.3 | Healthchecks definidos e verdes | CRÍTICO | obrigatório |
| 9.4 | Networks isoladas (edge vs internal) | ALTO | recomendado |
| 9.5 | Proxy reverso a servir tráfego 443 | CRÍTICO | obrigatório |
| 9.6 | SSL válido (cadeia completa; não expirado) | CRÍTICO | obrigatório |
| 9.7 | Persistência validada após `docker restart` | CRÍTICO | obrigatório |
| 9.8 | Limites CPU/mem definidos | MÉDIO | recomendado |
| 9.9 | Sem socket Docker exposto à WAN | CRÍTICO | obrigatório |

---

## 10. Checklist Supabase

| # | Item | S | Obrig. |
|---|------|---|--------|
| 10.1 | Banco criado no **novo** project_ref | CRÍTICO | obrigatório |
| 10.2 | Migrations executadas e reconciliadas com ZIP | CRÍTICO | obrigatório |
| 10.3 | RLS validado (testes positivos e negativos) | CRÍTICO | obrigatório |
| 10.4 | Policies revisadas (diff documentado) | ALTO | obrigatório |
| 10.5 | Auth validado (URLs, templates, SMTP) | CRÍTICO | obrigatório |
| 10.6 | Edge Functions validadas (31 funções; logs limpos) | CRÍTICO | obrigatório |
| 10.7 | Storage validado (buckets, CORS, policies) | ALTO | obrigatório |
| 10.8 | Webhooks de entrada validados (WA, Asaas, Telegram) | CRÍTICO | obrigatório |
| 10.9 | `verify_jwt` revisto por função (risco documentado) | CRÍTICO | obrigatório |
| 10.10 | Quotas e billing alerts | MÉDIO | recomendado |

---

## 11. Checklist Evolution API

| # | Item | S | Obrig. |
|---|------|---|--------|
| 11.1 | Nova instância activa (legado não usado) | CRÍTICO | obrigatório |
| 11.2 | Sessões persistidas em volume | CRÍTICO | obrigatório |
| 11.3 | QR Code validado (piloto) | ALTO | obrigatório |
| 11.4 | Webhooks actualizados para NOVO_REF | CRÍTICO | obrigatório |
| 11.5 | Mensagens a enviar validadas | CRÍTICO | obrigatório |
| 11.6 | Mensagens a receber validadas | CRÍTICO | obrigatório |
| 11.7 | Reconexão validada após restart | ALTO | obrigatório |
| 11.8 | `EVO_KEY` apenas em secrets (nunca Git) | CRÍTICO | obrigatório |
| 11.9 | UI admin não exposta sem protecção | CRÍTICO | obrigatório |
| 11.10 | Documentação nome instância vs BD | MÉDIO | recomendado |

---

## 12. Checklist segurança

| # | Item | S | Obrig. |
|---|------|---|--------|
| 12.1 | Secrets rotacionados para stack **nova** | CRÍTICO | obrigatório |
| 12.2 | Tokens antigos invalidados (não há confiança — revogar **tudo** que possa ter existido fora da org) | CRÍTICO | obrigatório |
| 12.3 | OAuth revisado (só URIs **novos**) | CRÍTICO | obrigatório |
| 12.4 | MFA activo (Git, Cloudflare, Supabase org, Coolify) | CRÍTICO | obrigatório |
| 12.5 | Acessos antigos removidos (contas órfãs) | CRÍTICO | obrigatório |
| 12.6 | SSH antigo revogado (chaves apenas **novas** na VPS nova) | CRÍTICO | obrigatório |
| 12.7 | Webhooks antigos removidos/forçados a NOVO | CRÍTICO | obrigatório |
| 12.8 | Scan de segredos no repo novo | ALTO | obrigatório |
| 12.9 | WAF + rate limit login | ALTO | recomendado |
| 12.10 | Rotação pós-janela (service_role se tocado durante migração) | MÉDIO | recomendado |

---

## 13. Checklist DNS / Cloudflare

| # | Item | S | Obrig. |
|---|------|---|--------|
| 13.1 | DNS propagado (multi-resolver) | CRÍTICO | obrigatório |
| 13.2 | SSL activo (edge + origin strict se aplicável) | CRÍTICO | obrigatório |
| 13.3 | Proxy (orange cloud) conforme desenho | ALTO | obrigatório |
| 13.4 | WAF activo | ALTO | obrigatório |
| 13.5 | Rate limiting activo (login, recovery) | ALTO | recomendado |
| 13.6 | Domínio apex e `www` validados | CRÍTICO | obrigatório |
| 13.7 | TXT (SPF/DKIM) não quebrados pela migração | ALTO | obrigatório |
| 13.8 | Export zona pré/pós arquivado | MÉDIO | obrigatório |

---

## 14. Checklist observabilidade

| # | Item | S | Obrig. |
|---|------|---|--------|
| 14.1 | Uptime monitorado (multi-ponto) | CRÍTICO | obrigatório |
| 14.2 | Alertas entregues (e-mail/pager) testados com incidente sintético | CRÍTICO | obrigatório |
| 14.3 | Métricas host (CPU, RAM, disco, rede) | ALTO | obrigatório |
| 14.4 | Logs centralizados ou rotação + pesquisa | ALTO | recomendado |
| 14.5 | Healthchecks Docker + HTTP externos | CRÍTICO | obrigatório |
| 14.6 | Dashboard erro 5xx / latência | ALTO | obrigatório |
| 14.7 | APM front (ex.: Sentry) | MÉDIO | opcional |

---

## 15. Checklist backup / recovery

| # | Item | S | Obrig. |
|---|------|---|--------|
| 15.1 | Backup de banco (automático + export imutável) | CRÍTICO | obrigatório |
| 15.2 | Backup de volumes (Evolution, certificados) | CRÍTICO | obrigatório |
| 15.3 | Backup de sessões (incluído no volume Evolution) | CRÍTICO | obrigatório |
| 15.4 | Restore testado em sandbox **antes** de T0 | CRÍTICO | obrigatório |
| 15.5 | DR validado (procedimento + RTO/RPO documentados) | ALTO | recomendado |
| 15.6 | Pós-T0: verificar backup diário correu | CRÍTICO | obrigatório |

---

## 16. Checklist validação produção

| # | Item | S | Obrig. |
|---|------|---|--------|
| 16.1 | Frontend a carregar sem erros de env | CRÍTICO | obrigatório |
| 16.2 | Login a funcionar (email + Google) | CRÍTICO | obrigatório |
| 16.3 | Autenticação / sessão / recovery | ALTO | obrigatório |
| 16.4 | Uploads (Storage) | ALTO | obrigatório |
| 16.5 | Edge Functions críticas | CRÍTICO | obrigatório |
| 16.6 | WhatsApp (envio/recepção/reconexão) | CRÍTICO | obrigatório |
| 16.7 | Webhooks (Asaas, Telegram, WA) | CRÍTICO | obrigatório |
| 16.8 | Pagamentos (fluxo acordado) | CRÍTICO | obrigatório |
| 16.9 | IA (agente) sem 5xx sustentado | ALTO | recomendado |
| 16.10 | Logs e monitorização a reflectir tráfego real | ALTO | obrigatório |

---

## 17. Checklist desativação ambiente antigo

*Nota: sem controlo do servidor/Git/Supabase antigos, muitos itens são **“verificar que já não há efeito”** + **revogação do lado credencial**.*

| # | Item | S | Obrig. |
|---|------|---|--------|
| 17.1 | SSH antigo revogado na **organização** (ninguém usa chaves antigas) | CRÍTICO | obrigatório |
| 17.2 | Tokens antigos revogados (API, PAT, deploy) | CRÍTICO | obrigatório |
| 17.3 | OAuth antigo removido (URIs legados) | CRÍTICO | obrigatório |
| 17.4 | DNS antigo não resolve tráfego prod para IP antigo | CRÍTICO | obrigatório |
| 17.5 | SSL antigo irrelevante (host off) ou não usado | MÉDIO | recomendado |
| 17.6 | Webhooks antigos removidos nos painéis externos | CRÍTICO | obrigatório |
| 17.7 | Acesso antigo removido de fornecedores (contas users) | CRÍTICO | obrigatório |
| 17.8 | Dependências antigas removidas do código/pipelines **novos** | CRÍTICO | obrigatório |
| 17.9 | Evidência `dig`/`curl` + grep repo sem URL Supabase antiga | CRÍTICO | obrigatório |

---

## 18. Checklist GO / NO-GO

### 18.1 Critérios GO-LIVE (todos obrigatórios para “GO pleno” T+24h)

- [ ] Restore test no **novo** Supabase **bem-sucedido** (evidência datada).  
- [ ] Checklists **8–11** e **13–15** sem falhas **CRÍTICAS**.  
- [ ] OAuth e webhooks **verdes** em testes T-3h e T0.  
- [ ] WhatsApp piloto **verde**.  
- [ ] Rollback deploy/DNS **ensaiado** na **nova** infra (documento).  
- [ ] War-room e actas T-1h / T0 assinadas.  
- [ ] DPO/Security sign-off quando dados pessoais em causa.

### 18.2 Critérios rollback (qualquer um pode disparar decisão)

- Taxa **5xx** > limiar acordado (ex.: 5%) **durante** > 10 min.  
- **Login** impossível para > X% utilizadores teste.  
- **Webhook pagamentos** falha confirmada + impacto financeiro.  
- **Perda ou corrupção** de dados confirmada.

### 18.3 Critérios abortar migração (antes ou no início de T0)

- Falha **restore test** no dia anterior.  
- Incidente segurança (leak de `service_role`) não resolvido.  
- Equipa incompleta ou fornecedor crítico em outage.

### 18.4 Critérios bloquear produção (NO-GO duro)

- MFA não activo em consolas críticas.  
- RLS desactivado ou erro massivo de policies.  
- Evolution sem volume persistente.  
- SSL inválido no origin com Full strict.

---

## 19. Plano de auditoria pós GO-LIVE

**T+48h a T+30d:** (1) export audit logs Git **novo**; (2) revisão membros org Supabase; (3) revisão Cloudflare audit; (4) amostragem logs procurando PII; (5) reconciliação financeira APIs; (6) questionário “dependências residuais” a equipa; (7) re-execução `grep` por `project_ref` antigo em pipelines e envs; (8) revisão incidentes e acções; (9) actualização `docs/AUDITORIA_*`; (10) DR micro-drill (opcional recomendado).

**Evidências:** PDFs ou hashes de exports; tickets fechados com ligação a evidências.

---

## 20. Critérios de sucesso definitivo

1. **Independência:** durante **72h** contínuas, **zero** chamadas de produção **necessárias** a URLs, IPs ou chaves do ambiente antigo (prova por `dig`, `grep` em CI/CD, e inventário webhooks).  
2. **Estabilidade:** SLO de disponibilidade acordado **cumprido** no período T0–T+72h.  
3. **Segurança:** nenhum incidente CRÍTICO aberto; MFA e rotações conforme checklist 12.  
4. **Negócio:** fluxos críticos (login, WA, pagamento se aplicável) com métricas de sucesso ≥ baseline definido em piloto.  
5. **LGPD:** registo de actividades actualizado; sem violações de retenção.  
6. **Encerramento:** acta final assinada por Owner + SRE + Segurança (+ DPO); **secção 17** concluída.

---

## Anexo A — Arquitetura textual final

**Utilizador** → **Cloudflare** (DNS, WAF, RL, TLS) → **VPS nova** (UFW, fail2ban) → **Reverse proxy TLS** → **Docker** (SPA build com `VITE_SUPABASE_*` do **novo** project) + **Evolution** (volume persistente) → **HTTPS** → **Supabase novo** (PostgREST, Auth, Storage, Realtime) + **Edge Functions** no mesmo project. **CI/CD** empurra apenas para **Coolify novo**. **Git novo** é única fonte. **Legado:** fora da superfície de confiança; não entra no caminho de dados.

---

## Anexo B — Diagrama textual do cutover

```
T0 (sequência típica — ajustar se política exigir)
──────────────────────────────────────────────────
  [A] Dados finais já no Supabase NOVO (preferível antes T0)
        │
        ▼
  [B] Deploy SPA + secrets runtime NOVOS
        │
        ▼
  [C] Deploy Edge Functions NOVAS + secrets
        │
        ▼
  [D] Webhooks: Asaas → Telegram → Evolution
        │
        ▼
  [E] DNS produção → origin NOVO
        │
        ▼
  [F] Propagação + smoke multi-região
```

**Dependência oculta:** se **DNS** mudar antes de **deploy** com `VITE_*` correcto, utilizadores recebem build errado — por isso **B antes de E** é mandatório quando o hostname público serve o bundle.

---

## Anexo C — Matriz rollback (gatilhos)

| ID | Gatilho | Tempo máx. decisão | Tempo alvo manobra | Acção primária |
|----|---------|--------------------|--------------------|----------------|
| RB1 | 5xx > limiar pós-DNS | 15 min | 60 min | Reverter DNS **ou** CNAME para release anterior **na nova infra** |
| RB2 | OAuth broken | 15 min | 60 min | Corrigir URIs + redeploy; rollback deploy se necessário |
| RB3 | Webhook mass failure | 15 min | 45 min | Reverter URL webhook no painel + hotfix Edge |
| RB4 | Evolution down | 30 min | 120 min | Restaurar volume / restart; evitar recreate |
| RB5 | DB corruption suspeita | Imediato | variável | Congelar writes; restore isolado |

---

## Anexo D — Plano observabilidade

**Antes T0:** checks externos 1/5 min em staging e prod-new; alertas 5xx; disco >80%; certificado T-14d; fila webhooks Asaas; Evolution log errors.  
**Durante T0–T+6h:** granularidade 1 min; canal dedicado; runbook ligado nos alertas.  
**Pós T+24h:** regressar a intervalos normais; revisão semanal.

---

## Anexo E — Plano recovery / DR

**RPO/RTO:** definir por componente no **novo** ambiente. **Prova:** restore em sandbox **≤ política**. **DR:** se perda VPS nova — reprovisionar a partir de IaC + restore volume + redeploy; **project_ref** mantém-se se Supabase cloud intacto.

---

## Anexo F — Plano de comunicação

| Quando | O quê | Audiência |
|--------|-------|-----------|
| T-7d | Anúncio janela | Interno + parceiros críticos |
| T-48h | Lembrete + freeze alargado | Interno |
| T-24h | Freeze deploy/migrations | Devs |
| T-1h | Canal silencioso exceto war-room | Técnico |
| T+1h | GO condicional ou incidente | Stakeholders |
| T+24h | GO pleno ou plano correcção | Stakeholders |
| Rollback declarado | Mensagem factual + ETA | Stakeholders |
| Sucesso final (secção 20) | Encerramento formal | Todos |

---

_Fim da Parte 1 (runbook temporal completo até T+48h) e Parte 2 (checklists classificados). Versão 1.0._

# Checklist final enterprise — migração, takeover e produção (hapitech-main)

**Versão:** 1.0  
**Objetivo:** garantir que a **nova infraestrutura** entre em **produção** com **segurança**, **estabilidade** e **independência total** da infra legada, sem dependência de pessoas específicas.  
**Documentação de suporte:** `docs/DOCUMENTACAO_OPERACIONAL_ENTERPRISE_COMPLETA.md`, `docs/PLANO_ENTERPRISE_RECONSTRUCAO_INFRA_TOTAL.md`, `docs/ENGENHARIA_REVERSA_*`, `docs/AUDITORIA_*`.

---

## Legenda de classificação

### Severidade

| Tag | Significado operacional |
|-----|-------------------------|
| **CRÍTICO** | Bloqueia go-live ou viola segurança/compliance se falhar |
| **ALTO** | Degradação severa, perda de dados, ou downtime prolongado se falhar |
| **MÉDIO** | Impacto funcional ou operacional recuperável em horas |
| **BAIXO** | Melhoria, higiene, ou risco residual aceitável documentado |

### Fase

| Tag | Quando |
|-----|--------|
| **pré-migração** | Antes de mover tráfego ou dados definitivos |
| **migração** | Durante a janela de dados/config e cutover |
| **pós-migração** | Após cutover; burn-in e desativação legado |

**Formato dos itens:** `- [ ] **Descrição** — `S:CRÍTICO` `F:pré-migração` *(critério de aceitação opcional)*`

---

## 1. Resumo executivo

Este checklist consolida **takeover operacional**, **reconstrução**, **migração** e **go-live** em três dimensões: **fase** (pré / migração / pós), **severidade** (CRÍTICO → BAIXO) e **domínio** (infra a auditoria). Nenhum item **CRÍTICO** da fase **migração** pode ficar por concluir antes do **cutover de DNS** para produção. Itens **CRÍTICO** de **pós-migração** devem estar planeados antes do cutover (ex.: restore testado) ou o go-live é inválido.

**Dependências de código a neutralizar antes de produção independente:** remover fallbacks `EVO_URL`/`EVO_KEY` e domínios `*.lovable.app` em Edge Functions; rever `verify_jwt` em `supabase/config.toml`; corrigir gaps de segurança documentados em `docs/AUDITORIA_SEGURANCA_COMPLETA.md`.

---

## 2. Checklist pré-migração (visão por fase — itens transversais)

*Todos os itens abaixo são `F:pré-migração`.*

### 2.1 Governação e inventário

- [ ] **RACI** definido (Owner produto, SRE, Segurança, DPO, Dev lead) — `S:ALTO` `F:pré-migração`
- [ ] **Inventário de segredos** completo e aprovado (`docs/AUDITORIA_VARIAVEIS_SEGREDOS_COMPLETA.md` actualizado) — `S:CRÍTICO` `F:pré-migração`
- [ ] **Matriz de dados pessoais** (LGPD) por tabela/storage aprovada pelo DPO — `S:CRÍTICO` `F:pré-migração`
- [ ] **Janela de manutenção** comunicada a stakeholders — `S:MÉDIO` `F:pré-migração`
- [ ] **Freeze de código** ou política de cherry-pick durante migração — `S:MÉDIO` `F:pré-migração`

### 2.2 Git e CI/CD

- [ ] **Novo repositório Git privado** (ou org nova) com MFA obrigatório — `S:CRÍTICO` `F:pré-migração`
- [ ] **Branch protection** em `main` (reviews, status checks) — `S:ALTO` `F:pré-migração`
- [ ] **CODEOWNERS** para `supabase/` e `infra/` — `S:MÉDIO` `F:pré-migração`
- [ ] **CI** com `npm ci`, lint, testes **bloqueantes** em `main` (remover `continue-on-error` em testes quando política permitir) — `S:ALTO` `F:pré-migração`
- [ ] **Secrets CI** (`VITE_*` staging/prod) criados nos **Environments** GitHub — `S:CRÍTICO` `F:pré-migração`
- [ ] **Pipeline CD** desenhado (imagem digest, ou CDN) — documentado — `S:ALTO` `F:pré-migração`

### 2.3 Cloudflare / DNS (preparação)

- [ ] **Zona DNS** criada ou subdomínios novos definidos (sem apontar ainda tráfego prod) — `S:ALTO` `F:pré-migração`
- [ ] **WAF baseline** (Managed rules, rate limit login) preparado em modo log-only se necessário — `S:ALTO` `F:pré-migração`
- [ ] **Lista de registos** a alterar no cutover (A/CNAME/TXT) versionada — `S:CRÍTICO` `F:pré-migração`

### 2.4 VPS e Linux

- [ ] **VPS nova** provisionada (região, disco, IP estático) — `S:CRÍTICO` `F:pré-migração`
- [ ] **SO** LTS instalado e `apt upgrade` inicial — `S:ALTO` `F:pré-migração`
- [ ] **Hardening** (CIS ou equivalente) aplicado e relatório arquivado — `S:CRÍTICO` `F:pré-migração`
- [ ] **Utilizador não-root** para operações + sudo restrito — `S:ALTO` `F:pré-migração`
- [ ] **SSH** só chave Ed25519; `PasswordAuthentication no`; `PermitRootLogin no` — `S:CRÍTICO` `F:pré-migração`
- [ ] **UFW/nftables** default deny; 22 apenas IP/VPN admin; 80/443 para proxy — `S:CRÍTICO` `F:pré-migração`
- [ ] **fail2ban** (ou equivalente) activo para sshd — `S:ALTO` `F:pré-migração`
- [ ] **NTP** e timezone correctos — `S:MÉDIO` `F:pré-migração`

### 2.5 Docker e Coolify

- [ ] **Docker Engine** + Compose plugin instalados e versão pinada em documentação — `S:CRÍTICO` `F:pré-migração`
- [ ] **Coolify novo** instalado; URL admin protegida; **MFA** activo — `S:CRÍTICO` `F:pré-migração`
- [ ] **Backup interno Coolify** configurado — `S:ALTO` `F:pré-migração`
- [ ] **Política de volumes** (nomes, labels backup) definida — `S:ALTO` `F:pré-migração`
- [ ] **Healthchecks** definidos para serviços críticos no compose — `S:ALTO` `F:pré-migração`
- [ ] **Restart policies** (`unless-stopped` ou política documentada) — `S:MÉDIO` `F:pré-migração`

### 2.6 Proxy reverso e SSL

- [ ] **Reverse proxy** (Traefik/Caddy/Nginx) escolhido e config versionada em Git — `S:CRÍTICO` `F:pré-migração`
- [ ] **ACME** (HTTP-01 ou DNS-01) testado em **hostname de staging** — `S:CRÍTICO` `F:pré-migração`
- [ ] **HSTS** e headers segurança mínimos validados em staging — `S:ALTO` `F:pré-migração`

### 2.7 Supabase (projeto novo)

- [ ] **Novo projeto Supabase** criado (região, plano, organização) — `S:CRÍTICO` `F:pré-migração`
- [ ] **Migrations** aplicadas em projeto novo (`supabase db push` ou pipeline) — `S:CRÍTICO` `F:pré-migração`
- [ ] **RLS** smoke tests executados (matriz papel × tabela) — `S:CRÍTICO` `F:pré-migração`
- [ ] **Auth** redirect URLs e site URL apontam para **novos** domínios — `S:CRÍTICO` `F:pré-migração`
- [ ] **Storage** buckets e políticas criados; CORS restrito ao novo domínio SPA — `S:ALTO` `F:pré-migração`
- [ ] **service_role** e **anon** novos **nunca** commitados no Git — `S:CRÍTICO` `F:pré-migração`

### 2.8 Edge Functions

- [ ] Lista das **31** funções (`docs/ENGENHARIA_REVERSA_EDGE_FUNCTIONS_COMPLETA.md`) com owner técnico — `S:MÉDIO` `F:pré-migração`
- [ ] **Secrets** `supabase secrets set` preenchidos para **todas** as funções que usam `Deno.env` — `S:CRÍTICO` `F:pré-migração`
- [ ] **`verify_jwt`** revisto função a função; plano de endurecimento documentado — `S:CRÍTICO` `F:pré-migração`
- [ ] **Código** sem fallbacks sensíveis (Evolution, lovable.app) **mergeado** antes de deploy prod — `S:CRÍTICO` `F:pré-migração`
- [ ] **Deploy functions** em projeto **staging** e testes de integração verdes — `S:CRÍTICO` `F:pré-migração`

### 2.9 Evolution API e WhatsApp

- [ ] **Nova Evolution** (imagem digest pinada) em VPS ou host dedicado — `S:CRÍTICO` `F:pré-migração`
- [ ] **Novo `EVO_KEY`** gerado; **não** reutilizar chave do legado se houve exposição em Git — `S:CRÍTICO` `F:pré-migração`
- [ ] **Volume persistente** para instâncias; backup de volume testado — `S:CRÍTICO` `F:pré-migração`
- [ ] **Webhook URL** apontando para `https://<NOVO_REF>.supabase.co/functions/v1/whatsapp-webhook` (mais token secreto se implementado) — `S:CRÍTICO` `F:pré-migração`
- [ ] **Instância de teste** com QR validado em staging — `S:ALTO` `F:pré-migração`

### 2.10 Backups e DR (antes do cutover)

- [ ] **Política RPO/RTO** aprovada e publicada — `S:CRÍTICO` `F:pré-migração`
- [ ] **Backups Supabase** automáticos activos no plano — `S:CRÍTICO` `F:pré-migração`
- [ ] **Restore test** em projeto **sandbox** (PG + Storage amostra) **bem-sucedido** e documentado — `S:CRÍTICO` `F:pré-migração`
- [ ] **Export off-site** cifrado de `pg_dump` (procedimento) — `S:ALTO` `F:pré-migração`

### 2.11 Observabilidade

- [ ] **Uptime checks** para URL staging — `S:ALTO` `F:pré-migração`
- [ ] **Alertas** (e-mail/pager) para 5xx e disco >80% — `S:ALTO` `F:pré-migração`
- [ ] **Agregação de logs** (destino definido) — `S:MÉDIO` `F:pré-migração`

### 2.12 Segurança e LGPD

- [ ] **MFA** em Git, Supabase, Cloudflare, Coolify — `S:CRÍTICO` `F:pré-migração`
- [ ] **Revogação** de tokens/pat legados do repositório antigo — `S:CRÍTICO` `F:pré-migração`
- [ ] **Subprocessadores** (Supabase, Cloudflare, etc.) alinhados com DPA — `S:ALTO` `F:pré-migração`
- [ ] **Registo de actividades** (quem aprovou go-live) definido — `S:MÉDIO` `F:pré-migração`

---

## 3. Checklist migração (inclui cutover)

*Itens `F:migração`.*

### 3.1 Dados e aplicação

- [ ] **Cópia de dados** (PG) para novo projeto com método aprovado (dump/clone) — `S:CRÍTICO` `F:migração`
- [ ] **Storage** migrado ou sincronizado; integridade de checksums amostrada — `S:CRÍTICO` `F:migração`
- [ ] **Build produção** com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do **novo** projeto — `S:CRÍTICO` `F:migração`
- [ ] **Deploy** da SPA no origin novo — `S:CRÍTICO` `F:migração`
- [ ] **Deploy** final das Edge Functions no projeto novo com secrets finais — `S:CRÍTICO` `F:migração`

### 3.2 Integrações externas (reapontar)

- [ ] **Asaas** webhook → URL `asaas-webhook` novo + teste sandbox/prod conforme política — `S:CRÍTICO` `F:migração`
- [ ] **Evolution** webhooks → `whatsapp-webhook` novo — `S:CRÍTICO` `F:migração`
- [ ] **Telegram** `setWebhook` → `telegram-webhook` novo (`connId`) — `S:CRÍTICO` `F:migração`
- [ ] **Google OAuth** redirect URIs no Google Cloud Console → novos domínios — `S:CRÍTICO` `F:migração`
- [ ] **Lovable / OpenAI / ElevenLabs** chaves novas se política de rotação exigir — `S:ALTO` `F:migração`

### 3.3 Checklist cutover — troca DNS

- [ ] **TTL** dos registos críticos reduzido **≥48h** antes do cutover — `S:ALTO` `F:migração`
- [ ] **Plano de rollback DNS** (valores antigos guardados em cofre) — `S:CRÍTICO` `F:migração`
- [ ] **Alteração** CNAME/A para origin novo — `S:CRÍTICO` `F:migração`
- [ ] **Propagação** verificada com `dig` multi-resolver — `S:CRÍTICO` `F:migração`
- [ ] **Smoke** imediato pós-DNS (`curl`, login) — `S:CRÍTICO` `F:migração`

### 3.4 Checklist cutover — troca SSL

- [ ] Certificado **origin** válido sob Cloudflare Full (strict) — `S:CRÍTICO` `F:migração`
- [ ] **Renovação ACME** validada no novo host — `S:ALTO` `F:migração`
- [ ] **SSL Labs** ≥ A- (ou política interna) no hostname público — `S:MÉDIO` `F:migração`

### 3.5 Checklist cutover — troca webhooks

- [ ] Lista de **todos** os webhooks inbound documentada e tickada uma a uma — `S:CRÍTICO` `F:migração`
- [ ] **Reenvio de teste** por fornecedor após cada troca — `S:ALTO` `F:migração`
- [ ] **Logs Edge** confirmam recepção — `S:ALTO` `F:migração`

### 3.6 Checklist cutover — troca OAuth

- [ ] Redirect URIs **exact match** no Google — `S:CRÍTICO` `F:migração`
- [ ] **Gmail** / SMTP OAuth re-autorizado se aplicável — `S:ALTO` `F:migração`
- [ ] Fluxo login Google em staging **antes** de prod — `S:ALTO` `F:migração`

### 3.7 Checklist cutover — troca Evolution API

- [ ] `EVO_KEY` novo apenas nos secrets Supabase; funções redeploy — `S:CRÍTICO` `F:migração`
- [ ] **Instâncias** recriadas ou volumes migrados; **nomes** alinhados com `wuzapi_connections.phone_number` — `S:CRÍTICO` `F:migração`
- [ ] **QR** validado para número piloto — `S:ALTO` `F:migração`

### 3.8 Checklist cutover — troca Supabase

- [ ] **URL do projeto** e **anon key** no front **só** os novos após cutover — `S:CRÍTICO` `F:migração`
- [ ] **service_role** rotacionado e antigo revogado após validação — `S:CRÍTICO` `F:migração`
- [ ] **Realtime** e **Auth** testados sob carga leve — `S:MÉDIO` `F:migração`

### 3.9 Checklist cutover — troca produção

- [ ] **Comunicação** “go” assinada por Owner + SRE — `S:CRÍTICO` `F:migração`
- [ ] **Equipe war-room** disponível durante janela — `S:ALTO` `F:migração`
- [ ] **Legado** mantido read-only em paralelo **mínimo 48–72h** (política) — `S:ALTO` `F:migração`

---

## 4. Checklist pós-migração

*Itens `F:pós-migração`.*

### 4.1 Burn-in (primeiros 7–14 dias)

- [ ] **Dashboards** revisados diariamente (erros, latência, quotas) — `S:ALTO` `F:pós-migração`
- [ ] **Incidents** triados e ligados a causa raiz — `S:MÉDIO` `F:pós-migração`
- [ ] **Custos** cloud verificados vs orçamento — `S:MÉDIO` `F:pós-migração`

### 4.2 Desativação legado

- [ ] **DNS** legado não recebe tráfego (monitorização) — `S:ALTO` `F:pós-migração`
- [ ] **Projeto Supabase** legado: downgrade para read-only ou encerramento após política de retenção — `S:CRÍTICO` `F:pós-migração`
- [ ] **Evolution** legado: instâncias paradas após confirmação de zero tráfego — `S:ALTO` `F:pós-migração`
- [ ] **Revogar** PAT/SSH/deploy keys antigas — `S:CRÍTICO` `F:pós-migração`
- [ ] **Arquivar** imagens Docker antigas no registry — `S:BAIXO` `F:pós-migração`

### 4.3 Documentação e governança

- [ ] **Runbooks** actualizados com URLs e contactos finais — `S:ALTO` `F:pós-migração`
- [ ] **Postmortem** da migração (lições aprendidas) — `S:MÉDIO` `F:pós-migração`
- [ ] **Revisão trimestral** de acessos agendada — `S:MÉDIO` `F:pós-migração`

### 4.4 LGPD

- [ ] **Política de retenção** aplicada ao novo ambiente — `S:ALTO` `F:pós-migração`
- [ ] **Direitos dos titulares** (processo) testado em staging e válido em prod — `S:ALTO` `F:pós-migração`

---

## 5. Checklist infraestrutura (detalhe operacional)

| # | Item | S | F |
|---|------|---|---|
| 5.1 | VPS criada com dimensionamento aprovado | CRÍTICO | pré |
| 5.2 | IP estático / anúncio correcto | ALTO | pré |
| 5.3 | Disco particionado / espaço para logs e Docker | ALTO | pré |
| 5.4 | Hardening OS aplicado e evidência arquivada | CRÍTICO | pré |
| 5.5 | Firewall (UFW) activo e regra default deny | CRÍTICO | pré |
| 5.6 | SSH seguro (só chave, sem root login) | CRÍTICO | pré |
| 5.7 | Utilizadores do sistema revistos (sem contas órfãs) | ALTO | pré |
| 5.8 | fail2ban ou equivalente activo | ALTO | pré |
| 5.9 | Docker instalado; grupo `docker` restrito | CRÍTICO | pré |
| 5.10 | Containers revisados (imagem, tag digest) | ALTO | migração |
| 5.11 | Volumes persistentes com backup | CRÍTICO | pré |
| 5.12 | Restart policies aplicadas | MÉDIO | pré |
| 5.13 | Healthchecks activos e testados | ALTO | pré |
| 5.14 | Reverse proxy em frente aos serviços expostos | CRÍTICO | pré |
| 5.15 | SSL validado (cadeia, expiração, OCSP) | CRÍTICO | migração |
| 5.16 | Time sync (chrony/systemd-timesyncd) | MÉDIO | pré |
| 5.17 | Kernel / unattended-upgrades configurados | ALTO | pós |

---

## 6. Checklist segurança (dedicated)

| # | Item | S | F |
|---|------|---|---|
| 6.1 | Secrets rotacionados (lista `AUDITORIA_VARIAVEIS`) | CRÍTICO | pré |
| 6.2 | Tokens antigos invalidados (Git, Supabase, Evolution, Asaas API) | CRÍTICO | migração |
| 6.3 | OAuth redirect URIs só domínios novos | CRÍTICO | migração |
| 6.4 | MFA activo em todas as consolas admin | CRÍTICO | pré |
| 6.5 | Acessos revisados (least privilege) | ALTO | pós |
| 6.6 | Auditoria de acessos (export Git/Supabase/CF) | ALTO | pós |
| 6.7 | Scan de imagens Docker (Trivy) no CD | ALTO | pré |
| 6.8 | Secret scanning no repositório | ALTO | pré |
| 6.9 | CSP / headers segurança no edge | MÉDIO | pré |
| 6.10 | Política de rotação trimestral publicada | MÉDIO | pós |

### 6A. Checklist segurança — rotação e revogação (expandido)

- [ ] **Rotação `SUPABASE_SERVICE_ROLE_KEY`** no dashboard Supabase novo; actualizar **todos** os secrets Edge e CI — `S:CRÍTICO` `F:migração`
- [ ] **Rotação anon key** se exposta em repositório público alguma vez — `S:CRÍTICO` `F:migração`
- [ ] **Revogação acessos antigos** (contas ex-funcionários em Git, Supabase, Cloudflare, VPS) — `S:CRÍTICO` `F:pós-migração`
- [ ] **Revogação tokens antigos** (PAT GitHub, API tokens Coolify) — `S:CRÍTICO` `F:pós-migração`
- [ ] **Revogação webhooks antigos** nos painéis Asaas/Evolution/Telegram apontando para URL legada — `S:CRÍTICO` `F:migração`
- [ ] **Revisão OAuth** (Google Cloud Console: credenciais, consent screen, quotas) — `S:ALTO` `F:pré-migração`
- [ ] **Revisão permissões** RLS e roles Supabase após migração de dados — `S:CRÍTICO` `F:migração`

---

## 7. Checklist Supabase

| # | Item | S | F |
|---|------|---|---|
| 7.1 | Banco recriado / migrado com integridade | CRÍTICO | migração |
| 7.2 | Migrations executadas e ordem verificada | CRÍTICO | pré |
| 7.3 | RLS validado (testes automatizados + manual) | CRÍTICO | pré |
| 7.4 | Policies revisadas (diff vs legado) | ALTO | pré |
| 7.5 | Auth (SMTP, templates, redirect) validado | CRÍTICO | migração |
| 7.6 | Storage buckets + políticas + CORS validados | ALTO | pré |
| 7.7 | Extensões (ex.: vector) activas | ALTO | pré |
| 7.8 | Quotas e billing alertas configurados | MÉDIO | pós |
| 7.9 | Logs e API settings (rate) revistos | MÉDIO | pós |

---

## 8. Checklist Edge Functions

| # | Item | S | F |
|---|------|---|---|
| 8.1 | Todas as 31 funções deployadas no projeto novo | CRÍTICO | migração |
| 8.2 | Secrets por função verificados (grep `Deno.env`) | CRÍTICO | pré |
| 8.3 | `verify_jwt` alinhado à política (documento por função) | CRÍTICO | pré |
| 8.4 | CORS não `*` onde possível (endurecimento) | ALTO | pós |
| 8.5 | Webhook `whatsapp-webhook` com validação extra (token) se implementado | CRÍTICO | pré |
| 8.6 | `asaas-webhook` com validação de assinatura se implementado | CRÍTICO | pré |
| 8.7 | Teste smoke por função crítica (lista em doc operacional) | ALTO | migração |
| 8.8 | Logs sem PII desnecessária (revisão) | MÉDIO | pós |

---

## 9. Checklist Evolution API / WhatsApp

| # | Item | S | F |
|---|------|---|---|
| 9.1 | Nova instância Evolution com imagem pinada | CRÍTICO | pré |
| 9.2 | Novos tokens (`EVO_KEY`) gerados e injectados só via secrets | CRÍTICO | pré |
| 9.3 | Sessões protegidas (volume + permissões) | CRÍTICO | pré |
| 9.4 | Volumes persistentes com backup testado | CRÍTICO | pré |
| 9.5 | Webhooks Evolution actualizados para novo `SUPABASE_URL` | CRÍTICO | migração |
| 9.6 | QR Code validado (fluxo `wuzapi-proxy` + UI) | ALTO | pré |
| 9.7 | Envio texto + mídia + áudio testados | ALTO | migração |
| 9.8 | Reconexão (`connect`/`restart`) testada | MÉDIO | pós |
| 9.9 | `wuzapi_connections` consistente com nomes de instância | CRÍTICO | migração |

---

## 10. Checklist deploy

| # | Item | S | F |
|---|------|---|---|
| 10.1 | CI/CD validado (build + opcional push imagem) | CRÍTICO | pré |
| 10.2 | Rollback de deploy ensaiado em staging | CRÍTICO | pré |
| 10.3 | Staging validado (smoke completo) | CRÍTICO | pré |
| 10.4 | Production build com `VITE_*` finais | CRÍTICO | migração |
| 10.5 | Production deploy com tag/digest imutável | ALTO | migração |
| 10.6 | Monitoramento activo antes de abrir tráfego | ALTO | migração |

---

## 11. Checklist Cloudflare / DNS

| # | Item | S | F |
|---|------|---|---|
| 11.1 | DNS aponta novo ambiente (registos correctos) | CRÍTICO | migração |
| 11.2 | SSL activo (edge + origin se Full strict) | CRÍTICO | migração |
| 11.3 | Proxy (orange cloud) validado por registo | ALTO | migração |
| 11.4 | WAF activo (managed + custom mínimas) | ALTO | pré |
| 11.5 | Rate limiting activo (login, recovery) | ALTO | pré |
| 11.6 | Page Rules / Cache rules para assets estáticos | MÉDIO | pós |
| 11.7 | CAA records se política interna exigir | BAIXO | pré |

---

## 12. Checklist rollback

### 12.1 Rollback deploy

- [ ] Digest/tag anterior identificado no registry — `S:CRÍTICO` `F:migração`
- [ ] Redeploy comando/documentado no Coolify — `S:CRÍTICO` `F:migração`
- [ ] CDN cache invalidado — `S:ALTO` `F:migração`
- [ ] Smoke pós-rollback — `S:CRÍTICO` `F:migração`

### 12.2 Rollback DNS

- [ ] Valores DNS anteriores restaurados do cofre — `S:CRÍTICO` `F:migração`
- [ ] Propagação verificada — `S:ALTO` `F:migração`

### 12.3 Rollback containers

- [ ] `docker compose` com ficheiro de revisão Git anterior — `S:ALTO` `F:migração`
- [ ] Volumes não destrutivos (não apagar volume WA sem backup) — `S:CRÍTICO` `F:migração`

### 12.4 Rollback banco

- [ ] Restore a partir de backup PITR ou dump **para instância isolada** primeiro — `S:CRÍTICO` `F:migração`
- [ ] Validação de integridade antes de promover — `S:CRÍTICO` `F:migração`

### 12.5 Rollback Edge Functions

- [ ] `git revert` ou deploy de commit anterior das funções — `S:ALTO` `F:migração`
- [ ] Secrets compatíveis com versão revertida — `S:ALTO` `F:migração`

---

## 13. Checklist observabilidade

| # | Item | S | F |
|---|------|---|---|
| 13.1 | Logs centralizados (proxy + Docker + opcional app) | ALTO | pós |
| 13.2 | Uptime monitorado (multi-ponto) | CRÍTICO | pré |
| 13.3 | Alertas (Pager/e-mail) com runbook link | ALTO | pré |
| 13.4 | Métricas host (CPU, RAM, disco, rede) | ALTO | pós |
| 13.5 | Dashboards Supabase (API, Auth, Storage) | MÉDIO | pós |
| 13.6 | Sentry ou APM no front | MÉDIO | pós |

---

## 14. Checklist backup / recovery

| # | Item | S | F |
|---|------|---|---|
| 14.1 | Backup banco automático + export off-site | CRÍTICO | pré |
| 14.2 | Backup volumes (Evolution, proxy certs, Coolify) | CRÍTICO | pré |
| 14.3 | Backup sessões WA (volume Evolution) incluído no plano | CRÍTICO | pré |
| 14.4 | Restore testado (relatório datado) | CRÍTICO | pré |
| 14.5 | Procedimento restore comunicado à equipa | ALTO | pré |
| 14.6 | RTO/RPO medidos no drill | MÉDIO | pós |

---

## 15. Checklist validação produção

| # | Área | Critério de aceitação | S | F |
|---|------|------------------------|---|---|
| 15.1 | Frontend | Login, navegação core, sem erros `Missing env` | CRÍTICO | migração |
| 15.2 | Backend (Supabase API) | CRUD representativo com RLS | CRÍTICO | migração |
| 15.3 | Supabase | Auth, Realtime smoke, Storage upload/download | ALTO | migração |
| 15.4 | Edge Functions | Smoke das funções críticas (billing, WA proxy, webhooks) | CRÍTICO | migração |
| 15.5 | WhatsApp | Mensagem in/out, mídia, reconexão | CRÍTICO | migração |
| 15.6 | Webhooks | Asaas + Telegram + Evolution eventos teste | CRÍTICO | migração |
| 15.7 | Pagamentos | Fluxo Asaas sandbox ou valor mínimo controlado | CRÍTICO | pré |
| 15.8 | IA | Resposta agente (Clinicorp/chat) sem 5xx | ALTO | migração |
| 15.9 | Uploads | `chat-media` / `knowledge` conforme caso de uso | ALTO | migração |
| 15.10 | Autenticação | OAuth Google + email/password + recovery | ALTO | migração |
| 15.11 | Produção | Assinatura formal go-live (§18) | CRÍTICO | migração |

---

## 16. Checklist auditoria

| # | Item | S | F |
|---|------|---|---|
| 16.1 | Auditoria acessos (Git/Supabase/CF/VPS) exportada | ALTO | pós |
| 16.2 | Auditoria infraestrutura (hardening, firewall) | ALTO | pós |
| 16.3 | Auditoria Docker (imagens, users, caps) | MÉDIO | pós |
| 16.4 | Auditoria Supabase (RLS, policies, extensions) | CRÍTICO | pós |
| 16.5 | Auditoria WhatsApp (webhooks, chaves, instâncias) | ALTO | pós |
| 16.6 | Auditoria segurança (pentest leve ou SAST/DAST) | ALTO | pré |
| 16.7 | Auditoria logs (retenção, PII, acesso a logs) | MÉDIO | pós |

---

## 17. Checklist governança

| # | Item | S | F |
|---|------|---|---|
| 17.1 | Política de mudanças (CAB leve ou ADR) | MÉDIO | pré |
| 17.2 | On-call e escalação documentados | ALTO | pré |
| 17.3 | Gestão de fornecedores (DPA, contactos) | ALTO | pré |
| 17.4 | Revisão trimestral de acessos agendada | MÉDIO | pós |
| 17.5 | Plano de continuidade de negócio (BCP) referenciado | MÉDIO | pré |

---

## 18. Checklist entrada em produção (gate final)

*Todos **CRÍTICO** `F:migração` ou `F:pós-migração` imediatos — bloqueiam assinatura se falharem.*

- [ ] **G0** — Zero itens CRÍTICOS pendentes nas secções **2, 3, 5–11, 14, 15** — `S:CRÍTICO` `F:migração`
- [ ] **G1** — Restore test documentado **< 6 meses** — `S:CRÍTICO` `F:pré-migração`
- [ ] **G2** — Cutover DNS executado e smoke imediato OK — `S:CRÍTICO` `F:migração`
- [ ] **G3** — Webhooks externos confirmados em logs — `S:CRÍTICO` `F:migração`
- [ ] **G4** — WhatsApp piloto e pagamento (se aplicável) validados — `S:CRÍTICO` `F:migração`
- [ ] **G5** — MFA e rotação de chaves críticas concluídas — `S:CRÍTICO` `F:migração`
- [ ] **G6** — Observabilidade e alertas activos — `S:CRÍTICO` `F:migração`
- [ ] **G7** — Plano rollback comunicado a todos os intervenientes — `S:CRÍTICO` `F:migração`
- [ ] **G8** — Aprovação escrita **Owner produto** + **SRE** + **Segurança** (e **DPO** se dados pessoais) — `S:CRÍTICO` `F:migração`
- [ ] **G9** — Janela pós-go-live 72h com monitorização reforçada agendada — `S:ALTO` `F:pós-migração`

---

## Apêndice A — Matriz rápida severidade × fase (resumo)

| Domínio | CRÍTICO pré | CRÍTICO migração | CRÍTICO pós |
|---------|--------------|------------------|-------------|
| Infra | VPS, SSH, FW, SSL staging | DNS, SSL prod | Desactivar legado inseguro |
| Supabase | Migrations, RLS, secrets | Dados, URL, service_role rot | Encerrar projeto legado |
| Edge | Secrets, código sem fallback | Deploy + webhooks | Revisão logs PII |
| Evolution | Volume backup, EVO_KEY | Webhook, instância | Monitor sessão |
| Segurança | MFA, inventário secrets | Rotação, revogação | Auditoria acessos |
| Deploy | CI com VITE_* | Build prod + digest | Rollback testado |
| DR | Restore test | — | Drill agendado |

---

## Apêndice B — Operação e LGPD (itens transversais)

- [ ] **Operação:** runbooks `docs/DOCUMENTACAO_OPERACIONAL_ENTERPRISE_COMPLETA.md` hiperligados no sistema de tickets — `S:MÉDIO` `F:pós-migração`
- [ ] **LGPD:** registo de actividades de tratamento actualizado pós-migração — `S:ALTO` `F:pós-migração`
- [ ] **LGPD:** contratos com sub-processadores assinados para **novo** projecto/região — `S:ALTO` `F:pré-migração`
- [ ] **LGPD:** procedimento de incidente de dados ligado aos runbooks de segurança — `S:ALTO` `F:pré-migração`

---

**Manutenção:** actualizar versão e data em cada ciclo de migração ou DR drill. Itens **BAIXO** não dispensam responsável nem data de revisão.

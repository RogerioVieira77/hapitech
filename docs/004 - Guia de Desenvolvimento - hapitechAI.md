# hapitechAI — Guia de Desenvolvimento

**Última atualização:** maio de 2026
**Público:** desenvolvedores que trabalham no projeto
**Documentos relacionados:**
- [001 - Visão Geral e Plano de Desenvolvimento](./001%20-%20Visão%20Geral%20e%20Plano%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [002 - Arquitetura Técnica](./002%20-%20Arquitetura%20Técnica%20-%20hapitechAI.md)
- [003 - Módulos e Requisitos](./003%20-%20Módulos%20e%20Requisitos%20-%20hapitechAI.md)
- [004 - Guia de Desenvolvimento](./004%20-%20Guia%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md)

---

## 1. Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|------------|--------------|-----------|
| Node.js | 22.x | Exigido por `Dockerfile` e CI |
| npm | 10.x | Gerenciador padrão do projeto (`package-lock.json`) |
| Supabase CLI | ≥ 2.x | `npm install -g supabase` ou via brew |
| Docker Desktop | qualquer recente | Necessário para emulador Supabase local |
| Git | qualquer recente | — |

> **Atenção:** o projeto usa **npm** exclusivamente. Não há `pnpm-lock.yaml` nem `yarn.lock` no repo. Não misture gerenciadores — `npm ci` é o comando canônico em CI.

---

## 2. Setup do ambiente local

### 2.1 Clonar e instalar dependências

```bash
git clone <url-do-repo>
cd hapitechai
npm ci
```

### 2.2 Variáveis de ambiente do frontend

Crie um arquivo `.env.local` na raiz do projeto. O Vite injeta apenas variáveis com prefixo `VITE_` no bundle:

```bash
# .env.local — NÃO commitar este arquivo
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJ...  # chave anon pública do projeto
```

Esses valores estão disponíveis no Dashboard Supabase em **Project Settings → API**.

> **Por que são "públicas"?** A chave `anon` é projetada para ser pública — a segurança real é garantida pelas políticas RLS no banco, não pelo sigilo da chave. Mesmo assim, **não commitar** o `.env.local`.

### 2.3 Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

O Vite sobe em `http://localhost:8080` com HMR ativo. O `overlay` de erro do HMR está desabilitado intencionalmente (`vite.config.ts`).

---

## 3. Supabase local com CLI

O Supabase CLI permite rodar uma instância local completa (PostgreSQL + Auth + Storage + Edge Functions + Studio) sem depender do projeto remoto.

### 3.1 Iniciar o stack local

```bash
supabase start
```

Ao iniciar pela primeira vez, o CLI baixa as imagens Docker necessárias. Na saída, você receberá as URLs e chaves locais:

```
API URL:       http://127.0.0.1:54321
DB URL:        postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL:    http://127.0.0.1:54323
Anon key:      eyJ...
Service role:  eyJ...
```

Use essas credenciais no `.env.local` para desenvolver offline:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key local>
```

### 3.2 Aplicar migrações

```bash
# Reseta o banco local e reaaplica todas as 91 migrações em ordem
supabase db reset
```

> **Ordem importa.** As migrações possuem dependências temporais (rollback antes de restore). O `db reset` aplica os arquivos em ordem lexicográfica pelo prefixo de timestamp — nunca execute migrações manualmente fora de ordem.

### 3.3 Vincular ao projeto remoto

```bash
supabase link --project-ref <project-ref>
```

O `project-ref` é o ID do projeto Supabase (visível na URL do Dashboard: `app.supabase.com/project/<ref>`).

Após vincular:

```bash
# Enviar migrações pendentes para o projeto remoto
supabase db push

# Puxar estado atual do banco remoto (para gerar diff)
supabase db pull
```

### 3.4 Gerar tipos TypeScript

Após qualquer alteração de schema no banco local ou remoto:

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

> **Nota:** a tabela `mcp_connections` existe no SQL mas pode não aparecer em `types.ts` gerado por versões mais antigas do CLI. Após gerar, verifique se ela consta no arquivo.

---

## 4. Edge Functions (Deno)

### 4.1 Rodar funções localmente

```bash
# Todas as funções
supabase functions serve

# Função específica
supabase functions serve agent-chat
```

As funções ficam disponíveis em `http://127.0.0.1:54321/functions/v1/<nome>`.

### 4.2 Secrets locais

Edge Functions leem segredos via `Deno.env.get("NOME_SECRET")`. Para desenvolvimento local, crie um arquivo `.env` dentro de `supabase/`:

```bash
# supabase/.env — NÃO commitar
EVO_URL=http://evolution-api:8080
EVO_KEY=sua-chave-evolution
OPENAI_API_KEY=sk-...
ASAAS_API_KEY=...
```

Passe o arquivo ao servir:

```bash
supabase functions serve --env-file supabase/.env
```

Para o projeto remoto, secrets são gerenciados via CLI ou Dashboard:

```bash
supabase secrets set EVO_KEY=valor
supabase secrets list
```

### 4.3 Fazer deploy de uma função

```bash
# Função específica
supabase functions deploy agent-chat

# Todas as funções
supabase functions deploy
```

### 4.4 Estrutura padrão de uma Edge Function

```typescript
// supabase/functions/<nome>/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // ... lógica da função

  return new Response(JSON.stringify({ result }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
```

> **`verify_jwt = false`** está definido para todas as 31 funções em `supabase/config.toml`. Isso significa que o gateway não valida o JWT — a autorização deve ser implementada **dentro do handler**. Esse é um débito de segurança ativo documentado em [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

---

## 5. Variáveis de ambiente

### 5.1 Frontend (Vite — em `.env.local`, disponíveis no bundle)

| Variável | Obrigatória | Descrição |
|----------|------------|----------|
| `VITE_SUPABASE_URL` | Sim | URL do projeto Supabase (ex: `https://xyz.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | Chave anon pública do projeto |

> As variáveis `VITE_*` são embutidas no bundle em tempo de build. Em pipelines CI/CD, devem ser passadas como `build-args` para o Docker (ver seção 8).

### 5.2 Edge Functions (Supabase secrets — nunca no bundle)

| Secret | Função(ões) que usa | Descrição |
|--------|-------------------|----------|
| `EVO_URL` | `wuzapi-proxy`, `whatsapp-webhook` | URL base da Evolution API |
| `EVO_KEY` | `wuzapi-proxy`, `whatsapp-webhook` | Chave de autenticação da Evolution API |
| `OPENAI_API_KEY` | `generate-embeddings`, `agent-chat` | Chave OpenAI (opcional se usando Lovable Gateway) |
| `ASAAS_API_KEY` | `asaas-checkout`, `asaas-invoices`, `sync-subscription` | Chave da API Asaas |
| `ASAAS_WEBHOOK_TOKEN` | `asaas-webhook` | Token de validação do webhook Asaas |
| `ELEVENLABS_API_KEY` | `elevenlabs-tts`, `elevenlabs-conversation-token` | Chave ElevenLabs |
| `GOOGLE_CLIENT_ID` | `google-oauth-token`, `gmail-oauth-token` | OAuth2 client ID Google |
| `GOOGLE_CLIENT_SECRET` | `google-oauth-token`, `gmail-oauth-token` | OAuth2 client secret Google |
| `TELEGRAM_WEBHOOK_SECRET` | `telegram-webhook` | Token de validação do webhook Telegram |
| `SITE_URL` | `invite-org-member`, `accept-invite` | URL pública da aplicação (para links em emails) |
| `SUPABASE_URL` | todas | Injetado automaticamente pelo runtime Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | todas | Injetado automaticamente pelo runtime Supabase |
| `SUPABASE_ANON_KEY` | algumas | Injetado automaticamente pelo runtime Supabase |

---

## 6. Comandos úteis

### 6.1 Scripts npm

```bash
npm run dev          # Vite dev server em :8080 com HMR
npm run build        # Build de produção em dist/
npm run build:dev    # Build em modo development (sem minificação)
npm run preview      # Preview do build em :4173
npm run lint         # ESLint em todo o projeto
npm run test         # Vitest run (execução única, modo CI)
npm run test:watch   # Vitest em modo watch (desenvolvimento)
npm run start        # Serve dist/ na porta 3000 (equiv. ao container)
```

### 6.2 Supabase CLI

```bash
supabase start                          # Inicia stack local
supabase stop                           # Para o stack local
supabase status                         # Status dos containers locais
supabase db reset                       # Reseta banco local + reaaplica migrações
supabase db push                        # Aplica migrações pendentes no projeto remoto
supabase db pull                        # Gera migration com diff do estado remoto
supabase gen types typescript --linked  # Atualiza src/integrations/supabase/types.ts
supabase functions serve                # Serve todas as edge functions localmente
supabase functions serve <nome>         # Serve função específica
supabase functions deploy <nome>        # Deploy de função para o projeto remoto
supabase functions deploy               # Deploy de todas as funções
supabase secrets set KEY=valor          # Define secret no projeto remoto
supabase secrets list                   # Lista secrets configurados
supabase logs --project-ref <ref>       # Logs do projeto remoto
```

---

## 7. Convenções de código

### 7.1 TypeScript

- `strict: true` habilitado em `tsconfig.app.json`. Não desabilitar flags de strict.
- Path alias `@/` aponta para `./src` (configurado em `vite.config.ts` e `tsconfig.app.json`). Usar `@/components/`, `@/hooks/`, `@/lib/` etc. em todos os imports internos.
- Evitar `any` explícito. Usar `unknown` quando o tipo não é conhecido, com narrowing adequado.

### 7.2 Componentes React

- Componentes em `src/components/` — cada arquivo exporta um único componente principal.
- Páginas em `src/pages/` — mapeadas diretamente para rotas em `src/App.tsx`.
- Hooks customizados em `src/hooks/` com prefixo `use`.
- Assets (ícones, imagens) em `src/assets/`.

### 7.3 UI — Tailwind + shadcn/ui

- Usar classes Tailwind diretamente nos componentes. Evitar CSS inline ou módulos CSS separados.
- Componentes shadcn/ui instalados em `src/components/ui/` (gerados via CLI `npx shadcn-ui@latest add <componente>`).
- Combinar classes condicionais com `cn()` (utilitário em `src/lib/utils.ts` que usa `clsx` + `tailwind-merge`):

```tsx
import { cn } from "@/lib/utils";

<div className={cn("base-classes", isActive && "active-classes", className)} />
```

### 7.4 Data fetching — TanStack Query

- Toda requisição ao Supabase em componentes deve usar `useQuery` ou `useMutation` do TanStack Query.
- Invalidação de cache após mutations: `queryClient.invalidateQueries({ queryKey: ['...'] })`.
- O `QueryClient` é instanciado uma vez em `src/main.tsx` e provido por `QueryClientProvider`.
- Não usar `useEffect` + `useState` para chamadas de dados — usar TanStack Query.

```tsx
// Padrão correto
const { data, isLoading, error } = useQuery({
  queryKey: ['agents', organizationId],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('organization_id', organizationId);
    if (error) throw error;
    return data;
  },
  enabled: !!organizationId,
});
```

### 7.5 Chamadas a Edge Functions

```tsx
// Via supabase-js (recomendado — adiciona headers de autenticação automaticamente)
const { data, error } = await supabase.functions.invoke('agent-chat', {
  body: { agentId, message, conversationId },
});

// Via fetch direto (apenas se necessário — passar headers manualmente)
const response = await fetch(`${SUPABASE_URL}/functions/v1/agent-chat`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ agentId, message }),
});
```

### 7.6 Estado global

O projeto **não usa** Zustand, Redux, MobX nem nenhuma biblioteca de estado global. O estado compartilhado entre componentes é gerenciado por:
- **TanStack Query** — para dados remotos (server state)
- **Context API do React** — para estado de UI global (ex: tema, sidebar)
- **Props drilling** — para estado local de componentes próximos

Não introduzir biblioteca de estado global sem discussão em equipe.

---

## 8. Build e empacotamento

### 8.1 Build de produção manual

```bash
npm run build
```

Gera `dist/` com os arquivos estáticos. A SPA usa roteamento client-side (`react-router-dom`) — o servidor deve servir `index.html` para todas as rotas (`-s` no `serve`).

### 8.2 Docker

O `Dockerfile` usa build multi-stage:

1. **Stage `builder`** — Node 22 Alpine, `npm ci`, `npm run build`
2. **Stage final** — Node 22 Alpine, `npm install -g serve`, copia `dist/`, expõe porta `3000`

```bash
# Build local da imagem
docker build -t hapitechai:local .

# Testar localmente
docker run -p 3000:3000 hapitechai:local
```

> **Variáveis `VITE_*` em Docker:** as variáveis são embutidas no bundle durante o `npm run build` do stage builder. Para injetá-las no build do Docker, o `Dockerfile` precisa de `ARG` declarados antes do `RUN npm run build`. O arquivo `infra/ci/github-actions-cd.example.yml` mostra como passar `build-args` via GitHub Actions. O `Dockerfile` atual **não** tem esses `ARG` declarados — ajuste necessário antes de ativar CD.

### 8.3 Nixpacks

O arquivo `nixpacks.toml` na raiz permite deploy direto em plataformas que suportam Nixpacks (Coolify, Railway, Render). O Nixpacks detecta automaticamente Node e executa `npm install` + `npm run build`.

> **Divergência:** o Docker usa `npm ci` (determinístico) enquanto Nixpacks usa `npm install`. Em produção, garantir que ambos os caminhos usem a mesma versão de dependências.

---

## 9. CI/CD

### 9.1 Pipeline CI ativo

O arquivo `.github/workflows/ci.yml` executa automaticamente em push e PR para `main`, `master` e `develop`:

| Step | Comando | Comportamento em falha |
|------|---------|------------------------|
| Install | `npm ci` | Bloqueia pipeline |
| Lint | `npm run lint` | Bloqueia pipeline |
| Test | `npm run test` | `continue-on-error: true` — não bloqueia |
| Build | `npm run build` | Bloqueia pipeline |
| Upload artifact | `dist/` retido por 7 dias | — |

> **`continue-on-error: true` nos testes** é um débito a corrigir — testes devem bloquear o pipeline. Ver backlog em [005](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md).

### 9.2 Pipeline CD — não versionado

Não há pipeline de CD versionado no repositório. O deploy é feito manualmente via Coolify (VPS) ou via Docker manual. O arquivo `infra/ci/github-actions-cd.example.yml` é um esqueleto de referência — não está ativo.

Para ativar CD com GitHub Actions:
1. Copiar `infra/ci/github-actions-cd.example.yml` para `.github/workflows/cd.yml`
2. Adicionar `ARG VITE_SUPABASE_URL` e `ARG VITE_SUPABASE_PUBLISHABLE_KEY` no `Dockerfile` antes do `RUN npm run build`
3. Configurar secrets no GitHub: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Configurar GHCR (ou registry alternativo) e integração com Coolify via webhook

### 9.3 Deploy de Supabase em produção

Não há pipeline automatizado para Supabase. O workflow manual é:

```bash
# 1. Vincular ao projeto de produção
supabase link --project-ref <ref-producao>

# 2. Revisar diff de migrações pendentes
supabase db diff

# 3. Aplicar migrações
supabase db push

# 4. Deploy das edge functions
supabase functions deploy

# 5. Verificar secrets
supabase secrets list
```

> Executar `db push` em produção sem revisão prévia do diff é arriscado. Recomendado: revisar o diff localmente, testar em staging, então aplicar.

---

## 10. Testes

### 10.1 Framework

O projeto usa **Vitest** (configurado em `vitest.config.ts`), que é compatível com a API Jest. Os testes ficam em `src/test/`.

```bash
npm run test         # Execução única (modo CI)
npm run test:watch   # Modo watch (desenvolvimento)
```

### 10.2 Estado atual

A cobertura de testes é baixa (o CI tem `continue-on-error: true` justamente porque os testes falham). Antes de adicionar features, verifique se há testes relevantes a atualizar ou criar em `src/test/`.

---

## 11. Debugging

### 11.1 Edge Functions locais

O Supabase CLI faz stream de logs das funções em execução local:

```bash
supabase functions serve --debug
```

Adicionar `console.log` dentro das funções — os logs aparecem no terminal do CLI. Para inspecionar o request/response, use `curl` ou Postman apontando para `http://127.0.0.1:54321/functions/v1/<nome>`.

### 11.2 Supabase Studio (banco local)

Com `supabase start` ativo, acesse `http://127.0.0.1:54323` para o Supabase Studio local. Permite:
- Executar queries SQL diretamente no banco de desenvolvimento
- Inspecionar tabelas, views, políticas RLS
- Visualizar logs de autenticação
- Testar Storage buckets

### 11.3 Logs do projeto remoto

```bash
# Logs de edge functions no projeto remoto
supabase logs --project-ref <ref> --type edge-runtime

# Ou via Dashboard Supabase → Edge Functions → Logs
```

### 11.4 TanStack Query DevTools

Em modo desenvolvimento (`npm run dev`), o TanStack Query DevTools está disponível — ícone flutuante no canto da tela. Permite inspecionar o cache de queries, refetching e estado das mutations.

### 11.5 Problemas comuns

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| Tela em branco após login | `VITE_SUPABASE_URL` errada no `.env.local` | Verificar `.env.local` + reiniciar `npm run dev` |
| Edge function retorna 500 | Secret não configurado localmente | Passar `--env-file supabase/.env` ao `functions serve` |
| Tipos TypeScript defasados | Schema mudou, `types.ts` não regenerado | Rodar `supabase gen types typescript --linked` |
| Migração falha com erro FK | Ordem de migrações incorreta | Usar `supabase db reset` em vez de aplicar migrações manualmente |
| Realtime não atualiza | Tabela não adicionada à publication | Verificar `ALTER PUBLICATION supabase_realtime ADD TABLE <tabela>` nas migrações |

---
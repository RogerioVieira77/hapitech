# hapitechAI — Módulos e Requisitos

**Última atualização:** maio de 2026

**Público:** desenvolvedores que trabalham no projeto

**Documentos relacionados:**

- [001 - Visão Geral e Plano de Desenvolvimento](./001%20-%20Visão%20Geral%20e%20Plano%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [002 - Arquitetura Técnica](./002%20-%20Arquitetura%20Técnica%20-%20hapitechAI.md)
- [003 - Módulos e Requisitos](./003%20-%20Módulos%20e%20Requisitos%20-%20hapitechAI.md)
- [004 - Guia de Desenvolvimento](./004%20-%20Guia%20de%20Desenvolvimento%20-%20hapitechAI.md)
- [005 - Backlog e Roadmap Técnico](./005%20-%20Backlog%20e%20Roadmap%20Técnico%20-%20hapitechAI.md)
- [EXTRA - Lovable Project Info](./Extra%20-%20Lovable%20Project%20Info.md)

**Legenda:**

- **RF** — Requisito Funcional (comportamento implementado ou esperado)
- **RN** — Regra de Negócio
- **RNF** — Requisito Não-Funcional

---

## 1. Autenticação e Organizações

### Descrição

Camada transversal de identidade e multi-tenancy. Todo acesso à plataforma requer autenticação. Cada conta pertence a uma organização; dados e configurações são sempre isolados por org.

### Requisitos Funcionais

**RF-AUTH-01** — O sistema deve permitir cadastro via email e senha.

**RF-AUTH-02** — O sistema deve enviar email de confirmação de cadastro com link de ativação.

**RF-AUTH-03** — O sistema deve permitir recuperação de senha por email (reset link).

**RF-AUTH-04** — O sistema deve exibir formulário de login com email e senha.

**RF-AUTH-05** — O sistema deve permitir que um usuário autenticado convide outros membros para sua organização por email.

**RF-AUTH-06** — Convites devem gerar link de acesso válido por tempo limitado; ao acessá-lo, o convidado cria conta e é vinculado à org automaticamente.

**RF-AUTH-07** — O sistema deve suportar múltiplos usuários por organização com papéis distintos (`owner`, `admin`, `member`).

**RF-AUTH-08** — Sessão inválida ou expirada deve redirecionar para `/auth` automaticamente.

### Regras de Negócio

**RN-AUTH-01** — Um usuário pertence a exatamente uma organização ativa por sessão.

**RN-AUTH-02** — O `owner` da organização não pode ser removido sem transferência de propriedade.

**RN-AUTH-03** — Todos os dados da plataforma são filtrados por `organization_id` via RLS — um usuário nunca acessa dados de outra org.

**RN-AUTH-04** — O `SITE_URL` usado em emails de recovery e convite deve ser a URL pública da aplicação (configurado como secret em Edge Functions).

---

## 2. Módulo: Dashboard

### Descrição

Tela inicial após login. Exibe KPIs em tempo real da organização e acesso rápido às entidades mais recentes.

### Requisitos Funcionais

**RF-DASH-01** — Exibir total de mensagens enviadas no período (configurável: hoje / 7 dias / 30 dias).

**RF-DASH-02** — Exibir número de leads capturados no período.

**RF-DASH-03** — Exibir saldo atual de créditos da organização.

**RF-DASH-04** — Exibir métrica de "tempo economizado" estimado pelo uso de IA.

**RF-DASH-05** — Exibir gráfico de atividade de mensagens por dia.

**RF-DASH-06** — Exibir lista das conversas mais recentes com link direto para o chat.

**RF-DASH-07** — Exibir status de cada agente ativo (ativo/inativo, canal, número de conversas abertas).

### Regras de Negócio

**RN-DASH-01** — Todos os dados do dashboard são filtrados pela organização do usuário logado.

**RN-DASH-02** — O cálculo de "tempo economizado" é estimativo, baseado em número de mensagens respondidas pela IA × tempo médio configurado.

---

## 3. Módulo: Agentes

### Descrição

Criação e gerenciamento de agentes de IA conversacionais. Cada agente tem personalidade, modelo de IA, base de conhecimento e integrações próprias.

### Requisitos Funcionais

**RF-AGT-01** — Criar agente com: nome, descrição, avatar/ícone, instruções de personalidade (system prompt).

**RF-AGT-02** — Selecionar modelo de IA por agente: escolha de provedor (OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, Lovable Gateway) e modelo específico.

**RF-AGT-03** — Configurar temperatura do modelo (0.0 a 1.0).

**RF-AGT-04** — Configurar conversation starters: mensagens de abertura automáticas enviadas quando uma nova conversa inicia.

**RF-AGT-05** — Configurar modo RAG por agente:
  - `only_knowledge` — IA responde somente com base no conhecimento configurado
  - `knowledge_and_general` — IA usa base de conhecimento + conhecimento geral do modelo

**RF-AGT-06** — Vincular uma base de conhecimento ao agente.

**RF-AGT-07** — Configurar voz (ElevenLabs): selecionar voz, ajustar parâmetros de velocidade/estilo.

**RF-AGT-08** — Vincular integração Google Calendar ao agente (para agendamentos via IA).

**RF-AGT-09** — Vincular conexões MCP ao agente.

**RF-AGT-10** — Ativar/desativar agente globalmente.

**RF-AGT-11** — Testar agente diretamente no painel com chat de simulação.

**RF-AGT-12** — Excluir agente (com confirmação); desvincula canais associados.

### Regras de Negócio

**RN-AGT-01** — Um agente pertence a uma organização e não pode ser compartilhado entre orgs.

**RN-AGT-02** — Se o agente usa um provedor de IA externo (não Lovable Gateway), a chave do provedor deve estar configurada em `ai_providers` da org. Caso contrário, o chat falha com erro de configuração.

**RN-AGT-03** — Um agente pode estar vinculado a múltiplas conexões WhatsApp/Telegram, mas cada conexão atende um único agente.

**RN-AGT-04** — Ao desativar um agente, conversas em andamento permanecem abertas; novas mensagens não recebem resposta automática.

---

## 4. Módulo: Base de Conhecimento

### Descrição

Ingestão, armazenamento e recuperação de conteúdo para RAG (Retrieval-Augmented Generation). Permite que o agente responda usando informações da empresa.

### Requisitos Funcionais

**RF-KB-01** — Criar base de conhecimento com nome e descrição.

**RF-KB-02** — Adicionar itens de conhecimento por **arquivo** (upload: PDF, TXT, CSV).

**RF-KB-03** — Adicionar itens de conhecimento por **URL** (página web, artigo).

**RF-KB-04** — Adicionar itens de conhecimento por **transcrição de YouTube** (URL do vídeo).

**RF-KB-05** — Exibir status de processamento de cada item: `pending` → `processing` → `ready` / `error`.

**RF-KB-06** — Excluir item de conhecimento (remove chunks e embeddings associados).

**RF-KB-07** — Excluir base de conhecimento inteira (com confirmação).

**RF-KB-08** — Exibir contagem de chunks gerados por item.

### Regras de Negócio

**RN-KB-01** — Ao adicionar um item, o sistema inicia processamento assíncrono via edge function `generate-embeddings`: extrai texto, divide em chunks, gera embeddings e salva em `knowledge_chunks`.

**RN-KB-02** — Embeddings são vetores de 1536 dimensões gerados via AI provider (Lovable Gateway ou OpenAI). O modelo de embedding deve ser compatível com o modelo de chat usado pelo agente para consistência semântica.

**RN-KB-03** — Durante o chat RAG, o sistema busca os `N` chunks mais similares semanticamente à mensagem do usuário (`N` configurável por agente) e os injeta no prompt.

**RN-KB-04** — Itens com status `error` não contribuem para o RAG; o erro deve ser exibido ao usuário com possibilidade de reprocessamento.

**RN-KB-05** — Arquivos são armazenados no bucket `knowledge` do Supabase Storage; os dados brutos não são expostos diretamente ao usuário final.

---

## 5. Módulo: Integrações

### Descrição

Conecta o hapitechAI com canais de comunicação (WhatsApp, Telegram, Widget) e serviços externos (Google Calendar, Gmail, MCP). Cada organização gerencia suas próprias conexões.

---

### 5.1 WhatsApp (Evolution API)

**RF-WA-01** — Criar instância WhatsApp com nome e associação a um agente.

**RF-WA-02** — Gerar e exibir QR Code para vincular número WhatsApp à instância criada.

**RF-WA-03** — Exibir status da conexão em tempo real: `disconnected` → `qr_code` → `connecting` → `connected`.

**RF-WA-04** — Desconectar instância (logout do WhatsApp, mantém configuração).

**RF-WA-05** — Excluir instância (desconecta + remove configuração + desvincula agente).

**RF-WA-06** — Receber mensagens inbound (texto, imagem, áudio, documento, vídeo, localização) e exibi-las no chat.

**RF-WA-07** — Enviar mensagens outbound de texto pelo painel.

**RF-WA-08** — Exibir histórico de eventos de conexão (conectou, desconectou, QR gerado, etc.).

**RN-WA-01** — Toda comunicação com a Evolution API ocorre via edge function `wuzapi-proxy` — o frontend não chama a Evolution API diretamente.

**RN-WA-02** — A URL e a chave da Evolution API são configuradas como secrets (`EVO_URL`, `EVO_KEY`). Não há fallback hardcoded em produção (débito ativo — ver 005).

**RN-WA-03** — Webhook inbound (`whatsapp-webhook`) valida `x-api-key` no header antes de processar qualquer mensagem.

---

### 5.2 Telegram

**RF-TG-01** — Conectar bot Telegram informando o token do bot (obtido via @BotFather).

**RF-TG-02** — O sistema registra automaticamente a URL do webhook na Telegram API ao salvar o token.

**RF-TG-03** — Associar bot Telegram a um agente.

**RF-TG-04** — Receber mensagens Telegram inbound e exibi-las no chat.

**RF-TG-05** — Enviar respostas de texto via Telegram.

**RF-TG-06** — Desconectar bot (remove webhook e configuração).

**RN-TG-01** — Um token de bot Telegram deve ser único por organização.

**RN-TG-02** — O webhook Telegram aponta para a edge function `telegram-webhook`; a URL é construída com a URL pública do Supabase da organização.

---

### 5.3 Widget Web

**RF-WDG-01** — Criar widget com: nome, cor primária, cor secundária, avatar do agente, texto de boas-vindas, posição (esquerda/direita), idioma.

**RF-WDG-02** — Associar widget a um agente.

**RF-WDG-03** — Gerar código de embed (script HTML) para instalação em qualquer site externo.

**RF-WDG-04** — Pré-visualizar widget com as configurações atuais antes de publicar.

**RF-WDG-05** — Ativar/desativar widget.

**RF-WDG-06** — O widget deve funcionar sem autenticação (acesso público via endpoint `/widget/:id/iframe`).

**RN-WDG-01** — Conversas de widget são armazenadas como tipo `widget` em `conversations`, vinculadas ao `widget_id`.

**RN-WDG-02** — O widget não exige login do visitante; um `session_id` anônimo é gerado e mantido no `localStorage` do site externo.

---

### 5.4 Google Calendar e Gmail

**RF-GCL-01** — Autenticar conta Google via OAuth 2.0 (popup de consentimento).

**RF-GCL-02** — Listar calendários disponíveis na conta autenticada.

**RF-GCL-03** — Selecionar calendário padrão para o agente usar.

**RF-GCL-04** — Permitir que o agente de IA consulte disponibilidade de horários e crie eventos via tool calls.

**RF-GML-01** — Autenticar conta Gmail via OAuth 2.0.

**RF-GML-02** — Permitir que o agente leia e envie emails via Gmail API (escopo configurável).

**RN-GCL-01** — Tokens OAuth são armazenados por organização no banco de dados (criptografados). O refresh token é usado para renovação silenciosa.

**RN-GCL-02** — O escopo OAuth solicitado deve ser mínimo necessário (`calendar.events` para Calendar, `gmail.send` para Gmail).

---

### 5.5 Provedores de IA

**RF-AI-01** — Cadastrar chave de API para cada provedor suportado: OpenAI, Anthropic, Google Gemini, Groq, Mistral, DeepSeek.

**RF-AI-02** — Validar conectividade da chave ao salvar (chamada de teste ao endpoint do provedor).

**RF-AI-03** — Cada agente pode selecionar qualquer provedor configurado na org.

**RN-AI-01** — Chaves são armazenadas na tabela `ai_providers` com `organization_id`. A política RLS atual é permissiva — débito crítico a corrigir (ver 005).

**RN-AI-02** — Se nenhuma chave de provedor externo for cadastrada, o Lovable AI Gateway é usado como fallback.

---

### 5.6 MCP (Model Context Protocol)

**RF-MCP-01** — Adicionar conexão MCP com: nome, URL do servidor, tipo (SSE ou Stdio).

**RF-MCP-02** — Listar ferramentas disponíveis no servidor MCP conectado.

**RF-MCP-03** — Vincular conexão MCP a um agente para uso durante o chat.

**RN-MCP-01** — Chamadas MCP ocorrem durante o fluxo de resposta do agente (tool calling). O agente decide quando chamar cada ferramenta com base nas instruções de personalidade.

---

## 6. Módulo: CRM & Chat

### Descrição

Central de atendimento e gestão de relacionamento com clientes. Cobre o ciclo completo: conversa → contato → lead → tarefa.

---

### 6.1 Conversas (Chat ao vivo)

**RF-CHT-01** — Listar todas as conversas da org com filtros: canal (WhatsApp/Telegram/Widget), status (IA ativa / aguardando humano / encerrada), agente.

**RF-CHT-02** — Abrir conversa e exibir histórico completo de mensagens com timestamps e remetente (usuário / IA / humano).

**RF-CHT-03** — Operador humano assume controle de conversa (desativa IA para aquela conversa).

**RF-CHT-04** — Operador humano devolve controle para IA (reativa IA para a conversa).

**RF-CHT-05** — Operador humano envia mensagens diretamente pelo painel.

**RF-CHT-06** — Exibir mídia recebida inline: imagem, áudio (com player), documento (com download), vídeo.

**RF-CHT-07** — Encerrar conversa manualmente.

**RF-CHT-08** — Reabrir conversa encerrada.

**RF-CHT-09** — Novas mensagens em conversas abertas aparecem em tempo real (Supabase Realtime).

**RF-CHT-10** — Exibir indicador visual de conversas aguardando atendimento humano.

**RN-CHT-01** — Quando a IA está desativada para uma conversa (`ai_active = false`), mensagens inbound não acionam resposta automática; apenas o operador humano responde.

**RN-CHT-02** — Mensagens enviadas pelo operador são gravadas com `role: human` e `sender_type: operator`.

**RN-CHT-03** — O histórico enviado ao modelo de IA inclui apenas as últimas N mensagens (janela de contexto configurável por agente).

---

### 6.2 Contatos

**RF-CON-01** — Listar contatos da org com busca por nome, telefone e email.

**RF-CON-02** — Visualizar perfil completo do contato: dados, histórico de conversas, leads e tarefas associados.

**RF-CON-03** — Criar contato manualmente com: nome, telefone, email, dados adicionais.

**RF-CON-04** — Editar dados do contato.

**RF-CON-05** — Contatos são criados automaticamente a partir de conversas inbound (número de telefone ou ID Telegram como identificador).

**RN-CON-01** — Um contato é único por `phone` (ou `telegram_id`) dentro da organização.

**RN-CON-02** — Ao receber mensagem de número desconhecido, o sistema cria um contato provisório com o número como nome.

---

### 6.3 Leads

**RF-LEAD-01** — Visualizar pipeline de leads por estágio (ex: novo, qualificado, proposta, ganho, perdido).

**RF-LEAD-02** — Criar lead manualmente ou promover contato a lead.

**RF-LEAD-03** — Mover lead entre estágios (drag-and-drop ou seleção de estágio).

**RF-LEAD-04** — Visualizar detalhes do lead: histórico de conversas, tarefas, anotações.

**RF-LEAD-05** — A IA pode criar leads automaticamente via tool call durante uma conversa (quando configurado no prompt do agente).

**RN-LEAD-01** — Um lead é sempre associado a um contato e a uma organização.

---

### 6.4 Tarefas

**RF-TASK-01** — Criar tarefa com: título, descrição, data de vencimento, prioridade, responsável, vínculo a contato/lead/conversa.

**RF-TASK-02** — Listar tarefas filtradas por status (pendente / em andamento / concluída), vencimento, responsável.

**RF-TASK-03** — Marcar tarefa como concluída.

**RF-TASK-04** — A IA pode criar tarefas automaticamente via tool call (quando configurado no agente).

---

### 6.5 Automações CRM

**RF-AUTO-01** — Criar regra de automação com gatilho de inatividade: "se conversa ficar X minutos sem resposta do usuário, executar ação Y".

**RF-AUTO-02** — Ações suportadas: enviar mensagem automática, fechar conversa, criar tarefa, adicionar tag ao contato.

**RF-AUTO-03** — Ativar/desativar regras individualmente.

**RF-AUTO-04** — Listar todas as regras com status e resumo.

**RN-AUTO-01** — A avaliação de regras é feita pela edge function `check-automation-rules`, acionada periodicamente (cron ou por evento).

**RN-AUTO-02** — Regras são filtradas por `organization_id`; cada org gerencia suas próprias automações.

---

## 7. Módulo: Financeiro (Billing)

### Descrição

Gestão de planos, créditos e cobranças via Asaas (processador de pagamentos BR). Créditos são a unidade de consumo dos recursos de IA.

### Requisitos Funcionais

**RF-BIL-01** — Exibir plano atual da organização com: nome, limite de créditos, data de renovação.

**RF-BIL-02** — Exibir saldo de créditos atual e histórico de consumo.

**RF-BIL-03** — Iniciar checkout para recarga de créditos avulsos ou mudança de plano.

**RF-BIL-04** — Listar histórico de faturas com: data, valor, status (pago/pendente/cancelado), link para boleto/NF.

**RF-BIL-05** — Receber confirmação de pagamento via webhook Asaas e creditar automaticamente na organização.

**RF-BIL-06** — Exibir dados de cobrança da organização (CNPJ, endereço, responsável).

**RF-BIL-07** — Permitir atualização dos dados de cobrança.

### Regras de Negócio

**RN-BIL-01** — Cada resposta de IA consome créditos. O custo por resposta varia por modelo e comprimento da resposta.

**RN-BIL-02** — Quando o saldo de créditos chega a zero, novas respostas de IA são bloqueadas. O operador humano ainda pode usar o painel.

**RN-BIL-03** — Toda transação de crédito (consumo ou recarga) é registrada em `credit_transactions` com valor, tipo e timestamp.

**RN-BIL-04** — Webhooks do Asaas devem ser processados de forma idempotente: o mesmo `payment_id` não pode creditar créditos duas vezes. *(Implementação atual não garante idempotência — débito a corrigir: ver 005.)*

**RN-BIL-05** — O checkout é realizado pelo Asaas; o hapitechAI não processa dados de cartão diretamente.

---

## 8. Módulo: Relatórios

### Descrição

Visão analítica do uso da plataforma por período.

### Requisitos Funcionais

**RF-REP-01** — Exibir total de mensagens por canal (WhatsApp, Telegram, Widget) no período selecionado.

**RF-REP-02** — Exibir taxa de resolução pela IA vs. escaladas para humano.

**RF-REP-03** — Exibir tempo médio de resposta por canal.

**RF-REP-04** — Exibir evolução do número de leads captados por período.

**RF-REP-05** — Permitir filtro por agente, canal e período (7 dias / 30 dias / personalizado).

---

## 9. Módulo: Configurações e Perfil

### Descrição

Configurações pessoais e da organização.

### Requisitos Funcionais

**RF-CFG-01** — Atualizar nome, foto de avatar e dados pessoais do perfil.

**RF-CFG-02** — Alterar senha.

**RF-CFG-03** — Configurar dados da organização: nome, logo, fuso horário, idioma padrão.

**RF-CFG-04** — Gerenciar membros da equipe: convidar, alterar papel, remover.

**RF-CFG-05** — Visualizar e revogar sessões ativas.

---

## 10. Módulo: Super Admin

### Descrição

Painel administrativo para gestão da plataforma como um todo. Acessível somente por usuários com role `super_admin` (não pertencentes a uma org comum).

### Requisitos Funcionais

**RF-ADM-01** — Listar todas as organizações cadastradas na plataforma.

**RF-ADM-02** — Visualizar detalhes de uma organização (usuários, agentes, saldo, plano).

**RF-ADM-03** — Ajustar saldo de créditos de uma organização manualmente.

**RF-ADM-04** — Desativar/reativar organização.

**RF-ADM-05** — Excluir organização e todos os dados associados (via edge function `delete-organization`, com confirmação dupla).

**RN-ADM-01** — Acesso ao painel Super Admin é controlado por role no JWT. Qualquer requisição sem o role correto retorna 403.

---

## 11. Requisitos Não-Funcionais Transversais

| ID | Requisito | Referência técnica |
|----|----------|-------------------|
| **RNF-01** | Isolamento total de dados entre organizações (multi-tenancy) | RLS no PostgreSQL por `organization_id` |
| **RNF-02** | Autenticação obrigatória em todas as rotas exceto `/auth`, `/widget` e callbacks OAuth | React Router guards + Supabase Auth |
| **RNF-03** | Respostas de IA devem chegar ao usuário em ≤ 10s para 95% das requisições | Monitoramento de latência por edge function |
| **RNF-04** | Interface responsiva: funcional em desktop e tablet (≥ 768px) | Tailwind CSS breakpoints |
| **RNF-05** | Todas as comunicações entre frontend e backend via HTTPS/WSS | Supabase + Cloudflare TLS Full Strict |
| **RNF-06** | Edge Functions devem validar autenticação antes de qualquer operação com dados da org | `verify_jwt` ou validação manual no handler |
| **RNF-07** | Webhooks inbound (WhatsApp, Asaas, Telegram) devem ser idempotentes | Verificação de `payment_id` / `message_id` antes de processar |
| **RNF-08** — | Chaves de API de provedores de IA não devem ser expostas ao frontend | RLS restritivo em `ai_providers` — débito ativo (ver 005) |

**Projeto:** HapitechAI
**Versão:** 1.0
**Data:** 27-05-2026  
**Status:** Em Definição

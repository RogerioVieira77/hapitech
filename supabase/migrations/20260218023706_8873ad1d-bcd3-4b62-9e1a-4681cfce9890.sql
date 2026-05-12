
-- Adiciona colunas de configuração do agente
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS transfer_to_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS summary_on_transfer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS use_emojis boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sign_agent_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS restrict_topics boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS split_responses boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_reminders boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS smart_training_search boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS agent_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS response_delay_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_interactions integer NULL;

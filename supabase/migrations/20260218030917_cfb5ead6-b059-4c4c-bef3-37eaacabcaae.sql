ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS inactivity_rules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webhook_rules jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transfer_rules jsonb DEFAULT '[]'::jsonb;
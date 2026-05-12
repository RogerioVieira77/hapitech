ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS purpose text DEFAULT 'vendas',
  ADD COLUMN IF NOT EXISTS communication_style text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS product_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS official_site text DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_o_que_fazer text DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_como_pergunta text DEFAULT '',
  ADD COLUMN IF NOT EXISTS prompt_nao_fazer text DEFAULT '';
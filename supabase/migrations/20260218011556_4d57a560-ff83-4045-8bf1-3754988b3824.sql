
-- Add source_type and source_url to knowledge_files to support text and website training
ALTER TABLE public.knowledge_files
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'document',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS content text;

-- Update existing rows to have source_type = 'document'
UPDATE public.knowledge_files SET source_type = 'document' WHERE source_type IS NULL OR source_type = '';

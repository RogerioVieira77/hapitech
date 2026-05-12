
-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- ── knowledge_chunks: stores text chunks with embeddings ─────────────────────
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_file_id uuid NOT NULL REFERENCES public.knowledge_files(id) ON DELETE CASCADE,
  chunk_index     integer NOT NULL,
  content         text NOT NULL,
  embedding       vector(1536),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for fast lookup by file id
CREATE INDEX IF NOT EXISTS knowledge_chunks_file_id_idx
  ON public.knowledge_chunks (knowledge_file_id);

-- Enable Row-Level Security
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own knowledge chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_files kf
      WHERE kf.id = knowledge_chunks.knowledge_file_id
        AND kf.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their own knowledge chunks"
  ON public.knowledge_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_files kf
      WHERE kf.id = knowledge_chunks.knowledge_file_id
        AND kf.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own knowledge chunks"
  ON public.knowledge_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_files kf
      WHERE kf.id = knowledge_chunks.knowledge_file_id
        AND kf.user_id = auth.uid()
    )
  );

-- Service role can bypass RLS (needed by edge functions)
CREATE POLICY "Service role full access to knowledge chunks"
  ON public.knowledge_chunks FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── match_knowledge_chunks: semantic similarity search ───────────────────────
CREATE OR REPLACE FUNCTION public.match_knowledge_chunks(
  query_embedding   vector(1536),
  knowledge_file_ids uuid[],
  match_count       int     DEFAULT 5,
  match_threshold   float   DEFAULT 0.3
)
RETURNS TABLE (
  id                uuid,
  knowledge_file_id uuid,
  content           text,
  similarity        float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    kc.id,
    kc.knowledge_file_id,
    kc.content,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.knowledge_file_id = ANY(knowledge_file_ids)
    AND kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

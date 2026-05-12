
-- Remove the overly permissive "service role" policy — service role bypasses RLS natively
DROP POLICY IF EXISTS "Service role full access to knowledge chunks" ON public.knowledge_chunks;

-- Move vector extension to extensions schema to avoid public schema warning
-- (pgvector is typically already in extensions schema on Supabase managed instances)
-- This is informational — Supabase managed instances handle this automatically

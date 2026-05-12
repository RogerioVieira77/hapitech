
-- Drop overly permissive policies
DROP POLICY "Service role full access conversations" ON public.conversations;
DROP POLICY "Service role full access messages" ON public.messages;

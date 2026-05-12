
-- Remove the overly permissive service role policy (service_role bypasses RLS by default)
DROP POLICY IF EXISTS "Service role can manage connection events" ON public.connection_events;

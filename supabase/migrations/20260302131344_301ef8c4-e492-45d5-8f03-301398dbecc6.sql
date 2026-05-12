-- Recreate view with security_invoker = false so it bypasses RLS on ai_providers
-- This is safe because the view only exposes id, name, display_name (no api_key)
DROP VIEW IF EXISTS public.ai_providers_public;
CREATE VIEW public.ai_providers_public 
WITH (security_invoker = false)
AS
SELECT id, name, display_name
FROM public.ai_providers
WHERE is_active = true;

GRANT SELECT ON public.ai_providers_public TO authenticated;
GRANT SELECT ON public.ai_providers_public TO anon;
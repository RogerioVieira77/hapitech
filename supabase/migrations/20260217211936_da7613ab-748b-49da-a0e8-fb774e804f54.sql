
-- Tabela de provedores de IA (armazena nome e API key criptografada)
CREATE TABLE public.ai_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- "openai", "anthropic", "google"
  display_name TEXT NOT NULL, -- "OpenAI", "Anthropic", "Google"
  api_key TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de modelos habilitados pelo admin
CREATE TABLE public.ai_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_id UUID NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL, -- ex: "gpt-4o", "claude-3-5-sonnet-20241022"
  display_name TEXT NOT NULL, -- ex: "GPT-4o"
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(provider_id, model_id)
);

-- RLS: apenas super admins gerenciam
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- Super admins podem tudo em ai_providers
CREATE POLICY "Super admins manage ai_providers"
  ON public.ai_providers FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Super admins podem tudo em ai_models
CREATE POLICY "Super admins manage ai_models"
  ON public.ai_models FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Usuários autenticados podem VER modelos habilitados
CREATE POLICY "Authenticated users view enabled models"
  ON public.ai_models FOR SELECT
  TO authenticated
  USING (is_enabled = true);

-- Trigger updated_at
CREATE TRIGGER update_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_ai_models_updated_at
  BEFORE UPDATE ON public.ai_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

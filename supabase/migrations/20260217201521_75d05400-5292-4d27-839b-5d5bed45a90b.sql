
-- Create clinicorp_connections table
CREATE TABLE public.clinicorp_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  clinic_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  clinic_name TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.clinicorp_connections ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own clinicorp connections"
  ON public.clinicorp_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own clinicorp connections"
  ON public.clinicorp_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own clinicorp connections"
  ON public.clinicorp_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own clinicorp connections"
  ON public.clinicorp_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_clinicorp_connections_updated_at
  BEFORE UPDATE ON public.clinicorp_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

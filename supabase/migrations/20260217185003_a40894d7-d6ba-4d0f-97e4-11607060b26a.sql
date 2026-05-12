
-- Create telegram_connections table
CREATE TABLE public.telegram_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  bot_name TEXT,
  bot_token TEXT NOT NULL,
  bot_username TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own telegram connections"
ON public.telegram_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own telegram connections"
ON public.telegram_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own telegram connections"
ON public.telegram_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own telegram connections"
ON public.telegram_connections FOR DELETE
USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_telegram_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_telegram_connections_updated_at
BEFORE UPDATE ON public.telegram_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_telegram_connections_updated_at();

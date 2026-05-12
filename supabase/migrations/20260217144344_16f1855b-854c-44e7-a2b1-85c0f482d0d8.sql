
-- Table to store WuzAPI integration config per user
CREATE TABLE public.wuzapi_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_url TEXT NOT NULL,
  api_token TEXT NOT NULL,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  phone_number TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.wuzapi_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own wuzapi connection"
ON public.wuzapi_connections FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wuzapi connection"
ON public.wuzapi_connections FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wuzapi connection"
ON public.wuzapi_connections FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wuzapi connection"
ON public.wuzapi_connections FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_wuzapi_connections_updated_at
BEFORE UPDATE ON public.wuzapi_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

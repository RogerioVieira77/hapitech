
CREATE TABLE public.widget_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  agent_id UUID,
  primary_color TEXT DEFAULT '#6366f1',
  welcome_message TEXT DEFAULT 'Olá! Como posso ajudar?',
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_domains TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own widgets" ON public.widget_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own widgets" ON public.widget_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own widgets" ON public.widget_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own widgets" ON public.widget_connections FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_widget_connections_updated_at
BEFORE UPDATE ON public.widget_connections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

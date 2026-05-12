
-- Create table for custom CRM pipeline stages
CREATE TABLE public.crm_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own stages" ON public.crm_stages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own stages" ON public.crm_stages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own stages" ON public.crm_stages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own stages" ON public.crm_stages FOR DELETE USING (auth.uid() = user_id);

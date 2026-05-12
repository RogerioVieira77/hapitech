
-- Create pipelines table
CREATE TABLE public.crm_pipelines (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pipelines" ON public.crm_pipelines FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own pipelines" ON public.crm_pipelines FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own pipelines" ON public.crm_pipelines FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own pipelines" ON public.crm_pipelines FOR DELETE USING (auth.uid() = user_id);

-- Add pipeline_id to crm_stages
ALTER TABLE public.crm_stages ADD COLUMN pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE CASCADE;


-- Create storage bucket for knowledge files
INSERT INTO storage.buckets (id, name, public) VALUES ('knowledge', 'knowledge', false);

-- Storage policies: users can manage their own files (files stored under user_id/ prefix)
CREATE POLICY "Users can upload their own knowledge files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own knowledge files"
ON storage.objects FOR SELECT
USING (bucket_id = 'knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own knowledge files"
ON storage.objects FOR DELETE
USING (bucket_id = 'knowledge' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Create knowledge_files table to track metadata
CREATE TABLE public.knowledge_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own knowledge files"
ON public.knowledge_files FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own knowledge files"
ON public.knowledge_files FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own knowledge files"
ON public.knowledge_files FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own knowledge files"
ON public.knowledge_files FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_knowledge_files_updated_at
BEFORE UPDATE ON public.knowledge_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

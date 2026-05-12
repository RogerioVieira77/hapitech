
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge', 'knowledge', false);

CREATE POLICY "Users can upload knowledge files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'knowledge' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can read own knowledge files"
ON storage.objects FOR SELECT
USING (bucket_id = 'knowledge' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own knowledge files"
ON storage.objects FOR DELETE
USING (bucket_id = 'knowledge' AND auth.uid() IS NOT NULL);

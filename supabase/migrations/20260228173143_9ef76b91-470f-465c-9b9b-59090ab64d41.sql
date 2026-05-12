
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('chat-media', 'chat-media', true, 52428800, ARRAY['audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','application/pdf','application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload chat media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'chat-media');

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read chat media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media');

-- Allow public read for shared media
CREATE POLICY "Public can read chat media"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'chat-media');

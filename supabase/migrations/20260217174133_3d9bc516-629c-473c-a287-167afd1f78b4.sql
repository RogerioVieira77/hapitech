
ALTER TABLE public.conversations
ADD COLUMN last_message_sender text DEFAULT NULL,
ADD COLUMN last_message_media_type text DEFAULT NULL;

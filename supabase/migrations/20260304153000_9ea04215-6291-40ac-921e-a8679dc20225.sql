ALTER TABLE public.smtp_settings
ADD COLUMN IF NOT EXISTS gmail_oauth_refresh_token text,
ADD COLUMN IF NOT EXISTS gmail_oauth_email text,
ADD COLUMN IF NOT EXISTS use_gmail_oauth boolean DEFAULT false;
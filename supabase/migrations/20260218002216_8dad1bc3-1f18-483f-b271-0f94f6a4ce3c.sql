-- Allow creating a telegram connection with just a name (token added later via connect flow)
ALTER TABLE public.telegram_connections
  ALTER COLUMN bot_token SET DEFAULT '',
  ALTER COLUMN bot_token DROP NOT NULL;

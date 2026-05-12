
-- Remove unique constraint on user_id to allow multiple instances per user
ALTER TABLE public.wuzapi_connections DROP CONSTRAINT IF EXISTS wuzapi_connections_user_id_key;

-- Add unique constraint on user_id + phone_number combo instead
ALTER TABLE public.wuzapi_connections ADD CONSTRAINT wuzapi_connections_user_instance_key UNIQUE (user_id, phone_number);

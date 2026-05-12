
-- 1. connection_events
CREATE TABLE public.connection_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  connection_type text NOT NULL,
  channel_name text,
  disconnected_at timestamptz NOT NULL DEFAULT now(),
  reconnected_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connection_events" ON public.connection_events FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- 3. ai_providers_public (read-only view for public provider info)
CREATE VIEW public.ai_providers_public AS
  SELECT id, name, display_name FROM public.ai_providers;

-- 4. Add balance_after and agent_id columns to credit_transactions
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS balance_after integer DEFAULT 0;
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS agent_id uuid;

-- 5. get_user_org_id function
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1;
$$;

-- 6. set_user_credits function
CREATE OR REPLACE FUNCTION public.set_user_credits(_user_id uuid, _amount integer, _operation text, _description text DEFAULT '')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance integer;
  new_balance integer;
BEGIN
  SELECT COALESCE(balance, 0) INTO current_balance FROM public.user_credits WHERE user_id = _user_id;
  IF NOT FOUND THEN
    current_balance := 0;
    INSERT INTO public.user_credits (user_id, balance) VALUES (_user_id, 0);
  END IF;

  IF _operation = 'add' THEN
    new_balance := current_balance + _amount;
  ELSIF _operation = 'subtract' THEN
    new_balance := GREATEST(current_balance - _amount, 0);
  ELSIF _operation = 'set' THEN
    new_balance := _amount;
  ELSE
    RAISE EXCEPTION 'Invalid operation: %', _operation;
  END IF;

  UPDATE public.user_credits SET balance = new_balance, updated_at = now() WHERE user_id = _user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, description)
  VALUES (_user_id, _amount, new_balance, CASE WHEN _operation = 'subtract' THEN 'debit' ELSE 'credit' END, _description);
END;
$$;

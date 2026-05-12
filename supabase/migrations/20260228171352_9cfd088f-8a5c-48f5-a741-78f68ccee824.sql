
-- 1. Fix Security Definer View: recreate with security_invoker
DROP VIEW IF EXISTS public.ai_providers_public;
CREATE VIEW public.ai_providers_public
WITH (security_invoker = on) AS
  SELECT id, name, display_name
  FROM public.ai_providers;

-- 2. Fix get_user_org_id: add search_path
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1;
$$;

-- 3. Fix set_user_credits: add search_path
CREATE OR REPLACE FUNCTION public.set_user_credits(_user_id uuid, _amount integer, _operation text, _description text DEFAULT ''::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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

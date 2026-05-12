-- Tabela de saldo de créditos por usuário
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- Usuário vê o próprio saldo
CREATE POLICY "Users can view own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Super admin gerencia todos os créditos
CREATE POLICY "Super admins manage credits"
  ON public.user_credits FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger updated_at
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de histórico de transações
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL DEFAULT 0,
  type text NOT NULL CHECK (type IN ('add', 'deduct', 'set')),
  description text,
  model_id text,
  agent_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Usuário vê o próprio histórico
CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Super admin vê todos
CREATE POLICY "Super admins view all transactions"
  ON public.credit_transactions FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Edge functions inserem transações (via service role key — sem RLS)
CREATE POLICY "Service role inserts transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (true);

-- Função auxiliar para descontar créditos atomicamente
CREATE OR REPLACE FUNCTION public.deduct_credits(
  _user_id uuid,
  _amount integer,
  _model_id text DEFAULT NULL,
  _agent_id text DEFAULT NULL,
  _description text DEFAULT 'Uso de IA'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
BEGIN
  -- Pega saldo atual com lock
  SELECT balance INTO _current_balance
  FROM public.user_credits
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'no_credits_record');
  END IF;

  IF _current_balance < _amount THEN
    RETURN json_build_object('success', false, 'error', 'insufficient_credits', 'balance', _current_balance);
  END IF;

  _new_balance := _current_balance - _amount;

  UPDATE public.user_credits SET balance = _new_balance WHERE user_id = _user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, description, model_id, agent_id)
  VALUES (_user_id, -_amount, _new_balance, 'deduct', _description, _model_id, _agent_id);

  RETURN json_build_object('success', true, 'balance', _new_balance);
END;
$$;

-- Função para adicionar/definir créditos (super admin)
CREATE OR REPLACE FUNCTION public.set_user_credits(
  _user_id uuid,
  _amount integer,
  _operation text DEFAULT 'add',
  _description text DEFAULT 'Ajuste manual'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_balance integer;
  _new_balance integer;
  _delta integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Upsert registro
  INSERT INTO public.user_credits (user_id, balance) VALUES (_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO _current_balance FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF _operation = 'set' THEN
    _new_balance := _amount;
    _delta := _amount - _current_balance;
  ELSIF _operation = 'add' THEN
    _new_balance := _current_balance + _amount;
    _delta := _amount;
  ELSIF _operation = 'subtract' THEN
    _new_balance := GREATEST(0, _current_balance - _amount);
    _delta := _new_balance - _current_balance;
  ELSE
    RAISE EXCEPTION 'Invalid operation';
  END IF;

  UPDATE public.user_credits SET balance = _new_balance WHERE user_id = _user_id;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, description)
  VALUES (_user_id, _delta, _new_balance, _operation::text, _description);

  RETURN json_build_object('success', true, 'balance', _new_balance);
END;
$$;
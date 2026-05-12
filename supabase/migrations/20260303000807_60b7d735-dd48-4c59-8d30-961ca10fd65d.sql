
-- Table to track Asaas subscriptions linked to organizations
CREATE TABLE public.asaas_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL REFERENCES public.plans(id),
  asaas_subscription_id text NOT NULL,
  asaas_customer_id text NOT NULL,
  billing_cycle text NOT NULL DEFAULT 'mensal',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asaas_subscription_id)
);

ALTER TABLE public.asaas_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own asaas_subscriptions"
  ON public.asaas_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin can manage all asaas_subscriptions"
  ON public.asaas_subscriptions FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

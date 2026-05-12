
-- 1. solarmarket_connections
CREATE TABLE public.solarmarket_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  api_key text NOT NULL,
  company_name text,
  is_connected boolean NOT NULL DEFAULT false,
  settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.solarmarket_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own solarmarket_connections" ON public.solarmarket_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. clinicorp_connections
CREATE TABLE public.clinicorp_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  clinic_id text NOT NULL,
  api_key text NOT NULL,
  clinic_name text,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinicorp_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own clinicorp_connections" ON public.clinicorp_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3. contact_custom_fields
CREATE TABLE public.contact_custom_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  field_options jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_custom_fields" ON public.contact_custom_fields FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4. contact_custom_field_values
CREATE TABLE public.contact_custom_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_field_id uuid NOT NULL REFERENCES public.contact_custom_fields(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_custom_field_values" ON public.contact_custom_field_values FOR ALL USING (true) WITH CHECK (true);

-- 5. conversation_tags
CREATE TABLE public.conversation_tags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, tag_id)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage conversation_tags" ON public.conversation_tags FOR ALL USING (true) WITH CHECK (true);

-- 6. crm_automation_rules
CREATE TABLE public.crm_automation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_slug text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb DEFAULT '{}'::jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage crm_automation_rules" ON public.crm_automation_rules FOR ALL USING (true) WITH CHECK (true);

-- 7. credit_transactions
CREATE TABLE public.credit_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'usage',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own credit_transactions" ON public.credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- 8. user_credits
CREATE TABLE public.user_credits (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own user_credits" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);

-- 9. google_calendar_connections
CREATE TABLE public.google_calendar_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  google_email text NOT NULL,
  calendar_id text NOT NULL,
  calendar_name text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  is_always_open boolean NOT NULL DEFAULT false,
  business_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  access_token text,
  refresh_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own google_calendar_connections" ON public.google_calendar_connections FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10. lead_contacts
CREATE TABLE public.lead_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  role text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lead_contacts" ON public.lead_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11. lead_products
CREATE TABLE public.lead_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lead_products" ON public.lead_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 12. lead_comments
CREATE TABLE public.lead_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own lead_comments" ON public.lead_comments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 13. crm_custom_fields
CREATE TABLE public.crm_custom_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_on_board boolean NOT NULL DEFAULT false,
  show_on_list boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own crm_custom_fields" ON public.crm_custom_fields FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 14. crm_custom_field_values
CREATE TABLE public.crm_custom_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.crm_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id, field_id)
);
ALTER TABLE public.crm_custom_field_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage crm_custom_field_values" ON public.crm_custom_field_values FOR ALL USING (true) WITH CHECK (true);

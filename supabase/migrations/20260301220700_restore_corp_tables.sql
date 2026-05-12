
-- ============================================================
-- RESTORE: Recreate all corp (MVO) tables that were removed
-- ============================================================

-- 1. profiles_legacy
CREATE TABLE IF NOT EXISTS public.profiles_legacy (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  name text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role = ANY (ARRAY['admin','user'])),
  plan text NOT NULL DEFAULT 'monthly' CHECK (plan = ANY (ARRAY['monthly','quarterly','annual'])),
  currencies text[] DEFAULT ARRAY['BRL'::text],
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.profiles_legacy ENABLE ROW LEVEL SECURITY;

-- 2. stores
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  store_id text NOT NULL,
  platform text NOT NULL CHECK (platform = ANY (ARRAY['shopify','yampi','cartpanda','nuvemshop','kiwify','hotmart'])),
  platform_url text,
  api_key text,
  api_secret text,
  access_token text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  schema_name text,
  client_id text,
  client_secret text,
  max_users integer DEFAULT 0,
  permissions jsonb DEFAULT '{}'::jsonb,
  enabled_menus jsonb DEFAULT '{"vendas": true, "projetos": true, "dashboard": true, "marketing": false, "financeiro": true, "impressao_3d": false}'::jsonb
);
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

-- 3. marketing_integrations
CREATE TABLE IF NOT EXISTS public.marketing_integrations (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK (provider = ANY (ARRAY['facebook','google','tiktok'])),
  access_token text,
  refresh_token text,
  account_id text,
  account_name text,
  is_active boolean DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.marketing_integrations ENABLE ROW LEVEL SECURITY;

-- 4. clients
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  phone text,
  comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

-- 5. projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients(id),
  title text NOT NULL,
  description text DEFAULT '',
  image text,
  status text NOT NULL DEFAULT 'todo' CHECK (status = ANY (ARRAY['canceled','todo','in-progress','paused','done'])),
  priority text NOT NULL DEFAULT 'none' CHECK (priority = ANY (ARRAY['none','low','medium','high','urgent'])),
  due_date timestamptz,
  value numeric DEFAULT 0,
  technologies text[] DEFAULT ARRAY[]::text[],
  tags text[] DEFAULT ARRAY[]::text[],
  assignee text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 6. orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  store_id uuid NOT NULL REFERENCES public.stores(id),
  external_order_id text NOT NULL,
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  sales_channel text,
  total_price numeric NOT NULL,
  currency text DEFAULT 'BRL',
  financial_status text NOT NULL,
  processing_status text,
  fulfillment_status text,
  shipping_method text,
  items_count integer DEFAULT 0,
  source text DEFAULT 'webhook' CHECK (source = ANY (ARRAY['webhook','api','import'])),
  order_created_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  customer_phone text,
  picked_up_at timestamptz,
  customer_cpf character varying
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 7. order_items
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL REFERENCES public.orders(id),
  product_id text,
  variant_id text,
  title text NOT NULL,
  variant_title text,
  sku text,
  quantity integer NOT NULL DEFAULT 1,
  price numeric NOT NULL,
  image_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 8. team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  role text NOT NULL DEFAULT 'viewer' CHECK (role = ANY (ARRAY['admin','editor','viewer'])),
  is_active boolean DEFAULT true,
  password_hash text,
  last_login timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  auth_user_id uuid REFERENCES auth.users(id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- 9. team_permissions
CREATE TABLE IF NOT EXISTS public.team_permissions (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  team_member_id uuid NOT NULL UNIQUE REFERENCES public.team_members(id),
  can_view_dashboard boolean DEFAULT true,
  can_view_analytics boolean DEFAULT true,
  can_view_sales boolean DEFAULT true,
  can_edit_sales boolean DEFAULT false,
  can_export_sales boolean DEFAULT false,
  can_view_products boolean DEFAULT true,
  can_create_products boolean DEFAULT false,
  can_edit_products boolean DEFAULT false,
  can_delete_products boolean DEFAULT false,
  can_view_projects boolean DEFAULT true,
  can_create_projects boolean DEFAULT false,
  can_edit_projects boolean DEFAULT false,
  can_delete_projects boolean DEFAULT false,
  can_view_settings boolean DEFAULT false,
  can_edit_settings boolean DEFAULT false,
  can_view_integrations boolean DEFAULT false,
  can_manage_integrations boolean DEFAULT false,
  can_view_team boolean DEFAULT false,
  can_manage_team boolean DEFAULT false,
  can_import_data boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  store_ids uuid[] DEFAULT ARRAY[]::uuid[]
);
ALTER TABLE public.team_permissions ENABLE ROW LEVEL SECURITY;

-- 10. qr_code_queue
CREATE TABLE IF NOT EXISTS public.qr_code_queue (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id),
  order_number text NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  qr_code_url text NOT NULL,
  qr_code_base64 text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','sent','failed','skipped'])),
  sent_at timestamptz,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- Recreate RLS policies for the corp tables
-- ============================================================

-- profiles_legacy policies
CREATE POLICY "Users can view own profile" ON public.profiles_legacy FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles_legacy FOR UPDATE USING (auth.uid() = id);

-- stores policies
CREATE POLICY "Users can view own stores" ON public.stores FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own stores" ON public.stores FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own stores" ON public.stores FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own stores" ON public.stores FOR DELETE USING (auth.uid() = user_id);

-- marketing_integrations policies
CREATE POLICY "Users can view own integrations" ON public.marketing_integrations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own integrations" ON public.marketing_integrations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own integrations" ON public.marketing_integrations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own integrations" ON public.marketing_integrations FOR DELETE USING (auth.uid() = user_id);

-- clients policies
CREATE POLICY "Users can view own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own clients" ON public.clients FOR DELETE USING (auth.uid() = user_id);

-- projects policies
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- orders policies
CREATE POLICY "Users can view orders of own stores" ON public.orders FOR SELECT 
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert orders for own stores" ON public.orders FOR INSERT 
  WITH CHECK (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));
CREATE POLICY "Users can update orders of own stores" ON public.orders FOR UPDATE 
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete orders of own stores" ON public.orders FOR DELETE 
  USING (store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()));

-- order_items policies
CREATE POLICY "Users can view order items of own stores" ON public.order_items FOR SELECT 
  USING (order_id IN (SELECT o.id FROM public.orders o JOIN public.stores s ON o.store_id = s.id WHERE s.user_id = auth.uid()));
CREATE POLICY "Users can insert order items for own stores" ON public.order_items FOR INSERT 
  WITH CHECK (order_id IN (SELECT o.id FROM public.orders o JOIN public.stores s ON o.store_id = s.id WHERE s.user_id = auth.uid()));
CREATE POLICY "Users can update order items of own stores" ON public.order_items FOR UPDATE 
  USING (order_id IN (SELECT o.id FROM public.orders o JOIN public.stores s ON o.store_id = s.id WHERE s.user_id = auth.uid()));

-- team_members policies
CREATE POLICY "Owners can view own team" ON public.team_members FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners can insert team members" ON public.team_members FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners can update own team" ON public.team_members FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "Owners can delete own team" ON public.team_members FOR DELETE USING (auth.uid() = owner_id);
CREATE POLICY "Team members can view themselves" ON public.team_members FOR SELECT USING (auth.uid() = auth_user_id);

-- team_permissions policies
CREATE POLICY "Owners can manage team permissions" ON public.team_permissions FOR ALL 
  USING (team_member_id IN (SELECT id FROM public.team_members WHERE owner_id = auth.uid()));
CREATE POLICY "Team members can view own permissions" ON public.team_permissions FOR SELECT 
  USING (team_member_id IN (SELECT id FROM public.team_members WHERE auth_user_id = auth.uid()));

-- ============================================================
-- Recreate functions
-- ============================================================

-- generate_qr_code_for_order
CREATE OR REPLACE FUNCTION public.generate_qr_code_for_order()
RETURNS TRIGGER AS $$
DECLARE
  v_store RECORD;
  v_qr_url TEXT;
  v_qr_base64 TEXT;
BEGIN
  SELECT * INTO v_store FROM public.stores WHERE id = NEW.store_id;
  
  v_qr_url := 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' || 
    encode(convert_to(
      json_build_object(
        'order_number', NEW.order_number,
        'customer_name', NEW.customer_name,
        'total_price', NEW.total_price,
        'store', v_store.name
      )::text, 'UTF8'), 'base64');
  
  v_qr_base64 := '';

  INSERT INTO public.qr_code_queue (
    order_id, order_number, customer_name, customer_email, customer_phone,
    qr_code_url, qr_code_base64, status
  ) VALUES (
    NEW.id, NEW.order_number, NEW.customer_name, NEW.customer_email, NEW.customer_phone,
    v_qr_url, v_qr_base64, 
    CASE WHEN NEW.customer_phone IS NOT NULL AND NEW.customer_phone != '' THEN 'pending' ELSE 'skipped' END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- send_qr_code_on_order_created
CREATE OR REPLACE FUNCTION public.send_qr_code_on_order_created()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('new_order_qr', json_build_object(
    'order_id', NEW.id,
    'order_number', NEW.order_number,
    'customer_phone', NEW.customer_phone
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- create_store_schema
CREATE OR REPLACE FUNCTION public.create_store_schema(store_uuid uuid, store_schema_name text)
RETURNS void AS $$
BEGIN
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', store_schema_name);
  
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.orders (
      id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
      external_order_id text,
      order_number text,
      customer_name text,
      customer_email text,
      total_price numeric,
      currency text DEFAULT ''BRL'',
      financial_status text,
      fulfillment_status text,
      order_created_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )', store_schema_name);
    
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.order_items (
      id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
      order_id uuid REFERENCES %I.orders(id),
      product_id text,
      title text,
      variant_title text,
      sku text,
      quantity integer DEFAULT 1,
      price numeric,
      image_url text,
      created_at timestamptz DEFAULT now()
    )', store_schema_name, store_schema_name);
    
  UPDATE public.stores SET schema_name = store_schema_name WHERE id = store_uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- generate_store_schema_name
CREATE OR REPLACE FUNCTION public.generate_store_schema_name(store_uuid uuid, store_domain text)
RETURNS text AS $$
DECLARE
  v_schema_name text;
BEGIN
  v_schema_name := 'store_' || replace(replace(lower(store_domain), '.', '_'), '-', '_');
  v_schema_name := regexp_replace(v_schema_name, '[^a-z0-9_]', '', 'g');
  RETURN v_schema_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- create_tenant_schema
CREATE OR REPLACE FUNCTION public.create_tenant_schema(partner_id uuid)
RETURNS void AS $$
DECLARE
  v_schema_name text;
BEGIN
  v_schema_name := 'tenant_' || replace(partner_id::text, '-', '_');
  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', v_schema_name);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- upsert_order_in_schema
CREATE OR REPLACE FUNCTION public.upsert_order_in_schema(p_schema_name text, p_order_data jsonb)
RETURNS uuid AS $$
DECLARE
  v_order_id uuid;
BEGIN
  EXECUTE format('
    INSERT INTO %I.orders (external_order_id, order_number, customer_name, customer_email, total_price, currency, financial_status, fulfillment_status, order_created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (external_order_id) DO UPDATE SET
      order_number = EXCLUDED.order_number,
      customer_name = EXCLUDED.customer_name,
      customer_email = EXCLUDED.customer_email,
      total_price = EXCLUDED.total_price,
      financial_status = EXCLUDED.financial_status,
      fulfillment_status = EXCLUDED.fulfillment_status,
      updated_at = now()
    RETURNING id', p_schema_name)
  INTO v_order_id
  USING 
    p_order_data->>'external_order_id',
    p_order_data->>'order_number',
    p_order_data->>'customer_name',
    p_order_data->>'customer_email',
    (p_order_data->>'total_price')::numeric,
    COALESCE(p_order_data->>'currency', 'BRL'),
    p_order_data->>'financial_status',
    p_order_data->>'fulfillment_status',
    (p_order_data->>'order_created_at')::timestamptz;
    
  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- insert_order_items_in_schema
CREATE OR REPLACE FUNCTION public.insert_order_items_in_schema(p_schema_name text, p_order_id uuid, p_items jsonb)
RETURNS void AS $$
DECLARE
  v_item jsonb;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    EXECUTE format('
      INSERT INTO %I.order_items (order_id, product_id, title, variant_title, sku, quantity, price, image_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', p_schema_name)
    USING 
      p_order_id,
      v_item->>'product_id',
      v_item->>'title',
      v_item->>'variant_title',
      v_item->>'sku',
      COALESCE((v_item->>'quantity')::integer, 1),
      (v_item->>'price')::numeric,
      v_item->>'image_url';
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Recreate triggers
-- ============================================================
CREATE TRIGGER trigger_generate_qr_code_queue
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_qr_code_for_order();

CREATE TRIGGER trigger_send_qr_on_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.send_qr_code_on_order_created();

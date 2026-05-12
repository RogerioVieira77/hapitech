
-- ============================================================
-- HAPITECH CORE SCHEMA
-- Creates all missing tables for the AI agent platform
-- ============================================================

-- Enable pgvector if available (ignore errors)
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 0. Handle existing profiles table conflict
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles' AND table_name != 'profiles_legacy') THEN
    -- Check if this is the old-style profiles (has 'name' column but not 'user_id' column)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'name')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'user_id') THEN
      -- Drop FK constraints referencing old profiles
      BEGIN ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_owner_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_user_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
      BEGIN ALTER TABLE public.marketing_integrations DROP CONSTRAINT IF EXISTS marketing_integrations_user_id_fkey; EXCEPTION WHEN OTHERS THEN NULL; END;
      ALTER TABLE public.profiles RENAME TO profiles_legacy;
    END IF;
  END IF;
END $$;

-- 1. PROFILES (new schema for Hapitech)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  compact_mode boolean NOT NULL DEFAULT false,
  notif_sound boolean NOT NULL DEFAULT true,
  notif_desktop boolean NOT NULL DEFAULT false,
  language text NOT NULL DEFAULT 'pt-BR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. PLANS
CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  monthly_price numeric NOT NULL DEFAULT 0,
  monthly_credits integer NOT NULL DEFAULT 0,
  max_agents integer NOT NULL DEFAULT 1,
  max_connections integer NOT NULL DEFAULT 1,
  max_members integer NOT NULL DEFAULT 5,
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  popular boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

INSERT INTO public.plans (slug, name, monthly_price, monthly_credits, max_agents, max_connections, max_members, features, is_active, position, popular)
VALUES ('free', 'Gratuito', 0, 100, 2, 3, 5, ARRAY['basic_chat','whatsapp','telegram','widget'], true, 0, false)
ON CONFLICT (slug) DO NOTHING;

-- 3. ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  subscription_status text NOT NULL DEFAULT 'active',
  billing_period text NOT NULL DEFAULT 'monthly',
  current_period_start timestamptz DEFAULT now(),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 4. ORGANIZATION MEMBERS
CREATE TABLE IF NOT EXISTS public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 5. USER ROLES
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 6. USER CREDITS
CREATE TABLE IF NOT EXISTS public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- 7. CREDIT TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'usage',
  description text,
  agent_id uuid,
  model_id text,
  balance_after integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- 8. WUZAPI CONNECTIONS (WhatsApp via Evolution API)
CREATE TABLE IF NOT EXISTS public.wuzapi_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_url text NOT NULL,
  api_token text NOT NULL,
  is_connected boolean NOT NULL DEFAULT false,
  phone_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wuzapi_connections ENABLE ROW LEVEL SECURITY;

-- 9. TELEGRAM CONNECTIONS
CREATE TABLE IF NOT EXISTS public.telegram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_name text,
  bot_token text,
  bot_username text,
  is_connected boolean NOT NULL DEFAULT false,
  webhook_url text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

-- 10. AGENTS
CREATE TABLE IF NOT EXISTS public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  instructions text NOT NULL DEFAULT 'Você é um assistente útil e amigável.',
  model text NOT NULL DEFAULT 'gpt-4o-mini',
  temperature numeric NOT NULL DEFAULT 0.7,
  status text NOT NULL DEFAULT 'active',
  conversation_starters text[],
  avatar_url text,
  connection_id uuid REFERENCES public.wuzapi_connections(id) ON DELETE SET NULL,
  telegram_connection_id uuid REFERENCES public.telegram_connections(id) ON DELETE SET NULL,
  purpose text,
  communication_style text,
  product_name text,
  product_description text,
  official_site text,
  prompt_o_que_fazer text,
  prompt_como_pergunta text,
  prompt_nao_fazer text,
  transfer_to_human boolean NOT NULL DEFAULT false,
  summary_on_transfer boolean NOT NULL DEFAULT false,
  use_emojis boolean NOT NULL DEFAULT true,
  sign_agent_name boolean NOT NULL DEFAULT false,
  restrict_topics boolean NOT NULL DEFAULT false,
  split_responses boolean NOT NULL DEFAULT false,
  split_delay_ms integer NOT NULL DEFAULT 1500,
  split_response_max_chars integer,
  allow_reminders boolean NOT NULL DEFAULT false,
  smart_training_search boolean NOT NULL DEFAULT false,
  agent_timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  response_delay_seconds integer NOT NULL DEFAULT 0,
  max_interactions integer,
  max_response_chars integer,
  transfer_rules jsonb,
  inactivity_rules jsonb,
  webhook_rules jsonb,
  elevenlabs_api_key text,
  elevenlabs_voice_id text,
  elevenlabs_model text,
  elevenlabs_enabled boolean DEFAULT false,
  elevenlabs_always_audio boolean DEFAULT false,
  elevenlabs_audio_on_audio boolean DEFAULT false,
  elevenlabs_stability numeric DEFAULT 0.5,
  elevenlabs_similarity numeric DEFAULT 0.75,
  elevenlabs_style numeric DEFAULT 0,
  elevenlabs_speed numeric DEFAULT 1,
  elevenlabs_speaker_boost boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- 11. WIDGET CONNECTIONS
CREATE TABLE IF NOT EXISTS public.widget_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  primary_color text DEFAULT '#6366f1',
  welcome_message text DEFAULT 'Olá! Como posso ajudar?',
  is_active boolean NOT NULL DEFAULT true,
  allowed_domains text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.widget_connections ENABLE ROW LEVEL SECURITY;

-- 12. CONVERSATIONS
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_company text,
  contact_city text,
  contact_state text,
  contact_gender text,
  contact_birth_date text,
  contact_job_title text,
  profile_picture_url text,
  last_message text,
  last_message_at timestamptz,
  last_message_sender text,
  last_message_media_type text,
  unread_count integer DEFAULT 0,
  is_resolved boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  is_ai_active boolean DEFAULT true,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES public.wuzapi_connections(id) ON DELETE SET NULL,
  assigned_to uuid,
  crm_stage text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- 13. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  sender text NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text,
  message_id text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 14. TAGS
CREATE TABLE IF NOT EXISTS public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- 15. CONVERSATION TAGS
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, tag_id)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;

-- 16. CONTACT CUSTOM FIELDS
CREATE TABLE IF NOT EXISTS public.contact_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  field_options jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

-- 17. CONTACT CUSTOM FIELD VALUES
CREATE TABLE IF NOT EXISTS public.contact_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  custom_field_id uuid NOT NULL REFERENCES public.contact_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_custom_field_values ENABLE ROW LEVEL SECURITY;

-- 18. CONTACT NOTES
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

-- 19. KNOWLEDGE FILES
CREATE TABLE IF NOT EXISTS public.knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size integer NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  source_type text NOT NULL DEFAULT 'upload',
  source_url text,
  content text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

-- 20. KNOWLEDGE CHUNKS (embedding as text)
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_file_id uuid NOT NULL REFERENCES public.knowledge_files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  embedding text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- 21. AGENT KNOWLEDGE FILES
CREATE TABLE IF NOT EXISTS public.agent_knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  knowledge_file_id uuid NOT NULL REFERENCES public.knowledge_files(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, knowledge_file_id)
);
ALTER TABLE public.agent_knowledge_files ENABLE ROW LEVEL SECURITY;

-- 22. AI PROVIDERS
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

-- 23. AI MODELS
CREATE TABLE IF NOT EXISTS public.ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  display_name text NOT NULL,
  credits_per_response integer NOT NULL DEFAULT 1,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

-- 24. AI PROVIDERS PUBLIC VIEW
CREATE OR REPLACE VIEW public.ai_providers_public AS
  SELECT id, name, display_name FROM public.ai_providers WHERE is_active = true;

-- 25. CLINICORP CONNECTIONS
CREATE TABLE IF NOT EXISTS public.clinicorp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  clinic_id text NOT NULL,
  clinic_name text,
  is_connected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinicorp_connections ENABLE ROW LEVEL SECURITY;

-- 26. SOLARMARKET CONNECTIONS
CREATE TABLE IF NOT EXISTS public.solarmarket_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key text NOT NULL,
  company_name text,
  is_connected boolean NOT NULL DEFAULT true,
  settings jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.solarmarket_connections ENABLE ROW LEVEL SECURITY;

-- 27. GOOGLE CALENDAR CONNECTIONS
CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  calendar_id text NOT NULL,
  calendar_name text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  access_token text,
  refresh_token text,
  business_hours jsonb NOT NULL DEFAULT '{}',
  fields jsonb NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  is_always_open boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

-- 28. CONNECTION EVENTS
CREATE TABLE IF NOT EXISTS public.connection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  connection_type text NOT NULL,
  channel_name text,
  disconnected_at timestamptz NOT NULL DEFAULT now(),
  reconnected_at timestamptz,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;

-- 29. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 30. LEADS (CRM)
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  source text,
  stage text NOT NULL DEFAULT 'novo',
  value numeric,
  priority text,
  notes text,
  assigned_to text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- 31. LEAD COMMENTS
CREATE TABLE IF NOT EXISTS public.lead_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_comments ENABLE ROW LEVEL SECURITY;

-- 32. LEAD CONTACTS
CREATE TABLE IF NOT EXISTS public.lead_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  role text NOT NULL DEFAULT 'contact',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_contacts ENABLE ROW LEVEL SECURITY;

-- 33. LEAD PRODUCTS
CREATE TABLE IF NOT EXISTS public.lead_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_products ENABLE ROW LEVEL SECURITY;

-- 34. LEAD TASKS
CREATE TABLE IF NOT EXISTS public.lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  task_type text NOT NULL DEFAULT 'task',
  status text NOT NULL DEFAULT 'pending',
  due_date timestamptz,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

-- 35. CRM PIPELINES
CREATE TABLE IF NOT EXISTS public.crm_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

-- 36. CRM STAGES
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

-- 37. CRM CUSTOM FIELDS
CREATE TABLE IF NOT EXISTS public.crm_custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '{}',
  position integer NOT NULL DEFAULT 0,
  show_on_board boolean NOT NULL DEFAULT false,
  show_on_list boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_custom_fields ENABLE ROW LEVEL SECURITY;

-- 38. CRM CUSTOM FIELD VALUES
CREATE TABLE IF NOT EXISTS public.crm_custom_field_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES public.crm_custom_fields(id) ON DELETE CASCADE,
  value text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_custom_field_values ENABLE ROW LEVEL SECURITY;

-- 39. CRM AUTOMATION RULES
CREATE TABLE IF NOT EXISTS public.crm_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.crm_pipelines(id) ON DELETE CASCADE,
  stage_slug text NOT NULL,
  action_type text NOT NULL,
  action_config jsonb,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_automation_rules ENABLE ROW LEVEL SECURITY;

-- 40. MCP CONNECTIONS
CREATE TABLE IF NOT EXISTS public.mcp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon_url text,
  server_url text NOT NULL,
  server_type text NOT NULL DEFAULT 'streamable_http',
  auth_type text,
  preset_key text,
  is_connected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mcp_connections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_connection_id ON public.agents(connection_id);
CREATE INDEX IF NOT EXISTS idx_wuzapi_conn_user_id ON public.wuzapi_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_conn_user_id ON public.telegram_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_widget_conn_user_id ON public.widget_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_remote_jid ON public.conversations(remote_jid);
CREATE INDEX IF NOT EXISTS idx_conversations_conn_id ON public.conversations(connection_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_ts ON public.messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_user_id ON public.knowledge_files(user_id);
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om1
    JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid() AND om2.user_id = _check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_member_direct(_check_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om1
    JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid() AND om2.user_id = _check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.get_org_members_with_email()
RETURNS TABLE(email text, last_sign_in_at timestamptz, user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE _org_id uuid;
BEGIN
  SELECT organization_id INTO _org_id FROM public.organization_members om WHERE om.user_id = auth.uid() LIMIT 1;
  IF _org_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT u.email::text, u.last_sign_in_at, om.user_id
    FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    WHERE om.organization_id = _org_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_users', (SELECT count(*) FROM auth.users),
    'total_agents', (SELECT count(*) FROM public.agents),
    'total_conversations', (SELECT count(*) FROM public.conversations),
    'total_messages', (SELECT count(*) FROM public.messages),
    'total_organizations', (SELECT count(*) FROM public.organizations)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin') THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at
    )), '[]'::jsonb) FROM auth.users u
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_user_credits(
  _user_id uuid, _amount integer, _operation text DEFAULT 'add', _description text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE _new_balance integer;
BEGIN
  INSERT INTO public.user_credits (user_id, balance)
  VALUES (_user_id, CASE WHEN _operation = 'set' THEN _amount ELSE _amount END)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = CASE
      WHEN _operation = 'set' THEN _amount
      WHEN _operation = 'add' THEN user_credits.balance + _amount
      WHEN _operation = 'subtract' THEN GREATEST(user_credits.balance - _amount, 0)
      ELSE user_credits.balance
    END, updated_at = now();
  SELECT balance INTO _new_balance FROM public.user_credits WHERE user_id = _user_id;
  INSERT INTO public.credit_transactions (user_id, amount, type, description, balance_after)
  VALUES (_user_id, _amount, _operation, _description, _new_balance);
END;
$$;

-- Helper for RLS
CREATE OR REPLACE FUNCTION public._org_user_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT om2.user_id
  FROM public.organization_members om1
  JOIN public.organization_members om2 ON om1.organization_id = om2.organization_id
  WHERE om1.user_id = auth.uid();
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- PROFILES
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT USING (user_id = auth.uid() OR user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (user_id = auth.uid());

-- PLANS
CREATE POLICY "plans_select_all" ON public.plans FOR SELECT USING (true);

-- ORGANIZATIONS
CREATE POLICY "orgs_select" ON public.organizations FOR SELECT USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "orgs_update" ON public.organizations FOR UPDATE USING (owner_id = auth.uid());

-- ORGANIZATION MEMBERS
CREATE POLICY "org_members_select" ON public.organization_members FOR SELECT USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "org_members_insert" ON public.organization_members FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "org_members_delete" ON public.organization_members FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')));

-- USER ROLES
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- USER CREDITS
CREATE POLICY "credits_select" ON public.user_credits FOR SELECT USING (user_id = auth.uid());

-- CREDIT TRANSACTIONS
CREATE POLICY "credit_tx_select" ON public.credit_transactions FOR SELECT USING (user_id = auth.uid());

-- WUZAPI (WhatsApp)
CREATE POLICY "wuzapi_select" ON public.wuzapi_connections FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "wuzapi_insert" ON public.wuzapi_connections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "wuzapi_update" ON public.wuzapi_connections FOR UPDATE USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "wuzapi_delete" ON public.wuzapi_connections FOR DELETE USING (user_id = auth.uid());

-- TELEGRAM
CREATE POLICY "telegram_select" ON public.telegram_connections FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "telegram_insert" ON public.telegram_connections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "telegram_update" ON public.telegram_connections FOR UPDATE USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "telegram_delete" ON public.telegram_connections FOR DELETE USING (user_id = auth.uid());

-- AGENTS
CREATE POLICY "agents_select" ON public.agents FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "agents_insert" ON public.agents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "agents_update" ON public.agents FOR UPDATE USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "agents_delete" ON public.agents FOR DELETE USING (user_id = auth.uid());

-- WIDGET
CREATE POLICY "widget_select" ON public.widget_connections FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "widget_insert" ON public.widget_connections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "widget_update" ON public.widget_connections FOR UPDATE USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "widget_delete" ON public.widget_connections FOR DELETE USING (user_id = auth.uid());

-- CONVERSATIONS
CREATE POLICY "conv_select" ON public.conversations FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "conv_insert" ON public.conversations FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "conv_update" ON public.conversations FOR UPDATE USING (user_id IN (SELECT public._org_user_ids()));

-- MESSAGES
CREATE POLICY "msg_select" ON public.messages FOR SELECT USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "msg_insert" ON public.messages FOR INSERT WITH CHECK (user_id = auth.uid());

-- TAGS
CREATE POLICY "tags_all" ON public.tags FOR ALL USING (user_id IN (SELECT public._org_user_ids()));

-- CONVERSATION TAGS
CREATE POLICY "conv_tags_all" ON public.conversation_tags FOR ALL USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id IN (SELECT public._org_user_ids())));

-- CONTACT FIELDS
CREATE POLICY "contact_fields_all" ON public.contact_custom_fields FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "contact_values_all" ON public.contact_custom_field_values FOR ALL USING (conversation_id IN (SELECT id FROM public.conversations WHERE user_id IN (SELECT public._org_user_ids())));

-- CONTACT NOTES
CREATE POLICY "notes_all" ON public.contact_notes FOR ALL USING (user_id IN (SELECT public._org_user_ids()));

-- KNOWLEDGE
CREATE POLICY "knowledge_files_all" ON public.knowledge_files FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "knowledge_chunks_select" ON public.knowledge_chunks FOR SELECT USING (knowledge_file_id IN (SELECT id FROM public.knowledge_files WHERE user_id IN (SELECT public._org_user_ids())));
CREATE POLICY "agent_knowledge_all" ON public.agent_knowledge_files FOR ALL USING (agent_id IN (SELECT id FROM public.agents WHERE user_id IN (SELECT public._org_user_ids())));

-- AI
CREATE POLICY "ai_providers_select" ON public.ai_providers FOR SELECT USING (true);
CREATE POLICY "ai_models_select" ON public.ai_models FOR SELECT USING (true);

-- INTEGRATIONS
CREATE POLICY "clinicorp_all" ON public.clinicorp_connections FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "solarmarket_all" ON public.solarmarket_connections FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "gcal_all" ON public.google_calendar_connections FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "conn_events_all" ON public.connection_events FOR ALL USING (user_id IN (SELECT public._org_user_ids()));

-- NOTIFICATIONS
CREATE POLICY "notif_all" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- CRM
CREATE POLICY "leads_all" ON public.leads FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "lead_comments_all" ON public.lead_comments FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "lead_contacts_all" ON public.lead_contacts FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "lead_products_all" ON public.lead_products FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "lead_tasks_all" ON public.lead_tasks FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "pipelines_all" ON public.crm_pipelines FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "stages_all" ON public.crm_stages FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "crm_fields_all" ON public.crm_custom_fields FOR ALL USING (user_id IN (SELECT public._org_user_ids()));
CREATE POLICY "crm_values_all" ON public.crm_custom_field_values FOR ALL USING (lead_id IN (SELECT id FROM public.leads WHERE user_id IN (SELECT public._org_user_ids())));
CREATE POLICY "crm_auto_all" ON public.crm_automation_rules FOR ALL USING (pipeline_id IN (SELECT id FROM public.crm_pipelines WHERE user_id IN (SELECT public._org_user_ids())));

-- MCP
CREATE POLICY "mcp_all" ON public.mcp_connections FOR ALL USING (user_id = auth.uid());

-- ============================================================
-- TRIGGER: Auto-create profile + org on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _display_name text;
  _org_name text;
  _org_id uuid;
  _free_plan_id uuid;
BEGIN
  _display_name := COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1));
  _org_name := COALESCE(NEW.raw_user_meta_data->>'org_name', _display_name);

  INSERT INTO public.profiles (user_id, display_name) VALUES (NEW.id, _display_name) ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO _free_plan_id FROM public.plans WHERE slug = 'free' AND is_active = true LIMIT 1;

  INSERT INTO public.organizations (name, owner_id, plan_id, subscription_status)
  VALUES (_org_name, NEW.id, _free_plan_id, 'active') RETURNING id INTO _org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (_org_id, NEW.id, 'owner');

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, COALESCE((SELECT monthly_credits FROM public.plans WHERE id = _free_plan_id), 100))
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- REALTIME
-- ============================================================
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================================
-- BOOTSTRAP existing users: create profiles, orgs, credits for existing auth.users
-- ============================================================
DO $$
DECLARE
  _user RECORD;
  _org_id uuid;
  _free_plan_id uuid;
BEGIN
  SELECT id INTO _free_plan_id FROM public.plans WHERE slug = 'free' AND is_active = true LIMIT 1;
  
  FOR _user IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    -- Create profile if missing
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (_user.id, COALESCE(_user.raw_user_meta_data->>'display_name', split_part(_user.email, '@', 1)))
    ON CONFLICT (user_id) DO NOTHING;

    -- Create org if user has no membership
    IF NOT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user.id) THEN
      INSERT INTO public.organizations (name, owner_id, plan_id, subscription_status)
      VALUES (
        COALESCE(_user.raw_user_meta_data->>'org_name', split_part(_user.email, '@', 1)),
        _user.id, _free_plan_id, 'active'
      ) RETURNING id INTO _org_id;

      INSERT INTO public.organization_members (organization_id, user_id, role) VALUES (_org_id, _user.id, 'owner');
    END IF;

    -- Create credits if missing
    INSERT INTO public.user_credits (user_id, balance)
    VALUES (_user.id, COALESCE((SELECT monthly_credits FROM public.plans WHERE id = _free_plan_id), 100))
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

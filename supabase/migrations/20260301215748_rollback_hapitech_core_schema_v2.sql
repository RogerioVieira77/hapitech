
-- ============================================================
-- ROLLBACK: undo create_hapitech_core_schema_v2
-- Drop everything in reverse dependency order
-- ============================================================

-- 1. Drop triggers first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
DROP TRIGGER IF EXISTS update_conversation_tags_updated_at ON public.conversation_tags;
DROP TRIGGER IF EXISTS update_tags_updated_at ON public.tags;
DROP TRIGGER IF EXISTS update_solarmarket_connections_updated_at ON public.solarmarket_connections;
DROP TRIGGER IF EXISTS update_google_calendar_connections_updated_at ON public.google_calendar_connections;
DROP TRIGGER IF EXISTS update_ai_providers_updated_at ON public.ai_providers;
DROP TRIGGER IF EXISTS update_ai_models_updated_at ON public.ai_models;
DROP TRIGGER IF EXISTS update_connection_events_updated_at ON public.connection_events;
DROP TRIGGER IF EXISTS update_contact_custom_field_values_updated_at ON public.contact_custom_field_values;
DROP TRIGGER IF EXISTS update_contact_custom_fields_updated_at ON public.contact_custom_fields;
DROP TRIGGER IF EXISTS update_lead_comments_updated_at ON public.lead_comments;
DROP TRIGGER IF EXISTS update_lead_tasks_updated_at ON public.lead_tasks;
DROP TRIGGER IF EXISTS update_lead_products_updated_at ON public.lead_products;
DROP TRIGGER IF EXISTS update_lead_contacts_updated_at ON public.lead_contacts;
DROP TRIGGER IF EXISTS update_crm_automation_rules_updated_at ON public.crm_automation_rules;
DROP TRIGGER IF EXISTS update_crm_custom_fields_updated_at ON public.crm_custom_fields;
DROP TRIGGER IF EXISTS update_crm_stages_updated_at ON public.crm_stages;
DROP TRIGGER IF EXISTS update_crm_pipelines_updated_at ON public.crm_pipelines;
DROP TRIGGER IF EXISTS update_knowledge_chunks_updated_at ON public.knowledge_chunks;
DROP TRIGGER IF EXISTS update_knowledge_files_updated_at ON public.knowledge_files;
DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
DROP TRIGGER IF EXISTS update_conversations_updated_at ON public.conversations;
DROP TRIGGER IF EXISTS update_widget_connections_updated_at ON public.widget_connections;
DROP TRIGGER IF EXISTS update_telegram_connections_updated_at ON public.telegram_connections;
DROP TRIGGER IF EXISTS update_wuzapi_connections_updated_at ON public.wuzapi_connections;
DROP TRIGGER IF EXISTS update_agents_updated_at ON public.agents;
DROP TRIGGER IF EXISTS update_user_credits_updated_at ON public.user_credits;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
DROP TRIGGER IF EXISTS update_organization_members_updated_at ON public.organization_members;
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;

-- 2. Drop tables (children first, parents last due to FK constraints)
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.conversation_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
DROP TABLE IF EXISTS public.solarmarket_connections CASCADE;
DROP TABLE IF EXISTS public.google_calendar_connections CASCADE;
DROP TABLE IF EXISTS public.ai_models CASCADE;
DROP TABLE IF EXISTS public.ai_providers CASCADE;
DROP TABLE IF EXISTS public.connection_events CASCADE;
DROP TABLE IF EXISTS public.contact_custom_field_values CASCADE;
DROP TABLE IF EXISTS public.contact_custom_fields CASCADE;
DROP TABLE IF EXISTS public.lead_comments CASCADE;
DROP TABLE IF EXISTS public.lead_tasks CASCADE;
DROP TABLE IF EXISTS public.lead_products CASCADE;
DROP TABLE IF EXISTS public.lead_contacts CASCADE;
DROP TABLE IF EXISTS public.crm_automation_rules CASCADE;
DROP TABLE IF EXISTS public.crm_custom_fields CASCADE;
DROP TABLE IF EXISTS public.crm_stages CASCADE;
DROP TABLE IF EXISTS public.crm_pipelines CASCADE;
DROP TABLE IF EXISTS public.knowledge_chunks CASCADE;
DROP TABLE IF EXISTS public.knowledge_files CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.conversations CASCADE;
DROP TABLE IF EXISTS public.widget_connections CASCADE;
DROP TABLE IF EXISTS public.telegram_connections CASCADE;
DROP TABLE IF EXISTS public.wuzapi_connections CASCADE;
DROP TABLE IF EXISTS public.agents CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.user_credits CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TABLE IF EXISTS public.plans CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- 3. Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_default_permissions() CASCADE;
DROP FUNCTION IF EXISTS public.update_team_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public._org_user_ids(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.set_user_credits(uuid, integer) CASCADE;
DROP FUNCTION IF EXISTS public.get_all_users_for_admin() CASCADE;
DROP FUNCTION IF EXISTS public.get_admin_stats() CASCADE;
DROP FUNCTION IF EXISTS public.get_org_members_with_email(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_role(text) CASCADE;
DROP FUNCTION IF EXISTS public.is_org_member_direct(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_org_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_my_org_id() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_org_id() CASCADE;

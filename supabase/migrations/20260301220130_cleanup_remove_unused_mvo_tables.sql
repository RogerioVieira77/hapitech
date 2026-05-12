
-- ============================================================
-- CLEANUP: Remove old MVO (Meu Vendedor Online) tables, 
-- functions and triggers not used by g-growth
-- ============================================================

-- 1. Drop triggers on old tables
DROP TRIGGER IF EXISTS trigger_generate_qr_code_queue ON public.orders;
DROP TRIGGER IF EXISTS trigger_send_qr_on_order_created ON public.orders;

-- 2. Drop old tables (children first, parents last)
DROP TABLE IF EXISTS public.qr_code_queue CASCADE;
DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.stores CASCADE;
DROP TABLE IF EXISTS public.team_permissions CASCADE;
DROP TABLE IF EXISTS public.team_members CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.clients CASCADE;
DROP TABLE IF EXISTS public.marketing_integrations CASCADE;
DROP TABLE IF EXISTS public.profiles_legacy CASCADE;

-- 3. Drop old MVO functions
DROP FUNCTION IF EXISTS public.create_store_schema(uuid, text);
DROP FUNCTION IF EXISTS public.create_tenant_schema(uuid);
DROP FUNCTION IF EXISTS public.generate_qr_code_for_order();
DROP FUNCTION IF EXISTS public.generate_store_schema_name(uuid, text);
DROP FUNCTION IF EXISTS public.insert_order_items_in_schema(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.send_qr_code_on_order_created();
DROP FUNCTION IF EXISTS public.upsert_order_in_schema(text, jsonb);

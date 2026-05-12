
-- Security definer function to get user's org_id without RLS
CREATE OR REPLACE FUNCTION public.get_my_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() LIMIT 1
$$;

-- Fix organization_members: use security definer to avoid self-referencing
DROP POLICY IF EXISTS "Members can read org members" ON public.organization_members;
CREATE POLICY "Members can read org members" ON public.organization_members
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
  );

-- Fix organizations: use security definer too
DROP POLICY IF EXISTS "Members can read own organization" ON public.organizations;
CREATE POLICY "Members can read own organization" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id = public.get_my_org_id()
  );

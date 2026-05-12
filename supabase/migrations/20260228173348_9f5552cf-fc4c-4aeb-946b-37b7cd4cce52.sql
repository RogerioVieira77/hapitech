
-- Create a security definer function to check org membership without recursion
CREATE OR REPLACE FUNCTION public.is_org_member_direct(_check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id IN (
        SELECT om2.organization_id FROM public.organization_members om2
        WHERE om2.user_id = _check_user_id
      )
  )
$$;

-- Fix organizations SELECT policy: use security definer function
DROP POLICY IF EXISTS "Members can read own organization" ON public.organizations;
CREATE POLICY "Members can read own organization" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = id AND om.user_id = auth.uid()
    )
  );

-- Fix organization_members SELECT policy: avoid querying organizations
DROP POLICY IF EXISTS "Members can read org members" ON public.organization_members;
CREATE POLICY "Members can read org members" ON public.organization_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

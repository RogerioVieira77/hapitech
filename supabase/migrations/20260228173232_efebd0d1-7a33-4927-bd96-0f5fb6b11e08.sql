
-- Fix organizations: avoid cross-table recursion with organization_members
DROP POLICY IF EXISTS "Members can read own organization" ON public.organizations;
CREATE POLICY "Members can read own organization" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

-- Fix organization_members: avoid cross-table recursion with organizations  
DROP POLICY IF EXISTS "Members can read org members" ON public.organization_members;
CREATE POLICY "Members can read org members" ON public.organization_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );


-- Fix broken SELECT policy on organizations
DROP POLICY IF EXISTS "Members can read own organization" ON public.organizations;

CREATE POLICY "Members can read own organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
  )
);

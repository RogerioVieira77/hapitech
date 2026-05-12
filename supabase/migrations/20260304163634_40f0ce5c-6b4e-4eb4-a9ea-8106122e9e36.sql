DROP POLICY IF EXISTS "org_select" ON public.organizations;

CREATE POLICY "org_select"
ON public.organizations
FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR id = get_my_org_id()
  OR has_role(auth.uid(), 'super_admin')
);
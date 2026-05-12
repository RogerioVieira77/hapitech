DROP POLICY IF EXISTS "orgmem_select" ON public.organization_members;

CREATE POLICY "orgmem_select"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  organization_id = get_my_org_id()
  OR has_role(auth.uid(), 'super_admin')
);
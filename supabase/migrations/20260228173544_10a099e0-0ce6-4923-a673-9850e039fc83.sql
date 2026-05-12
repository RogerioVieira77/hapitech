
-- ============================================
-- DROP ALL existing policies on organizations
-- ============================================
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'organizations' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organizations', pol.policyname);
  END LOOP;
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'organization_members' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
  END LOOP;
END $$;

-- ============================================
-- ORGANIZATIONS policies (using SECURITY DEFINER get_my_org_id)
-- ============================================

-- SELECT: owner or member (via security definer)
CREATE POLICY "org_select" ON public.organizations
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id = public.get_my_org_id()
  );

-- INSERT: super_admin can create orgs
CREATE POLICY "org_insert" ON public.organizations
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR owner_id = auth.uid()
  );

-- UPDATE: owner only
CREATE POLICY "org_update" ON public.organizations
  FOR UPDATE USING (owner_id = auth.uid());

-- DELETE: super_admin only
CREATE POLICY "org_delete" ON public.organizations
  FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- ============================================
-- ORGANIZATION_MEMBERS policies (using SECURITY DEFINER get_my_org_id)
-- ============================================

-- SELECT: same org (via security definer)
CREATE POLICY "orgmem_select" ON public.organization_members
  FOR SELECT USING (
    organization_id = public.get_my_org_id()
  );

-- INSERT: org owner or super_admin
CREATE POLICY "orgmem_insert" ON public.organization_members
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );

-- UPDATE: org owner
CREATE POLICY "orgmem_update" ON public.organization_members
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );

-- DELETE: org owner or super_admin  
CREATE POLICY "orgmem_delete" ON public.organization_members
  FOR DELETE USING (
    public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = organization_id AND o.owner_id = auth.uid())
  );


-- Fix infinite recursion: SELECT policy references itself
DROP POLICY IF EXISTS "Members can read org members" ON public.organization_members;
CREATE POLICY "Members can read org members" ON public.organization_members
  FOR SELECT USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.organizations o 
    WHERE o.id = organization_members.organization_id 
    AND o.owner_id = auth.uid()
  ));

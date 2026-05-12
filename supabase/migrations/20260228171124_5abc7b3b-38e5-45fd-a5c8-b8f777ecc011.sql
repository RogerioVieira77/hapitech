
-- Fix contact_custom_field_values: replace always-true policy with proper org-based policy
DROP POLICY IF EXISTS "Users manage own contact_custom_field_values" ON public.contact_custom_field_values;

CREATE POLICY "Org members manage contact_custom_field_values"
ON public.contact_custom_field_values
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = contact_custom_field_values.conversation_id
    AND public.is_org_member(c.user_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = contact_custom_field_values.conversation_id
    AND c.user_id = auth.uid()
));

-- Fix conversation_tags: replace always-true policy with proper org-based policy
DROP POLICY IF EXISTS "Users manage conversation_tags" ON public.conversation_tags;

CREATE POLICY "Org members manage conversation_tags"
ON public.conversation_tags
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_tags.conversation_id
    AND public.is_org_member(c.user_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.conversations c
  WHERE c.id = conversation_tags.conversation_id
    AND public.is_org_member(c.user_id)
));

-- Fix crm_automation_rules: replace always-true policy
DROP POLICY IF EXISTS "Users manage crm_automation_rules" ON public.crm_automation_rules;

CREATE POLICY "Org members manage crm_automation_rules"
ON public.crm_automation_rules
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.crm_pipelines p
  WHERE p.id = crm_automation_rules.pipeline_id
    AND public.is_org_member(p.user_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.crm_pipelines p
  WHERE p.id = crm_automation_rules.pipeline_id
    AND public.is_org_member(p.user_id)
));

-- Fix crm_custom_field_values: replace always-true policy
DROP POLICY IF EXISTS "Users manage crm_custom_field_values" ON public.crm_custom_field_values;

CREATE POLICY "Org members manage crm_custom_field_values"
ON public.crm_custom_field_values
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.leads l
  WHERE l.id = crm_custom_field_values.lead_id
    AND public.is_org_member(l.user_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.leads l
  WHERE l.id = crm_custom_field_values.lead_id
    AND public.is_org_member(l.user_id)
));

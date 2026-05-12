
-- ============================================================
-- Helper: check if user belongs to same org as a given user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_org_member(_check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om1
    JOIN organization_members om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid()
      AND om2.user_id = _check_user_id
  )
$$;

-- ============================================================
-- 1. agents (org-shared via user_id)
-- ============================================================
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read agents"
  ON public.agents FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Users can insert own agents"
  ON public.agents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents"
  ON public.agents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents"
  ON public.agents FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 2. agent_knowledge_files (via agent ownership)
-- ============================================================
ALTER TABLE public.agent_knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members manage agent_knowledge_files"
  ON public.agent_knowledge_files FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_id AND public.is_org_member(a.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents a
      WHERE a.id = agent_id AND a.user_id = auth.uid()
    )
  );

-- ============================================================
-- 3. ai_models (public read, no write from client)
-- ============================================================
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ai_models"
  ON public.ai_models FOR SELECT
  USING (true);

-- ============================================================
-- 4. ai_providers (view via public view, no direct access)
-- ============================================================
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct access to ai_providers"
  ON public.ai_providers FOR SELECT
  USING (false);

-- ============================================================
-- 5. conversations (org-shared)
-- ============================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read conversations"
  ON public.conversations FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Org members can insert conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (public.is_org_member(user_id));

CREATE POLICY "Org members can update conversations"
  ON public.conversations FOR UPDATE
  USING (public.is_org_member(user_id));

CREATE POLICY "Org members can delete conversations"
  ON public.conversations FOR DELETE
  USING (public.is_org_member(user_id));

-- ============================================================
-- 6. messages (org-shared)
-- ============================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read messages"
  ON public.messages FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Org members can insert messages"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_org_member(user_id));

CREATE POLICY "Org members can update messages"
  ON public.messages FOR UPDATE
  USING (public.is_org_member(user_id));

-- ============================================================
-- 7. leads (org-shared)
-- ============================================================
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read leads"
  ON public.leads FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Org members can insert leads"
  ON public.leads FOR INSERT
  WITH CHECK (public.is_org_member(user_id));

CREATE POLICY "Org members can update leads"
  ON public.leads FOR UPDATE
  USING (public.is_org_member(user_id));

CREATE POLICY "Org members can delete leads"
  ON public.leads FOR DELETE
  USING (public.is_org_member(user_id));

-- ============================================================
-- 8. lead_tasks (org-shared)
-- ============================================================
ALTER TABLE public.lead_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage lead_tasks"
  ON public.lead_tasks FOR ALL
  USING (public.is_org_member(user_id))
  WITH CHECK (public.is_org_member(user_id));

-- ============================================================
-- 9. knowledge_files (org-shared)
-- ============================================================
ALTER TABLE public.knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read knowledge_files"
  ON public.knowledge_files FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Users can insert own knowledge_files"
  ON public.knowledge_files FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge_files"
  ON public.knowledge_files FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own knowledge_files"
  ON public.knowledge_files FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 10. knowledge_chunks (via knowledge_files ownership)
-- ============================================================
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read knowledge_chunks"
  ON public.knowledge_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_files kf
      WHERE kf.id = knowledge_file_id AND public.is_org_member(kf.user_id)
    )
  );

CREATE POLICY "Users can insert own knowledge_chunks"
  ON public.knowledge_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM knowledge_files kf
      WHERE kf.id = knowledge_file_id AND kf.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own knowledge_chunks"
  ON public.knowledge_chunks FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM knowledge_files kf
      WHERE kf.id = knowledge_file_id AND kf.user_id = auth.uid()
    )
  );

-- ============================================================
-- 11. crm_pipelines (org-shared)
-- ============================================================
ALTER TABLE public.crm_pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage crm_pipelines"
  ON public.crm_pipelines FOR ALL
  USING (public.is_org_member(user_id))
  WITH CHECK (public.is_org_member(user_id));

-- ============================================================
-- 12. crm_stages (org-shared)
-- ============================================================
ALTER TABLE public.crm_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage crm_stages"
  ON public.crm_stages FOR ALL
  USING (public.is_org_member(user_id))
  WITH CHECK (public.is_org_member(user_id));

-- ============================================================
-- 13. tags (org-shared)
-- ============================================================
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can manage tags"
  ON public.tags FOR ALL
  USING (public.is_org_member(user_id))
  WITH CHECK (public.is_org_member(user_id));

-- ============================================================
-- 14. organizations (members can read own org)
-- ============================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read own organization"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update organization"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid());

-- ============================================================
-- 15. organization_members (members can read own org members)
-- ============================================================
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can read org members"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can manage org members"
  ON public.organization_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = organization_id AND o.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = organization_id AND o.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 16. plans (public read)
-- ============================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plans"
  ON public.plans FOR SELECT
  USING (true);

-- ============================================================
-- 17. telegram_connections (org-shared)
-- ============================================================
ALTER TABLE public.telegram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read telegram_connections"
  ON public.telegram_connections FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Users can insert own telegram_connections"
  ON public.telegram_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own telegram_connections"
  ON public.telegram_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own telegram_connections"
  ON public.telegram_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 18. wuzapi_connections (org-shared)
-- ============================================================
ALTER TABLE public.wuzapi_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read wuzapi_connections"
  ON public.wuzapi_connections FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Users can insert own wuzapi_connections"
  ON public.wuzapi_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own wuzapi_connections"
  ON public.wuzapi_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own wuzapi_connections"
  ON public.wuzapi_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 19. widget_connections (org-shared)
-- ============================================================
ALTER TABLE public.widget_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read widget_connections"
  ON public.widget_connections FOR SELECT
  USING (public.is_org_member(user_id));

CREATE POLICY "Users can insert own widget_connections"
  ON public.widget_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own widget_connections"
  ON public.widget_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own widget_connections"
  ON public.widget_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 20. user_roles (read own, super_admin reads all)
-- ============================================================
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin can read all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

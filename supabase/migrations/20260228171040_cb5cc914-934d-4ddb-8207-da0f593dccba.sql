
-- Allow super_admin to manage plans
CREATE POLICY "Super admin can manage plans"
ON public.plans
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Insert default plans
INSERT INTO public.plans (slug, name, monthly_price, monthly_credits, max_agents, max_connections, max_members, features, is_active, popular, position) VALUES
('free',       'Free',       0,     500,    1,  1,  1,  ARRAY['widget','knowledge'],                                           true, false, 0),
('starter',    'Starter',    97,    5000,   3,  2,  3,  ARRAY['widget','knowledge','crm','calendar'],                           true, false, 1),
('pro',        'Pro',        197,   20000,  10, 5,  10, ARRAY['widget','knowledge','crm','calendar','webhooks','mcp','voice'],   true, true,  2),
('enterprise', 'Enterprise', 497,   100000, 50, 20, 50, ARRAY['widget','knowledge','crm','calendar','webhooks','mcp','voice','api'], true, false, 3);

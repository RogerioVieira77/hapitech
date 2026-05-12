
-- 1. contact_notes table
CREATE TABLE public.contact_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contact_notes" ON public.contact_notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Add model_id to credit_transactions
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS model_id text;

-- 3. get_org_members_with_email function
CREATE OR REPLACE FUNCTION public.get_org_members_with_email()
RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT om.user_id, u.email::text, u.last_sign_in_at
  FROM public.organization_members om
  JOIN auth.users u ON u.id = om.user_id
  WHERE om.organization_id = (
    SELECT organization_id FROM public.organization_members WHERE organization_members.user_id = auth.uid() LIMIT 1
  );
END;
$$;

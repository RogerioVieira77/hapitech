
-- 1. Insert org + membership + role for existing user
DO $$
DECLARE
  _org_id uuid := gen_random_uuid();
  _user_id uuid := 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';
BEGIN
  INSERT INTO public.organizations (id, owner_id, name)
  VALUES (_org_id, _user_id, 'Minha Organização')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org_id, _user_id, 'owner')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, 'admin')
  ON CONFLICT DO NOTHING;
END;
$$;

-- 2. Update handle_new_user trigger to auto-create org + role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _org_id uuid;
BEGIN
  -- Create profile
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Create organization
  _org_id := gen_random_uuid();
  INSERT INTO public.organizations (id, owner_id, name)
  VALUES (_org_id, NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  -- Add as owner member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org_id, NEW.id, 'owner');

  -- Add admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;

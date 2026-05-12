CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Add admin role (NOT super_admin - only gestao.ocubbo@gmail.com should be super_admin)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$function$;

-- Also remove super_admin from users who shouldn't have it (keep only gestao.ocubbo@gmail.com)
DELETE FROM public.user_roles 
WHERE role = 'super_admin' 
AND user_id != 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';
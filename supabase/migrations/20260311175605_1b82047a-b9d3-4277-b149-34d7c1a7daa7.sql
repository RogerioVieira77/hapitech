-- Fix: new users get 'user' role instead of 'admin'. Only master account gets admin+super_admin.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _org_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;

  _org_id := gen_random_uuid();
  INSERT INTO public.organizations (id, owner_id, name)
  VALUES (_org_id, NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (_org_id, NEW.id, 'owner');

  IF NEW.email = 'gestao.ocubbo@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;

  INSERT INTO public.user_credits (user_id, balance)
  VALUES (NEW.id, 300)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.credit_transactions (user_id, amount, balance_after, type, description)
  VALUES (NEW.id, 300, 300, 'credit', 'Créditos iniciais de boas-vindas');

  RETURN NEW;
END;
$function$;

-- Fix existing users: downgrade 'admin' to 'user' for non-super-admin accounts
UPDATE public.user_roles 
SET role = 'user' 
WHERE role = 'admin' 
  AND user_id NOT IN (
    SELECT user_id FROM public.user_roles WHERE role = 'super_admin'
  );
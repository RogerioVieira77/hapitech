CREATE OR REPLACE FUNCTION public.get_all_users_for_admin()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      u.id,
      u.email,
      u.created_at,
      u.last_sign_in_at,
      p.display_name,
      p.avatar_url,
      (SELECT ur.role FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY 
        CASE ur.role WHEN 'super_admin' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END
        LIMIT 1
      ) as role,
      (SELECT o.name FROM public.organizations o
       JOIN public.organization_members om ON om.organization_id = o.id
       WHERE om.user_id = u.id
       LIMIT 1
      ) as org_name
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$function$;
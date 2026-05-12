
CREATE OR REPLACE FUNCTION public.get_org_members_for_admin(_org_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result
  FROM (
    SELECT
      om.id,
      om.organization_id,
      om.user_id,
      om.role,
      om.created_at,
      u.email,
      p.display_name,
      p.avatar_url
    FROM public.organization_members om
    JOIN auth.users u ON u.id = om.user_id
    LEFT JOIN public.profiles p ON p.user_id = om.user_id
    WHERE om.organization_id = _org_id
    ORDER BY 
      CASE om.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
      om.created_at
  ) t;

  RETURN COALESCE(result, '[]'::json);
END;
$$;

INSERT INTO public.user_roles (user_id, role)
VALUES ('ce926343-478b-4a6d-8efa-5c2f878fc596', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;
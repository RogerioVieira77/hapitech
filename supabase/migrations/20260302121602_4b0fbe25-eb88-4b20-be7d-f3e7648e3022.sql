-- Delete all related data for user c11cf9b2-b778-4aac-9dc0-0140a29f892f

-- Organization members
DELETE FROM public.organization_members WHERE user_id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';

-- Organization
DELETE FROM public.organizations WHERE id = 'b69ba8f7-2d8b-4388-9a12-75179e72342f';

-- User roles
DELETE FROM public.user_roles WHERE user_id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';

-- Profile
DELETE FROM public.profiles WHERE user_id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';

-- Credits
DELETE FROM public.user_credits WHERE user_id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';
DELETE FROM public.credit_transactions WHERE user_id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';

-- Delete auth user
DELETE FROM auth.users WHERE id = 'c11cf9b2-b778-4aac-9dc0-0140a29f892f';
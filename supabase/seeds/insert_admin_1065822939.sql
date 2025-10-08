-- insert_admin_1065822939.sql
--
-- Template SQL to insert an admin record into public.users.
-- WARNING: public.users.id references auth.users(id). You MUST create the auth user first
-- (via Supabase Admin API or Dashboard) and replace <AUTH_USER_UUID> below with that id.
--
-- Replace <AUTH_USER_UUID> with the UUID returned by the admin API call.

INSERT INTO public.users (
  id,
  identification,
  full_name,
  email,
  role,
  office_id,
  manager_id,
  created_at,
  updated_at
)
VALUES (
  '<AUTH_USER_UUID>',
  '1065822939',
  'Administrador Forzado',
  '1065822939@evaluation.local',
  'admin',
  NULL,
  NULL,
  now(),
  now()
);

-- If you already have the auth user id, you can run this in the Supabase SQL Editor.

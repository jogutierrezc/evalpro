Steps to create an admin user with identification 1065822939
=========================================================

This project separates auth users (managed by Supabase Auth) from application users (table `public.users`).

To create a fully functional admin you must:

1. Create an auth user (in the auth schema) with an email and password.
2. Insert a row in `public.users` with `id` equal to the auth user's id and role = 'admin'.

Below are step-by-step instructions using the Supabase Admin API (requires the project service_role key) and the SQL seed included in this folder.

1) Create the auth user (Admin API)

Replace <SUPABASE_URL> and <SERVICE_ROLE_KEY> and run the following curl (this requires the service_role key — keep it secret):

```bash
curl -X POST "<SUPABASE_URL>/auth/v1/admin/users" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "1065822939@evaluation.local",
    "password": "1065822939",
    "email_confirm": true
  }'
```

The response will include a JSON object with the created user. Copy the user's `id` (a UUID).

2) Insert into `public.users`

Open the SQL Editor in Supabase or run the included SQL file `insert_admin_1065822939.sql`. Replace
`<AUTH_USER_UUID>` with the id you copied from step 1. Then execute the SQL.

3) Verify

- In the Supabase Dashboard, check that `public.users` has a row with identification `1065822939` and role `admin`.
- Try logging in from the app using cedula = `1065822939` (the app signs in using email `1065822939@evaluation.local` and password `1065822939`).

Security notes
--------------
- Never commit your service_role key to source control.
- After creating users this way, consider rotating keys or removing the service_role key from any shared machines.

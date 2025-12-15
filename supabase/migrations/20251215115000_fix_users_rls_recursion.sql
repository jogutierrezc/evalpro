-- Fix recursive RLS policy on users table by using a security definer function

-- 1. Create a function to check if the user is an admin bypassing RLS
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND role = 'admin'
  );
$$;

-- 2. Drop the problematic recursive policy
DROP POLICY IF EXISTS "Admins can manage all users" ON users;

-- 3. Re-create the policy using the secure function
CREATE POLICY "Admins can manage all users"
  ON users
  FOR ALL
  TO authenticated
  USING (check_is_admin())
  WITH CHECK (check_is_admin());

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_is_admin() TO authenticated;

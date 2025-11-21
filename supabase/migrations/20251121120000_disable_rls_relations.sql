
-- Disable RLS on user_managers and collaborator_offices to ensure visibility
ALTER TABLE user_managers DISABLE ROW LEVEL SECURITY;
ALTER TABLE collaborator_offices DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY; -- Ensure users is also visible

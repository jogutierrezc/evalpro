-- Migration: disable RLS on users table to allow inserts without auth
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
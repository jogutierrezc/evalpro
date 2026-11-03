-- Migration: allow any user to have a manager (self-referential users.manager_id FK)
-- Safe redefinition of manager_id foreign key and add constraint to prevent self-reference.
-- Creates index for faster lookup of reporting chains.

BEGIN;

-- Drop existing FK if different
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_manager_id_fkey;

-- Recreate FK referencing users(id)
ALTER TABLE users
  ADD CONSTRAINT users_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES users(id) ON DELETE SET NULL;

-- Prevent a user from being its own manager
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_manager_not_self;
ALTER TABLE users ADD CONSTRAINT users_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id);

-- Index to accelerate queries on manager chains
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON users(manager_id);

COMMIT;

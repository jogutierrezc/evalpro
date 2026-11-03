-- Migration: add campus to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS campus text;
-- Migration: Replace CHECK constraint on evaluation_templates.type with FK to form_types(key)
-- 1) Drop existing CHECK constraint if present
-- 2) Normalize existing evaluation_templates.type values that don't exist in form_types
-- 3) Set a safe DEFAULT and add FOREIGN KEY constraint to form_types(key)
-- Run this in staging first and take a DB backup before applying to production.

BEGIN;

-- Drop CHECK constraint that enforced a fixed enum of types
ALTER TABLE IF EXISTS evaluation_templates DROP CONSTRAINT IF EXISTS evaluation_templates_type_check;

-- Ensure form_types table exists and contains at least the default key
-- (seed migration should have created these keys; if not, insert defaults)
INSERT INTO form_types (key, label)
SELECT 'soft_skills', 'Habilidades Blandas'
WHERE NOT EXISTS (SELECT 1 FROM form_types WHERE key = 'soft_skills');

-- Normalize any existing evaluation_templates.type values that do not map to an existing form_types.key
UPDATE evaluation_templates
SET type = 'soft_skills'
WHERE type IS NULL
   OR NOT EXISTS (SELECT 1 FROM form_types ft WHERE ft.key = evaluation_templates.type);

-- Set a safe default so ON DELETE SET DEFAULT works if a referenced form_type is removed
ALTER TABLE evaluation_templates ALTER COLUMN type SET DEFAULT 'soft_skills';

-- Add foreign key constraint referencing form_types(key)
ALTER TABLE evaluation_templates
  ADD CONSTRAINT evaluation_templates_type_fkey
  FOREIGN KEY (type) REFERENCES form_types(key) ON DELETE SET DEFAULT;

-- Add an index to speed up joins/filters by type
CREATE INDEX IF NOT EXISTS idx_evaluation_templates_type ON evaluation_templates(type);

COMMIT;

-- NOTE: If you prefer a stricter migration (fail when unknown types exist), remove the UPDATE step above.
-- Always run in staging first and verify templates after applying.

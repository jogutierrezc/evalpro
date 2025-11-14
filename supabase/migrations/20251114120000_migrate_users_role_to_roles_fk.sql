-- Migration: migrate users.role to reference roles(key)
-- Steps:
-- 1) Drop existing CHECK constraint that limits users.role to a small set
-- 2) Ensure canonical roles exist in `roles`
-- 3) Normalize users.role values to canonical keys
-- 4) Add a foreign key constraint users.role -> roles(key) and set a default
-- IMPORTANT: Run on a safe environment first and backup DB.

BEGIN;

-- 1) Drop old CHECK constraint that blocks non-allowed role values
ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2) Ensure the roles table contains expected keys used across the app
INSERT INTO roles (key, label, description)
SELECT * FROM (VALUES
  ('colaborador_vaf','Colaborador VAF','Colaborador del programa VAF'),
  ('jefe_vaf','Jefe VAF','Jefe inmediato VAF'),
  ('jefe_campus_vaf','Jefe Campus VAF','Jefe de campus VAF'),
  ('office_manager','Jefe de Oficina','Responsable de oficina'),
  ('admin','Administrador','Administrador del sistema'),
  ('employee','Colaborador','Empleado general')
) AS t(key,label,description)
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = t.key);

-- 3) Normalize user roles (case-insensitive mapping)
-- First map exact matches to roles by key or label
UPDATE users u
SET role = r.key
FROM roles r
WHERE u.role IS NOT NULL
  AND (u.role = r.key OR lower(u.role) = lower(r.label));

-- Apply explicit legacy mappings
UPDATE users SET role = 'colaborador_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'colaborador', 'colaborador vaf', 'colaborador_vaf', 'employee', 'empleado'
);

UPDATE users SET role = 'office_manager' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe de oficina', 'jefe_de_oficina', 'jefe_oficina', 'office_manager'
);

UPDATE users SET role = 'jefe_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe vaf', 'jefe_vaf'
);

UPDATE users SET role = 'jefe_campus_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe campus vaf', 'jefe_campus_vaf'
);

UPDATE users SET role = 'admin' WHERE role IS NOT NULL AND lower(role) IN (
  'admin', 'administrador', 'administrador del sistema'
);

-- For any remaining unknown roles, default to 'colaborador_vaf'
UPDATE users u
SET role = 'colaborador_vaf'
WHERE u.role IS NULL OR NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = u.role);

-- 4) Add FK constraint from users.role to roles.key to enforce canonical roles
-- Ensure roles.key has unique constraint (it does by migration that created roles)
ALTER TABLE IF EXISTS users
  ADD CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(key) ON DELETE RESTRICT;

-- Set a default for users.role to 'colaborador_vaf' to avoid nulls on create
ALTER TABLE IF EXISTS users ALTER COLUMN role SET DEFAULT 'colaborador_vaf';

COMMIT;

-- Optional checks (run manually after applying):
-- SELECT role, count(*) FROM users GROUP BY role ORDER BY count DESC;
-- SELECT u.id, u.email, u.role FROM users u WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = u.role) LIMIT 50;

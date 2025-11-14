-- Migration: sync users.role values to the canonical role keys in `roles`
-- - Match users.role to roles.key or roles.label (case-insensitive)
-- - Apply common legacy label => key mappings
-- - Default any remaining unknown values to 'colaborador_vaf'
-- IMPORTANT: Review and backup DB before running in production.

BEGIN;

-- 1) Try to normalize by matching exact role key or by matching label (case-insensitive)
UPDATE users u
SET role = r.key
FROM roles r
WHERE u.role IS NOT NULL
  AND (u.role = r.key OR lower(u.role) = lower(r.label));

-- 2) Apply explicit legacy mappings (case-insensitive)
-- Map various legacy labels to canonical keys
UPDATE users SET role = 'colaborador_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'colaborador', 'colaborador vaf', 'colaborador_vaf', 'employee', 'empleado'
);

UPDATE users SET role = 'office_manager' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe de oficina', 'jefe_de_oficina', 'jefe_oficina', 'office_manager'
);

UPDATE users SET role = 'jefe_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe vaf', 'jefe_vaf', 'jefe_vaf'
);

UPDATE users SET role = 'jefe_campus_vaf' WHERE role IS NOT NULL AND lower(role) IN (
  'jefe campus vaf', 'jefe_campus_vaf'
);

UPDATE users SET role = 'admin' WHERE role IS NOT NULL AND lower(role) IN (
  'admin', 'administrador', 'administrador del sistema'
);

-- 3) For any remaining users whose role is still not a known key in roles, set default 'colaborador_vaf'
UPDATE users u
SET role = 'colaborador_vaf'
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = u.role);

COMMIT;

-- OPTIONAL: preview results (run as SELECTs, don't include in migration run if you prefer)
-- SELECT role, count(*) FROM users GROUP BY role ORDER BY count DESC;
-- SELECT u.id, u.email, u.role FROM users u WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE r.key = u.role) LIMIT 50;

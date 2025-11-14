-- Migration: backup colaboradores, backfill into users, drop collaborator tables
-- IMPORTANT: This migration is destructive. Run on staging first and backup DB snapshot.
-- Steps:
-- 1) Backup `colaboradores` and `collaborator_offices` into _backup_ tables
-- 2) Insert missing rows into `users` using data from `colaboradores`
--    - Map simple role keys where necessary
--    - Map a single office (first) from collaborator_offices into users.office_id (best-effort)
-- 3) Drop `collaborator_offices` and `colaboradores` (these statements may fail if other FKs exist)

BEGIN;

-- 1) Backups
CREATE TABLE IF NOT EXISTS _backup_colaboradores AS TABLE colaboradores WITH NO DATA;
INSERT INTO _backup_colaboradores SELECT * FROM colaboradores;

CREATE TABLE IF NOT EXISTS _backup_collaborator_offices AS TABLE collaborator_offices WITH NO DATA;
INSERT INTO _backup_collaborator_offices SELECT * FROM collaborator_offices;

-- 2) Backfill missing users from colaboradores
-- Map collaborator roles to the normalized users.role values when possible.
INSERT INTO users (id, identification, full_name, email, role, office_id, manager_id, campus, created_at, updated_at)
SELECT
  c.id,
  c.identification,
  c.full_name,
  c.email,
  CASE
    WHEN c.role IN ('jefe_vaf','jefe_campus_vaf','office_manager') THEN 'office_manager'
    WHEN c.role IN ('colaborador_vaf','employee') THEN 'colaborador_vaf'
    WHEN c.role = 'admin' THEN 'admin'
    ELSE c.role
  END AS role,
  (
    SELECT office_id FROM collaborator_offices co WHERE co.collaborator_id = c.id LIMIT 1
  ) AS office_id,
  c.manager_id,
  c.campus,
  COALESCE(c.created_at, now()),
  now()
FROM colaboradores c
LEFT JOIN users u ON u.id = c.id
WHERE u.id IS NULL;

-- 3) Remove collaborator tables
-- Note: If these DROP TABLE statements fail because of unexpected FKs, review the DB constraints first.
DROP TABLE IF EXISTS collaborator_offices;
DROP TABLE IF EXISTS colaboradores;

COMMIT;

-- Post-checks (run manually):
-- SELECT count(*) FROM _backup_colaboradores;
-- SELECT count(*) FROM _backup_collaborator_offices;
-- SELECT count(*) FROM users WHERE id IN (SELECT id FROM _backup_colaboradores);

-- If you need to restore backups (manual step):
-- CREATE TABLE colaboradores AS TABLE _backup_colaboradores; -- careful: this will not recreate constraints
-- CREATE TABLE collaborator_offices AS TABLE _backup_collaborator_offices;

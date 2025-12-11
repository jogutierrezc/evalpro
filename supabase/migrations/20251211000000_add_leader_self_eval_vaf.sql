-- Migration: Agregar soporte para autoevaluación de líderes VAF
-- Este script asegura que existe el form_type y la relación de autoevaluación

BEGIN;

-- 1. Crear form_type para "Evaluación Líderes VAF" si no existe
INSERT INTO form_types (key, label, description, roles)
VALUES (
  'leader_self_evaluation_vaf',
  'Autoevaluación Líderes VAF',
  'Formulario de autoevaluación para líderes VAF',
  ARRAY['jefe_vaf', 'jefe_campus_vaf']::text[]
)
ON CONFLICT (key) DO UPDATE
SET 
  roles = EXCLUDED.roles,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  updated_at = NOW();

-- 2. Crear la relación de autoevaluación jefe_vaf -> jefe_vaf
-- Primero, eliminar duplicados si existen
DELETE FROM form_type_relations
WHERE form_type_key = 'leader_self_evaluation_vaf'
  AND evaluator_role_key = 'jefe_vaf'
  AND evaluated_role_key = 'jefe_vaf';

-- Insertar la relación
INSERT INTO form_type_relations (form_type_key, evaluator_role_key, evaluated_role_key)
VALUES ('leader_self_evaluation_vaf', 'jefe_vaf', 'jefe_vaf');

-- 3. También crear para jefe_campus_vaf
DELETE FROM form_type_relations
WHERE form_type_key = 'leader_self_evaluation_vaf'
  AND evaluator_role_key = 'jefe_campus_vaf'
  AND evaluated_role_key = 'jefe_campus_vaf';

INSERT INTO form_type_relations (form_type_key, evaluator_role_key, evaluated_role_key)
VALUES ('leader_self_evaluation_vaf', 'jefe_campus_vaf', 'jefe_campus_vaf');

-- 4. Actualizar templates existentes que tengan nombre similar
-- NOTA: Ejecutar solo si quieres cambiar el tipo de templates existentes
-- UPDATE evaluation_templates
-- SET type = 'leader_self_evaluation_vaf'
-- WHERE LOWER(name) LIKE '%evaluación%lider%vaf%'
--    OR LOWER(name) LIKE '%autoevaluación%lider%'
--    OR LOWER(name) LIKE '%lider%autoevaluación%';

COMMIT;

-- Verificar que se crearon correctamente
SELECT 
  ftr.form_type_key,
  ft.label,
  ft.roles,
  ftr.evaluator_role_key,
  ftr.evaluated_role_key
FROM form_type_relations ftr
JOIN form_types ft ON ft.key = ftr.form_type_key
WHERE ftr.form_type_key = 'leader_self_evaluation_vaf';

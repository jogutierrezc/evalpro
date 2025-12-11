-- Script para diagnosticar problema de autoevaluación
-- Ejecutar en Supabase SQL Editor

-- 1. Ver todos los form_types existentes
SELECT 
  key, 
  label, 
  roles,
  description
FROM form_types
ORDER BY key;

-- 2. Ver todas las relaciones configuradas
SELECT 
  ftr.id,
  ftr.form_type_key,
  ft.label as form_type_label,
  ftr.evaluator_role_key,
  ftr.evaluated_role_key,
  CASE 
    WHEN ftr.evaluator_role_key = ftr.evaluated_role_key THEN 'AUTOEVALUACIÓN'
    ELSE 'EVALÚA A OTRO'
  END as tipo_relacion
FROM form_type_relations ftr
LEFT JOIN form_types ft ON ft.key = ftr.form_type_key
ORDER BY ftr.form_type_key, ftr.evaluator_role_key, ftr.evaluated_role_key;

-- 3. Ver templates de tipo que contenga "lider" o "VAF" (case insensitive)
SELECT 
  et.id,
  et.name,
  et.type as form_type_key,
  ft.label as form_type_label,
  ft.roles as roles_permitidos,
  et.is_active
FROM evaluation_templates et
LEFT JOIN form_types ft ON ft.key = et.type
WHERE LOWER(et.name) LIKE '%lider%' 
   OR LOWER(et.name) LIKE '%vaf%'
   OR LOWER(ft.label) LIKE '%lider%'
   OR LOWER(ft.label) LIKE '%vaf%'
ORDER BY et.name;

-- 4. Verificar relaciones para form_types que permiten autoevaluación de jefe_vaf
SELECT 
  ftr.form_type_key,
  ft.label,
  ftr.evaluator_role_key,
  ftr.evaluated_role_key
FROM form_type_relations ftr
JOIN form_types ft ON ft.key = ftr.form_type_key
WHERE ftr.evaluator_role_key = 'jefe_vaf'
  AND ftr.evaluated_role_key = 'jefe_vaf'
ORDER BY ftr.form_type_key;

-- 5. Ver usuarios con rol jefe_vaf
SELECT 
  id,
  full_name,
  role,
  campus,
  office_id
FROM users
WHERE role = 'jefe_vaf'
LIMIT 10;

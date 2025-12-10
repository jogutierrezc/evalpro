-- Diagnóstico para rol específico: Vicerrectores Académicos
-- Ejecuta estos queries para entender por qué no aparecen las evaluaciones

-- 1. Ver información del usuario con rol Vicerrector
SELECT 
  id,
  full_name,
  role,
  role_id,
  campus,
  office_id
FROM users
WHERE role ILIKE '%vicerrector%'
   OR role ILIKE '%vicerrectoría%';

-- 2. Ver qué roles están en la tabla roles
SELECT 
  id,
  key,
  label
FROM roles
WHERE key ILIKE '%vice%'
   OR label ILIKE '%vice%';

-- 3. Ver si hay relaciones configuradas para vicerrectores
SELECT 
  form_type_key,
  evaluator_role_key,
  evaluator_role_id,
  evaluated_role_key,
  evaluated_role_id
FROM form_type_relations
WHERE evaluator_role_key ILIKE '%vice%'
   OR evaluated_role_key ILIKE '%vice%';

-- 4. Ver qué colaboradores debería poder evaluar un vicerrector
SELECT 
  u.full_name as colaborador,
  u.role as rol_colaborador,
  u.campus,
  v.full_name as vicerrector,
  v.role as rol_vicerrector,
  v.campus as campus_vicerrector
FROM users u
JOIN users v ON u.manager_id = v.id
WHERE v.role ILIKE '%vicerrector%';

-- 5. Ver colaboradores en user_managers para vicerrectores
SELECT 
  u.full_name as colaborador,
  u.role as rol_colaborador,
  v.full_name as vicerrector,
  v.role as rol_vicerrector
FROM user_managers um
JOIN users u ON um.user_id = u.id
JOIN users v ON um.manager_id = v.id
WHERE v.role ILIKE '%vicerrector%';

-- 6. Ver form_types que deberían aplicar
SELECT 
  key,
  label,
  roles,
  role_ids
FROM form_types
WHERE 'Vicerrectores Académicos' = ANY(roles)
   OR 'Vicerrectoría Académica' = ANY(roles);

-- 7. SOLUCIÓN: Agregar relación para Vicerrectores
-- Descomenta y ejecuta estas líneas para agregar la relación

-- Ejemplo: Vicerrectores evalúan a Directores
/*
INSERT INTO form_type_relations (
  form_type_key,
  evaluator_role_key,
  evaluated_role_key
) VALUES 
  ('equipo_vaf', 'Vicerrectores Académicos', 'Directores de Programa'),
  ('equipo_vaf', 'Vicerrectoría Académica', 'Directores de Programa');
*/

-- O si usan role_id:
/*
INSERT INTO form_type_relations (
  form_type_key,
  evaluator_role_id,
  evaluated_role_id
) VALUES 
  ('equipo_vaf', 'ID_ROL_VICERRECTOR', 'ID_ROL_DIRECTORES');
*/

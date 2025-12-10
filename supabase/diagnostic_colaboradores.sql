-- Diagnóstico para Colaboradores sin autoevaluación
-- Ejecuta estos queries para entender por qué no aparece la autoevaluación

-- 1. Ver información de usuarios con rol Colaboradores
SELECT 
  id,
  full_name,
  role,
  role_id,
  campus,
  office_id,
  manager_id
FROM users
WHERE role ILIKE '%colaborador%'
LIMIT 5;

-- 2. Ver qué roles están configurados en la tabla roles para colaboradores
SELECT 
  id,
  key,
  label
FROM roles
WHERE key ILIKE '%colaborador%'
   OR label ILIKE '%colaborador%';

-- 3. Ver form_types que incluyen "Colaboradores" en roles
SELECT 
  key,
  label,
  roles,
  role_ids,
  description
FROM form_types
WHERE roles::text ILIKE '%colaborador%';

-- 4. Ver si hay relaciones donde colaboradores son EVALUADORES
SELECT 
  form_type_key,
  evaluator_role_key,
  evaluator_role_id,
  evaluated_role_key,
  evaluated_role_id
FROM form_type_relations
WHERE evaluator_role_key ILIKE '%colaborador%'
   OR evaluator_role_id IN (
     SELECT id FROM roles WHERE key ILIKE '%colaborador%' OR label ILIKE '%colaborador%'
   );

-- 5. Ver form_types donde NO hay relaciones (deberían ser autoevaluaciones)
SELECT 
  ft.key,
  ft.label,
  ft.roles,
  COUNT(ftr.id) as num_relaciones
FROM form_types ft
LEFT JOIN form_type_relations ftr ON ftr.form_type_key = ft.key
GROUP BY ft.key, ft.label, ft.roles
HAVING COUNT(ftr.id) = 0;

-- 6. SOLUCIÓN 1: Agregar "Colaboradores" al array de roles del form_type de autoevaluación
-- Encuentra el key correcto del form_type que debería ser autoevaluación
-- Ejemplo: si el form_type se llama 'autoevaluacion_personal'
/*
UPDATE form_types
SET roles = array_append(roles, 'Colaboradores')
WHERE key = 'NOMBRE_DEL_FORM_TYPE_AQUI'
  AND NOT ('Colaboradores' = ANY(roles));
*/

-- 7. SOLUCIÓN 2: Agregar varios roles de colaboradores al form_type
/*
UPDATE form_types
SET roles = roles || ARRAY[
  'Colaboradores',
  'Auxiliar y Personal Administrativo',
  'colaborador_vaf',
  'colaborador_vaf_VALLE'
]::text[]
WHERE key = 'NOMBRE_DEL_FORM_TYPE_AQUI';
*/

-- 8. Verificar qué form_types tienen roles asignados
SELECT 
  key,
  label,
  CASE 
    WHEN roles IS NULL THEN '❌ Sin roles'
    WHEN array_length(roles, 1) IS NULL THEN '❌ Array vacío'
    WHEN array_length(roles, 1) > 0 THEN '✅ ' || array_length(roles, 1)::text || ' roles'
  END as estado_roles,
  roles
FROM form_types
ORDER BY key;

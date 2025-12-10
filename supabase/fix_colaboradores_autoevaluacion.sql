-- SOLUCIÓN: Agregar roles de colaboradores faltantes al form_type
-- Este script agrega todos los posibles roles de colaboradores al form_type de autoevaluación

-- Primero, identifica cuál es el form_type correcto
-- Ejecuta este query para ver todos los form_types:
SELECT key, label, array_length(roles, 1) as num_roles
FROM form_types
ORDER BY key;

-- Una vez identificado el key correcto (probablemente algo como 'autoevaluacion', 'equipo_vaf', etc.)
-- Ejecuta este UPDATE reemplazando 'FORM_TYPE_KEY_AQUI' con el key correcto:

/*
UPDATE form_types
SET roles = roles || ARRAY[
  'Colaboradores',
  'colaborador',
  'Colaborador',
  'Personal Operativo',
  'Empleado',
  'empleado'
]::text[]
WHERE key = 'FORM_TYPE_KEY_AQUI'
  AND NOT ('Colaboradores' = ANY(roles));
*/

-- EJEMPLO: Si el form_type se llama 'equipo_vaf':
UPDATE form_types
SET roles = array_cat(roles, ARRAY[
  'Colaboradores',
  'colaborador',
  'Colaborador',  
  'Personal Operativo',
  'Empleado'
]::text[])
WHERE key = 'equipo_vaf'
  AND NOT ('Colaboradores' = ANY(roles));

-- Verificar que se agregó correctamente:
SELECT 
  key,
  label,
  array_length(roles, 1) as total_roles,
  'Colaboradores' = ANY(roles) as tiene_colaboradores,
  roles
FROM form_types
WHERE key = 'equipo_vaf';

-- Si necesitas agregar a MÚLTIPLES form_types (autoevaluaciones):
-- Primero, identifica todos los form_types sin relaciones (son autoevaluaciones)
SELECT 
  ft.key,
  ft.label,
  COUNT(ftr.id) as num_relaciones,
  'Colaboradores' = ANY(ft.roles) as ya_tiene_colaboradores
FROM form_types ft
LEFT JOIN form_type_relations ftr ON ftr.form_type_key = ft.key
GROUP BY ft.key, ft.label, ft.roles
HAVING COUNT(ftr.id) = 0;

-- Luego, agrega "Colaboradores" a todos esos form_types:
/*
UPDATE form_types ft
SET roles = array_cat(roles, ARRAY['Colaboradores', 'colaborador', 'Colaborador']::text[])
WHERE NOT EXISTS (
  SELECT 1 FROM form_type_relations WHERE form_type_key = ft.key
)
AND NOT ('Colaboradores' = ANY(roles));
*/

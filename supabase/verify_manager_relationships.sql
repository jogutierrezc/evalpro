-- Script SQL para verificar y actualizar relaciones jefe-colaborador
-- Ejecuta estos queries en Supabase para verificar que las relaciones estén correctas

-- 1. Ver todos los usuarios y sus jefes asignados (CON CAMPUS)
SELECT 
  u.full_name as empleado,
  u.campus as campus_empleado,
  u.role as rol_empleado,
  m.full_name as jefe_directo,
  m.campus as campus_jefe,
  m.role as rol_jefe,
  CASE 
    WHEN m.campus IS NULL THEN '⚠️ Jefe sin campus'
    WHEN m.campus IN ('Todos', 'Todas') THEN '✅ Puede evaluar todos los campus'
    WHEN u.campus = m.campus THEN '✅ Mismo campus'
    ELSE '❌ Campus diferente - NO PUEDE EVALUAR'
  END as estado_campus,
  u.office_id
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
ORDER BY m.full_name NULLS LAST, u.full_name;

-- 2. Ver relaciones adicionales en user_managers (para múltiples jefes) CON CAMPUS
SELECT 
  u.full_name as empleado,
  u.campus as campus_empleado,
  m.full_name as jefe,
  m.campus as campus_jefe,
  u.role as rol_empleado,
  m.role as rol_jefe,
  CASE 
    WHEN m.campus IN ('Todos', 'Todas') THEN '✅ Puede evaluar todos'
    WHEN u.campus = m.campus THEN '✅ Mismo campus'
    ELSE '❌ Campus diferente'
  END as estado_campus
FROM user_managers um
JOIN users u ON um.user_id = u.id
JOIN users m ON um.manager_id = m.id
ORDER BY m.full_name, u.full_name;

-- 3. Encontrar colaboradores sin jefe asignado
SELECT 
  full_name,
  role,
  campus,
  office_id
FROM users
WHERE manager_id IS NULL
  AND role != 'admin'
  AND role NOT ILIKE '%rector%'
  AND role NOT ILIKE '%decano%'
ORDER BY campus, role, full_name;

-- 4. Ver cuántos colaboradores tiene cada jefe (POR CAMPUS)
SELECT 
  m.full_name as jefe,
  m.campus as campus_jefe,
  m.role as rol_jefe,
  COUNT(DISTINCT CASE WHEN u.campus = m.campus OR m.campus IN ('Todos', 'Todas') THEN u.id END) as colaboradores_mismo_campus,
  COUNT(DISTINCT CASE WHEN u.campus != m.campus AND m.campus NOT IN ('Todos', 'Todas') THEN u.id END) as colaboradores_otro_campus,
  COUNT(DISTINCT u.id) as total_directos,
  COUNT(DISTINCT um.user_id) as colaboradores_adicionales
FROM users m
LEFT JOIN users u ON u.manager_id = m.id
LEFT JOIN user_managers um ON um.manager_id = m.id
WHERE m.role ILIKE '%jefe%' 
   OR m.role ILIKE '%coordinador%'
   OR m.role ILIKE '%director%'
   OR m.role ILIKE '%lider%'
GROUP BY m.id, m.full_name, m.campus, m.role
ORDER BY colaboradores_mismo_campus DESC, total_directos DESC;

-- 5. Ver jefes con campus="Todos" o "Todas" (pueden evaluar a todos)
SELECT 
  full_name as jefe_multi_campus,
  role,
  campus,
  COUNT(*) OVER (PARTITION BY id) as total_colaboradores
FROM users
WHERE campus IN ('Todos', 'Todas')
  AND (role ILIKE '%jefe%' 
   OR role ILIKE '%coordinador%'
   OR role ILIKE '%director%'
   OR role ILIKE '%lider%')
ORDER BY full_name;

-- 6. Problemas: Jefes y colaboradores en campus diferentes
SELECT 
  m.full_name as jefe,
  m.campus as campus_jefe,
  m.role as rol_jefe,
  u.full_name as colaborador,
  u.campus as campus_colaborador,
  u.role as rol_colaborador
FROM users u
JOIN users m ON u.manager_id = m.id
WHERE u.campus != m.campus
  AND m.campus NOT IN ('Todos', 'Todas')
  AND m.campus IS NOT NULL
  AND u.campus IS NOT NULL
ORDER BY m.full_name, u.full_name;

-- 7. Asignar un jefe a un colaborador (EJEMPLO - reemplaza los IDs)
-- UPDATE users 
-- SET manager_id = 'ID_DEL_JEFE_AQUI'
-- WHERE id = 'ID_DEL_COLABORADOR_AQUI';

-- 8. Agregar relación adicional de jefe (para colaboradores con múltiples jefes)
-- INSERT INTO user_managers (user_id, manager_id)
-- VALUES ('ID_DEL_COLABORADOR_AQUI', 'ID_DEL_JEFE_ADICIONAL_AQUI');

-- 9. Cambiar campus de un jefe para que pueda evaluar a todos
-- UPDATE users
-- SET campus = 'Todos'
-- WHERE id = 'ID_DEL_JEFE_AQUI';


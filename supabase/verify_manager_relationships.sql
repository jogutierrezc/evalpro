-- Script SQL para verificar y actualizar relaciones jefe-colaborador
-- Ejecuta estos queries en Supabase para verificar que las relaciones estén correctas

-- 1. Ver todos los usuarios y sus jefes asignados
SELECT 
  u.full_name as empleado,
  u.role as rol_empleado,
  m.full_name as jefe_directo,
  m.role as rol_jefe,
  u.office_id,
  u.campus
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
ORDER BY m.full_name NULLS LAST, u.full_name;

-- 2. Ver relaciones adicionales en user_managers (para múltiples jefes)
SELECT 
  u.full_name as empleado,
  m.full_name as jefe,
  u.role as rol_empleado,
  m.role as rol_jefe
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
ORDER BY role, full_name;

-- 4. Ver cuántos colaboradores tiene cada jefe
SELECT 
  m.full_name as jefe,
  m.role as rol_jefe,
  COUNT(DISTINCT u.id) as colaboradores_directos,
  COUNT(DISTINCT um.user_id) as colaboradores_adicionales
FROM users m
LEFT JOIN users u ON u.manager_id = m.id
LEFT JOIN user_managers um ON um.manager_id = m.id
WHERE m.role ILIKE '%jefe%' 
   OR m.role ILIKE '%coordinador%'
   OR m.role ILIKE '%director%'
   OR m.role ILIKE '%lider%'
GROUP BY m.id, m.full_name, m.role
ORDER BY colaboradores_directos DESC, colaboradores_adicionales DESC;

-- 5. Asignar un jefe a un colaborador (EJEMPLO - reemplaza los IDs)
-- UPDATE users 
-- SET manager_id = 'ID_DEL_JEFE_AQUI'
-- WHERE id = 'ID_DEL_COLABORADOR_AQUI';

-- 6. Agregar relación adicional de jefe (para colaboradores con múltiples jefes)
-- INSERT INTO user_managers (user_id, manager_id)
-- VALUES ('ID_DEL_COLABORADOR_AQUI', 'ID_DEL_JEFE_ADICIONAL_AQUI');

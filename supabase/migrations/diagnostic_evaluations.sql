-- Diagnostic queries to check why evaluations aren't showing

-- 1. Check if there are any evaluation templates
SELECT 
  id, 
  name, 
  type, 
  is_active,
  created_at
FROM evaluation_templates
ORDER BY created_at DESC;

-- 2. Check form_types table
SELECT 
  key,
  label,
  roles,
  description
FROM form_types;

-- 3. Check if there are any active evaluation periods
SELECT 
  id,
  year,
  start_date,
  end_date,
  is_active,
  CURRENT_DATE BETWEEN start_date AND end_date as is_current
FROM evaluation_periods
ORDER BY start_date DESC;

-- 4. Check evaluation_period_form_types
SELECT 
  period_id,
  form_type_key
FROM evaluation_period_form_types;

-- 5. Check roles table
SELECT 
  key,
  label
FROM roles;

-- 6. Check form_type_relations
SELECT 
  form_type_key,
  evaluator_role_key,
  evaluated_role_key
FROM form_type_relations;

-- 7. Check users and their roles
SELECT 
  id,
  full_name,
  role,
  role_id,
  campus,
  office_id
FROM users
LIMIT 10;

-- 8. Check evaluations
SELECT 
  id,
  template_id,
  evaluator_id,
  evaluated_id,
  status,
  created_at
FROM evaluations
ORDER BY created_at DESC
LIMIT 10;

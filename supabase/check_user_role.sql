-- Check exact user role in database
SELECT 
  id,
  full_name,
  role,
  role_id,
  campus,
  office_id
FROM users
WHERE id = auth.uid();

-- Also check what the role normalization is producing
SELECT 
  r.key,
  r.label,
  u.role as user_role_column
FROM users u
LEFT JOIN roles r ON r.id = u.role_id
WHERE u.id = auth.uid();

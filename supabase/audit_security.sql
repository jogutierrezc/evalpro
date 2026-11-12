-- Auditoría de seguridad de Supabase (solo lectura). Ejecútala en el editor SQL ANTES y DESPUÉS de aplicar
-- 20261117000000_security_rls_hardening.sql y compara. Cada bloque dice qué debe verse.

-- 1) Tablas de public sin RLS. DEBE devolver 0 filas.
select c.relname as tabla, 'RLS DESACTIVADO' as problema
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) Tablas con RLS activo pero SIN políticas (solo service role las puede usar). Esperado: feedback_otps,
--    feedback_sign_tokens y las tablas mail_* / sign_certificates. Cualquier otra, revísala.
select c.relname as tabla, 'RLS activo sin políticas' as nota
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
order by 1;

-- 3) Políticas abiertas: aplican a anon/public o permiten todo con "true". DEBE devolver 0 filas de anon/public.
select tablename as tabla, policyname as politica, roles, cmd, qual as using_expr, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and (roles::text ~ '(anon|public)' or (coalesce(qual, '') = 'true' and cmd <> 'SELECT') or coalesce(with_check, '') = 'true')
order by 1, 2;

-- 4) Permisos de tabla para anon. DEBE devolver 0 filas.
select table_name as tabla, string_agg(privilege_type, ', ') as permisos_anon
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon'
group by table_name order by 1;

-- 5) Funciones que anon puede ejecutar. DEBE devolver 0 filas.
select p.oid::regprocedure as funcion, 'anon puede ejecutar' as problema
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  and p.prokind = 'f'
order by 1;

-- 6) Funciones SECURITY DEFINER sin search_path fijo (riesgo de suplantación de objetos). DEBE devolver 0 filas.
select p.oid::regprocedure as funcion, 'SECURITY DEFINER sin search_path' as problema
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
order by 1;

-- 7) Vistas (las vistas corren con los permisos de su dueño y pueden saltarse el RLS).
select c.relname as vista, coalesce((select 'security_invoker' from unnest(coalesce(c.reloptions, '{}')) o where o like 'security_invoker=%true'), 'CORRE COMO SU DUEÑO') as modo
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm') order by 1;

-- 8) Buckets de Storage públicos. Los de evaluaciones deben ser privados (public = false).
select id, name, public, file_size_limit from storage.buckets order by 1;

-- 9) Secretos guardados en tablas: admin_settings no debe leerse con la clave pública. Solo se listan las llaves.
select key, (value ? 'api_key') as contiene_api_key, jsonb_typeof(value) as tipo from public.admin_settings order by 1;

-- 10) Resumen de políticas por tabla.
select tablename as tabla, count(*) as politicas, string_agg(policyname || ' (' || cmd || ')', '; ' order by policyname) as detalle
from pg_policies where schemaname = 'public' group by tablename order by 1;

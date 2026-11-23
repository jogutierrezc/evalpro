-- Diagnóstico del error «column "user_id" does not exist» al crear usuarios. Ejecutar en el SQL Editor de la instancia correcta.

-- 1) Triggers sobre las tablas que toca el alta de usuarios
select event_object_table tabla, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema = 'public' and event_object_table in ('users','user_managers','collaborator_offices','colaboradores')
order by 1,2;

-- 2) Funciones o políticas que mencionan user_id
select p.proname as funcion, p.prokind
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p') and p.prosrc ilike '%user_id%';

select tablename, policyname, qual, with_check from pg_policies
where schemaname = 'public' and (coalesce(qual,'') ilike '%user_id%' or coalesce(with_check,'') ilike '%user_id%');

-- 3) Columnas reales de las tablas implicadas
select table_name, string_agg(column_name, ', ' order by ordinal_position) columnas
from information_schema.columns
where table_schema = 'public' and table_name in ('users','user_managers','collaborator_offices','colaboradores','period_collaborators')
group by table_name;

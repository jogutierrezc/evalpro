-- Endurecimiento de seguridad: RLS en TODAS las tablas y cierre de acceso anónimo.
--
-- Por qué: varias tablas tenían RLS desactivado (users, user_managers, collaborator_offices, period_collaborators, ...)
-- o políticas "using (true)" para anon (plan_registros, plan_seguimiento, bucket plan-evidencias, feedback_actas). La clave
-- pública (anon) viaja en el navegador, así que cualquiera podía leer personas, evaluaciones y configuración.
--
-- Todas las personas inician sesión con correo y contraseña de Supabase Auth, es decir, todas tienen JWT: auth.uid() es el
-- id de public.users. Con eso se puede aplicar un modelo real de acceso, sin quitar nada de lo que hoy usan líderes y admin:
--
--   Administrador ........ ve y gestiona todo.
--   Líder ................ ve a las personas que evalúa o dirige (user_managers / users.manager_id), sus evaluaciones y las
--                          autoevaluaciones de esas personas; en su oficina ve a sus compañeros (para elegir a quién evaluar).
--   Colaborador .......... ve su propia fila, las evaluaciones donde es evaluador o evaluado y a quienes lo evaluaron.
--   Catálogos ............ (roles, oficinas, plantillas, periodos, formularios): lectura para autenticados, escritura admin.
--   Secretos ............. (admin_settings, notification_log, reportes IA): solo admin.
--
-- Se ejecuta completa o no se ejecuta (transacción). Para volver atrás sin abrir nada a anon: supabase/rollback/.

begin;

/* ============================================================
 * 1. Funciones de pertenencia (SECURITY DEFINER: evitan recursión de políticas)
 * ============================================================ */

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.users u
     where u.id = auth.uid() and lower(u.role::text) in ('admin', 'administrador', 'superadmin')
  );
$$;

-- Quién dirige a la persona: tabla user_managers o users.manager_id.
create or replace function public.manages(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null and (
    exists (select 1 from public.user_managers m where m.manager_id = auth.uid() and m.user_id = p_person)
    or exists (select 1 from public.users u where u.id = p_person and u.manager_id = auth.uid())
  );
$$;

create or replace function public.has_evaluated(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null
     and exists (select 1 from public.evaluations e where e.evaluator_id = auth.uid() and e.evaluated_id = p_person);
$$;

create or replace function public.evaluated_me(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null
     and exists (select 1 from public.evaluations e where e.evaluator_id = p_person and e.evaluated_id = auth.uid());
$$;

-- Líder: dirige a alguien, evaluó a otra persona, o su rol es evaluador en las relaciones de formularios (form_type_relations,
-- sin contar las relaciones de autoevaluación). Esto último cubre al líder nuevo que aún no ha evaluado a nadie.
create or replace function public.is_leader()
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and (
    exists (select 1 from public.user_managers m where m.manager_id = auth.uid())
    or exists (select 1 from public.users u where u.manager_id = auth.uid())
    or exists (select 1 from public.evaluations e where e.evaluator_id = auth.uid() and e.evaluated_id <> auth.uid())
    or exists (
      select 1 from public.users me join public.form_type_relations r
        on lower(btrim(r.evaluator_role_key)) = lower(btrim(me.role::text))
      where me.id = auth.uid() and lower(btrim(r.evaluator_role_key)) <> lower(btrim(r.evaluated_role_key))
    )
  );
$$;

-- Roles de alcance amplio (Rector, Vicerrector): la app les carga a todo el campus para evaluar a los directores.
create or replace function public.can_view_by_relation(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null and exists (
    select 1
      from public.users me
      join public.users t on t.id = p_person
      join public.form_type_relations r
        on lower(btrim(r.evaluator_role_key)) = lower(btrim(me.role::text))
       and lower(btrim(r.evaluated_role_key)) = lower(btrim(t.role::text))
     where me.id = auth.uid()
       and me.role::text ~* 'rector'
       and lower(btrim(r.evaluator_role_key)) <> lower(btrim(r.evaluated_role_key))
       and (me.campus is null or lower(btrim(me.campus)) in ('', 'todas', 'todos') or me.campus = t.campus)
  );
$$;

create or replace function public.same_office(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null and (
    exists (select 1 from public.users a join public.users b on b.office_id = a.office_id
             where a.id = auth.uid() and b.id = p_person and a.office_id is not null)
    or exists (select 1 from public.collaborator_offices c1 join public.collaborator_offices c2 on c2.office_id = c1.office_id
               where c1.collaborator_id = auth.uid() and c2.collaborator_id = p_person)
  );
$$;

create or replace function public.my_office_ids()
returns setof uuid language sql security definer stable set search_path = public as $$
  select office_id from public.collaborator_offices where collaborator_id = auth.uid()
  union
  select office_id from public.users where id = auth.uid() and office_id is not null;
$$;

-- ¿Puedo ver la fila de esta persona en users? (sin incluir admin: la política lo evalúa aparte, una sola vez)
create or replace function public.can_view_user(p_person uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and p_person is not null and (
    p_person = auth.uid()
    or public.manages(p_person)
    or public.has_evaluated(p_person)
    or public.evaluated_me(p_person)
    or exists (select 1 from public.users me where me.id = auth.uid() and me.manager_id = p_person)
    or (public.is_leader() and public.same_office(p_person))
    or public.can_view_by_relation(p_person)
  );
$$;

-- ¿Puedo leer esta evaluación? Evaluador, evaluado, quien dirige al evaluado, el office_manager de su oficina, y quien
-- evaluó o dirige a la persona cuando es su AUTOevaluación (migración 20261115, ahora unificada aquí).
create or replace function public.can_read_evaluation(p_evaluator uuid, p_evaluated uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and (
    auth.uid() in (p_evaluator, p_evaluated)
    or public.manages(p_evaluated)
    or (p_evaluator = p_evaluated and public.has_evaluated(p_evaluated))
    or exists (select 1 from public.users me join public.users ev on ev.office_id = me.office_id
                where me.id = auth.uid() and lower(me.role::text) = 'office_manager' and ev.id = p_evaluated)
  );
$$;

create or replace function public.can_read_evaluation_id(p_evaluation uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.evaluations e where e.id = p_evaluation and public.can_read_evaluation(e.evaluator_id, e.evaluated_id));
$$;

create or replace function public.is_evaluator_of(p_evaluation uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from public.evaluations e where e.id = p_evaluation and e.evaluator_id = auth.uid());
$$;

-- Acta de retroalimentación: ¿soy parte (evaluador o evaluado)? / ¿soy el evaluador?
create or replace function public.is_acta_party(p_acta uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
begin
  if to_regclass('public.feedback_actas') is null then return false; end if;
  return auth.uid() is not null and exists (select 1 from public.feedback_actas a where a.id = p_acta and auth.uid() in (a.evaluator_id, a.evaluated_id));
end;
$$;

create or replace function public.is_acta_evaluator(p_acta uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
begin
  if to_regclass('public.feedback_actas') is null then return false; end if;
  return auth.uid() is not null and exists (select 1 from public.feedback_actas a where a.id = p_acta and a.evaluator_id = auth.uid());
end;
$$;

-- Compatibilidad con la función que ya usaba la migración 20251215 y con las de 20261115.
create or replace function public.check_is_admin()
returns boolean language sql security definer stable set search_path = public as $$ select public.is_admin(); $$;

/* ============================================================
 * 2. Índices que usan las políticas (para que RLS no frene las consultas)
 * ============================================================ */
create index if not exists idx_evaluations_evaluator_evaluated on public.evaluations (evaluator_id, evaluated_id);
create index if not exists idx_evaluations_evaluated on public.evaluations (evaluated_id);
create index if not exists idx_users_manager on public.users (manager_id);
create index if not exists idx_users_office on public.users (office_id);
do $$ begin
  if to_regclass('public.user_managers') is not null then
    create index if not exists idx_user_managers_manager on public.user_managers (manager_id, user_id);
    create index if not exists idx_user_managers_user on public.user_managers (user_id);
  end if;
  if to_regclass('public.collaborator_offices') is not null then
    create index if not exists idx_collab_offices_collab on public.collaborator_offices (collaborator_id, office_id);
    create index if not exists idx_collab_offices_office on public.collaborator_offices (office_id);
  end if;
end $$;

/* ============================================================
 * 3. Ayudantes de la migración (temporales: desaparecen al terminar)
 * ============================================================ */

-- Activa RLS en la tabla y borra TODAS sus políticas, para no heredar permisos abiertos de migraciones anteriores.
create or replace function pg_temp.reset(p_table text) returns void language plpgsql as $f$
declare r record;
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  execute format('alter table public.%I enable row level security', p_table);
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = p_table loop
    execute format('drop policy %I on public.%I', r.policyname, p_table);
  end loop;
end $f$;

create or replace function pg_temp.pol(p_table text, p_name text, p_cmd text, p_using text default null, p_check text default null)
returns void language plpgsql as $f$
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  execute format('create policy %I on public.%I for %s to authenticated %s %s', p_name, p_table, p_cmd,
    case when p_using is not null then 'using (' || p_using || ')' else '' end,
    case when p_check is not null then 'with check (' || p_check || ')' else '' end);
end $f$;

/* ============================================================
 * 4. Catálogos: leen todos los autenticados, escribe solo el administrador
 * ============================================================ */
do $$
declare t text;
begin
  foreach t in array array['roles', 'offices', 'form_types', 'form_type_relations', 'evaluation_periods',
                           'evaluation_period_form_types', 'evaluation_templates', 'evaluation_sections', 'evaluation_questions',
                           'period_collaborators']
  loop
    perform pg_temp.reset(t);
    perform pg_temp.pol(t, t || '_read', 'select', 'true');
    perform pg_temp.pol(t, t || '_admin_write', 'all', '(select public.is_admin())', '(select public.is_admin())');
  end loop;
end $$;

/* ============================================================
 * 5. Estructura de la organización
 * ============================================================ */
select pg_temp.reset('user_managers');
select pg_temp.pol('user_managers', 'user_managers_read', 'select',
  '(select public.is_admin()) or manager_id = (select auth.uid()) or user_id = (select auth.uid())');
select pg_temp.pol('user_managers', 'user_managers_admin_write', 'all', '(select public.is_admin())', '(select public.is_admin())');

select pg_temp.reset('collaborator_offices');
select pg_temp.pol('collaborator_offices', 'collaborator_offices_read', 'select',
  '(select public.is_admin()) or collaborator_id = (select auth.uid()) or office_id in (select public.my_office_ids())');
select pg_temp.pol('collaborator_offices', 'collaborator_offices_admin_write', 'all', '(select public.is_admin())', '(select public.is_admin())');

/* ============================================================
 * 6. Personas (users): datos personales. Cada quien ve lo que necesita, el admin ve todo.
 * ============================================================ */
select pg_temp.reset('users');
select pg_temp.pol('users', 'users_read', 'select', '(select public.is_admin()) or public.can_view_user(id)');
select pg_temp.pol('users', 'users_admin_write', 'all', '(select public.is_admin())', '(select public.is_admin())');
-- Nadie edita su propia fila (evita que alguien se cambie el rol a admin). Solo el admin escribe en users.

/* ============================================================
 * 7. Evaluaciones, respuestas y resultados
 * ============================================================ */
select pg_temp.reset('evaluations');
select pg_temp.pol('evaluations', 'evaluations_read', 'select',
  '(select public.is_admin()) or public.can_read_evaluation(evaluator_id, evaluated_id)');
select pg_temp.pol('evaluations', 'evaluations_insert', 'insert', null,
  '(select public.is_admin()) or evaluator_id = (select auth.uid())');
select pg_temp.pol('evaluations', 'evaluations_update', 'update',
  '(select public.is_admin()) or evaluator_id = (select auth.uid())',
  '(select public.is_admin()) or evaluator_id = (select auth.uid())');
select pg_temp.pol('evaluations', 'evaluations_admin_delete', 'delete', '(select public.is_admin())');

select pg_temp.reset('evaluation_responses');
select pg_temp.pol('evaluation_responses', 'responses_read', 'select',
  '(select public.is_admin()) or public.can_read_evaluation_id(evaluation_id)');
select pg_temp.pol('evaluation_responses', 'responses_write', 'all',
  '(select public.is_admin()) or public.is_evaluator_of(evaluation_id)',
  '(select public.is_admin()) or public.is_evaluator_of(evaluation_id)');

select pg_temp.reset('evaluation_results');
select pg_temp.pol('evaluation_results', 'results_read', 'select',
  '(select public.is_admin()) or public.can_read_evaluation_id(evaluation_id)');
select pg_temp.pol('evaluation_results', 'results_write', 'all',
  '(select public.is_admin()) or public.is_evaluator_of(evaluation_id)',
  '(select public.is_admin()) or public.is_evaluator_of(evaluation_id)');

-- Quien no es admin no puede reasignar una evaluación a otras personas, otro formulario u otro periodo.
create or replace function public.evaluations_identity_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() and (
       NEW.evaluator_id <> OLD.evaluator_id or NEW.evaluated_id <> OLD.evaluated_id
       or NEW.template_id <> OLD.template_id or NEW.period_id is distinct from OLD.period_id) then
    raise exception 'No se puede cambiar el evaluador, el evaluado, el formulario ni el periodo de una evaluación';
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_evaluations_identity_guard on public.evaluations;
create trigger trg_evaluations_identity_guard before update on public.evaluations for each row execute function public.evaluations_identity_guard();

/* ============================================================
 * 8. Actas de retroalimentación y Plan de Mejora
 * ============================================================ */
select pg_temp.reset('feedback_actas');
select pg_temp.pol('feedback_actas', 'actas_read', 'select',
  '(select public.is_admin()) or evaluator_id = (select auth.uid()) or evaluated_id = (select auth.uid())');
select pg_temp.pol('feedback_actas', 'actas_insert', 'insert', null,
  'evaluator_id = (select auth.uid()) and public.is_evaluator_of(evaluation_id)');
select pg_temp.pol('feedback_actas', 'actas_update', 'update',
  'evaluator_id = (select auth.uid())', 'evaluator_id = (select auth.uid())');
-- Las firmas y la huella las escribe solo la Edge Function (service role); el trigger del acta lo exige.

-- Estas tablas no tienen políticas: solo la Edge Function (service role) las toca.
select pg_temp.reset('feedback_otps');
select pg_temp.reset('feedback_sign_tokens');

select pg_temp.reset('plan_registros');
select pg_temp.pol('plan_registros', 'plan_registros_read', 'select', '(select public.is_admin()) or public.is_acta_party(acta_id)');
select pg_temp.pol('plan_registros', 'plan_registros_insert', 'insert', null,
  'created_by = (select auth.uid()) and public.is_acta_evaluator(acta_id)');

select pg_temp.reset('plan_seguimiento');
select pg_temp.pol('plan_seguimiento', 'plan_seguimiento_read', 'select', '(select public.is_admin()) or public.is_acta_party(acta_id)');
-- plan_seguimiento ya no se escribe desde el cliente: el trigger lo mantiene con permisos del dueño.
do $$ begin
  if to_regprocedure('public.plan_registros_after()') is not null then
    alter function public.plan_registros_after() security definer set search_path = public;
  end if;
end $$;

/* ============================================================
 * 9. Configuración, secretos y reportes: solo administración
 * ============================================================ */
do $$
declare t text;
begin
  foreach t in array array['admin_settings', 'notification_log', 'campus_ai_reports', 'university_ai_reports',
                           'office_template_access', 'colaboradores']
  loop
    perform pg_temp.reset(t);
    perform pg_temp.pol(t, t || '_admin_only', 'all', '(select public.is_admin())', '(select public.is_admin())');
  end loop;
end $$;

-- Módulo de correos: sin políticas (solo función de borde con service role). Se asegura RLS activo.
do $$
declare t text;
begin
  foreach t in array array['mail_templates', 'mail_campaigns', 'mail_log', 'mail_events', 'sign_certificates', 'mail_settings']
  loop
    if to_regclass('public.' || t) is not null then execute format('alter table public.%I enable row level security', t); end if;
  end loop;
end $$;

/* ============================================================
 * 10. Evidencias del Plan de Mejora (Storage): privadas, solo participantes del acta
 *     La ruta es <acta_id>/<compromiso_id>/<archivo>.pdf
 * ============================================================ */
do $$
begin
  if to_regclass('storage.objects') is null then return; end if;
  drop policy if exists "plan_evidencias_insert" on storage.objects;
  drop policy if exists "plan_evidencias_select" on storage.objects;
  drop policy if exists "plan_evidencias_delete" on storage.objects;
  create policy "plan_evidencias_insert" on storage.objects for insert to authenticated
    with check (bucket_id = 'plan-evidencias' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                and public.is_acta_evaluator(((storage.foldername(name))[1])::uuid));
  create policy "plan_evidencias_select" on storage.objects for select to authenticated
    using (bucket_id = 'plan-evidencias' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
           and (public.is_admin() or public.is_acta_party(((storage.foldername(name))[1])::uuid)));
  create policy "plan_evidencias_delete" on storage.objects for delete to authenticated
    using (bucket_id = 'plan-evidencias' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
           and public.is_acta_evaluator(((storage.foldername(name))[1])::uuid));
end $$;

/* ============================================================
 * 11. Cierre del acceso anónimo y permisos de las funciones
 *     RLS decide filas; además se le quitan a anon los permisos de tabla (defensa en profundidad).
 * ============================================================ */
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Ninguna función del esquema public se puede ejecutar sin sesión (incluye RPC de estadísticas u otras que no se listan aquí).
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Las funciones de pertenencia y las RPC de la app las ejecutan solo usuarios con sesión.
grant execute on function public.is_admin(), public.manages(uuid), public.has_evaluated(uuid), public.evaluated_me(uuid),
  public.is_leader(), public.same_office(uuid), public.my_office_ids(), public.can_view_user(uuid), public.can_view_by_relation(uuid),
  public.can_read_evaluation(uuid, uuid), public.can_read_evaluation_id(uuid), public.is_evaluator_of(uuid),
  public.is_acta_party(uuid), public.is_acta_evaluator(uuid), public.check_is_admin() to authenticated;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('feedback_reopen', 'feedback_resultados', 'office_benchmark', 'response_to_score')
  loop
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;

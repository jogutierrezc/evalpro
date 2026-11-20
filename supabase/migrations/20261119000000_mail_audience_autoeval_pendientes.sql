-- Correos: la audiencia "pendientes" debe coincidir con el módulo Pendientes de la app.
--
-- Antes: solo contaba filas ya existentes de `evaluations` y excluía las autoevaluaciones, por lo que en un
-- período recién creado (sin filas) la audiencia daba 0 personas.
-- Ahora: suma (a) las filas existentes sin completar, incluidas las autoevaluaciones, y (b) las autoevaluaciones
-- que aún no se han creado en el período, deducidas de form_type_relations + evaluation_period_form_types +
-- plantillas activas, con la misma lógica de src/modules/admin/PendingEvaluationsModule.tsx.

-- Normaliza un texto para comparar claves de rol (minúsculas, sin tildes, sin espacios en los bordes).
create or replace function public.mail_norm(t text)
returns text
language sql immutable as $$
  select lower(translate(btrim(coalesce(t, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
$$;

create or replace function public.mail_audience(p_period uuid, p_scope text, p_campus text default null, p_office uuid default null, p_role text default null)
returns table (user_id uuid, full_name text, email text, office text, campus text, role text, pendientes int, total int)
language sql stable as $$
  select u.id, u.full_name, lower(btrim(u.email)), coalesce(o.name, ''), coalesce(u.campus, ''), u.role,
         (coalesce(a.pendientes, 0) + coalesce(m.faltantes, 0))::int,
         (coalesce(a.total, 0) + coalesce(m.faltantes, 0))::int
  from public.users u
  left join public.offices o on o.id = u.office_id
  left join (
    select e.evaluator_id,
           count(*) filter (where e.status <> 'completed') as pendientes,
           count(*) as total
    from public.evaluations e
    where (p_period is null or e.period_id = p_period)
    group by e.evaluator_id
  ) a on a.evaluator_id = u.id
  -- Autoevaluaciones habilitadas para el período que la persona todavía no tiene creadas.
  left join lateral (
    select count(distinct t.id) as faltantes
    from public.form_type_relations r
    join public.evaluation_period_form_types pf on pf.period_id = p_period and pf.form_type_key = r.form_type_key
    join public.evaluation_templates t on t.is_active and t.type = r.form_type_key
    where p_period is not null
      and public.mail_norm(r.evaluator_role_key) = public.mail_norm(r.evaluated_role_key)
      and public.mail_norm(r.evaluator_role_key) = public.mail_norm(u.role)
      and not exists (
        select 1 from public.evaluations e
        where e.period_id = p_period and e.evaluator_id = u.id and e.evaluated_id = u.id and e.template_id = t.id
      )
  ) m on true
  where u.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (p_campus is null or p_campus = '' or u.campus = p_campus)
    and (p_office is null or u.office_id = p_office)
    and (p_role is null or p_role = '' or u.role = p_role)
    and (case p_scope
           when 'todos' then true
           when 'pendientes' then (coalesce(a.pendientes, 0) + coalesce(m.faltantes, 0)) > 0
           else (coalesce(a.total, 0) + coalesce(m.faltantes, 0)) > 0
         end)
  order by u.full_name
$$;

revoke all on function public.mail_audience(uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.mail_norm(text) from public, anon, authenticated;

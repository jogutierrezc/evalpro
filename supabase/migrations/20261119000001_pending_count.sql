-- Contador de "Evaluaciones pendientes" del dashboard de admin, con la misma lógica del módulo Pendientes y de
-- mail_audience: filas del período sin completar + autoevaluaciones habilitadas para el período que todavía no
-- existen como fila (por ejemplo, en un período recién creado).
-- Requiere public.mail_norm (migración 20261119000000). Corre con los permisos de quien llama (RLS aplica).

create or replace function public.pending_count(p_period uuid)
returns bigint
language sql stable as $$
  select
    (select count(*) from public.evaluations e where e.period_id = p_period and e.status <> 'completed')
    +
    (select coalesce(sum(f.faltantes), 0)
     from (
       select u.id, (
         select count(distinct t.id)
         from public.form_type_relations r
         join public.evaluation_period_form_types pf on pf.period_id = p_period and pf.form_type_key = r.form_type_key
         join public.evaluation_templates t on t.is_active and t.type = r.form_type_key
         where public.mail_norm(r.evaluator_role_key) = public.mail_norm(r.evaluated_role_key)
           and public.mail_norm(r.evaluator_role_key) = public.mail_norm(u.role)
           and not exists (
             select 1 from public.evaluations e
             where e.period_id = p_period and e.evaluator_id = u.id and e.evaluated_id = u.id and e.template_id = t.id
           )
       ) as faltantes
       from public.users u
     ) f)
$$;

-- El dashboard lo llama con la sesión del administrador.
revoke all on function public.pending_count(uuid) from public, anon;
grant execute on function public.pending_count(uuid) to authenticated;

-- mail_norm solo se usaba desde mail_audience (sin permisos de cliente); ahora también la usa pending_count.
grant execute on function public.mail_norm(text) to authenticated;

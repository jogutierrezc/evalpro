-- Informe de evaluación (módulo technical-report): un solo JSON con todo lo que el informe necesita.
--
--   informe_evaluacion(evaluación) devuelve:
--     * quién fue evaluado y quién evaluó: nombre, documento, cargo, oficina y sede;
--     * el formulario, el periodo y la fecha en que se completó;
--     * por criterio y por sección, el puntaje de la persona y los comparativos:
--         equipo : las demás evaluaciones hechas por la misma persona evaluadora (no aplica a autoevaluaciones);
--         sede   : evaluaciones de ese formulario y periodo de personas evaluadas de la misma sede;
--         UDES   : todas las evaluaciones de ese formulario y periodo.
--
-- Reglas de comparación (iguales a las de feedback_resultados):
--   * Solo evaluaciones completadas, del mismo formulario y del mismo periodo.
--   * Una autoevaluación se compara solo con autoevaluaciones; una evaluación de líder, solo con evaluaciones de líder.
--   * Sede y UDES solo se muestran si hay 3 o más evaluaciones (protege a las personas en grupos muy pequeños).
--
-- Seguridad: la función es SECURITY DEFINER porque calcula promedios con evaluaciones que quien consulta no puede ver
-- una por una; por eso exige ser administrador o tener permiso de lectura sobre ESA evaluación (can_read_evaluation_id).
-- Requiere las migraciones 20261115000000 (fb_num) y 20261117000000 (is_admin, can_read_evaluation_id).
-- Es idempotente: se puede ejecutar más de una vez.

create or replace function public.informe_evaluacion(p_evaluation uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ev public.evaluations;
  tname text;
  ttype text;
  es_auto boolean;
  sede_norm text;
  res jsonb;
begin
  select * into ev from public.evaluations where id = p_evaluation;
  if not found then raise exception 'Evaluación no encontrada'; end if;
  if not (public.is_admin() or public.can_read_evaluation_id(p_evaluation)) then
    raise exception 'No tienes acceso a esta evaluación';
  end if;

  select name, type::text into tname, ttype from public.evaluation_templates where id = ev.template_id;
  es_auto := ev.evaluator_id = ev.evaluated_id;
  select nullif(lower(btrim(campus)), '') into sede_norm from public.users where id = ev.evaluated_id;

  with q as (
    select qq.id as qid, qq.question_text as txt, coalesce(qq.weight, 0) as peso,
           s.id as sid, coalesce(s.title, 'General') as stitle, coalesce(s.order_index, 0) as sord,
           coalesce(qq.order_in_section, 0) as qord, coalesce(qq.order_index, 0) as gord
    from public.evaluation_questions qq
    left join public.evaluation_sections s on s.id = qq.section_id
    where qq.template_id = ev.template_id and qq.question_type = 'rating'
  ), tagged as (
    select x.question_id as qid, x.evaluation_id as eid, public.fb_num(x.response_value) as v, q.sid,
           (x.evaluation_id = ev.id) as is_p,
           (not es_auto and x.evaluation_id <> ev.id and e2.evaluator_id = ev.evaluator_id) as is_t,
           (sede_norm is not null and nullif(lower(btrim(ue.campus)), '') = sede_norm) as is_s
    from public.evaluation_responses x
    join public.evaluations e2 on e2.id = x.evaluation_id
    join public.users ue on ue.id = e2.evaluated_id
    join q on q.qid = x.question_id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and (e2.evaluator_id = e2.evaluated_id) = es_auto
      and public.fb_num(x.response_value) > 0
  ), crit as (
    select qid, avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t,
           avg(v) filter (where is_s) as s, avg(v) as u
    from tagged group by qid
  ), sec as (
    select sid, avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t,
           avg(v) filter (where is_s) as s, avg(v) as u
    from tagged group by sid
  ), tot as (
    select avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t,
           avg(v) filter (where is_s) as s, avg(v) as u,
           count(distinct eid) filter (where is_t) as tn,
           count(distinct eid) filter (where is_s) as sn,
           count(distinct eid) as un
    from tagged
  ), official as (
    -- Puntaje global que guarda el sistema (puede ser ponderado por categorías según el formulario).
    select avg(r.overall_score) filter (where e2.id = ev.id) as p,
           avg(r.overall_score) filter (where not es_auto and e2.id <> ev.id and e2.evaluator_id = ev.evaluator_id) as t,
           avg(r.overall_score) filter (where sede_norm is not null and nullif(lower(btrim(ue.campus)), '') = sede_norm) as s,
           avg(r.overall_score) as u
    from public.evaluations e2
    join public.evaluation_results r on r.evaluation_id = e2.id
    join public.users ue on ue.id = e2.evaluated_id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and (e2.evaluator_id = e2.evaluated_id) = es_auto
      and r.overall_score is not null and r.overall_score > 0
  ), grouped as (
    select q.sid, q.stitle, q.sord,
           jsonb_agg(jsonb_build_object(
             'id', q.qid, 'texto', q.txt, 'peso', q.peso,
             'persona', round(c.p, 2),
             'equipo', round(c.t, 2),
             'sede', case when (select sn from tot) >= 3 then round(c.s, 2) end,
             'udes', case when (select un from tot) >= 3 then round(c.u, 2) end)
             order by q.qord, q.gord) as crits
    from q left join crit c on c.qid = q.qid
    group by q.sid, q.stitle, q.sord
  )
  select jsonb_build_object(
    'version', 2,
    'generated_at', now(),
    'evaluation_id', ev.id,
    'kind', case when es_auto then 'autoevaluacion' else 'evaluacion' end,
    'template', tname,
    'template_type', ttype,
    'status', ev.status,
    'completed_at', ev.completed_at,
    'created_at', ev.created_at,
    'scale', 5,
    'period', (select jsonb_build_object('id', p.id, 'year', p.year, 'start', p.start_date, 'end', p.end_date)
                 from public.evaluation_periods p where p.id = ev.period_id),
    'evaluado', (select jsonb_build_object('id', u.id, 'nombre', u.full_name, 'documento', u.identification,
                                           'cargo', u.role::text, 'oficina', o.name, 'sede', u.campus, 'correo', u.email)
                   from public.users u left join public.offices o on o.id = u.office_id where u.id = ev.evaluated_id),
    'evaluador', (select jsonb_build_object('id', u.id, 'nombre', u.full_name, 'documento', u.identification,
                                            'cargo', u.role::text, 'oficina', o.name, 'sede', u.campus, 'correo', u.email)
                    from public.users u left join public.offices o on o.id = u.office_id where u.id = ev.evaluator_id),
    'n', (select jsonb_build_object('equipo', coalesce(tn, 0), 'sede', coalesce(sn, 0), 'udes', coalesce(un, 0)) from tot),
    'overall', (select jsonb_build_object(
                  'persona', round(coalesce(o.p, tot.p), 2),
                  'equipo', round(coalesce(o.t, tot.t), 2),
                  'sede', case when tot.sn >= 3 then round(coalesce(o.s, tot.s), 2) end,
                  'udes', case when tot.un >= 3 then round(coalesce(o.u, tot.u), 2) end)
                from tot, official o),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.sid, 'title', g.stitle,
               'persona', round(sc.p, 2), 'equipo', round(sc.t, 2),
               'sede', case when (select sn from tot) >= 3 then round(sc.s, 2) end,
               'udes', case when (select un from tot) >= 3 then round(sc.u, 2) end,
               'criterios', g.crits) order by g.sord, g.stitle)
      from grouped g left join sec sc on sc.sid is not distinct from g.sid
    ), '[]'::jsonb)
  ) into res;

  return res;
end;
$$;

revoke all on function public.informe_evaluacion(uuid) from public, anon;
grant execute on function public.informe_evaluacion(uuid) to authenticated;

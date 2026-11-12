-- Retroalimentación: resultados de la evaluación por criterio dentro del acta (Desarrollo).
--
--  * feedback_resultados(evaluación): calcula, por criterio y por sección, el puntaje de la persona evaluada,
--    el promedio del equipo y el promedio UDES. Solo lee; no escribe nada.
--  * feedback_actas.resultados: foto de ese cálculo guardada en el acta. Así el documento firmado no cambia
--    si después cambian las evaluaciones, y queda bloqueada junto con el resto del contenido al firmar.
--
-- Definiciones de comparación (todas dentro del mismo formulario y del mismo periodo, y sin autoevaluaciones):
--   persona : respuestas de esa evaluación.
--   equipo  : las demás evaluaciones hechas por la misma persona evaluadora (el resto de su equipo).
--   UDES    : todas las evaluaciones completadas de ese formulario.
-- Criterios y secciones son promedios de las respuestas. El resultado global usa el puntaje oficial que guarda
-- el sistema (evaluation_results.overall_score) y, si falta, el promedio simple.

alter table public.feedback_actas add column if not exists resultados jsonb;

-- Valor numérico de una respuesta (número, texto "4,5" u objeto { value | rating | score | response }).
create or replace function public.fb_num(v jsonb)
returns numeric
language sql
immutable
as $$
  select case jsonb_typeof(v)
    when 'number' then (v #>> '{}')::numeric
    when 'string' then case when btrim(v #>> '{}') ~ '^[0-9]+([.,][0-9]+)?$' then replace(btrim(v #>> '{}'), ',', '.')::numeric end
    when 'object' then (select case when jsonb_typeof(x) = 'number' then (x #>> '{}')::numeric end
                          from (select coalesce(v -> 'value', v -> 'rating', v -> 'score', v -> 'response') as x) s)
  end
$$;

create or replace function public.feedback_resultados(p_evaluation uuid)
returns jsonb
language plpgsql
stable
as $$
declare
  ev public.evaluations;
  tname text;
  res jsonb;
begin
  select * into ev from public.evaluations where id = p_evaluation;
  if not found then raise exception 'Evaluación no encontrada'; end if;
  select name into tname from public.evaluation_templates where id = ev.template_id;

  with q as (
    select qq.id as qid, qq.question_text as txt, coalesce(qq.weight, 0) as peso,
           s.id as sid, coalesce(s.title, 'General') as stitle, coalesce(s.order_index, 0) as sord,
           coalesce(qq.order_in_section, 0) as qord, coalesce(qq.order_index, 0) as gord
    from public.evaluation_questions qq
    left join public.evaluation_sections s on s.id = qq.section_id
    where qq.template_id = ev.template_id and qq.question_type = 'rating'
  ), tagged as (
    select x.question_id as qid, x.evaluation_id as eid, public.fb_num(x.response_value) as v,
           (x.evaluation_id = ev.id) as is_p,
           (x.evaluation_id <> ev.id and e2.evaluator_id = ev.evaluator_id) as is_t,
           q.sid
    from public.evaluation_responses x
    join public.evaluations e2 on e2.id = x.evaluation_id
    join q on q.qid = x.question_id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and e2.evaluator_id <> e2.evaluated_id
      and public.fb_num(x.response_value) > 0
  ), crit as (
    select qid, avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t, avg(v) as u
    from tagged group by qid
  ), sec as (
    select sid, avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t, avg(v) as u
    from tagged group by sid
  ), tot as (
    select avg(v) filter (where is_p) as p, avg(v) filter (where is_t) as t, avg(v) as u,
           count(distinct eid) filter (where is_t) as tn, count(distinct eid) as un
    from tagged
  ), official as (
    -- Puntaje global que guarda el sistema (puede ser ponderado por categorías según el formulario).
    select avg(r.overall_score) filter (where e2.id = ev.id) as p,
           avg(r.overall_score) filter (where e2.id <> ev.id and e2.evaluator_id = ev.evaluator_id) as t,
           avg(r.overall_score) as u
    from public.evaluations e2
    join public.evaluation_results r on r.evaluation_id = e2.id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and e2.evaluator_id <> e2.evaluated_id
      and r.overall_score is not null and r.overall_score > 0
  ), grouped as (
    select q.sid, q.stitle, q.sord,
           jsonb_agg(jsonb_build_object('id', q.qid, 'texto', q.txt, 'peso', q.peso,
                                        'persona', round(c.p, 2), 'equipo', round(c.t, 2), 'udes', round(c.u, 2))
                     order by q.qord, q.gord) as crits
    from q left join crit c on c.qid = q.qid
    group by q.sid, q.stitle, q.sord
  )
  select jsonb_build_object(
    'version', 1,
    'generated_at', now(),
    'evaluation_id', ev.id,
    'template', tname,
    'period_id', ev.period_id,
    'scale', 5,
    'team_n', coalesce((select tn from tot), 0),
    'udes_n', coalesce((select un from tot), 0),
    'overall', (select jsonb_build_object('persona', round(coalesce(o.p, tot.p), 2),
                                          'equipo', round(coalesce(o.t, tot.t), 2),
                                          'udes', round(coalesce(o.u, tot.u), 2))
                from tot, official o),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.sid, 'title', g.stitle,
                                          'persona', round(sc.p, 2), 'equipo', round(sc.t, 2), 'udes', round(sc.u, 2),
                                          'criterios', g.crits)
                       order by g.sord, g.stitle)
      from grouped g left join sec sc on sc.sid is not distinct from g.sid
    ), '[]'::jsonb)
  ) into res;

  return res;
end;
$$;

grant execute on function public.fb_num(jsonb) to anon, authenticated;
grant execute on function public.feedback_resultados(uuid) to anon, authenticated;

-- Integridad: igual que antes, y además un acta firmada no cambia sus resultados.
create or replace function public.feedback_actas_guard()
returns trigger
language plpgsql
as $$
declare
  privileged boolean := coalesce(auth.role(), '') = 'service_role'
                        or coalesce(current_setting('app.sig_write', true), '') = '1';
begin
  if TG_OP = 'DELETE' then
    if (OLD.evaluator_signed_at is not null or OLD.evaluated_signed_at is not null) then
      raise exception 'No se puede eliminar un acta firmada';
    end if;
    return OLD;
  end if;

  if TG_OP = 'INSERT' then
    if not privileged and (NEW.evaluator_signed_at is not null or NEW.evaluator_sign_id is not null
        or NEW.evaluated_signed_at is not null or NEW.evaluated_sign_id is not null or NEW.content_hash is not null) then
      raise exception 'Las firmas solo se registran con verificación OTP';
    end if;
    return NEW;
  end if;

  -- UPDATE
  if NEW.evaluation_id <> OLD.evaluation_id or NEW.evaluator_id <> OLD.evaluator_id or NEW.evaluated_id <> OLD.evaluated_id then
    raise exception 'No se puede cambiar la evaluación ni las personas del acta';
  end if;

  if not privileged and (
       NEW.evaluator_signed_at is distinct from OLD.evaluator_signed_at
    or NEW.evaluator_sign_id   is distinct from OLD.evaluator_sign_id
    or NEW.evaluated_signed_at is distinct from OLD.evaluated_signed_at
    or NEW.evaluated_sign_id   is distinct from OLD.evaluated_sign_id
    or NEW.content_hash        is distinct from OLD.content_hash) then
    raise exception 'Las firmas solo se registran con verificación OTP';
  end if;

  if (OLD.evaluator_signed_at is not null or OLD.evaluated_signed_at is not null) and (
       (OLD.oficina, OLD.numero, OLD.fecha, OLD.lugar, OLD.hora_inicio, OLD.hora_fin, OLD.objetivo, OLD.asistentes, OLD.tipo,
        OLD.seguimiento, OLD.agenda, OLD.desarrollo, OLD.convocatoria, OLD.compromisos, OLD.anexo, OLD.transcriptor, OLD.resultados)
       is distinct from
       (NEW.oficina, NEW.numero, NEW.fecha, NEW.lugar, NEW.hora_inicio, NEW.hora_fin, NEW.objetivo, NEW.asistentes, NEW.tipo,
        NEW.seguimiento, NEW.agenda, NEW.desarrollo, NEW.convocatoria, NEW.compromisos, NEW.anexo, NEW.transcriptor, NEW.resultados)) then
    raise exception 'Acta firmada: reábrela para editarla';
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

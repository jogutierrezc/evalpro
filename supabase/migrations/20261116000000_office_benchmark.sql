-- Reporte de desempeño: promedio de la oficina para comparar a una persona con sus compañeros.
--
-- Comparar con la oficina exige leer evaluaciones de OTRAS personas, que la seguridad por filas (RLS) no permite
-- desde el navegador. Esta función corre con SECURITY DEFINER y devuelve SOLO promedios agregados (global, por
-- competencia y por criterio), nunca filas individuales, y solo si hay al menos 3 compañeros evaluados
-- (si no, devuelve available = false para no exponer a una persona concreta).
--
-- Quién puede llamarla: administración, la propia persona, quien la evaluó y su jefe (user_managers / users.manager_id).

-- Convierte el valor guardado de una respuesta (jsonb: número, texto "4,5" u objeto {value|rating|score|response}) en nota.
create or replace function public.response_to_score(j jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  t text;
begin
  if j is null then return null; end if;
  if jsonb_typeof(j) = 'object' then
    t := coalesce(j->>'value', j->>'rating', j->>'score', j->>'response');
  else
    t := j #>> '{}';
  end if;
  if t is null then return null; end if;
  t := replace(btrim(t), ',', '.');
  if t ~ '^[0-9]+(\.[0-9]+)?$' then return t::numeric; end if;
  return null;
end;
$$;

create or replace function public.office_benchmark(p_person uuid, p_period uuid, p_template uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_office uuid;
  v_office_name text;
  v_n int;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if not (
    auth.uid() = p_person
    or exists (select 1 from public.users u where u.id = auth.uid() and lower(u.role::text) in ('admin', 'administrador', 'superadmin'))
    or exists (select 1 from public.evaluations e where e.evaluator_id = auth.uid() and e.evaluated_id = p_person)
    or exists (select 1 from public.user_managers m where m.manager_id = auth.uid() and m.user_id = p_person)
    or exists (select 1 from public.users u where u.id = p_person and u.manager_id = auth.uid())
  ) then
    raise exception 'Sin permiso para ver este comparativo';
  end if;

  select u.office_id, o.name into v_office, v_office_name
    from public.users u left join public.offices o on o.id = u.office_id
   where u.id = p_person;

  if v_office is null then
    return jsonb_build_object('available', false, 'reason', 'sin_oficina');
  end if;

  with peer_evals as (
    select e.id as eval_id, e.evaluated_id
      from public.evaluations e
      join public.users u on u.id = e.evaluated_id
     where e.status = 'completed'
       and e.template_id = p_template
       and e.period_id = p_period
       and e.evaluator_id <> e.evaluated_id
       and e.evaluated_id <> p_person
       and u.office_id = v_office
  ),
  vals as (
    select pe.eval_id, pe.evaluated_id, q.id as question_id, q.section_id,
           public.response_to_score(r.response_value) as v
      from peer_evals pe
      join public.evaluation_responses r on r.evaluation_id = pe.eval_id
      join public.evaluation_questions q on q.id = r.question_id
     where q.question_type = 'rating'
  ),
  clean as (select * from vals where v is not null and v > 0),
  sec_eval as (select eval_id, evaluated_id, section_id, avg(v) as sv from clean group by eval_id, evaluated_id, section_id),
  glob_eval as (select eval_id, evaluated_id, avg(sv) as gv from sec_eval group by eval_id, evaluated_id)
  select jsonb_build_object(
           'available', true,
           'office', v_office_name,
           'n', (select count(distinct evaluated_id) from glob_eval),
           'global', (select avg(gv) from glob_eval),
           'sections', coalesce((select jsonb_object_agg(section_id::text, a) from (select section_id, avg(sv) as a from sec_eval group by section_id) s), '{}'::jsonb),
           'questions', coalesce((select jsonb_object_agg(question_id::text, a) from (select question_id, avg(v) as a from clean group by question_id) q), '{}'::jsonb)
         ),
         (select count(distinct evaluated_id) from glob_eval)
    into v_result, v_n;

  -- Muestra mínima: con menos de 3 compañeros no se publica el promedio (evita identificar a alguien).
  if coalesce(v_n, 0) < 3 then
    return jsonb_build_object('available', false, 'reason', 'muestra_insuficiente', 'n', coalesce(v_n, 0), 'office', v_office_name);
  end if;

  return v_result;
end;
$$;

grant execute on function public.office_benchmark(uuid, uuid, uuid) to authenticated;

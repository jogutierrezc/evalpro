-- Periodo 2026 para las evaluaciones sin periodo asignado.
--
-- Regla del negocio: toda evaluación realizada entre el 27/10/2026 y el 31/12/2026 pertenece al periodo 2026.
--
-- Qué hace:
--   1. periodo_para_fecha(fecha): devuelve el periodo que le corresponde a una fecha.
--        a) el periodo (activo) cuyas fechas contienen la fecha; si no hay,
--        b) si la fecha cae entre 2026-10-27 y 2026-12-31, el periodo con year = 2026.
--   2. Trigger evaluations_set_period (reemplaza al de 20261123000001): ahora corre al insertar Y al actualizar, de modo que
--      una evaluación sin periodo lo recibe también cuando se completa. Usa completed_at si existe, y si no la fecha actual.
--   3. Relleno: las evaluaciones sin periodo reciben el periodo de su fecha (completed_at, y si no created_at, en hora de
--      Colombia). Solo toca filas con period_id null; no cambia las que ya tienen periodo.
--
-- No modifica las fechas de la tabla evaluation_periods. Si no existe un periodo con year = 2026 la regla (b) no aplica:
-- crea ese periodo desde Administración y vuelve a ejecutar este archivo (es idempotente).
-- Lo que quede sin periodo para revisar a mano:
--   select id, evaluator_id, evaluated_id, status, created_at, completed_at from public.evaluations where period_id is null order by created_at;

create or replace function public.periodo_para_fecha(p_fecha date)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.id from public.evaluation_periods p
      where p_fecha between p.start_date::date and p.end_date::date and coalesce(p.is_active, true)
      order by p.start_date desc limit 1),
    (select p.id from public.evaluation_periods p
      where p.year = 2026 and p_fecha between date '2026-10-27' and date '2026-12-31'
      order by p.start_date desc limit 1)
  );
$$;

create or replace function public.evaluations_set_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.period_id is null then
    NEW.period_id := public.periodo_para_fecha(
      (coalesce(NEW.completed_at, NEW.created_at, now()) at time zone 'America/Bogota')::date
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_evaluations_set_period on public.evaluations;
create trigger trg_evaluations_set_period before insert or update on public.evaluations
  for each row execute function public.evaluations_set_period();

-- Relleno de las que ya existen sin periodo
do $$
declare n int;
begin
  update public.evaluations e
     set period_id = public.periodo_para_fecha((coalesce(e.completed_at, e.created_at) at time zone 'America/Bogota')::date)
   where e.period_id is null
     and public.periodo_para_fecha((coalesce(e.completed_at, e.created_at) at time zone 'America/Bogota')::date) is not null;
  get diagnostics n = row_count;
  raise notice 'Evaluaciones con periodo asignado: %', n;
  raise notice 'Siguen sin periodo: %', (select count(*) from public.evaluations where period_id is null);
end $$;

-- Asigna el período a cada evaluación.
--
-- Problema: el Dashboard creaba evaluaciones y autoevaluaciones sin period_id y la base no lo completaba. Esas filas
-- desaparecían de listas, contadores y del reporte de desempeño, que filtran por período.
--
-- 1) Trigger: toda evaluación nueva sin período recibe el período activo (hoy en hora de Colombia, is_active distinto
--    de false). Cubre cualquier pantalla o importación que olvide mandarlo. Si no hay período activo queda en null.
-- 2) Relleno: las evaluaciones existentes sin período reciben el período cuyas fechas contienen su fecha de creación
--    (si hay varios que se solapan, el de inicio más reciente). Las que no caen en ningún período se dejan como están.
-- Es idempotente: se puede ejecutar de nuevo sin efectos.

create or replace function public.evaluations_set_period()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.period_id is null then
    select p.id into NEW.period_id
      from public.evaluation_periods p
     where (now() at time zone 'America/Bogota')::date between p.start_date::date and p.end_date::date
       and coalesce(p.is_active, true)
     order by p.start_date desc
     limit 1;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_evaluations_set_period on public.evaluations;
create trigger trg_evaluations_set_period before insert on public.evaluations
  for each row execute function public.evaluations_set_period();

-- Relleno de las que ya existen
update public.evaluations e
   set period_id = m.period_id
  from (
    select distinct on (ev.id) ev.id as eval_id, p.id as period_id
      from public.evaluations ev
      join public.evaluation_periods p
        on (ev.created_at at time zone 'America/Bogota')::date between p.start_date::date and p.end_date::date
     where ev.period_id is null
     order by ev.id, p.start_date desc
  ) m
 where e.id = m.eval_id;

-- Lo que queda sin período (para revisar a mano):
--   select id, evaluator_id, evaluated_id, status, created_at from public.evaluations where period_id is null order by created_at;

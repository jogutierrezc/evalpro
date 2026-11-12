-- Identidad congelada por evaluación.
--
-- Problema: nombre, correo, oficina y campus se leían "en vivo" de public.users. Al cambiar el nombre o el
-- correo de una persona, todas sus evaluaciones anteriores pasaban a mostrar el dato nuevo y se mezclaban
-- con las recientes en exportes y resultados.
--
-- Solución: cada evaluación guarda una foto de evaluador y evaluado. La foto se toma al crear la evaluación
-- y se vuelve a tomar UNA vez, cuando pasa a "completed" (el resultado queda con la identidad de ese momento).
-- Después es inmutable. La cédula (identificacion) es la llave estable para agrupar personas.

alter table public.evaluations add column if not exists evaluator_snapshot jsonb;
alter table public.evaluations add column if not exists evaluated_snapshot jsonb;

create or replace function public.evaluation_identity_snapshot(p_user uuid, p_origen text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', u.id,
    'nombre', u.full_name,
    'email', u.email,
    'identificacion', u.identification,
    'rol', u.role::text,
    'oficina', o.name,
    'campus', u.campus,
    'origen', p_origen,
    'capturado', now()
  )
  from public.users u
  left join public.offices o on o.id = u.office_id
  where u.id = p_user
$$;

create or replace function public.evaluations_snapshot_guard()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.evaluator_snapshot := coalesce(NEW.evaluator_snapshot, public.evaluation_identity_snapshot(NEW.evaluator_id, 'creacion'));
    NEW.evaluated_snapshot := coalesce(NEW.evaluated_snapshot, public.evaluation_identity_snapshot(NEW.evaluated_id, 'creacion'));
    return NEW;
  end if;

  -- UPDATE: al completarse se actualiza la foto una sola vez; en cualquier otro caso es inmutable.
  if NEW.status = 'completed' and OLD.status is distinct from 'completed' then
    NEW.evaluator_snapshot := coalesce(public.evaluation_identity_snapshot(NEW.evaluator_id, 'cierre'), OLD.evaluator_snapshot);
    NEW.evaluated_snapshot := coalesce(public.evaluation_identity_snapshot(NEW.evaluated_id, 'cierre'), OLD.evaluated_snapshot);
  else
    NEW.evaluator_snapshot := coalesce(OLD.evaluator_snapshot, NEW.evaluator_snapshot);
    NEW.evaluated_snapshot := coalesce(OLD.evaluated_snapshot, NEW.evaluated_snapshot);
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_evaluations_snapshot_guard on public.evaluations;
create trigger trg_evaluations_snapshot_guard
  before insert or update on public.evaluations
  for each row execute function public.evaluations_snapshot_guard();

-- Respaldo de lo ya existente. Ojo: no se puede recuperar el nombre o correo anterior de quien ya fue editado;
-- estas filas quedan con los datos ACTUALES y marcadas origen = 'respaldo'. Desde ahora el historial es estable.
update public.evaluations e
   set evaluator_snapshot = coalesce(e.evaluator_snapshot, public.evaluation_identity_snapshot(e.evaluator_id, 'respaldo')),
       evaluated_snapshot = coalesce(e.evaluated_snapshot, public.evaluation_identity_snapshot(e.evaluated_id, 'respaldo'))
 where e.evaluator_snapshot is null or e.evaluated_snapshot is null;

create index if not exists idx_evaluations_period_status on public.evaluations (period_id, status);
create index if not exists idx_evaluations_evaluated_ident on public.evaluations ((evaluated_snapshot->>'identificacion'));

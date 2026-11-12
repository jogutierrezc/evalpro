-- Módulo Plan de Mejora: seguimiento a los compromisos de las actas de retroalimentación.
-- Solo se hace seguimiento a compromisos de actas firmadas por las dos partes (ahí quedan "suscritos"
-- y el acta ya no cambia de contenido, así que el id de cada compromiso es estable).
--
-- plan_registros   : bitácora inmutable. Cada avance es una fila (descripción, estado, porcentaje, evidencia).
-- plan_seguimiento : estado vigente por compromiso. Lo mantiene un trigger a partir de la bitácora.

create table if not exists public.plan_registros (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.feedback_actas(id) on delete cascade,
  compromiso_id text not null,
  estado text not null check (estado in ('en_proceso', 'cumplido', 'incumplido')),
  porcentaje int not null default 0 check (porcentaje between 0 and 100),
  descripcion text not null check (char_length(btrim(descripcion)) >= 5),
  evidencia_tipo text check (evidencia_tipo in ('link', 'pdf')),
  evidencia_url text,        -- enlace externo (tipo link)
  evidencia_path text,       -- ruta en el bucket plan-evidencias (tipo pdf)
  evidencia_nombre text,
  fecha_limite date,         -- fecha del compromiso al momento del registro (la fija el trigger)
  fuera_de_plazo boolean not null default false, -- registrado después de la fecha límite (la fija el trigger)
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint plan_registros_evidencia_ok check (
    (evidencia_tipo is null and evidencia_url is null and evidencia_path is null)
    or (evidencia_tipo = 'link' and evidencia_url ~* '^https?://')
    or (evidencia_tipo = 'pdf' and evidencia_path is not null)
  )
);

create index if not exists idx_plan_registros_compromiso on public.plan_registros (acta_id, compromiso_id, created_at desc);

create table if not exists public.plan_seguimiento (
  acta_id uuid not null references public.feedback_actas(id) on delete cascade,
  compromiso_id text not null,
  estado text not null check (estado in ('en_proceso', 'cumplido', 'incumplido')),
  porcentaje int not null default 0 check (porcentaje between 0 and 100),
  ultimo_registro_at timestamptz not null default now(),
  actualizado_fuera_plazo boolean not null default false, -- algún avance llegó después de la fecha límite
  cumplido_at timestamptz,
  cumplido_fuera_plazo boolean not null default false,
  primary key (acta_id, compromiso_id)
);

-- Antes de insertar: valida el acta y el compromiso, y calcula la fecha límite y si llegó fuera de plazo.
create or replace function public.plan_registros_before()
returns trigger
language plpgsql
as $$
declare
  a public.feedback_actas;
  c jsonb;
  due date;
begin
  select * into a from public.feedback_actas where id = NEW.acta_id;
  if not found then raise exception 'Acta no encontrada'; end if;
  if a.evaluator_signed_at is null or a.evaluated_signed_at is null then
    raise exception 'El acta aún no tiene las dos firmas: no se puede hacer seguimiento';
  end if;
  if NEW.created_by <> a.evaluator_id then
    raise exception 'Solo la persona evaluadora registra el seguimiento';
  end if;

  select x into c from jsonb_array_elements(a.compromisos) x where x->>'id' = NEW.compromiso_id limit 1;
  if c is null then raise exception 'Compromiso no encontrado en el acta'; end if;

  due := nullif(c->>'fecha', '')::date;
  NEW.fecha_limite := due;
  NEW.fuera_de_plazo := due is not null and (NEW.created_at at time zone 'America/Bogota')::date > due;
  if NEW.estado = 'cumplido' then NEW.porcentaje := 100; end if;
  return NEW;
end;
$$;

drop trigger if exists trg_plan_registros_before on public.plan_registros;
create trigger trg_plan_registros_before
  before insert on public.plan_registros
  for each row execute function public.plan_registros_before();

-- Después de insertar: deja al día el estado vigente del compromiso.
create or replace function public.plan_registros_after()
returns trigger
language plpgsql
as $$
begin
  insert into public.plan_seguimiento (acta_id, compromiso_id, estado, porcentaje, ultimo_registro_at,
                                       actualizado_fuera_plazo, cumplido_at, cumplido_fuera_plazo)
  values (NEW.acta_id, NEW.compromiso_id, NEW.estado, NEW.porcentaje, NEW.created_at,
          NEW.fuera_de_plazo,
          case when NEW.estado = 'cumplido' then NEW.created_at end,
          NEW.estado = 'cumplido' and NEW.fuera_de_plazo)
  on conflict (acta_id, compromiso_id) do update set
    estado = excluded.estado,
    porcentaje = excluded.porcentaje,
    ultimo_registro_at = excluded.ultimo_registro_at,
    actualizado_fuera_plazo = public.plan_seguimiento.actualizado_fuera_plazo or excluded.actualizado_fuera_plazo,
    cumplido_at = excluded.cumplido_at,
    cumplido_fuera_plazo = excluded.cumplido_fuera_plazo;
  return NEW;
end;
$$;

drop trigger if exists trg_plan_registros_after on public.plan_registros;
create trigger trg_plan_registros_after
  after insert on public.plan_registros
  for each row execute function public.plan_registros_after();

-- La bitácora no se edita ni se borra: es la evidencia del seguimiento.
create or replace function public.plan_registros_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los registros de seguimiento no se pueden modificar ni eliminar';
end;
$$;

drop trigger if exists trg_plan_registros_immutable on public.plan_registros;
create trigger trg_plan_registros_immutable
  before update or delete on public.plan_registros
  for each row execute function public.plan_registros_immutable();

-- RLS: la app inicia sesión por cédula sin JWT de Supabase, así que (igual que feedback_actas) se abre a
-- anon/authenticated y el control está en la app y en los triggers. plan_seguimiento solo se lee desde el cliente.
alter table public.plan_registros enable row level security;
alter table public.plan_seguimiento enable row level security;

drop policy if exists "plan_registros_select" on public.plan_registros;
create policy "plan_registros_select" on public.plan_registros for select to anon, authenticated using (true);
drop policy if exists "plan_registros_insert" on public.plan_registros;
create policy "plan_registros_insert" on public.plan_registros for insert to anon, authenticated with check (true);
drop policy if exists "plan_seguimiento_select" on public.plan_seguimiento;
create policy "plan_seguimiento_select" on public.plan_seguimiento for select to anon, authenticated using (true);

-- Los triggers escriben plan_seguimiento con los permisos de quien inserta el registro.
drop policy if exists "plan_seguimiento_write" on public.plan_seguimiento;
create policy "plan_seguimiento_write" on public.plan_seguimiento for all to anon, authenticated using (true) with check (true);

-- Evidencias en PDF: bucket privado, 10 MB, solo PDF. Se leen con URL firmada de corta duración.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plan-evidencias', 'plan-evidencias', false, 10485760, array['application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "plan_evidencias_insert" on storage.objects;
create policy "plan_evidencias_insert" on storage.objects for insert to anon, authenticated with check (bucket_id = 'plan-evidencias');
drop policy if exists "plan_evidencias_select" on storage.objects;
create policy "plan_evidencias_select" on storage.objects for select to anon, authenticated using (bucket_id = 'plan-evidencias');

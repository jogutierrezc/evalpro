-- Módulo Retroalimentación: actas (formato GED-FT-032-BUC v09) firmadas con OTP.
-- Una acta por evaluación, y cada evaluación pertenece a un periodo: no se mezclan periodos.

create extension if not exists pgcrypto;

create table if not exists public.feedback_actas (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null unique references public.evaluations(id) on delete cascade,
  evaluator_id uuid not null references public.users(id),
  evaluated_id uuid not null references public.users(id),
  period_id uuid references public.evaluation_periods(id),

  oficina text not null default '',
  numero text not null default '',
  fecha date,
  lugar text not null default '',
  hora_inicio time,
  hora_fin time,
  objetivo text not null default '',
  asistentes text not null default '',
  tipo text not null default 'nueva' check (tipo in ('nueva', 'lectura')),
  seguimiento text not null default '',
  agenda text not null default '',
  desarrollo text not null default '',
  convocatoria text not null default '',
  -- [{ "id": "...", "act": "...", "resp": "...", "fecha": "YYYY-MM-DD" }]
  compromisos jsonb not null default '[]'::jsonb,
  anexo text not null default '',
  transcriptor text not null default '',

  -- Firmas: solo las escribe la Edge Function feedback-otp (service role) tras verificar el OTP.
  evaluator_signed_at timestamptz,
  evaluator_sign_id text,
  evaluated_signed_at timestamptz,
  evaluated_sign_id text,
  content_hash text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_feedback_actas_evaluator on public.feedback_actas (evaluator_id);
create index if not exists idx_feedback_actas_period on public.feedback_actas (period_id);

-- Códigos OTP (solo hash) y tokens del QR. Sin políticas: únicamente accesibles con service role.
create table if not exists public.feedback_otps (
  id uuid primary key default gen_random_uuid(),
  acta_id uuid not null references public.feedback_actas(id) on delete cascade,
  role text not null check (role in ('evaluador', 'evaluado')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (acta_id, role)
);

create table if not exists public.feedback_sign_tokens (
  acta_id uuid primary key references public.feedback_actas(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Integridad: las firmas no se escriben desde el cliente y un acta firmada no cambia de contenido.
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
        OLD.seguimiento, OLD.agenda, OLD.desarrollo, OLD.convocatoria, OLD.compromisos, OLD.anexo, OLD.transcriptor)
       is distinct from
       (NEW.oficina, NEW.numero, NEW.fecha, NEW.lugar, NEW.hora_inicio, NEW.hora_fin, NEW.objetivo, NEW.asistentes, NEW.tipo,
        NEW.seguimiento, NEW.agenda, NEW.desarrollo, NEW.convocatoria, NEW.compromisos, NEW.anexo, NEW.transcriptor)) then
    raise exception 'Acta firmada: reábrela para editarla';
  end if;

  NEW.updated_at := now();
  return NEW;
end;
$$;

drop trigger if exists trg_feedback_actas_guard on public.feedback_actas;
create trigger trg_feedback_actas_guard
  before insert or update or delete on public.feedback_actas
  for each row execute function public.feedback_actas_guard();

-- Reabrir: solo la persona evaluadora y solo si el acta NO tiene las dos firmas.
create or replace function public.feedback_reopen(p_acta uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.feedback_actas;
begin
  select * into a from public.feedback_actas where id = p_acta;
  if not found then raise exception 'Acta no encontrada'; end if;
  if a.evaluator_id <> p_user then raise exception 'Solo la persona evaluadora puede reabrir el acta'; end if;
  if a.evaluator_signed_at is not null and a.evaluated_signed_at is not null then
    raise exception 'El acta ya tiene las dos firmas y no se puede reabrir';
  end if;

  perform set_config('app.sig_write', '1', true);
  update public.feedback_actas
     set evaluator_signed_at = null, evaluator_sign_id = null,
         evaluated_signed_at = null, evaluated_sign_id = null, content_hash = null
   where id = p_acta;
  delete from public.feedback_otps where acta_id = p_acta;
  delete from public.feedback_sign_tokens where acta_id = p_acta;
end;
$$;

grant execute on function public.feedback_reopen(uuid, uuid) to anon, authenticated;

-- RLS. La app tiene un inicio de sesión por cédula sin JWT de Supabase, así que (igual que users y
-- evaluations) la tabla de actas se abre a anon/authenticated y el control está en la app y en los
-- triggers de arriba. Las tablas con secretos quedan cerradas.
alter table public.feedback_actas enable row level security;
alter table public.feedback_otps enable row level security;
alter table public.feedback_sign_tokens enable row level security;

drop policy if exists "feedback_actas_app_access" on public.feedback_actas;
create policy "feedback_actas_app_access" on public.feedback_actas
  for all to anon, authenticated using (true) with check (true);

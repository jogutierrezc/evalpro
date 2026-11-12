-- Módulo Correos (solo administración): plantillas HTML, envíos masivos, bitácora con trazabilidad
-- (envío, apertura, clics) y certificados de firma electrónica OTP en PDF.
--
-- Seguridad: estas tablas contienen correos, direcciones IP y evidencias de firma. Tienen RLS activo y SIN políticas:
-- el navegador (rol anon) no puede leerlas ni escribirlas. Todo pasa por las funciones de borde `correos` y
-- `feedback-otp`, que usan la llave de servicio y verifican que quien llama es administrador.

create extension if not exists pgcrypto;

/* ---------- Plantillas ---------- */
create table if not exists public.mail_templates (
  key text primary key,
  name text not null,
  description text not null default '',
  subject text not null,
  html text not null,
  default_subject text not null,
  default_html text not null,
  variables jsonb not null default '[]'::jsonb,   -- [{ "name": "nombre", "desc": "Nombre de la persona" }]
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

/* ---------- Envíos masivos ---------- */
create table if not exists public.mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_key text references public.mail_templates(key),
  subject text not null,
  html text not null,                              -- copia exacta de lo que se envió
  message text not null default '',                -- texto libre para {{mensaje}}
  audience jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sending', 'paused', 'done', 'canceled')),
  total int not null default 0,
  per_minute int not null default 20 check (per_minute between 1 and 30),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

/* ---------- Bitácora de correos ---------- */
create table if not exists public.mail_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('campaign', 'otp', 'test')),
  campaign_id uuid references public.mail_campaigns(id) on delete set null,
  template_key text,
  to_email text not null,
  to_name text not null default '',
  user_id uuid references public.users(id) on delete set null,
  acta_id uuid references public.feedback_actas(id) on delete set null,
  role text,                                       -- evaluador | evaluado (correos OTP)
  subject text not null default '',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'canceled')),
  error text,
  message_id text,
  token text not null unique default encode(gen_random_bytes(12), 'hex'),  -- identifica el correo en el rastreo
  vars jsonb not null default '{}'::jsonb,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  first_open_at timestamptz,
  last_open_at timestamptz,
  open_count int not null default 0,
  first_click_at timestamptz,
  click_count int not null default 0,
  created_by uuid references public.users(id)
);
create index if not exists idx_mail_log_campaign on public.mail_log (campaign_id, status);
create index if not exists idx_mail_log_queued on public.mail_log (queued_at desc);
create index if not exists idx_mail_log_acta on public.mail_log (acta_id);
create index if not exists idx_mail_log_email on public.mail_log (lower(to_email));

/* ---------- Eventos de trazabilidad (inmutables) ---------- */
create table if not exists public.mail_events (
  id bigint generated always as identity primary key,
  log_id uuid references public.mail_log(id) on delete cascade,
  acta_id uuid references public.feedback_actas(id) on delete set null,
  role text,
  type text not null check (type in (
    'queued', 'sent', 'failed', 'open', 'click',
    'portal_open', 'otp_generated', 'otp_sent', 'otp_failed', 'otp_verified', 'otp_expired', 'sign_completed',
    'cert_generated', 'cert_downloaded', 'cert_revoked', 'cert_verified')),
  at timestamptz not null default now(),
  ip text,
  user_agent text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists idx_mail_events_log on public.mail_events (log_id, at);
create index if not exists idx_mail_events_acta on public.mail_events (acta_id, at);

create or replace function public.mail_events_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Los eventos de trazabilidad no se pueden modificar ni eliminar';
end;
$$;
drop trigger if exists trg_mail_events_immutable on public.mail_events;
create trigger trg_mail_events_immutable before update or delete on public.mail_events
  for each row execute function public.mail_events_immutable();

/* ---------- Certificados de firma OTP ---------- */
create sequence if not exists public.sign_cert_seq;

create table if not exists public.sign_certificates (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,                     -- CFO-2026-0001
  acta_id uuid not null references public.feedback_actas(id),
  version int not null default 1,
  verification_code text not null unique,          -- el que lleva el QR
  pdf_path text not null,
  pdf_sha256 text not null,
  pdf_bytes int not null,
  content_hash text,                               -- huella del acta al momento de emitir
  snapshot jsonb not null default '{}'::jsonb,     -- firmantes y trazabilidad usados para el certificado
  status text not null default 'vigente' check (status in ('vigente', 'revocado')),
  revoked_reason text,
  revoked_at timestamptz,
  generated_by uuid references public.users(id),
  generated_at timestamptz not null default now()
);
create index if not exists idx_sign_cert_acta on public.sign_certificates (acta_id, version desc);

/* ---------- Ajustes del módulo ---------- */
create table if not exists public.mail_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

alter table public.mail_templates enable row level security;
alter table public.mail_campaigns enable row level security;
alter table public.mail_log enable row level security;
alter table public.mail_events enable row level security;
alter table public.sign_certificates enable row level security;
alter table public.mail_settings enable row level security;

/* ---------- Funciones auxiliares (las llama la función de borde con la llave de servicio) ---------- */

-- Audiencia de un envío. scope:
--   asignadas : quien evalúa a alguien en el periodo (las evaluaciones ya le están disponibles)
--   pendientes: quien evalúa y tiene evaluaciones sin completar en el periodo
--   todos     : todas las personas registradas con correo
create or replace function public.mail_audience(p_period uuid, p_scope text, p_campus text default null, p_office uuid default null, p_role text default null)
returns table (user_id uuid, full_name text, email text, office text, campus text, role text, pendientes int, total int)
language sql stable as $$
  select u.id, u.full_name, lower(btrim(u.email)), coalesce(o.name, ''), coalesce(u.campus, ''), u.role,
         coalesce(a.pendientes, 0)::int, coalesce(a.total, 0)::int
  from public.users u
  left join public.offices o on o.id = u.office_id
  left join (
    select e.evaluator_id,
           count(*) filter (where e.status <> 'completed') as pendientes,
           count(*) as total
    from public.evaluations e
    where e.evaluator_id <> e.evaluated_id and (p_period is null or e.period_id = p_period)
    group by e.evaluator_id
  ) a on a.evaluator_id = u.id
  where u.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (p_campus is null or p_campus = '' or u.campus = p_campus)
    and (p_office is null or u.office_id = p_office)
    and (p_role is null or p_role = '' or u.role = p_role)
    and (case p_scope
           when 'todos' then true
           when 'pendientes' then coalesce(a.pendientes, 0) > 0
           else coalesce(a.total, 0) > 0
         end)
  order by u.full_name
$$;

-- Toma, de forma atómica, los siguientes correos en cola de un envío (dos lotes a la vez no repiten destinatarios).
create or replace function public.mail_claim(p_campaign uuid, p_n int)
returns setof public.mail_log
language sql as $$
  update public.mail_log l set status = 'sending'
  where l.id in (
    select id from public.mail_log
    where campaign_id = p_campaign and status = 'queued'
    order by queued_at, id
    limit greatest(p_n, 0)
    for update skip locked
  )
  returning l.*
$$;

-- Rastreo: apertura y clic. Suman en el correo y dejan el evento (con IP y navegador).
create or replace function public.mail_track(p_token text, p_type text, p_ip text, p_ua text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql as $$
declare
  l public.mail_log;
begin
  select * into l from public.mail_log where token = p_token;
  if not found then return null; end if;
  if p_type = 'open' then
    update public.mail_log set open_count = open_count + 1, last_open_at = now(), first_open_at = coalesce(first_open_at, now()) where id = l.id;
  else
    update public.mail_log set click_count = click_count + 1, first_click_at = coalesce(first_click_at, now()) where id = l.id;
  end if;
  insert into public.mail_events (log_id, acta_id, role, type, ip, user_agent, meta)
  values (l.id, l.acta_id, l.role, p_type, p_ip, left(coalesce(p_ua, ''), 400), coalesce(p_meta, '{}'::jsonb));
  return l.id;
end;
$$;

-- Siguiente número de certificado (CFO-AAAA-NNNN). El consecutivo no se reinicia ni se reutiliza.
create or replace function public.sign_cert_next()
returns bigint
language sql as $$ select nextval('public.sign_cert_seq') $$;

revoke all on function public.sign_cert_next() from public, anon, authenticated;
revoke all on function public.mail_claim(uuid, int) from public, anon, authenticated;
revoke all on function public.mail_track(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.mail_audience(uuid, text, text, uuid, text) from public, anon, authenticated;

/* ---------- Bucket privado de certificados ---------- */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificados-firma', 'certificados-firma', false, 10485760, array['application/pdf'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

/* ---------- Plantillas por defecto ---------- */
insert into public.mail_templates (key, name, description, subject, html, default_subject, default_html, variables) values
('evaluaciones_disponibles', 'Evaluaciones disponibles', 'Aviso masivo: ya puede diligenciar las evaluaciones del periodo.',
 'Las evaluaciones de desempeño ya están disponibles',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluaciones disponibles</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;letter-spacing:.2px;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">Hola {{nombre}}, ya puede evaluar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">Las evaluaciones del <b>{{periodo}}</b> ya están disponibles en EvalPro. Tiene <b>{{total}}</b> {{evaluaciones_texto}} asignadas para diligenciar.</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">Fecha límite: <b>{{fecha_limite}}</b>.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Ingresar a EvalPro</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Este mensaje se envió a {{correo}} desde el sistema de evaluación de desempeño de la Universidad de Santander. Si tiene dudas, comuníquese con su coordinación.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Las evaluaciones de desempeño ya están disponibles',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evaluaciones disponibles</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;letter-spacing:.2px;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">Hola {{nombre}}, ya puede evaluar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">Las evaluaciones del <b>{{periodo}}</b> ya están disponibles en EvalPro. Tiene <b>{{total}}</b> {{evaluaciones_texto}} asignadas para diligenciar.</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">Fecha límite: <b>{{fecha_limite}}</b>.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Ingresar a EvalPro</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Este mensaje se envió a {{correo}} desde el sistema de evaluación de desempeño de la Universidad de Santander. Si tiene dudas, comuníquese con su coordinación.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona"},{"name":"correo","desc":"Correo de destino"},{"name":"periodo","desc":"Periodo de evaluación"},{"name":"total","desc":"Evaluaciones asignadas"},{"name":"pendientes","desc":"Evaluaciones sin completar"},{"name":"evaluaciones_texto","desc":"evaluación o evaluaciones, según el total"},{"name":"fecha_limite","desc":"Fecha de cierre del periodo"},{"name":"oficina","desc":"Oficina de la persona"},{"name":"enlace","desc":"Enlace al portal"}]'::jsonb),

('recordatorio_pendientes', 'Recordatorio de pendientes', 'Recordatorio masivo a quien aún tiene evaluaciones sin completar.',
 'Recordatorio: tiene {{pendientes}} {{evaluaciones_texto}} pendientes',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recordatorio</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #b45309;font-size:15px;font-weight:700;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">{{nombre}}, le quedan evaluaciones por completar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">En el <b>{{periodo}}</b> tiene <b>{{pendientes}}</b> de <b>{{total}}</b> {{evaluaciones_texto}} sin completar. El periodo cierra el <b>{{fecha_limite}}</b>.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Completar mis evaluaciones</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}}. Si ya completó sus evaluaciones, puede ignorar este recordatorio.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Recordatorio: tiene {{pendientes}} {{evaluaciones_texto}} pendientes',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recordatorio</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #b45309;font-size:15px;font-weight:700;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">{{nombre}}, le quedan evaluaciones por completar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">En el <b>{{periodo}}</b> tiene <b>{{pendientes}}</b> de <b>{{total}}</b> {{evaluaciones_texto}} sin completar. El periodo cierra el <b>{{fecha_limite}}</b>.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Completar mis evaluaciones</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}}. Si ya completó sus evaluaciones, puede ignorar este recordatorio.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona"},{"name":"correo","desc":"Correo de destino"},{"name":"periodo","desc":"Periodo de evaluación"},{"name":"pendientes","desc":"Evaluaciones sin completar"},{"name":"total","desc":"Evaluaciones asignadas"},{"name":"evaluaciones_texto","desc":"evaluación o evaluaciones, según el total"},{"name":"fecha_limite","desc":"Fecha de cierre del periodo"},{"name":"enlace","desc":"Enlace al portal"}]'::jsonb),

('aviso_general', 'Aviso general', 'Mensaje libre para toda la comunidad. El texto se escribe al crear el envío.',
 'Aviso de EvalPro UDES',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aviso</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:18px;line-height:1.3;font-weight:600">Hola {{nombre}}</td></tr>
  <tr><td style="padding:0 28px 22px;font-size:15px;line-height:1.65;color:#334155">{{mensaje}}</td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}} desde EvalPro, Universidad de Santander.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Aviso de EvalPro UDES',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aviso</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;color:#0f172a">EvalPro UDES</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:18px;line-height:1.3;font-weight:600">Hola {{nombre}}</td></tr>
  <tr><td style="padding:0 28px 22px;font-size:15px;line-height:1.65;color:#334155">{{mensaje}}</td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}} desde EvalPro, Universidad de Santander.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona"},{"name":"correo","desc":"Correo de destino"},{"name":"mensaje","desc":"Texto libre del envío (los saltos de línea se respetan)"},{"name":"periodo","desc":"Periodo de evaluación"},{"name":"enlace","desc":"Enlace al portal"}]'::jsonb),

('otp_firma', 'Código OTP de firma', 'Correo con el código de 6 dígitos para firmar un acta de retroalimentación.',
 'Código de firma del acta {{acta}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Código de firma</title></head>
<body style="margin:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
 <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:600">Código para firmar el acta {{acta}}</td></tr>
  <tr><td style="padding:0 28px;font-size:14px;color:#334155;line-height:1.55">Hola {{nombre}}, use este código para firmar el acta de retroalimentación como {{rol}}.</td></tr>
  <tr><td align="center" style="padding:20px 28px"><div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:6px;font:600 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px">{{codigo}}</div></td></tr>
  <tr><td style="padding:0 28px 24px;font-size:12.5px;color:#64748b;line-height:1.5">Vence en {{vence_minutos}} minutos y solo sirve una vez. Si no está firmando un acta, ignore este mensaje y no comparta el código.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Código de firma del acta {{acta}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Código de firma</title></head>
<body style="margin:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
 <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:600">Código para firmar el acta {{acta}}</td></tr>
  <tr><td style="padding:0 28px;font-size:14px;color:#334155;line-height:1.55">Hola {{nombre}}, use este código para firmar el acta de retroalimentación como {{rol}}.</td></tr>
  <tr><td align="center" style="padding:20px 28px"><div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:6px;font:600 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px">{{codigo}}</div></td></tr>
  <tr><td style="padding:0 28px 24px;font-size:12.5px;color:#64748b;line-height:1.5">Vence en {{vence_minutos}} minutos y solo sirve una vez. Si no está firmando un acta, ignore este mensaje y no comparta el código.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de quien firma"},{"name":"acta","desc":"Número del acta"},{"name":"rol","desc":"persona evaluadora o persona evaluada"},{"name":"codigo","desc":"Código OTP de 6 dígitos (obligatorio)"},{"name":"vence_minutos","desc":"Minutos de vigencia"}]'::jsonb)
on conflict (key) do nothing;

/* ---------- Ajustes por defecto ---------- */
insert into public.mail_settings (key, value) values
('limits', '{"per_minute": 20, "daily_cap": 1500}'::jsonb),
('certificate_legal', jsonb_build_object('text',
 'La firma de este documento se realizó mediante firma electrónica con código de un solo uso (OTP) enviado al correo institucional de cada firmante, método de autenticación pactado entre la Universidad y su personal para el proceso de retroalimentación de la evaluación de desempeño. De acuerdo con la Ley 527 de 1999 (artículos 5, 7, 9, 10 y 11) y el Decreto 2364 de 2012, compilado en el Decreto 1074 de 2015, la firma electrónica tiene validez y fuerza probatoria cuando el método empleado es confiable y apropiado para el propósito por el cual el mensaje de datos fue generado o comunicado. La integridad del contenido firmado se verifica con la huella SHA-256 registrada en este certificado. Los datos personales aquí tratados lo son conforme a la Ley 1581 de 2012. Texto de apoyo: la oficina jurídica de la Universidad debe revisarlo y ajustarlo antes de usarlo como soporte probatorio.'))
on conflict (key) do nothing;

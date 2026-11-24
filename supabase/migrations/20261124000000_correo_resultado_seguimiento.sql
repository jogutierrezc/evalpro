-- Seguimiento del correo de resultados (el que se envía al terminar todas las evaluaciones) y reenvío.
--
-- Qué agrega:
--   1. evaluation_copy_sent.send_count / last_attempt_at: cuántas veces se entregó y cuándo fue el último intento.
--      Permite reenviar SIN borrar el registro del envío anterior (antes, reenviar borraba la fila).
--   2. mail_settings 'copia_tracking_since': desde cuándo existe seguimiento. Quien terminó antes de esa fecha y no tiene
--      fila queda como «Sin registro» (no hay evidencia ni a favor ni en contra), no como «No enviado».
--   3. copia_correo_estado(periodo, personas): estado del correo por persona para un periodo. Un administrador ve a
--      todas las personas; cualquier otra persona solo ve su propia fila. La usan Resultados y Mis autoevaluaciones.
--
-- Estados que devuelve:
--   pendiente    la persona todavía tiene evaluaciones por completar (el correo aún no corresponde)
--   sent         enviado (sent_at)
--   sending      envío en curso (menos de 10 minutos)
--   failed       el último intento falló (o quedó interrumpido más de 10 minutos)
--   no_enviado   terminó todo, hay seguimiento activo y no existe envío
--   sin_registro terminó todo antes de que existiera el seguimiento: no hay dato
--   sin_correo   la persona no tiene un correo real (vacío o @evaluation.local)
--
-- Requiere 20261120000000_copia_evaluaciones.sql y 20261117000000_security_rls_hardening.sql (is_admin).
-- Idempotente. NO se aplica sola: ejecútala a mano en el SQL Editor de la instancia de Supabase del proyecto.

/* ---------- 1. Columnas de reenvío ---------- */
alter table public.evaluation_copy_sent add column if not exists send_count int not null default 0;
alter table public.evaluation_copy_sent add column if not exists last_attempt_at timestamptz;

update public.evaluation_copy_sent
   set send_count = 1
 where status = 'sent' and send_count = 0;
update public.evaluation_copy_sent
   set last_attempt_at = coalesce(sent_at, created_at)
 where last_attempt_at is null;

/* ---------- 2. Desde cuándo hay seguimiento ---------- */
insert into public.mail_settings (key, value)
values ('copia_tracking_since',
        jsonb_build_object('at', coalesce((select min(created_at) from public.evaluation_copy_sent), now())))
on conflict (key) do nothing;

/* ---------- 3. Estado del correo por persona ---------- */
create or replace function public.copia_correo_estado(p_period uuid, p_users uuid[] default null)
returns table (
  user_id uuid,
  email text,
  estado text,
  sent_at timestamptz,
  last_attempt_at timestamptz,
  send_count int,
  error text,
  with_pdf boolean,
  pendientes int,
  completadas int
)
language plpgsql stable security definer set search_path = public as $$
declare
  desde timestamptz;
  admin boolean := public.is_admin();
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  select coalesce((value ->> 'at')::timestamptz, now()) into desde from public.mail_settings where key = 'copia_tracking_since';
  desde := coalesce(desde, now());

  return query
  with quienes as (
    select distinct e.evaluator_id as uid
      from public.evaluations e
     where e.period_id = p_period
       and (admin or e.evaluator_id = auth.uid())
       and (p_users is null or e.evaluator_id = any (p_users))
  ), base as (
    select q.uid,
           u.email as correo,
           public.pendientes_de_usuario(q.uid, p_period) as pend,
           (select count(*)::int from public.evaluations e
             where e.evaluator_id = q.uid and e.period_id = p_period and e.status = 'completed') as hechas,
           (select max(e.completed_at) from public.evaluations e
             where e.evaluator_id = q.uid and e.period_id = p_period and e.status = 'completed') as cierre,
           c.status as cstatus, c.sent_at as csent, c.last_attempt_at as cattempt, c.created_at as ccreated,
           c.send_count as ccount, c.error as cerror, c.with_pdf as cpdf
      from quienes q
      join public.users u on u.id = q.uid
      left join public.evaluation_copy_sent c on c.user_id = q.uid and c.period_id = p_period
  )
  select b.uid,
         b.correo,
         case
           when b.correo is null or btrim(b.correo) = '' or lower(b.correo) like '%@evaluation.local' then 'sin_correo'
           when b.cstatus = 'sent' then 'sent'
           when b.pend > 0 then 'pendiente'
           when b.cstatus = 'sending' and coalesce(b.cattempt, b.ccreated) > now() - interval '10 minutes' then 'sending'
           when b.cstatus in ('sending', 'failed') then 'failed'
           when b.cierre is not null and b.cierre < desde then 'sin_registro'
           else 'no_enviado'
         end,
         b.csent,
         b.cattempt,
         coalesce(b.ccount, 0),
         b.cerror,
         coalesce(b.cpdf, false),
         b.pend,
         b.hechas
    from base b;
end;
$$;

revoke all on function public.copia_correo_estado(uuid, uuid[]) from public, anon;
grant execute on function public.copia_correo_estado(uuid, uuid[]) to authenticated;

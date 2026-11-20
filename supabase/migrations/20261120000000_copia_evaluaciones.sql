-- Correo automático con la copia en PDF de las evaluaciones, cuando una persona termina TODAS las del período.
--
-- Qué agrega:
--   1. mail_log.kind admite 'copia'.
--   2. evaluation_copy_sent: una fila por persona y período (única). Es la "reserva" que evita enviar dos veces,
--      aunque la persona cierre varias pestañas o complete la última evaluación dos veces.
--   3. pendientes_de_usuario(persona, período): cuántas evaluaciones le faltan a esa persona. Misma lógica que el
--      módulo Pendientes y que pending_count: filas sin completar + autoevaluaciones habilitadas que aún no existen.
--   4. evaluacion_propia_resultados(evaluación): resultados de UNA autoevaluación completada, con el mismo formato JSON
--      que feedback_resultados, para dibujar el PDF con la plantilla de resultados. Solo la puede pedir la propia persona
--      o un administrador.
--   5. Plantilla de correo 'copia_evaluaciones' (editable en Correos > Plantillas).
--
-- Requiere las migraciones 20261115000000 (fb_num), 20261116000000 (correos), 20261117000000 (is_admin) y
-- 20261119000000 (mail_norm; se vuelve a declarar aquí para que esta migración no dependa del orden).
-- Es idempotente: se puede ejecutar más de una vez.

/* ---------- 1. Tipo de correo 'copia' ---------- */
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.mail_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.mail_log drop constraint %I', c.conname);
  end loop;
  alter table public.mail_log add constraint mail_log_kind_check check (kind in ('campaign', 'otp', 'test', 'copia'));
end $$;

/* ---------- 2. Reserva de envío (idempotencia) ---------- */
create table if not exists public.evaluation_copy_sent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  to_email text,
  with_pdf boolean not null default false,
  evaluations int not null default 0,          -- autoevaluaciones incluidas en el PDF
  pdf_bytes int,
  mail_log_id uuid references public.mail_log(id) on delete set null,
  error text,
  created_by uuid references public.users(id) on delete set null,   -- quien disparó el envío (la persona o un administrador)
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (user_id, period_id)
);
-- Igual que las demás tablas del módulo Correos: RLS activo y sin políticas. Solo la función de borde, con la llave de servicio.
alter table public.evaluation_copy_sent enable row level security;

/* ---------- 3. Evaluaciones que le faltan a una persona ---------- */
create or replace function public.mail_norm(t text)
returns text
language sql immutable as $$
  select lower(translate(btrim(coalesce(t, '')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'))
$$;

create or replace function public.pendientes_de_usuario(p_user uuid, p_period uuid)
returns int
language sql stable security definer set search_path = public as $$
  select (
    -- Filas del período donde la persona es evaluadora y aún no están completadas.
    (select count(*) from public.evaluations e
      where e.evaluator_id = p_user and e.period_id = p_period and e.status <> 'completed')
    +
    -- Autoevaluaciones habilitadas para el período que todavía no existen como fila (igual que el módulo Pendientes).
    (select count(distinct t.id)
       from public.users u
       join public.form_type_relations r
         on public.mail_norm(r.evaluator_role_key) = public.mail_norm(r.evaluated_role_key)
        and public.mail_norm(r.evaluator_role_key) = public.mail_norm(u.role)
       join public.evaluation_period_form_types pf on pf.period_id = p_period and pf.form_type_key = r.form_type_key
       join public.evaluation_templates t on t.is_active and t.type = r.form_type_key
      where u.id = p_user
        and not exists (
          select 1 from public.evaluations e
           where e.period_id = p_period and e.evaluator_id = u.id and e.evaluated_id = u.id and e.template_id = t.id))
  )::int
$$;

revoke all on function public.pendientes_de_usuario(uuid, uuid) from public, anon, authenticated;

/* ---------- 4. Resultados de una autoevaluación (misma forma que feedback_resultados) ---------- */
-- persona: respuestas de esa autoevaluación. UDES: promedio de las autoevaluaciones completadas del mismo formulario y
-- período, y solo se muestra con 3 o más (para que nadie pueda deducir las respuestas de otra persona). Sin comparativo de equipo.
create or replace function public.evaluacion_propia_resultados(p_evaluation uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ev public.evaluations;
  tname text;
  res jsonb;
begin
  select * into ev from public.evaluations where id = p_evaluation;
  if not found then raise exception 'Evaluación no encontrada'; end if;
  if ev.evaluator_id is distinct from ev.evaluated_id then raise exception 'Solo aplica a autoevaluaciones'; end if;
  if not (public.is_admin() or ev.evaluator_id = auth.uid()) then raise exception 'No tienes acceso a esta evaluación'; end if;
  if ev.status <> 'completed' then raise exception 'La evaluación aún no está completada'; end if;
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
           (x.evaluation_id = ev.id) as is_p, q.sid
    from public.evaluation_responses x
    join public.evaluations e2 on e2.id = x.evaluation_id
    join q on q.qid = x.question_id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and e2.evaluator_id = e2.evaluated_id
      and public.fb_num(x.response_value) > 0
  ), tot as (
    select avg(v) filter (where is_p) as p, avg(v) as u, count(distinct eid) as un from tagged
  ), crit as (
    select qid, avg(v) filter (where is_p) as p, avg(v) as u from tagged group by qid
  ), sec as (
    select sid, avg(v) filter (where is_p) as p, avg(v) as u from tagged group by sid
  ), official as (
    select avg(r.overall_score) filter (where e2.id = ev.id) as p, avg(r.overall_score) as u
    from public.evaluations e2
    join public.evaluation_results r on r.evaluation_id = e2.id
    where e2.template_id = ev.template_id and e2.status = 'completed'
      and e2.period_id is not distinct from ev.period_id
      and e2.evaluator_id = e2.evaluated_id
      and r.overall_score is not null and r.overall_score > 0
  ), grouped as (
    select q.sid, q.stitle, q.sord,
           jsonb_agg(jsonb_build_object('id', q.qid, 'texto', q.txt, 'peso', q.peso,
                                        'persona', round(c.p, 2),
                                        'equipo', null,
                                        'udes', case when (select un from tot) >= 3 then round(c.u, 2) end)
                     order by q.qord, q.gord) as crits
    from q left join crit c on c.qid = q.qid
    group by q.sid, q.stitle, q.sord
  )
  select jsonb_build_object(
    'version', 1,
    'kind', 'autoevaluacion',
    'generated_at', now(),
    'completed_at', ev.completed_at,
    'evaluation_id', ev.id,
    'template', tname,
    'period_id', ev.period_id,
    'scale', 5,
    'team_n', 0,
    'udes_n', coalesce((select un from tot), 0),
    'overall', (select jsonb_build_object('persona', round(coalesce(o.p, tot.p), 2),
                                          'equipo', null,
                                          'udes', case when tot.un >= 3 then round(coalesce(o.u, tot.u), 2) end)
                from tot, official o),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.sid, 'title', g.stitle,
                                          'persona', round(sc.p, 2), 'equipo', null,
                                          'udes', case when (select un from tot) >= 3 then round(sc.u, 2) end,
                                          'criterios', g.crits)
                       order by g.sord, g.stitle)
      from grouped g left join sec sc on sc.sid is not distinct from g.sid
    ), '[]'::jsonb)
  ) into res;

  return res;
end;
$$;

revoke all on function public.evaluacion_propia_resultados(uuid) from public, anon;
grant execute on function public.evaluacion_propia_resultados(uuid) to authenticated;

/* ---------- 5. Plantilla del correo ---------- */
insert into public.mail_templates (key, name, description, subject, html, default_subject, default_html, variables) values
('copia_evaluaciones', 'Copia de tus evaluaciones', 'Correo automático para quien termina todas sus evaluaciones del periodo. Adjunta en PDF la copia de su autoevaluación.',
 'Completaste tus evaluaciones del {{periodo}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Completaste tus evaluaciones</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f6f8">Terminaste todas tus evaluaciones del {{periodo}}. Aquí tienes tu copia.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #1d4ed8;border-radius:8px">
  <tr><td style="padding:22px 32px 4px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle"><img src="{{logo}}" width="120" alt="Aluna UDES" style="display:block;border:0;outline:none;height:auto"></td>
    <td valign="middle" style="padding-left:6px;font-size:26px;line-height:1;font-weight:600;letter-spacing:-.3px;color:#172554">Eval</td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:22px 32px 6px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a">Terminaste tus evaluaciones</td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155">Hola {{nombre}}, completaste todas tus evaluaciones del <b>{{periodo}}</b> el <b>{{fecha}}</b>. Gracias por dedicarles el tiempo.</td></tr>
  <tr><td style="padding:0 32px 18px;font-size:15px;line-height:1.65;color:#334155">{{adjunto_texto}}</td></tr>
  <tr><td style="padding:0 32px 22px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:6px"><tr>
    <td style="padding:12px 16px;font-size:13.5px;line-height:1.6;color:#1e3a8a">Evaluaciones del <b>{{periodo}}</b><br>Fecha de cierre: <b>{{fecha}}</b></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 26px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1d4ed8" style="border-radius:6px"><a href="{{enlace}}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Ver mis evaluaciones</a></td></tr></table></td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">Este mensaje es automático y se envió a {{correo}}. Aluna Eval es un proyecto desarrollado por la Universidad de Santander. Si algún dato no corresponde con lo que diligenciaste, avisa a la persona administradora de Aluna Eval.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Completaste tus evaluaciones del {{periodo}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Completaste tus evaluaciones</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f6f8">Terminaste todas tus evaluaciones del {{periodo}}. Aquí tienes tu copia.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #1d4ed8;border-radius:8px">
  <tr><td style="padding:22px 32px 4px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle"><img src="{{logo}}" width="120" alt="Aluna UDES" style="display:block;border:0;outline:none;height:auto"></td>
    <td valign="middle" style="padding-left:6px;font-size:26px;line-height:1;font-weight:600;letter-spacing:-.3px;color:#172554">Eval</td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:22px 32px 6px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a">Terminaste tus evaluaciones</td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155">Hola {{nombre}}, completaste todas tus evaluaciones del <b>{{periodo}}</b> el <b>{{fecha}}</b>. Gracias por dedicarles el tiempo.</td></tr>
  <tr><td style="padding:0 32px 18px;font-size:15px;line-height:1.65;color:#334155">{{adjunto_texto}}</td></tr>
  <tr><td style="padding:0 32px 22px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:6px"><tr>
    <td style="padding:12px 16px;font-size:13.5px;line-height:1.6;color:#1e3a8a">Evaluaciones del <b>{{periodo}}</b><br>Fecha de cierre: <b>{{fecha}}</b></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 26px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1d4ed8" style="border-radius:6px"><a href="{{enlace}}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Ver mis evaluaciones</a></td></tr></table></td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">Este mensaje es automático y se envió a {{correo}}. Aluna Eval es un proyecto desarrollado por la Universidad de Santander. Si algún dato no corresponde con lo que diligenciaste, avisa a la persona administradora de Aluna Eval.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona"},{"name":"correo","desc":"Correo de destino"},{"name":"periodo","desc":"Periodo de evaluación (por ejemplo, periodo 2026)"},{"name":"fecha","desc":"Fecha en que completó la última evaluación"},{"name":"adjunto_texto","desc":"Frase que indica si el PDF va adjunto (la genera el sistema)"},{"name":"enlace","desc":"Enlace a Aluna Eval"},{"name":"logo","desc":"URL del logo de Aluna (la pone el sistema)"}]'::jsonb)
on conflict (key) do nothing;

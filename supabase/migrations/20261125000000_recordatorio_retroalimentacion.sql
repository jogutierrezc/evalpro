-- Correos: recordatorio de retroalimentación pendiente para personas evaluadoras.
--
-- Alcance: CUALQUIER persona que evaluó a otra (se excluyen las autoevaluaciones: evaluator_id = evaluated_id y las plantillas
-- de tipo self_evaluation / leader_self_evaluation_vaf). Por evaluador y periodo se cuentan dos pendientes:
--   A) sin_acta   : evaluación COMPLETADA de otra persona que no tiene fila en feedback_actas.
--   B) sin_firmar : existe el acta pero falta la firma de la persona evaluadora o de la evaluada.
-- Un acta firmada por ambas NO es pendiente aunque no tenga compromisos. Una persona = un correo por periodo.
--
-- Requiere 20261116000000_correos_modulo.sql (mail_templates). Idempotente. NO se aplica sola: ejecútala a mano en el
-- SQL Editor de la instancia de Supabase del proyecto. Después hay que redesplegar la función «correos»
-- (bash supabase/desplegar-correos.sh) para que reconozca la audiencia 'retro_pendiente'.

create or replace function public.mail_audience_retro(p_period uuid, p_campus text default null, p_office uuid default null, p_role text default null)
returns table (user_id uuid, full_name text, email text, office text, campus text, role text,
               total int, sin_acta int, sin_firmar int, evaluados_sin_acta text[], evaluados_sin_firmar text[])
language sql stable as $$
  with base as (
    select e.evaluator_id,
           ev.full_name as evaluado,
           (a.id is null) as falta_acta,
           (a.id is not null and (a.evaluator_signed_at is null or a.evaluated_signed_at is null)) as falta_firma
    from public.evaluations e
    join public.evaluation_templates t on t.id = e.template_id
    join public.users ev on ev.id = e.evaluated_id
    left join public.feedback_actas a on a.evaluation_id = e.id
    where p_period is not null
      and e.period_id = p_period
      and e.status = 'completed'
      and e.evaluator_id <> e.evaluated_id
      and coalesce(t.type, '') not in ('self_evaluation', 'leader_self_evaluation_vaf')
  ), agg as (
    select b.evaluator_id,
           count(*)::int as total,
           (count(*) filter (where b.falta_acta))::int as sin_acta,
           (count(*) filter (where b.falta_firma))::int as sin_firmar,
           coalesce((array_agg(distinct b.evaluado order by b.evaluado) filter (where b.falta_acta))[1:20], '{}') as n_acta,
           coalesce((array_agg(distinct b.evaluado order by b.evaluado) filter (where b.falta_firma))[1:20], '{}') as n_firma
    from base b
    group by b.evaluator_id
  )
  select u.id, u.full_name, lower(btrim(u.email)), coalesce(o.name, ''), coalesce(u.campus, ''), u.role,
         g.total, g.sin_acta, g.sin_firmar, g.n_acta, g.n_firma
  from agg g
  join public.users u on u.id = g.evaluator_id
  left join public.offices o on o.id = u.office_id
  where (g.sin_acta + g.sin_firmar) > 0
    and u.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and (p_campus is null or p_campus = '' or u.campus = p_campus)
    and (p_office is null or u.office_id = p_office)
    and (p_role is null or p_role = '' or u.role = p_role)
  order by u.full_name
$$;

revoke all on function public.mail_audience_retro(uuid, text, uuid, text) from public, anon, authenticated;

insert into public.mail_templates (key, name, description, subject, html, default_subject, default_html, variables) values
('recordatorio_retroalimentacion', 'Recordatorio de retroalimentación', 'Para quien evaluó a otras personas y aún no crea o no termina de firmar el acta. Avisa del módulo de Retroalimentación y Plan de mejora.',
 'Retroalimentación pendiente: {{total_pendientes_retro}} {{retro_texto}} por cerrar',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retroalimentación pendiente</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;letter-spacing:.2px;color:#0f172a">Aluna Eval</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">{{nombre}}, le quedan retroalimentaciones por registrar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">En el <b>{{periodo}}</b> usted evaluó a otras personas y, de esas evaluaciones, <b>{{total_pendientes_retro}}</b> {{retro_texto}} todavía no están cerradas. {{detalle_retro}}</td></tr>
  <tr><td style="padding:10px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc"><tr>
   <td width="50%" style="padding:14px 16px;font-size:13px;line-height:1.4;color:#475569"><span style="display:block;font-size:24px;font-weight:700;color:#0f172a">{{sin_acta}}</span>sin acta creada</td>
   <td width="50%" style="padding:14px 16px;font-size:13px;line-height:1.4;color:#475569;border-left:1px solid #e2e8f0"><span style="display:block;font-size:24px;font-weight:700;color:#0f172a">{{sin_firmar}}</span>con acta sin firmar</td>
  </tr></table></td></tr>
  <tr><td style="padding:10px 28px 8px;font-size:14px;line-height:1.6;color:#475569">Personas evaluadas con retroalimentación pendiente: {{lista_evaluados}}.</td></tr>
  <tr><td style="padding:8px 28px 8px;font-size:15px;line-height:1.6;color:#334155">Aluna Eval ahora tiene un módulo para <b>crear la retroalimentación (acta)</b> y el <b>plan de mejora</b> directamente en la aplicación, con firma electrónica de ambas partes.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace_retro}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Ir a Retroalimentación</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}} desde Aluna Eval, Universidad de Santander. Si ya cerró estas retroalimentaciones, puede ignorar este recordatorio.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Retroalimentación pendiente: {{total_pendientes_retro}} {{retro_texto}} por cerrar',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Retroalimentación pendiente</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:22px 28px;border-bottom:3px solid #1d4ed8;font-size:15px;font-weight:700;letter-spacing:.2px;color:#0f172a">Aluna Eval</td></tr>
  <tr><td style="padding:28px 28px 8px;font-size:20px;line-height:1.3;font-weight:600">{{nombre}}, le quedan retroalimentaciones por registrar</td></tr>
  <tr><td style="padding:0 28px 8px;font-size:15px;line-height:1.6;color:#334155">En el <b>{{periodo}}</b> usted evaluó a otras personas y, de esas evaluaciones, <b>{{total_pendientes_retro}}</b> {{retro_texto}} todavía no están cerradas. {{detalle_retro}}</td></tr>
  <tr><td style="padding:10px 28px 8px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc"><tr>
   <td width="50%" style="padding:14px 16px;font-size:13px;line-height:1.4;color:#475569"><span style="display:block;font-size:24px;font-weight:700;color:#0f172a">{{sin_acta}}</span>sin acta creada</td>
   <td width="50%" style="padding:14px 16px;font-size:13px;line-height:1.4;color:#475569;border-left:1px solid #e2e8f0"><span style="display:block;font-size:24px;font-weight:700;color:#0f172a">{{sin_firmar}}</span>con acta sin firmar</td>
  </tr></table></td></tr>
  <tr><td style="padding:10px 28px 8px;font-size:14px;line-height:1.6;color:#475569">Personas evaluadas con retroalimentación pendiente: {{lista_evaluados}}.</td></tr>
  <tr><td style="padding:8px 28px 8px;font-size:15px;line-height:1.6;color:#334155">Aluna Eval ahora tiene un módulo para <b>crear la retroalimentación (acta)</b> y el <b>plan de mejora</b> directamente en la aplicación, con firma electrónica de ambas partes.</td></tr>
  <tr><td style="padding:18px 28px 26px"><a href="{{enlace_retro}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Ir a Retroalimentación</a></td></tr>
  <tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">Mensaje enviado a {{correo}} desde Aluna Eval, Universidad de Santander. Si ya cerró estas retroalimentaciones, puede ignorar este recordatorio.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona evaluadora"},{"name":"correo","desc":"Correo de destino"},{"name":"periodo","desc":"Periodo de evaluación"},{"name":"total_pendientes_retro","desc":"Retroalimentaciones pendientes (sin acta + sin firmar)"},{"name":"retro_texto","desc":"retroalimentación o retroalimentaciones, según el total"},{"name":"sin_acta","desc":"Evaluaciones completadas de otras personas sin acta creada"},{"name":"sin_firmar","desc":"Actas creadas a las que les falta alguna firma"},{"name":"detalle_retro","desc":"Frase que cambia según haya actas sin crear, sin firmar o ambas"},{"name":"lista_evaluados","desc":"Nombres de las personas evaluadas con pendiente (hasta 6)"},{"name":"enlace_retro","desc":"Enlace al módulo Retroalimentación"},{"name":"enlace","desc":"Enlace al portal"}]'::jsonb)
on conflict (key) do nothing;

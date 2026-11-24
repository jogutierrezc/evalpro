-- Correo de bienvenida al crear un usuario (individual o por carga masiva).
--
--   1. mail_log.kind admite 'bienvenida'.
--   2. Plantilla 'usuario_registrado' (editable en Correos > Plantillas).
-- La clave inicial NO se guarda: la función «correos» (acción usuario_bienvenida) la inyecta al renderizar y deja en
-- mail_log.vars solo las variables sin la clave.
-- Idempotente: se puede ejecutar más de una vez.

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.mail_log'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.mail_log drop constraint %I', c.conname);
  end loop;
  alter table public.mail_log add constraint mail_log_kind_check check (kind in ('campaign', 'otp', 'test', 'copia', 'bienvenida'));
end $$;

insert into public.mail_templates (key, name, description, subject, html, default_subject, default_html, variables) values
('usuario_registrado', 'Bienvenida: usuario registrado', 'Correo automático al crear un usuario: avisa que ya está registrado en Aluna Eval, con su correo de acceso, la clave inicial y que tiene evaluaciones por realizar.',
 'Ya estás registrado en Aluna Eval',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ya estás registrado en Aluna Eval</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f6f8">Tu cuenta de Aluna Eval ya está lista y tienes evaluaciones por realizar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #1d4ed8;border-radius:8px">
  <tr><td style="padding:22px 32px 4px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle"><img src="{{logo}}" width="120" alt="Aluna UDES" style="display:block;border:0;outline:none;height:auto"></td>
    <td valign="middle" style="padding-left:6px;font-size:26px;line-height:1;font-weight:600;letter-spacing:-.3px;color:#172554">Eval</td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:22px 32px 6px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a">Ya estás registrado en Aluna Eval</td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155">Hola {{nombre}}, creamos tu cuenta en Aluna Eval, la plataforma de evaluaciones de la Universidad de Santander. Con estos datos puedes ingresar:</td></tr>
  <tr><td style="padding:0 32px 18px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:6px"><tr>
    <td style="padding:14px 18px;font-size:14px;line-height:1.9;color:#1e3a8a">Usuario (correo): <b>{{correo}}</b><br>Clave inicial: <b style="font-family:'IBM Plex Mono',Consolas,'Courier New',monospace;font-size:15px;letter-spacing:.3px">{{clave}}</b></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155"><b>{{disponibles_texto}}</b> Ingresa y complétalas dentro del plazo del periodo.</td></tr>
  <tr><td style="padding:0 32px 22px;font-size:13.5px;line-height:1.6;color:#475569">Esta clave es personal. No la compartas con nadie y elimina este correo cuando ya hayas ingresado.</td></tr>
  <tr><td style="padding:0 32px 26px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1d4ed8" style="border-radius:6px"><a href="{{enlace}}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Ingresar a Aluna Eval</a></td></tr></table></td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">Este mensaje es automático y se envió a {{correo}}. Aluna Eval es un proyecto desarrollado por la Universidad de Santander. Si no esperabas este correo, avisa a la persona administradora de Aluna Eval.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Ya estás registrado en Aluna Eval',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ya estás registrado en Aluna Eval</title></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:'IBM Plex Sans','Segoe UI',Arial,sans-serif;color:#0f172a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f5f6f8">Tu cuenta de Aluna Eval ya está lista y tienes evaluaciones por realizar.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:28px 12px"><tr><td align="center">
 <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-top:4px solid #1d4ed8;border-radius:8px">
  <tr><td style="padding:22px 32px 4px">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td valign="middle"><img src="{{logo}}" width="120" alt="Aluna UDES" style="display:block;border:0;outline:none;height:auto"></td>
    <td valign="middle" style="padding-left:6px;font-size:26px;line-height:1;font-weight:600;letter-spacing:-.3px;color:#172554">Eval</td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:22px 32px 6px;font-size:22px;line-height:1.3;font-weight:600;color:#0f172a">Ya estás registrado en Aluna Eval</td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155">Hola {{nombre}}, creamos tu cuenta en Aluna Eval, la plataforma de evaluaciones de la Universidad de Santander. Con estos datos puedes ingresar:</td></tr>
  <tr><td style="padding:0 32px 18px">
   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #dbeafe;border-radius:6px"><tr>
    <td style="padding:14px 18px;font-size:14px;line-height:1.9;color:#1e3a8a">Usuario (correo): <b>{{correo}}</b><br>Clave inicial: <b style="font-family:'IBM Plex Mono',Consolas,'Courier New',monospace;font-size:15px;letter-spacing:.3px">{{clave}}</b></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:0 32px 14px;font-size:15px;line-height:1.65;color:#334155"><b>{{disponibles_texto}}</b> Ingresa y complétalas dentro del plazo del periodo.</td></tr>
  <tr><td style="padding:0 32px 22px;font-size:13.5px;line-height:1.6;color:#475569">Esta clave es personal. No la compartas con nadie y elimina este correo cuando ya hayas ingresado.</td></tr>
  <tr><td style="padding:0 32px 26px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#1d4ed8" style="border-radius:6px"><a href="{{enlace}}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">Ingresar a Aluna Eval</a></td></tr></table></td></tr>
  <tr><td style="padding:16px 32px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.55;color:#64748b">Este mensaje es automático y se envió a {{correo}}. Aluna Eval es un proyecto desarrollado por la Universidad de Santander. Si no esperabas este correo, avisa a la persona administradora de Aluna Eval.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona"},{"name":"correo","desc":"Correo de acceso (usuario)"},{"name":"clave","desc":"Clave inicial. Se pone al enviar y NO se guarda en la bitácora"},{"name":"disponibles_texto","desc":"Frase con las evaluaciones disponibles (la genera el sistema con el conteo real)"},{"name":"periodo","desc":"Periodo activo (por ejemplo, periodo 2026)"},{"name":"enlace","desc":"Enlace de ingreso a Aluna Eval"},{"name":"logo","desc":"URL del logo de Aluna (la pone el sistema)"}]'::jsonb)
on conflict (key) do nothing;

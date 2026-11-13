-- Plantilla del correo que recibe la persona evaluada cuando la persona evaluadora firma el acta:
-- enlace de firma y su propio código OTP. Se edita en el módulo Correos > Plantillas.
insert into public.mail_templates (key, name, description, subject, html, default_subject, default_html, variables) values
('firma_invitacion', 'Invitación a firmar el acta', 'Correo a la persona evaluada, justo después de la firma de la persona evaluadora: enlace de firma y código OTP.',
 'Le corresponde firmar el acta {{acta}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firma del acta</title></head>
<body style="margin:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
 <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:600">Firma del acta {{acta}}</td></tr>
  <tr><td style="padding:0 28px;font-size:14px;color:#334155;line-height:1.55">Hola {{nombre}}, {{evaluador}} firmó el acta de retroalimentación y ahora le corresponde firmarla a usted.</td></tr>
  <tr><td align="center" style="padding:20px 28px 6px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Revisar y firmar el acta</a></td></tr>
  <tr><td align="center" style="padding:14px 28px 4px;font-size:13px;color:#334155">Su código de firma</td></tr>
  <tr><td align="center" style="padding:0 28px 14px"><div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:6px;font:600 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px">{{codigo}}</div></td></tr>
  <tr><td style="padding:0 28px 24px;font-size:12.5px;color:#64748b;line-height:1.5">El enlace y el código vencen en {{vence_horas}} horas y el código solo sirve una vez. Si no esperaba este mensaje, ignórelo y no comparta el código.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 'Le corresponde firmar el acta {{acta}}',
 $html$<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Firma del acta</title></head>
<body style="margin:0;background:#f5f6f8;font-family:'Segoe UI',Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
 <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
  <tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:600">Firma del acta {{acta}}</td></tr>
  <tr><td style="padding:0 28px;font-size:14px;color:#334155;line-height:1.55">Hola {{nombre}}, {{evaluador}} firmó el acta de retroalimentación y ahora le corresponde firmarla a usted.</td></tr>
  <tr><td align="center" style="padding:20px 28px 6px"><a href="{{enlace}}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:6px">Revisar y firmar el acta</a></td></tr>
  <tr><td align="center" style="padding:14px 28px 4px;font-size:13px;color:#334155">Su código de firma</td></tr>
  <tr><td align="center" style="padding:0 28px 14px"><div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:6px;font:600 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px">{{codigo}}</div></td></tr>
  <tr><td style="padding:0 28px 24px;font-size:12.5px;color:#64748b;line-height:1.5">El enlace y el código vencen en {{vence_horas}} horas y el código solo sirve una vez. Si no esperaba este mensaje, ignórelo y no comparta el código.</td></tr>
 </table>
</td></tr></table></body></html>$html$,
 '[{"name":"nombre","desc":"Nombre de la persona evaluada"},{"name":"evaluador","desc":"Nombre de la persona evaluadora"},{"name":"acta","desc":"Número del acta"},{"name":"enlace","desc":"Enlace de firma (obligatorio)"},{"name":"codigo","desc":"Código OTP de 6 dígitos (obligatorio)"},{"name":"vence_horas","desc":"Horas de vigencia del enlace y del código"}]'::jsonb)
on conflict (key) do nothing;

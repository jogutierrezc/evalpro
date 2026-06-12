-- Tabla para historial de notificaciones enviadas
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  evaluator_id uuid NOT NULL,
  evaluator_name text NOT NULL,
  evaluator_email text NOT NULL,
  period_id uuid,
  period_name text,
  resend_message_id text,
  evaluations_count integer DEFAULT 0,
  sent_at timestamp with time zone DEFAULT now(),
  opened_at timestamp with time zone,
  open_count integer DEFAULT 0,
  clicked_at timestamp with time zone,
  click_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'auto'::text, -- 'auto' (cron) o 'manual' (admin)
  status text DEFAULT 'sent'::text, -- 'sent', 'delivered', 'opened', 'clicked', 'failed'
  error_message text,
  CONSTRAINT notification_log_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Index para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_notification_log_evaluator_id ON notification_log (evaluator_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_period_id ON notification_log (period_id);
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at ON notification_log (sent_at DESC);

-- Actualizar resend_config para incluir plantilla HTML editable
INSERT INTO public.admin_settings (key, value)
VALUES (
  'email_template',
  jsonb_build_object(
    'subject', '✅ Evaluaciones Completadas — EvalPro UDES',
    'from_email', 'notificaciones@evalpro.udes.edu.co',
    'html', '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evaluaciones Completadas - EvalPro UDES</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:\"Segoe UI\",Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:32px 40px;text-align:center;">
              <img src="https://udes.edu.co/images/logo/udes-logo-principal.svg" alt="UDES" style="height:40px;margin-bottom:16px;filter:brightness(0) invert(1);" />
              <h1 style="color:#ffffff;margin:0;font-size:24px;font-weight:700;">¡Evaluaciones Completadas!</h1>
              <p style="color:#bfdbfe;margin:8px 0 0;font-size:15px;">Sistema EvalPro UDES</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <p style="font-size:18px;color:#111827;font-weight:600;margin:0 0 8px;">Hola, {{COLLABORATOR_NAME}}</p>
              <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;">
                ¡Felicidades! Has completado <strong>todas las evaluaciones</strong> que tenías asignadas en el sistema EvalPro.
                A continuación encontrarás el detalle de las evaluaciones realizadas.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                <thead>
                  <tr style="background-color:#f9fafb;">
                    <th style="padding:12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Formulario</th>
                    <th style="padding:12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Evaluado</th>
                    <th style="padding:12px;text-align:left;font-size:13px;font-weight:600;color:#374151;border-bottom:2px solid #e5e7eb;">Completado</th>
                  </tr>
                </thead>
                <tbody>
                  {{EVALUATION_ROWS}}
                </tbody>
              </table>
              <p style="font-size:14px;color:#6b7280;margin:24px 0 0;line-height:1.5;text-align:center;">
                Si tienes alguna duda o inquietud, comunícate con la <br/> 
                <strong>Vicerrectoría Administrativa y Financiera</strong> de la UDES.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">
                © 2026 EvalPro UDES — Universidad de Santander<br/>
                Este mensaje fue generado automáticamente, por favor no responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
  )
)
ON CONFLICT (key) DO UPDATE SET
  value = jsonb_build_object(
    'subject', COALESCE(admin_settings.value->>'subject', '✅ Evaluaciones Completadas — EvalPro UDES'),
    'from_email', COALESCE(admin_settings.value->>'from_email', 'notificaciones@evalpro.udes.edu.co'),
    'html', COALESCE(admin_settings.value->>'html', '<!DOCTYPE html>...')
  ),
  updated_at = now();

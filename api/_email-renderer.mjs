/**
 * Email renderer that reads the template from Supabase admin_settings
 * and replaces placeholders with actual evaluation data.
 */

export async function renderEmail(supabaseAdmin, { collaboratorName, evaluations }) {
  // Read template from Supabase
  const { data: templateSettings } = await supabaseAdmin
    .from('admin_settings')
    .select('value')
    .eq('key', 'email_template')
    .maybeSingle();

  const template = templateSettings?.value || {};
  const subject = template.subject || '✅ Evaluaciones Completadas — EvalPro UDES';
  const fromEmail = template.from_email || 'notificaciones@evalpro.udes.edu.co';
  let html = template.html || '';

  // If no template stored, use built-in fallback
  if (!html) {
    html = buildFallbackHtml(collaboratorName, evaluations);
  }

  // Build evaluation rows HTML
  const evalRows = (evaluations || []).map((ev) => {
    const evaluatedName = ev.evaluatedName || collaboratorName;
    const templateName = ev.templateName || 'Evaluación';
    const completedDate = ev.completedAt
      ? new Date(ev.completedAt).toLocaleDateString('es-CO', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '—';
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(templateName)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(evaluatedName)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#059669;">${completedDate}</td>
      </tr>`;
  }).join('\n');

  // Replace placeholders
  const year = new Date().getFullYear();
  html = html
    .replace(/\{\{COLLABORATOR_NAME\}\}/g, escapeHtml(collaboratorName))
    .replace(/\{\{EVALUATION_ROWS\}\}/g, evalRows)
    .replace(/\{\{YEAR\}\}/g, year)
    .replace(/\{\{CURRENT_DATE\}\}/g, new Date().toLocaleDateString('es-CO', {
      year: 'numeric', month: 'long', day: 'numeric',
    }));

  return { subject, fromEmail, html };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildFallbackHtml(collaboratorName, evaluations) {
  const evalRows = (evaluations || []).map((ev) => {
    const evaluatedName = ev.evaluatedName || collaboratorName;
    const templateName = ev.templateName || 'Evaluación';
    const completedDate = ev.completedAt
      ? new Date(ev.completedAt).toLocaleDateString('es-CO', {
          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })
      : '—';
    return `
      <tr>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(templateName)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escapeHtml(evaluatedName)}</td>
        <td style="padding:12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#059669;">${completedDate}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Evaluaciones Completadas - EvalPro UDES</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
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
              <p style="font-size:18px;color:#111827;font-weight:600;margin:0 0 8px;">Hola, ${escapeHtml(collaboratorName)}</p>
              <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 24px;">
                ¡Felicidades! Has completado <strong>todas las evaluaciones</strong> que tenías asignadas en el sistema EvalPro.
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
                  ${evalRows}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="font-size:12px;color:#9ca3af;margin:0;">
                &copy; ${new Date().getFullYear()} EvalPro UDES &mdash; Universidad de Santander
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

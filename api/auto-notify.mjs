import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { renderEmail } from './_email-renderer.mjs';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[auto-notify] Missing Supabase env vars');
}

const _supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'evalpro-api' } },
    })
  : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};


export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { evaluatorId, periodId } = req.body;
    if (!evaluatorId) {
      return res.status(400).json({ error: 'evaluatorId es requerido.' });
    }

    if (!_supabaseAdmin) {
      return res.status(500).json({ error: 'Configuración de Supabase no disponible en el servidor.' });
    }

    // 1. Verificar autenticación (cualquier usuario autenticado puede verificar sus propias evaluaciones)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido.' });
    }
    const { data: { user: authUser }, error: authError } = await _supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) {
      return res.status(401).json({ error: 'Token de autenticación inválido.' });
    }

    // 2. Verificar que el usuario autenticado es el mismo evaluador
    if (authUser.id !== evaluatorId) {
      return res.status(403).json({ error: 'No puedes enviar notificaciones para otro usuario.' });
    }

    // 3. Obtener la configuración de Resend desde Supabase admin_settings
    const { data: settings } = await _supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'resend_config')
      .maybeSingle();

    const resendConfig = settings?.value || {};
    const resendApiKey = resendConfig.api_key;
    const fromEmail = resendConfig.from_email || 'notificaciones@evalpro.udes.edu.co';
    const isEnabled = resendConfig.enabled === true;

    if (!resendApiKey || !isEnabled) {
      return res.status(200).json({
        success: false,
        skipped: true,
        message: 'El envío automático de notificaciones no está configurado o está deshabilitado.',
      });
    }

    // 4. Obtener el usuario
    const { data: userData } = await _supabaseAdmin
      .from('users')
      .select('id, full_name, email')
      .eq('id', evaluatorId)
      .maybeSingle();

    if (!userData || !userData.email) {
      return res.status(200).json({
        success: false,
        skipped: true,
        message: `El usuario no tiene correo registrado.`,
      });
    }

    // 4. Determinar el período activo si no se especificó
    let targetPeriodId = periodId;
    if (!targetPeriodId) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const { data: period } = await _supabaseAdmin
        .from('evaluation_periods')
        .select('id')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .limit(1)
        .maybeSingle();
      if (period) targetPeriodId = period.id;
    }

    if (!targetPeriodId) {
      return res.status(200).json({
        success: false,
        skipped: true,
        message: 'No hay un período activo. No se enviará notificación.',
      });
    }

    // 5. Verificar si TODAS las evaluaciones del usuario están completas
    const { data: allEvals } = await _supabaseAdmin
      .from('evaluations')
      .select('id, status, template_id, evaluated_id, completed_at')
      .eq('evaluator_id', evaluatorId)
      .eq('period_id', targetPeriodId);

    if (!allEvals || allEvals.length === 0) {
      return res.status(200).json({
        success: false,
        skipped: true,
        message: 'El usuario no tiene evaluaciones asignadas en este período.',
      });
    }

    const completedEvals = allEvals.filter(ev => ev.status === 'completed');
    const allDone = completedEvals.length === allEvals.length;

    if (!allDone) {
      return res.status(200).json({
        success: false,
        skipped: true,
        message: `El usuario tiene ${allEvals.length - completedEvals.length} evaluaciones pendientes. No se envía notificación.`,
        total: allEvals.length,
        completed: completedEvals.length,
      });
    }

    // 6. Obtener detalles de las evaluaciones completadas para la plantilla
    const templateIds = [...new Set(completedEvals.map(ev => ev.template_id))];
    const evaluatedIds = [...new Set(completedEvals.map(ev => ev.evaluated_id))];

    const [{ data: templates }, { data: evaluatedUsers }] = await Promise.all([
      _supabaseAdmin.from('evaluation_templates').select('id, name').in('id', templateIds),
      _supabaseAdmin.from('users').select('id, full_name').in('id', evaluatedIds),
    ]);

    const templateMap = Object.fromEntries((templates || []).map(t => [t.id, t.name]));
    const userMap = Object.fromEntries((evaluatedUsers || []).map(u => [u.id, u.full_name]));

    const evaluationsForEmail = completedEvals.map(ev => ({
      templateName: templateMap[ev.template_id] || 'Evaluación',
      evaluatedName: userMap[ev.evaluated_id] || ev.evaluated_id,
      completedAt: ev.completed_at,
    }));

    // 7. Renderizar plantilla desde Supabase
    const { subject, fromEmail: resolvedFrom, html: htmlContent } = await renderEmail(_supabaseAdmin, {
      collaboratorName: userData.full_name,
      evaluations: evaluationsForEmail,
    });

    const finalFromEmail = fromEmail || resolvedFrom;

    // 8. Enviar el correo con Resend
    const resend = new Resend(resendApiKey);
    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: finalFromEmail,
      to: [userData.email],
      subject: subject,
      html: htmlContent,
    });

    if (sendError) {
      console.error('[Resend Error]', sendError);
      return res.status(500).json({ error: 'Error al enviar el correo.', details: sendError });
    }

    // 9. Registrar envío en notification_log
    try {
      await _supabaseAdmin.from('notification_log').insert({
        evaluator_id: evaluatorId,
        evaluator_name: userData.full_name,
        evaluator_email: userData.email,
        period_id: targetPeriodId,
        resend_message_id: sendResult?.id || null,
        evaluations_count: completedEvals.length,
        sent_at: new Date().toISOString(),
        source: 'auto',
        status: 'sent',
        metadata: {
          evaluations: evaluationsForEmail,
          subject,
        },
      });
    } catch (logErr) {
      console.warn('[auto-notify] Error logging to notification_log:', logErr);
    }

    return res.status(200).json({
      success: true,
      message: `Notificación enviada a ${userData.email}`,
      data: sendResult,
      total: allEvals.length,
      completed: completedEvals.length,
    });

  } catch (err) {
    console.error('[auto-notify Error]', err);
    return res.status(500).json({ error: 'Error interno del servidor.', details: err.message || String(err) });
  }
}

/**
 * Vercel Cron Job — Runs periodically to check for users who completed all evaluations
 * and auto-sends notifications to those who haven't received one yet.
 *
 * This serves as a safety net in case the frontend trigger fails.
 *
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/auto-notify-cron",
 *     "schedule": "0 */6 * * *"
 *   }]
 * }
 */
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { renderEmail } from './_email-renderer.mjs';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const _supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'evalpro-cron' } },
    })
  : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

/** Verify CRON_SECRET to prevent unauthorized invocations */
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}` || (req.query?.secret === secret);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  if (!_supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase no configurado.' });
  }

  try {
    // 1. Get Resend config
    const { data: settings } = await _supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'resend_config')
      .maybeSingle();

    const resendConfig = settings?.value || {};
    if (!resendConfig.api_key || !resendConfig.enabled) {
      return res.status(200).json({ skipped: true, message: 'Resend no configurado.' });
    }

    // 2. Find active period
    const todayStr = new Date().toISOString().slice(0, 10);
    const { data: period } = await _supabaseAdmin
      .from('evaluation_periods')
      .select('id')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
      .limit(1)
      .maybeSingle();

    if (!period) {
      return res.status(200).json({ skipped: true, message: 'No hay período activo.' });
    }

    // 3. Find all evaluators who completed ALL evaluations but haven't received notification
    const { data: allEvals } = await _supabaseAdmin
      .from('evaluations')
      .select('evaluator_id, status')
      .eq('period_id', period.id);

    // Count per evaluator
    const stats = {};
    (allEvals || []).forEach((ev) => {
      if (!stats[ev.evaluator_id]) stats[ev.evaluator_id] = { total: 0, completed: 0 };
      stats[ev.evaluator_id].total++;
      if (ev.status === 'completed') stats[ev.evaluator_id].completed++;
    });

    // Evaluators who completed everything
    const completedIds = Object.entries(stats)
      .filter(([, s]) => s.total > 0 && s.completed === s.total)
      .map(([id]) => id);

    if (completedIds.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'Nadie ha completado todas.' });
    }

    // 4. Check who already received a notification (any source — manual, auto, or cron)
    const { data: existingLogs } = await _supabaseAdmin
      .from('notification_log')
      .select('evaluator_id')
      .eq('period_id', period.id);

    const alreadyNotified = new Set((existingLogs || []).map(l => l.evaluator_id));
    const needNotify = completedIds.filter(id => !alreadyNotified.has(id));

    if (needNotify.length === 0) {
      return res.status(200).json({ success: true, sent: 0, message: 'Todos ya notificados.' });
    }

    // 5. Get user details
    const { data: users } = await _supabaseAdmin
      .from('users')
      .select('id, full_name, email')
      .in('id', needNotify);

    // 6. Send notifications
    const resend = new Resend(resendConfig.api_key);
    let sentCount = 0;
    const errors = [];

    for (const user of (users || [])) {
      if (!user.email) continue;

      // Get their completed evaluations
      const { data: userEvals } = await _supabaseAdmin
        .from('evaluations')
        .select('id, template_id, evaluated_id, completed_at')
        .eq('evaluator_id', user.id)
        .eq('period_id', period.id)
        .eq('status', 'completed');

      if (!userEvals || userEvals.length === 0) continue;

      // Get template names and evaluated users
      const tplIds = [...new Set(userEvals.map(ev => ev.template_id))];
      const evalIds = [...new Set(userEvals.map(ev => ev.evaluated_id))];

      const [{ data: templates }, { data: evaluated }] = await Promise.all([
        _supabaseAdmin.from('evaluation_templates').select('id, name').in('id', tplIds),
        _supabaseAdmin.from('users').select('id, full_name').in('id', evalIds),
      ]);

      const tplMap = Object.fromEntries((templates || []).map(t => [t.id, t.name]));
      const usrMap = Object.fromEntries((evaluated || []).map(u => [u.id, u.full_name]));

      const evaluationsForEmail = userEvals.map(ev => ({
        templateName: tplMap[ev.template_id] || 'Evaluación',
        evaluatedName: usrMap[ev.evaluated_id] || 'Desconocido',
        completedAt: ev.completed_at,
      }));

      // Render and send
      try {
        const { subject, fromEmail, html } = await renderEmail(_supabaseAdmin, {
          collaboratorName: user.full_name,
          evaluations: evaluationsForEmail,
        });

        const { data: sendResult, error: sendError } = await resend.emails.send({
          from: fromEmail || resendConfig.from_email || 'notificaciones@evalpro.udes.edu.co',
          to: [user.email],
          subject,
          html,
        });

        if (sendError) {
          errors.push({ user: user.email, error: sendError });
          continue;
        }

        // Log to notification_log
        await _supabaseAdmin.from('notification_log').insert({
          evaluator_id: user.id,
          evaluator_name: user.full_name,
          evaluator_email: user.email,
          period_id: period.id,
          resend_message_id: sendResult?.id || null,
          evaluations_count: userEvals.length,
          sent_at: new Date().toISOString(),
          source: 'auto',
          status: 'sent',
        });

        sentCount++;
      } catch (userErr) {
        errors.push({ user: user.email, error: userErr.message });
      }
    }

    return res.status(200).json({
      success: true,
      sent: sentCount,
      pending: needNotify.length - sentCount,
      errors: errors.length > 0 ? errors : undefined,
      message: `Notificaciones enviadas: ${sentCount} de ${needNotify.length}`,
    });

  } catch (err) {
    console.error('[auto-notify-cron Error]', err);
    return res.status(500).json({ error: err.message || 'Error interno' });
  }
}

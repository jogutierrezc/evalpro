import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { renderEmail } from './_email-renderer.mjs';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notificaciones@evalpro.udes.edu.co';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('[send-notification] Missing Supabase env vars — auth verification disabled.');
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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Set CORS headers on all responses
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY no configurado en variables de entorno.' });
  }

  // Verificar autenticación: el usuario debe ser admin
  try {
    if (_supabaseAdmin) {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'Token de autenticación requerido.' });
      }
      const { data: { user: authUser }, error: authError } = await _supabaseAdmin.auth.getUser(token);
      if (authError || !authUser) {
        return res.status(401).json({ error: 'Token de autenticación inválido.' });
      }
      // Verificar que el usuario tenga rol admin
      const { data: userData } = await _supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .maybeSingle();
      if (!userData || (userData.role !== 'admin')) {
        return res.status(403).json({ error: 'Solo los administradores pueden enviar notificaciones.' });
      }
    }
  } catch (authErr) {
    console.error('[Auth Error]', authErr);
    return res.status(500).json({ error: 'Error verificando autenticación.' });
  }

  try {
    const { collaboratorEmail, collaboratorName, evaluations } = req.body;

    if (!collaboratorEmail || !collaboratorName) {
      return res.status(400).json({ error: 'collaboratorEmail y collaboratorName son requeridos.' });
    }

    // Renderizar plantilla desde Supabase
    const { subject, fromEmail: resolvedFrom, html: htmlContent } = await renderEmail(_supabaseAdmin, {
      collaboratorName,
      evaluations: evaluations || [],
    });

    const finalFromEmail = FROM_EMAIL || resolvedFrom;

    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: finalFromEmail,
      to: [collaboratorEmail],
      subject: subject,
      html: htmlContent,
    });

    if (error) {
      console.error('[Resend Error]', error);
      return res.status(500).json({ error: 'Error al enviar el correo.', details: error });
    }

    // Registrar envío en notification_log
    try {
      if (_supabaseAdmin) {
        await _supabaseAdmin.from('notification_log').insert({
          evaluator_id: req.body.adminId || 'manual',
          evaluator_name: collaboratorName,
          evaluator_email: collaboratorEmail,
          resend_message_id: data?.id || null,
          evaluations_count: (evaluations || []).length,
          sent_at: new Date().toISOString(),
          source: 'manual',
          status: 'sent',
          metadata: {},
        });
      }
    } catch (logErr) {
      console.warn('[send-notification] Error logging:', logErr);
    }

    return res.status(200).json({
      success: true,
      message: `Correo enviado exitosamente a ${collaboratorEmail}`,
      data,
    });
  } catch (err) {
    console.error('[send-notification Error]', err);
    return res.status(500).json({ error: 'Error interno del servidor.', details: err.message || String(err) });
  }
}

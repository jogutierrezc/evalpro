/**
 * Resend Webhook — Receives events from Resend (email.delivered, email.opened, email.clicked)
 * and updates the notification_log table with tracking data.
 *
 * Configure in Resend Dashboard:
 *   Webhook URL: https://your-domain.vercel.app/api/resend-webhook
 *   Events: email.delivered, email.opened, email.clicked
 *
 * Resend sends: { type, data: { email_id, to, subject, created_at, ... } }
 */
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Verify Resend webhook signature */
function verifySignature(req, rawBody) {
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!signingSecret) {
    // If no secret configured, skip verification (dev mode - log warning)
    console.warn('[Resend Webhook] No RESEND_WEBHOOK_SECRET configured — signature verification DISABLED.');
    return true;
  }
  const signature = req.headers['svix-signature'] || req.headers['svix-signature-256'] || '';
  if (!signature) return false;
  // Simple HMAC verification
  const expected = createHmac('sha256', signingSecret).update(rawBody).digest('hex');
  const parts = signature.split(',').map(s => s.trim());
  return parts.some(p => p.includes(expected));
}

const _supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'evalpro-webhook' } },
    })
  : null;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }
  Object.entries(corsHeaders).forEach(([key, value]) => res.setHeader(key, value));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' });
  }

  if (!_supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase no configurado.' });
  }

  try {
    // Verify webhook signature
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString('utf-8');
    const event = JSON.parse(rawBody);

    if (!verifySignature(req, rawBody)) {
      console.warn('[Resend Webhook] Invalid signature - rejecting');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const eventType = event?.type || '';
    const eventData = event?.data || {};

    // Extract the Resend message ID from different event formats
    const messageId = eventData.email_id || eventData.id || '';

    if (!messageId) {
      return res.status(200).json({ received: true }); // Acknowledge but skip
    }

    console.log('[Resend Webhook] Event:', eventType, 'Message:', messageId);

    // Find the notification_log entry by resend_message_id
    const { data: logs } = await _supabaseAdmin
      .from('notification_log')
      .select('id, open_count, click_count')
      .eq('resend_message_id', messageId)
      .limit(1);

    const logEntry = logs?.[0];
    if (!logEntry) {
      console.warn('[Resend Webhook] No notification_log entry found for message:', messageId);
      return res.status(200).json({ received: true, matched: false });
    }

    // Update based on event type
    const updates = {};

    switch (eventType) {
      case 'email.delivered':
        updates.status = 'delivered';
        break;

      case 'email.opened':
        updates.status = 'opened';
        updates.opened_at = new Date().toISOString();
        updates.open_count = (logEntry.open_count || 0) + 1;
        break;

      case 'email.clicked':
        updates.status = 'clicked';
        updates.clicked_at = new Date().toISOString();
        updates.click_count = (logEntry.click_count || 0) + 1;
        // Also increment open count if not already tracked
        if (!logEntry.opened_at) {
          updates.opened_at = new Date().toISOString();
          updates.open_count = 1;
        }
        break;

      default:
        console.log('[Resend Webhook] Unhandled event type:', eventType);
        return res.status(200).json({ received: true, handled: false });
    }

    // Persist updates
    const { error: updateError } = await _supabaseAdmin
      .from('notification_log')
      .update(updates)
      .eq('id', logEntry.id);

    if (updateError) {
      console.error('[Resend Webhook] Error updating log:', updateError);
    }

    return res.status(200).json({
      received: true,
      matched: true,
      event: eventType,
      updates,
    });

  } catch (err) {
    console.error('[Resend Webhook Error]', err);
    // Always return 200 to acknowledge receipt (Resend will retry on non-200)
    return res.status(200).json({ received: true, error: err.message });
  }
}

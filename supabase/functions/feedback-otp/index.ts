// Edge Function: firma con OTP de las actas de retroalimentación.
//
// Acciones (POST JSON, campo "action"):
//   prepare    { actaId, userId }                 -> evaluador: crea el token del QR
//   send       { actaId, userId } | { token }     -> genera el OTP y lo envía por correo (evaluador o evaluado)
//   verify     { actaId, userId, code } | { token, code } -> verifica el OTP y registra la firma
//   public_get { token }                          -> resumen del acta para la página pública del evaluado
//
// El código nunca llega al navegador (salvo OTP_DEV_ECHO=true, solo para pruebas). En la base se guarda
// únicamente su hash SHA-256. Vigencia 5 min, 3 intentos y 30 s entre reenvíos.
//
// Secretos: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (automáticos).
// Correo, en este orden:
//   1. SMTP (Mailpit del servidor, que reenvía por Microsoft 365): SMTP_HOST, SMTP_PORT, SMTP_SECURE (none | ssl | starttls),
//      SMTP_USER, SMTP_PASS, y el remitente en SMTP_FROM, SMTP_ADMIN_EMAIL o SMTP_USER. Es la misma conexión que usa PDI.
//   (La plantilla del correo se edita en el módulo Correos: mail_templates, clave otp_firma.)
//   2. Si no hay SMTP_HOST: Resend, con RESEND_API_KEY o admin_settings.resend_config { api_key, from_email, enabled }.
// Trazabilidad: cada paso (portal abierto, código generado y enviado, correo abierto, intentos, verificación y firma) queda en
// mail_events con IP y dispositivo, y cada correo en mail_log. Con eso el administrador emite el certificado de firma en PDF.
// Despliegue: supabase functions deploy feedback-otp

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import nodemailer from 'npm:nodemailer@6.9.16';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const OTP_TTL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 1000;
const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_TRIES = 3;

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

function randomCode(): string {
  const a = new Uint32Array(1);
  do { crypto.getRandomValues(a); } while (a[0] >= 4294000000); // sin sesgo de módulo
  return String(a[0] % 1000000).padStart(6, '0');
}
function randomToken(len = 28): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const r = new Uint8Array(len);
  crypto.getRandomValues(r);
  return Array.from(r).map((b) => abc[b % abc.length]).join('');
}
const signId = () => {
  const r = new Uint8Array(4);
  crypto.getRandomValues(r);
  const h = hex(r.buffer).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
};
const mask = (email?: string | null) => {
  if (!email || !email.includes('@')) return null;
  const [u, d] = email.split('@');
  return `${u.slice(0, 1)}***@${d}`;
};

// Campos que se sellan con la firma (mismo conjunto que protege el trigger de la base).
async function contentHash(a: any): Promise<string> {
  const c = [a.oficina, a.numero, a.fecha, a.lugar, a.hora_inicio, a.hora_fin, a.objetivo, a.asistentes, a.tipo, a.seguimiento,
    a.agenda, a.desarrollo, a.convocatoria, a.compromisos, a.anexo, a.transcriptor, a.evaluator_id, a.evaluated_id, a.resultados ?? null];
  return sha256(JSON.stringify(c));
}

async function loadActa(id: string) {
  const { data, error } = await admin.from('feedback_actas').select('*').eq('id', id).maybeSingle();
  if (error || !data) throw new HttpError(404, 'Acta no encontrada.');
  return data;
}
async function loadUser(id: string) {
  const { data } = await admin.from('users').select('id, full_name, email').eq('id', id).maybeSingle();
  return data;
}

// Resuelve quién actúa: la persona evaluadora (por id) o la persona evaluada (por token del QR).
async function actor(body: any) {
  if (body.token) {
    const { data: t } = await admin.from('feedback_sign_tokens').select('acta_id, expires_at').eq('token', String(body.token)).maybeSingle();
    if (!t) throw new HttpError(404, 'El enlace de firma no es válido.');
    if (new Date(t.expires_at).getTime() < Date.now()) throw new HttpError(410, 'El enlace de firma venció. Pide a tu jefe que genere uno nuevo.');
    const acta = await loadActa(t.acta_id);
    return { acta, role: 'evaluado' as const, user: await loadUser(acta.evaluated_id) };
  }
  if (body.actaId && body.userId) {
    const acta = await loadActa(String(body.actaId));
    if (acta.evaluator_id !== body.userId) throw new HttpError(403, 'Solo la persona evaluadora puede firmar como evaluadora.');
    return { acta, role: 'evaluador' as const, user: await loadUser(acta.evaluator_id) };
  }
  throw new HttpError(400, 'Faltan datos de la solicitud.');
}

function missingFields(a: any): string[] {
  const m: string[] = [];
  if (!a.oficina?.trim()) m.push('oficina productora');
  if (!a.numero?.trim()) m.push('No. de acta');
  if (!a.fecha) m.push('fecha');
  if (!a.lugar?.trim()) m.push('lugar');
  if (!a.hora_inicio || !a.hora_fin) m.push('horas');
  if (!a.objetivo?.trim()) m.push('objetivo');
  if (!a.asistentes?.trim()) m.push('asistentes');
  if (!a.desarrollo?.trim()) m.push('desarrollo');
  const comps = Array.isArray(a.compromisos) ? a.compromisos : [];
  if (!comps.length || comps.some((c: any) => !c.act?.trim() || !c.resp?.trim() || !c.fecha)) m.push('compromisos completos');
  return m;
}

const PUBLIC_FN = (Deno.env.get('PUBLIC_FUNCTIONS_URL') || 'https://planeacion.udes.edu.co/3').replace(/\/+$/, '');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

function reqMeta(req: Request) {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return { ip: fwd || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || '', ua: (req.headers.get('user-agent') || '').slice(0, 400) };
}
type Meta = ReturnType<typeof reqMeta>;

// La trazabilidad nunca debe impedir una firma: si la tabla no existe o falla, el proceso sigue.
async function trace(type: string, o: { acta?: any; role?: string; logId?: string | null; meta?: Meta; data?: Record<string, unknown> }) {
  try {
    await admin.from('mail_events').insert({ type, acta_id: o.acta?.id ?? null, role: o.role ?? null, log_id: o.logId ?? null, ip: o.meta?.ip || null, user_agent: o.meta?.ua || null, meta: o.data ?? {} });
  } catch { /* sin trazabilidad */ }
}

const renderTpl = (tpl: string, vars: Record<string, string>, escape = true) =>
  tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, k) => (k in vars ? (escape ? esc(vars[k]) : vars[k]) : ''));

function withPixel(html: string, token?: string | null) {
  if (!token || !ANON) return html;
  const px = `<img src="${PUBLIC_FN}/functions/v1/correos?t=o&i=${token}&apikey=${ANON}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, px + '</body>') : html + px;
}

const esc = (t: string) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const env = (k: string) => (Deno.env.get(k) ?? '').trim();

/** Conexión SMTP a partir de las variables del servicio. null si no hay servidor configurado. */
function smtpConfig() {
  const host = env('SMTP_HOST');
  if (!host) return null;
  const port = Number(env('SMTP_PORT')) || 587;
  const modo = env('SMTP_SECURE').toLowerCase();
  const sinCifrado = ['none', 'ninguna', 'no', 'false', '0', 'plain'].includes(modo); // Mailpit, puerto 1025
  const ssl = modo ? ['ssl', 'tls', 'ssl/tls', 'true', '1', 'si', 'sí'].includes(modo) : port === 465;
  const from = [env('SMTP_FROM'), env('SMTP_ADMIN_EMAIL'), env('SMTP_USER')].find((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) ?? '';
  return { host, port, seguridad: sinCifrado ? 'none' : ssl ? 'ssl' : 'starttls', user: env('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') ?? '', from, nombre: env('SMTP_SENDER_NAME') || 'EvalPro UDES' };
}

function mailParts(name: string, numero: string, code: string, role: string) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const text = `Hola ${name},\n\nTu código para firmar el acta de retroalimentación ${numero} como ${role} es: ${spaced}\n\nVence en 5 minutos y solo sirve una vez. Si no estás firmando un acta, ignora este mensaje y no compartas el código.\n\nEvalPro UDES`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
   <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
    <tr><td style="padding:24px 28px 8px;font-size:18px;font-weight:600">Código para firmar el acta ${esc(numero)}</td></tr>
    <tr><td style="padding:0 28px;font-size:14px;color:#334155;line-height:1.55">Hola ${esc(name)}, usa este código para firmar el acta de retroalimentación como ${esc(role)}.</td></tr>
    <tr><td align="center" style="padding:20px 28px"><div style="display:inline-block;padding:14px 22px;border:1px solid #cbd5e1;border-radius:6px;font:600 30px ui-monospace,Menlo,Consolas,monospace;letter-spacing:6px">${spaced}</div></td></tr>
    <tr><td style="padding:0 28px 24px;font-size:12.5px;color:#64748b;line-height:1.5">Vence en 5 minutos y solo sirve una vez. Si no estás firmando un acta, ignora este mensaje y no compartas el código.</td></tr>
   </table></td></tr></table></body></html>`;
  return { text, html, subject: `Código de firma del acta ${numero}` };
}

/** El correo del código: la plantilla editable (mail_templates.otp_firma) si es válida; si no, la incluida en el código. */
async function buildMail(name: string, numero: string, code: string, role: string, token?: string | null) {
  const base = mailParts(name, numero, code, role);
  try {
    const { data: t } = await admin.from('mail_templates').select('subject, html').eq('key', 'otp_firma').maybeSingle();
    if (t?.html && /\{\{\s*codigo\s*\}\}/i.test(t.html)) {
      const vars = { nombre: name, acta: numero, rol: role, codigo: `${code.slice(0, 3)} ${code.slice(3)}`, vence_minutos: String(OTP_TTL_MS / 60000) };
      return { subject: renderTpl(t.subject || base.subject, vars, false), html: withPixel(renderTpl(t.html, vars), token), text: base.text };
    }
  } catch { /* usa la plantilla por defecto */ }
  return { ...base, html: withPixel(base.html, token) };
}

async function sendBySmtp(cfg: NonNullable<ReturnType<typeof smtpConfig>>, to: string, name: string, numero: string, code: string, role: string, token?: string | null): Promise<string> {
  if (!cfg.from) throw new HttpError(503, 'El envío de correos no está configurado (falta el remitente). Avisa al administrador.');
  const { text, html, subject } = await buildMail(name, numero, code, role, token);
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.seguridad === 'ssl',
    requireTLS: cfg.seguridad === 'starttls',
    ...(cfg.seguridad === 'none' ? { ignoreTLS: true } : {}),
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 25000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    const info: any = await Promise.race([
      transporter.sendMail({
        from: { name: cfg.nombre, address: cfg.from },
        to,
        subject,
        text,
        html,
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      }),
      new Promise((_, rej) => { reloj = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 30000); }),
    ]);
    return String(info?.messageId ?? '');
  } catch (e: any) {
    // Sin destinatario ni código en el registro: solo el tipo de falla.
    console.error('[feedback-otp] smtp', e?.code ?? '', e?.responseCode ?? '', String(e?.message ?? '').slice(0, 120));
    throw new HttpError(502, 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
  } finally {
    clearTimeout(reloj);
    try { transporter.close(); } catch { /* ya cerrado */ }
  }
}

async function sendByResend(to: string, name: string, numero: string, code: string, role: string, token?: string | null): Promise<string> {
  const { data: cfg } = await admin.from('admin_settings').select('value').eq('key', 'resend_config').maybeSingle();
  const apiKey = Deno.env.get('RESEND_API_KEY') || cfg?.value?.api_key;
  const from = Deno.env.get('RESEND_FROM_EMAIL') || cfg?.value?.from_email || 'notificaciones@evalpro.udes.edu.co';
  const enabled = cfg?.value?.enabled !== false;
  if (!apiKey || !enabled) throw new HttpError(503, 'El envío de correos no está configurado. Avisa al administrador.');
  const { html, subject } = await buildMail(name, numero, code, role, token);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!res.ok) {
    console.error('[feedback-otp] Resend error', res.status);
    throw new HttpError(502, 'No se pudo enviar el correo. Intenta de nuevo en unos minutos.');
  }
  return '';
}

async function sendEmail(to: string, name: string, numero: string, code: string, role: string, token?: string | null): Promise<string> {
  const smtp = smtpConfig();
  if (smtp) return sendBySmtp(smtp, to, name, numero, code, role, token);
  return sendByResend(to, name, numero, code, role, token);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const action = String(body.action || '');
    const meta = reqMeta(req);

    if (action === 'public_get') {
      const { acta, user } = await actor({ token: body.token });
      await trace('portal_open', { acta, role: 'evaluado', meta });
      const evaluator = await loadUser(acta.evaluator_id);
      return json({
        numero: acta.numero, fecha: acta.fecha, lugar: acta.lugar, hora_inicio: acta.hora_inicio, hora_fin: acta.hora_fin,
        objetivo: acta.objetivo, compromisos: acta.compromisos,
        evaluatorName: evaluator?.full_name ?? '', evaluatedName: user?.full_name ?? '', emailMask: mask(user?.email),
        evaluatedSigned: !!acta.evaluated_signed_at, evaluatedSignedAt: acta.evaluated_signed_at,
        evaluatorSigned: !!acta.evaluator_signed_at,
      });
    }

    const { acta, role, user } = await actor(body);

    if (action === 'prepare') {
      if (role !== 'evaluador') throw new HttpError(403, 'Acción no permitida.');
      const miss = missingFields(acta);
      if (miss.length) throw new HttpError(422, `Completa el acta antes de firmar. Falta: ${miss.join(', ')}.`);
      const { data: cur } = await admin.from('feedback_sign_tokens').select('token, expires_at').eq('acta_id', acta.id).maybeSingle();
      let token = cur?.token;
      if (!token || new Date(cur!.expires_at).getTime() < Date.now() + 60_000) {
        token = randomToken();
        const { error } = await admin.from('feedback_sign_tokens').upsert({ acta_id: acta.id, token, expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString() });
        if (error) throw new HttpError(500, 'No se pudo generar el enlace de firma.');
      }
      const evaluated = await loadUser(acta.evaluated_id);
      return json({ token, evaluatorEmail: mask(user?.email), evaluatedEmail: mask(evaluated?.email) });
    }

    if (action === 'send') {
      const signedAt = role === 'evaluador' ? acta.evaluator_signed_at : acta.evaluated_signed_at;
      if (signedAt) throw new HttpError(409, 'Ya firmaste esta acta.');
      const miss = missingFields(acta);
      if (miss.length) throw new HttpError(422, 'El acta no está completa.');
      if (!user?.email) throw new HttpError(422, 'Tu usuario no tiene correo registrado. Avisa al administrador.');

      const { data: prev } = await admin.from('feedback_otps').select('created_at').eq('acta_id', acta.id).eq('role', role).maybeSingle();
      if (prev) {
        const wait = COOLDOWN_MS - (Date.now() - new Date(prev.created_at).getTime());
        if (wait > 0) throw new HttpError(429, `Espera ${Math.ceil(wait / 1000)} s para pedir otro código.`, { retryAfter: Math.ceil(wait / 1000) });
      }
      const code = randomCode();
      const { error } = await admin.from('feedback_otps').upsert(
        { acta_id: acta.id, role, code_hash: await sha256(`${acta.id}:${role}:${code}`), expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(), attempts: 0, created_at: new Date().toISOString() },
        { onConflict: 'acta_id,role' },
      );
      if (error) throw new HttpError(500, 'No se pudo generar el código.');

      const echo = Deno.env.get('OTP_DEV_ECHO') === 'true';
      // Bitácora del correo: su token identifica la apertura (imagen de rastreo) en el correo que llega a la persona.
      const { data: logRow } = await admin.from('mail_log').insert({
        kind: 'otp', template_key: 'otp_firma', to_email: user.email, to_name: user.full_name, user_id: user.id, acta_id: acta.id, role,
        subject: `Código de firma del acta ${acta.numero}`, status: 'sending',
      }).select('id, token').maybeSingle();
      await trace('otp_generated', { acta, role, logId: logRow?.id, meta, data: { vigenciaSeg: OTP_TTL_MS / 1000 } });
      if (!echo) {
        try {
          const messageId = await sendEmail(user.email, user.full_name, acta.numero, code, role === 'evaluador' ? 'persona evaluadora' : 'persona evaluada', logRow?.token);
          if (logRow) await admin.from('mail_log').update({ status: 'sent', sent_at: new Date().toISOString(), message_id: messageId || null }).eq('id', logRow.id);
          await trace('otp_sent', { acta, role, logId: logRow?.id, meta, data: { destino: mask(user.email) } });
        } catch (e) {
          // Si el correo no salió, el código no sirve: se borra para poder pedir otro sin esperar el reenvío.
          await admin.from('feedback_otps').delete().eq('acta_id', acta.id).eq('role', role);
          if (logRow) await admin.from('mail_log').update({ status: 'failed', error: 'No se pudo entregar al servidor de correo' }).eq('id', logRow.id);
          await trace('failed', { acta, role, logId: logRow?.id, meta });
          throw e;
        }
      }
      return json({ sent: true, to: mask(user.email), expiresInSec: OTP_TTL_MS / 1000, ...(echo ? { devCode: code } : {}) });
    }

    if (action === 'verify') {
      const code = String(body.code || '').replace(/\D/g, '');
      if (code.length !== 6) throw new HttpError(400, 'Escribe los 6 dígitos del código.');
      const { data: otp } = await admin.from('feedback_otps').select('*').eq('acta_id', acta.id).eq('role', role).maybeSingle();
      if (!otp) throw new HttpError(400, 'Pide un código para firmar.');
      if (new Date(otp.expires_at).getTime() < Date.now()) {
        await trace('otp_expired', { acta, role, meta });
        throw new HttpError(410, 'El código venció. Pide uno nuevo.', { expired: true });
      }
      if (otp.attempts >= MAX_TRIES) {
        await trace('otp_failed', { acta, role, meta, data: { bloqueado: true } });
        throw new HttpError(429, 'Demasiados intentos. Pide un código nuevo.', { locked: true });
      }

      if ((await sha256(`${acta.id}:${role}:${code}`)) !== otp.code_hash) {
        const attempts = otp.attempts + 1;
        await admin.from('feedback_otps').update({ attempts }).eq('id', otp.id);
        const left = MAX_TRIES - attempts;
        await trace('otp_failed', { acta, role, meta, data: { intento: attempts, restantes: left } });
        throw new HttpError(400, left > 0 ? `El código no coincide. Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'}.` : 'Demasiados intentos. Pide un código nuevo.', { remaining: left, locked: left <= 0 });
      }

      // Firma válida: una sola vez. El trigger de la base permite escribir firmas al service role.
      await trace('otp_verified', { acta, role, meta });
      await admin.from('feedback_otps').delete().eq('id', otp.id);
      const now = new Date().toISOString();
      const id = signId();
      const patch: Record<string, unknown> = role === 'evaluador'
        ? { evaluator_signed_at: now, evaluator_sign_id: id }
        : { evaluated_signed_at: now, evaluated_sign_id: id };
      patch.content_hash = await contentHash(acta);
      const { error } = await admin.from('feedback_actas').update(patch).eq('id', acta.id);
      if (error) throw new HttpError(500, 'No se pudo registrar la firma.');
      await trace('sign_completed', { acta, role, meta, data: { firmaId: id, huella: patch.content_hash, firmadoEn: now } });
      const both = role === 'evaluador' ? !!acta.evaluated_signed_at : !!acta.evaluator_signed_at;
      return json({ ok: true, signedAt: now, signId: id, finished: both, hash: patch.content_hash });
    }

    throw new HttpError(400, 'Acción no reconocida.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('[feedback-otp]', e);
    return json({ error: 'Error interno al procesar la firma.' }, 500);
  }
});

// Edge Function: módulo Correos de EvalPro (solo administración).
//
// Acciones (POST JSON con { action, adminId, adminIdentification, ... }):
//   bootstrap, templates_list, template_save, template_create, template_delete, template_reset, settings_save,
//   audience_preview, campaign_create, campaign_start, campaign_pause, campaign_resume, campaign_cancel, campaign_send_batch,
//   campaigns_list, log_list, log_detail, send_test,
//   otp_trace_list, otp_trace_detail, cert_list, cert_generate, cert_download, cert_revoke
// Públicas:
//   POST { action: 'cert_verify', code }          -> comprobación de un certificado
//   GET  ?t=o&i=<token>                           -> imagen de rastreo (apertura del correo)
//   GET  ?t=c&i=<token>&u=<url>                   -> clic registrado y redirección (solo dominios de la universidad)
//
// Los envíos masivos los orquesta el navegador por lotes (campaign_send_batch) para respetar el límite por minuto del
// buzón de Microsoft 365 que usa Mailpit para reenviar: así ningún lote excede el tiempo de la función y se puede pausar.
//
// Variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (automáticas), SMTP_* (Mailpit),
//   PUBLIC_FUNCTIONS_URL (https://planeacion.udes.edu.co/3), APP_PUBLIC_URL (https://planeacion.udes.edu.co/evalpro/).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';
import nodemailer from 'npm:nodemailer@6.9.16';
import { construirCertificado, type CertData } from './certificado.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) { super(message); }
}

const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } });
const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const PUBLIC_FN = (env('PUBLIC_FUNCTIONS_URL') || 'https://planeacion.udes.edu.co/3').replace(/\/+$/, '');
const APP_URL = (env('APP_PUBLIC_URL') || 'https://planeacion.udes.edu.co/evalpro/').replace(/\/*$/, '/');
const ANON = env('SUPABASE_ANON_KEY');
/** Las URL firmadas salen con el host interno (supabase-kong:8000); se reescriben al origen público. */
const publicStorageUrl = (u?: string | null) => { if (!u) return null; const i = u.indexOf('/storage/v1/'); return i < 0 ? u : PUBLIC_FN + u.slice(i); };
const TRACK = `${PUBLIC_FN}/functions/v1/correos`;
const ADMIN_ROLES = ['admin', 'administrador', 'superadmin'];
const INSTITUCION = 'Universidad de Santander';

/* ---------- utilidades ---------- */

const esc = (t: string) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const unesc = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(b instanceof Uint8Array ? b : new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (data: Uint8Array | string) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? new TextEncoder().encode(data) : data));
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const clamp = (n: unknown, lo: number, hi: number, def: number) => { const v = Number(n); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def; };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso?: string | null) => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${y}`; };
/** Inicio del día actual en Colombia (UTC-5, sin horario de verano), como ISO. */
const inicioDiaColombia = () => { const d = new Date(Date.now() - 5 * 3600e3); d.setUTCHours(0, 0, 0, 0); return new Date(d.getTime() + 5 * 3600e3).toISOString(); };

function reqMeta(req: Request) {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return { ip: fwd || req.headers.get('x-real-ip') || '', ua: (req.headers.get('user-agent') || '').slice(0, 400) };
}

/** Quien llama debe ser administrador: id y cédula deben coincidir con un usuario de rol administrador. */
async function requireAdmin(b: any) {
  const id = str(b.adminId, 60);
  const ident = str(b.adminIdentification, 40);
  if (!id || !ident) throw new HttpError(401, 'Sesión no válida.');
  const { data: u } = await admin.from('users').select('id, full_name, email, role, identification').eq('id', id).maybeSingle();
  if (!u || u.identification !== ident || !ADMIN_ROLES.includes(String(u.role || '').toLowerCase())) throw new HttpError(403, 'Este módulo es solo para administración.');
  return u as { id: string; full_name: string; email: string | null; role: string; identification: string };
}

/* ---------- plantillas ---------- */

/** Reemplaza {{variable}}. Los valores se escapan; {{mensaje}} conserva los saltos de línea. */
function render(tpl: string, vars: Record<string, string>, html = true): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = vars[k] ?? '';
    if (!html) return v;
    return k === 'mensaje' ? esc(v).replace(/\r?\n/g, '<br>') : esc(v);
  });
}

function validateTemplate(key: string, subject: string, html: string) {
  if (!subject.trim()) throw new HttpError(400, 'El asunto no puede estar vacío.');
  if (subject.length > 200) throw new HttpError(400, 'El asunto es demasiado largo.');
  if (!html.trim()) throw new HttpError(400, 'El HTML no puede estar vacío.');
  if (html.length > 150_000) throw new HttpError(400, 'El HTML supera los 150 KB.');
  if (/<script[\s>]/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) throw new HttpError(400, 'El HTML no puede incluir scripts ni eventos (los clientes de correo los bloquean).');
  if (key === 'firma_invitacion' && !(/\{\{\s*codigo\s*\}\}/i.test(html) && /\{\{\s*enlace\s*\}\}/i.test(html))) throw new HttpError(400, 'La plantilla de invitación a firmar debe incluir las variables {{codigo}} y {{enlace}}.');
  if (key === 'otp_firma' && !/\{\{\s*codigo\s*\}\}/i.test(html)) throw new HttpError(400, 'La plantilla del código OTP debe incluir la variable {{codigo}}.');
}

/* ---------- envío SMTP (Mailpit) ---------- */

function smtpConfig() {
  const host = env('SMTP_HOST');
  if (!host) return null;
  const port = Number(env('SMTP_PORT')) || 587;
  const modo = env('SMTP_SECURE').toLowerCase();
  const sinCifrado = ['none', 'ninguna', 'no', 'false', '0', 'plain'].includes(modo);
  const ssl = modo ? ['ssl', 'tls', 'ssl/tls', 'true', '1', 'si', 'sí'].includes(modo) : port === 465;
  const from = [env('SMTP_FROM'), env('SMTP_ADMIN_EMAIL'), env('SMTP_USER')].find((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) ?? '';
  return { host, port, seguridad: sinCifrado ? 'none' : ssl ? 'ssl' : 'starttls', user: env('SMTP_USER'), pass: Deno.env.get('SMTP_PASS') ?? '', from, nombre: env('SMTP_SENDER_NAME') || 'EvalPro UDES' };
}

function transporterOf(cfg: NonNullable<ReturnType<typeof smtpConfig>>) {
  return nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.seguridad === 'ssl', requireTLS: cfg.seguridad === 'starttls',
    ...(cfg.seguridad === 'none' ? { ignoreTLS: true } : {}),
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass } } : {}),
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 25000, disableFileAccess: true, disableUrlAccess: true, logger: false,
  });
}

const textOf = (html: string) => html.replace(/<(style|head)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|tr|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(unescRe, (m) => unesc(m)).replace(/\n{3,}/g, '\n\n').trim();
const unescRe = /&(amp|quot|#39|lt|gt);/g;

function allowedRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) && (u.hostname === 'udes.edu.co' || u.hostname.endsWith('.udes.edu.co'));
  } catch { return false; }
}

/** Agrega el rastreo: imagen de apertura y enlaces propios de la universidad pasan por la función para contar el clic. */
function instrument(html: string, token: string): string {
  const withLinks = html.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url: string) =>
    allowedRedirect(unesc(url)) ? `href="${TRACK}?t=c&i=${token}&u=${encodeURIComponent(unesc(url))}&apikey=${ANON}"` : m);
  const px = `<img src="${TRACK}?t=o&i=${token}&apikey=${ANON}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">`;
  return /<\/body>/i.test(withLinks) ? withLinks.replace(/<\/body>/i, px + '</body>') : withLinks + px;
}

async function deliver(transporter: ReturnType<typeof transporterOf>, cfg: NonNullable<ReturnType<typeof smtpConfig>>, to: string, subject: string, html: string): Promise<string> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  try {
    const info: any = await Promise.race([
      transporter.sendMail({
        from: { name: cfg.nombre, address: cfg.from }, to, subject, html, text: textOf(html),
        headers: { 'Auto-Submitted': 'auto-generated', 'X-Auto-Response-Suppress': 'All' },
      }),
      new Promise((_, rej) => { reloj = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })), 30000); }),
    ]);
    return String(info?.messageId ?? '');
  } finally { clearTimeout(reloj); }
}

const errText = (e: any) => `${e?.code ?? 'ERROR'}${e?.responseCode ? ' ' + e.responseCode : ''}: ${String(e?.message ?? '').slice(0, 140)}`;

/* ---------- ajustes ---------- */

async function getSetting<T>(key: string, def: T): Promise<T> {
  const { data } = await admin.from('mail_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as T) ?? def;
}
const getLimits = async () => {
  const l = await getSetting<{ per_minute: number; daily_cap: number }>('limits', { per_minute: 20, daily_cap: 1500 });
  return { per_minute: clamp(l.per_minute, 1, 30, 20), daily_cap: clamp(l.daily_cap, 10, 9000, 1500) };
};
const sentToday = async () => {
  const { count } = await admin.from('mail_log').select('id', { count: 'exact', head: true }).in('kind', ['campaign', 'test']).eq('status', 'sent').gte('sent_at', inicioDiaColombia());
  return count ?? 0;
};

/* ---------- audiencia ---------- */

interface Audience { periodId?: string | null; scope?: string; campus?: string; officeId?: string | null; role?: string }
type Person = { user_id: string; full_name: string; email: string; office: string; campus: string; role: string; pendientes: number; total: number };

async function resolveAudience(a: Audience): Promise<Person[]> {
  const scope = ['asignadas', 'pendientes', 'todos'].includes(String(a.scope)) ? String(a.scope) : 'asignadas';
  if (scope !== 'todos' && !a.periodId) throw new HttpError(400, 'Elige el periodo para esta audiencia.');
  const out: Person[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await admin.rpc('mail_audience', {
      p_period: a.periodId || null, p_scope: scope, p_campus: a.campus || null, p_office: a.officeId || null, p_role: a.role || null,
    }).range(from, from + 999);
    if (error) throw new HttpError(500, 'No se pudo calcular la audiencia. ¿Está aplicada la migración del módulo Correos?');
    out.push(...((data as Person[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.email) ? false : (seen.add(p.email), true)));
}

/* ---------- acciones ---------- */

async function bootstrap() {
  const [per, usr, off, limits, legal, cnt] = await Promise.all([
    admin.from('evaluation_periods').select('id, year, start_date, end_date, is_active').order('start_date', { ascending: false }),
    admin.from('users').select('campus, role').not('email', 'is', null).limit(5000),
    admin.from('offices').select('id, name').order('name'),
    getLimits(),
    getSetting<{ text: string }>('certificate_legal', { text: '' }),
    sentToday(),
  ]);
  const smtp = smtpConfig();
  const campuses = Array.from(new Set((usr.data ?? []).map((u: any) => u.campus).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'es'));
  const roles = Array.from(new Set((usr.data ?? []).map((u: any) => u.role).filter(Boolean))).sort((a: any, b: any) => a.localeCompare(b, 'es'));
  return {
    periods: per.data ?? [], campuses, roles, offices: off.data ?? [], limits, legalText: legal.text ?? '', sentToday: cnt,
    mail: { configured: !!smtp?.host && !!smtp?.from, host: smtp?.host ?? '', from: smtp?.from ?? '', senderName: smtp?.nombre ?? '' },
    urls: { tracking: TRACK, app: APP_URL },
  };
}

function varsFor(p: Person, ctx: { periodo: string; fechaLimite: string; mensaje: string }) {
  return {
    nombre: titleCase(p.full_name || ''), correo: p.email, oficina: p.office, periodo: ctx.periodo, fecha_limite: ctx.fechaLimite,
    total: String(p.total), pendientes: String(p.pendientes), evaluaciones_texto: p.total === 1 ? 'evaluación' : 'evaluaciones',
    enlace: APP_URL, mensaje: ctx.mensaje,
  };
}

async function campaignCreate(b: any, who: { id: string }) {
  const name = str(b.name, 120);
  if (!name) throw new HttpError(400, 'Ponle un nombre al envío.');
  const { data: tpl } = await admin.from('mail_templates').select('key, subject, html').eq('key', String(b.templateKey)).maybeSingle();
  if (!tpl) throw new HttpError(404, 'La plantilla no existe.');
  const subject = str(b.subject, 200) || tpl.subject;
  validateTemplate(tpl.key, subject, String(b.html || tpl.html));
  const aud: Audience = b.audience ?? {};
  const people = await resolveAudience(aud);
  if (!people.length) throw new HttpError(422, 'La audiencia no tiene destinatarios con correo.');
  if (people.length > 3000) throw new HttpError(422, 'Un envío admite hasta 3000 destinatarios. Divide la audiencia con los filtros.');
  const limits = await getLimits();
  const perMinute = clamp(b.perMinute, 1, 30, limits.per_minute);

  let periodo = 'periodo vigente', fechaLimite = '';
  if (aud.periodId) {
    const { data: p } = await admin.from('evaluation_periods').select('year, end_date').eq('id', aud.periodId).maybeSingle();
    if (p) { periodo = `periodo ${p.year}`; fechaLimite = fechaLarga(p.end_date); }
  }
  const mensaje = String(b.message ?? '').slice(0, 4000);

  const { data: camp, error } = await admin.from('mail_campaigns').insert({
    name, template_key: tpl.key, subject, html: String(b.html || tpl.html), message: mensaje, audience: aud,
    status: 'draft', total: people.length, per_minute: perMinute, created_by: who.id,
  }).select('id').single();
  if (error || !camp) throw new HttpError(500, 'No se pudo crear el envío.');

  for (const part of chunk(people, 400)) {
    const rows = part.map((p) => {
      const vars = varsFor(p, { periodo, fechaLimite, mensaje });
      return { kind: 'campaign', campaign_id: camp.id, template_key: tpl.key, to_email: p.email, to_name: vars.nombre, user_id: p.user_id, subject: render(subject, vars, false), vars, created_by: who.id };
    });
    const { error: e2 } = await admin.from('mail_log').insert(rows);
    if (e2) { await admin.from('mail_campaigns').delete().eq('id', camp.id); throw new HttpError(500, 'No se pudo preparar la cola de correos.'); }
  }
  return { id: camp.id, total: people.length, perMinute };
}

async function setCampaignStatus(id: string, to: 'sending' | 'paused' | 'canceled') {
  const { data: c } = await admin.from('mail_campaigns').select('id, status').eq('id', id).maybeSingle();
  if (!c) throw new HttpError(404, 'El envío no existe.');
  if (['done', 'canceled'].includes(c.status)) throw new HttpError(409, 'Este envío ya terminó.');
  const patch: Record<string, unknown> = { status: to };
  if (to === 'sending') {
    patch.started_at = new Date().toISOString();
    // Si una tanda se interrumpió, sus correos quedaron "en proceso": vuelven a la cola.
    await admin.from('mail_log').update({ status: 'queued' }).eq('campaign_id', id).eq('status', 'sending');
  }
  if (to === 'canceled') {
    patch.finished_at = new Date().toISOString();
    await admin.from('mail_log').update({ status: 'canceled' }).eq('campaign_id', id).in('status', ['queued', 'sending']);
  }
  await admin.from('mail_campaigns').update(patch).eq('id', id);
  return { status: to };
}

async function campaignSendBatch(b: any) {
  const id = String(b.id || '');
  const { data: camp } = await admin.from('mail_campaigns').select('*').eq('id', id).maybeSingle();
  if (!camp) throw new HttpError(404, 'El envío no existe.');
  const remainingOf = async () => (await admin.from('mail_log').select('id', { count: 'exact', head: true }).eq('campaign_id', id).in('status', ['queued', 'sending'])).count ?? 0;
  if (camp.status !== 'sending') return { status: camp.status, sent: 0, failed: 0, remaining: await remainingOf(), waitMs: 0 };

  const smtp = smtpConfig();
  if (!smtp || !smtp.from) throw new HttpError(503, 'El servidor de correo no está configurado (variables SMTP).');
  const limits = await getLimits();
  const today = await sentToday();
  if (today >= limits.daily_cap) {
    await admin.from('mail_campaigns').update({ status: 'paused' }).eq('id', id);
    return { status: 'paused', reason: 'cap', sent: 0, failed: 0, remaining: await remainingOf(), waitMs: 0, dailyCap: limits.daily_cap };
  }
  const size = Math.min(clamp(b.size, 1, 15, 10), limits.daily_cap - today);
  const { data: rows, error } = await admin.rpc('mail_claim', { p_campaign: id, p_n: size });
  if (error) throw new HttpError(500, 'No se pudo tomar el siguiente lote.');

  const t0 = Date.now();
  const transporter = transporterOf(smtp);
  let sent = 0, failed = 0, streak = 0;
  try {
    for (const r of (rows ?? []) as any[]) {
      try {
        const html = instrument(render(camp.html, r.vars ?? {}), r.token);
        const messageId = await deliver(transporter, smtp, r.to_email, r.subject, html);
        await admin.from('mail_log').update({ status: 'sent', sent_at: new Date().toISOString(), message_id: messageId || null, error: null }).eq('id', r.id);
        await admin.from('mail_events').insert({ log_id: r.id, type: 'sent' });
        sent++; streak = 0;
      } catch (e) {
        await admin.from('mail_log').update({ status: 'failed', error: errText(e) }).eq('id', r.id);
        await admin.from('mail_events').insert({ log_id: r.id, type: 'failed', meta: { error: errText(e) } });
        failed++; streak++;
        if (streak >= 3) break; // el servidor de correo está fallando: no seguir intentando
      }
    }
  } finally { try { transporter.close(); } catch { /* cerrado */ } }

  // Los que no se alcanzaron a enviar por el corte vuelven a la cola.
  if (streak >= 3) await admin.from('mail_log').update({ status: 'queued' }).eq('campaign_id', id).eq('status', 'sending');
  let status = camp.status as string;
  let reason: string | undefined;
  if (streak >= 3) { status = 'paused'; reason = 'smtp'; await admin.from('mail_campaigns').update({ status }).eq('id', id); }
  const remaining = await remainingOf();
  if (remaining === 0 && status === 'sending') { status = 'done'; await admin.from('mail_campaigns').update({ status, finished_at: new Date().toISOString() }).eq('id', id); }

  const handled = ((rows ?? []) as any[]).length;
  const waitMs = Math.max(0, Math.round((handled * 60000) / camp.per_minute - (Date.now() - t0)));
  return { status, reason, sent, failed, remaining, waitMs };
}

async function campaignsList() {
  const { data: camps } = await admin.from('mail_campaigns').select('id, name, template_key, subject, status, total, per_minute, created_at, started_at, finished_at, audience').order('created_at', { ascending: false }).limit(60);
  const ids = (camps ?? []).map((c: any) => c.id);
  const stats: Record<string, any> = {};
  if (ids.length) {
    const { data: logs } = await admin.from('mail_log').select('campaign_id, status, open_count, click_count').in('campaign_id', ids).limit(20000);
    for (const l of (logs ?? []) as any[]) {
      const s = (stats[l.campaign_id] ??= { sent: 0, failed: 0, queued: 0, opened: 0, clicked: 0 });
      if (l.status === 'sent') s.sent++; else if (l.status === 'failed') s.failed++; else if (l.status === 'queued' || l.status === 'sending') s.queued++;
      if (l.open_count > 0) s.opened++;
      if (l.click_count > 0) s.clicked++;
    }
  }
  return { campaigns: (camps ?? []).map((c: any) => ({ ...c, stats: stats[c.id] ?? { sent: 0, failed: 0, queued: 0, opened: 0, clicked: 0 } })) };
}

function applyLogFilters(q: any, f: any) {
  if (f.kind) q = q.eq('kind', String(f.kind));
  if (f.campaignId) q = q.eq('campaign_id', String(f.campaignId));
  if (f.status) q = q.eq('status', String(f.status));
  if (f.opened === 'yes') q = q.gt('open_count', 0);
  if (f.opened === 'no') q = q.eq('open_count', 0);
  if (f.from) q = q.gte('queued_at', `${String(f.from).slice(0, 10)}T00:00:00-05:00`);
  if (f.to) q = q.lte('queued_at', `${String(f.to).slice(0, 10)}T23:59:59-05:00`);
  if (f.q) { const t = String(f.q).trim().replace(/[%,()]/g, '').slice(0, 80); if (t) q = q.or(`to_email.ilike.%${t}%,to_name.ilike.%${t}%,subject.ilike.%${t}%`); }
  return q;
}

async function logList(b: any) {
  const f = b.filters ?? {};
  const size = clamp(b.pageSize, 10, 100, 25);
  const page = clamp(b.page, 0, 100000, 0);
  const cols = 'id, kind, campaign_id, template_key, to_email, to_name, acta_id, role, subject, status, error, queued_at, sent_at, first_open_at, last_open_at, open_count, first_click_at, click_count';
  const { data, count, error } = await applyLogFilters(admin.from('mail_log').select(cols, { count: 'exact' }), f).order('queued_at', { ascending: false }).range(page * size, page * size + size - 1);
  if (error) throw new HttpError(500, 'No se pudo leer la bitácora.');
  const base = { ...f, status: '', opened: '' };
  const count1 = async (extra: (q: any) => any) => (await extra(applyLogFilters(admin.from('mail_log').select('id', { count: 'exact', head: true }), base))).count ?? 0;
  const [total, sent, failed, queued, opened, clicked] = await Promise.all([
    count1((q) => q), count1((q) => q.eq('status', 'sent')), count1((q) => q.eq('status', 'failed')), count1((q) => q.in('status', ['queued', 'sending'])),
    count1((q) => q.gt('open_count', 0)), count1((q) => q.gt('click_count', 0)),
  ]);
  return { rows: data ?? [], total: count ?? 0, summary: { total, sent, failed, queued, opened, clicked } };
}

async function logDetail(b: any) {
  const { data: row } = await admin.from('mail_log').select('id, kind, campaign_id, template_key, to_email, to_name, acta_id, role, subject, status, error, message_id, queued_at, sent_at, first_open_at, last_open_at, open_count, first_click_at, click_count').eq('id', String(b.id)).maybeSingle();
  if (!row) throw new HttpError(404, 'El registro no existe.');
  const { data: events } = await admin.from('mail_events').select('id, type, at, ip, user_agent, meta').eq('log_id', row.id).order('at');
  return { row, events: events ?? [] };
}

async function sendTest(b: any, who: { id: string; email: string | null }) {
  const smtp = smtpConfig();
  if (!smtp || !smtp.from) throw new HttpError(503, 'El servidor de correo no está configurado (variables SMTP).');
  const to = str(b.to, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, 'Escribe un correo válido.');
  // Sin reenvío abierto: solo a un correo registrado en EvalPro o al del propio administrador.
  const { data: u } = await admin.from('users').select('id, full_name').ilike('email', to).limit(1).maybeSingle();
  if (!u && to !== (who.email || '').toLowerCase()) throw new HttpError(422, 'Las pruebas solo pueden enviarse a un correo registrado en EvalPro.');
  const html = String(b.html || '');
  const subject = str(b.subject, 200);
  validateTemplate(String(b.templateKey || 'prueba'), subject || 'x', html);
  const vars = { nombre: titleCase(u?.full_name || 'Persona de prueba'), correo: to, oficina: 'Oficina de ejemplo', periodo: `periodo ${new Date().getFullYear()}`, fecha_limite: fechaLarga(new Date().toISOString()), total: '3', pendientes: '2', evaluaciones_texto: 'evaluaciones', enlace: APP_URL, mensaje: str(b.message, 4000) || 'Este es un mensaje de ejemplo.', acta: '014-2026', rol: 'persona evaluada', codigo: '123 456', vence_minutos: '5' };
  const { data: log } = await admin.from('mail_log').insert({ kind: 'test', template_key: String(b.templateKey || '') || null, to_email: to, to_name: vars.nombre, user_id: u?.id ?? null, subject: `[Prueba] ${render(subject, vars, false)}`, status: 'sending', created_by: who.id }).select('id, token').single();
  const transporter = transporterOf(smtp);
  try {
    const messageId = await deliver(transporter, smtp, to, `[Prueba] ${render(subject, vars, false)}`, instrument(render(html, vars), log!.token));
    await admin.from('mail_log').update({ status: 'sent', sent_at: new Date().toISOString(), message_id: messageId || null }).eq('id', log!.id);
    await admin.from('mail_events').insert({ log_id: log!.id, type: 'sent' });
    return { sent: true, to };
  } catch (e) {
    await admin.from('mail_log').update({ status: 'failed', error: errText(e) }).eq('id', log!.id);
    await admin.from('mail_events').insert({ log_id: log!.id, type: 'failed', meta: { error: errText(e) } });
    throw new HttpError(502, 'No se pudo enviar la prueba. Revisa el servidor de correo.');
  } finally { try { transporter.close(); } catch { /* cerrado */ } }
}

/* ---------- trazabilidad OTP y certificados ---------- */

const ROLE_LABEL: Record<string, string> = { evaluador: 'Persona evaluadora', evaluado: 'Persona evaluada' };
const OTP_TYPES = ['portal_open', 'otp_generated', 'otp_sent', 'open', 'otp_failed', 'otp_expired', 'otp_verified', 'sign_completed', 'failed'];

function etiqueta(type: string, meta: any): string {
  switch (type) {
    case 'portal_open': return 'Portal de firma abierto (lectura del QR o del enlace)';
    case 'otp_generated': return 'Código OTP generado';
    case 'otp_sent': return 'Código OTP enviado por correo';
    case 'open': return 'Correo con el código abierto';
    case 'otp_failed': return meta?.bloqueado ? 'Intento bloqueado por exceso de errores' : `Intento con código incorrecto (quedan ${meta?.restantes ?? '?'})`;
    case 'otp_expired': return 'Intento con código vencido';
    case 'otp_verified': return 'Código OTP verificado';
    case 'sign_completed': return `Firma registrada (ID ${meta?.firmaId ?? '-'})`;
    case 'failed': return 'Fallo al entregar el correo';
    default: return type;
  }
}

async function peopleOf(ids: string[]) {
  const map: Record<string, any> = {};
  if (!ids.length) return map;
  const { data: roles } = await admin.from('roles').select('id, key, label');
  const byId: Record<string, string> = {}, byKey: Record<string, string> = {};
  (roles ?? []).forEach((r: any) => { byId[r.id] = r.label; byKey[r.key] = r.label; });
  for (const part of chunk(ids, 100)) {
    const { data } = await admin.from('users').select('id, full_name, email, role, role_id').in('id', part);
    (data ?? []).forEach((u: any) => { map[u.id] = { nombre: u.full_name, email: u.email, cargo: (u.role_id && byId[u.role_id]) || byKey[u.role] || String(u.role || '').replace(/_/g, ' ') }; });
  }
  return map;
}

async function otpTraceList() {
  const { data: ev } = await admin.from('mail_events').select('acta_id').not('acta_id', 'is', null).in('type', OTP_TYPES).order('at', { ascending: false }).limit(3000);
  const ids = new Set<string>((ev ?? []).map((e: any) => e.acta_id));
  const { data: signed } = await admin.from('feedback_actas').select('id').or('evaluator_signed_at.not.is.null,evaluated_signed_at.not.is.null').limit(500);
  (signed ?? []).forEach((a: any) => ids.add(a.id));
  const list = Array.from(ids).slice(0, 400);
  if (!list.length) return { rows: [] };
  const actas: any[] = [];
  for (const part of chunk(list, 80)) {
    const { data } = await admin.from('feedback_actas').select('id, numero, oficina, fecha, evaluator_id, evaluated_id, evaluator_signed_at, evaluated_signed_at, content_hash, updated_at').in('id', part);
    actas.push(...(data ?? []));
  }
  const people = await peopleOf(Array.from(new Set(actas.flatMap((a) => [a.evaluator_id, a.evaluated_id]))));
  const counts: Record<string, Record<string, number>> = {};
  const lastAt: Record<string, string> = {};
  for (const part of chunk(list, 80)) {
    const { data } = await admin.from('mail_events').select('acta_id, role, type, at').in('acta_id', part).in('type', OTP_TYPES).limit(10000);
    for (const e of (data ?? []) as any[]) {
      const k = `${e.role || '-'}:${e.type}`;
      ((counts[e.acta_id] ??= {})[k] = (counts[e.acta_id][k] ?? 0) + 1);
      if (!lastAt[e.acta_id] || e.at > lastAt[e.acta_id]) lastAt[e.acta_id] = e.at;
    }
  }
  const { data: certs } = await admin.from('sign_certificates').select('id, acta_id, number, version, status, generated_at').in('acta_id', list).order('generated_at', { ascending: false });
  const certBy: Record<string, any[]> = {};
  (certs ?? []).forEach((c: any) => (certBy[c.acta_id] ??= []).push(c));
  const rows = actas.map((a) => ({
    id: a.id, numero: a.numero, oficina: a.oficina, fecha: a.fecha, contentHash: a.content_hash,
    evaluador: { ...people[a.evaluator_id], signedAt: a.evaluator_signed_at }, evaluado: { ...people[a.evaluated_id], signedAt: a.evaluated_signed_at },
    counts: counts[a.id] ?? {}, lastAt: lastAt[a.id] ?? a.updated_at, certificates: certBy[a.id] ?? [],
  })).sort((x, y) => String(y.lastAt).localeCompare(String(x.lastAt)));
  return { rows };
}

async function loadActaFull(actaId: string) {
  const { data: a } = await admin.from('feedback_actas').select('*').eq('id', actaId).maybeSingle();
  if (!a) throw new HttpError(404, 'Acta no encontrada.');
  return a;
}

async function otpTraceDetail(b: any) {
  const a = await loadActaFull(String(b.actaId));
  const people = await peopleOf([a.evaluator_id, a.evaluated_id]);
  const { data: events } = await admin.from('mail_events').select('id, log_id, role, type, at, ip, user_agent, meta').eq('acta_id', a.id).order('at');
  const { data: mails } = await admin.from('mail_log').select('id, role, to_email, subject, status, error, queued_at, sent_at, first_open_at, last_open_at, open_count').eq('acta_id', a.id).eq('kind', 'otp').order('queued_at');
  return {
    acta: { id: a.id, numero: a.numero, oficina: a.oficina, fecha: a.fecha, contentHash: a.content_hash, evaluatorSignedAt: a.evaluator_signed_at, evaluatedSignedAt: a.evaluated_signed_at, evaluatorSignId: a.evaluator_sign_id, evaluatedSignId: a.evaluated_sign_id },
    evaluador: people[a.evaluator_id], evaluado: people[a.evaluated_id],
    events: (events ?? []).map((e: any) => ({ ...e, label: etiqueta(e.type, e.meta), actor: ROLE_LABEL[e.role] ?? '' })),
    mails: mails ?? [],
  };
}

function newVerificationCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(12));
  const c = Array.from(r).map((x) => abc[x % abc.length]).join('');
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`;
}

async function certGenerate(b: any, who: { id: string; full_name: string }) {
  const a = await loadActaFull(String(b.actaId));
  if (!a.evaluator_signed_at || !a.evaluated_signed_at) throw new HttpError(422, 'El certificado se emite cuando las dos personas ya firmaron el acta.');
  const people = await peopleOf([a.evaluator_id, a.evaluated_id]);
  const { data: events } = await admin.from('mail_events').select('log_id, role, type, at, ip, user_agent, meta').eq('acta_id', a.id).in('type', OTP_TYPES).order('at');
  const { data: mails } = await admin.from('mail_log').select('role, to_email, status, sent_at, first_open_at, open_count').eq('acta_id', a.id).eq('kind', 'otp').order('queued_at');
  const lastSign = (rol: string) => ((events ?? []) as any[]).filter((e) => e.type === 'sign_completed' && e.role === rol).pop();

  const signer = (rol: 'evaluador' | 'evaluado') => {
    const p = people[rol === 'evaluador' ? a.evaluator_id : a.evaluated_id] ?? {};
    const sc = lastSign(rol);
    return { rol, nombre: p.nombre ?? '', cargo: p.cargo ?? '', correo: p.email ?? '', firmadoEn: rol === 'evaluador' ? a.evaluator_signed_at : a.evaluated_signed_at, firmaId: rol === 'evaluador' ? a.evaluator_sign_id : a.evaluated_sign_id, ip: sc?.ip ?? '', dispositivo: sc?.user_agent ?? '' };
  };
  const { count: prev } = await admin.from('sign_certificates').select('id', { count: 'exact', head: true }).eq('acta_id', a.id);
  const version = (prev ?? 0) + 1;
  const { data: seq, error: seqErr } = await admin.rpc('sign_cert_next');
  if (seqErr) throw new HttpError(500, 'No se pudo numerar el certificado. ¿Está aplicada la migración del módulo Correos?');
  const emitido = new Date();
  const numero = `CFO-${emitido.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
  const codigo = newVerificationCode();
  const legal = await getSetting<{ text: string }>('certificate_legal', { text: '' });

  const data: CertData = {
    numero, version, codigo, verificarUrl: `${APP_URL}?module=verificar&c=${codigo}`, emitidoEn: emitido.toISOString(), emitidoPor: who.full_name, institucion: INSTITUCION,
    acta: { numero: a.numero, oficina: a.oficina, fecha: fechaLarga(a.fecha), lugar: a.lugar, objetivo: a.objetivo, huella: a.content_hash ?? '' },
    firmantes: [signer('evaluador'), signer('evaluado')],
    correos: ((mails ?? []) as any[]).map((m) => ({ rol: m.role, destino: m.to_email, enviadoEn: m.sent_at, abiertoEn: m.first_open_at, aperturas: m.open_count, estado: m.status === 'sent' ? 'Enviado' : m.status === 'failed' ? 'Fallido' : 'En proceso' })),
    eventos: ((events ?? []) as any[]).map((e) => ({ at: e.at, etiqueta: etiqueta(e.type, e.meta), actor: ROLE_LABEL[e.role] ?? '', ip: e.ip ?? '' })),
    textoLegal: legal.text || 'Firma electrónica con código de un solo uso (OTP) enviado al correo institucional de cada firmante.',
  };
  const pdf = await construirCertificado(data);
  const pdfSha = await sha256Hex(pdf);
  const path = `${a.id}/${numero}.pdf`;
  const up = await admin.storage.from('certificados-firma').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new HttpError(500, 'No se pudo guardar el PDF del certificado.');
  const { data: cert, error } = await admin.from('sign_certificates').insert({
    number: numero, acta_id: a.id, version, verification_code: codigo, pdf_path: path, pdf_sha256: pdfSha, pdf_bytes: pdf.length,
    content_hash: a.content_hash, snapshot: { firmantes: data.firmantes.map((f) => ({ rol: f.rol, nombre: f.nombre, firmadoEn: f.firmadoEn, firmaId: f.firmaId })), eventos: data.eventos.length }, generated_by: who.id,
  }).select('id, number, version, verification_code, status, generated_at, pdf_sha256, pdf_bytes').single();
  if (error || !cert) { await admin.storage.from('certificados-firma').remove([path]); throw new HttpError(500, 'No se pudo registrar el certificado.'); }
  await admin.from('mail_events').insert({ acta_id: a.id, type: 'cert_generated', meta: { numero, version, por: who.full_name, sha256: pdfSha } });
  const { data: url } = await admin.storage.from('certificados-firma').createSignedUrl(path, 120);
  return { certificate: cert, url: publicStorageUrl(url?.signedUrl) };
}

async function certList(b: any) {
  const size = clamp(b.pageSize, 10, 100, 30);
  const { data } = await admin.from('sign_certificates').select('id, number, version, acta_id, status, revoked_reason, revoked_at, generated_at, generated_by, pdf_sha256, pdf_bytes, verification_code').order('generated_at', { ascending: false }).limit(size);
  const rows = (data ?? []) as any[];
  const actas: Record<string, any> = {};
  const authors: Record<string, string> = {};
  if (rows.length) {
    const { data: ac } = await admin.from('feedback_actas').select('id, numero, oficina').in('id', Array.from(new Set(rows.map((r) => r.acta_id))));
    (ac ?? []).forEach((a: any) => { actas[a.id] = a; });
    const { data: us } = await admin.from('users').select('id, full_name').in('id', Array.from(new Set(rows.map((r) => r.generated_by).filter(Boolean))));
    (us ?? []).forEach((u: any) => { authors[u.id] = u.full_name; });
  }
  return { rows: rows.map((r) => ({ ...r, acta: actas[r.acta_id] ?? null, generatedByName: authors[r.generated_by] ?? '' })) };
}

async function certDownload(b: any, who: { full_name: string }) {
  const { data: c } = await admin.from('sign_certificates').select('id, acta_id, number, pdf_path').eq('id', String(b.id)).maybeSingle();
  if (!c) throw new HttpError(404, 'El certificado no existe.');
  const { data: url, error } = await admin.storage.from('certificados-firma').createSignedUrl(c.pdf_path, 120);
  if (error || !url) throw new HttpError(500, 'No se pudo abrir el PDF.');
  await admin.from('mail_events').insert({ acta_id: c.acta_id, type: 'cert_downloaded', meta: { numero: c.number, por: who.full_name } });
  return { url: publicStorageUrl(url.signedUrl), number: c.number };
}

async function certRevoke(b: any, who: { id: string; full_name: string }) {
  const reason = str(b.reason, 300);
  if (reason.length < 8) throw new HttpError(400, 'Escribe el motivo de la revocación (mínimo 8 caracteres).');
  const { data: c } = await admin.from('sign_certificates').select('id, acta_id, number, status').eq('id', String(b.id)).maybeSingle();
  if (!c) throw new HttpError(404, 'El certificado no existe.');
  if (c.status === 'revocado') throw new HttpError(409, 'Ya estaba revocado.');
  await admin.from('sign_certificates').update({ status: 'revocado', revoked_reason: reason, revoked_at: new Date().toISOString() }).eq('id', c.id);
  await admin.from('mail_events').insert({ acta_id: c.acta_id, type: 'cert_revoked', meta: { numero: c.number, por: who.full_name, motivo: reason } });
  return { ok: true };
}

async function certVerify(b: any, meta: { ip: string; ua: string }) {
  const code = str(b.code, 30).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) throw new HttpError(400, 'El código de verificación tiene 12 caracteres.');
  const formatted = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
  const { data: c } = await admin.from('sign_certificates').select('id, number, version, acta_id, status, revoked_reason, revoked_at, generated_at, pdf_sha256, content_hash, snapshot').eq('verification_code', formatted).maybeSingle();
  if (!c) throw new HttpError(404, 'No existe un certificado con ese código.');
  const { data: a } = await admin.from('feedback_actas').select('numero, oficina').eq('id', c.acta_id).maybeSingle();
  await admin.from('mail_events').insert({ acta_id: c.acta_id, type: 'cert_verified', ip: meta.ip || null, user_agent: meta.ua || null, meta: { numero: c.number } });
  return {
    valid: c.status === 'vigente', status: c.status, revokedReason: c.revoked_reason, number: c.number, version: c.version, generatedAt: c.generated_at,
    acta: { numero: a?.numero ?? '', oficina: a?.oficina ?? '' }, contentHash: c.content_hash, pdfSha256: c.pdf_sha256, signers: (c.snapshot as any)?.firmantes ?? [],
  };
}

/* ---------- servidor ---------- */

const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const meta = reqMeta(req);

  // Rastreo público: imagen de apertura y clics.
  if (req.method === 'GET') {
    const u = new URL(req.url);
    const t = u.searchParams.get('t');
    const token = (u.searchParams.get('i') || '').replace(/[^a-f0-9]/gi, '').slice(0, 40);
    if (t === 'o' && token) {
      try { await admin.rpc('mail_track', { p_token: token, p_type: 'open', p_ip: meta.ip, p_ua: meta.ua }); } catch { /* el pixel siempre responde */ }
      return new Response(GIF, { headers: { ...cors, 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, max-age=0' } });
    }
    if (t === 'c' && token) {
      const target = u.searchParams.get('u') || '';
      if (!allowedRedirect(target)) return new Response('Enlace no permitido', { status: 400, headers: cors });
      try { await admin.rpc('mail_track', { p_token: token, p_type: 'click', p_ip: meta.ip, p_ua: meta.ua, p_meta: { url: target.slice(0, 300) } }); } catch { /* aun así redirige */ }
      return new Response(null, { status: 302, headers: { ...cors, Location: target, 'Cache-Control': 'no-store' } });
    }
    return new Response('Not found', { status: 404, headers: cors });
  }

  try {
    const b = await req.json();
    const action = String(b.action || '');

    if (action === 'cert_verify') return json(await certVerify(b, meta));

    const who = await requireAdmin(b);
    switch (action) {
      case 'bootstrap': return json(await bootstrap());

      case 'templates_list': {
        const { data } = await admin.from('mail_templates').select('key, name, description, subject, html, default_subject, default_html, variables, updated_at').order('name');
        return json({ templates: data ?? [] });
      }
      case 'template_save': {
        const key = String(b.key || '');
        const { data: t } = await admin.from('mail_templates').select('key').eq('key', key).maybeSingle();
        if (!t) throw new HttpError(404, 'La plantilla no existe.');
        const subject = str(b.subject, 200), html = String(b.html ?? '');
        validateTemplate(key, subject, html);
        const patch: Record<string, unknown> = { subject, html, updated_by: who.id, updated_at: new Date().toISOString() };
        if (b.name) patch.name = str(b.name, 80);
        await admin.from('mail_templates').update(patch).eq('key', key);
        return json({ ok: true });
      }
      case 'template_reset': {
        const { data: t } = await admin.from('mail_templates').select('default_subject, default_html').eq('key', String(b.key)).maybeSingle();
        if (!t) throw new HttpError(404, 'La plantilla no existe.');
        await admin.from('mail_templates').update({ subject: t.default_subject, html: t.default_html, updated_by: who.id, updated_at: new Date().toISOString() }).eq('key', String(b.key));
        return json({ ok: true });
      }
      case 'template_create': {
        const name = str(b.name, 80);
        if (!name) throw new HttpError(400, 'Ponle un nombre a la plantilla.');
        const { data: base } = await admin.from('mail_templates').select('subject, html, variables').eq('key', str(b.fromKey, 60) || 'aviso_general').maybeSingle();
        if (!base) throw new HttpError(404, 'La plantilla base no existe.');
        const key = `custom_${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30)}_${Math.random().toString(36).slice(2, 6)}`;
        await admin.from('mail_templates').insert({ key, name, description: 'Plantilla propia', subject: base.subject, html: base.html, default_subject: base.subject, default_html: base.html, variables: base.variables, updated_by: who.id });
        return json({ key });
      }
      case 'template_delete': {
        const key = String(b.key || '');
        if (!key.startsWith('custom_')) throw new HttpError(409, 'Las plantillas del sistema no se pueden eliminar; puedes restablecerlas.');
        const { count } = await admin.from('mail_campaigns').select('id', { count: 'exact', head: true }).eq('template_key', key).in('status', ['sending', 'paused']);
        if (count) throw new HttpError(409, 'Hay un envío en curso con esta plantilla.');
        await admin.from('mail_templates').delete().eq('key', key);
        return json({ ok: true });
      }
      case 'settings_save': {
        if (b.limits) {
          const l = { per_minute: clamp(b.limits.per_minute, 1, 30, 20), daily_cap: clamp(b.limits.daily_cap, 10, 9000, 1500) };
          await admin.from('mail_settings').upsert({ key: 'limits', value: l, updated_by: who.id, updated_at: new Date().toISOString() });
        }
        if (typeof b.legalText === 'string') {
          const text = b.legalText.trim().slice(0, 4000);
          if (text.length < 40) throw new HttpError(400, 'El texto legal es demasiado corto.');
          await admin.from('mail_settings').upsert({ key: 'certificate_legal', value: { text }, updated_by: who.id, updated_at: new Date().toISOString() });
        }
        return json({ ok: true });
      }

      case 'audience_preview': {
        const people = await resolveAudience(b.audience ?? {});
        const by = (f: (p: Person) => string) => Object.entries(people.reduce((a: Record<string, number>, p) => ((a[f(p) || 'Sin dato'] = (a[f(p) || 'Sin dato'] ?? 0) + 1), a), {})).sort((x, y) => y[1] - x[1]).slice(0, 8);
        return json({
          count: people.length, conPendientes: people.filter((p) => p.pendientes > 0).length, evaluaciones: people.reduce((n, p) => n + p.total, 0),
          sample: people.slice(0, 6).map((p) => ({ nombre: titleCase(p.full_name), correo: p.email, oficina: p.office, total: p.total, pendientes: p.pendientes })),
          byCampus: by((p) => p.campus),
        });
      }
      case 'campaign_create': return json(await campaignCreate(b, who));
      case 'campaign_start': case 'campaign_resume': return json(await setCampaignStatus(String(b.id), 'sending'));
      case 'campaign_pause': return json(await setCampaignStatus(String(b.id), 'paused'));
      case 'campaign_cancel': return json(await setCampaignStatus(String(b.id), 'canceled'));
      case 'campaign_send_batch': return json(await campaignSendBatch(b));
      case 'campaigns_list': return json(await campaignsList());

      case 'log_list': return json(await logList(b));
      case 'log_detail': return json(await logDetail(b));
      case 'send_test': return json(await sendTest(b, who));

      case 'otp_trace_list': return json(await otpTraceList());
      case 'otp_trace_detail': return json(await otpTraceDetail(b));
      case 'cert_list': return json(await certList(b));
      case 'cert_generate': return json(await certGenerate(b, who));
      case 'cert_download': return json(await certDownload(b, who));
      case 'cert_revoke': return json(await certRevoke(b, who));
    }
    throw new HttpError(400, 'Acción no reconocida.');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, ...e.extra }, e.status);
    console.error('[correos]', String((e as Error)?.message ?? e).slice(0, 200));
    return json({ error: 'Error interno en el módulo de correos.' }, 500);
  }
});

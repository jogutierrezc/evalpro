import { useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { User } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('correos', { body });
  if (!error) return data as T;
  let message = 'No se pudo contactar el servicio de correos. Revisa tu conexión e inténtalo de nuevo.';
  let status: number | undefined;
  try {
    const ctx = (error as any).context;
    status = ctx?.status;
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    if (payload?.error) message = payload.error;
  } catch { /* se queda con el mensaje genérico */ }
  throw new ApiError(message, status);
}

/**
 * La función corre dentro de la red de Docker y firma las URL con el host interno (http://supabase-kong:8000),
 * que el navegador no puede resolver. Se reescribe al origen público de Supabase que usa este cliente.
 */
export function publicStorageUrl(url: string): string {
  const i = url.indexOf('/storage/v1/');
  if (i < 0) return url;
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  return base ? base + url.slice(i) : url;
}

/** Llama a la función `correos` como administrador. La función vuelve a verificar el rol en el servidor. */
export const callCorreos = <T = any>(user: Pick<User, 'id' | 'identification'>, action: string, payload: Record<string, unknown> = {}) =>
  invoke<T>({ action, adminId: user.id, adminIdentification: user.identification, ...payload });

/** Comprobación pública de un certificado (sin sesión). */
export const verifyCertificate = (code: string) => invoke<any>({ action: 'cert_verify', code });

export function useCorreosApi() {
  const { user } = useAuth();
  return useCallback(<T = any>(action: string, payload: Record<string, unknown> = {}) => {
    if (!user) return Promise.reject(new ApiError('Sesión no válida.'));
    return callCorreos<T>(user, action, payload);
  }, [user]);
}

export type Api = ReturnType<typeof useCorreosApi>;

/* ---------- tipos ---------- */

export interface Template {
  key: string; name: string; description: string; subject: string; html: string;
  default_subject: string; default_html: string; variables: { name: string; desc: string }[]; updated_at: string;
}
export interface Boot {
  periods: { id: string; year: number; start_date: string; end_date: string; is_active: boolean }[];
  campuses: string[]; roles: string[]; offices: { id: string; name: string }[];
  limits: { per_minute: number; daily_cap: number }; legalText: string; sentToday: number;
  mail: { configured: boolean; host: string; from: string; senderName: string };
  urls: { tracking: string; app: string };
}
export interface CampaignStats { sent: number; failed: number; queued: number; opened: number; clicked: number }
export interface Campaign {
  id: string; name: string; template_key: string; subject: string; status: 'draft' | 'sending' | 'paused' | 'done' | 'canceled';
  total: number; per_minute: number; created_at: string; started_at: string | null; finished_at: string | null; stats: CampaignStats;
}
export interface LogRow {
  id: string; kind: 'campaign' | 'otp' | 'test'; campaign_id: string | null; template_key: string | null; to_email: string; to_name: string;
  acta_id: string | null; role: string | null; subject: string; status: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'; error: string | null;
  queued_at: string; sent_at: string | null; first_open_at: string | null; last_open_at: string | null; open_count: number; first_click_at: string | null; click_count: number;
}
export interface MailEvent { id: number; type: string; at: string; ip: string | null; user_agent: string | null; meta: Record<string, any>; label?: string; actor?: string; role?: string | null }

/* ---------- plantillas en el navegador (misma lógica que la función) ---------- */

const esc = (t: string) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export function renderTemplate(tpl: string, vars: Record<string, string>, html = true): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_m, k: string) => {
    const v = vars[k] ?? `{{${k}}}`;
    if (!html) return v;
    return k === 'mensaje' ? esc(v).replace(/\r?\n/g, '<br>') : esc(v);
  });
}

export const SAMPLE_VARS: Record<string, string> = {
  nombre: 'Lucía Ortega Peña', correo: 'lortega@udes.edu.co', oficina: 'Dirección de Planeación', periodo: 'periodo 2026', fecha_limite: '30 de noviembre de 2026',
  total: '4', pendientes: '2', evaluaciones_texto: 'evaluaciones', enlace: 'https://planeacion.udes.edu.co/evalpro/',
  mensaje: 'Escriba aquí el texto del aviso.\nLos saltos de línea se respetan.', acta: '014-2026', rol: 'persona evaluada', codigo: '123 456', vence_minutos: '5',
  sin_acta: '2', sin_firmar: '1', total_pendientes_retro: '3', retro_texto: 'retroalimentaciones', lista_evaluados: 'Ana Gómez, Luis Pérez y 1 más',
  detalle_retro: '2 evaluaciones aún no tienen acta y 1 acta falta por firmar.', enlace_retro: 'https://planeacion.udes.edu.co/evalpro/?module=feedback',
};

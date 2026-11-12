import { supabase } from '../../lib/supabase';
import type { Resultados } from './resultados';

export interface Compromiso {
  id: string;
  act: string;
  resp: string;
  fecha: string; // YYYY-MM-DD
}

export interface ActaRow {
  id: string;
  evaluation_id: string;
  evaluator_id: string;
  evaluated_id: string;
  period_id: string | null;
  oficina: string;
  numero: string;
  fecha: string | null;
  lugar: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  objetivo: string;
  asistentes: string;
  tipo: 'nueva' | 'lectura';
  seguimiento: string;
  agenda: string;
  desarrollo: string;
  convocatoria: string;
  compromisos: Compromiso[];
  anexo: string;
  transcriptor: string;
  evaluator_signed_at: string | null;
  evaluator_sign_id: string | null;
  evaluated_signed_at: string | null;
  evaluated_sign_id: string | null;
  content_hash: string | null;
  /** Foto de los resultados por criterio (tabla y mapa de competencias del Desarrollo). null = no se incluyen. */
  resultados: Resultados | null;
}

export interface Person {
  id: string;
  nombre: string;
  cargo: string;
  email?: string | null;
}

export type ActaState = 'sin' | 'borrador' | 'espera' | 'firmada';

export const STATE_LABEL: Record<ActaState, string> = {
  sin: 'Sin acta',
  borrador: 'Borrador',
  espera: 'Esperando firmas',
  firmada: 'Firmada',
};

export function actaState(a: ActaRow | null | undefined): ActaState {
  if (!a) return 'sin';
  if (a.evaluator_signed_at && a.evaluated_signed_at) return 'firmada';
  if (a.evaluator_signed_at || a.evaluated_signed_at) return 'espera';
  const touched = a.numero || a.objetivo || a.lugar || a.desarrollo || a.compromisos.some((c) => c.act || c.resp);
  return touched ? 'borrador' : 'sin';
}

export const isLocked = (a: ActaRow) => !!(a.evaluator_signed_at || a.evaluated_signed_at);

/** La base devuelve time como HH:MM:SS; los inputs usan HH:MM. */
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export function normalizeActa(raw: any): ActaRow {
  return {
    ...raw,
    hora_inicio: raw.hora_inicio ? hhmm(raw.hora_inicio) : null,
    hora_fin: raw.hora_fin ? hhmm(raw.hora_fin) : null,
    compromisos: Array.isArray(raw.compromisos) ? raw.compromisos : [],
    resultados: raw.resultados && Array.isArray(raw.resultados.sections) ? raw.resultados : null,
  } as ActaRow;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
export function fechaCorta(iso: string | null | undefined) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function hora12(t: string | null | undefined) {
  if (!t) return '';
  let [h, m] = hhmm(t).split(':').map(Number);
  const suf = h >= 12 ? 'p. m.' : 'a. m.';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${suf}`;
}
export function sello(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const VERB = /^[a-záéíóúñ]{2,}(ar|er|ir)(se|le|lo|la|les|los|las|me|nos)?$/i;
export const startsWithVerb = (text: string) => {
  const w = text.trim().split(/\s+/)[0] || '';
  return !w || VERB.test(w);
};

/** Campos que faltan para poder firmar. Misma regla que valida la Edge Function. */
export function faltantes(a: ActaRow): string[] {
  const m: string[] = [];
  if (!a.oficina.trim()) m.push('Oficina productora');
  if (!a.numero.trim()) m.push('No. de acta');
  if (!a.fecha) m.push('Fecha');
  if (!a.lugar.trim()) m.push('Lugar');
  if (!a.hora_inicio) m.push('Hora de inicio');
  if (!a.hora_fin) m.push('Hora final');
  else if (a.hora_inicio && a.hora_fin <= a.hora_inicio) m.push('Hora final posterior al inicio');
  if (!a.objetivo.trim()) m.push('Objetivo');
  if (!a.asistentes.trim()) m.push('Asistentes');
  if (!a.desarrollo.trim()) m.push('Desarrollo (IV)');
  const ok = a.compromisos.filter((c) => c.act.trim() && c.resp.trim() && c.fecha);
  if (!ok.length) m.push('Al menos un compromiso completo');
  else if (ok.length < a.compromisos.length) m.push('Completar o quitar compromisos vacíos');
  return m;
}
export const TOTAL_CHECKS = 11;

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

/** Nombre corto para firmas y responsables: primer nombre y primer apellido. */
export function shortName(full: string) {
  const p = full.trim().split(/\s+/);
  if (p.length <= 2) return full.trim();
  return `${p[0]} ${p[p.length === 3 ? 1 : p.length - 2]}`;
}

export const publicSignUrl = (token: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL}?module=firmar&t=${encodeURIComponent(token)}`;

/** Llama a la Edge Function y devuelve el mensaje de error legible del servidor. */
export async function callOtp<T = any>(body: Record<string, unknown>): Promise<{ data?: T; error?: string; extra?: any }> {
  const { data, error } = await supabase.functions.invoke('feedback-otp', { body });
  if (!error) return { data: data as T };
  try {
    const ctx = (error as any).context;
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    if (payload?.error) return { error: payload.error, extra: payload };
  } catch { /* cae al mensaje genérico */ }
  return { error: 'No se pudo contactar el servicio de firma. Revisa tu conexión e inténtalo de nuevo.' };
}

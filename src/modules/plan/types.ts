import { getLocalDateString } from '../../hooks/usePeriods';
import type { Compromiso, Person } from '../feedback/types';

export type PlanEstado = 'en_proceso' | 'cumplido' | 'incumplido';

export const ESTADO_LABEL: Record<PlanEstado, string> = {
  en_proceso: 'En proceso',
  cumplido: 'Cumplido',
  incumplido: 'Incumplido',
};

export interface Seguimiento {
  acta_id: string;
  compromiso_id: string;
  estado: PlanEstado;
  porcentaje: number;
  ultimo_registro_at: string;
  actualizado_fuera_plazo: boolean;
  cumplido_at: string | null;
  cumplido_fuera_plazo: boolean;
}

export interface Registro {
  id: string;
  acta_id: string;
  compromiso_id: string;
  estado: PlanEstado;
  porcentaje: number;
  descripcion: string;
  evidencia_tipo: 'link' | 'pdf' | null;
  evidencia_url: string | null;
  evidencia_path: string | null;
  evidencia_nombre: string | null;
  fecha_limite: string | null;
  fuera_de_plazo: boolean;
  created_by: string;
  created_at: string;
}

export interface PlanItem {
  key: string; // `${actaId}:${compromisoId}`
  actaId: string;
  numeroActa: string;
  periodId: string | null;
  compromiso: Compromiso;
  evaluado: Person;
  evaluador: Person;
  oficina: string;
  seg: Seguimiento | null;
}

/** Cubo para filtrar: sin registro, o el estado vigente del seguimiento. */
export type Bucket = 'sin' | PlanEstado;
export const bucketOf = (i: PlanItem): Bucket => i.seg?.estado ?? 'sin';
export const pctOf = (i: PlanItem) => i.seg?.porcentaje ?? 0;

export type PlazoKind = 'sin_fecha' | 'en_plazo' | 'proximo' | 'hoy' | 'vencido' | 'cerrado' | 'cerrado_tarde';

export interface Plazo {
  kind: PlazoKind;
  /** Texto principal del plazo, listo para mostrar. */
  label: string;
  /** Días hasta la fecha límite (negativo si ya venció). null si no hay fecha. */
  days: number | null;
}

const dayNumber = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Calcula el estado del plazo de un compromiso. Una fecha vencida solo cuenta si el compromiso no se cumplió. */
export function plazoOf(fecha: string | null | undefined, seg: Seguimiento | null, today = getLocalDateString()): Plazo {
  const days = fecha ? dayNumber(fecha) - dayNumber(today) : null;

  if (seg?.estado === 'cumplido') {
    if (seg.cumplido_fuera_plazo) return { kind: 'cerrado_tarde', label: 'Cumplido fuera de plazo', days };
    return { kind: 'cerrado', label: fecha ? 'Cumplido a tiempo' : 'Cumplido', days };
  }
  if (days === null) return { kind: 'sin_fecha', label: 'Sin fecha límite', days };
  if (days < 0) return { kind: 'vencido', label: 'Compromiso vencido', days };
  if (days === 0) return { kind: 'hoy', label: 'Vence hoy', days };
  if (days === 1) return { kind: 'proximo', label: 'Vence mañana', days };
  if (days <= 7) return { kind: 'proximo', label: `Faltan ${plural(days, 'día', 'días')}`, days };
  return { kind: 'en_plazo', label: `Faltan ${plural(days, 'día', 'días')}`, days };
}

/** "hace 5 días" / "hace 1 mes" para el detalle de un compromiso vencido. */
export function haceTexto(days: number): string {
  const n = Math.abs(days);
  if (n < 31) return `hace ${plural(n, 'día', 'días')}`;
  const m = Math.floor(n / 30);
  return `hace ${plural(m, 'mes', 'meses')}`;
}

export const isVencido = (i: PlanItem) => plazoOf(i.compromiso.fecha, i.seg).kind === 'vencido';

export interface Resumen {
  total: number;
  sin: number;
  en_proceso: number;
  cumplido: number;
  incumplido: number;
  vencidos: number;
  fueraPeriodo: number;
  /** Avance promedio 0-100 */
  avance: number;
}

export function resumir(items: PlanItem[]): Resumen {
  const r: Resumen = { total: items.length, sin: 0, en_proceso: 0, cumplido: 0, incumplido: 0, vencidos: 0, fueraPeriodo: 0, avance: 0 };
  let sum = 0;
  for (const i of items) {
    r[bucketOf(i)]++;
    if (isVencido(i)) r.vencidos++;
    if (i.seg?.actualizado_fuera_plazo) r.fueraPeriodo++;
    sum += pctOf(i);
  }
  r.avance = items.length ? Math.round(sum / items.length) : 0;
  return r;
}

export const fmtPct = (n: number) => `${Math.round(n)} %`;

export const PDF_MAX_BYTES = 10 * 1024 * 1024;
export const isHttpUrl = (s: string) => /^https?:\/\/\S+\.\S+/i.test(s.trim());

export const BUCKET = 'plan-evidencias';
export function safeFileName(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

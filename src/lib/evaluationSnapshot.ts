/**
 * Identidad congelada de cada evaluación (ver migración 20261114000000_evaluation_identity_snapshot.sql).
 *
 * Los exportes y resultados deben mostrar a las personas como eran cuando se completó la evaluación, no como
 * están hoy en `users`: si alguien cambia de nombre, correo o campus, su historial no se reescribe ni se mezcla.
 */

export const SNAPSHOT_COLUMNS = 'period_id, evaluator_snapshot, evaluated_snapshot';

type Side = 'evaluator' | 'evaluated';

/** Reemplaza, en la fila de una evaluación, los datos "en vivo" del usuario por su foto congelada (si existe). */
export function applySnapshot<T extends Record<string, any>>(row: T): T {
  (['evaluator', 'evaluated'] as Side[]).forEach((side) => {
    const snap = row[`${side}_snapshot`];
    if (!snap) return; // sin foto (migración no aplicada): se queda con el dato en vivo
    const live = row[side] || {};
    (row as any)[side] = {
      ...live,
      full_name: snap.nombre ?? live.full_name,
      email: snap.email ?? live.email,
      identification: snap.identificacion ?? live.identification,
      role: snap.rol ?? live.role,
      campus: snap.campus ?? live.campus,
      office: { ...(live.office || {}), name: snap.oficina ?? live.office?.name },
    };
  });
  return row;
}

/** Llave estable de una persona: la cédula congelada; si falta, el id de usuario. */
export function personKey(row: Record<string, any>, side: Side): string {
  return String(row?.[`${side}_snapshot`]?.identificacion || row?.[side]?.identification || row?.[`${side}_id`] || '');
}

const shortDate = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** Nombre del periodo con sus fechas: puede haber dos periodos del mismo año y así no se confunden. */
export const periodLabel = (p: { name?: string | null; year?: number | string; start_date?: string | null; end_date?: string | null } | null | undefined) => {
  if (!p) return 'Sin periodo';
  const base = p.name || `Periodo ${p.year}`;
  return p.start_date && p.end_date ? `${base} (${shortDate(p.start_date)} al ${shortDate(p.end_date)})` : base;
};

/**
 * Filtro PostgREST (para `.or()`) de un periodo: sus evaluaciones y las antiguas con period_id vacío creadas dentro de
 * sus fechas (el portal las guardaba sin periodo). Nunca incluye evaluaciones de otro periodo.
 */
export function periodOrFilter(period: { id: string; start_date?: string | null; end_date?: string | null } | null | undefined): string | null {
  if (!period?.id) return null;
  const start = period.start_date ? String(period.start_date).slice(0, 10) : '';
  const end = period.end_date ? String(period.end_date).slice(0, 10) : '';
  return start && end
    ? `period_id.eq.${period.id},and(period_id.is.null,created_at.gte.${start}T00:00:00,created_at.lte.${end}T23:59:59)`
    : `period_id.eq.${period.id}`;
}

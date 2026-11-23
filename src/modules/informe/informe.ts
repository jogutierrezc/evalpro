import { supabase } from '../../lib/supabase';

/* Datos del informe de evaluación: los entrega la función SQL informe_evaluacion (migración 20261121000000). */

export interface Persona {
  id: string;
  nombre: string | null;
  documento: string | null;
  cargo: string | null;
  oficina: string | null;
  sede: string | null;
  correo: string | null;
}

/** Los cuatro puntos de vista del informe. «equipo» no aplica a autoevaluaciones; «sede» y «udes» exigen 3 o más evaluaciones. */
export type SerieId = 'persona' | 'equipo' | 'sede' | 'udes';
export type Valores = Record<SerieId, number | null>;

export interface Criterio extends Valores {
  id: string;
  texto: string;
  peso: number;
}
export interface Seccion extends Valores {
  id: string | null;
  title: string;
  criterios: Criterio[];
}
export interface Informe {
  version: 2;
  generated_at: string;
  evaluation_id: string;
  kind: 'autoevaluacion' | 'evaluacion';
  template: string | null;
  completed_at: string | null;
  created_at: string | null;
  scale: number;
  period: { id: string; year: number; start: string; end: string } | null;
  evaluado: Persona;
  evaluador: Persona;
  n: { equipo: number; sede: number; udes: number };
  overall: Valores;
  sections: Seccion[];
}

export async function fetchInforme(evaluationId: string): Promise<Informe> {
  const { data, error } = await supabase.rpc('informe_evaluacion', { p_evaluation: evaluationId });
  if (error) {
    const msg = `${error.code ?? ''} ${error.message ?? ''}`;
    if (/PGRST202|Could not find the function|informe_evaluacion/i.test(msg) && !/acceso/i.test(msg)) {
      throw new Error('Falta aplicar la migración del informe de evaluación en la base de datos.');
    }
    if (/acceso/i.test(msg)) throw new Error('No tienes acceso a este informe.');
    if (/no encontrada/i.test(msg)) throw new Error('No encontramos esa evaluación.');
    throw new Error('No se pudo generar el informe de la evaluación.');
  }
  const r = data as Informe;
  if (!r || !Array.isArray(r.sections)) throw new Error('No se pudo generar el informe de la evaluación.');
  return r;
}

/* ---------- Series: color, trazo y marcador (se distinguen también en blanco y negro) ---------- */

export const SERIES: Record<SerieId, { label: string; short: string; color: string; dash?: string; marker: 'circle' | 'diamond' | 'square' | 'triangle' }> = {
  persona: { label: 'Resultado de la persona', short: 'Persona', color: '#1d4ed8', marker: 'circle' },
  equipo: { label: 'Equipo del evaluador', short: 'Equipo', color: '#b45309', dash: '6 3', marker: 'diamond' },
  sede: { label: 'Promedio de la sede', short: 'Sede', color: '#0f766e', dash: '2 3', marker: 'triangle' },
  udes: { label: 'Promedio UDES', short: 'UDES', color: '#475569', dash: '1 3', marker: 'square' },
};

/** Series con datos en este informe, en el orden en que se dibujan: primero lo comparativo y al final la persona, que queda encima. */
export function seriesPresentes(r: Informe): SerieId[] {
  const hay = (k: SerieId) => r.overall[k] != null || r.sections.some((s) => s[k] != null);
  return (['udes', 'sede', 'equipo', 'persona'] as SerieId[]).filter(hay);
}

/* ---------- Formato ---------- */

export const fmt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '–' : n.toFixed(2).replace('.', ','));
export const diff = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? null : Math.round((a - b) * 100) / 100;
export const fmtDiff = (d: number | null) => (d == null ? '–' : d === 0 ? '0,00' : `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(2).replace('.', ',')}`);
/** Una brecha menor a 0,25 puntos se considera igual al comparativo (misma regla que el acta de retroalimentación). */
export type Tono = 'up' | 'down' | 'flat';
export const tonoDe = (d: number | null): Tono => (d == null || Math.abs(d) < 0.25 ? 'flat' : d > 0 ? 'up' : 'down');

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «21 de noviembre de 2026». Lee la fecha como local para que un día no se corra por la zona horaria. */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}
export const fechaDeCompletada = (r: Informe) => {
  const iso = r.completed_at ?? r.created_at;
  if (!iso) return '';
  // Las marcas con hora (timestamptz) se pasan a fecha local; las que solo traen día se leen tal cual.
  return /T\d/.test(iso) ? fechaLarga(new Date(iso).toLocaleDateString('en-CA')) : fechaLarga(iso);
};

const CARGOS: Record<string, string> = {
  admin: 'Administración',
  office_manager: 'Jefatura de oficina',
  jefe_vaf: 'Jefatura VAF',
  jefe_campus_vaf: 'Jefatura de sede VAF',
  colaborador_vaf: 'Colaborador VAF',
  employee: 'Colaborador',
};
export const cargoLabel = (c: string | null | undefined) => (c ? CARGOS[c] ?? c.replace(/_/g, ' ') : '');

/* ---------- Niveles (mismos cortes que el informe anterior) ---------- */

export interface Nivel { id: 'referente' | 'sobresaliente' | 'satisfactorio' | 'fortalecer'; label: string }
export function nivelDe(score: number | null): Nivel | null {
  if (score == null) return null;
  if (score >= 4.6) return { id: 'referente', label: 'Referente' };
  if (score >= 4.0) return { id: 'sobresaliente', label: 'Sobresaliente' };
  if (score >= 3.0) return { id: 'satisfactorio', label: 'Satisfactorio' };
  return { id: 'fortalecer', label: 'Por fortalecer' };
}

/* ---------- Narrativa: solo describe los datos, sin juicios sobre la persona ---------- */

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const posicion = (d: number | null) =>
  d == null ? '' : Math.abs(d) < 0.05 ? 'prácticamente igual' : d > 0 ? `${fmt(Math.abs(d))} por encima` : `${fmt(Math.abs(d))} por debajo`;

export interface Narrativa {
  titular: string;
  frases: string[];
  fuerte: { texto: string; valor: number } | null;
  debil: { texto: string; valor: number } | null;
}

export function narrativa(r: Informe): Narrativa {
  const nombre = r.evaluado.nombre || 'La persona evaluada';
  const o = r.overall;
  const nivel = nivelDe(o.persona);
  const auto = r.kind === 'autoevaluacion';
  const titular = o.persona == null
    ? `${nombre} no tiene criterios calificados en este formulario.`
    : `${nombre} ${auto ? 'se autoevaluó con' : 'obtuvo'} ${fmt(o.persona)} de ${fmt(r.scale)}${nivel ? `, un resultado ${nivel.label.toLowerCase()}` : ''}.`;

  const frases: string[] = [];
  const dE = diff(o.persona, o.equipo);
  const dS = diff(o.persona, o.sede);
  const dU = diff(o.persona, o.udes);
  if (dE != null && r.n.equipo > 0)
    frases.push(`Frente al resto del equipo de quien la evalúa (${plural(r.n.equipo, 'evaluación', 'evaluaciones')}), queda ${posicion(dE)}.`);
  if (dS != null)
    frases.push(`Frente al promedio de la sede ${r.evaluado.sede ?? ''} (${plural(r.n.sede, 'evaluación', 'evaluaciones')}), queda ${posicion(dS)}.`.replace('sede  (', 'sede ('));
  if (dU != null)
    frases.push(`Frente al promedio UDES de este formulario (${plural(r.n.udes, 'evaluación', 'evaluaciones')}), queda ${posicion(dU)}.`);
  if (dS == null && r.n.sede > 0 && r.n.sede < 3)
    frases.push('La comparación con la sede no se muestra porque hay menos de tres evaluaciones.');

  const criterios = r.sections.flatMap((s) => s.criterios.filter((c) => c.persona != null).map((c) => ({ texto: c.texto, valor: c.persona as number })));
  let fuerte: Narrativa['fuerte'] = null;
  let debil: Narrativa['debil'] = null;
  if (criterios.length >= 2) {
    fuerte = criterios.reduce((m, x) => (x.valor > m.valor ? x : m));
    debil = criterios.reduce((m, x) => (x.valor < m.valor ? x : m));
    if (fuerte.valor === debil.valor) { fuerte = null; debil = null; }
  }
  return { titular, frases, fuerte, debil };
}

/** Lectura de una sección en una o dos frases. */
export function lecturaSeccion(s: Seccion): string {
  const partes: string[] = [];
  if (s.persona == null) return 'Esta competencia no tiene respuestas calificadas.';
  partes.push(`Promedio de ${fmt(s.persona)}.`);
  const refs: string[] = [];
  const dU = diff(s.persona, s.udes);
  const dS = diff(s.persona, s.sede);
  const dE = diff(s.persona, s.equipo);
  if (dE != null) refs.push(`${posicion(dE)} del equipo`);
  if (dS != null) refs.push(`${posicion(dS)} de la sede`);
  if (dU != null) refs.push(`${posicion(dU)} de UDES`);
  if (refs.length) partes.push(`Queda ${refs.join(', ')}.`);
  const cs = s.criterios.filter((c) => c.persona != null);
  if (cs.length >= 2) {
    const hi = cs.reduce((m, x) => ((x.persona as number) > (m.persona as number) ? x : m));
    const lo = cs.reduce((m, x) => ((x.persona as number) < (m.persona as number) ? x : m));
    if (hi.persona !== lo.persona) partes.push(`La condición más alta es «${hi.texto}» (${fmt(hi.persona)}) y la más baja, «${lo.texto}» (${fmt(lo.persona)}).`);
  }
  return partes.join(' ');
}

export const notaMetodo = (r: Informe) =>
  `Escala de 1 a ${r.scale}. ` +
  (r.kind === 'autoevaluacion'
    ? 'Las autoevaluaciones se comparan solo con otras autoevaluaciones del mismo formulario y periodo. '
    : 'Las evaluaciones se comparan solo con otras evaluaciones del mismo formulario y periodo, sin contar autoevaluaciones. ') +
  (r.kind === 'evaluacion' ? 'Equipo: las demás personas evaluadas por quien evalúa. ' : '') +
  'Sede y UDES se muestran cuando hay tres o más evaluaciones. Una brecha menor a 0,25 puntos se lee como igual al comparativo.';

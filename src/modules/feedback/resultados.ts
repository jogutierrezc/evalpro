import { supabase } from '../../lib/supabase';
import { fechaCorta } from './types';

/** Foto de los resultados de una evaluación, calculada por la función SQL feedback_resultados y guardada en el acta. */
export interface ResCriterio {
  id: string;
  texto: string;
  peso: number;
  persona: number | null;
  equipo: number | null;
  udes: number | null;
}
export interface ResSeccion {
  id: string | null;
  title: string;
  persona: number | null;
  equipo: number | null;
  udes: number | null;
  criterios: ResCriterio[];
}
export interface Resultados {
  version: 1;
  /** Solo en la copia de la autoevaluación (función evaluacion_propia_resultados). */
  kind?: 'autoevaluacion';
  completed_at?: string | null;
  generated_at: string;
  evaluation_id: string;
  template: string;
  period_id: string | null;
  scale: number;
  team_n: number;
  udes_n: number;
  overall: { persona: number | null; equipo: number | null; udes: number | null };
  sections: ResSeccion[];
}

export async function fetchResultados(evaluationId: string): Promise<Resultados> {
  const { data, error } = await supabase.rpc('feedback_resultados', { p_evaluation: evaluationId });
  if (error) {
    const missing = /feedback_resultados|PGRST202|Could not find the function/i.test(`${error.code} ${error.message}`);
    throw new Error(missing ? 'Falta aplicar la migración de resultados en la base de datos.' : 'No se pudieron calcular los resultados de la evaluación.');
  }
  const r = data as Resultados;
  if (!r || !Array.isArray(r.sections) || !r.sections.length) throw new Error('Esta evaluación no tiene criterios calificados.');
  return r;
}

/* ---------- Formato ---------- */

export const fmt = (n: number | null | undefined) => (n == null || Number.isNaN(n) ? '-' : n.toFixed(2).replace('.', ','));
export const diff = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? null : Math.round((a - b) * 100) / 100);
export const fmtDiff = (d: number | null) => (d == null ? '-' : `${d > 0 ? '+' : ''}${d.toFixed(2).replace('.', ',')}`);

export type Tone = 'up' | 'down' | 'flat';
/** Una brecha menor a 0,25 puntos se considera igual al comparativo. */
export const toneOf = (d: number | null): Tone => (d == null || Math.abs(d) < 0.25 ? 'flat' : d > 0 ? 'up' : 'down');

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const posicion = (d: number | null) => (d == null ? '' : Math.abs(d) < 0.05 ? 'igual' : d > 0 ? `${fmt(Math.abs(d))} por encima` : `${fmt(Math.abs(d))} por debajo`);

/** Frase de lectura para el acta. Solo describe los datos, sin juicios. */
export function lecturaTexto(r: Resultados, nombre: string): string {
  const o = r.overall;
  const partes = [`${nombre} obtuvo ${fmt(o.persona)} de ${fmt(r.scale)} en la evaluación de desempeño (${r.template}).`];
  const dEq = diff(o.persona, o.equipo);
  const dUd = diff(o.persona, o.udes);
  if (dEq != null && r.team_n > 0) partes.push(`Frente al resto de su equipo (${plural(r.team_n, 'evaluación', 'evaluaciones')}) queda ${posicion(dEq)}.`);
  if (dUd != null) partes.push(`Frente al promedio UDES de este formulario (${plural(r.udes_n, 'evaluación', 'evaluaciones')}) queda ${posicion(dUd)}.`);
  const conBrecha = r.sections.map((s) => ({ s, d: diff(s.persona, s.udes) })).filter((x) => x.d != null) as { s: ResSeccion; d: number }[];
  if (conBrecha.length >= 2) {
    const menor = conBrecha.reduce((m, x) => (x.d < m.d ? x : m));
    const mayor = conBrecha.reduce((m, x) => (x.d > m.d ? x : m));
    if (menor.d < 0) partes.push(`La mayor distancia frente a UDES está en ${menor.s.title} (${fmtDiff(menor.d)}).`);
    if (mayor.d > 0) partes.push(`La mayor ventaja está en ${mayor.s.title} (${fmtDiff(mayor.d)}).`);
  }
  return partes.join(' ');
}

export const notaMetodo = (r: Resultados) =>
  `Escala de 1 a ${r.scale}. Equipo: promedio de las demás personas evaluadas por el mismo líder con este formulario en el periodo${r.team_n ? ` (${plural(r.team_n, 'evaluación', 'evaluaciones')})` : ''}. ` +
  `UDES: promedio de todas las evaluaciones de este formulario en el periodo (${plural(r.udes_n, 'evaluación', 'evaluaciones')}). ` +
  `Diferencia = colaborador menos comparativo. Datos al ${fechaCorta(r.generated_at)}.`;

/* ---------- Paginación del papel ---------- */

export type FilaRes =
  | { kind: 'sec'; n: number; sec: ResSeccion }
  | { kind: 'crit'; n: string; c: ResCriterio }
  | { kind: 'total' };

export interface PaginaRes {
  first: boolean;
  last: boolean;
  filas: FilaRes[];
}

// Alturas estimadas en em de página (carta: ~65 em útiles, menos encabezado). La primera página lleva además el mapa.
const PRIMERA = 15.5;
const SIGUIENTES = 49;
const H_SEC = 1.95;
const H_TOTAL = 2.3;
const H_NOTA = 4.4;

// Calibrado contra el render real: ~60 caracteres por línea, 1 em por línea y 0,64 em de relleno por fila.
const altoCriterio = (texto: string) => Math.max(1, Math.ceil(texto.length / 58)) * 1 + 0.64;

/** Reparte secciones y criterios en páginas. Una sección nunca queda sola al final de una página. */
export function paginar(r: Resultados): PaginaRes[] {
  const paginas: PaginaRes[] = [{ first: true, last: false, filas: [] }];
  let usado = 0;
  let tope = PRIMERA;
  const nueva = () => { paginas.push({ first: false, last: false, filas: [] }); usado = 0; tope = SIGUIENTES; };
  const cabe = (h: number) => usado + h <= tope;

  r.sections.forEach((sec, i) => {
    const primero = sec.criterios[0];
    const hPrimero = primero ? altoCriterio(primero.texto) : 0;
    if (!cabe(H_SEC + hPrimero)) nueva();
    paginas[paginas.length - 1].filas.push({ kind: 'sec', n: i + 1, sec });
    usado += H_SEC;
    sec.criterios.forEach((c, j) => {
      const h = altoCriterio(c.texto);
      if (!cabe(h)) nueva();
      paginas[paginas.length - 1].filas.push({ kind: 'crit', n: `${i + 1}.${j + 1}`, c });
      usado += h;
    });
  });
  if (!cabe(H_TOTAL + H_NOTA)) nueva();
  paginas[paginas.length - 1].filas.push({ kind: 'total' });
  paginas[paginas.length - 1].last = true;
  return paginas;
}

/* ---------- Excel ---------- */

interface ExcelCtx {
  evaluado: string;
  evaluador: string;
  periodo?: string;
}

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();

/** Descarga la tabla de resultados por criterio en Excel, con el mismo contenido que el acta. */
export async function exportarExcel(r: Resultados, ctx: ExcelCtx) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EvalPro UDES';
  const ws = wb.addWorksheet('Resultados', { views: [{ state: 'frozen', ySplit: 7 }], pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  ws.columns = [{ width: 7 }, { width: 70 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }];

  const AZUL = 'FF365F91';
  const CLARO = 'FFDCE8F5';
  const SECCION = 'FFEEF3F9';
  const borde = { style: 'thin' as const, color: { argb: 'FFC5D0DD' } };
  const bordes = { top: borde, bottom: borde, left: borde, right: borde };

  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = 'Resultados de la evaluación de desempeño';
  ws.getCell('A1').font = { name: 'Arial', size: 14, bold: true, color: { argb: AZUL } };
  const meta: [string, string][] = [['Colaborador', ctx.evaluado], ['Líder evaluador', ctx.evaluador], ['Formulario', r.template], ['Periodo', ctx.periodo || '']];
  meta.forEach(([k, v], i) => {
    const row = i + 2;
    ws.getCell(`A${row}`).value = k;
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`A${row}`).font = { name: 'Arial', size: 10, bold: true };
    ws.mergeCells(`C${row}:G${row}`);
    ws.getCell(`C${row}`).value = v;
    ws.getCell(`C${row}`).font = { name: 'Arial', size: 10 };
  });

  const head = ws.getRow(7);
  head.values = ['N.º', 'Criterio', 'Colaborador', 'Equipo', 'UDES', 'Dif. equipo', 'Dif. UDES'];
  head.height = 22;
  head.eachCell((c) => {
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
    c.alignment = { vertical: 'middle', horizontal: Number(c.col) <= 2 ? 'left' : 'center', wrapText: true };
    c.border = bordes;
  });

  const num = (c: any, v: number | null, bold = false) => {
    c.value = v;
    c.numFmt = '0.00';
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.font = { name: 'Arial', size: 10, bold };
  };
  const dif = (c: any, v: number | null, bold = false) => {
    c.value = v;
    c.numFmt = '+0.00;-0.00;0.00';
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    const t = toneOf(v);
    c.font = { name: 'Arial', size: 10, bold: true, color: { argb: t === 'up' ? 'FF1D6B4A' : t === 'down' ? 'FF9B1C1C' : 'FF4B5563' } };
    if (bold) c.font = { ...c.font, bold: true };
  };
  const fila = (vals: { n: string; texto: string; p: number | null; e: number | null; u: number | null }, estilo: 'sec' | 'crit' | 'total') => {
    const row = ws.addRow([vals.n, vals.texto]);
    const bold = estilo !== 'crit';
    num(row.getCell(3), vals.p, true);
    num(row.getCell(4), vals.e, bold);
    num(row.getCell(5), vals.u, bold);
    dif(row.getCell(6), diff(vals.p, vals.e), bold);
    dif(row.getCell(7), diff(vals.p, vals.u), bold);
    row.getCell(1).font = { name: 'Arial', size: 10, bold };
    row.getCell(2).font = { name: 'Arial', size: 10, bold };
    row.getCell(2).alignment = { wrapText: true, vertical: 'middle' };
    row.getCell(1).alignment = { vertical: 'middle' };
    row.eachCell((c) => {
      c.border = bordes;
      if (estilo === 'sec') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECCION } };
      if (estilo === 'total') c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CLARO } };
    });
    if (estilo === 'crit') row.height = Math.max(18, Math.ceil(vals.texto.length / 72) * 14 + 4);
  };

  r.sections.forEach((s, i) => {
    fila({ n: String(i + 1), texto: s.title, p: s.persona, e: s.equipo, u: s.udes }, 'sec');
    s.criterios.forEach((c, j) => fila({ n: `${i + 1}.${j + 1}`, texto: c.texto, p: c.persona, e: c.equipo, u: c.udes }, 'crit'));
  });
  fila({ n: '', texto: 'Resultado global', p: r.overall.persona, e: r.overall.equipo, u: r.overall.udes }, 'total');

  ws.addRow([]);
  const nota = ws.addRow([notaMetodo(r)]);
  ws.mergeCells(`A${nota.number}:G${nota.number}`);
  nota.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF4B5563' } };
  nota.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  nota.height = 42;

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `resultados_${slug(ctx.evaluado)}_${r.generated_at.slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

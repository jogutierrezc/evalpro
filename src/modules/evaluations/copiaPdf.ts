/**
 * PDF «Copia de tus evaluaciones». Usa la plantilla de resultados del acta (título, lectura, mapa de competencias,
 * tabla por criterio con diferencias y nota metodológica) y el formato de números de resultados.ts, dibujada con el
 * motor de paginación de src/lib/pdf, así que se ajusta a cualquier tamaño de hoja.
 */
import { ACCENT, INK, MUTED, PdfFlow, RGB, bytesToBase64, clean, rgb } from '../../lib/pdf/flow';
import type { FlowBrand, TCol, TRow } from '../../lib/pdf/flow';
import type { PaperSpec } from '../../lib/pdf/paper';
import type { Resultados } from '../feedback/resultados';
import { diff, fmt, fmtDiff, toneOf } from '../feedback/resultados';
import { fechaLarga } from '../feedback/types';

export interface CopiaPdfInput {
  persona: { nombre: string; cargo?: string };
  /** «Periodo 2026». */
  periodo: string;
  /** ISO de la última evaluación completada. */
  fechaCierre: string;
  /** Una entrada por autoevaluación completada. */
  resultados: Resultados[];
  logo?: FlowBrand['logo'];
  paper?: PaperSpec;
  landscape?: boolean;
}

export interface CopiaPdfOut { bytes: Uint8Array; base64: string; pages: number }

type Serie = 'persona' | 'equipo' | 'udes';

const NAVY = rgb('#172554');
const BAND = rgb('#365f91');
const HEAD = rgb('#dce8f5');
const SEC = rgb('#eaf1f9');
const BORDER = rgb('#3a8bd4');
const GRID = rgb('#cfd9e6');
const UP = rgb('#1d6b4a');
const DOWN = rgb('#9b1c1c');
const FLAT = rgb('#4b5563');

const SERIE_STYLE: Record<Serie, { color: RGB; dash: number[]; marker: 'circle' | 'diamond' | 'square' }> = {
  persona: { color: rgb('#1d4ed8'), dash: [], marker: 'circle' },
  equipo: { color: rgb('#b45309'), dash: [4, 2.6], marker: 'diamond' },
  udes: { color: rgb('#475569'), dash: [0.5, 2.6], marker: 'square' },
};

const LABELS: Record<Serie, string> = { persona: 'Tu autoevaluación', equipo: 'Equipo', udes: 'Promedio UDES' };
const HEADS = { persona: 'Tu resultado', equipo: 'Equipo', udes: 'Promedio UDES', dEquipo: 'Dif. equipo', dUdes: 'Diferencia' };

/** Fecha larga en hora de Colombia (UTC-5): una hora de la noche no debe caer en el día siguiente por estar guardada en UTC. */
const diaColombia = (iso?: string | null) => {
  const t = Date.parse(String(iso ?? ''));
  return Number.isNaN(t) ? '' : fechaLarga(new Date(t - 5 * 3600e3).toISOString());
};

const toneColor = (d: number | null): RGB => { const t = toneOf(d); return t === 'up' ? UP : t === 'down' ? DOWN : FLAT; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const posicion = (d: number | null) => (d == null ? '' : Math.abs(d) < 0.05 ? 'igual' : d > 0 ? `${fmt(Math.abs(d))} por encima` : `${fmt(Math.abs(d))} por debajo`);

/** Frase de lectura de la autoevaluación. Solo describe los datos, sin juicios. */
export function lecturaCopia(r: Resultados): string {
  const o = r.overall;
  const partes = [`Obtuviste ${fmt(o.persona)} de ${fmt(r.scale)} en tu autoevaluación (${r.template}).`];
  const dUd = diff(o.persona, o.udes);
  if (dUd != null) partes.push(`Frente al promedio UDES de este formulario (${plural(r.udes_n, 'autoevaluación', 'autoevaluaciones')}) quedas ${posicion(dUd)}.`);
  const conBrecha = r.sections.map((s) => ({ s, d: diff(s.persona, s.udes) })).filter((x) => x.d != null) as { s: Resultados['sections'][number]; d: number }[];
  if (conBrecha.length >= 2) {
    const menor = conBrecha.reduce((m, x) => (x.d < m.d ? x : m));
    const mayor = conBrecha.reduce((m, x) => (x.d > m.d ? x : m));
    if (menor.d < 0) partes.push(`La mayor distancia frente a UDES está en ${menor.s.title} (${fmtDiff(menor.d)}).`);
    if (mayor.d > 0) partes.push(`La mayor ventaja está en ${mayor.s.title} (${fmtDiff(mayor.d)}).`);
  }
  return partes.join(' ');
}

export function notaCopia(r: Resultados): string {
  const base = `Escala de 1 a ${fmt(r.scale).replace(',00', '')}. Este es tu resultado tal como quedó registrado en Aluna Eval.`;
  const udes = r.overall.udes != null || r.sections.some((s) => s.udes != null)
    ? ` Promedio UDES: promedio de las autoevaluaciones completadas de este formulario en el periodo (${plural(r.udes_n, 'autoevaluación', 'autoevaluaciones')}). Diferencia = tu resultado menos el promedio.`
    : ' El promedio UDES no se muestra porque hay menos de 3 autoevaluaciones completadas de este formulario.';
  return base + udes;
}

/* ---------- mapa de competencias (radar vectorial) ---------- */

function drawRadar(f: PdfFlow, x: number, y: number, S: number, res: Resultados, series: Serie[], min: number) {
  const d = f.doc;
  const axes = res.sections;
  const n = axes.length;
  const R = S * 0.373;
  const cx = x + S / 2;
  const cy = y + S * 0.503;
  const max = res.scale;
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number): [number, number] => {
    const r = ((Math.min(max, Math.max(min, v)) - min) / (max - min)) * R;
    return [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  };
  const poly = (vals: (i: number) => number, style: 'S' | 'F') => {
    const p = axes.map((_, i) => pt(i, vals(i)));
    const rel = p.slice(1).map((q, i) => [q[0] - p[i][0], q[1] - p[i][1]]);
    d.lines(rel, p[0][0], p[0][1], [1, 1], style, true);
  };
  const GState = (d as unknown as { GState: new (o: Record<string, number>) => object }).GState;
  const setOpacity = (o: number) => (d as unknown as { setGState: (g: object) => void }).setGState(new GState({ opacity: o }));

  // Anillos y ejes
  const rings = Array.from({ length: Math.ceil(max - min) }, (_, k) => min + k + 1);
  d.setLineDashPattern([], 0);
  rings.forEach((v) => {
    d.setDrawColor(...(v === max ? rgb('#94a3b8') : rgb('#d5dce6')));
    d.setLineWidth(v === max ? 0.9 : 0.6);
    poly(() => v, 'S');
  });
  d.setDrawColor(...rgb('#d5dce6'));
  d.setLineWidth(0.6);
  axes.forEach((_, i) => { const [px, py] = pt(i, max); d.line(cx, cy, px, py); });

  // Series: UDES al fondo, la persona encima
  const order: Serie[] = (['udes', 'equipo', 'persona'] as Serie[]).filter((k) => series.includes(k));
  order.forEach((k) => {
    const st = SERIE_STYLE[k];
    const val = (i: number) => (axes[i][k] as number | null) ?? min;
    if (k === 'persona') {
      setOpacity(0.16);
      d.setFillColor(...st.color);
      poly(val, 'F');
      setOpacity(1);
    }
    d.setDrawColor(...st.color);
    d.setLineWidth(k === 'persona' ? 1.7 : 1.2);
    d.setLineDashPattern(st.dash, 0);
    poly(val, 'S');
    d.setLineDashPattern([], 0);
    axes.forEach((a, i) => {
      const v = a[k] as number | null;
      if (v == null) return;
      const [px, py] = pt(i, v);
      const m = S * 0.0107;
      d.setLineWidth(0.9);
      if (st.marker === 'circle') { d.setFillColor(...st.color); d.setDrawColor(255, 255, 255); d.circle(px, py, m * 1.25, 'FD'); }
      else if (st.marker === 'square') { d.setFillColor(255, 255, 255); d.setDrawColor(...st.color); d.rect(px - m * 1.1, py - m * 1.1, m * 2.2, m * 2.2, 'FD'); }
      else {
        d.setFillColor(...st.color); d.setDrawColor(255, 255, 255);
        d.lines([[m * 1.5, m * 1.5], [-m * 1.5, m * 1.5], [-m * 1.5, -m * 1.5]], px, py - m * 1.5, [1, 1], 'FD', true);
      }
    });
  });

  // Valores de los anillos sobre el primer eje
  f.doc.setFont('helvetica', 'bold');
  d.setFontSize(S * 0.03);
  rings.forEach((v) => {
    const [, py] = pt(0, v);
    const tw = d.getTextWidth(String(v));
    d.setFillColor(255, 255, 255);
    d.rect(cx + 2.2, py - S * 0.034, tw + 2, S * 0.032, 'F');
    d.setTextColor(...MUTED);
    d.text(String(v), cx + 3.2, py - S * 0.0085);
  });

  // Números de competencia en el borde
  const rb = S * 0.03;
  axes.forEach((_, i) => {
    const bx = cx + (R + S * 0.0567) * Math.cos(ang(i));
    const by = cy + (R + S * 0.0567) * Math.sin(ang(i));
    d.setFillColor(...BAND);
    d.circle(bx, by, rb, 'F');
    d.setFontSize(S * 0.033);
    d.setTextColor(255, 255, 255);
    d.text(String(i + 1), bx, by + S * 0.033 * 0.34, { align: 'center' });
  });
}

function drawSwatch(f: PdfFlow, x: number, y: number, w: number, k: Serie) {
  const d = f.doc;
  const st = SERIE_STYLE[k];
  d.setDrawColor(...st.color);
  d.setLineWidth(k === 'persona' ? 1.7 : 1.2);
  d.setLineDashPattern(st.dash, 0);
  d.line(x, y, x + w, y);
  d.setLineDashPattern([], 0);
  const m = 2.6;
  const mx = x + w / 2;
  d.setLineWidth(0.9);
  if (st.marker === 'circle') { d.setFillColor(...st.color); d.setDrawColor(255, 255, 255); d.circle(mx, y, m, 'FD'); }
  else if (st.marker === 'square') { d.setFillColor(255, 255, 255); d.setDrawColor(...st.color); d.rect(mx - m, y - m, m * 2, m * 2, 'FD'); }
  else { d.setFillColor(...st.color); d.setDrawColor(255, 255, 255); d.lines([[m * 1.4, m * 1.4], [-m * 1.4, m * 1.4], [-m * 1.4, -m * 1.4]], mx, y - m * 1.4, [1, 1], 'FD', true); }
}

/** Calcula el alto del mapa de competencias sin dibujarlo, para poder reservar su espacio junto con el título de la sección. */
function planMapa(f: PdfFlow, res: Resultados): { h: number; draw: (y: number) => void } {
  const s = f.s;
  const W = f.L.width;
  const sections = res.sections;
  const series: Serie[] = ['persona'];
  if (sections.some((x) => x.equipo != null)) series.push('equipo');
  if (sections.some((x) => x.udes != null) || res.overall.udes != null) series.push('udes');
  const valores = sections.flatMap((x) => [x.persona, x.equipo, x.udes]).filter((v): v is number => v != null);
  const min = Math.max(1, Math.floor(Math.min(...valores, res.scale)) - 1);

  if (sections.length < 3) {
    const aviso = 'El formulario tiene menos de tres competencias, por eso no se grafica el mapa.';
    const m = f.measure(aviso, { size: 8.4 * s });
    return {
      h: m.h + 8 * s,
      draw: (y) => {
        f.doc.setFont('helvetica', 'normal');
        f.doc.setFontSize(8.4 * s);
        f.doc.setTextColor(...MUTED);
        m.lines.forEach((ln, k) => f.doc.text(clean(ln), f.L.left, y + k * m.lineH + m.lineH * 0.7));
      },
    };
  }

  const stacked = W < 340 * s;
  const S = stacked ? Math.min(W, 250 * s) : Math.min(W * 0.46, 236 * s);
  const keyX = stacked ? f.L.left : f.L.left + S + 18 * s;
  const keyW = stacked ? W : W - S - 18 * s;
  const fs = 8.2 * s;
  const badge = fs * 0.95;

  // Altura de la clave (lista numerada + leyenda + escala)
  const itemH = sections.map((x) => f.measure(x.title, { size: fs, width: keyW - badge * 2 - 6 * s, lh: 1.25 }).h + 3.2 * s);
  const keyH = 13 * s + itemH.reduce((a, b) => a + b, 0) + 10 * s + series.length * 14 * s + 14 * s;
  const radarH = S * 1.02;
  const total = stacked ? radarH + 8 * s + keyH : Math.max(radarH, keyH);

  const draw = (y: number) => {
    drawRadar(f, stacked ? f.L.left + (W - S) / 2 : f.L.left, y, S, res, series, min);
    let ky = (stacked ? y + radarH + 8 * s : y + Math.max(0, (total - keyH) / 2));
    const d = f.doc;
    d.setFont('helvetica', 'bold');
    d.setFontSize(fs * 1.1);
    d.setTextColor(...INK);
    d.text('Mapa de competencias', keyX, ky + 8 * s);
    ky += 13 * s;
    sections.forEach((x, i) => {
      d.setFillColor(...BAND);
      d.circle(keyX + badge, ky + badge, badge, 'F');
      d.setFont('helvetica', 'bold');
      d.setFontSize(fs * 0.82);
      d.setTextColor(255, 255, 255);
      d.text(String(i + 1), keyX + badge, ky + badge + fs * 0.82 * 0.34, { align: 'center' });
      const m = f.measure(x.title, { size: fs, width: keyW - badge * 2 - 6 * s, lh: 1.25 });
      d.setFont('helvetica', 'normal');
      d.setFontSize(fs);
      d.setTextColor(...INK);
      m.lines.forEach((ln, k) => d.text(clean(ln), keyX + badge * 2 + 6 * s, ky + k * m.lineH + m.lineH / 2 + fs * 0.34 + 0.6));
      ky += itemH[i];
    });
    ky += 5 * s;
    d.setDrawColor(...GRID);
    d.setLineWidth(0.6);
    d.line(keyX, ky, keyX + keyW, ky);
    ky += 9 * s;
    series.forEach((k) => {
      drawSwatch(f, keyX, ky, 24 * s, k);
      d.setFont('helvetica', 'normal');
      d.setFontSize(fs);
      d.setTextColor(...INK);
      d.text(clean(LABELS[k]), keyX + 24 * s + 6 * s, ky + fs * 0.34);
      ky += 14 * s;
    });
    d.setFontSize(fs * 0.92);
    d.setTextColor(...MUTED);
    d.text(`Escala del gráfico: de ${min} a ${fmt(res.scale).replace(',00', '')}.`, keyX, ky + 4 * s);
  };
  return { h: total + 10 * s, draw };
}

/* ---------- tabla por criterio ---------- */

function tabla(f: PdfFlow, res: Resultados) {
  const s = f.s;
  const hasEq = res.sections.some((x) => x.equipo != null) || res.overall.equipo != null;
  const hasUd = res.sections.some((x) => x.udes != null) || res.overall.udes != null;

  // Columnas numéricas: ancho propio, y si la hoja es angosta el criterio conserva al menos el 38%.
  const nNum = 1 + (hasEq ? 2 : 0) + (hasUd ? 2 : 0);
  const numW = Math.max(Math.min(0.13, 0.62 / nNum), 0.08);
  const cols: TCol[] = [{ header: 'Criterio', width: 1 - numW * nNum, align: 'left' }, { header: HEADS.persona, width: numW }];
  if (hasEq) cols.push({ header: HEADS.equipo, width: numW });
  if (hasUd) cols.push({ header: HEADS.udes, width: numW });
  if (hasEq) cols.push({ header: HEADS.dEquipo, width: numW });
  if (hasUd) cols.push({ header: HEADS.dUdes, width: numW });

  const vals = (p: number | null, e: number | null, u: number | null, bold: boolean) => {
    const out = [{ text: fmt(p), bold: true }] as { text: string; bold?: boolean; color?: RGB }[];
    if (hasEq) out.push({ text: fmt(e), bold });
    if (hasUd) out.push({ text: fmt(u), bold });
    if (hasEq) { const dd = diff(p, e); out.push({ text: fmtDiff(dd), bold: true, color: toneColor(dd) }); }
    if (hasUd) { const dd = diff(p, u); out.push({ text: fmtDiff(dd), bold: true, color: toneColor(dd) }); }
    return out;
  };

  const rows: TRow[] = [];
  res.sections.forEach((sec, i) => {
    rows.push({ cells: [{ text: sec.title, prefix: { text: String(i + 1), badge: true } }, ...vals(sec.persona, sec.equipo, sec.udes, true)], fill: SEC, bold: true, strongTop: i > 0, keepWithNext: true });
    sec.criterios.forEach((c, j) => {
      rows.push({ cells: [{ text: c.texto, prefix: { text: `${i + 1}.${j + 1}` } }, ...vals(c.persona, c.equipo, c.udes, false)] });
    });
  });
  if (rows.length) rows[rows.length - 1].keepWithNext = true;   // el último criterio viaja con el total
  rows.push({ cells: [{ text: 'Resultado global' }, ...vals(res.overall.persona, res.overall.equipo, res.overall.udes, true)], fill: HEAD, bold: true, strongTop: true });

  const nota = notaCopia(res);
  const notaM = f.measure(nota, { size: 7.4 * s, lh: 1.4 });
  f.table({ cols, rows, band: 'RESULTADOS POR CRITERIO', fontSize: 8.4 * s, pad: 3.7 * s, bandFill: BAND, headFill: HEAD, border: BORDER, grid: GRID, badge: BAND }, notaM.h + 6 * s);
  f.gap(5 * s);
  f.text(nota, { size: 7.4 * s, lh: 1.4, color: MUTED, italic: true, after: 4 * s });
}

/* ---------- documento ---------- */

async function construir(inp: CopiaPdfInput, fit: number) {
  const f = await PdfFlow.create({
    fit,
    paper: inp.paper,
    landscape: inp.landscape,
    title: `Copia de tus evaluaciones - ${inp.periodo}`,
    subject: `Copia de las evaluaciones de ${inp.persona.nombre}`,
    author: 'Aluna Eval - Universidad de Santander',
    brand: {
      logo: inp.logo ?? null,
      wordmark: 'Eval',
      right: 'Copia de tus evaluaciones',
      footerLeft: `${inp.persona.nombre} · ${inp.periodo}`,
    },
  });
  const s = f.s;
  const W = f.L.width;

  // Título
  f.text('Copia de tus evaluaciones', { size: 22 * s, bold: true, color: NAVY, lh: 1.15, after: 3 * s });
  f.text(`${inp.periodo} · Aluna Eval`, { size: 10.5 * s, color: ACCENT, bold: true, after: 12 * s });

  // Ficha: persona, cargo y fecha de cierre
  const datos: [string, string][] = [['Persona', inp.persona.nombre], ['Cargo', inp.persona.cargo || '-'], ['Cierre de tus evaluaciones', diaColombia(inp.fechaCierre) || '-']];
  const w = [W * 0.38, W * 0.3, W * 0.32];
  const pad = 6 * s;
  const vs = 9.4 * s;
  const heights = datos.map(([, v], i) => f.measure(v, { size: vs, width: w[i] - 2 * pad, lh: 1.25 }).h);
  const boxH = Math.max(...heights) + 7.5 * s + pad * 1.3;
  f.block(boxH + 10 * s, (y) => {
    const d = f.doc;
    d.setDrawColor(...BORDER);
    d.setLineWidth(0.7);
    d.rect(f.L.left, y, W, boxH, 'S');
    let x = f.L.left;
    datos.forEach(([k, v], i) => {
      if (i > 0) { d.setDrawColor(...BORDER); d.line(x, y, x, y + boxH); }
      d.setFont('helvetica', 'bold');
      d.setFontSize(7.4 * s);
      d.setTextColor(...BAND);
      d.text(clean(k), x + pad, y + pad * 0.5 + 7.4 * s * 0.8);
      const m = f.measure(v, { size: vs, width: w[i] - 2 * pad, lh: 1.25 });
      d.setFont('helvetica', 'normal');
      d.setFontSize(vs);
      d.setTextColor(...INK);
      m.lines.forEach((ln, j) => d.text(clean(ln), x + pad, y + pad * 0.5 + 7.4 * s + 3 * s + j * m.lineH + m.lineH * 0.7));
      x += w[i];
    });
  });

  f.text('Esta es la copia de lo que diligenciaste en Aluna Eval: tu resultado en cada criterio, el mapa de competencias y la comparación con el promedio UDES cuando hay datos suficientes.', { size: 9.4 * s, lh: 1.45, after: 14 * s });

  inp.resultados.forEach((res, i) => {
    const heading = `${i + 1}. ${res.template || 'Autoevaluación'}`;
    const hm = f.measure(heading, { size: 13.5 * s, bold: true, lh: 1.2 });
    const lead = lecturaCopia(res);
    const lm = f.measure(lead, { size: 9.4 * s, lh: 1.45 });
    const plan = planMapa(f, res);
    // El título, su subtítulo, la lectura y el mapa forman una unidad: si no caben en lo que queda de la hoja, pasan completos a la siguiente.
    f.ensure(Math.min(hm.h + 1 * s + 13 * s + lm.h + 9 * s + plan.h, f.pageBody));
    f.text(heading, { size: 13.5 * s, bold: true, color: NAVY, lh: 1.2, after: 1 * s });
    const cierre = res.completed_at ? `Autoevaluación completada el ${diaColombia(res.completed_at)}` : 'Autoevaluación completada';
    f.text(cierre, { size: 8.4 * s, color: MUTED, after: 7 * s });
    f.text(lead, { size: 9.4 * s, lh: 1.45, after: 9 * s });
    f.block(plan.h, plan.draw);
    tabla(f, res);
    f.gap(10 * s);
  });

  return f.finish();
}

/** Escalas que se prueban, de la tipografía normal a una algo más compacta. */
const AJUSTES = [1, 0.97, 0.94, 0.91, 0.88, 0.85];
/** Una última hoja con menos de este llenado se considera «casi vacía» y se intenta compactar. */
const LLENADO_MIN = 0.3;

/**
 * Genera el PDF. Si la última hoja quedaría casi vacía (una fila suelta, o la nota sola), prueba con la letra un poco más
 * pequeña para que el contenido se reparta mejor en las hojas, sin bajar de ~85 % del tamaño normal.
 */
export async function generarCopiaPdf(inp: CopiaPdfInput): Promise<CopiaPdfOut & { ajuste: number }> {
  let mejor: { out: Awaited<ReturnType<typeof construir>>; fit: number } | null = null;
  for (const fit of AJUSTES) {
    const out = await construir(inp, fit);
    if (!mejor || out.pages < mejor.out.pages) mejor = { out, fit };
    if (out.pages === 1 || out.lastFill >= LLENADO_MIN) { mejor = { out, fit }; break; }
  }
  const { out, fit } = mejor!;
  return { bytes: out.bytes, base64: bytesToBase64(out.bytes), pages: out.pages, ajuste: fit };
}

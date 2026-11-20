/**
 * Papel y área útil. Todo el motor de PDF se calcula a partir de estas medidas, nunca con valores fijos de una hoja:
 * al cambiar el tamaño (Carta, A4, Legal, A5, A3, Tabloide o uno personalizado, vertical u horizontal) cambian los
 * márgenes, la escala tipográfica y el ancho útil, y la paginación se recalcula sola.
 */

export type PaperName = 'letter' | 'a4' | 'legal' | 'a5' | 'a3' | 'tabloid';

export type PaperSpec =
  | PaperName
  | { widthMm: number; heightMm: number }
  | { widthPt: number; heightPt: number };

/** Hoja en puntos (1 pt = 1/72 in). Siempre w = ancho y h = alto ya con la orientación aplicada. */
export interface PageBox { w: number; h: number }

const MM = 72 / 25.4;

export const PAPERS: Record<PaperName, PageBox> = {
  letter: { w: 612, h: 792 },        // 8,5 x 11 in
  a4: { w: 595.28, h: 841.89 },      // 210 x 297 mm
  legal: { w: 612, h: 1008 },        // 8,5 x 14 in
  a5: { w: 419.53, h: 595.28 },      // 148 x 210 mm
  a3: { w: 841.89, h: 1190.55 },     // 297 x 420 mm
  tabloid: { w: 792, h: 1224 },      // 11 x 17 in
};

export const PAPER_LABEL: Record<PaperName, string> = {
  letter: 'Carta', a4: 'A4', legal: 'Oficio (Legal)', a5: 'A5', a3: 'A3', tabloid: 'Tabloide',
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function resolvePaper(spec: PaperSpec = 'letter', landscape = false): PageBox {
  let box: PageBox;
  if (typeof spec === 'string') box = PAPERS[spec] ?? PAPERS.letter;
  else if ('widthMm' in spec) box = { w: spec.widthMm * MM, h: spec.heightMm * MM };
  else box = { w: spec.widthPt, h: spec.heightPt };
  // Medidas absurdas (0, negativas, NaN) no deben producir un PDF roto: se acotan a un rango razonable (≈ 100 mm a 1,2 m).
  const w = clamp(Number.isFinite(box.w) ? box.w : PAPERS.letter.w, 280, 3400);
  const h = clamp(Number.isFinite(box.h) ? box.h : PAPERS.letter.h, 280, 3400);
  const lo = Math.min(w, h);
  const hi = Math.max(w, h);
  return landscape ? { w: hi, h: lo } : { w: lo, h: hi };
}

/** Medidas derivadas de la hoja. `s` es la escala tipográfica: 1 equivale a una hoja Carta vertical. */
export interface PageLayout {
  page: PageBox;
  s: number;
  /** Márgenes laterales y posición del área útil (puntos). */
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  /** Franja del encabezado y del pie corrido. */
  headerTop: number;
  headerRule: number;
  footerBase: number;
}

export function layoutFor(page: PageBox, fit = 1): PageLayout {
  const short = Math.min(page.w, page.h);
  // La escala sigue al lado corto: una hoja horizontal no agranda la letra, solo gana ancho de línea.
  // `fit` (≤ 1) permite reducir un poco la tipografía para evitar una última hoja casi vacía.
  const s = clamp(short / 612, 0.8, 1.6) * clamp(fit, 0.7, 1);
  const mx = clamp(short * 0.085, 26, 96);
  const headerTop = 28 * s;
  const headerRule = headerTop + 30 * s;
  const top = headerRule + 20 * s;
  const footerBase = page.h - 24 * s;
  const bottom = page.h - 46 * s;
  return {
    page, s,
    left: mx, right: page.w - mx, top, bottom,
    width: page.w - 2 * mx, height: bottom - top,
    headerTop, headerRule, footerBase,
  };
}

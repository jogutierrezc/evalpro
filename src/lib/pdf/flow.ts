/**
 * Motor de paginación para PDF vectorial (texto seleccionable, archivo liviano, nítido al imprimir).
 *
 * Por qué existe: el navegador solo entrega un PDF a través del diálogo de impresión, y un envío automático por correo
 * necesita los bytes. Este motor arma el documento con jsPDF pero decide la página igual que lo haría el CSS del acta:
 *   - Área útil calculada desde el papel (paper.ts): sirve para Carta, A4, Legal, A5, A3, Tabloide y medidas personalizadas.
 *   - Un párrafo que se parte entre páginas nunca deja una línea sola arriba (huérfana) ni abajo (viuda).
 *   - Los bloques indivisibles (gráfico, título con su primer contenido) saltan completos a la hoja siguiente.
 *   - Las tablas no parten filas, repiten su encabezado en cada página y mantienen unidas las filas que se piden juntas
 *     (una sección con su primer criterio, el último criterio con el total).
 *   - Encabezado corrido, pie con «Página n de N» y bordes de tabla correctos en cada segmento.
 */
import type { jsPDF } from 'jspdf';
import { PageBox, PageLayout, PaperSpec, layoutFor, resolvePaper } from './paper';

export type RGB = [number, number, number];
export const rgb = (h: string): RGB => {
  const v = h.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

export const INK = rgb('#0f172a');
export const MUTED = rgb('#475569');
export const ACCENT = rgb('#1d4ed8');

/** Las fuentes estándar de PDF usan Latin-1: se conservan tildes, ñ, ¿ y ¡ y se sustituye lo que no existe en ellas. */
// Espacios especiales y caracteres invisibles, armados con códigos para que el fuente no lleve caracteres ambiguos.
const ESPACIOS = new RegExp('[' + String.fromCharCode(0xa0, 0x2007, 0x202f) + ']', 'g');
const INVISIBLES = new RegExp('[' + String.fromCharCode(0x200b) + '-' + String.fromCharCode(0x200d, 0xfeff) + ']', 'g');

export function clean(s: unknown): string {
  return String(s ?? '')
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/•/g, '·')
    .replace(/→/g, '->')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(ESPACIOS, ' ')
    .replace(INVISIBLES, '')
    .replace(/[^\t\n\x20-\x7E¡-ÿ]/g, '');
}

export interface FlowBrand {
  /** Logo ya cargado como data URL (PNG/JPEG) con su proporción ancho/alto. Si falta, solo se escribe la marca. */
  logo?: { data: string; ratio: number; format?: 'PNG' | 'JPEG' } | null;
  /** Palabra al lado del logo (Eval). */
  wordmark?: string;
  /** Texto a la derecha del encabezado. */
  right?: string;
  /** Texto a la izquierda del pie, junto a «Página n de N». */
  footerLeft?: string;
}

export interface FlowOptions {
  paper?: PaperSpec;
  landscape?: boolean;
  title: string;
  author?: string;
  subject?: string;
  brand: FlowBrand;
  /** Reducción de la tipografía (1 = tamaño normal). La usa el ajuste automático de páginas. */
  fit?: number;
}

export interface TextOpts {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
  /** Ancho de la columna de texto (por defecto, todo el ancho útil). */
  width?: number;
  /** Margen izquierdo del texto (por defecto, el margen de la hoja). */
  x?: number;
  /** Interlineado como múltiplo del cuerpo de letra. */
  lh?: number;
  /** Espacio que se deja debajo. */
  after?: number;
}

export interface TCell {
  text: string;
  bold?: boolean;
  color?: RGB;
  align?: 'left' | 'center' | 'right';
  /** Solo en la primera columna: número de criterio (gris) o insignia numerada (secciones). */
  prefix?: { text: string; badge?: boolean };
}
export interface TRow {
  cells: TCell[];
  fill?: RGB;
  bold?: boolean;
  /** La fila debe quedar en la misma página que la siguiente (una sección y su primer criterio, el último criterio y el total). */
  keepWithNext?: boolean;
  /** Línea superior más marcada. */
  strongTop?: boolean;
}
export interface TCol { header: string; width: number; align?: 'left' | 'center' | 'right' }
export interface TableSpec {
  cols: TCol[];
  rows: TRow[];
  band?: string;
  fontSize: number;
  pad: number;
  bandFill: RGB;
  headFill: RGB;
  border: RGB;
  grid: RGB;
  badge: RGB;
}

export class PdfFlow {
  readonly doc: jsPDF;
  readonly L: PageLayout;
  y = 0;
  private readonly box: PageBox;
  private readonly orient: 'p' | 'l';
  private readonly brand: FlowBrand;

  private constructor(doc: jsPDF, box: PageBox, brand: FlowBrand, fit: number) {
    this.doc = doc;
    this.box = box;
    this.L = layoutFor(box, fit);
    this.orient = box.w > box.h ? 'l' : 'p';
    this.brand = brand;
  }

  static async create(o: FlowOptions): Promise<PdfFlow> {
    const { jsPDF: JsPDF } = await import('jspdf');
    const box = resolvePaper(o.paper, o.landscape);
    const doc = new JsPDF({
      unit: 'pt',
      format: [Math.min(box.w, box.h), Math.max(box.w, box.h)],
      orientation: box.w > box.h ? 'l' : 'p',
      compress: true,
      putOnlyUsedFonts: true,
    });
    doc.setProperties({ title: clean(o.title), subject: clean(o.subject ?? ''), author: clean(o.author ?? 'Aluna Eval'), creator: 'Aluna Eval - Universidad de Santander' });
    const f = new PdfFlow(doc, box, o.brand, o.fit ?? 1);
    f.drawHeader();
    f.y = f.L.top;
    return f;
  }

  /* ---------- medidas ---------- */

  get s() { return this.L.s; }
  get remaining() { return this.L.bottom - this.y; }
  get pageBody() { return this.L.height; }

  /** Salta de página si no caben `h` puntos. Devuelve true si saltó. */
  ensure(h: number): boolean {
    if (this.y + h > this.L.bottom + 0.5 && this.y > this.L.top + 1) { this.newPage(); return true; }
    return false;
  }

  gap(h: number) {
    this.y += h;
    // Un espacio al final de la hoja no se arrastra a la siguiente.
    if (this.y > this.L.bottom) this.y = this.L.bottom;
  }

  newPage() {
    this.doc.addPage([Math.min(this.box.w, this.box.h), Math.max(this.box.w, this.box.h)], this.orient);
    this.drawHeader();
    this.y = this.L.top;
  }

  /* ---------- texto ---------- */

  private font(size: number, bold = false, italic = false) {
    this.doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal');
    this.doc.setFontSize(size);
  }

  measure(str: string, o: TextOpts = {}) {
    const size = o.size ?? 10 * this.s;
    this.font(size, o.bold, o.italic);
    const width = o.width ?? this.L.width;
    const lines = this.doc.splitTextToSize(clean(str), Math.max(width, 10)) as string[];
    const lineH = size * (o.lh ?? 1.38);
    return { lines, lineH, size, h: lines.length * lineH };
  }

  /** Línea base para centrar el texto dentro de su línea. */
  private baseline(top: number, lineH: number, size: number) { return top + lineH / 2 + size * 0.34; }

  /** Escribe un párrafo y lo parte entre páginas cuidando huérfanas y viudas. Devuelve el alto usado. */
  text(str: string, o: TextOpts = {}): number {
    const { lines, lineH, size } = this.measure(str, o);
    const x0 = o.x ?? this.L.left;
    const w = o.width ?? this.L.width;
    const ax = o.align === 'center' ? x0 + w / 2 : o.align === 'right' ? x0 + w : x0;
    let i = 0;
    let used = 0;
    while (i < lines.length) {
      const left = lines.length - i;
      let cap = Math.floor((this.L.bottom - this.y + 0.5) / lineH);
      const atTop = this.y <= this.L.top + 1;
      if (cap < left) {
        if (left - cap === 1 && cap >= 3) cap -= 1;          // no dejar una sola línea en la hoja siguiente (viuda)
        if (cap < 2 && !atTop) { this.newPage(); continue; } // no dejar una sola línea al pie (huérfana)
      }
      cap = Math.max(1, Math.min(cap, left));
      this.font(size, o.bold, o.italic);
      this.doc.setTextColor(...(o.color ?? INK));
      for (let k = 0; k < cap; k++) {
        this.doc.text(lines[i + k], ax, this.baseline(this.y + k * lineH, lineH, size), { align: o.align ?? 'left' });
      }
      this.y += cap * lineH;
      used += cap * lineH;
      i += cap;
      if (i < lines.length) this.newPage();
    }
    this.gap(o.after ?? 0);
    return used + (o.after ?? 0);
  }

  /** Reserva `h` puntos (salta de página si no caben) y deja que `draw` dibuje desde la posición actual. */
  block(h: number, draw: (y: number) => void, keepAfter = 0) {
    this.ensure(h + keepAfter);
    draw(this.y);
    this.y += h;
  }

  /* ---------- tabla ---------- */

  private cellLines(c: TCell, width: number, fs: number, bold: boolean) {
    this.font(fs, bold);
    return this.doc.splitTextToSize(clean(c.text), Math.max(width, 8)) as string[];
  }

  /**
   * Tabla con encabezado repetido, filas indivisibles y grupos que no se separan.
   * `tail` es el alto de lo que va justo debajo y debe acompañar a las últimas filas (la nota de la tabla).
   */
  table(t: TableSpec, tail = 0) {
    const fs = t.fontSize;
    const lh = 1.28;
    const lineH = fs * lh;
    const pad = t.pad;
    const W = this.L.width;
    const total = t.cols.reduce((a, c) => a + c.width, 0) || 1;
    const cw = t.cols.map((c) => (c.width / total) * W);
    const cx: number[] = [];
    cw.reduce((acc, w, i) => { cx[i] = this.L.left + acc; return acc + w; }, 0);

    // Ancho de los prefijos de la primera columna (número de criterio o insignia).
    this.font(fs);
    const numW = Math.max(0, ...t.rows.map((r) => (r.cells[0]?.prefix && !r.cells[0].prefix.badge ? this.doc.getTextWidth(clean(r.cells[0].prefix.text)) : 0)));
    const prefixW = (r: TRow) => (r.cells[0]?.prefix ? (r.cells[0].prefix.badge ? fs * 1.55 + 5 : numW + 6) : 0);

    // Alto del encabezado de columnas.
    this.font(fs, true);
    const headLines = t.cols.map((c, i) => this.doc.splitTextToSize(clean(c.header), Math.max(cw[i] - 2 * pad, 8)) as string[]);
    const headH = Math.max(...headLines.map((l) => l.length)) * lineH + 2 * pad + 1;
    const bandH = t.band ? fs * 1.9 : 0;

    // Alto de cada fila.
    const heights = t.rows.map((r) => {
      let h = lineH + 2 * pad;
      r.cells.forEach((c, i) => {
        const textW = cw[i] - 2 * pad - (i === 0 ? prefixW(r) : 0);
        const n = this.cellLines(c, textW, fs, !!(c.bold ?? r.bold)).length;
        h = Math.max(h, n * lineH + 2 * pad);
      });
      return h;
    });

    // Grupos de filas que no se separan.
    const groups: number[][] = [];
    let cur: number[] = [];
    t.rows.forEach((r, i) => {
      cur.push(i);
      if (!r.keepWithNext || i === t.rows.length - 1) { groups.push(cur); cur = []; }
    });
    const groupH = (g: number[]) => g.reduce((a, i) => a + heights[i], 0);
    const head = bandH + headH;

    let segTop = 0;
    const drawHead = (cont: boolean) => {
      segTop = this.y;
      const d = this.doc;
      if (t.band) {
        d.setFillColor(...t.bandFill);
        d.rect(this.L.left, this.y, W, bandH, 'F');
        this.font(fs, true);
        d.setTextColor(255, 255, 255);
        d.text(clean(cont ? `${t.band} (continuación)` : t.band), this.L.left + W / 2, this.baseline(this.y, bandH, fs), { align: 'center' });
        this.y += bandH;
      }
      d.setFillColor(...t.headFill);
      d.rect(this.L.left, this.y, W, headH, 'F');
      this.font(fs, true);
      d.setTextColor(...INK);
      t.cols.forEach((c, i) => {
        const align = c.align ?? (i === 0 ? 'left' : 'center');
        const lines = headLines[i];
        const ax = align === 'left' ? cx[i] + pad : align === 'right' ? cx[i] + cw[i] - pad : cx[i] + cw[i] / 2;
        const top = this.y + (headH - lines.length * lineH) / 2;
        lines.forEach((ln, k) => d.text(ln, ax, this.baseline(top + k * lineH, lineH, fs), { align }));
      });
      d.setDrawColor(...t.border);
      d.setLineWidth(0.6);
      d.line(this.L.left, this.y + headH, this.L.left + W, this.y + headH);
      d.setDrawColor(...t.grid);
      d.setLineWidth(0.4);
      for (let i = 1; i < cx.length; i++) d.line(cx[i], this.y, cx[i], this.y + headH);
      this.y += headH;
    };
    const endSeg = () => {
      const d = this.doc;
      d.setDrawColor(...t.border);
      d.setLineWidth(0.7);
      d.rect(this.L.left, segTop, W, this.y - segTop, 'S');
    };
    const drawRow = (r: TRow, h: number, first: boolean) => {
      const d = this.doc;
      if (r.fill) { d.setFillColor(...r.fill); d.rect(this.L.left, this.y, W, h, 'F'); }
      if (!first) {
        d.setDrawColor(...(r.strongTop ? t.border : t.grid));
        d.setLineWidth(r.strongTop ? 0.7 : 0.4);
        d.line(this.L.left, this.y, this.L.left + W, this.y);
      }
      d.setDrawColor(...t.grid);
      d.setLineWidth(0.4);
      for (let i = 1; i < cx.length; i++) d.line(cx[i], this.y, cx[i], this.y + h);
      r.cells.forEach((c, i) => {
        const bold = !!(c.bold ?? r.bold);
        const pw = i === 0 ? prefixW(r) : 0;
        const textW = cw[i] - 2 * pad - pw;
        const lines = this.cellLines(c, textW, fs, bold);
        const align = c.align ?? t.cols[i].align ?? (i === 0 ? 'left' : 'center');
        const blockH = lines.length * lineH;
        const top = i === 0 ? this.y + pad : this.y + (h - blockH) / 2;
        if (c.prefix) {
          if (c.prefix.badge) {
            const rr = fs * 0.78;
            const bx = cx[i] + pad + rr;
            const by = this.y + pad + lineH / 2;
            d.setFillColor(...t.badge);
            d.circle(bx, by, rr, 'F');
            this.font(fs * 0.82, true);
            d.setTextColor(255, 255, 255);
            d.text(clean(c.prefix.text), bx, by + fs * 0.82 * 0.34, { align: 'center' });
          } else {
            this.font(fs);
            d.setTextColor(100, 116, 139);
            d.text(clean(c.prefix.text), cx[i] + pad, this.baseline(this.y + pad, lineH, fs));
          }
        }
        this.font(fs, bold);
        d.setTextColor(...(c.color ?? INK));
        const ax = align === 'left' ? cx[i] + pad + pw : align === 'right' ? cx[i] + cw[i] - pad : cx[i] + cw[i] / 2;
        lines.forEach((ln, k) => d.text(ln, ax, this.baseline(top + k * lineH, lineH, fs), { align }));
      });
      this.y += h;
    };

    // Todo cabe en una hoja de cuerpo completo? Un grupo más alto que la hoja se parte fila por fila.
    const body = this.L.height - head;
    const units: number[][] = [];
    groups.forEach((g) => { if (groupH(g) > body) g.forEach((i) => units.push([i])); else units.push(g); });

    this.ensure(head + (units.length ? groupH(units[0]) : 0));
    drawHead(false);
    let first = true;
    units.forEach((g, gi) => {
      const need = groupH(g) + (gi === units.length - 1 ? tail : 0);
      if (this.y + need > this.L.bottom + 0.5 && !first) {
        endSeg();
        this.newPage();
        drawHead(true);
        first = true;
      }
      g.forEach((i) => { drawRow(t.rows[i], heights[i], first); first = false; });
    });
    endSeg();
  }

  /* ---------- encabezado y pie ---------- */

  private drawHeader() {
    const d = this.doc;
    const { s, left, right, headerTop, headerRule } = this.L;
    const b = this.brand;
    const h = 26 * s;
    let x = left;
    if (b.logo) {
      try {
        const w = h * b.logo.ratio;
        d.addImage(b.logo.data, b.logo.format ?? 'PNG', x, headerTop, w, h, undefined, 'FAST');
        x += w + 3 * s;
      } catch { /* sin logo, solo texto */ }
    }
    if (b.wordmark) {
      this.font(17 * s, true);
      d.setTextColor(23, 37, 84);
      d.text(clean(b.wordmark), x, headerTop + h * 0.66);
    }
    if (b.right) {
      this.font(8.2 * s);
      d.setTextColor(...MUTED);
      d.text(clean(b.right), right, headerTop + h * 0.62, { align: 'right' });
    }
    d.setDrawColor(203, 213, 225);
    d.setLineWidth(0.7);
    d.line(left, headerRule, right, headerRule);
    d.setDrawColor(...ACCENT);
    d.setLineWidth(2);
    d.line(left, headerRule, left + 38 * s, headerRule);
  }

  private drawFooters() {
    const d = this.doc;
    const n = d.getNumberOfPages();
    const { s, left, right, footerBase, page } = this.L;
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setDrawColor(226, 232, 240);
      d.setLineWidth(0.6);
      d.line(left, page.h - 40 * s, right, page.h - 40 * s);
      this.font(7.8 * s);
      d.setTextColor(100, 116, 139);
      if (this.brand.footerLeft) d.text(clean(this.brand.footerLeft), left, footerBase);
      d.text(`Página ${i} de ${n}`, right, footerBase, { align: 'right' });
    }
  }

  /** Termina el documento (pie con «Página n de N») y devuelve los bytes. */
  finish(): { bytes: Uint8Array; pages: number; lastFill: number } {
    const lastFill = Math.min(1, Math.max(0, (this.y - this.L.top) / this.L.height));
    this.drawFooters();
    const buf = this.doc.output('arraybuffer');
    return { bytes: new Uint8Array(buf), pages: this.doc.getNumberOfPages(), lastFill };
  }
}

/** Base64 de unos bytes, válido en el navegador y en Node. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

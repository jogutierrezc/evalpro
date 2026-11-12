// Certificado de firma electrónica con OTP (PDF). Lo emite un administrador a partir de la trazabilidad guardada
// por la función feedback-otp. Es un módulo puro (no toca la base): recibe los datos y devuelve los bytes del PDF.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import qrcode from 'https://esm.sh/qrcode-generator@1.4.4';

export interface CertSigner {
  rol: 'evaluador' | 'evaluado';
  nombre: string;
  cargo: string;
  correo: string;
  firmadoEn: string | null;
  firmaId: string | null;
  ip: string;
  dispositivo: string;
}
export interface CertEvent {
  at: string;
  etiqueta: string;
  actor: string;
  ip: string;
}
export interface CertMail {
  rol: string;
  destino: string;
  enviadoEn: string | null;
  abiertoEn: string | null;
  aperturas: number;
  estado: string;
}
export interface CertData {
  numero: string;
  version: number;
  codigo: string;
  verificarUrl: string;
  emitidoEn: string;
  emitidoPor: string;
  acta: { numero: string; oficina: string; fecha: string; lugar: string; objetivo: string; huella: string };
  firmantes: CertSigner[];
  eventos: CertEvent[];
  correos: CertMail[];
  textoLegal: string;
  institucion: string;
}

const W = 595.28;
const H = 841.89;
const M = 46;
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.31, 0.36, 0.43);
const BLUE = rgb(0.212, 0.373, 0.569); // #365f91, igual que la banda del acta
const LIGHT = rgb(0.863, 0.91, 0.961); // #dce8f5
const LINE = rgb(0.78, 0.83, 0.89);

// Las fuentes estándar de PDF solo codifican WinAnsi: se reemplaza lo demás para que no falle.
const CP1252_EXTRA = '–—‘’“”•…€';
export const wa = (s: string) =>
  String(s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^ -~ -ÿ]/g, (c) => (CP1252_EXTRA.includes(c) ? c : '?'));

const TZ = 'America/Bogota';
export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).reduce((a: Record<string, string>, x) => ((a[x.type] = x.value), a), {});
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

class Doc {
  pdf!: PDFDocument;
  reg!: PDFFont;
  bold!: PDFFont;
  mono!: PDFFont;
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];

  async init() {
    this.pdf = await PDFDocument.create();
    this.reg = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.mono = await this.pdf.embedFont(StandardFonts.Courier);
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.pages.push(this.page);
    this.y = H - M;
  }

  ensure(h: number) {
    if (this.y - h < M + 28) {
      this.newPage();
      this.page.drawText(wa('Certificado de firma electrónica (continuación)'), { x: M, y: H - M + 4, size: 8.5, font: this.reg, color: MUTED });
      this.y = H - M - 16;
    }
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const out: string[] = [];
    for (const para of wa(text).split(/ {2,}\|\| {2,}/)) {
      let line = '';
      for (const word of para.split(' ')) {
        // Una palabra más larga que la línea (huella, agente de usuario) se parte por caracteres.
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (line) { out.push(line); line = ''; }
          out.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= width) line = test;
        else { if (line) out.push(line); line = w; }
      }
      out.push(line);
    }
    return out;
  }

  text(t: string, o: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; width?: number; gap?: number; lh?: number } = {}) {
    const size = o.size ?? 9.5;
    const font = o.font ?? this.reg;
    const lh = o.lh ?? size * 1.38;
    const lines = this.wrap(t, font, size, o.width ?? W - 2 * M - ((o.x ?? M) - M));
    for (const l of lines) {
      this.ensure(lh);
      this.page.drawText(l, { x: o.x ?? M, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= lh;
    }
    this.y -= o.gap ?? 0;
  }

  heading(t: string) {
    this.ensure(34);
    this.y -= 6;
    this.page.drawRectangle({ x: M, y: this.y - 17, width: W - 2 * M, height: 17, color: BLUE });
    this.page.drawText(wa(t.toUpperCase()), { x: M + 8, y: this.y - 12, size: 9, font: this.bold, color: rgb(1, 1, 1) });
    this.y -= 17 + 6;
  }

  /** Filas etiqueta/valor con filete inferior. */
  kv(rows: [string, string, boolean?][], labelW = 130) {
    for (const [k, v, mono] of rows) {
      const font = mono ? this.mono : this.reg;
      const size = mono ? 8.2 : 9.3;
      const lines = this.wrap(v || '-', font, size, W - 2 * M - labelW - 14);
      const h = Math.max(1, lines.length) * size * 1.4 + 8;
      this.ensure(h);
      this.page.drawText(wa(k), { x: M + 6, y: this.y - 6 - 8, size: 8.6, font: this.bold, color: BLUE });
      lines.forEach((l, i) => this.page.drawText(l, { x: M + labelW, y: this.y - 6 - 8 - i * size * 1.4, size, font, color: INK }));
      this.y -= h;
      this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.5, color: LINE });
    }
  }

  qr(url: string, x: number, y: number, size: number) {
    const q = qrcode(0, 'M');
    q.addData(url);
    q.make();
    const n = q.getModuleCount();
    const cell = size / n;
    this.page.drawRectangle({ x: x - 4, y: y - 4, width: size + 8, height: size + 8, color: rgb(1, 1, 1), borderColor: LINE, borderWidth: 0.6 });
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (q.isDark(r, c)) this.page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell + 0.15, height: cell + 0.15, color: INK });
      }
    }
  }
}

export async function construirCertificado(d: CertData): Promise<Uint8Array> {
  const D = new Doc();
  await D.init();

  // Cabecera
  D.page.drawRectangle({ x: 0, y: H - 92, width: W, height: 92, color: BLUE });
  D.page.drawText(wa(d.institucion.toUpperCase()), { x: M, y: H - 34, size: 9, font: D.bold, color: rgb(0.86, 0.91, 0.97) });
  D.page.drawText(wa('Certificado de firma electrónica con código OTP'), { x: M, y: H - 58, size: 18, font: D.bold, color: rgb(1, 1, 1) });
  D.page.drawText(wa('Proceso de retroalimentación de la evaluación de desempeño'), { x: M, y: H - 76, size: 9.5, font: D.reg, color: rgb(0.86, 0.91, 0.97) });
  D.y = H - 92 - 16;

  // Número y fecha de expedición
  D.page.drawRectangle({ x: M, y: D.y - 40, width: W - 2 * M, height: 40, color: LIGHT });
  D.page.drawText(wa('Certificado No.'), { x: M + 10, y: D.y - 15, size: 8, font: D.reg, color: MUTED });
  D.page.drawText(wa(`${d.numero}${d.version > 1 ? ` (versión ${d.version})` : ''}`), { x: M + 10, y: D.y - 31, size: 13, font: D.bold, color: INK });
  D.page.drawText(wa('Expedido'), { x: M + 250, y: D.y - 15, size: 8, font: D.reg, color: MUTED });
  D.page.drawText(wa(fechaHora(d.emitidoEn) + ' (hora de Colombia)'), { x: M + 250, y: D.y - 31, size: 10, font: D.bold, color: INK });
  D.y -= 40 + 8;

  D.heading('1. Documento firmado');
  D.kv([
    ['Acta No.', d.acta.numero],
    ['Oficina productora', d.acta.oficina],
    ['Fecha y lugar', `${d.acta.fecha}${d.acta.lugar ? ', ' + d.acta.lugar : ''}`],
    ['Objetivo', d.acta.objetivo],
    ['Huella SHA-256 del contenido', d.acta.huella || 'No disponible', true],
  ], 150);

  D.heading('2. Firmantes y método de autenticación');
  D.text('Método: firma electrónica con código de un solo uso (OTP) de 6 dígitos, enviado al correo institucional de cada firmante, vigente 5 minutos y con 3 intentos. El código no se almacena: solo su resumen criptográfico.', { size: 8.8, color: MUTED, gap: 6 });
  for (const f of d.firmantes) {
    D.kv([
      [f.rol === 'evaluador' ? 'Persona evaluadora' : 'Persona evaluada', `${f.nombre}${f.cargo ? ', ' + f.cargo : ''}`],
      ['Correo de verificación', f.correo],
      ['Firmó el', f.firmadoEn ? `${fechaHora(f.firmadoEn)} (hora de Colombia)` : 'Pendiente de firma'],
      ['ID de transacción', f.firmaId || '-'],
      ['Dirección IP', f.ip || 'No registrada'],
      ['Dispositivo', f.dispositivo || 'No registrado'],
    ], 150);
    D.y -= 6;
  }

  if (d.correos.length) {
    D.heading('3. Entrega de los códigos por correo');
    D.ensure(20);
    const cols = [M, M + 120, M + 245, M + 355, M + 440];
    D.page.drawRectangle({ x: M, y: D.y - 18, width: W - 2 * M, height: 18, color: LIGHT, opacity: 0.6 });
    ['Firmante', 'Enviado', 'Primera apertura', 'Aperturas', 'Estado'].forEach((t, i) => D.page.drawText(wa(t), { x: cols[i] + 4, y: D.y - 12, size: 8.2, font: D.bold, color: BLUE }));
    D.y -= 18;
    for (const m of d.correos) {
      D.ensure(22);
      const cells = [m.rol === 'evaluador' ? 'Evaluadora' : 'Evaluada', fechaHora(m.enviadoEn), fechaHora(m.abiertoEn), String(m.aperturas), m.estado];
      cells.forEach((t, i) => D.page.drawText(wa(t), { x: cols[i] + 4, y: D.y - 13, size: 8.2, font: D.reg, color: INK }));
      D.y -= 20;
      D.page.drawLine({ start: { x: M, y: D.y }, end: { x: W - M, y: D.y }, thickness: 0.5, color: LINE });
    }
    D.text('La apertura del correo se registra con una imagen de rastreo; algunos clientes de correo la bloquean, por eso su ausencia no prueba que el mensaje no se haya leído.', { size: 8, color: MUTED, gap: 4 });
  }

  D.heading('4. Trazabilidad cronológica');
  if (!d.eventos.length) D.text('No hay eventos registrados.', { size: 9, color: MUTED });
  else {
    D.ensure(20);
    const c = [M, M + 108, M + 360];
    D.page.drawRectangle({ x: M, y: D.y - 18, width: W - 2 * M, height: 18, color: LIGHT, opacity: 0.6 });
    ['Fecha y hora (Colombia)', 'Evento', 'Dirección IP'].forEach((t, i) => D.page.drawText(wa(t), { x: c[i] + 4, y: D.y - 12, size: 8.2, font: D.bold, color: BLUE }));
    D.y -= 18;
    for (const e of d.eventos) {
      const lines = D.wrap(`${e.etiqueta}${e.actor ? ' - ' + e.actor : ''}`, D.reg, 8.2, 245);
      const h = Math.max(1, lines.length) * 11.4 + 7;
      D.ensure(h);
      D.page.drawText(wa(fechaHora(e.at)), { x: c[0] + 4, y: D.y - 12, size: 8.2, font: D.mono, color: INK });
      lines.forEach((l, i) => D.page.drawText(l, { x: c[1] + 4, y: D.y - 12 - i * 11.4, size: 8.2, font: D.reg, color: INK }));
      D.page.drawText(wa(e.ip || '-'), { x: c[2] + 4, y: D.y - 12, size: 8.2, font: D.mono, color: INK });
      D.y -= h;
      D.page.drawLine({ start: { x: M, y: D.y }, end: { x: W - M, y: D.y }, thickness: 0.5, color: LINE });
    }
  }
  D.y -= 4;

  // Verificación: QR + instrucciones
  D.heading('5. Verificación de autenticidad');
  D.ensure(112);
  const top = D.y;
  D.qr(d.verificarUrl, M + 4, top - 96, 92);
  const tx = M + 112;
  const bw = W - M - tx;
  let ty = top - 4;
  const para = (t: string, font: PDFFont, size: number, color = INK) => {
    for (const l of D.wrap(t, font, size, bw)) { D.page.drawText(l, { x: tx, y: ty - size, size, font, color }); ty -= size * 1.4; }
    ty -= 3;
  };
  para('Escanee el código QR o ingrese a la dirección de verificación e indique el código. La página confirma que este certificado existe, su estado y los datos de la firma. También permite cargar el PDF para comprobar que no fue alterado.', D.reg, 8.8, MUTED);
  para(d.verificarUrl, D.mono, 7.6);
  para(`Código de verificación: ${d.codigo}`, D.bold, 10, BLUE);
  D.y = top - 104;

  D.heading('6. Fundamento legal');
  D.text(d.textoLegal, { size: 8.8, gap: 8, color: INK });

  D.ensure(60);
  D.text(`Expedido por: ${d.emitidoPor}`, { size: 9, font: D.bold, gap: 0 });
  D.text('Administración EvalPro, ' + d.institucion, { size: 8.6, color: MUTED });
  D.text('Este certificado se genera automáticamente con los registros de trazabilidad del sistema. Su integridad se comprueba con la huella SHA-256 del archivo, guardada al momento de la expedición.', { size: 8, color: MUTED });

  // Pie en todas las páginas
  const total = D.pages.length;
  D.pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 6 }, end: { x: W - M, y: M - 6 }, thickness: 0.5, color: LINE });
    p.drawText(wa(`Certificado ${d.numero}  |  Código ${d.codigo}`), { x: M, y: M - 20, size: 7.8, font: D.reg, color: MUTED });
    const t = `Página ${i + 1} de ${total}`;
    p.drawText(t, { x: W - M - D.reg.widthOfTextAtSize(t, 7.8), y: M - 20, size: 7.8, font: D.reg, color: MUTED });
  });

  D.pdf.setTitle(wa(`Certificado de firma electrónica ${d.numero}`));
  D.pdf.setAuthor(wa(d.institucion));
  D.pdf.setSubject(wa(`Acta ${d.acta.numero}`));
  D.pdf.setProducer('EvalPro');
  return await D.pdf.save();
}

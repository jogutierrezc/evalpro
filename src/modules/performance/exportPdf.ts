import type { PerformanceReport } from './usePerformanceReport';

/**
 * Descarga del reporte de desempeño como PDF real (tamaño carta): texto seleccionable y gráficos en vectores.
 * Las librerías se cargan solo al exportar, para no pesar en la pantalla del reporte.
 */

type RGB = readonly [number, number, number];
const C = {
  leader: [29, 78, 216] as RGB, self: [194, 65, 12] as RGB, office: [100, 116, 139] as RGB,
  ink: [15, 23, 42] as RGB, body: [51, 65, 85] as RGB, muted: [100, 116, 139] as RGB,
  line: [226, 232, 240] as RGB, soft: [248, 250, 252] as RGB, tick: [203, 213, 225] as RGB,
  ok: [4, 120, 87] as RGB, bad: [190, 18, 60] as RGB, white: [255, 255, 255] as RGB,
};

const TOL = 0.1;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toFixed(2).replace('.', ','));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const relOf = (v: number | null, ref: number | null) => {
  if (v === null || ref === null) return null;
  const delta = round2(v - ref);
  return { delta, label: delta >= TOL ? 'Sobre la media' : delta <= -TOL ? 'Debajo de la media' : 'En la media', color: delta >= TOL ? C.ok : delta <= -TOL ? C.bad : C.muted };
};
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

async function loadImage(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

export interface PdfContext {
  periodLabel: string;
}

export async function buildPerformancePdf(report: PerformanceReport, ctx: PdfContext): Promise<{ doc: any; filename: string }> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc: any = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
  const W = doc.internal.pageSize.getWidth();   // 612
  const H = doc.internal.pageSize.getHeight();  // 792
  const M = 40;
  const CW = W - M * 2;
  const GState = doc.GState;

  const color = (kind: 'text' | 'draw' | 'fill', c: RGB) => {
    if (kind === 'text') doc.setTextColor(c[0], c[1], c[2]);
    else if (kind === 'draw') doc.setDrawColor(c[0], c[1], c[2]);
    else doc.setFillColor(c[0], c[1], c[2]);
  };
  const text = (s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center'; maxWidth?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    color('text', o.color ?? C.ink);
    doc.text(s, x, y, { align: o.align ?? 'left', maxWidth: o.maxWidth, baseline: 'alphabetic' });
  };

  const name = report.person.name.trim();
  const { competencies } = report;
  const bench = report.benchmark;
  const multi = report.leaders.length > 1;
  const firstName = (full: string) => full.trim().split(/\s+/)[0] || full;

  /* ---------- Encabezado: logo, título y datos de la persona y la evaluación ---------- */
  const logo = await loadImage(`${import.meta.env.BASE_URL}acta/udes.png`);
  if (logo) {
    const props = doc.getImageProperties(logo);
    const lw = 118;
    doc.addImage(logo, 'PNG', M, 34, lw, (props.height / props.width) * lw);
  }
  text('Reporte de desempeño', W - M, 56, { size: 19, bold: true, align: 'right' });
  text(report.template, W - M, 73, { size: 10, color: C.muted, align: 'right' });
  color('draw', C.line); doc.setLineWidth(0.8); doc.line(M, 92, W - M, 92);

  const field = (label: string, value: string, x: number, y: number, w: number, strong = false) => {
    text(label.toUpperCase(), x, y, { size: 6.8, bold: true, color: C.muted });
    const lines: string[] = doc.splitTextToSize(value || '-', w);
    if (lines.length > 2) lines[1] = lines[1].replace(/.{0,3}$/, '') + '...';
    text(lines.slice(0, 2).join('\n'), x, y + 12, { size: strong ? 12 : 10, bold: strong, color: C.ink });
  };
  field('Colaborador', name, M, 112, 300, true);
  field('Cargo o rol', report.person.role, M, 148, 250);
  field('Oficina', report.person.office || 'Sin oficina asignada', M, 184, 250);
  field('Evaluación', report.template, 330, 112, 242);
  field(multi ? 'Fechas de las evaluaciones' : 'Fecha de la evaluación', Array.from(new Set(report.leaders.map((l) => l.date))).join(', '), 330, 148, 242);
  field('Periodo', ctx.periodLabel, 330, 184, 242);
  field(multi ? 'Líderes evaluadores' : 'Evaluador', report.leaders.map((l) => l.name).join('; '), 330, 220, 242);

  /* ---------- Resumen global ---------- */
  const sy = 244;
  const sh = 66;
  color('draw', C.line); color('fill', C.soft); doc.setLineWidth(0.8);
  doc.roundedRect(M, sy, CW, sh, 4, 4, 'FD');
  const colW = CW / 5;
  for (let i = 1; i < 5; i++) doc.line(M + colW * i, sy + 8, M + colW * i, sy + sh - 8);
  const gap = report.global.leader !== null && report.global.self !== null ? round2(report.global.self - report.global.leader) : null;
  const vs = bench.status === 'ok' ? relOf(report.global.leader, report.global.office) : null;
  const cells: { label: string; value: string; color: RGB; sub: string }[] = [
    { label: multi ? `Promedio de ${report.leaders.length} líderes` : 'Evaluación del líder', value: fmt(report.global.leader), color: C.leader, sub: multi ? 'Mismo peso por líder' : report.leaders[0].date },
    { label: 'Autoevaluación', value: report.global.self !== null ? fmt(report.global.self) : 'Pendiente', color: report.global.self !== null ? C.self : C.muted, sub: report.self ? `${report.self.date}${report.self.sameForm ? '' : ', otro formulario'}${report.self.otherPeriod ? ', otro periodo' : ''}` : 'Sin autoevaluación' },
    { label: 'Brecha auto y líder', value: gap !== null ? signed(gap) : '-', color: C.ink, sub: gap === null ? 'Faltan datos' : Math.abs(gap) < TOL ? 'Coinciden' : gap > 0 ? 'Se ve por encima' : 'Se ve por debajo' },
    { label: 'Promedio oficina', value: bench.status === 'ok' ? fmt(report.global.office) : '-', color: C.office, sub: bench.status === 'ok' ? `${bench.n} compañeros` : bench.status === 'insufficient' ? 'Menos de 3 compañeros' : 'No disponible' },
    { label: 'Líder frente a oficina', value: vs ? signed(vs.delta) : '-', color: vs ? vs.color : C.muted, sub: vs ? vs.label : 'Sin comparativo' },
  ];
  cells.forEach((c, i) => {
    const x = M + colW * i + 10;
    text(c.label, x, sy + 17, { size: 7.2, color: C.muted, maxWidth: colW - 14 });
    text(c.value, x, sy + 40, { size: 19, bold: true, color: c.color });
    text(c.sub, x, sy + 54, { size: 7, color: C.muted, maxWidth: colW - 14 });
  });

  /* ---------- Mapa de competencias ---------- */
  let y = sy + sh + 26;
  if (multi) {
    text('Evaluación por líder', M, y, { size: 12, bold: true });
    text('Cada líder que evaluó con este formulario. El resultado del resumen es el promedio, con el mismo peso para cada uno.', M, y + 12, { size: 8, color: C.muted });
    const shown = report.leaders.slice(0, 5);
    const lw = CW / shown.length;
    const ly = y + 22;
    color('draw', C.line); color('fill', C.white); doc.setLineWidth(0.8);
    doc.roundedRect(M, ly, CW, 56, 4, 4, 'FD');
    shown.forEach((l, i) => {
      const x = M + lw * i + 10;
      const rgb = (l.color.match(/\w\w/g) || ['00', '00', '00']).map((h) => parseInt(h, 16)) as unknown as RGB;
      if (i > 0) { color('draw', C.line); doc.line(M + lw * i, ly + 8, M + lw * i, ly + 48); }
      color('fill', rgb); doc.circle(x + 2.5, ly + 14, 2.5, 'F');
      text(doc.splitTextToSize(l.name, lw - 28)[0], x + 9, ly + 16, { size: 7.5, color: C.body });
      text(fmt(l.global), x, ly + 38, { size: 17, bold: true, color: rgb });
      const vsAvg = l.global !== null && report.global.leader !== null ? signed(round2(l.global - report.global.leader)) : '-';
      text(`${l.date}, ${vsAvg} del prom.`, x, ly + 50, { size: 6.5, color: C.muted, maxWidth: lw - 14 });
    });
    y = ly + 56 + 26;
  }
  text('Mapa de competencias', M, y, { size: 12, bold: true });
  text('Cada eje es una competencia. Mientras más lejos del centro, mejor resultado.', M, y + 12, { size: 8, color: C.muted });
  const top = y + 24;
  const cx = M + 130, R = 66, cy = top + 98;
  const n = competencies.length;
  const pt = (v: number, i: number): [number, number] => {
    const r = ((Math.max(v, 1) - 1) / 4) * R;
    const a = (i * Math.PI * 2) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const polygon = (points: [number, number][], style: 'S' | 'F' | 'FD') => {
    const segs = points.slice(1).map((p, i) => [p[0] - points[i][0], p[1] - points[i][1]]);
    doc.lines(segs, points[0][0], points[0][1], [1, 1], style, true);
  };

  if (n >= 3) {
    doc.setLineWidth(0.6);
    for (let level = 1; level <= 5; level++) {
      const ring = competencies.map((_, i) => pt(level, i));
      color('draw', C.line);
      if (level === 5) { color('fill', C.soft); polygon(ring, 'FD'); } else polygon(ring, 'S');
      if (level > 1) text(String(level), cx + 2, cy - ((level - 1) / 4) * R - 1.5, { size: 6, color: C.tick });
    }
    color('draw', C.line);
    competencies.forEach((_, i) => { const p = pt(5, i); doc.line(cx, cy, p[0], p[1]); });

    const series = (key: 'office' | 'self' | 'leader', rgb: RGB, dashed: boolean, width: number) => {
      if (!competencies.every((c) => c[key] !== null)) return;
      const pts = competencies.map((c, i) => pt(c[key] as number, i));
      doc.setGState(new GState({ opacity: key === 'leader' ? 0.14 : key === 'office' ? 0.1 : 0.06 }));
      color('fill', rgb); polygon(pts, 'F');
      doc.setGState(new GState({ opacity: 1 }));
      color('draw', rgb); doc.setLineWidth(width);
      if (dashed) doc.setLineDashPattern([4, 3], 0);
      polygon(pts, 'S');
      doc.setLineDashPattern([], 0);
    };
    series('office', C.office, false, 1);
    series('self', C.self, true, 1.4);
    series('leader', C.leader, false, 1.8);

    competencies.forEach((c, i) => {
      if (c.self !== null) { const p = pt(c.self, i); color('fill', C.white); color('draw', C.self); doc.setLineWidth(1); doc.circle(p[0], p[1], 2.4, 'FD'); }
      if (c.leader !== null) { const p = pt(c.leader, i); color('fill', C.leader); color('draw', C.white); doc.setLineWidth(0.6); doc.circle(p[0], p[1], 2.6, 'FD'); }
    });

    competencies.forEach((c, i) => {
      const a = (i * Math.PI * 2) / n - Math.PI / 2;
      const lx = cx + (R + 9) * Math.cos(a);
      const ly = cy + (R + 9) * Math.sin(a);
      const align = Math.cos(a) > 0.25 ? 'left' : Math.cos(a) < -0.25 ? 'right' : 'center';
      const lines: string[] = doc.splitTextToSize(c.title, 58).slice(0, 3);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); color('text', C.body);
      const yy = ly - ((lines.length - 1) * 8) / 2 + (Math.sin(a) > 0.5 ? 6 : Math.sin(a) < -0.5 ? -4 : 0);
      doc.text(lines, lx, yy, { align, baseline: 'middle', lineHeightFactor: 1.15 });
    });
  } else {
    text('El mapa necesita al menos 3 competencias evaluadas.', M, cy, { size: 8.5, color: C.muted });
  }

  // Leyenda bajo el radar
  const ly0 = cy + R + 38;
  const legend: [string, RGB, 'solid' | 'ring' | 'bar'][] = [['Líder', C.leader, 'solid'], ['Autoevaluación', C.self, 'ring'], ['Promedio oficina', C.office, 'bar']];
  let lx = M + 6;
  legend.forEach(([label, rgb, kind]) => {
    if (kind === 'solid') { color('fill', rgb); doc.circle(lx + 3, ly0 - 2.5, 3, 'F'); }
    else if (kind === 'ring') { color('fill', C.white); color('draw', rgb); doc.setLineWidth(1.1); doc.circle(lx + 3, ly0 - 2.5, 2.8, 'FD'); }
    else { color('draw', rgb); doc.setLineWidth(1.8); doc.line(lx + 3, ly0 - 6, lx + 3, ly0 + 1); }
    text(label, lx + 10, ly0, { size: 7.5, color: C.body });
    lx += 22 + doc.getTextWidth(label);
  });

  // Tabla de competencias a la derecha del radar
  autoTable(doc, {
    startY: top, margin: { left: 316, right: M },
    head: [['Competencia', 'Líder', 'Auto', 'Ofic.', 'Frente']],
    body: competencies.map((c) => {
      const r = bench.status === 'ok' ? relOf(c.leader, c.office) : null;
      return [c.title, fmt(c.leader), fmt(c.self), fmt(c.office), r ? signed(r.delta) : '-'];
    }),
    theme: 'plain',
    styles: { fontSize: 7.6, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, textColor: C.body as any, lineColor: C.line as any, lineWidth: { bottom: 0.5 }, valign: 'middle', overflow: 'linebreak' },
    headStyles: { fillColor: C.soft as any, textColor: C.muted as any, fontStyle: 'bold', fontSize: 7.2, lineWidth: { bottom: 0.8 } },
    columnStyles: { 0: { cellWidth: 'auto' }, 1: { cellWidth: 30, halign: 'right', textColor: C.leader as any, fontStyle: 'bold' }, 2: { cellWidth: 30, halign: 'right', textColor: C.self as any }, 3: { cellWidth: 30, halign: 'right' }, 4: { cellWidth: 34, halign: 'right', fontStyle: 'bold' } },
    didParseCell: (d: any) => {
      if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right';
      if (d.section === 'body' && d.column.index === 4 && bench.status === 'ok') {
        const r = relOf(competencies[d.row.index].leader, competencies[d.row.index].office);
        if (r) d.cell.styles.textColor = r.color as any;
      }
    },
  });
  y = Math.max(ly0 + 28, (doc.lastAutoTable?.finalY ?? 0) + 18);

  /* ---------- Fortalezas, oportunidades y brechas ---------- */
  const withLeader = competencies.filter((c) => c.leader !== null);
  const strengths = [...withLeader].sort((a, b) => (b.leader as number) - (a.leader as number)).slice(0, 3).map((c) => [c.title, fmt(c.leader)] as const);
  const opps = [...withLeader].sort((a, b) => (a.leader as number) - (b.leader as number)).slice(0, 3).map((c) => [c.title, fmt(c.leader)] as const);
  const gaps = competencies.filter((c) => c.leader !== null && c.self !== null)
    .map((c) => ({ c, g: round2((c.self as number) - (c.leader as number)) })).sort((a, b) => Math.abs(b.g) - Math.abs(a.g)).slice(0, 3).map((x) => [x.c.title, signed(x.g)] as const);
  const blocks: [string, string, readonly (readonly [string, string])[], RGB][] = [
    ['Mayores fortalezas', 'Mejor evaluación del líder', strengths, C.ok],
    ['Oportunidades de mejora', 'Menor evaluación del líder', opps, C.bad],
    ['Mayores brechas', 'Autoevaluación frente al líder', gaps, C.self],
  ];
  if (y + 96 > H - 56) { doc.addPage(); y = M + 10; }
  const bw = (CW - 28) / 3;
  let insightsEnd = y + 26;
  blocks.forEach(([title, hint, items, rgb], bi) => {
    const x = M + bi * (bw + 14);
    text(title, x, y, { size: 9, bold: true });
    text(hint, x, y + 10, { size: 7, color: C.muted });
    let yy = y + 26;
    if (!items.length) text('Sin datos para comparar', x, yy, { size: 8, color: C.muted });
    items.forEach(([t, v]) => {
      const lines: string[] = doc.splitTextToSize(t, bw - 34);
      text(lines.join('\n'), x, yy, { size: 8, color: C.body });
      text(v, x + bw, yy, { size: 8.5, bold: true, color: rgb, align: 'right' });
      yy += lines.length * 9.5 + 4;
    });
    insightsEnd = Math.max(insightsEnd, yy);
  });
  y = insightsEnd + 22;

  /* ---------- Criterios evaluados ---------- */
  if (y + 230 > H - 56) { doc.addPage(); y = M + 14; }
  if (multi) {
    text('Competencias por líder', M, y, { size: 13, bold: true });
    text('Nota de cada líder en cada competencia, su promedio y la autoevaluación.', M, y + 13, { size: 8, color: C.muted, maxWidth: CW });
    const rgbOf = (hex: string) => (hex.replace('#', '').match(/\w\w/g) || ['00', '00', '00']).map((h) => parseInt(h, 16)) as unknown as RGB;
    const nl = report.leaders.length;
    autoTable(doc, {
      startY: y + 24, margin: { left: M, right: M }, theme: 'plain',
      head: [['Competencia', 'Prom.', ...report.leaders.map((l) => firstName(l.name)), 'Auto']],
      body: [
        ...competencies.map((c) => [c.title, fmt(c.leader), ...report.leaders.map((l) => fmt(c.leaders[l.evaluationId] ?? null)), fmt(c.self)]),
        ['Resultado global', fmt(report.global.leader), ...report.leaders.map((l) => fmt(l.global)), fmt(report.global.self)],
      ],
      styles: { fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: C.body as any, lineColor: C.line as any, lineWidth: { bottom: 0.5 }, valign: 'middle' },
      headStyles: { fillColor: C.soft as any, textColor: C.ink as any, fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 0.9 } },
      columnStyles: { 0: { cellWidth: 'auto' } },
      didParseCell: (d: any) => {
        const ci = d.column.index;
        if (ci > 0) d.cell.styles.halign = 'right';
        const col: RGB = ci === 1 ? C.leader : ci === nl + 2 ? C.self : ci >= 2 ? rgbOf(report.leaders[ci - 2].color) : C.body;
        if (ci > 0 && d.section === 'head') d.cell.styles.textColor = col as any;
        if (ci > 0 && d.section === 'body') { d.cell.styles.textColor = col as any; if (ci === 1) d.cell.styles.fontStyle = 'bold'; }
        if (d.section === 'body' && d.row.index === competencies.length) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = C.soft as any; }
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 30;
    if (y + 90 > H - 56) { doc.addPage(); y = M + 14; }
  }
  text('Criterios evaluados', M, y, { size: 13, bold: true });
  text(`Punto sólido: ${multi ? 'promedio de los líderes' : 'líder'}. Anillo: autoevaluación. Marca vertical: promedio de la oficina. Brecha: autoevaluación menos líder.${multi ? ' Bajo cada criterio, la nota de cada líder.' : ''}`, M, y + 13, { size: 8, color: C.muted, maxWidth: CW });
  y += 28;

  // Autoevaluación de otro formulario: se explica qué es comparable y se listan sus competencias propias
  if (report.self && !report.self.sameForm) {
    const msg = `La autoevaluación es del formulario "${report.self.template}", distinto al que usó el líder ("${report.template}"). Se compara el resultado global y las competencias con el mismo nombre; los criterios no se pueden comparar uno a uno.`;
    const lines: string[] = doc.splitTextToSize(msg, CW - 16);
    color('fill', [255, 251, 235] as unknown as RGB); color('draw', [253, 230, 138] as unknown as RGB); doc.setLineWidth(0.6);
    doc.roundedRect(M, y - 6, CW, lines.length * 10 + 12, 3, 3, 'FD');
    text(lines.join('\n'), M + 8, y + 6, { size: 8, color: [120, 53, 15] as unknown as RGB });
    y += lines.length * 10 + 22;
    if (report.self.unmatched.length) {
      autoTable(doc, {
        startY: y, margin: { left: M, right: W - M - 300 }, theme: 'plain',
        head: [['Competencias propias de la autoevaluación', 'Resultado']],
        body: report.self.unmatched.map((u) => [u.title, fmt(u.score)]),
        styles: { fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 }, textColor: C.body as any, lineColor: C.line as any, lineWidth: { bottom: 0.5 } },
        headStyles: { fillColor: C.soft as any, textColor: C.ink as any, fontStyle: 'bold', fontSize: 8, lineWidth: { bottom: 0.8 } },
        columnStyles: { 1: { cellWidth: 56, halign: 'right', textColor: C.self as any, fontStyle: 'bold' } },
        didParseCell: (d: any) => { if (d.section === 'head' && d.column.index === 1) d.cell.styles.halign = 'right'; },
      });
      y = (doc.lastAutoTable?.finalY ?? y) + 18;
    }
  }

  const drawTrack = (d: any, leader: number | null, self: number | null, office: number | null) => {
    const { x, y: cy0, width, height } = d.cell;
    const x0 = x + 9, x1 = x + width - 9, cyy = cy0 + height / 2;
    const pos = (v: number) => x0 + ((Math.min(Math.max(v, 1), 5) - 1) / 4) * (x1 - x0);
    color('draw', C.line); doc.setLineWidth(1.8); doc.line(x0, cyy, x1, cyy);
    color('draw', C.tick); doc.setLineWidth(0.5);
    [2, 3, 4].forEach((t) => doc.line(pos(t), cyy - 3, pos(t), cyy + 3));
    if (leader !== null && self !== null) {
      color('draw', C.tick); doc.setLineWidth(1.4); doc.setLineDashPattern([2, 2], 0);
      doc.line(pos(Math.min(leader, self)), cyy, pos(Math.max(leader, self)), cyy);
      doc.setLineDashPattern([], 0);
    }
    if (office !== null) { color('draw', C.office); doc.setLineWidth(1.8); doc.line(pos(office), cyy - 5.5, pos(office), cyy + 5.5); }
    if (self !== null) { color('fill', C.white); color('draw', C.self); doc.setLineWidth(1.2); doc.circle(pos(self), cyy, 3.2, 'FD'); }
    if (leader !== null) { color('fill', C.leader); color('draw', C.white); doc.setLineWidth(0.8); doc.circle(pos(leader), cyy, 3.5, 'FD'); }
    doc.setLineWidth(0.5);
  };

  competencies.forEach((c) => {
    const rows = [
      { label: multi ? `Resultado de la competencia\n${report.leaders.map((l) => `${firstName(l.name)} ${fmt(c.leaders[l.evaluationId] ?? null)}`).join('    ')}` : 'Resultado de la competencia', leader: c.leader, self: c.self, office: c.office, head: true },
      ...c.criteria.map((q) => ({ label: multi ? `${q.text}\n${report.leaders.map((l) => `${firstName(l.name)} ${fmt(q.leaders[l.evaluationId] ?? null)}`).join('    ')}` : q.text, leader: q.leader, self: q.self, office: q.office, head: false })),
    ];
    // Evita dejar el título de una competencia solo al final de la página
    if (y + 70 > H - 56) { doc.addPage(); y = M + 10; }
    autoTable(doc, {
      startY: y, margin: { left: M, right: M, top: M + 6, bottom: 52 }, rowPageBreak: 'avoid',
      head: [[c.title, 'Comparación 1 a 5', 'Líder', 'Auto', 'Oficina', 'Brecha']],
      body: rows.map((r) => [r.label, '', fmt(r.leader), fmt(r.self), fmt(r.office), r.leader !== null && r.self !== null ? signed(round2(r.self - r.leader)) : '-']),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: C.body as any, lineColor: C.line as any, lineWidth: { bottom: 0.5 }, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: C.soft as any, textColor: C.ink as any, fontStyle: 'bold', fontSize: 8.8, lineWidth: { bottom: 0.9 } },
      columnStyles: {
        0: { cellWidth: 'auto' }, 1: { cellWidth: 128 },
        2: { cellWidth: 34, halign: 'right', textColor: C.leader as any, fontStyle: 'bold' }, 3: { cellWidth: 34, halign: 'right', textColor: C.self as any },
        4: { cellWidth: 38, halign: 'right', textColor: C.muted as any }, 5: { cellWidth: 38, halign: 'right' },
      },
      didParseCell: (d: any) => {
        if (d.section === 'head' && d.column.index > 0) { d.cell.styles.halign = d.column.index === 1 ? 'left' : 'right'; d.cell.styles.fontSize = 7.4; d.cell.styles.textColor = d.column.index === 2 ? (C.leader as any) : d.column.index === 3 ? (C.self as any) : (C.muted as any); }
        if (d.section === 'body' && rows[d.row.index]?.head) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = C.soft as any; d.cell.styles.textColor = d.column.index === 0 ? (C.ink as any) : d.cell.styles.textColor; }
        if (d.section === 'body' && d.column.index === 5) {
          const r = rows[d.row.index];
          if (r && r.leader !== null && r.self !== null && Math.abs(r.self - r.leader) >= 1) { d.cell.styles.textColor = C.self as any; d.cell.styles.fontStyle = 'bold'; }
        }
      },
      didDrawCell: (d: any) => {
        if (d.section === 'body' && d.column.index === 1) { const r = rows[d.row.index]; if (r) drawTrack(d, r.leader, r.self, r.office); }
      },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 16;
  });

  /* ---------- Nota metodológica y pie de página en todas las hojas ---------- */
  const note = 'Competencia: promedio de sus criterios. Resultado global: promedio de las competencias. El promedio de la oficina agrupa a los compañeros de la misma oficina evaluados con este formulario en el mismo periodo, sin incluir a la persona, y solo se publica con 3 o más compañeros. Se considera en la media a quien está dentro de 0,10 puntos del promedio.';
  const noteLines: string[] = doc.splitTextToSize(note, CW);
  if (y + noteLines.length * 9 + 10 > H - 56) { doc.addPage(); y = M + 10; }
  color('draw', C.line); doc.setLineWidth(0.6); doc.line(M, y, W - M, y);
  text(noteLines.join('\n'), M, y + 12, { size: 7, color: C.muted });

  const pages = doc.getNumberOfPages();
  const generated = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) text(`${name}, ${report.template}`, M, 26, { size: 7.5, color: C.muted });
    color('draw', C.line); doc.setLineWidth(0.6); doc.line(M, H - 40, W - M, H - 40);
    text(`Reporte de desempeño, ${name}. Documento confidencial de uso interno. Generado el ${generated}.`, M, H - 27, { size: 7, color: C.muted });
    text(`Página ${i} de ${pages}`, W - M, H - 27, { size: 7.5, color: C.body, align: 'right' });
  }

  doc.setProperties({ title: `Reporte de desempeño, ${name}`, subject: report.template, author: 'Universidad de Santander, Evalpro' });
  return { doc, filename: `Reporte-desempeno_${slug(name)}_${slug(ctx.periodLabel).slice(0, 40)}.pdf` };
}

/** Genera el PDF y lo descarga como archivo. */
export async function downloadPerformancePdf(report: PerformanceReport, ctx: PdfContext): Promise<void> {
  const { doc, filename } = await buildPerformancePdf(report, ctx);
  doc.save(filename);
}

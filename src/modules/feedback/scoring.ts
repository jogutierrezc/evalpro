// Mismo cálculo que el informe individual (PrintReportModule): promedio por sección y luego promedio de secciones.
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

function normalizeValue(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(',', '.'));
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') return Number(val.value || val.rating || val.score || val.response || 0);
  return 0;
}

export function scoreFromResponses(responses: any[]): number | null {
  const sections: Record<string, { total: number; count: number }> = {};
  responses.forEach((r) => {
    const title = r.question?.section?.title || 'General';
    const v = normalizeValue(r.response_value);
    if (v === 0) return;
    if (!sections[title]) sections[title] = { total: 0, count: 0 };
    sections[title].total += v;
    sections[title].count += 1;
  });
  const averages = Object.values(sections).map((s) => round1(s.total / s.count));
  return averages.length ? round1(mean(averages)) : null;
}

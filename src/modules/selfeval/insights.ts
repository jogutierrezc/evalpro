// Lectura de la evolución de las autoevaluaciones de una persona, con reglas simples y explicables (no usa IA).
// Escala de 1 a 5. Una autoevaluación es la percepción de la propia persona: el texto lo dice, no la presenta como un hecho.

export interface SelfCriterion { id: string; text: string; score: number }
export interface SelfCompetency { key: string; title: string; score: number | null; criteria: SelfCriterion[] }
export interface SelfEntry {
  id: string;
  templateId: string;
  template: string;
  periodId: string | null;
  periodName: string;      // corto, para el eje del gráfico
  periodFull: string;      // con fechas, para el detalle
  date: string;            // ISO
  global: number | null;
  competencies: SelfCompetency[];
}

export type Tone = 'good' | 'watch' | 'priority' | 'info';
export interface Insight { tone: Tone; title: string; detail: string }

export const TOL = 0.1;          // diferencias menores se leen como "igual"
const PRIORITY = 3.0;            // por debajo: prioridad
const WATCH = 4.0;               // por debajo: por fortalecer
const STRENGTH = 4.2;            // desde aquí: fortaleza

const f = (n: number) => n.toFixed(2).replace('.', ',');
export const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${f(Math.abs(n))}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`);

/** Entrada contra la que se compara la más reciente: misma plantilla si existe, si no la inmediatamente anterior. */
export function previousOf(entries: SelfEntry[]): SelfEntry | null {
  if (entries.length < 2) return null;
  const latest = entries[entries.length - 1];
  const earlier = entries.slice(0, -1);
  return [...earlier].reverse().find((e) => e.templateId === latest.templateId) || earlier[earlier.length - 1];
}

export function buildInsights(entries: SelfEntry[]): Insight[] {
  if (!entries.length) return [];
  const latest = entries[entries.length - 1];
  const prev = previousOf(entries);
  const out: Insight[] = [];
  const scored = latest.competencies.filter((c): c is SelfCompetency & { score: number } => c.score !== null);

  // 1) Tendencia global
  if (prev && prev.global !== null && latest.global !== null) {
    const d = round2(latest.global - prev.global);
    if (d >= TOL) out.push({ tone: 'good', title: `Tu resultado global subió ${signed(d)}`, detail: `Pasó de ${f(prev.global)} (${prev.periodName}) a ${f(latest.global)} (${latest.periodName}).` });
    else if (d <= -TOL) out.push({ tone: 'watch', title: `Tu resultado global bajó ${signed(d)}`, detail: `Pasó de ${f(prev.global)} (${prev.periodName}) a ${f(latest.global)} (${latest.periodName}). Revisa en qué competencias se concentra el cambio.` });
    else out.push({ tone: 'info', title: 'Tu resultado global se mantiene', detail: `${f(latest.global)} frente a ${f(prev.global)} del período anterior (diferencia de ${signed(d)}).` });
  } else {
    out.push({ tone: 'info', title: 'Es tu primera autoevaluación registrada', detail: 'Aún no hay un período anterior con qué comparar. En tu próxima autoevaluación verás aquí cómo cambia cada competencia.' });
  }

  // 2) Cambios por competencia (solo las que existen en ambos períodos)
  if (prev) {
    const prevByKey = new Map(prev.competencies.map((c) => [c.key, c]));
    const deltas = scored
      .map((c) => ({ c, p: prevByKey.get(c.key)?.score ?? null }))
      .filter((x): x is { c: SelfCompetency & { score: number }; p: number } => x.p !== null)
      .map((x) => ({ title: x.c.title, d: round2(x.c.score - x.p) }));
    const up = deltas.filter((x) => x.d >= TOL).sort((a, b) => b.d - a.d).slice(0, 3);
    const down = deltas.filter((x) => x.d <= -TOL).sort((a, b) => a.d - b.d).slice(0, 3);
    if (up.length) out.push({ tone: 'good', title: 'Donde más avanzaste', detail: up.map((x) => `${x.title} (${signed(x.d)})`).join('; ') + '.' });
    if (down.length) out.push({ tone: 'watch', title: 'Donde bajaste', detail: down.map((x) => `${x.title} (${signed(x.d)})`).join('; ') + '. Piensa qué cambió en tu trabajo en ese tiempo y si quieres retomarlo.' });
    if (!deltas.length) out.push({ tone: 'info', title: 'No se pueden comparar competencias', detail: 'El formulario de este período no comparte competencias con el anterior; solo se compara el resultado global.' });
  }

  // 3) Competencias que se repiten bajas / fortalezas sostenidas (con al menos 2 mediciones)
  if (entries.length >= 2) {
    const history = (key: string) => entries.map((e) => e.competencies.find((c) => c.key === key)?.score ?? null).filter((v): v is number => v !== null);
    const persistent = scored.filter((c) => { const h = history(c.key); return h.length >= 2 && h.every((v) => v < WATCH) && c.score < WATCH; }).sort((a, b) => a.score - b.score).slice(0, 3);
    const steady = scored.filter((c) => { const h = history(c.key); return h.length >= 2 && h.every((v) => v >= STRENGTH); }).slice(0, 3);
    if (persistent.length) out.push({
      tone: persistent.some((c) => c.score < PRIORITY) ? 'priority' : 'watch',
      title: 'Se repite en tus autoevaluaciones',
      detail: `${list(persistent.map((c) => `${c.title} (${f(c.score)})`))} ${persistent.length > 1 ? 'se han mantenido' : 'se ha mantenido'} por debajo de ${f(WATCH)} en todas tus mediciones. Conviene definir una acción concreta y hablarla con tu jefe o jefa.`,
    });
    if (steady.length) out.push({ tone: 'good', title: 'Fortalezas sostenidas', detail: `${list(steady.map((c) => c.title))} ${steady.length > 1 ? 'se mantienen' : 'se mantiene'} en ${f(STRENGTH)} o más en todas tus mediciones.` });
  }

  // 4) Foto actual: prioridades y fortalezas
  const low = [...scored].sort((a, b) => a.score - b.score).filter((c) => c.score < WATCH).slice(0, 3);
  if (low.length) {
    const urgent = low.filter((c) => c.score < PRIORITY);
    out.push({
      tone: urgent.length ? 'priority' : 'watch',
      title: 'Para trabajar en tu próximo período',
      detail: `${list(low.map((c) => `${c.title} (${f(c.score)})`))}. ${urgent.length ? 'Las que están por debajo de 3,00 son la prioridad. ' : ''}Elige una y define una acción pequeña y medible.`,
    });
  }
  const strong = [...scored].sort((a, b) => b.score - a.score).filter((c) => c.score >= STRENGTH).slice(0, 3);
  if (strong.length) out.push({ tone: 'good', title: 'Tus puntos más fuertes hoy', detail: `${list(strong.map((c) => `${c.title} (${f(c.score)})`))}.` });

  // 5) Criterios concretos más bajos de la última medición
  const crit = latest.competencies.flatMap((c) => c.criteria.map((q) => ({ ...q, comp: c.title }))).sort((a, b) => a.score - b.score).filter((q) => q.score < WATCH).slice(0, 3);
  if (crit.length) out.push({ tone: 'watch', title: 'Los aspectos más bajos de tu última autoevaluación', detail: crit.map((q) => `"${q.text}" (${f(q.score)})`).join('; ') + '.' });

  // 6) Aviso de alcance
  out.push({ tone: 'info', title: 'Cómo leer esto', detail: 'Estos resultados reflejan cómo te ves tú. Contrástalos con la retroalimentación de tu jefe o jefa y con evidencias de tu trabajo antes de decidir qué mejorar.' });
  return out;
}

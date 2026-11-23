import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { periodOrFilter } from '../../lib/evaluationSnapshot';

/** Paleta para distinguir a cada líder (la combinada usa el azul principal). Sin púrpura. */
export const LEADER_COLORS = ['#0369a1', '#0f766e', '#a16207', '#be185d', '#4d7c0f', '#9a3412'];

export interface LeaderInfo {
  evaluationId: string;
  name: string;
  date: string;
  global: number | null;
  color: string;
}

export interface Criterion {
  id: string;
  text: string;
  leader: number | null;                 // combinado: promedio de los líderes
  leaders: Record<string, number | null>; // por evaluación de cada líder
  self: number | null;
  office: number | null;
}

export interface Competency {
  id: string;
  title: string;
  leader: number | null;                 // combinado
  leaders: Record<string, number | null>;
  self: number | null;
  office: number | null;
  criteria: Criterion[];
}

/** Formularios con los que fue evaluada la persona en el periodo. */
export interface FormOption {
  templateId: string;
  template: string;
  leaders: number;
}

export type BenchmarkState =
  | { status: 'ok'; office: string; n: number }
  | { status: 'insufficient'; office: string; n: number }
  | { status: 'no_office' }
  | { status: 'unavailable'; detail?: string }; // función de la base no instalada, sin permiso o con error

export interface PerformanceReport {
  person: { name: string; role: string; office: string };
  template: string;
  /** Todos los líderes que evaluaron a la persona con este formulario en el periodo (un registro por líder). */
  leaders: LeaderInfo[];
  self: {
    id: string; date: string; periodLabel: string; otherPeriod: boolean;
    /** false cuando la autoevaluación es de otro formulario: solo es comparable el global y las competencias con el mismo nombre. */
    sameForm: boolean; template: string;
    /** Competencias de la autoevaluación sin equivalente en el formulario del líder. */
    unmatched: { title: string; score: number }[];
  } | null;
  competencies: Competency[];
  /** leader = promedio ponderado entre líderes (hoy, pesos iguales). */
  global: { leader: number | null; self: number | null; office: number | null };
  benchmark: BenchmarkState;
}

/** Resultado de quien solo tiene autoevaluación (aún sin evaluación de un líder). */
export interface SelfOnlyReport {
  person: { name: string; role: string; office: string };
  template: string;
  date: string;
  periodLabel: string;
  otherPeriod: boolean;
  global: number | null;
  competencies: { id: string; title: string; score: number | null; criteria: { id: string; text: string; score: number }[] }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const normTitle = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function toScore(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const p = parseFloat(val.replace(',', '.'));
    return isNaN(p) ? 0 : p;
  }
  if (typeof val === 'object') return Number(val.value || val.rating || val.score || val.response || 0);
  return 0;
}

interface RawAnswer {
  questionId: string;
  text: string;
  order: number;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  score: number;
}

/** Respuestas con nota de una evaluación (solo preguntas de calificación). */
async function loadAnswers(evaluationId: string): Promise<RawAnswer[]> {
  const { data, error } = await supabase
    .from('evaluation_responses')
    .select('response_value, question:evaluation_questions ( id, question_text, question_type, order_index, section:evaluation_sections ( id, title, order_index ) )')
    .eq('evaluation_id', evaluationId);
  if (error) throw error;
  const out: RawAnswer[] = [];
  (data || []).forEach((r: any) => {
    const q = r.question;
    if (!q || (q.question_type && q.question_type !== 'rating' && q.question_type !== 'scale')) return;
    const score = toScore(r.response_value);
    if (score <= 0) return;
    out.push({
      questionId: q.id, text: q.question_text || 'Criterio', order: q.order_index ?? 0,
      sectionId: q.section?.id || 'general', sectionTitle: q.section?.title || 'General', sectionOrder: q.section?.order_index ?? 999,
      score,
    });
  });
  return out;
}

interface ListedEvaluation {
  id: string;
  templateId: string;
  template: string;
  evaluatorId: string;
  evaluator: string;
  periodId: string | null;
  createdAt: string;
}

export interface UsePerformanceReportArgs {
  personId?: string;
  periodId: string;
  periods: any[];
  /** Evaluación con la que se abrió el reporte: define el formulario inicial. */
  evaluationId?: string;
}

/**
 * Reporte de desempeño de una persona para UN formulario en UN periodo: la evaluación de cada líder que la evaluó
 * (combinadas con pesos iguales y también por separado), su autoevaluación y el promedio de la oficina (agregado en la base).
 */
export function usePerformanceReport({ personId, periodId, periods, evaluationId }: UsePerformanceReportArgs) {
  const [listed, setListed] = useState<ListedEvaluation[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [selfOnly, setSelfOnly] = useState<SelfOnlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => periods.find((p: any) => p.id === periodId), [periods, periodId]);

  // 1) Evaluaciones de otras personas (líderes) sobre esta persona en el periodo
  useEffect(() => {
    let alive = true;
    if (!personId || !periodId) { setListed([]); setSelfOnly(null); setLoading(false); return; }
    (async () => {
      try {
        setLoading(true); setError(null);
        const filter = periodOrFilter(period) || `period_id.eq.${periodId}`;
        const { data, error: e } = await supabase
          .from('evaluations')
          .select('id, template_id, evaluator_id, period_id, created_at, template:evaluation_templates ( name ), evaluator:users!evaluator_id ( full_name )')
          .eq('evaluated_id', personId).eq('status', 'completed').neq('evaluator_id', personId)
          .or(filter).order('created_at', { ascending: false });
        if (e) throw e;
        if (!alive) return;
        const list: ListedEvaluation[] = (data || []).map((r: any) => ({
          id: r.id, templateId: r.template_id, template: r.template?.name || 'Evaluación', evaluatorId: r.evaluator_id,
          evaluator: (r.evaluator?.full_name || 'Evaluador').trim(), periodId: r.period_id, createdAt: r.created_at,
        }));
        setListed(list);
        setSelectedFormId((cur) => {
          if (cur && list.some((l) => l.templateId === cur)) return cur;
          const fromOpened = evaluationId ? list.find((l) => l.id === evaluationId)?.templateId : undefined;
          return fromOpened || list[0]?.templateId;
        });
        if (list.length) { setSelfOnly(null); }
        else {
          // Sin evaluación de un líder: si la persona completó su autoevaluación, se muestra ese resultado.
          setReport(null);
          const { data: selfRows } = await supabase
            .from('evaluations')
            .select('id, template_id, period_id, created_at, template:evaluation_templates ( name )')
            .eq('evaluated_id', personId).eq('evaluator_id', personId).eq('status', 'completed')
            .order('created_at', { ascending: false });
          const rows: any[] = selfRows || [];
          const row = rows.find((r) => r.period_id === periodId) || rows[0] || null;
          if (!row) { if (alive) { setSelfOnly(null); setLoading(false); } return; }
          const [answers, { data: personRow }] = await Promise.all([
            loadAnswers(row.id),
            supabase.from('users').select('full_name, role, office:offices ( name )').eq('id', personId).maybeSingle(),
          ]);
          const bySec = new Map<string, { id: string; title: string; order: number; criteria: { id: string; text: string; order: number; score: number }[] }>();
          answers.forEach((a) => {
            if (!bySec.has(a.sectionId)) bySec.set(a.sectionId, { id: a.sectionId, title: a.sectionTitle, order: a.sectionOrder, criteria: [] });
            bySec.get(a.sectionId)!.criteria.push({ id: a.questionId, text: a.text, order: a.order, score: a.score });
          });
          const competencies = Array.from(bySec.values())
            .sort((a, b2) => a.order - b2.order || a.title.localeCompare(b2.title, 'es'))
            .map((c) => {
              const m = mean(c.criteria.map((x) => x.score));
              return { id: c.id, title: c.title, score: m !== null ? round2(m) : null, criteria: c.criteria.sort((a, b2) => a.order - b2.order).map(({ id, text, score }) => ({ id, text, score })) };
            });
          const g = mean(competencies.map((c) => c.score).filter((v): v is number => v !== null));
          const selfPeriod = periods.find((p: any) => p.id === row.period_id);
          if (!alive) return;
          setSelfOnly({
            person: { name: (personRow as any)?.full_name || 'Colaborador', role: ((personRow as any)?.role || '').replace(/_/g, ' '), office: (personRow as any)?.office?.name || '' },
            template: row.template?.name || 'Autoevaluación',
            date: dateFmt(row.created_at),
            periodLabel: selfPeriod ? (selfPeriod.name || `Periodo ${selfPeriod.year}`) : 'sin periodo asignado',
            otherPeriod: row.period_id !== periodId,
            global: g !== null ? round2(g) : null,
            competencies,
          });
          setLoading(false);
        }
      } catch (err: any) {
        if (!alive) return;
        console.error('[Desempeño] evaluaciones', err);
        setError(err?.message || 'No se pudieron cargar las evaluaciones.');
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [personId, periodId, period, evaluationId]);

  const forms: FormOption[] = useMemo(() => {
    const m = new Map<string, FormOption & { evaluators: Set<string> }>();
    listed.forEach((l) => {
      if (!m.has(l.templateId)) m.set(l.templateId, { templateId: l.templateId, template: l.template, leaders: 0, evaluators: new Set() });
      m.get(l.templateId)!.evaluators.add(l.evaluatorId);
    });
    return Array.from(m.values()).map(({ evaluators, ...f }) => ({ ...f, leaders: evaluators.size }));
  }, [listed]);

  // 2) Construye el reporte del formulario elegido
  useEffect(() => {
    let alive = true;
    if (!personId || !selectedFormId || !listed.length) return;
    (async () => {
      try {
        setLoading(true); setError(null);

        // Una evaluación por líder (la más reciente de ese líder con este formulario)
        const seen = new Set<string>();
        const leaderEvals = listed.filter((l) => l.templateId === selectedFormId).filter((l) => (seen.has(l.evaluatorId) ? false : (seen.add(l.evaluatorId), true)));
        if (!leaderEvals.length) { setReport(null); setLoading(false); return; }
        const lead = leaderEvals[0];

        const { data: personRow } = await supabase.from('users').select('id, full_name, role, office:offices ( name )').eq('id', personId).maybeSingle();

        // Autoevaluación: la del MISMO formulario (primero del mismo periodo). Si no existe, la autoevaluación completada
        // de otro formulario (p. ej. la genérica "AUTOEVALUACIÓN" de líderes y coordinadores), marcada como tal.
        const { data: selfRowsAll } = await supabase
          .from('evaluations')
          .select('id, template_id, period_id, created_at, template:evaluation_templates ( name )')
          .eq('evaluated_id', personId).eq('evaluator_id', personId).eq('status', 'completed')
          .order('created_at', { ascending: false });
        const allSelf: any[] = selfRowsAll || [];
        const sameFormRows = allSelf.filter((r) => r.template_id === lead.templateId);
        const selfRow: any = sameFormRows.find((r) => r.period_id === lead.periodId) || sameFormRows[0]
          || allSelf.find((r) => r.period_id === lead.periodId) || allSelf[0] || null;
        const sameForm = !!selfRow && selfRow.template_id === lead.templateId;
        const inPeriod = !!selfRow && selfRow.period_id === lead.periodId;

        const [leaderAnswers, selfAnswers, bench] = await Promise.all([
          Promise.all(leaderEvals.map((l) => loadAnswers(l.id))),
          selfRow ? loadAnswers(selfRow.id) : Promise.resolve([] as RawAnswer[]),
          supabase.rpc('office_benchmark', { p_person: personId, p_period: lead.periodId || periodId, p_template: lead.templateId }),
        ]);

        // Comparativo de oficina
        let benchmark: BenchmarkState = { status: 'unavailable', detail: bench.error ? `${bench.error.code ? bench.error.code + ': ' : ''}${bench.error.message}` : 'La función no devolvió datos.' };
        let officeSections: Record<string, number> = {};
        let officeQuestions: Record<string, number> = {};
        let officeGlobal: number | null = null;
        const b: any = bench.data;
        if (!bench.error && b) {
          if (b.available) {
            benchmark = { status: 'ok', office: b.office || '', n: Number(b.n) || 0 };
            officeSections = b.sections || {}; officeQuestions = b.questions || {}; officeGlobal = b.global != null ? Number(b.global) : null;
          } else if (b.reason === 'muestra_insuficiente') benchmark = { status: 'insufficient', office: b.office || '', n: Number(b.n) || 0 };
          else if (b.reason === 'sin_oficina') benchmark = { status: 'no_office' };
          else benchmark = { status: 'unavailable', detail: `Respuesta inesperada: ${JSON.stringify(b).slice(0, 160)}` };
        }
        if (bench.error) console.warn('[Desempeño] comparativo de oficina', bench.error);

        // Estructura: la unión de las preguntas contestadas por los líderes, con la nota de cada uno
        type Row = { id: string; text: string; order: number; perLeader: Record<string, number> };
        const bySection = new Map<string, { id: string; title: string; order: number; criteria: Map<string, Row> }>();
        leaderAnswers.forEach((answers, li) => {
          const evId = leaderEvals[li].id;
          answers.forEach((a) => {
            if (!bySection.has(a.sectionId)) bySection.set(a.sectionId, { id: a.sectionId, title: a.sectionTitle, order: a.sectionOrder, criteria: new Map() });
            const sec = bySection.get(a.sectionId)!;
            if (!sec.criteria.has(a.questionId)) sec.criteria.set(a.questionId, { id: a.questionId, text: a.text, order: a.order, perLeader: {} });
            sec.criteria.get(a.questionId)!.perLeader[evId] = a.score;
          });
        });

        const selfByQuestion = new Map(selfAnswers.map((a) => [a.questionId, a.score]));
        const selfSections = new Map<string, { title: string; scores: number[] }>();
        selfAnswers.forEach((a) => {
          const k = normTitle(a.sectionTitle);
          const cur = selfSections.get(k) || { title: a.sectionTitle, scores: [] };
          cur.scores.push(a.score); selfSections.set(k, cur);
        });

        const leaderIds = leaderEvals.map((l) => l.id);
        const competencies: Competency[] = Array.from(bySection.values())
          .sort((a, b2) => a.order - b2.order || a.title.localeCompare(b2.title, 'es'))
          .map((s) => {
            const criteria: Criterion[] = Array.from(s.criteria.values()).sort((a, b2) => a.order - b2.order).map((r) => {
              const leaders: Record<string, number | null> = {};
              leaderIds.forEach((id) => { leaders[id] = r.perLeader[id] ?? null; });
              const comb = mean(Object.values(r.perLeader));
              return {
                id: r.id, text: r.text, leaders,
                leader: comb !== null ? round2(comb) : null,
                self: sameForm ? (selfByQuestion.get(r.id) ?? null) : null,
                office: officeQuestions[r.id] != null ? round2(Number(officeQuestions[r.id])) : null,
              };
            });
            // Nota de la competencia por líder = promedio de sus criterios; combinada = promedio entre líderes
            const leaders: Record<string, number | null> = {};
            leaderIds.forEach((id) => {
              const m = mean(criteria.map((c) => c.leaders[id]).filter((v): v is number => v !== null));
              leaders[id] = m !== null ? round2(m) : null;
            });
            const lm = mean(Object.values(leaders).filter((v): v is number => v !== null));
            const sm = mean(criteria.map((c) => c.self).filter((v): v is number => v !== null));
            const selfMatch = selfSections.get(normTitle(s.title));
            return {
              id: s.id, title: s.title, criteria, leaders,
              leader: lm !== null ? round2(lm) : null,
              self: sameForm ? (sm !== null ? round2(sm) : null) : (selfMatch ? round2(mean(selfMatch.scores) as number) : null),
              office: officeSections[s.id] != null ? round2(Number(officeSections[s.id])) : null,
            };
          });

        const g = (k: 'leader' | 'self' | 'office') => {
          const m = mean(competencies.map((c) => c[k]).filter((v): v is number => v !== null));
          return m !== null ? round2(m) : null;
        };
        const leaderTitles = new Set(competencies.map((c) => normTitle(c.title)));
        const unmatched = sameForm ? [] : Array.from(selfSections.entries())
          .filter(([k]) => !leaderTitles.has(k)).map(([, v]) => ({ title: v.title, score: round2(mean(v.scores) as number) }));
        const selfGlobal = sameForm
          ? g('self')
          : (selfSections.size ? round2(mean(Array.from(selfSections.values()).map((v) => mean(v.scores) as number)) as number) : null);
        const selfPeriod = selfRow ? periods.find((p: any) => p.id === selfRow.period_id) : null;

        const leaders: LeaderInfo[] = leaderEvals.map((l, i) => {
          const gm = mean(competencies.map((c) => c.leaders[l.id]).filter((v): v is number => v !== null));
          return { evaluationId: l.id, name: l.evaluator, date: dateFmt(l.createdAt), global: gm !== null ? round2(gm) : null, color: LEADER_COLORS[i % LEADER_COLORS.length] };
        });

        if (!alive) return;
        setReport({
          person: { name: personRow?.full_name || 'Colaborador', role: (personRow?.role || '').replace(/_/g, ' '), office: (personRow as any)?.office?.name || '' },
          template: lead.template,
          leaders,
          self: selfRow ? {
            id: selfRow.id, date: dateFmt(selfRow.created_at),
            periodLabel: selfPeriod ? (selfPeriod.name || `Periodo ${selfPeriod.year}`) : 'sin periodo asignado',
            otherPeriod: !inPeriod,
            sameForm, template: selfRow.template?.name || 'Autoevaluación', unmatched,
          } : null,
          competencies,
          global: { leader: g('leader'), self: selfGlobal, office: officeGlobal !== null ? round2(officeGlobal) : g('office') },
          benchmark,
        });
      } catch (err: any) {
        if (!alive) return;
        console.error('[Desempeño] reporte', err);
        setError(err?.message || 'No se pudo cargar el reporte.');
        setReport(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [personId, selectedFormId, listed, periodId, periods]);

  return { forms, selectedFormId, setSelectedFormId, report, selfOnly, loading, error, hasEvaluations: listed.length > 0 };
}

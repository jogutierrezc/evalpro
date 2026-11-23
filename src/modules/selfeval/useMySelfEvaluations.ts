import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { periodLabel } from '../../lib/evaluationSnapshot';
import { loadAnswers, normTitle } from '../performance/usePerformanceReport';
import type { SelfEntry, SelfCompetency } from './insights';

const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const MAX_ENTRIES = 12;

/** Todas las autoevaluaciones completadas de la persona, de la más antigua a la más reciente. */
export function useMySelfEvaluations(userId?: string) {
  const [entries, setEntries] = useState<SelfEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!userId) { setEntries([]); setLoading(false); return; }
    (async () => {
      try {
        setLoading(true); setError(null);
        const [evRes, perRes] = await Promise.all([
          supabase
            .from('evaluations')
            .select('id, template_id, period_id, created_at, completed_at, template:evaluation_templates ( name )')
            .eq('evaluated_id', userId).eq('evaluator_id', userId).eq('status', 'completed')
            .order('created_at', { ascending: false }).limit(MAX_ENTRIES),
          supabase.from('evaluation_periods').select('id, name, year, start_date, end_date'),
        ]);
        if (evRes.error) throw evRes.error;
        const periods = new Map<string, any>(((perRes.data as any[]) || []).map((p) => [p.id, p]));
        const rows: any[] = evRes.data || [];

        const built = await Promise.all(rows.map(async (r): Promise<SelfEntry> => {
          const answers = await loadAnswers(r.id);
          const bySec = new Map<string, SelfCompetency & { order: number }>();
          answers.forEach((a) => {
            const key = normTitle(a.sectionTitle);
            if (!bySec.has(key)) bySec.set(key, { key, title: a.sectionTitle, score: null, criteria: [], order: a.sectionOrder });
            bySec.get(key)!.criteria.push({ id: a.questionId, text: a.text, score: a.score });
          });
          const competencies = Array.from(bySec.values())
            .sort((a, b) => a.order - b.order)
            .map(({ order, ...c }) => {
              const m = mean(c.criteria.map((q) => q.score));
              return { ...c, score: m !== null ? round2(m) : null };
            });
          const g = mean(competencies.map((c) => c.score).filter((v): v is number => v !== null));
          const p = r.period_id ? periods.get(r.period_id) : null;
          const date = r.completed_at || r.created_at;
          return {
            id: r.id, templateId: r.template_id, template: r.template?.name || 'Autoevaluación', periodId: r.period_id,
            periodName: p ? (p.name || `Periodo ${p.year}`) : new Date(date).toLocaleDateString('es-CO', { month: 'short', year: 'numeric' }),
            periodFull: p ? periodLabel(p) : 'Sin período asignado',
            date, global: g !== null ? round2(g) : null, competencies,
          };
        }));

        // Orden cronológico: por inicio del período si lo tiene, si no por fecha de la evaluación.
        const when = (e: SelfEntry) => {
          const p = e.periodId ? periods.get(e.periodId) : null;
          return new Date(p?.start_date || e.date).getTime();
        };
        built.sort((a, b) => when(a) - when(b) || new Date(a.date).getTime() - new Date(b.date).getTime());
        if (alive) setEntries(built);
      } catch (e: any) {
        console.error('[Mis autoevaluaciones]', e);
        if (alive) setError(e?.message || 'No se pudieron cargar tus autoevaluaciones.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [userId]);

  return { entries, loading, error };
}

/**
 * ¿Esta persona solo hace autoevaluaciones? Sí cuando tiene al menos una y nadie la ha evaluado (evaluación completada
 * de otra persona). Decide si «Mis Autoevaluaciones» aparece por defecto en el menú de un rol sin configurar.
 */
export function useSelfOnlyAccess(userId?: string, enabled = true) {
  const [selfOnly, setSelfOnly] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!userId || !enabled) { setSelfOnly(false); return; }
    (async () => {
      const [mine, byOthers] = await Promise.all([
        supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('evaluator_id', userId).eq('evaluated_id', userId),
        supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('evaluated_id', userId).neq('evaluator_id', userId).eq('status', 'completed'),
      ]);
      if (alive) setSelfOnly(!mine.error && !byOthers.error && (mine.count || 0) > 0 && (byOthers.count || 0) === 0);
    })();
    return () => { alive = false; };
  }, [userId, enabled]);
  return selfOnly;
}

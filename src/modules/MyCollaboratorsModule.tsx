import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { usePeriods } from '../hooks/usePeriods';
import { applySnapshot, periodLabel, periodOrFilter, personKey } from '../lib/evaluationSnapshot';
import { Users, Search, ChevronRight, UserCircle, Mail, Briefcase, Calendar } from 'lucide-react';
import PrismaReport from './PrismaReport';

// Ponderación del resultado Equipo VAF: 60 % lo que evalúa el equipo, 40 % la autoevaluación.
const W_EVALUADO = 0.6;
const W_AUTO = 0.4;
const PAGE = 1000; // Supabase corta cada consulta en 1000 filas: se pagina para no perder registros

/** Una autoevaluación (evaluador = evaluado) encontrada para la persona, de cualquier periodo, formulario y estado. */
interface SelfEval {
    id: string;
    template: string;
    date: string;
    ts: number;
    period: string;
    inPeriod: boolean;          // pertenece al periodo elegido
    completed: boolean;
    score: number | null;
    equipo: boolean;            // formulario del Equipo VAF
}

/** Una evaluación que hizo un líder a la persona, con su nota. */
interface LeaderEval {
    id: string;
    template: string;
    evaluator: string;
    date: string;
    ts: number;
    score: number | null;
    equipo: boolean;
}

interface Collaborator {
    key: string;
    isVaf: boolean;                 // evaluada con el formulario Equipo VAF: se usa ese formulario; si no, el que tenga
    leaderEvals: LeaderEval[];      // cómo la calificó cada líder

    id: string;
    full_name: string;
    email: string;
    role: string;
    evaluado: number | null;        // promedio de las notas de los líderes (VAF: solo Equipo VAF; el resto: sus formularios)
    evaluadoCount: number;
    selfs: SelfEval[];              // todas sus autoevaluaciones, la más reciente primero
    fallbackScore: number | null;   // Puntaje de la última evaluación si no hay formularios Equipo VAF
    lastDate?: string;
    latestEvaluationId?: string;
}

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const p = parseFloat(v.replace(',', '.')); return isNaN(p) ? 0 : p; }
    if (typeof v === 'object') return Number(v.value || v.rating || v.score || v.response || 0);
    return 0;
};
const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const fmt = (n: number | null) => (n === null ? '-' : n.toFixed(2).replace('.', ','));
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

/** Puntaje guardado de una evaluación: resultado global o promedio de categorías. 0 si no hay. */
function storedScore(ev: any): number {
    const r = Array.isArray(ev.results) ? ev.results[0] : ev.results;
    const s = num(r?.overall_score);
    if (s > 0) return s;
    if (r?.category_scores) {
        const vals = Object.values(r.category_scores).map(num).filter((v) => v > 0);
        if (vals.length) return vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return 0;
}

/**
 * Plantilla del Equipo VAF. En los datos reales la misma plantilla "EQUIPO VAF" se usa para la evaluación del equipo
 * (evaluador distinto) y para la autoevaluación (evaluador = evaluado). La plantilla genérica "AUTOEVALUACIÓN" y las
 * de líderes (LIDER VAF) no entran en este resultado.
 */
function isEquipoVaf(templateName: string, templateType?: string | null): boolean {
    const n = norm(`${templateName || ''} ${templateType || ''}`);
    return n.includes('vaf') && !/jefe|lider|manager|leader/.test(n);
}

/** Trae todas las filas de una consulta paginando de a 1000. */
async function pageAll<T = any>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await build(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
    }
    return out;
}

/**
 * Autoevaluación que entra al 60/40: las completadas del Equipo VAF en el periodo elegido; si no hay, y se permite,
 * la más reciente completada de cualquier otro periodo.
 */
function pickAuto(c: Collaborator, allowOtherPeriod: boolean): { value: number | null; count: number; from?: SelfEval } {
    // VAF: solo el formulario Equipo VAF. Resto: cualquier autoevaluación, prefiriendo la del mismo formulario del líder.
    const leaderForms = new Set(c.leaderEvals.map((e) => e.template));
    const ok = (s: SelfEval) => (c.isVaf ? s.equipo : true) && s.completed && s.score !== null;
    const prefer = (rows: SelfEval[]) => { const same = rows.filter((s) => leaderForms.has(s.template)); return same.length ? same : rows; };
    const inP = prefer(c.selfs.filter((s) => ok(s) && s.inPeriod));
    if (inP.length) return { value: avg(inP.map((s) => s.score as number)), count: inP.length };
    if (allowOtherPeriod) {
        const o = c.selfs.find((s) => ok(s) && !s.inPeriod); // selfs viene de la más reciente a la más antigua
        if (o) return { value: o.score, count: 1, from: o };
    }
    return { value: null, count: 0 };
}

interface Diag {
    periodo: string;
    plantillasEquipo: string[];
    otrosLeidas: number;
    otrosEquipo: number;
    personas: number;
    selfTotal: number;
    selfEquipoEnPeriodo: number;
    selfEquipoFuera: number;
}

function ScoreLine({ label, hint, value, count, strong }: { label: string; hint: string; value: number | null; count?: number; strong?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
                <p className={`truncate text-[13px] ${strong ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{label}</p>
                <p className="truncate text-[11.5px] text-slate-500">{hint}</p>
            </div>
            <p className={`shrink-0 tabular-nums ${strong ? 'text-xl font-bold text-slate-900' : 'text-base font-semibold text-slate-800'} ${value === null ? '!font-normal !text-slate-400' : ''}`}>
                {value === null ? 'Pendiente' : fmt(value)}
                {value !== null && count !== undefined && count > 1 && <span className="ml-1 text-[11px] font-normal text-slate-500">({count})</span>}
            </p>
        </div>
    );
}

export const MyCollaboratorsModule = () => {
    const { user } = useAuth();
    const { periods, activePeriod, loading: periodsLoading } = usePeriods();
    const [periodId, setPeriodId] = useState('');
    const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [diag, setDiag] = useState<Diag | null>(null);
    // La autoevaluación (evaluador = evaluado) se busca siempre: primero en el periodo elegido y, si no hay, la más reciente
    // completada en cualquier otro periodo, marcada como tal. Se puede desactivar para no mezclar periodos.
    const [useOtherPeriodAuto, setUseOtherPeriodAuto] = useState(true);
    const [selected, setSelected] = useState<Collaborator | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    // El periodo elegido define las evaluaciones del equipo: el activo o el más reciente.
    useEffect(() => {
        if (periodId || periodsLoading) return;
        const initial = activePeriod || periods[0];
        if (initial) setPeriodId(initial.id); else setLoading(false);
    }, [periods, activePeriod, periodsLoading, periodId]);

    useEffect(() => {
        if (user && periodId) fetchCollaborators();
    }, [user, periodId]);

    const fetchCollaborators = async () => {
        try {
            setLoading(true); setError(null);
            const per = periods.find((p: any) => p.id === periodId);
            const periodFilter = periodOrFilter(per) || `period_id.eq.${periodId}`;
            const pStart = per?.start_date ? String(per.start_date).slice(0, 10) : '';
            const pEnd = per?.end_date ? String(per.end_date).slice(0, 10) : '';
            const belongsToPeriod = (e: any) => e.period_id === periodId
                || (!e.period_id && !!pStart && !!pEnd && String(e.created_at).slice(0, 10) >= pStart && String(e.created_at).slice(0, 10) <= pEnd);

            const roleLower = (user?.role || '').toLowerCase();
            const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria', 'jefe', 'office_manager'];
            const isAdmin = roleLower === 'admin' || roleLower.includes('administrador');
            const isManager = managerKeywords.some((k) => roleLower.includes(k));

            // Plantillas Equipo VAF
            const { data: tpls, error: te } = await supabase.from('evaluation_templates').select('id, name, type');
            if (te) throw te;
            const equipoIds = (tpls || []).filter((t: any) => isEquipoVaf(t.name, t.type)).map((t: any) => t.id);
            const equipoSet = new Set<string>(equipoIds);
            const tplName = new Map<string, string>((tpls || []).map((t: any) => [t.id, String(t.name || '').trim()]));

            const resultsCol = 'results:evaluation_results ( overall_score, category_scores )';
            const leaderCol = 'evaluator:users!evaluator_id ( full_name )';
            const cols = `id, evaluator_id, evaluated_id, template_id, created_at, period_id, evaluator_snapshot, evaluated_snapshot, ${resultsCol}`;
            const evaluatedCols = 'evaluated:users!evaluated_id ( id, full_name, email, role, office_id, identification )';
            const evaluatedInner = 'evaluated:users!evaluated_id!inner ( id, full_name, email, role, office_id, identification )';
            const base = (select: string) => supabase.from('evaluations').select(select).eq('status', 'completed').or(periodFilter)
                .order('created_at', { ascending: false }).order('id');

            // 1) Evaluaciones de otras personas que este usuario puede ver, en el periodo elegido (acotadas en el servidor).
            const others = new Map<string, any>();
            const addAll = (rows: any[]) => rows.forEach((r) => others.set(r.id, r));
            if (isAdmin) {
                addAll(await pageAll((f, t) => base(`${cols}, ${leaderCol}, ${evaluatedCols}`).range(f, t) as any));
            } else {
                addAll(await pageAll((f, t) => base(`${cols}, ${leaderCol}, ${evaluatedCols}`).eq('evaluator_id', user!.id).range(f, t) as any));
                if (isManager && user?.office_id) {
                    addAll(await pageAll((f, t) => base(`${cols}, ${leaderCol}, ${evaluatedInner}`).eq('evaluated.office_id', user!.office_id!).range(f, t) as any));
                }
            }
            const otherRows = Array.from(others.values()).map((r) => applySnapshot(r)).filter((e: any) => e.evaluated && e.evaluator_id !== e.evaluated_id && e.evaluated_id !== user?.id);

            // 2) Quién aparece
            const people = new Map<string, Collaborator>();
            const idsByKey = new Map<string, Set<string>>();
            otherRows.forEach((e: any) => {
                const k = personKey(e, 'evaluated');
                if (!idsByKey.has(k)) idsByKey.set(k, new Set());
                idsByKey.get(k)!.add(e.evaluated_id);
                if (!people.has(k)) {
                    people.set(k, {
                        key: k, id: e.evaluated_id, full_name: e.evaluated.full_name || 'Sin nombre', email: e.evaluated.email || '', role: e.evaluated.role || '',
                        isVaf: false, leaderEvals: [], evaluado: null, evaluadoCount: 0, selfs: [], fallbackScore: null,
                        lastDate: shortDate(e.created_at), latestEvaluationId: e.id,
                    });
                    const s = storedScore(e);
                    if (s > 0) people.get(k)!.fallbackScore = s;
                }
            });

            // 3) Autoevaluaciones (evaluador = evaluado) de esas personas. SIEMPRE se buscan en todos los periodos,
            //    formularios y estados; después se clasifican. Consulta aparte para no chocar con el límite de 1000 filas.
            const keyById = new Map<string, string>();
            idsByKey.forEach((set, k) => set.forEach((id) => keyById.set(id, k)));
            const allSelf: any[] = [];
            for (const part of chunk(Array.from(keyById.keys()), 80)) {
                const rows = await pageAll<any>((f, t) => supabase.from('evaluations')
                    .select(`id, evaluator_id, evaluated_id, template_id, status, created_at, period_id, ${resultsCol}`)
                    .in('evaluator_id', part).order('created_at', { ascending: false }).order('id').range(f, t) as any);
                allSelf.push(...rows.filter((e: any) => e.evaluator_id === e.evaluated_id));
            }

            // Quién es VAF: tiene al menos una evaluación del formulario Equipo VAF en el periodo. Para ellas cuenta solo ese
            // formulario; para el resto, todas las evaluaciones que recibieron de sus líderes (se respeta el mismo 60/40).
            const vafKeys = new Set<string>();
            otherRows.forEach((e: any) => { if (equipoSet.has(e.template_id)) vafKeys.add(personKey(e, 'evaluated')); });
            people.forEach((p, k) => { p.isVaf = vafKeys.has(k); });

            // 4) Puntajes. Si la evaluación no tiene resultado guardado, se calcula desde sus respuestas.
            const evaluadoRows = otherRows.filter((e: any) => !vafKeys.has(personKey(e, 'evaluated')) || equipoSet.has(e.template_id));
            const scoreSet = [...evaluadoRows, ...allSelf.filter((e: any) => e.status === 'completed')];
            const scores = new Map<string, number>();
            scoreSet.forEach((e: any) => { const s = storedScore(e); if (s > 0) scores.set(e.id, s); });
            const missing = scoreSet.filter((e: any) => !scores.has(e.id)).map((e: any) => e.id);
            for (const part of chunk(missing, 20)) {
                const resp = await pageAll<any>((f, t) => supabase.from('evaluation_responses').select('evaluation_id, response_value').in('evaluation_id', part).order('id').range(f, t) as any);
                const by = new Map<string, number[]>();
                resp.forEach((r: any) => { const v = num(r.response_value); if (v > 0) by.set(r.evaluation_id, [...(by.get(r.evaluation_id) || []), v]); });
                by.forEach((vals, id) => scores.set(id, vals.reduce((a, b) => a + b, 0) / vals.length));
            }

            // 5) Por persona: lo evaluado por el equipo y la lista completa de sus autoevaluaciones
            const evaluado: Record<string, number[]> = {};
            evaluadoRows.forEach((e: any) => {
                const k = personKey(e, 'evaluated');
                const s = scores.get(e.id);
                const p = people.get(k);
                if (!p) return;
                if (s) (evaluado[k] ||= []).push(s);
                p.leaderEvals.push({
                    id: e.id, template: tplName.get(e.template_id) || 'Formulario', evaluator: String(e.evaluator?.full_name || 'Evaluador').trim(),
                    date: shortDate(e.created_at), ts: new Date(e.created_at).getTime(), score: s ?? null, equipo: equipoSet.has(e.template_id),
                });
            });
            allSelf.forEach((e: any) => {
                const k = keyById.get(e.evaluated_id);
                const p = k ? people.get(k) : undefined;
                if (!p) return;
                const pr = periods.find((x: any) => x.id === e.period_id);
                p.selfs.push({
                    id: e.id, template: tplName.get(e.template_id) || 'Formulario', date: shortDate(e.created_at), ts: new Date(e.created_at).getTime(),
                    period: pr ? periodLabel(pr) : 'sin periodo asignado', inPeriod: belongsToPeriod(e), completed: e.status === 'completed',
                    score: scores.get(e.id) ?? null, equipo: equipoSet.has(e.template_id),
                });
            });
            people.forEach((p, k) => {
                p.evaluado = avg(evaluado[k] || []); p.evaluadoCount = (evaluado[k] || []).length;
                p.selfs.sort((a, b) => b.ts - a.ts);
                p.leaderEvals.sort((a, b) => b.ts - a.ts);
                const latestForm = p.leaderEvals[0];
                if (latestForm) p.latestEvaluationId = latestForm.id; // el reporte se abre con el formulario que cuenta
            });

            const list = Array.from(people.values());
            setDiag({
                periodo: per ? periodLabel(per) : periodId,
                plantillasEquipo: equipoIds.map((id: string) => tplName.get(id) || id),
                otrosLeidas: otherRows.length,
                otrosEquipo: evaluadoRows.length,
                personas: people.size,
                selfTotal: allSelf.length,
                selfEquipoEnPeriodo: list.reduce((n, p) => n + p.selfs.filter((s) => s.equipo && s.inPeriod).length, 0),
                selfEquipoFuera: list.reduce((n, p) => n + p.selfs.filter((s) => s.equipo && !s.inPeriod).length, 0),
            });
            console.info('[MisColaboradores] detalle de carga', { periodId, periodFilter, equipoIds, otros: otherRows.length, autoevaluaciones: allSelf.length });

            setCollaborators(list.sort((a, b) => a.full_name.localeCompare(b.full_name, 'es')));
        } catch (err: any) {
            console.error('Error fetching collaborators:', err);
            setError(err?.message?.includes('evaluator_snapshot')
                ? 'Falta aplicar la migración de identidad de evaluaciones en la base de datos.'
                : `No se pudieron cargar los colaboradores${err?.message ? `: ${err.message}` : '.'}`);
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        const t = searchTerm.toLowerCase();
        return collaborators.filter((c) => c.full_name.toLowerCase().includes(t) || c.email.toLowerCase().includes(t));
    }, [collaborators, searchTerm]);

    const needsOtherPeriod = useMemo(
        () => collaborators.some((c) => pickAuto(c, false).value === null && pickAuto(c, true).value !== null),
        [collaborators],
    );

    if (selected) {
        return (
            <div className="min-h-screen bg-slate-50">
                <div className="no-print sticky top-0 z-30 flex items-center gap-4 border-b border-slate-200 bg-white px-4 py-3">
                    <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-blue-700">
                        <ChevronRight className="h-4 w-4 rotate-180" />
                        Volver a la lista
                    </button>
                    <div className="h-6 w-px bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <UserCircle className="h-8 w-8 text-blue-700" />
                        <div>
                            <h2 className="text-sm font-bold text-slate-800">{selected.full_name}</h2>
                            <p className="text-xs text-slate-500">Reporte de Desempeño (Vista de Líder)</p>
                        </div>
                    </div>
                </div>
                <PrismaReport targetUserId={selected.id} evaluationId={selected.latestEvaluationId} viewMode="manager" targetUserName={selected.full_name} />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900"><Users className="h-6 w-6 text-blue-700" />Mis Colaboradores</h1>
                    <p className="mt-1 max-w-[62ch] text-sm text-slate-500">Cómo calificó cada líder a cada persona, cómo se calificó ella y el resultado ponderado 60 % y 40 %. Quienes son VAF se miden con el formulario Equipo VAF; el resto, con el formulario con el que fue evaluado.</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
                    <div className="flex items-center gap-2">
                        <label htmlFor="mc-period" className="flex items-center gap-1.5 text-sm text-slate-500"><Calendar className="h-4 w-4" />Periodo</label>
                        <select id="mc-period" value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="ui-input !w-auto">
                            {periods.map((p: any) => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
                        </select>
                    </div>
                    <div className="relative min-w-[220px] flex-1 md:w-64 md:flex-none">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input type="text" aria-label="Buscar colaborador" placeholder="Buscar colaborador..." className="ui-input !pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </div>

            {!loading && needsOtherPeriod && (
                <label className="mb-4 flex cursor-pointer items-start gap-2.5 rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[13px] text-slate-700">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600" checked={useOtherPeriodAuto} onChange={(e) => setUseOtherPeriodAuto(e.target.checked)} />
                    <span>
                        Si falta la autoevaluación en este periodo, usar la más reciente de otro periodo en el 60/40
                        <span className="block text-[12px] text-slate-500">Siempre se busca primero en el periodo elegido. Las tarjetas que usen otro periodo lo indican. Desactívalo para no mezclar periodos.</span>
                    </span>
                </label>
            )}

            {diag && !loading && (
                <details className="mb-4 rounded-md border border-slate-200 bg-white text-[12.5px] text-slate-600">
                    <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700">Detalle de la carga ({diag.periodo})</summary>
                    <div className="grid gap-1 border-t border-slate-100 px-3 py-2 tabular-nums">
                        <p>Formularios Equipo VAF detectados: <b>{diag.plantillasEquipo.join(', ') || 'ninguno'}</b></p>
                        <p>Evaluaciones de otras personas leídas en el periodo: <b>{diag.otrosLeidas}</b> (Equipo VAF: <b>{diag.otrosEquipo}</b>) de <b>{diag.personas}</b> personas</p>
                        <p>Autoevaluaciones encontradas de esas personas (todos los periodos y formularios): <b>{diag.selfTotal}</b></p>
                        <p>Equipo VAF en este periodo: <b>{diag.selfEquipoEnPeriodo}</b>. Equipo VAF en otros periodos: <b>{diag.selfEquipoFuera}</b></p>
                    </div>
                </details>
            )}

            {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

            {loading ? (
                <div className="flex justify-center py-12"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-700" /></div>
            ) : filtered.length > 0 ? (
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((c) => {
                        const a = pickAuto(c, useOtherPeriodAuto);
                        const weighted = c.evaluado !== null && a.value !== null ? c.evaluado * W_EVALUADO + a.value * W_AUTO : null;
                        const hasVaf = c.evaluado !== null || a.value !== null;
                        return (
                            <div key={c.key} role="button" tabIndex={0} onClick={() => setSelected(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(c); } }}
                                className="ui-card flex cursor-pointer flex-col overflow-hidden text-left transition-shadow hover:shadow-md focus-visible:outline-blue-700">
                                <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-800">{c.full_name.charAt(0)}</span>
                                    <div className="min-w-0 flex-1">
                                        <h3 className="truncate font-semibold text-slate-900" title={c.full_name}>{c.full_name}</h3>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><Briefcase size={13} className="shrink-0" /><span className="truncate">{c.role || 'Colaborador'}</span><span className={`shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${c.isVaf ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-600'}`}>{c.isVaf ? 'VAF' : 'Otros formularios'}</span></p>
                                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500"><Mail size={13} className="shrink-0" /><span className="truncate">{c.email}</span></p>
                                    </div>
                                </div>

                                <div className="grid flex-1 content-start gap-3 p-4">
                                    <ScoreLine label={c.isVaf ? 'Equipo VAF evaluado' : 'Evaluación del líder'} hint={c.leaderEvals.length > 1 ? `Promedio de ${c.leaderEvals.length} evaluaciones` : 'Lo que califica el líder'} value={c.evaluado} count={c.evaluadoCount} />
                                    <ScoreLine label={c.isVaf ? 'Equipo VAF autoevaluación' : 'Autoevaluación'} hint={a.from ? `De otro periodo, ${a.from.date}` : 'Lo que la persona se califica'} value={a.value} count={a.count} />

                                    {c.leaderEvals.length > 0 && (
                                        <div className="rounded-md bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600">
                                            <p className="mb-1 font-medium text-slate-700">Cómo la calificó cada líder</p>
                                            {c.leaderEvals.map((l) => (
                                                <p key={l.id} className="flex items-baseline justify-between gap-2 tabular-nums">
                                                    <span className="min-w-0">{l.evaluator}, {l.template}, {l.date}</span>
                                                    <b className="shrink-0 text-slate-800">{l.score !== null ? fmt(l.score) : 'sin puntaje'}</b>
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    <div className="rounded-md bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600">
                                        <p className="mb-1 font-medium text-slate-700">Autoevaluaciones encontradas de esta persona</p>
                                        {c.selfs.length === 0 ? (
                                            <p>No se encontró ninguna que tu usuario pueda leer. Si la persona sí se autoevaluó, la base no te está dejando verla: falta aplicar la migración 20261115000000 de permisos.</p>
                                        ) : c.selfs.map((s) => (
                                            <p key={s.id} className="tabular-nums">
                                                {s.template}, {s.date}, {s.period}, {s.completed ? 'completada' : 'sin completar'}{s.score !== null ? `, ${fmt(s.score)}` : ''}
                                                {' '}<span className={(c.isVaf ? s.equipo : true) && s.completed && s.score !== null && (s.inPeriod || a.from?.id === s.id) ? 'font-semibold text-emerald-700' : 'text-slate-400'}>
                                                    {(c.isVaf && !s.equipo) ? '(otro formulario)' : !s.completed ? '(no cuenta)' : s.inPeriod ? '(en este periodo)' : a.from?.id === s.id ? '(se usa)' : '(otro periodo)'}
                                                </span>
                                            </p>
                                        ))}
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 bg-slate-50 p-4">
                                    {hasVaf ? (
                                        <>
                                            <ScoreLine strong label="Resultado ponderado" hint="60 % evaluado + 40 % autoevaluación" value={weighted} />
                                            {weighted !== null ? (
                                                <p className="mt-1.5 text-[11.5px] tabular-nums text-slate-500">0,6 x {fmt(c.evaluado)} + 0,4 x {fmt(a.value)} = {fmt(weighted)}{a.from ? ' (autoevaluación de otro periodo)' : ''}</p>
                                            ) : (
                                                <p className="mt-1.5 text-[11.5px] text-amber-700">Falta {c.evaluado === null ? 'la evaluación del equipo' : 'la autoevaluación'} para calcular el 60/40.</p>
                                            )}
                                        </>
                                    ) : (
                                        <ScoreLine strong label="Puntaje general" hint="Última evaluación del periodo" value={c.fallbackScore} />
                                    )}
                                    {c.lastDate && <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-slate-500"><Calendar size={12} />Última evaluación: {c.lastDate}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <h3 className="text-base font-medium text-slate-600">No se encontraron colaboradores</h3>
                    <p className="mt-1 text-sm text-slate-400">No hay evaluaciones completadas de tu equipo en este periodo.</p>
                </div>
            )}
        </div>
    );
};

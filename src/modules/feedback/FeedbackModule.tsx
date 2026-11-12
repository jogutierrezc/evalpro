import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { BadgeCheck, CircleDashed, Clock3, Eye, FilePenLine, FilePlus2, FileSpreadsheet, Loader2, Lock, PencilLine } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { PageHeader } from '../../components/ui/PageHeader';
import { usePeriods } from '../../hooks/usePeriods';
import { ActaEditor } from './ActaEditor';
import { exportarExcel, fetchResultados } from './resultados';
import { isAdminRole, useFeedbackAccess } from './useFeedbackAccess';
import { scoreFromResponses } from './scoring';
import { ActaRow, ActaState, Person, STATE_LABEL, actaState, newId, normalizeActa } from './types';

export interface FeedbackRow {
  evaluationId: string;
  evaluator: Person;
  evaluated: Person;
  template: string;
  score: number | null;
  acta: ActaRow | null;
  periodId: string | null;
}

const STATE_STYLE: Record<ActaState, string> = {
  sin: 'border-slate-300 text-slate-500',
  borrador: 'border-slate-300 bg-slate-50 text-slate-700',
  espera: 'border-amber-200 bg-amber-50 text-amber-800',
  firmada: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};
const STATE_ICON = { sin: CircleDashed, borrador: FilePenLine, espera: Clock3, firmada: BadgeCheck };

export function StatePill({ state }: { state: ActaState }) {
  const Icon = STATE_ICON[state];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATE_STYLE[state]}`}>
      <Icon className="h-3.5 w-3.5" />
      {STATE_LABEL[state]}
    </span>
  );
}

const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const chunk = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function FeedbackModule() {
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const access = useFeedbackAccess(user);
  const { periods, activePeriod, loading: periodsLoading } = usePeriods();

  const [periodId, setPeriodId] = useState<string>('');
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | ActaState>('all');
  const [evaluatorFilter, setEvaluatorFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  // Un solo periodo a la vez: el activo por defecto, y nunca se mezclan datos de periodos distintos.
  useEffect(() => {
    if (periodId || periodsLoading) return;
    const p = activePeriod || periods[0];
    if (p) setPeriodId(p.id);
    else setLoading(false);
  }, [periods, activePeriod, periodsLoading, periodId]);

  const cargoMap = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!user || !periodId) return;
    setLoading(true); setError(null);
    try {
      let q = supabase.from('evaluations').select('id, template_id, evaluator_id, evaluated_id, period_id, status')
        .eq('period_id', periodId).eq('status', 'completed');
      if (!admin) q = q.eq('evaluator_id', user.id);
      const { data: evs, error: e1 } = await q;
      if (e1) throw e1;
      const list = (evs || []).filter((e: any) => e.evaluator_id !== e.evaluated_id);

      const { data: roles } = await supabase.from('roles').select('id, key, label');
      const roleById: Record<string, string> = {}; const roleByKey: Record<string, string> = {};
      (roles || []).forEach((r: any) => { roleById[r.id] = r.label; roleByKey[r.key] = r.label; });
      cargoMap.current = roleByKey;

      const userIds = Array.from(new Set(list.flatMap((e: any) => [e.evaluator_id, e.evaluated_id])));
      const users: Record<string, any> = {};
      for (const ids of chunk(userIds)) {
        const { data, error: eu } = await supabase.from('users').select('*').in('id', ids);
        if (eu) throw eu;
        (data || []).forEach((u: any) => { users[u.id] = u; });
      }
      const toPerson = (id: string): Person => {
        const u = users[id];
        return { id, nombre: u?.full_name || 'Sin nombre', cargo: (u?.role_id && roleById[u.role_id]) || roleByKey[u?.role] || (u?.role || '').replace(/_/g, ' '), email: u?.email };
      };

      const evIds = list.map((e: any) => e.id);
      const tplIds = Array.from(new Set(list.map((e: any) => e.template_id)));
      const tpl: Record<string, string> = {}; const score: Record<string, number> = {}; const actas: Record<string, ActaRow> = {};
      const { data: tplRows } = tplIds.length ? await supabase.from('evaluation_templates').select('id, name').in('id', tplIds) : { data: [] as any[] };
      (tplRows || []).forEach((t: any) => { tpl[t.id] = t.name; });
      for (const ids of chunk(evIds)) {
        const [{ data: res }, { data: ac, error: ea }] = await Promise.all([
          supabase.from('evaluation_results').select('evaluation_id, overall_score').in('evaluation_id', ids),
          supabase.from('feedback_actas').select('*').in('evaluation_id', ids),
        ]);
        if (ea) throw ea;
        (res || []).forEach((r: any) => { if (r.overall_score != null) score[r.evaluation_id] = Number(r.overall_score); });
        (ac || []).forEach((a: any) => { actas[a.evaluation_id] = normalizeActa(a); });
      }
      // Sin resultado guardado: se calcula desde las respuestas, igual que el informe individual.
      // Lotes pequeños para no chocar con el límite de filas por consulta.
      for (const ids of chunk(evIds.filter((id: string) => score[id] == null), 8)) {
        const { data: resp, error: er } = await supabase
          .from('evaluation_responses')
          .select('evaluation_id, response_value, question:evaluation_questions(section:evaluation_sections(title))')
          .in('evaluation_id', ids);
        if (er) { console.warn('[Feedback] responses', er); continue; }
        const byEval: Record<string, any[]> = {};
        (resp || []).forEach((r: any) => { (byEval[r.evaluation_id] ||= []).push(r); });
        ids.forEach((id: string) => { const sc = scoreFromResponses(byEval[id] || []); if (sc != null) score[id] = sc; });
      }

      setRows(list.map((e: any) => ({
        evaluationId: e.id, evaluator: toPerson(e.evaluator_id), evaluated: toPerson(e.evaluated_id),
        template: tpl[e.template_id] || 'Evaluación', score: score[e.id] ?? null, acta: actas[e.id] || null, periodId: e.period_id,
      })).sort((a, b) => a.evaluated.nombre.localeCompare(b.evaluated.nombre, 'es')));
    } catch (e: any) {
      console.error('[Feedback] load', e);
      setError(e?.message?.includes('feedback_actas') ? 'Falta aplicar la migración de Retroalimentación en la base de datos.' : 'No se pudieron cargar las evaluaciones. Inténtalo de nuevo.');
    } finally { setLoading(false); }
  }, [user, admin, periodId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, sin: 0, borrador: 0, espera: 0, firmada: 0 };
    rows.forEach((r) => { c[actaState(r.acta)]++; });
    return c;
  }, [rows]);

  const evaluators = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.evaluator.id, r.evaluator.nombre));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [rows]);

  const visible = rows.filter((r) => (filter === 'all' || actaState(r.acta) === filter) && (evaluatorFilter === 'all' || r.evaluator.id === evaluatorFilter));

  // Entrada escalonada: transform y opacidad, sin movimiento si el usuario lo pide, y con salida de seguridad.
  useLayoutEffect(() => {
    if (!scope.current || openId || loading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 6, opacity: 0, duration: 0.24, ease: 'power3.out', stagger: 0.035, clearProps: 'transform,opacity' });
    }, scope);
    const safety = window.setTimeout(() => ctx.revert(), 1500);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, [openId, loading, filter, evaluatorFilter, periodId]);

  // Exporta la tabla de resultados por criterio a Excel, sin necesidad de abrir ni crear el acta.
  async function exportRow(r: FeedbackRow) {
    if (exporting) return;
    setExporting(r.evaluationId); setError(null);
    try {
      const res = r.acta?.resultados ?? (await fetchResultados(r.evaluationId));
      await exportarExcel(res, { evaluado: r.evaluated.nombre, evaluador: r.evaluator.nombre });
    } catch (e: any) {
      console.error('[Feedback] export', e);
      setError(e?.message || 'No se pudo exportar los resultados.');
    } finally { setExporting(null); }
  }

  async function openRow(r: FeedbackRow) {
    if (r.acta || admin) { if (r.acta) setOpenId(r.evaluationId); return; }
    if (!user) return;
    setCreating(r.evaluationId);
    try {
      const { count } = await supabase.from('feedback_actas').select('id', { count: 'exact', head: true }).eq('evaluator_id', user.id).eq('period_id', periodId);
      const year = (periods.find((p: any) => p.id === periodId)?.year) || new Date().getFullYear();
      let office = '';
      if (user.office_id) {
        const { data: o } = await supabase.from('offices').select('name').eq('id', user.office_id).maybeSingle();
        office = o?.name || '';
      }
      // Los resultados por criterio entran al Desarrollo por defecto. Si fallan, el acta se crea igual y se pueden agregar después.
      const resultados = await fetchResultados(r.evaluationId).catch(() => null);
      const today = new Date(); const iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const { data, error: e } = await supabase.from('feedback_actas').insert({
        evaluation_id: r.evaluationId, evaluator_id: r.evaluator.id, evaluated_id: r.evaluated.id, period_id: r.periodId,
        oficina: office, numero: `${String((count || 0) + 1).padStart(3, '0')}-${year}`, fecha: iso,
        asistentes: `${r.evaluator.nombre}, ${r.evaluator.cargo} (evaluador)\n${r.evaluated.nombre}, ${r.evaluated.cargo} (evaluado)`,
        transcriptor: r.evaluator.nombre, compromisos: [{ id: newId(), act: '', resp: '', fecha: '' }], resultados,
      }).select('*').single();
      if (e) throw e;
      setRows((rs) => rs.map((x) => (x.evaluationId === r.evaluationId ? { ...x, acta: normalizeActa(data) } : x)));
      setOpenId(r.evaluationId);
    } catch (e: any) {
      console.error('[Feedback] create', e);
      setError('No se pudo crear el acta. Inténtalo de nuevo.');
    } finally { setCreating(null); }
  }

  if (!user) return null;
  if (!access.loading && !access.allowed) {
    return (
      <div className="ui-card mx-auto max-w-xl p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Retroalimentación no disponible</h1>
        <p className="mt-1 text-sm text-slate-500">Este módulo es para quienes evalúan a otras personas y para administración.</p>
      </div>
    );
  }

  const current = rows.find((r) => r.evaluationId === openId);
  if (current && current.acta) {
    return (
      <ActaEditor
        row={current}
        readOnly={admin || user.id !== current.evaluator.id}
        currentUserId={user.id}
        onBack={() => { setOpenId(null); load(); }}
        onActa={(a) => setRows((rs) => rs.map((x) => (x.evaluationId === current.evaluationId ? { ...x, acta: a } : x)))}
      />
    );
  }

  const periodLabel = (p: any) => p.name || `Periodo ${p.year}`;
  const tabs: [typeof filter, string][] = [['all', 'Todas'], ['sin', 'Sin acta'], ['borrador', 'Borrador'], ['espera', 'Esperando firmas'], ['firmada', 'Firmadas']];

  return (
    <div ref={scope} className="space-y-6">
      <PageHeader
        title="Retroalimentación"
        description={admin ? 'Actas de retroalimentación de todos los evaluadores, solo lectura.' : 'Registra la conversación con cada persona de tu equipo sobre la evaluación que le hiciste. El acta queda lista para firmar con código OTP.'}
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="fb-period" className="text-sm text-slate-500">Periodo</label>
            <select id="fb-period" className="ui-input !w-auto" value={periodId} onChange={(e) => { setPeriodId(e.target.value); setFilter('all'); setEvaluatorFilter('all'); }}>
              {periods.map((p: any) => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
            </select>
          </div>
        }
      />

      <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Filtrar por estado del acta">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors ${filter === k ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-500 hover:text-slate-900'}`}>
              {label} <span className="text-xs tabular-nums opacity-80">{counts[k]}</span>
            </button>
          ))}
        </div>
        {admin && evaluators.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="fb-ev" className="text-sm text-slate-500">Evaluador</label>
            <select id="fb-ev" className="ui-input !w-auto max-w-[260px]" value={evaluatorFilter} onChange={(e) => setEvaluatorFilter(e.target.value)}>
              <option value="all">Todos</option>
              {evaluators.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div data-reveal className="ui-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">{admin ? 'Evaluado y evaluador' : 'Colaborador'}</th>
                <th className="px-4 py-2.5">Formulario evaluado</th>
                <th className="px-4 py-2.5">Resultado</th>
                <th className="px-4 py-2.5">Acta</th>
                <th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100"><td colSpan={5} className="px-4 py-4"><div className="h-9 animate-pulse rounded-md bg-slate-100" /></td></tr>
              ))}
              {!loading && visible.map((r) => {
                const st = actaState(r.acta);
                const mine = !admin;
                const label = !r.acta ? (mine ? 'Crear acta' : null) : st === 'borrador' && mine ? 'Continuar' : 'Ver acta';
                const Icon = !r.acta ? FilePlus2 : st === 'borrador' && mine ? PencilLine : Eye;
                return (
                  <tr key={r.evaluationId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-800">{initials(r.evaluated.nombre)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{r.evaluated.nombre}</p>
                          <p className="truncate text-xs text-slate-500">{admin ? `Evalúa: ${r.evaluator.nombre}` : r.evaluated.cargo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.template}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-900">{r.score != null ? r.score.toFixed(1).replace('.', ',') : '-'} <span className="font-normal text-slate-400">/ 5,0</span></td>
                    <td className="px-4 py-3"><StatePill state={st} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                      <button onClick={() => exportRow(r)} disabled={exporting === r.evaluationId} className="ui-btn-secondary !px-2.5 !py-1.5" title="Exportar resultados por criterio a Excel" aria-label={`Exportar a Excel los resultados de ${r.evaluated.nombre}`}>
                        {exporting === r.evaluationId ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                      </button>
                      {label && (
                        <button onClick={() => openRow(r)} disabled={creating === r.evaluationId} className={st === 'sin' && mine ? 'ui-btn-primary !py-1.5' : 'ui-btn-secondary !py-1.5'}>
                          <Icon className="h-4 w-4" />{creating === r.evaluationId ? 'Creando' : label}
                        </button>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loading && visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            {rows.length === 0 ? 'No hay evaluaciones completadas en este periodo.' : 'No hay evaluaciones con este estado en el periodo.'}
          </p>
        )}
      </div>
    </div>
  );
}

export default FeedbackModule;

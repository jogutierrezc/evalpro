import { useEffect, useMemo, useState } from 'react';
import { Lock, Search } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePeriods } from '../../hooks/usePeriods';
import { PageHeader } from '../../components/ui/PageHeader';
import { isAdminRole } from '../feedback/useFeedbackAccess';
import { PlanBoard } from './PlanBoard';
import { ProgressBar } from './PlanParts';
import { usePlanData } from './usePlanData';
import { resumir } from './types';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Panel de administración: todas las oficinas, solo lectura. */
export function SupervisionPlanesModule() {
  const { user } = useAuth();
  const admin = isAdminRole(user?.role);
  const { periods, activePeriod, loading: periodsLoading } = usePeriods();
  const [periodId, setPeriodId] = useState('');
  const [office, setOffice] = useState('all');
  const [evaluator, setEvaluator] = useState('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (periodId || periodsLoading) return;
    const p = activePeriod || periods[0];
    if (p) setPeriodId(p.id);
  }, [periods, activePeriod, periodsLoading, periodId]);

  const { items, loading, error, reload } = usePlanData({ admin: true, userId: user?.id, periodId });

  const offices = useMemo(() => {
    const m = new Map<string, typeof items>();
    items.forEach((i) => m.set(i.oficina, [...(m.get(i.oficina) || []), i]));
    return Array.from(m.entries())
      .map(([name, list]) => ({ name, list, r: resumir(list), people: new Set(list.map((i) => i.evaluado.id)).size }))
      .sort((a, b) => b.r.vencidos - a.r.vencidos || a.name.localeCompare(b.name, 'es'));
  }, [items]);

  const evaluators = useMemo(() => {
    const m = new Map<string, string>();
    items.filter((i) => office === 'all' || i.oficina === office).forEach((i) => m.set(i.evaluador.id, i.evaluador.nombre));
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [items, office]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return items.filter((i) =>
      (office === 'all' || i.oficina === office) &&
      (evaluator === 'all' || i.evaluador.id === evaluator) &&
      (!q || norm(i.evaluado.nombre).includes(q) || norm(i.compromiso.act).includes(q)));
  }, [items, office, evaluator, query]);

  if (!user) return null;
  if (!admin) {
    return (
      <div className="ui-card mx-auto max-w-xl p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-slate-400" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">Supervisión no disponible</h1>
        <p className="mt-1 text-sm text-slate-500">Este panel es solo para administración.</p>
      </div>
    );
  }

  const total = resumir(items);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supervisión planes"
        description="Compromisos de retroalimentación de todas las oficinas, con su estado, plazo y evidencias."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="sup-period" className="text-sm text-slate-500">Periodo</label>
            <select id="sup-period" className="ui-input !w-auto" value={periodId} onChange={(e) => { setPeriodId(e.target.value); setOffice('all'); setEvaluator('all'); }}>
              {periods.map((p: any) => <option key={p.id} value={p.id}>{p.name || `Periodo ${p.year}`}</option>)}
            </select>
          </div>
        }
      />

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!loading && offices.length > 0 && (
        <section aria-label="Resumen por oficina" className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-4 py-2.5">Oficina</th>
                  <th className="px-3 py-2.5 text-right">Personas</th>
                  <th className="px-3 py-2.5 text-right">Compromisos</th>
                  <th className="px-3 py-2.5 text-right">Cumplidos</th>
                  <th className="px-3 py-2.5 text-right">En proceso</th>
                  <th className="px-3 py-2.5 text-right">Vencidos</th>
                  <th className="w-52 px-4 py-2.5">Avance</th>
                </tr>
              </thead>
              <tbody>
                {offices.map((o) => {
                  const on = office === o.name;
                  return (
                    <tr key={o.name} className={`border-b border-slate-100 last:border-0 ${on ? 'bg-blue-50/50' : 'hover:bg-slate-50/70'}`}>
                      <td className="px-4 py-2.5">
                        <button type="button" aria-pressed={on} onClick={() => { setOffice(on ? 'all' : o.name); setEvaluator('all'); }}
                          className={`text-left font-medium hover:underline ${on ? 'text-blue-800' : 'text-slate-900'}`}>{o.name}</button>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{o.people}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">{o.r.total}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{o.r.cumplido}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{o.r.en_proceso}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums ${o.r.vencidos ? 'font-semibold text-red-700' : 'text-slate-400'}`}>{o.r.vencidos}</td>
                      <td className="px-4 py-2.5"><ProgressBar pct={o.r.avance} bucket={o.r.avance === 100 ? 'cumplido' : 'en_proceso'} label={`Avance de ${o.name}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
              {offices.length > 1 && (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 text-slate-900">
                    <td className="px-4 py-2.5 font-semibold">Todas las oficinas</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{new Set(items.map((i) => i.evaluado.id)).size}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{total.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">{total.cumplido}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{total.en_proceso}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${total.vencidos ? 'text-red-700' : ''}`}>{total.vencidos}</td>
                    <td className="px-4 py-2.5"><ProgressBar pct={total.avance} bucket="en_proceso" label="Avance de todas las oficinas" /></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <label htmlFor="sup-q" className="sr-only">Buscar persona o compromiso</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="sup-q" type="search" className="ui-input !pl-9" placeholder="Buscar persona o compromiso" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sup-office" className="text-sm text-slate-500">Oficina</label>
          <select id="sup-office" className="ui-input !w-auto max-w-[240px]" value={office} onChange={(e) => { setOffice(e.target.value); setEvaluator('all'); }}>
            <option value="all">Todas</option>
            {offices.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
          </select>
        </div>
        {evaluators.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="sup-ev" className="text-sm text-slate-500">Evaluador</label>
            <select id="sup-ev" className="ui-input !w-auto max-w-[240px]" value={evaluator} onChange={(e) => setEvaluator(e.target.value)}>
              <option value="all">Todos</option>
              {evaluators.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        )}
      </div>

      <PlanBoard
        items={filtered}
        loading={loading || periodsLoading}
        readOnly
        userId={user.id}
        onChanged={reload}
        animateKey={`${periodId}|${office}|${evaluator}`}
        emptyText="Los compromisos aparecen aquí cuando un acta de retroalimentación queda firmada por las dos partes."
      />
    </div>
  );
}

export default SupervisionPlanesModule;

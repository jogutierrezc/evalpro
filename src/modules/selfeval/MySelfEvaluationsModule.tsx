import { useMemo } from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, ClipboardList, Info, TrendingUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { COLORS } from '../performance/charts';
import { useMySelfEvaluations } from './useMySelfEvaluations';
import { buildInsights, previousOf, signed, TOL, type Insight, type SelfEntry, type Tone } from './insights';

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toFixed(2).replace('.', ','));
const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

const TONE: Record<Tone, { box: string; icon: typeof Info; label: string }> = {
  good: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2, label: 'Avance' },
  watch: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertCircle, label: 'Atención' },
  priority: { box: 'border-red-200 bg-red-50 text-red-900', icon: AlertCircle, label: 'Prioridad' },
  info: { box: 'border-slate-200 bg-slate-50 text-slate-700', icon: Info, label: 'Nota' },
};

function InsightRow({ i }: { i: Insight }) {
  const t = TONE[i.tone];
  const Icon = t.icon;
  return (
    <li className={`flex gap-3 rounded-md border px-4 py-3 ${t.box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold"><span className="sr-only">{t.label}: </span>{i.title}</p>
        <p className="mt-0.5 max-w-[75ch] text-sm leading-relaxed">{i.detail}</p>
      </div>
    </li>
  );
}

function Delta({ d }: { d: number | null }) {
  if (d === null) return <span className="text-slate-400">-</span>;
  const tone = d >= TOL ? 'text-emerald-700' : d <= -TOL ? 'text-red-700' : 'text-slate-500';
  return <span className={`tabular-nums font-medium ${tone}`}>{signed(d)}</span>;
}

export function MySelfEvaluationsModule({ onNavigate }: { onNavigate?: (m: string) => void }) {
  const { user } = useAuth();
  const { entries, loading, error } = useMySelfEvaluations(user?.id);

  const latest = entries[entries.length - 1];
  const prev = useMemo(() => previousOf(entries), [entries]);
  const insights = useMemo(() => buildInsights(entries), [entries]);
  const chart = useMemo(() => entries.map((e) => ({ name: e.periodName, full: e.periodFull, template: e.template, score: e.global })), [entries]);

  // Filas de la tabla de evolución: unión de competencias de todas las mediciones, en el orden de la más reciente.
  const rows = useMemo(() => {
    const order: string[] = [];
    const titles = new Map<string, string>();
    [...entries].reverse().forEach((e) => e.competencies.forEach((c) => { if (!titles.has(c.key)) { titles.set(c.key, c.title); order.push(c.key); } }));
    return order.map((key) => {
      const values = entries.map((e) => e.competencies.find((c) => c.key === key)?.score ?? null);
      const cur = latest?.competencies.find((c) => c.key === key)?.score ?? null;
      const before = prev?.competencies.find((c) => c.key === key)?.score ?? null;
      return { key, title: titles.get(key) as string, values, delta: cur !== null && before !== null ? Math.round((cur - before) * 100) / 100 : null };
    });
  }, [entries, latest, prev]);

  const globalDelta = latest?.global != null && prev?.global != null ? Math.round((latest.global - prev.global) * 100) / 100 : null;
  const avg = entries.length ? entries.reduce((a, e) => a + (e.global ?? 0), 0) / entries.filter((e) => e.global !== null).length : null;

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4" aria-busy="true">
        <div className="h-9 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-24 animate-pulse rounded-lg bg-white" />
        <div className="h-72 animate-pulse rounded-lg bg-white" />
      </div>
    );
  }

  if (error) {
    return <div role="alert" className="mx-auto max-w-5xl rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">No se pudieron cargar tus autoevaluaciones: {error}</div>;
  }

  if (!entries.length) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mis Autoevaluaciones</h1>
        <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-400" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Aún no has completado una autoevaluación</h2>
          <p className="mx-auto mt-1 max-w-[52ch] text-sm text-slate-500">Cuando completes una, aquí verás tu resultado, cómo cambia entre períodos y recomendaciones para mejorar.</p>
          {onNavigate && <button onClick={() => onNavigate('dashboard')} className="ui-btn-primary mt-5">Ir a mis evaluaciones <ArrowRight className="h-4 w-4" /></button>}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mis Autoevaluaciones</h1>
        <p className="mt-1 text-sm text-slate-500">Tu resultado más reciente, cómo ha cambiado entre períodos y qué puedes trabajar. Escala de 1 a 5.</p>
      </header>

      <section aria-label="Resumen" className="grid grid-cols-2 divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white md:grid-cols-4 md:divide-x">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">Última autoevaluación</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: COLORS.self }}>{fmt(latest.global)}</p>
          <p className="mt-1 text-xs text-slate-500">{latest.periodName}, {dateFmt(latest.date)}</p>
        </div>
        <div className="border-l border-slate-200 p-4 md:border-l-0">
          <p className="text-xs font-medium text-slate-500">Cambio frente al anterior</p>
          <p className="mt-1 text-3xl font-semibold"><Delta d={globalDelta} /></p>
          <p className="mt-1 text-xs text-slate-500">{prev ? `Contra ${prev.periodName}` : 'Aún no hay con qué comparar'}</p>
        </div>
        <div className="border-t border-slate-200 p-4 md:border-t-0">
          <p className="text-xs font-medium text-slate-500">Promedio histórico</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{fmt(avg)}</p>
          <p className="mt-1 text-xs text-slate-500">De todas tus mediciones</p>
        </div>
        <div className="border-l border-t border-slate-200 p-4 md:border-t-0">
          <p className="text-xs font-medium text-slate-500">Autoevaluaciones</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{entries.length}</p>
          <p className="mt-1 text-xs text-slate-500">Completadas</p>
        </div>
      </section>

      <section aria-labelledby="sec-reco">
        <h2 id="sec-reco" className="mb-3 text-lg font-semibold text-slate-900">Recomendaciones según tus resultados</h2>
        <ul className="space-y-2">{insights.map((i, k) => <InsightRow key={k} i={i} />)}</ul>
      </section>

      <section aria-labelledby="sec-evo">
        <h2 id="sec-evo" className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900"><TrendingUp className="h-5 w-5 text-slate-500" />Evolución</h2>
        {entries.length > 1 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="h-64" role="img" aria-label={`Resultado global por período: ${chart.map((c) => `${c.name} ${fmt(c.score)}`).join(', ')}`}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={{ stroke: '#cbd5e1' }} />
                  <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v: any) => [fmt(Number(v)), 'Resultado global']}
                    labelFormatter={(_l, p: any) => (p?.[0]?.payload ? `${p[0].payload.full} · ${p[0].payload.template}` : '')}
                    contentStyle={{ fontSize: 13, borderRadius: 6, border: '1px solid #cbd5e1' }}
                  />
                  <Line type="monotone" dataKey="score" stroke={COLORS.self} strokeWidth={2.5} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="rounded-md bg-slate-100 px-3 py-2 text-[13px] text-slate-600">Con una sola autoevaluación no hay evolución que mostrar. El gráfico aparecerá cuando completes la siguiente.</p>
        )}

        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Resultado por competencia en cada autoevaluación</caption>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th scope="col" className="px-4 py-2.5">Competencia</th>
                {entries.map((e) => <th key={e.id} scope="col" className="px-3 py-2.5 text-right" title={e.periodFull}>{e.periodName}</th>)}
                {prev && <th scope="col" className="px-4 py-2.5 text-right">Cambio</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row" className="px-4 py-2.5 text-left font-medium text-slate-800">{r.title}</th>
                  {r.values.map((v, k) => <td key={k} className={`px-3 py-2.5 text-right tabular-nums ${k === r.values.length - 1 ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{fmt(v)}</td>)}
                  {prev && <td className="px-4 py-2.5 text-right"><Delta d={r.delta} /></td>}
                </tr>
              ))}
              <tr className="bg-slate-50">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold text-slate-900">Resultado global</th>
                {entries.map((e, k) => <td key={e.id} className={`px-3 py-2.5 text-right tabular-nums font-semibold ${k === entries.length - 1 ? 'text-slate-900' : 'text-slate-600'}`}>{fmt(e.global)}</td>)}
                {prev && <td className="px-4 py-2.5 text-right"><Delta d={globalDelta} /></td>}
              </tr>
            </tbody>
          </table>
        </div>
        {prev && prev.templateId !== latest.templateId && (
          <p className="mt-2 text-[13px] text-slate-500">La última autoevaluación usa un formulario distinto al anterior; solo se comparan las competencias con el mismo nombre.</p>
        )}
      </section>

      <section aria-labelledby="sec-hist">
        <h2 id="sec-hist" className="mb-3 text-lg font-semibold text-slate-900">Historial</h2>
        <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {[...entries].reverse().map((e: SelfEntry, idx) => (
            <details key={e.id} open={idx === 0} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{e.periodFull}</span>
                  <span className="block text-xs text-slate-500">{e.template}, {dateFmt(e.date)}</span>
                </span>
                <span className="text-lg font-semibold tabular-nums" style={{ color: COLORS.self }}>{fmt(e.global)}</span>
              </summary>
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                {e.competencies.map((c) => (
                  <div key={c.key} className="py-2">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-slate-800">{c.title}</h3>
                      <span className="text-sm font-semibold tabular-nums text-slate-800">{fmt(c.score)}</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {c.criteria.map((q) => (
                        <li key={q.id} className="flex items-start justify-between gap-4 text-[13px] text-slate-600">
                          <span className="max-w-[70ch]">{q.text}</span>
                          <span className="tabular-nums">{fmt(q.score)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

export default MySelfEvaluationsModule;

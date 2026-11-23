import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { AlertCircle, Building2, Calendar, ChevronDown, FileDown, FileSpreadsheet, Loader2, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { usePeriods } from '../../hooks/usePeriods';
import { periodLabel } from '../../lib/evaluationSnapshot';
import { COLORS, RadarCompare, Track, type Axis, type SeriesKey } from './charts';
import { usePerformanceReport, type Competency } from './usePerformanceReport';
import './performance.css';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '-' : n.toFixed(2).replace('.', ','));
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toFixed(2).replace('.', ',')}`;
const logo = `${import.meta.env.BASE_URL}acta/udes.png`;
const firstName = (full: string) => full.trim().split(/\s+/).slice(0, 1).join(' ');

/** Diferencia contra el promedio de la oficina. Dentro de ±0,10 se considera en la media. */
const TOL = 0.1;
type Rel = 'above' | 'mean' | 'below';
const relOf = (v: number | null, ref: number | null): { rel: Rel; delta: number } | null => {
  if (v === null || ref === null) return null;
  const delta = Math.round((v - ref) * 100) / 100;
  return { rel: delta >= TOL ? 'above' : delta <= -TOL ? 'below' : 'mean', delta };
};
const REL_TEXT: Record<Rel, string> = { above: 'Sobre la media', mean: 'En la media', below: 'Debajo de la media' };
const REL_STYLE: Record<Rel, string> = {
  above: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  mean: 'bg-slate-100 text-slate-700 ring-slate-200',
  below: 'bg-rose-50 text-rose-800 ring-rose-200',
};
const REL_ICON = { above: TrendingUp, mean: Minus, below: TrendingDown };

function RelChip({ v, ref0, compact }: { v: number | null; ref0: number | null; compact?: boolean }) {
  const r = relOf(v, ref0);
  if (!r) return <span className="text-xs text-slate-400">Sin comparativo</span>;
  const Icon = REL_ICON[r.rel];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${REL_STYLE[r.rel]}`} title={`${REL_TEXT[r.rel]} (${signed(r.delta)} frente al promedio de la oficina)`}>
      <Icon className="h-3.5 w-3.5" />
      {compact ? signed(r.delta) : `${REL_TEXT[r.rel]}, ${signed(r.delta)}`}
    </span>
  );
}

const LEGEND: { key: SeriesKey; label: string; swatch: JSX.Element }[] = [
  { key: 'leader', label: 'Líder', swatch: <span className="inline-block h-3 w-3 rounded-full" style={{ background: COLORS.leader }} /> },
  { key: 'self', label: 'Autoevaluación', swatch: <span className="inline-block h-3 w-3 rounded-full border-2 bg-white" style={{ borderColor: COLORS.self }} /> },
  { key: 'office', label: 'Promedio oficina', swatch: <span className="inline-block h-3.5 w-[3px] rounded-sm" style={{ background: COLORS.office }} /> },
];

interface Props {
  targetUserId?: string;
  evaluationId?: string;
  viewMode?: 'self' | 'manager';
  targetUserName?: string;
  currentUserId?: string;
}

export default function PerformanceDashboard({ targetUserId, evaluationId, viewMode = 'self', targetUserName, currentUserId }: Props) {
  const { periods, activePeriod, loading: periodsLoading } = usePeriods();
  const personId = targetUserId || currentUserId;
  const [periodId, setPeriodId] = useState('');
  const [userPicked, setUserPicked] = useState(false);
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ leader: true, self: true, office: true });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showLeaders, setShowLeaders] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Periodo inicial: el de la evaluación que se abrió; si no, el activo o el más reciente.
  useEffect(() => {
    if (periodId || periodsLoading) return;
    let alive = true;
    (async () => {
      if (evaluationId) {
        const { data } = await supabase.from('evaluations').select('period_id').eq('id', evaluationId).maybeSingle();
        if (alive && data?.period_id) { setPeriodId(data.period_id); return; }
      }
      const initial = activePeriod || periods[0];
      if (alive && initial) setPeriodId(initial.id);
    })();
    return () => { alive = false; };
  }, [periods, activePeriod, periodsLoading, periodId, evaluationId]);

  const { forms, selectedFormId, setSelectedFormId, report, selfOnly, loading, error, hasEvaluations } = usePerformanceReport({ personId, periodId, periods, evaluationId });

  // Si el periodo por defecto no tiene evaluaciones, prueba el anterior (solo mientras la persona no haya elegido uno).
  useEffect(() => {
    if (userPicked || loading || !periodId || hasEvaluations || selfOnly || error) return;
    const i = periods.findIndex((p: any) => p.id === periodId);
    if (i >= 0 && i < periods.length - 1) setPeriodId(periods[i + 1].id);
  }, [userPicked, loading, periodId, hasEvaluations, selfOnly, error, periods]);

  const axes: Axis[] = useMemo(() => (report?.competencies || []).map((c) => ({ id: c.id, label: c.title, leader: c.leader, self: c.self, office: c.office })), [report]);

  // Entrada escalonada: transform y opacidad, 240 ms; sin movimiento si el usuario lo pide y con salida de seguridad.
  useLayoutEffect(() => {
    if (!root.current || !report || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 8, opacity: 0, duration: 0.24, ease: 'power3.out', stagger: 0.05, clearProps: 'transform,opacity' });
    }, root);
    const safety = window.setTimeout(() => ctx.revert(), 1600);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, [report?.leaders.map((l) => l.evaluationId).join(',')]);

  const multi = (report?.leaders.length || 0) > 1;
  const leaderSeries = useMemo(
    () => (report && multi ? report.leaders.map((l) => ({ id: l.evaluationId, label: l.name, color: l.color, values: report.competencies.map((c) => c.leaders[l.evaluationId] ?? null) })) : []),
    [report, multi],
  );

  const strengths = useMemo(() => [...(report?.competencies || [])].filter((c) => c.leader !== null).sort((a, b) => (b.leader as number) - (a.leader as number)).slice(0, 3), [report]);
  const opportunities = useMemo(() => [...(report?.competencies || [])].filter((c) => c.leader !== null).sort((a, b) => (a.leader as number) - (b.leader as number)).slice(0, 3), [report]);
  const gaps = useMemo(
    () => [...(report?.competencies || [])].filter((c) => c.leader !== null && c.self !== null)
      .map((c) => ({ c, gap: Math.round(((c.self as number) - (c.leader as number)) * 100) / 100 }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)).slice(0, 3),
    [report],
  );

  const toggleSeries = (k: SeriesKey) => setShow((s) => ({ ...s, [k]: !s[k] }));
  const allOpen = report ? report.competencies.every((c) => !collapsed[c.id]) : true;

  // PDF real en tamaño carta (texto seleccionable). La librería se carga solo al exportar.
  const downloadPdf = async () => {
    if (!report || exporting) return;
    setExporting(true); setExportError(null);
    try {
      const { downloadPerformancePdf } = await import('./exportPdf');
      await downloadPerformancePdf(report, { periodLabel: periodLabel(periods.find((p: any) => p.id === periodId)) });
    } catch (err: any) {
      console.error('[Desempeño] PDF', err);
      setExportError(err?.message || 'No se pudo generar el PDF.');
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = () => {
    if (!report) return;
    const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const n = (v: number | null) => (v === null ? '' : v.toFixed(2).replace('.', ','));
    const lead = report.leaders;
    const perLeader = (get: (id: string) => number | null) => (lead.length > 1 ? lead.map((l) => n(get(l.evaluationId))) : []);
    const vsOffice = (v: number | null, ref: number | null) => (relOf(v, ref) ? signed(relOf(v, ref)!.delta) : '');
    const rows: (string | number | null)[][] = [
      ['Reporte de desempeño', report.person.name], ['Cargo', report.person.role], ['Oficina', report.person.office], ['Formulario', report.template],
      ['Periodo', periodLabel(periods.find((p: any) => p.id === periodId))],
      ['Líderes', lead.map((l) => `${l.name} (${l.date})`).join('; ')],
      ['Formulario de la autoevaluación', report.self ? `${report.self.template}${report.self.sameForm ? '' : ' (distinto al del líder: criterios no comparables)'}` : 'Sin autoevaluación'], [],
      ['Competencia', 'Criterio', lead.length > 1 ? 'Promedio de líderes' : 'Líder', ...(lead.length > 1 ? lead.map((l) => l.name) : []), 'Autoevaluación', 'Brecha (auto menos líder)', 'Promedio oficina', 'Líder frente a oficina'],
    ];
    rows.push(['Resultado global', '', n(report.global.leader), ...(lead.length > 1 ? lead.map((l) => n(l.global)) : []), n(report.global.self), report.global.leader !== null && report.global.self !== null ? n(report.global.self - report.global.leader) : '', n(report.global.office), vsOffice(report.global.leader, report.global.office)]);
    report.competencies.forEach((c) => {
      rows.push([c.title, '(competencia)', n(c.leader), ...perLeader((id) => c.leaders[id] ?? null), n(c.self), c.leader !== null && c.self !== null ? n(c.self - c.leader) : '', n(c.office), vsOffice(c.leader, c.office)]);
      c.criteria.forEach((q) => rows.push([c.title, q.text, n(q.leader), ...perLeader((id) => q.leaders[id] ?? null), n(q.self), q.leader !== null && q.self !== null ? n(q.self - q.leader) : '', n(q.office), vsOffice(q.leader, q.office)]));
    });
    const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Reporte-desempeno-${report.person.name.trim().replace(/\s+/g, '-')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const name = report?.person.name || targetUserName || 'Colaborador';

  /* ---------- Estados ---------- */
  const controls = (
    <div className="no-print flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="pr-period" className="flex items-center gap-1.5 text-sm text-slate-500"><Calendar className="h-4 w-4" />Periodo</label>
        <select id="pr-period" className="ui-input !w-auto" value={periodId} onChange={(e) => { setUserPicked(true); setPeriodId(e.target.value); setSelectedFormId(undefined); }}>
          {periods.map((p: any) => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
        </select>
      </div>
      {forms.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="pr-form" className="text-sm text-slate-500">Formulario</label>
          <select id="pr-form" className="ui-input !w-auto max-w-[320px]" value={selectedFormId || ''} onChange={(e) => setSelectedFormId(e.target.value)}>
            {forms.map((f) => <option key={f.templateId} value={f.templateId}>{f.template}, {f.leaders === 1 ? '1 líder' : `${f.leaders} líderes`}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        {controls}
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />No se pudo cargar el reporte: {error}</div>
      </div>
    );
  }

  if (loading || periodsLoading || !periodId) {
    return (
      <div className="mx-auto max-w-5xl space-y-5" aria-busy="true">
        <div className="h-9 w-72 animate-pulse rounded-md bg-slate-200" />
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-24 animate-pulse bg-white" />)}
        </div>
        <div className="grid gap-6 lg:grid-cols-2"><div className="h-96 animate-pulse rounded-lg bg-white" /><div className="h-96 animate-pulse rounded-lg bg-white" /></div>
      </div>
    );
  }

  // Sin evaluación de un líder pero con autoevaluación completada: se muestra la autoevaluación.
  if (!report && selfOnly) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {controls}
        <header className="border-b border-slate-200 pb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Resultado de la autoevaluación</h1>
          <p className="mt-1 text-lg text-slate-800">{selfOnly.person.name}</p>
          <p className="mt-0.5 text-sm text-slate-500">{[selfOnly.person.role, selfOnly.person.office].filter(Boolean).join(', ')}</p>
          <p className="mt-2 text-xs text-slate-500">{selfOnly.template}, {selfOnly.date}{selfOnly.otherPeriod ? `, de otro periodo (${selfOnly.periodLabel})` : ''}. Escala de 1 a 5.</p>
        </header>
        <p className="rounded-md bg-slate-100 px-3 py-2 text-[13px] text-slate-600">
          {viewMode === 'manager' ? `${name} aún no tiene una evaluación de líder` : 'Aún no tienes una evaluación de líder'} en este periodo. Cuando exista, aquí aparecerá la comparación con tu autoevaluación.
        </p>
        <section aria-label="Resultado global" className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium text-slate-500">Autoevaluación</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: COLORS.self }}>{fmt(selfOnly.global)}</p>
        </section>
        <section aria-label="Competencias" className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          {selfOnly.competencies.map((c) => (
            <div key={c.id} className="border-b border-slate-100 last:border-b-0">
              <div className="flex items-center justify-between gap-4 bg-slate-50 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-slate-900">{c.title}</h2>
                <span className="text-sm font-semibold tabular-nums" style={{ color: COLORS.self }}>{fmt(c.score)}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {c.criteria.map((q) => (
                  <li key={q.id} className="flex items-start justify-between gap-4 px-4 py-2 text-sm text-slate-700">
                    <span className="max-w-[70ch]">{q.text}</span>
                    <span className="tabular-nums" style={{ color: COLORS.self }}>{fmt(q.score)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {selfOnly.competencies.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">La autoevaluación no tiene preguntas de calificación.</p>}
        </section>
      </div>
    );
  }

  if (!report) {
    const p = periods.find((x: any) => x.id === periodId);
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        {controls}
        <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-amber-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">Sin evaluación del líder en este periodo</h2>
          <p className="mx-auto mt-1 max-w-[52ch] text-sm text-slate-500">{viewMode === 'manager' ? `${name} no tiene una evaluación completada` : 'No tienes una evaluación completada'}{p ? ` en ${periodLabel(p)}` : ''}. Si fue en otro periodo, elígelo arriba.</p>
        </div>
      </div>
    );
  }

  const gVsOffice = relOf(report.global.leader, report.global.office);
  const gap = report.global.leader !== null && report.global.self !== null ? Math.round((report.global.self - report.global.leader) * 100) / 100 : null;
  const bench = report.benchmark;

  return (
    <div ref={root} className="pr-root mx-auto max-w-5xl space-y-8">
      {/* Encabezado */}
      <header data-reveal className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b border-slate-200 pb-5">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reporte de desempeño</h1>
          <p className="mt-1 text-lg text-slate-800">{name}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {[report.person.role, report.person.office].filter(Boolean).join(', ')}
          </p>
          <p className="mt-2 text-xs text-slate-500">{report.template}, {periodLabel(periods.find((p: any) => p.id === periodId))}. Escala de 1 a 5.</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <img src={logo} alt="Universidad de Santander" className="h-10 w-auto" />
          <div className="no-print flex flex-wrap justify-end gap-2">
            <button onClick={downloadPdf} disabled={exporting} className="ui-btn-primary">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}{exporting ? 'Generando PDF' : 'Descargar PDF'}</button>
            <button onClick={downloadCsv} className="ui-btn-secondary"><FileSpreadsheet className="h-4 w-4" />Descargar CSV</button>
          </div>
        </div>
      </header>

      {exportError && <div role="alert" className="no-print -mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />No se pudo generar el PDF: {exportError}</div>}

      <div data-reveal className="no-print flex flex-wrap items-end justify-between gap-4">
        {controls}
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Series del gráfico">
          {multi && (
            <button onClick={() => setShowLeaders((v) => !v)} aria-pressed={showLeaders}
              className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-[background-color,color,border-color] ${showLeaders ? 'border-slate-300 bg-white text-slate-800' : 'border-transparent bg-slate-100 text-slate-400'}`}>
              <span className="flex -space-x-1">{(report?.leaders || []).slice(0, 3).map((l) => <span key={l.evaluationId} className="inline-block h-3 w-3 rounded-full ring-2 ring-white" style={{ background: l.color }} />)}</span>Ver por líder
            </button>
          )}
          {LEGEND.map((l) => (
            <button key={l.key} onClick={() => toggleSeries(l.key)} aria-pressed={show[l.key]}
              className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition-[background-color,color,border-color] ${show[l.key] ? 'border-slate-300 bg-white text-slate-800' : 'border-transparent bg-slate-100 text-slate-400 line-through'}`}>
              {l.swatch}{l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Resumen en una franja */}
      <section data-reveal aria-label="Resultados globales" className="pr-avoid pr-summary grid grid-cols-2 divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white md:grid-cols-5 md:divide-x">
        <div className="p-4">
          <p className="text-xs font-medium text-slate-500">{multi ? `Promedio de ${report.leaders.length} líderes` : 'Evaluación del líder'}</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: COLORS.leader }}>{fmt(report.global.leader)}</p>
          <p className="mt-1 text-xs text-slate-500">{multi ? 'Mismo peso para cada líder' : `${report.leaders[0].name}, ${report.leaders[0].date}`}</p>
        </div>
        <div className="border-l border-slate-200 p-4 md:border-l-0">
          <p className="text-xs font-medium text-slate-500">Autoevaluación</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: report.global.self !== null ? COLORS.self : '#94a3b8' }}>{report.global.self !== null ? fmt(report.global.self) : 'Pendiente'}</p>
          <p className="mt-1 text-xs text-slate-500">{report.self ? `${report.self.date}${report.self.sameForm ? '' : `, formulario ${report.self.template}`}${report.self.otherPeriod ? `, de otro periodo (${report.self.periodLabel})` : ''}` : 'Sin autoevaluación completada'}</p>
        </div>
        <div className="border-t border-slate-200 p-4 md:border-l md:border-t-0">
          <p className="text-xs font-medium text-slate-500">Brecha auto y líder</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-900">{gap !== null ? signed(gap) : '-'}</p>
          <p className="mt-1 text-xs text-slate-500">{gap === null ? 'Necesita las dos evaluaciones' : Math.abs(gap) < TOL ? 'Coinciden' : gap > 0 ? 'La persona se ve por encima del líder' : 'La persona se ve por debajo del líder'}</p>
        </div>
        <div className="border-l border-t border-slate-200 p-4 md:border-t-0">
          <p className="flex items-center gap-1 text-xs font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" />Promedio oficina</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: COLORS.office }}>{bench.status === 'ok' ? fmt(report.global.office) : '-'}</p>
          <p className="mt-1 text-xs text-slate-500" title={bench.status === 'ok' ? bench.office : undefined}>
            {bench.status === 'ok' ? `${bench.office}, ${bench.n} compañeros` : bench.status === 'insufficient' ? `Menos de 3 compañeros evaluados (${bench.n})` : bench.status === 'no_office' ? 'La persona no tiene oficina' : 'Comparativo no disponible'}
          </p>
        </div>
        <div className="col-span-2 border-t border-slate-200 p-4 md:col-span-1 md:border-l md:border-t-0">
          <p className="text-xs font-medium text-slate-500">Líder frente a la oficina</p>
          <div className="mt-2"><RelChip v={report.global.leader} ref0={bench.status === 'ok' ? report.global.office : null} /></div>
          <p className="mt-2 text-xs text-slate-500">{gVsOffice && bench.status === 'ok' ? 'Dentro de ±0,10 cuenta como en la media' : ''}</p>
        </div>
      </section>

      {bench.status !== 'ok' && (
        <p data-reveal className="no-print -mt-4 rounded-md bg-slate-100 px-3 py-2 text-[13px] text-slate-600">
          {bench.status === 'unavailable'
            ? <>El comparativo con la oficina no está disponible. Falta aplicar la migración 20261116000000 en la base de datos, o la función devolvió un error. {bench.detail && <span className="mt-1 block font-mono text-[12px] text-slate-500">Detalle: {bench.detail}</span>}</>
            : bench.status === 'insufficient'
              ? 'Para no identificar a nadie, el promedio de la oficina solo se muestra cuando hay al menos 3 compañeros evaluados con el mismo formulario y periodo.'
              : 'Esta persona no tiene oficina asignada, por eso no hay comparativo.'}
        </p>
      )}

      {report.self && !report.self.sameForm && (
        <p data-reveal className="-mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          La autoevaluación es del formulario "{report.self.template}", distinto al que usó el líder ("{report.template}"). Se compara el resultado global y las competencias con el mismo nombre; los criterios no se pueden comparar uno a uno.
        </p>
      )}

      {multi && (
        <section data-reveal className="pr-avoid">
          <h2 className="text-lg font-semibold text-slate-900">Evaluación por líder</h2>
          <p className="mt-0.5 max-w-[70ch] text-sm text-slate-500">Cada líder que evaluó a {name} con este formulario. El resultado del resumen es el promedio de estas notas, con el mismo peso para cada líder.</p>
          <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ '--cols': Math.min(report.leaders.length, 4) } as any}>
            {report.leaders.map((l) => {
              const vsSelf = l.global !== null && report.global.self !== null ? Math.round((report.global.self - l.global) * 100) / 100 : null;
              const vsAvg = l.global !== null && report.global.leader !== null ? Math.round((l.global - report.global.leader) * 100) / 100 : null;
              return (
                <div key={l.evaluationId} className="bg-white p-4">
                  <p className="flex items-center gap-2 text-xs font-medium text-slate-600"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: l.color }} /><span className="truncate" title={l.name}>{l.name}</span></p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums" style={{ color: l.color }}>{fmt(l.global)}</p>
                  <p className="mt-1 text-xs text-slate-500">{l.date}</p>
                  <p className="mt-2 text-xs tabular-nums text-slate-600">Frente al promedio de líderes: <b>{vsAvg !== null ? signed(vsAvg) : '-'}</b></p>
                  <p className="text-xs tabular-nums text-slate-600">Autoevaluación menos este líder: <b>{vsSelf !== null ? signed(vsSelf) : '-'}</b></p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mapa de competencias */}
      <section data-reveal>
        <h2 className="text-lg font-semibold text-slate-900">Mapa de competencias</h2>
        <p className="mt-0.5 text-sm text-slate-500">Cada eje es una competencia. Mientras más lejos del centro, mejor resultado.</p>
        <div className={`mt-4 grid items-start gap-x-8 gap-y-6 ${multi ? '' : 'lg:grid-cols-[minmax(0,7fr)_minmax(0,6fr)]'}`}>
          <div className="pr-avoid rounded-lg border border-slate-200 bg-white p-3"><RadarCompare axes={axes} visible={show} leaderSeries={showLeaders ? leaderSeries : []} /></div>
          <div className="pr-avoid overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 460 + (multi ? report.leaders.length * 64 : 0) }}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <th className="px-3 py-2.5">Competencia</th>
                  <th className="px-2 py-2.5 text-right" style={{ color: COLORS.leader }}>{multi ? 'Prom.' : 'Líder'}</th>
                  {multi && report.leaders.map((l) => (
                    <th key={l.evaluationId} className="px-2 py-2.5 text-right" style={{ color: l.color }} title={l.name}>{firstName(l.name)}</th>
                  ))}
                  <th className="px-2 py-2.5 text-right" style={{ color: COLORS.self }}>Auto</th>
                  <th className="px-2 py-2.5 text-right">Oficina</th>
                  <th className="px-3 py-2.5">Frente a la oficina</th>
                </tr>
              </thead>
              <tbody>
                {report.competencies.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{c.title}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums" style={{ color: COLORS.leader }}>{fmt(c.leader)}</td>
                    {multi && report.leaders.map((l) => (
                      <td key={l.evaluationId} className="px-2 py-2.5 text-right tabular-nums" style={{ color: l.color }}>{fmt(c.leaders[l.evaluationId])}</td>
                    ))}
                    <td className="px-2 py-2.5 text-right tabular-nums" style={{ color: COLORS.self }}>{fmt(c.self)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">{fmt(c.office)}</td>
                    <td className="px-3 py-2.5"><RelChip v={c.leader} ref0={c.office} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {report.self && !report.self.sameForm && report.self.unmatched.length > 0 && (
        <section data-reveal className="pr-avoid -mt-2">
          <h3 className="text-sm font-semibold text-slate-900">Autoevaluación: competencias propias de su formulario</h3>
          <p className="text-xs text-slate-500">No existen en el formulario del líder, por eso no se comparan.</p>
          <ul className="mt-2 grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {report.self.unmatched.map((u) => (
              <li key={u.title} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 text-sm">
                <span className="text-slate-700">{u.title}</span>
                <span className="font-semibold tabular-nums" style={{ color: COLORS.self }}>{fmt(u.score)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Fortalezas, oportunidades y brechas */}
      <section data-reveal className="pr-avoid grid gap-x-8 gap-y-6 md:grid-cols-3 md:divide-x md:divide-slate-200">
        {([
          ['Mayores fortalezas', 'Competencias con mejor evaluación del líder', strengths.map((c) => ({ id: c.id, t: c.title, v: fmt(c.leader), tone: 'text-emerald-700' }))],
          ['Oportunidades de mejora', 'Competencias con menor evaluación del líder', opportunities.map((c) => ({ id: c.id, t: c.title, v: fmt(c.leader), tone: 'text-rose-700' }))],
          ['Mayores brechas', 'Dónde la autoevaluación más se aleja del líder', gaps.map(({ c, gap: g }) => ({ id: c.id, t: c.title, v: signed(g), tone: 'text-orange-700' }))],
        ] as const).map(([title, hint, items], i) => (
          <div key={title} className={i > 0 ? 'md:pl-8' : ''}>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{hint}</p>
            <ul className="mt-3 grid gap-2">
              {items.length === 0 && <li className="text-sm text-slate-400">Sin datos para comparar</li>}
              {items.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 text-slate-700">{it.t}</span>
                  <span className={`shrink-0 font-semibold tabular-nums ${it.tone}`}>{it.v}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Criterios evaluados */}
      <section data-reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Criterios evaluados</h2>
            <p className="mt-0.5 text-sm text-slate-500">Punto sólido: {multi ? 'promedio de los líderes' : 'líder'}. Anillo: autoevaluación. Marca vertical: promedio de la oficina.{multi ? ' Bajo cada criterio, la nota de cada líder.' : ''}</p>
          </div>
          <button className="no-print ui-btn-secondary !py-1.5" onClick={() => setCollapsed(allOpen ? Object.fromEntries(report.competencies.map((c) => [c.id, true])) : {})}>
            {allOpen ? 'Contraer todo' : 'Expandir todo'}
          </button>
        </div>

        <div className="mt-4 grid gap-4">
          {report.competencies.map((c: Competency) => {
            const open = !collapsed[c.id];
            return (
              <div key={c.id} className="pr-avoid overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button onClick={() => setCollapsed((s) => ({ ...s, [c.id]: open }))} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  <ChevronDown className={`no-print h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                  <span className="min-w-0 flex-1 font-semibold text-slate-900">{c.title}</span>
                  <span className="hidden items-center gap-4 text-sm tabular-nums sm:flex">
                    <span style={{ color: COLORS.leader }} className="font-semibold">{fmt(c.leader)}</span>
                    {multi && c.leaders && report.leaders.map((l) => <span key={l.evaluationId} className="text-xs" style={{ color: l.color }} title={l.name}>{fmt(c.leaders[l.evaluationId])}</span>)}
                    <span style={{ color: COLORS.self }}>{fmt(c.self)}</span>
                    <span className="text-slate-500">{fmt(c.office)}</span>
                  </span>
                  <RelChip v={c.leader} ref0={c.office} compact />
                </button>
                <div className="pr-acc" hidden={!open}>
                  <div className="pr-crit-head hidden grid-cols-[minmax(0,1fr)_220px_64px_64px_64px_64px] gap-x-4 border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 lg:grid">
                    <span>Criterio</span><span>Comparación 1 a 5</span>
                    <span className="text-right" style={{ color: COLORS.leader }}>Líder</span>
                    <span className="text-right" style={{ color: COLORS.self }}>Auto</span>
                    <span className="text-right">Oficina</span><span className="text-right">Brecha</span>
                  </div>
                  <ul>
                    {c.criteria.map((q) => {
                      const g = q.leader !== null && q.self !== null ? Math.round((q.self - q.leader) * 100) / 100 : null;
                      return (
                        <li key={q.id} className="pr-crit-row grid gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 text-sm lg:grid-cols-[minmax(0,1fr)_220px_64px_64px_64px_64px] lg:items-center">
                          <div>
                            <p className="text-slate-700">{q.text}</p>
                            {multi && (
                              <p className="mt-1 flex flex-wrap gap-x-3 text-xs tabular-nums">
                                {report.leaders.map((l) => <span key={l.evaluationId} style={{ color: l.color }}>{firstName(l.name)} <b>{fmt(q.leaders[l.evaluationId])}</b></span>)}
                              </p>
                            )}
                          </div>
                          <Track leader={q.leader} self={q.self} office={q.office} show={show} />
                          <div className="pr-vals flex gap-4 tabular-nums lg:contents">
                            <span className="lg:text-right"><span className="text-xs text-slate-400 lg:hidden">Líder </span><b style={{ color: COLORS.leader }}>{fmt(q.leader)}</b></span>
                            <span className="lg:text-right" style={{ color: COLORS.self }}><span className="text-xs text-slate-400 lg:hidden">Auto </span>{fmt(q.self)}</span>
                            <span className="text-slate-500 lg:text-right"><span className="text-xs text-slate-400 lg:hidden">Oficina </span>{fmt(q.office)}</span>
                            <span className={`lg:text-right ${g !== null && Math.abs(g) >= 1 ? 'font-semibold text-orange-700' : 'text-slate-600'}`}><span className="text-xs text-slate-400 lg:hidden">Brecha </span>{g !== null ? signed(g) : '-'}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="pr-avoid border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
        <p>{multi ? 'Con varios líderes, el resultado del líder es el promedio de sus evaluaciones con el mismo peso para cada uno. ' : ''}Competencia: promedio de sus criterios. Resultado global: promedio de las competencias. La brecha es autoevaluación menos líder. El promedio de la oficina agrupa a los compañeros de la misma oficina evaluados con este formulario en el mismo periodo, sin incluir a la persona, y solo se publica con 3 o más compañeros. Se considera en la media a quien está dentro de 0,10 puntos del promedio.</p>
      </footer>
    </div>
  );
}

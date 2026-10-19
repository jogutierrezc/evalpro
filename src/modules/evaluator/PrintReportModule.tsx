import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useEvaluationReport } from '../../hooks/useEvaluationReport';

// Niveles de desempeño: los mismos rangos que usa la app en Oficinas.
const LEVELS = [
  { min: 4.1, label: 'Excelencia', color: '#166534' },
  { min: 3.1, label: 'Fortalecimiento', color: '#1d4ed8' },
  { min: 2.1, label: 'Desarrollo', color: '#b54708' },
  { min: 0, label: 'Alerta crítica', color: '#b42318' },
];

const levelOf = (score: number) => LEVELS.find((l) => score >= l.min) ?? LEVELS[LEVELS.length - 1];
const round1 = (n: number) => Math.round(n * 10) / 10;
const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);
const todayLabel = () => new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  .sheet { background:#fff; color:#17181c; width:100%; max-width:182mm; margin:0 auto; font-family:'IBM Plex Sans',ui-sans-serif,system-ui,sans-serif; }
  .sheet + .sheet { break-before: page; }
  .sheet h1 { font-size: 20px; font-weight:600; margin:0; }
  .sheet h2 { font-size: 11px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:#5d6068; margin:18px 0 8px; }
  .sheet table { width:100%; border-collapse:collapse; font-size:12px; }
  .sheet th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#5d6068; border-bottom:1px solid #17181c; padding:5px 0; font-weight:600; }
  .sheet td { border-bottom:1px solid #e3e0d8; padding:6px 0; vertical-align:middle; }
  .sheet .n { text-align:right; font-family:'IBM Plex Mono',ui-monospace,monospace; font-variant-numeric:tabular-nums; }
  .track { height:6px; background:#ebe9e3; border-radius:999px; overflow:hidden; }
  .track > i { display:block; height:100%; background:#1d4ed8; }
  .foot { margin-top:auto; display:flex; justify-content:space-between; font-size:10px; color:#5d6068; border-top:1px solid #d9d6cd; padding-top:6px; }
  @media print { .no-print { display:none !important; } body { background:#fff !important; } }
  @media screen { .sheet { padding: 18mm 16mm; box-shadow: 0 1px 3px rgba(0,0,0,.12); margin: 24px auto; min-height: 297mm; display:flex; flex-direction:column; border-radius: 4px; } }
`;

interface GroupRow {
  id: string;
  name: string;
  template: string;
  score: number | null;
  date: string;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f6f8] px-4 pb-16">
      <style>{PRINT_CSS}</style>
      <div className="no-print mx-auto flex max-w-[210mm] items-center justify-between py-4">
        <p className="text-sm text-slate-600">Vista previa del informe en formato A4</p>
        <button onClick={() => window.print()} className="ui-btn-primary">Imprimir o guardar como PDF</button>
      </div>
      {children}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <div className="flex min-h-screen items-center justify-center text-sm text-slate-600">{text}</div>;
}

function IndividualSheet({ evaluationId }: { evaluationId: string }) {
  const { inputData, loading, error } = useEvaluationReport({ evaluationId });

  if (loading) return <Message text="Preparando el informe..." />;
  if (error || !inputData) return <Message text="No se pudo cargar el informe de esta evaluación." />;

  const dims = Object.entries(inputData.puntajes).map(([name, score]) => ({ name, score: Number(score) }));
  const global = round1(mean(dims.map((d) => d.score)));
  const level = levelOf(global);
  const byScore = [...dims].sort((a, b) => b.score - a.score);
  const strengths = byScore.slice(0, 3);
  const toImprove = byScore.slice(-3).reverse();

  return (
    <article className="sheet">
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">Evaluación de personal · Individual</p>
          <h1 className="mt-1">{inputData.evaluado.nombre}</h1>
          <p className="mt-1 text-xs text-slate-600">{inputData.evaluado.rol} · {inputData.evaluado.fecha}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>Evaluador</p>
          <p className="font-medium text-slate-900">{inputData.evaluadorNombre || '—'}</p>
        </div>
      </header>

      <section className="mt-5 flex items-end justify-between gap-6 border-y border-slate-300 py-4">
        <div>
          <p className="text-[10px] uppercase tracking-[.07em] text-slate-500">Puntaje global</p>
          <p className="tabular mt-1 font-mono text-4xl font-medium leading-none">
            {global.toFixed(1)}<span className="text-base font-normal text-slate-500"> / 5</span>
          </p>
        </div>
        <p className="text-base font-semibold" style={{ color: level.color }}>{level.label}</p>
      </section>

      <h2>Dimensiones evaluadas</h2>
      <table>
        <thead><tr><th style={{ width: '40%' }}>Dimensión</th><th>Puntaje</th><th className="n">Valor</th></tr></thead>
        <tbody>
          {byScore.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td style={{ width: '42%' }}><div className="track"><i style={{ width: `${(d.score / 5) * 100}%` }} /></div></td>
              <td className="n">{d.score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-2 gap-6 text-xs">
        <div>
          <h2>Dimensiones con mayor puntaje</h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {strengths.map((d) => <li key={d.name} className="flex justify-between"><span>{d.name}</span><span className="n">{d.score.toFixed(1)}</span></li>)}
          </ul>
        </div>
        <div>
          <h2>Dimensiones a fortalecer</h2>
          <ul className="m-0 list-none space-y-1 p-0">
            {toImprove.map((d) => <li key={d.name} className="flex justify-between"><span>{d.name}</span><span className="n">{d.score.toFixed(1)}</span></li>)}
          </ul>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <div className="grid grid-cols-2 gap-10 text-[11px] text-slate-600">
          <div className="border-t border-slate-900 pt-1">Firma del evaluador</div>
          <div className="border-t border-slate-900 pt-1">Firma del evaluado</div>
        </div>
        <div className="foot mt-6">
          <span>Confidencial · Uso interno</span>
          <span>Generado el {todayLabel()}</span>
        </div>
      </div>
    </article>
  );
}

function GroupSheet({ ids }: { ids: string[] }) {
  const [rows, setRows] = useState<GroupRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('evaluations')
        .select('id, created_at, template:evaluation_templates(name), evaluated:users!evaluated_id(full_name), results:evaluation_results(overall_score)')
        .in('id', ids);
      if (cancelled) return;
      if (error || !data) {
        setFailed(true);
        return;
      }
      const mapped: GroupRow[] = (data as any[]).map((e) => {
        const raw = e.results?.[0]?.overall_score;
        const score = raw == null ? null : Number(raw);
        return {
          id: e.id,
          name: e.evaluated?.full_name || 'Sin nombre',
          template: e.template?.name || 'Evaluación',
          score,
          date: new Date(e.created_at).toLocaleDateString('es-CO'),
        };
      });
      setRows(mapped.sort((a, b) => (b.score ?? -1) - (a.score ?? -1)));
    })();
    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  if (failed) return <Message text="No se pudo cargar el informe grupal." />;
  if (!rows) return <Message text="Preparando el informe..." />;

  const scored = rows.filter((r) => r.score !== null) as (GroupRow & { score: number })[];
  const average = round1(mean(scored.map((r) => r.score)));
  const counts = LEVELS.map((l) => ({ ...l, count: scored.filter((r) => levelOf(r.score) === l).length }));

  return (
    <article className="sheet">
      <header className="border-b-2 border-slate-900 pb-3">
        <p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">Evaluación de personal · Grupal</p>
        <h1 className="mt-1">Informe de {rows.length} evaluación{rows.length !== 1 ? 'es' : ''}</h1>
        <p className="mt-1 text-xs text-slate-600">Promedio del grupo: <span className="font-mono font-medium text-slate-900">{average.toFixed(1)} / 5</span></p>
      </header>

      <h2>Distribución por nivel</h2>
      <div className="flex h-3 overflow-hidden rounded-sm">
        {counts.map((c) => c.count > 0 && (
          <i key={c.label} style={{ width: `${(c.count / Math.max(scored.length, 1)) * 100}%`, background: c.color }} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-600">
        {counts.map((c) => (
          <span key={c.label}><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: c.color }} />{c.label}: {c.count}</span>
        ))}
      </div>

      <h2>Personas evaluadas</h2>
      <table>
        <thead>
          <tr><th>Colaborador</th><th>Formulario</th><th>Fecha</th><th className="n">Puntaje</th><th>Nivel</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.template}</td>
              <td>{r.date}</td>
              <td className="n">{r.score === null ? '—' : r.score.toFixed(1)}</td>
              <td style={{ color: r.score === null ? undefined : levelOf(r.score).color }}>{r.score === null ? 'Sin resultado' : levelOf(r.score).label}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-auto pt-10">
        <div className="foot">
          <span>Confidencial · Uso interno</span>
          <span>Generado el {todayLabel()}</span>
        </div>
      </div>
    </article>
  );
}

export default function PrintReportModule() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const kind = params.get('kind');
  const id = params.get('id');
  const ids = (params.get('ids') || '').split(',').filter(Boolean);

  useEffect(() => {
    document.title = kind === 'group' ? 'Informe grupal' : 'Informe individual';
  }, [kind]);

  if (kind === 'individual' && id) {
    return <Shell><IndividualSheet evaluationId={id} /></Shell>;
  }
  if (kind === 'group' && ids.length > 0) {
    return <Shell><GroupSheet ids={ids} /></Shell>;
  }
  return <Message text="Falta el identificador del informe." />;
}

import { useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { fechaCorta } from './types';
import { Resultados, fetchResultados, fmt } from './resultados';

interface Props {
  resultados: Resultados | null;
  evaluationId: string;
  /** Acta firmada o solo lectura: se puede ver, no cambiar. */
  disabled: boolean;
  onChange: (r: Resultados | null) => void;
}

function Dato({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">{fmt(value)}</dd>
    </div>
  );
}

/**
 * Resultados por criterio dentro de "IV. Desarrollo". Se guardan como foto en el acta: así lo que se firma
 * no cambia si las evaluaciones cambian después. Mientras el acta es borrador se pueden actualizar o quitar.
 */
export function ResultadosPanel({ resultados, evaluationId, disabled, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = !!resultados;

  async function cargar() {
    setBusy(true); setError(null);
    try { onChange(await fetchResultados(evaluationId)); }
    catch (e: any) { setError(e?.message || 'No se pudieron calcular los resultados.'); }
    finally { setBusy(false); }
  }

  const toggle = () => { if (busy || disabled) return; if (on) { setError(null); onChange(null); } else cargar(); };

  return (
    <div id="fb-resultados" tabIndex={-1} className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 outline-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p id="fb-res-label" className="text-[13px] font-medium text-slate-700">Resultados de la evaluación</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Tabla por criterio y mapa de competencias, comparados con el equipo y con el promedio UDES.</p>
        </div>
        <button
          type="button" role="switch" aria-checked={on} aria-labelledby="fb-res-label" disabled={disabled || busy} onClick={toggle}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${on ? 'bg-blue-700' : 'bg-slate-300'}`}
        >
          <span aria-hidden className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out ${on ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      {busy && !on && <p className="flex items-center gap-2 text-xs text-slate-500" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando resultados</p>}

      {resultados && (
        <>
          <dl className="grid grid-cols-3 gap-3 border-t border-slate-200 pt-3">
            <Dato label="Colaborador" value={resultados.overall.persona} />
            <Dato label="Equipo" value={resultados.overall.equipo} />
            <Dato label="Promedio UDES" value={resultados.overall.udes} />
          </dl>
          <p className="text-xs leading-relaxed text-slate-500">
            {resultados.sections.length} competencias y {resultados.sections.reduce((n, s) => n + s.criterios.length, 0)} criterios. Datos al {fechaCorta(resultados.generated_at)}.{' '}
            {resultados.team_n > 0 ? `Equipo: ${resultados.team_n} ${resultados.team_n === 1 ? 'evaluación' : 'evaluaciones'}.` : 'Sin otras personas del equipo con este formulario, no se grafica el equipo.'}
          </p>
          {!disabled && (
            <button type="button" onClick={cargar} disabled={busy} className="ui-btn-secondary w-fit !py-1.5 text-[13px]">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {busy ? 'Actualizando' : 'Actualizar datos'}
            </button>
          )}
        </>
      )}

      {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
    </div>
  );
}

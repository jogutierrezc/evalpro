import type { Person } from './types';
import { LegendSwatch, RadarChart, SERIES, type SerieKey } from './RadarChart';
import { FilaRes, PaginaRes, Resultados, diff, fmt, fmtDiff, lecturaTexto, notaMetodo, toneOf } from './resultados';

const Diff = ({ a, b }: { a: number | null; b: number | null }) => {
  const d = diff(a, b);
  return <div className={`d ${toneOf(d)}`}>{fmtDiff(d)}</div>;
};

function Fila({ f }: { f: FilaRes }) {
  if (f.kind === 'sec') {
    const s = f.sec;
    return (
      <div className="rw sec">
        <div className="t"><span className="no">{f.n}</span>{s.title}</div>
        <div className="n p">{fmt(s.persona)}</div><div className="n">{fmt(s.equipo)}</div><div className="n">{fmt(s.udes)}</div>
        <Diff a={s.persona} b={s.equipo} /><Diff a={s.persona} b={s.udes} />
      </div>
    );
  }
  if (f.kind === 'crit') {
    const c = f.c;
    return (
      <div className="rw">
        <div className="t"><span className="no">{f.n}</span>{c.texto}</div>
        <div className="n p">{fmt(c.persona)}</div><div className="n">{fmt(c.equipo)}</div><div className="n">{fmt(c.udes)}</div>
        <Diff a={c.persona} b={c.equipo} /><Diff a={c.persona} b={c.udes} />
      </div>
    );
  }
  return null;
}

function Total({ res }: { res: Resultados }) {
  const o = res.overall;
  return (
    <div className="rw tot">
      <div className="t">Resultado global</div>
      <div className="n p">{fmt(o.persona)}</div><div className="n">{fmt(o.equipo)}</div><div className="n">{fmt(o.udes)}</div>
      <Diff a={o.persona} b={o.equipo} /><Diff a={o.persona} b={o.udes} />
    </div>
  );
}

function Mapa({ res }: { res: Resultados }) {
  const tieneEquipo = res.sections.some((s) => s.equipo != null);
  const series: SerieKey[] = ['persona', ...(tieneEquipo ? (['equipo'] as SerieKey[]) : []), 'udes'];
  const valores = res.sections.flatMap((s) => [s.persona, s.equipo, s.udes]).filter((v): v is number => v != null);
  const min = Math.max(1, Math.floor(Math.min(...valores, res.scale)) - 1);
  const resumen = `Mapa de competencias: ${res.sections.map((s, i) => `${i + 1}, ${s.title}`).join('; ')}.`;
  return (
    <div className="rs-viz">
      {res.sections.length >= 3 ? (
        <div className="rs-radar"><RadarChart axes={res.sections} max={res.scale} min={min} ariaLabel={resumen} /></div>
      ) : (
        <p className="rs-nochart">El formulario tiene menos de tres competencias, por eso no se grafica el mapa.</p>
      )}
      <div className="rs-key">
        <h5>Mapa de competencias</h5>
        <ol>
          {res.sections.map((s, i) => (
            <li key={s.id ?? i}><span className="no">{i + 1}</span><span className="nm">{s.title}</span></li>
          ))}
        </ol>
        <ul className="rs-leg" aria-label="Leyenda">
          {series.map((k) => (
            <li key={k}><LegendSwatch k={k} />{SERIES[k].label}</li>
          ))}
        </ul>
        <p className="rs-hint">Escala del gráfico: de {min} a {res.scale}.</p>
        {!tieneEquipo && <p className="rs-hint">No hay otras personas del equipo con este formulario en el periodo.</p>}
      </div>
    </div>
  );
}

interface Props {
  res: Resultados;
  page: PaginaRes;
  evaluated: Person;
  evaluator: Person;
}

/** Contenido de una página de resultados dentro de "IV. Desarrollo" (el encabezado institucional lo pone el acta). */
export function ResultadosPagina({ res, page, evaluated, evaluator }: Props) {
  return (
    <div className="rs" data-f="resultados">
      <h3 className="rs-title">IV. DESARROLLO (continuación)<span>Resultados de la evaluación de desempeño{page.first ? '' : ' (continuación)'}</span></h3>

      {page.first && (
        <>
          <dl className="rs-sub">
            <div><dt>Persona evaluada</dt><dd>{evaluated.nombre}</dd></div>
            <div><dt>Líder evaluador</dt><dd>{evaluator.nombre}</dd></div>
            <div><dt>Formulario</dt><dd>{res.template}</dd></div>
          </dl>
          <p className="rs-lead">{lecturaTexto(res, evaluated.nombre)}</p>
          <Mapa res={res} />
        </>
      )}

      <div className="rt" role="table" aria-label="Resultados por criterio">
        <div className="band">RESULTADOS POR CRITERIO</div>
        <div className="hd" role="row">
          <div>Criterio</div><div>Colaborador</div><div>Equipo</div><div>UDES</div><div>Dif. equipo</div><div>Dif. UDES</div>
        </div>
        {page.filas.map((f, i) => (f.kind === 'total' ? <Total key={`t${i}`} res={res} /> : <Fila key={`${f.kind}${i}`} f={f} />))}
      </div>

      {page.last && <p className="rs-note">{notaMetodo(res)}</p>}
    </div>
  );
}

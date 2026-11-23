import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Printer } from 'lucide-react';
import {
  SERIES, cargoLabel, diff, fechaDeCompletada, fechaLarga, fmt, fmtDiff, lecturaSeccion, narrativa, nivelDe, notaMetodo,
  seriesPresentes, tonoDe, type Informe, type Persona, type Seccion, type SerieId,
} from './informe';
import { Muestra, ReportRadar } from './ReportRadar';
import './informe.css';

gsap.registerPlugin(ScrollTrigger);

const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}brand/aluna-color.png`;

/* ---------- Papel: «auto» deja que la impresora o el navegador elija; el resto fija la hoja ---------- */

export type Papel = 'auto' | 'letter' | 'a4' | 'legal' | 'a5' | 'a3';
const PAPELES: { id: Papel; label: string; css: string; margen: string }[] = [
  { id: 'auto', label: 'Automático', css: 'auto', margen: '16mm 15mm 19mm' },
  { id: 'letter', label: 'Carta', css: 'letter', margen: '16mm 15mm 19mm' },
  { id: 'a4', label: 'A4', css: 'A4', margen: '16mm 15mm 19mm' },
  { id: 'legal', label: 'Oficio', css: 'legal', margen: '16mm 15mm 19mm' },
  { id: 'a5', label: 'A5', css: 'A5', margen: '11mm 10mm 15mm' },
  { id: 'a3', label: 'A3', css: 'A3', margen: '22mm 20mm 25mm' },
];
const papelInicial = (): Papel => {
  try {
    const p = new URLSearchParams(window.location.search).get('paper');
    return PAPELES.some((x) => x.id === p) ? (p as Papel) : 'auto';
  } catch { return 'auto'; }
};
const cssStr = (s: string) => s.replace(/[\\"\n\r]/g, ' ');

/* ---------- Piezas ---------- */

function Marca() {
  return (
    <div className="inf-brand" data-rise>
      <img src={LOGO} alt="Aluna UDES" draggable={false} />
      <span>Eval</span>
    </div>
  );
}

function Datos({ titulo, p }: { titulo: string; p: Persona }) {
  const filas: [string, string | null][] = [
    ['Nombre completo', p.nombre],
    ['Documento', p.documento],
    ['Cargo', p.cargo ? cargoLabel(p.cargo) : null],
    ['Oficina', p.oficina],
    ['Sede', p.sede],
  ];
  return (
    <div className="inf-persona" data-rise>
      <h2>{titulo}</h2>
      <dl>
        {filas.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v || <span className="inf-none">Sin registrar</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const Brecha = ({ a, b }: { a: number | null; b: number | null }) => {
  const d = diff(a, b);
  return <span className={`inf-gap ${tonoDe(d)}`}>{fmtDiff(d)}</span>;
};

/** Fila de la comparación global: un punto por grupo sobre la escala 1–5 (la posición no exige partir de cero). */
function Escala({ valor, k, max }: { valor: number | null; k: SerieId; max: number }) {
  if (valor == null) return <div className="inf-axis" />;
  const pct = ((Math.min(max, Math.max(1, valor)) - 1) / (max - 1)) * 100;
  return (
    <div className="inf-axis" aria-hidden="true">
      <i className="inf-axis-fill" data-grow style={{ width: `${pct}%`, background: SERIES[k].color }} />
    </div>
  );
}

function Comparacion({ r, series }: { r: Informe; series: SerieId[] }) {
  const filas = (['persona', 'equipo', 'sede', 'udes'] as SerieId[]).filter((k) => series.includes(k) && r.overall[k] != null);
  const ref = r.overall.persona;
  const n = (k: SerieId) => (k === 'equipo' ? r.n.equipo : k === 'sede' ? r.n.sede : k === 'udes' ? r.n.udes : 0);
  return (
    <section className="inf-sec inf-keep" data-rise-scroll>
      <h2>Frente a los demás</h2>
      <p className="inf-lead">Resultado global en la escala de 1 a {r.scale}; cada barra parte de 1, el valor mínimo. A la derecha, la diferencia del resultado de la persona frente a cada grupo.</p>
      <ol className="inf-compare">
        {filas.map((k) => (
          <li key={k} className={k === 'persona' ? 'is-me' : ''}>
            <span className="inf-c-name"><Muestra k={k} />{k === 'persona' ? 'Resultado de la persona' : SERIES[k].label}{k !== 'persona' && n(k) ? <small>{n(k)} {n(k) === 1 ? 'evaluación' : 'evaluaciones'}</small> : null}</span>
            <Escala valor={r.overall[k]} k={k} max={r.scale} />
            <span className="inf-c-val">{fmt(r.overall[k])}</span>
            <span className="inf-c-gap">{k === 'persona' ? '' : <Brecha a={ref} b={r.overall[k]} />}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Mapa({ r, series }: { r: Informe; series: SerieId[] }) {
  const todos = r.sections.flatMap((s) => (['persona', 'equipo', 'sede', 'udes'] as SerieId[]).map((k) => s[k])).filter((v): v is number => v != null);
  const min = Math.max(1, Math.floor(Math.min(...todos, r.scale)) - 1);
  const ref: SerieId | null = (['udes', 'sede', 'equipo'] as SerieId[]).find((k) => series.includes(k)) ?? null;
  const resumen = `Mapa de competencias: ${r.sections.map((s, i) => `${i + 1}, ${s.title}`).join('; ')}.`;
  const muestras = [...series].reverse();
  return (
    <section className="inf-sec" data-rise-scroll>
      <h2>Mapa de competencias</h2>
      <div className="inf-map">
        {r.sections.length >= 3 ? (
          <div className="inf-radar"><ReportRadar axes={r.sections} series={series} max={r.scale} min={min} ariaLabel={resumen} /></div>
        ) : (
          <p className="inf-hint">El formulario tiene menos de tres competencias, por eso no se dibuja la gráfica de araña. El detalle está en las tablas.</p>
        )}
        <div className="inf-key">
          <ol>
            {r.sections.map((s, i) => (
              <li key={s.id ?? i}>
                <span className="inf-no">{i + 1}</span>
                <span className="inf-key-nm">{s.title}</span>
                <span className="inf-key-v">{fmt(s.persona)}</span>
                {ref ? <Brecha a={s.persona} b={s[ref]} /> : <span />}
              </li>
            ))}
          </ol>
          {ref && <p className="inf-hint">Brecha frente a {SERIES[ref].label.toLowerCase()}.</p>}
          <ul className="inf-legend" aria-label="Leyenda">
            {muestras.map((k) => (<li key={k}><Muestra k={k} />{SERIES[k].label}</li>))}
          </ul>
          <p className="inf-hint">Los anillos de la gráfica van de {min} a {r.scale}.</p>
        </div>
      </div>
    </section>
  );
}

/** Tabla de una competencia: al partirse entre hojas repite su encabezado, así la lectura continúa. */
function TablaSeccion({ s, n, r, series }: { s: Seccion; n: number; r: Informe; series: SerieId[] }) {
  const comp = (['equipo', 'sede', 'udes'] as SerieId[]).filter((k) => series.includes(k));
  const ref: SerieId | null = (['udes', 'sede', 'equipo'] as SerieId[]).find((k) => series.includes(k)) ?? null;
  const pos = (v: number) => ((Math.min(r.scale, Math.max(1, v)) - 1) / (r.scale - 1)) * 100;
  return (
    <section className={`inf-block ${s.criterios.length > 8 ? 'is-long' : ''}`}>
      <header className="inf-block-head">
        <span className="inf-no">{n}</span>
        <h3>{s.title}</h3>
        <span className="inf-block-avg">{fmt(s.persona)}<small> / {fmt(r.scale)}</small></span>
      </header>
      <p className="inf-reading">{lecturaSeccion(s)}</p>
      <table className="inf-table">
        <thead>
          <tr>
            <th scope="col" className="c-txt">Condición evaluada</th>
            <th scope="col" className="c-bar">Escala 1 a {r.scale}</th>
            <th scope="col" className="c-n me">Persona</th>
            {comp.map((k) => (<th key={k} scope="col" className="c-n">{SERIES[k].short}</th>))}
            {ref && <th scope="col" className="c-n c-gap">Brecha</th>}
          </tr>
        </thead>
        <tbody>
          {s.criterios.map((c, i) => (
            <tr key={c.id}>
              <td className="c-txt"><span className="inf-sub">{n}.{i + 1}</span>{c.texto}</td>
              <td className="c-bar">
                <div className="inf-track" aria-hidden="true">
                  {c.persona != null && <i className="inf-fill" data-grow style={{ width: `${pos(c.persona)}%` }} />}
                  {comp.map((k) => c[k] != null && <i key={k} className={`mk mk-${k}`} style={{ left: `${pos(c[k] as number)}%` }} />)}
                </div>
              </td>
              <td className="c-n me">{fmt(c.persona)}</td>
              {comp.map((k) => (<td key={k} className="c-n">{fmt(c[k])}</td>))}
              {ref && <td className="c-n c-gap"><Brecha a={c.persona} b={c[ref]} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Cierre({ r, series }: { r: Informe; series: SerieId[] }) {
  const ref: SerieId | null = (['udes', 'sede', 'equipo'] as SerieId[]).find((k) => series.includes(k)) ?? null;
  const todos = r.sections.flatMap((s) => s.criterios.filter((c) => c.persona != null).map((c) => ({ ...c, seccion: s.title })));
  const k = Math.min(3, Math.floor(todos.length / 2));
  if (k < 1) return null;
  const orden = [...todos].sort((a, b) => (b.persona as number) - (a.persona as number));
  const altos = orden.slice(0, k);
  const bajos = orden.slice(-k).reverse().filter((c) => !altos.includes(c));
  const Lista = ({ items, titulo }: { items: typeof todos; titulo: string }) => (
    <div>
      <h3>{titulo}</h3>
      <ul>
        {items.map((c) => (
          <li key={c.id}>
            <span className="inf-cl-t">{c.texto}<small>{c.seccion}</small></span>
            <span className="inf-cl-v">{fmt(c.persona)}</span>
            {ref ? <Brecha a={c.persona} b={c[ref]} /> : <span />}
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <section className="inf-sec inf-close" data-rise-scroll>
      <h2>Lo que más y lo que menos destacó</h2>
      <p className="inf-lead">Las condiciones con el puntaje más alto y las de menor puntaje. Son un punto de partida para conversar, no un veredicto.</p>
      <div className="inf-close-grid">
        <Lista items={altos} titulo="Resultados más altos" />
        {bajos.length > 0 && <Lista items={bajos} titulo="Mayor espacio para crecer" />}
      </div>
    </section>
  );
}

/* ---------- Informe completo ---------- */

export function InformeEvaluacion({ informe: r }: { informe: Informe }) {
  const [papel, setPapel] = useState<Papel>(papelInicial);
  const rootRef = useRef<HTMLDivElement>(null);
  const series = useMemo(() => seriesPresentes(r), [r]);
  const nar = useMemo(() => narrativa(r), [r]);
  const nivel = nivelDe(r.overall.persona);
  const auto = r.kind === 'autoevaluacion';
  const titulo = auto ? 'Informe de autoevaluación' : 'Informe de evaluación de desempeño';
  const spec = PAPELES.find((p) => p.id === papel) ?? PAPELES[0];
  const nombre = r.evaluado.nombre || 'Persona evaluada';

  // Título de la pestaña = nombre sugerido del PDF al guardarlo.
  useLayoutEffect(() => {
    const previo = document.title;
    document.title = `${titulo} - ${nombre}`;
    return () => { document.title = previo; };
  }, [titulo, nombre]);

  // Una sola entrada al abrir; las barras crecen cuando entran en pantalla. Con «reducir movimiento» no se anima nada.
  // En impresión el CSS fuerza el estado final, así que no se imprime nada a medias.
  useLayoutEffect(() => {
    const mm = gsap.matchMedia();
    mm.add(
      'screen and (prefers-reduced-motion: no-preference)',
      () => {
        const q = gsap.utils.selector(rootRef);
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.from(q('[data-rise]'), { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.07, clearProps: 'transform,opacity,visibility' }, 0.05);
        tl.from(q('[data-radar-serie]'), { autoAlpha: 0, scale: 0.55, svgOrigin: '160 160', duration: 0.9, stagger: 0.09, clearProps: 'transform,opacity,visibility' }, 0.35);
        gsap.set(q('[data-grow]'), { scaleX: 0, transformOrigin: '0 50%' });
        ScrollTrigger.batch(q('[data-grow]'), {
          start: 'top 94%',
          once: true,
          onEnter: (els) => gsap.to(els, { scaleX: 1, duration: 0.8, ease: 'expo.out', stagger: 0.04, clearProps: 'transform' }),
        });
        q('[data-rise-scroll]').forEach((el: Element) => {
          gsap.from(el, { autoAlpha: 0, y: 16, duration: 0.7, ease: 'expo.out', clearProps: 'transform,opacity,visibility',
            scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
        });
      },
      rootRef.current ?? undefined,
    );
    return () => mm.revert();
  }, [r]);

  const nombreCorto = cssStr(`${nombre} · ${titulo}`);
  const css = `
    @page { size: ${spec.css}; margin: ${spec.margen}; }
    @page { @bottom-left { content: "${nombreCorto}"; } @bottom-right { content: "Página " counter(page) " de " counter(pages); } }
  `;

  return (
    <div className="inf-root" ref={rootRef}>
      <style>{css}</style>

      <div className="inf-toolbar" role="toolbar" aria-label="Opciones de impresión">
        <p>{titulo}</p>
        <label>
          <span>Papel</span>
          <select value={papel} onChange={(e) => setPapel(e.target.value as Papel)}>
            {PAPELES.map((p) => (<option key={p.id} value={p.id}>{p.label}</option>))}
          </select>
        </label>
        <button type="button" onClick={() => window.print()}><Printer aria-hidden="true" /> Imprimir o guardar PDF</button>
      </div>

      <div className="inf-sheet">
        <div className="inf">
          <header className="inf-head">
            <div className="inf-head-t" data-rise>
              <h1>{titulo}</h1>
              <p>
                {r.template ? <>{r.template}</> : null}
                {r.period ? <> · Periodo {r.period.year}</> : null}
                {fechaDeCompletada(r) ? <> · Completada el {fechaDeCompletada(r)}</> : null}
              </p>
            </div>
            <Marca />
          </header>

          <section className={`inf-parties ${auto ? 'is-solo' : ''}`} aria-label="Datos de las personas">
            <Datos titulo={auto ? 'Persona autoevaluada' : 'Persona evaluada'} p={r.evaluado} />
            {!auto && <Datos titulo="Quién evalúa" p={r.evaluador} />}
          </section>

          <section className="inf-lede" data-rise aria-label="Resumen">
            <p className="inf-headline">
              {r.overall.persona != null ? (
                <>
                  <span className="inf-who">{nombre}</span> {auto ? 'se autoevaluó con' : 'obtuvo'}{' '}
                  <span className="inf-score">{fmt(r.overall.persona)}</span> de {fmt(r.scale)}
                  {nivel ? `, un resultado ${nivel.label.toLowerCase()}` : ''}.
                </>
              ) : nar.titular}
            </p>
            {nar.frases.length > 0 && <p className="inf-prose">{nar.frases.join(' ')}</p>}
            {nar.fuerte && nar.debil && (
              <p className="inf-prose">
                La condición con el puntaje más alto es «{nar.fuerte.texto}» ({fmt(nar.fuerte.valor)}) y la de menor puntaje, «{nar.debil.texto}» ({fmt(nar.debil.valor)}).
              </p>
            )}
            {nivel && <p className="inf-level"><span className={`inf-badge ${nivel.id}`}>{nivel.label}</span> Nivel según el puntaje global: 4,60 o más es referente, de 4,00 a 4,59 sobresaliente, de 3,00 a 3,99 satisfactorio y menos de 3,00 por fortalecer.</p>}
          </section>

          {series.length > 1 && <Comparacion r={r} series={series} />}
          {r.sections.length > 0 && <Mapa r={r} series={series} />}

          <section className="inf-sec inf-detail">
            <h2>Cómo se evaluó cada condición</h2>
            <p className="inf-lead">La barra azul es el puntaje de la persona. Los marcadores señalan los promedios con los que se compara.</p>
            <ul className="inf-legend" aria-label="Leyenda de marcadores">
              {series.filter((k) => k !== 'persona').reverse().map((k) => (<li key={k}><i className={`mk mk-${k} static`} />{SERIES[k].label}</li>))}
            </ul>
            {r.sections.map((s, i) => (<TablaSeccion key={s.id ?? i} s={s} n={i + 1} r={r} series={series} />))}
          </section>

          <Cierre r={r} series={series} />

          <footer className="inf-foot">
            <p>{notaMetodo(r)}</p>
            <p>Documento confidencial, generado el {fechaLarga(new Date().toLocaleDateString('en-CA'))} por Aluna Eval, un proyecto desarrollado por la Universidad de Santander.</p>
          </footer>
        </div>
      </div>
    </div>
  );
}

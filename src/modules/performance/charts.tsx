import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

// Tres series, distinguibles también sin color: líder = relleno sólido, autoevaluación = anillo y línea punteada,
// oficina = gris y línea fina. El azul es el de la app; el naranja se aleja del azul para daltónicos.
export const COLORS = { leader: '#1d4ed8', self: '#c2410c', office: '#64748b' } as const;
export const MAX = 5;
export const MIN = 1;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Axis {
  id: string;
  label: string;
  leader: number | null;
  self: number | null;
  office: number | null;
}

export type SeriesKey = 'leader' | 'self' | 'office';

/** Parte un nombre largo en hasta 3 líneas de ~15 caracteres para las etiquetas del radar. */
function wrap(label: string, max = 16): string[] {
  const words = label.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  words.forEach((w) => {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  });
  if (cur) lines.push(cur);
  if (lines.length > 3) { const rest = lines.slice(2).join(' '); return [lines[0], lines[1], rest.length > max ? rest.slice(0, max - 1) + '…' : rest]; }
  return lines;
}

export interface LeaderSeries {
  id: string;
  label: string;
  color: string;
  values: (number | null)[]; // una nota por eje, en el orden de los ejes
}

interface RadarProps {
  axes: Axis[];
  visible: Record<SeriesKey, boolean>;
  /** Un polígono fino por cada líder, además del promedio combinado. */
  leaderSeries?: LeaderSeries[];
}

/** Mapa de competencias: una polilínea por serie sobre anillos 1 a 5. */
export function RadarCompare({ axes, visible, leaderSeries = [] }: RadarProps) {
  const root = useRef<SVGSVGElement>(null);
  const size = 520;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 150;
  const n = axes.length;
  const slice = (Math.PI * 2) / Math.max(n, 1);

  const pt = (value: number, i: number) => {
    const r = ((Math.max(value, MIN) - MIN) / (MAX - MIN)) * radius;
    const a = i * slice - Math.PI / 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  };
  const ring = (level: number) => axes.map((_, i) => { const p = pt(level, i); return `${p.x},${p.y}`; }).join(' ');
  const poly = (key: SeriesKey) => axes.map((a, i) => { const p = pt(a[key] ?? MIN, i); return `${p.x},${p.y}`; }).join(' ');
  const complete = (key: SeriesKey) => n > 0 && axes.every((a) => a[key] !== null);
  const sig = axes.map((a) => `${a.leader}|${a.self}|${a.office}`).join(';') + '#' + leaderSeries.map((l) => `${l.id}:${l.values.join(',')}`).join(';');
  const leaderPoly = (vals: (number | null)[]) => axes.map((_, i) => { const p = pt(vals[i] ?? MIN, i); return `${p.x},${p.y}`; }).join(' ');

  useLayoutEffect(() => {
    if (!root.current || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('[data-series]', { opacity: 0, scale: 0.78, svgOrigin: `${cx} ${cy}` }, { opacity: 1, scale: 1, svgOrigin: `${cx} ${cy}`, duration: 0.5, ease: 'power3.out', stagger: 0.08, clearProps: 'opacity,transform' });
      gsap.fromTo('[data-dot]', { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power3.out', stagger: 0.015, delay: 0.25, clearProps: 'opacity,transform' });
    }, root);
    const safety = window.setTimeout(() => ctx.revert(), 1600);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, [sig, cx, cy]);

  if (n < 3) {
    return <p className="py-12 text-center text-sm text-slate-500">El mapa necesita al menos 3 competencias evaluadas. Revisa la tabla.</p>;
  }

  return (
    <svg ref={root} viewBox={`0 0 ${size} ${size}`} className="mx-auto h-auto w-full max-w-[520px] overflow-visible" role="img" aria-label="Mapa de competencias: líder, autoevaluación y promedio de oficina">
      {/* anillos */}
      {[1, 2, 3, 4, 5].map((level) => (
        <g key={level}>
          <polygon points={ring(level)} fill={level === 5 ? '#f8fafc' : 'none'} stroke="#e2e8f0" strokeWidth={level === 5 ? 1.25 : 1} />
          {level > 1 && <text x={cx + 4} y={cy - ((level - MIN) / (MAX - MIN)) * radius - 3} className="fill-slate-400" fontSize="11" style={{ fontVariantNumeric: 'tabular-nums' }}>{level}</text>}
        </g>
      ))}
      {axes.map((_, i) => { const p = pt(MAX, i); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e2e8f0" strokeWidth="1" />; })}

      {/* oficina, líder y autoevaluación: la oficina va al fondo */}
      {visible.office && complete('office') && (
        <g data-series>
          <polygon points={poly('office')} fill={COLORS.office} fillOpacity="0.1" stroke={COLORS.office} strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      )}
      {visible.self && complete('self') && (
        <g data-series>
          <polygon points={poly('self')} fill={COLORS.self} fillOpacity="0.07" stroke={COLORS.self} strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />
        </g>
      )}
      {leaderSeries.filter((l) => l.values.length === n && l.values.every((v) => v !== null)).map((l) => (
        <g key={l.id} data-series>
          <polygon points={leaderPoly(l.values)} fill="none" stroke={l.color} strokeWidth="1.75" strokeLinejoin="round" />
          {l.values.map((v, i) => { const p = pt(v as number, i); return <circle key={i} cx={p.x} cy={p.y} r="3" fill={l.color} stroke="#fff" strokeWidth="1"><title>{l.label}, {axes[i].label}: {(v as number).toFixed(2)}</title></circle>; })}
        </g>
      ))}
      {visible.leader && complete('leader') && (
        <g data-series>
          <polygon points={poly('leader')} fill={COLORS.leader} fillOpacity="0.14" stroke={COLORS.leader} strokeWidth="2.5" strokeLinejoin="round" />
        </g>
      )}

      {/* puntos con su valor al pasar el cursor */}
      {axes.map((a, i) => (
        <g key={a.id}>
          {visible.self && a.self !== null && (() => { const p = pt(a.self, i); return <circle data-dot cx={p.x} cy={p.y} r="4.5" fill="#fff" stroke={COLORS.self} strokeWidth="2"><title>{a.label}, autoevaluación: {a.self.toFixed(2)}</title></circle>; })()}
          {visible.leader && a.leader !== null && (() => { const p = pt(a.leader, i); return <circle data-dot cx={p.x} cy={p.y} r="4.5" fill={COLORS.leader} stroke="#fff" strokeWidth="1.5"><title>{a.label}, líder: {a.leader.toFixed(2)}</title></circle>; })()}
        </g>
      ))}

      {/* etiquetas */}
      {axes.map((a, i) => {
        const ang = i * slice - Math.PI / 2;
        const lr = radius + 30;
        const x = cx + lr * Math.cos(ang);
        const y = cy + lr * Math.sin(ang);
        const anchor = Math.cos(ang) > 0.25 ? 'start' : Math.cos(ang) < -0.25 ? 'end' : 'middle';
        const lines = wrap(a.label);
        const startY = y - ((lines.length - 1) * 13) / 2 + (Math.sin(ang) > 0.5 ? 6 : Math.sin(ang) < -0.5 ? -6 : 0);
        return (
          <text key={a.id} x={x} y={startY} textAnchor={anchor} fontSize="13" fontWeight="600" className="fill-slate-700">
            {lines.map((l, li) => <tspan key={li} x={x} dy={li === 0 ? 0 : 13}>{l}</tspan>)}
          </text>
        );
      })}
    </svg>
  );
}

interface TrackProps {
  leader: number | null;
  self: number | null;
  office: number | null;
  show: Record<SeriesKey, boolean>;
}

const pos = (v: number) => `${((Math.min(Math.max(v, MIN), MAX) - MIN) / (MAX - MIN)) * 100}%`;

/**
 * Barra de comparación 1 a 5: punto sólido = líder, anillo = autoevaluación, marca vertical = promedio de la oficina,
 * y un conector entre líder y autoevaluación que hace visible la brecha.
 */
export function Track({ leader, self, office, show }: TrackProps) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!root.current || reduced()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo('[data-conn]', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out', transformOrigin: '0% 50%', clearProps: 'transform' });
      gsap.fromTo('[data-mark]', { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.28, ease: 'power3.out', delay: 0.12, clearProps: 'opacity,transform' });
    }, root);
    const safety = window.setTimeout(() => ctx.revert(), 1200);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, [leader, self, office]);

  const hasPair = show.leader && show.self && leader !== null && self !== null;
  const lo = hasPair ? Math.min(leader as number, self as number) : 0;
  const hi = hasPair ? Math.max(leader as number, self as number) : 0;

  return (
    <div ref={root} className="relative h-6 w-full" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-200" />
      {[2, 3, 4].map((t) => <span key={t} className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-slate-300" style={{ left: pos(t) }} />)}
      {hasPair && (
        <span data-conn className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})`, background: 'repeating-linear-gradient(90deg,#94a3b8 0 4px,transparent 4px 7px)' }} />
      )}
      {show.office && office !== null && (
        <span data-mark className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-sm" style={{ left: pos(office), background: COLORS.office }} title={`Promedio oficina: ${office.toFixed(2)}`} />
      )}
      {show.self && self !== null && (
        <span data-mark className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white" style={{ left: pos(self), borderColor: COLORS.self }} title={`Autoevaluación: ${self.toFixed(2)}`} />
      )}
      {show.leader && leader !== null && (
        <span data-mark className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: pos(leader), background: COLORS.leader }} title={`Líder: ${leader.toFixed(2)}`} />
      )}
    </div>
  );
}

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ChevronDown } from 'lucide-react';
import { Bucket, PlanItem, bucketOf, isVencido, resumir } from './types';
import { EstadoPill, FueraPeriodoBadge, PlazoText, ProgressBar, ProgressOf, SeguimientoDetail } from './PlanParts';

type Filter = 'all' | Bucket | 'vencido';

const TABS: [Filter, string][] = [
  ['all', 'Todos'],
  ['sin', 'Sin registro'],
  ['en_proceso', 'En proceso'],
  ['cumplido', 'Cumplidos'],
  ['incumplido', 'Incumplidos'],
  ['vencido', 'Vencidos'],
];

const initials = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Misma cuadrícula en la cabecera y en cada fila para que las columnas queden alineadas. */
const ROW_GRID = 'lg:grid lg:grid-cols-[minmax(0,1fr)_168px_176px_128px_20px] lg:items-center lg:gap-x-5';

interface BoardProps {
  items: PlanItem[];
  loading: boolean;
  /** Administración solo mira: no registra avances. */
  readOnly: boolean;
  userId: string;
  onChanged: () => void;
  /** Cambia cuando cambia el conjunto base (periodo, oficina...) para repetir la entrada. */
  animateKey: string;
  emptyText: string;
}

export function PlanBoard({ items, loading, readOnly, userId, onChanged, animateKey, emptyText }: BoardProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const scope = useRef<HTMLDivElement>(null);

  const resumen = useMemo(() => resumir(items), [items]);
  const countOf = (f: Filter) => (f === 'all' ? resumen.total : f === 'vencido' ? resumen.vencidos : resumen[f]);

  const visible = useMemo(
    () => items.filter((i) => (filter === 'all' ? true : filter === 'vencido' ? isVencido(i) : bucketOf(i) === filter)),
    [items, filter],
  );

  const groups = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    visible.forEach((i) => { const k = `${i.evaluado.id}`; m.set(k, [...(m.get(k) || []), i]); });
    return Array.from(m.values());
  }, [visible]);

  // Un solo momento de movimiento: entrada escalonada de los grupos y las barras de avance que crecen.
  // Solo transform y opacidad; sin movimiento si la persona lo pide.
  useLayoutEffect(() => {
    if (!scope.current || loading || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bars = Array.from(scope.current.querySelectorAll<HTMLElement>('[data-bar]'));
    bars.forEach((b) => { b.style.transition = 'none'; });
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 6, opacity: 0, duration: 0.24, ease: 'power3.out', stagger: { amount: 0.3 }, clearProps: 'transform,opacity' });
      gsap.from(bars, { scaleX: 0, duration: 0.5, delay: 0.12, ease: 'power3.out', stagger: { amount: 0.3 }, onComplete: () => bars.forEach((b) => { b.style.transition = ''; }) });
    }, scope);
    const safety = window.setTimeout(() => { bars.forEach((b) => { b.style.transition = ''; }); }, 1500);
    return () => { window.clearTimeout(safety); bars.forEach((b) => { b.style.transition = ''; }); ctx.revert(); };
    // Solo al cargar o cambiar el conjunto base, no al filtrar ni al abrir una fila.
  }, [loading, animateKey]);

  return (
    <div ref={scope} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Filtrar compromisos por estado">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => { setFilter(k); setOpenKey(null); }} aria-pressed={filter === k}
              className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm transition-colors ${filter === k ? (k === 'vencido' ? 'bg-red-50 font-semibold text-red-800' : 'bg-blue-50 font-semibold text-blue-800') : 'text-slate-500 hover:text-slate-900'}`}>
              {label} <span className="text-xs tabular-nums opacity-80">{countOf(k)}</span>
            </button>
          ))}
        </div>
        {resumen.total > 0 && (
          <div className="flex w-full max-w-[260px] items-center gap-3 sm:w-auto">
            <span className="shrink-0 text-sm text-slate-500">Avance del plan</span>
            <div className="w-32 flex-1 sm:w-32 sm:flex-none"><ProgressBar pct={resumen.avance} bucket="en_proceso" label="Avance promedio del plan" /></div>
          </div>
        )}
      </div>

      {resumen.fueraPeriodo > 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <FueraPeriodoBadge compact />
          {plural(resumen.fueraPeriodo, 'compromiso tiene', 'compromisos tienen')} avances registrados después de la fecha límite.
        </p>
      )}

      {loading && (
        <div className="space-y-4" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-100" />)}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <div className="ui-card px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-900">{items.length === 0 ? 'No hay compromisos para hacer seguimiento' : 'No hay compromisos con este estado'}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{items.length === 0 ? emptyText : 'Prueba con otro filtro.'}</p>
        </div>
      )}

      {!loading && groups.map((g) => {
        const first = g[0];
        const r = resumir(g);
        return (
          <section key={first.evaluado.id} data-reveal aria-label={`Compromisos de ${first.evaluado.nombre}`}>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-800">{initials(first.evaluado.nombre)}</span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-slate-900">{first.evaluado.nombre}</h2>
                <p className="truncate text-xs text-slate-500">
                  {first.evaluado.cargo}{readOnly ? ` · ${first.oficina} · Evalúa: ${first.evaluador.nombre}` : ''}
                </p>
              </div>
              <p className="text-xs tabular-nums text-slate-500">
                {plural(r.total, 'compromiso', 'compromisos')}
                {r.vencidos > 0 && <span className="font-semibold text-red-700">, {plural(r.vencidos, 'vencido', 'vencidos')}</span>}
                <span className="text-slate-700">, avance {r.avance} %</span>
              </p>
            </div>

            <div className="ui-card overflow-hidden">
              <div className={`hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 ${ROW_GRID}`}>
                <span>Compromiso</span><span>Plazo</span><span>Avance</span><span>Estado</span><span className="sr-only">Detalle</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {g.map((i) => {
                  const open = openKey === i.key;
                  return (
                    <li key={i.key}>
                      <button type="button" aria-expanded={open} aria-controls={`det-${i.key}`} onClick={() => setOpenKey(open ? null : i.key)}
                        className={`group w-full px-4 py-3.5 text-left transition-colors hover:bg-slate-50 ${ROW_GRID} ${open ? 'bg-slate-50' : ''} flex flex-col gap-3`}>
                        <span className="block min-w-0">
                          <span className="block text-sm font-medium leading-snug text-slate-900">{i.compromiso.act}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">Responsable: {i.compromiso.resp || 'Sin asignar'}</span>
                        </span>
                        <span className="block"><PlazoText item={i} /></span>
                        <span className="block"><ProgressOf item={i} /></span>
                        <span className="flex items-center justify-between lg:justify-start gap-2">
                          <EstadoPill bucket={bucketOf(i)} />
                          <ChevronDown aria-hidden className={`h-4 w-4 text-slate-400 transition-transform duration-200 lg:hidden ${open ? 'rotate-180' : ''}`} />
                        </span>
                        <ChevronDown aria-hidden className={`hidden h-4 w-4 text-slate-400 transition-transform duration-200 lg:block ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div id={`det-${i.key}`}>
                          <SeguimientoDetail item={i} readOnly={readOnly} userId={userId} onSaved={onChanged} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}

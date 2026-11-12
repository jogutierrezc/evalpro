import { useLayoutEffect, type RefObject } from 'react';
import { gsap } from 'gsap';
import { AlertCircle, BadgeCheck, CircleDashed, Clock3, Loader2, PauseCircle, XCircle } from 'lucide-react';

const TZ = 'America/Bogota';
const dtf = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dtfs = new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** Fecha y hora en horario de Colombia. */
export const fmtDT = (iso?: string | null, seconds = false) => (iso ? (seconds ? dtfs : dtf).format(new Date(iso)).replace(',', '') : '-');
export const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : '-');
export const plural = (n: number, one: string, many: string) => `${n.toLocaleString('es-CO')} ${n === 1 ? one : many}`;

const TONES = {
  gray: 'border-slate-300 text-slate-600',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  red: 'border-red-200 bg-red-50 text-red-700',
};
export type Tone = keyof typeof TONES;

export function Pill({ tone = 'gray', icon: Icon, children }: { tone?: Tone; icon?: typeof BadgeCheck; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />}{children}
    </span>
  );
}

const STATUS: Record<string, { label: string; tone: Tone; icon: typeof BadgeCheck }> = {
  queued: { label: 'En cola', tone: 'gray', icon: CircleDashed },
  sending: { label: 'Enviando', tone: 'blue', icon: Loader2 },
  sent: { label: 'Enviado', tone: 'green', icon: BadgeCheck },
  failed: { label: 'Fallido', tone: 'red', icon: XCircle },
  canceled: { label: 'Cancelado', tone: 'gray', icon: XCircle },
  draft: { label: 'Borrador', tone: 'gray', icon: CircleDashed },
  paused: { label: 'En pausa', tone: 'amber', icon: PauseCircle },
  done: { label: 'Terminado', tone: 'green', icon: BadgeCheck },
};
export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: 'gray' as Tone, icon: Clock3 };
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></div>;
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</dd>
      {hint && <p className="text-xs tabular-nums text-slate-500">{hint}</p>}
    </div>
  );
}

export function Bar({ value, total, tone = 'blue', label }: { value: number; total: number; tone?: 'blue' | 'green' | 'amber'; label: string }) {
  const v = total > 0 ? Math.min(1, value / total) : 0;
  const color = { blue: 'bg-blue-600', green: 'bg-emerald-600', amber: 'bg-amber-500' }[tone];
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
      <div data-bar className={`h-full w-full origin-left rounded-full ${color}`} style={{ transform: `scaleX(${v})`, transition: 'transform 320ms var(--ease-out)' }} />
    </div>
  );
}

/** Entrada escalonada de lo que se abre en pantalla. Solo transform y opacidad; respeta prefers-reduced-motion. */
export function useReveal(scope: RefObject<HTMLElement>, deps: unknown[]) {
  useLayoutEffect(() => {
    if (!scope.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-reveal]', { y: 6, opacity: 0, duration: 0.24, ease: 'power3.out', stagger: { amount: 0.25 }, clearProps: 'transform,opacity' });
    }, scope);
    const safety = window.setTimeout(() => ctx.revert(), 1400);
    return () => { window.clearTimeout(safety); ctx.revert(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Tabs<T extends string>({ items, value, onChange, label }: { items: [T, string][]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={label}>
      {items.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
          className={`inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors ${value === k ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-500 hover:text-slate-900'}`}>{l}</button>
      ))}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="ui-card px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{children}</p>}
    </div>
  );
}

/** Línea de tiempo de eventos de un correo o de una firma. */
export function Timeline({ events }: { events: { id: number | string; label: string; at: string; ip?: string | null; ua?: string | null; actor?: string }[] }) {
  if (!events.length) return <p className="text-sm text-slate-500">Sin eventos registrados.</p>;
  return (
    <ol>
      {events.map((e, i) => (
        <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < events.length - 1 && <span aria-hidden className="absolute left-[6px] top-4 h-[calc(100%-6px)] w-px bg-slate-200" />}
          <span aria-hidden className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-blue-600 bg-white" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium text-slate-900">{e.label}{e.actor ? <span className="font-normal text-slate-500">, {e.actor}</span> : null}</p>
            <p className="text-xs tabular-nums text-slate-500">{fmtDT(e.at, true)}{e.ip ? `  ·  IP ${e.ip}` : ''}</p>
            {e.ua && <p className="mt-0.5 break-words text-xs text-slate-400">{e.ua}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export const EVENT_LABEL: Record<string, string> = {
  queued: 'Puesto en cola', sent: 'Entregado al servidor de correo', failed: 'Falló la entrega', open: 'Correo abierto', click: 'Clic en un enlace',
  portal_open: 'Portal de firma abierto', otp_generated: 'Código OTP generado', otp_sent: 'Código OTP enviado', otp_failed: 'Código incorrecto', otp_expired: 'Código vencido',
  otp_verified: 'Código OTP verificado', sign_completed: 'Firma registrada', cert_generated: 'Certificado generado', cert_downloaded: 'Certificado descargado', cert_revoked: 'Certificado revocado', cert_verified: 'Certificado verificado',
};

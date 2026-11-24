import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, MailX, Send, X, XCircle } from 'lucide-react';
import { ESTADO_META, LOTE_BASE, detalleCorreo, fetchEstadosCorreo, fechaHoraCorta, reenviarCorreo, type CorreoInfo, type EstadoCorreo } from '../modules/evaluations/correoResultado';

const TONE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-900 ring-amber-300',
  bad: 'bg-red-50 text-red-800 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  muted: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const ICON: Record<EstadoCorreo, typeof Mail> = {
  sent: CheckCircle2, sending: Loader2, failed: XCircle, no_enviado: MailX, sin_registro: Mail, pendiente: Clock, sin_correo: AlertTriangle,
};

/** Estado del correo de resultados de UNA persona en un periodo (sin periodo no hay correo). */
export function useCorreoEstado(periodId?: string | null, userId?: string | null) {
  const [info, setInfo] = useState<CorreoInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!periodId || !userId) { setInfo(null); return; }
    setLoading(true);
    fetchEstadosCorreo(periodId, [userId])
      .then((m) => { if (alive) { setInfo(m.get(userId) ?? null); setError(null); } })
      .catch((e) => { if (alive) { setInfo(null); setError(e instanceof Error ? e.message : 'No se pudo consultar el correo.'); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [periodId, userId, tick]);
  return { info, loading, error, reload: () => setTick((t) => t + 1) };
}

/** Indicador del estado del correo de resultados. Usa texto + icono (no solo color). */
export function CorreoEstadoBadge({ info, loading, className = '' }: { info?: CorreoInfo | null; loading?: boolean; className?: string }) {
  if (loading) return <span className={`inline-block h-5 w-16 animate-pulse rounded-full bg-slate-100 ${className}`} aria-label="Consultando correo" />;
  if (!info) return <span className={`text-xs text-slate-400 ${className}`} title="Solo la persona evaluadora o un administrador ve el estado del correo.">-</span>;
  const m = ESTADO_META[info.estado];
  const Icon = ICON[info.estado];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE[m.tone]} ${className}`} title={detalleCorreo(info)}>
      <Icon className={`h-3 w-3 ${info.estado === 'sending' ? 'animate-spin' : ''}`} aria-hidden />
      {m.label}
    </span>
  );
}

export interface ReenvioObjetivo { userId: string; nombre: string; info?: CorreoInfo | null }

type Fase = 'confirmar' | 'enviando' | 'listo';

/**
 * Confirmación y envío del correo de resultados, para una persona o en lote. Envía de una en una (cada envío arma su PDF
 * en el navegador) y muestra el avance. Al terminar llama a onDone para que quien lo abrió vuelva a consultar los estados.
 */
export function ReenviarCorreoDialog({ objetivos, periodId, periodoNombre, propio = false, onClose, onDone }: {
  objetivos: ReenvioObjetivo[];
  periodId: string;
  periodoNombre?: string;
  /** La persona reenvía su propio correo (texto en segunda persona). */
  propio?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const lote = objetivos.length > 1;
  const [incluirSinRegistro, setIncluirSinRegistro] = useState(false);
  const [fase, setFase] = useState<Fase>('confirmar');
  const [hechos, setHechos] = useState<Record<string, { ok: boolean; motivo?: string }>>({});
  const cancelar = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  const lista = useMemo(() => objetivos.filter((o) => {
    const e = o.info?.estado;
    if (!lote) return true;
    return !!e && (LOTE_BASE.includes(e) || (incluirSinRegistro && e === 'sin_registro'));
  }), [objetivos, lote, incluirSinRegistro]);
  const nSinRegistro = objetivos.filter((o) => o.info?.estado === 'sin_registro').length;
  const yaEnviados = lista.filter((o) => o.info?.estado === 'sent');

  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && fase !== 'enviando') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fase, onClose]);

  const enviar = async () => {
    cancelar.current = false;
    setFase('enviando');
    for (const o of lista) {
      if (cancelar.current) break;
      const r = await reenviarCorreo(o.userId, periodId);
      setHechos((h) => ({ ...h, [o.userId]: r }));
    }
    setFase('listo');
    onDone();
  };

  const ok = Object.values(hechos).filter((h) => h.ok).length;
  const fallos = Object.entries(hechos).filter(([, h]) => !h.ok);
  const progreso = lista.length ? Math.round((Object.keys(hechos).length / lista.length) * 100) : 0;
  const unico = lista[0];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 animate-[fadeIn_160ms_ease-out]" onMouseDown={(e) => { if (e.target === e.currentTarget && fase !== 'enviando') onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="reenvio-titulo" className="w-full max-w-md rounded-xl bg-white shadow-2xl outline-none animate-[popIn_200ms_cubic-bezier(0.23,1,0.32,1)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="reenvio-titulo" className="text-base font-semibold text-slate-900">
              {fase === 'listo' ? 'Envío terminado' : lote ? 'Reenviar correos de resultados' : 'Reenviar correo de resultados'}
            </h2>
            {periodoNombre && <p className="mt-0.5 text-xs text-slate-500">{periodoNombre}</p>}
          </div>
          <button onClick={onClose} disabled={fase === 'enviando'} aria-label="Cerrar" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
          {fase === 'confirmar' && (
            <>
              {!lote && unico ? (
                <>
                  <p>
                    {propio ? 'Te enviaremos de nuevo' : <>Se enviará de nuevo a <b>{unico.nombre}</b></>} el correo con los resultados
                    {propio ? '' : ''} y la copia en PDF, con la misma plantilla del correo de cierre.
                  </p>
                  <p className="rounded-md bg-slate-50 px-3 py-2 text-[13px]">
                    Destino: <b>{unico.info?.email || 'sin correo'}</b><br />
                    Estado actual: <b>{unico.info ? ESTADO_META[unico.info.estado].label : 'desconocido'}</b>
                    {unico.info?.sent_at && <> · último envío {fechaHoraCorta(unico.info.sent_at)}</>}
                  </p>
                  {unico.info?.estado === 'sent' && <p className="flex gap-2 text-[13px] text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />Ya se le envió. Reenvía solo si dice que no le llegó.</p>}
                </>
              ) : (
                <>
                  <p>Se reenviará el correo de resultados (misma plantilla y copia en PDF) a <b>{lista.length}</b> {lista.length === 1 ? 'persona' : 'personas'} que no lo tienen enviado o cuyo envío falló.</p>
                  {nSinRegistro > 0 && (
                    <label className="flex items-start gap-2 rounded-md bg-slate-50 px-3 py-2 text-[13px]">
                      <input type="checkbox" className="mt-0.5" checked={incluirSinRegistro} onChange={(e) => setIncluirSinRegistro(e.target.checked)} />
                      <span>Incluir <b>{nSinRegistro}</b> sin registro (terminaron antes del seguimiento; puede que ya lo hayan recibido).</span>
                    </label>
                  )}
                  {yaEnviados.length > 0 && <p className="text-[13px] text-amber-800">{yaEnviados.length} ya figuran como enviados.</p>}
                  {lista.length === 0 && <p className="text-[13px] text-slate-500">No hay personas para reenviar con este criterio.</p>}
                </>
              )}
            </>
          )}

          {fase !== 'confirmar' && (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={progreso} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-200 ease-out" style={{ width: `${progreso}%` }} />
              </div>
              <p aria-live="polite" className="text-[13px]">
                {fase === 'enviando' ? `Enviando ${Object.keys(hechos).length + 1 > lista.length ? lista.length : Object.keys(hechos).length + 1} de ${lista.length}...` : `${ok} enviado${ok === 1 ? '' : 's'}${fallos.length ? `, ${fallos.length} sin enviar` : ''}.`}
              </p>
              {fallos.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-red-100 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                  {fallos.map(([id, h]) => <li key={id}><b>{lista.find((o) => o.userId === id)?.nombre}</b>: {h.motivo || 'No se pudo enviar.'}</li>)}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          {fase === 'confirmar' && (
            <>
              <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">Cancelar</button>
              <button onClick={enviar} disabled={!lista.length} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-[transform,background-color] duration-150 hover:bg-blue-700 active:scale-[0.97] disabled:opacity-50">
                <Send className="h-4 w-4" />{lote ? `Reenviar a ${lista.length}` : 'Reenviar correo'}
              </button>
            </>
          )}
          {fase === 'enviando' && <button onClick={() => { cancelar.current = true; }} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100">Detener tras este envío</button>}
          {fase === 'listo' && <button onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-transform active:scale-[0.97]">Cerrar</button>}
        </div>
      </div>
    </div>
  );
}

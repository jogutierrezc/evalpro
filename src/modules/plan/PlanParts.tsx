import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle, BadgeCheck, CalendarClock, CircleDashed, Clock3, ExternalLink, FileText, Link2, Loader2, XCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fechaCorta, fechaLarga } from '../feedback/types';
import {
  BUCKET, ESTADO_LABEL, PDF_MAX_BYTES, Bucket, PlanEstado, PlanItem, Registro, bucketOf, haceTexto, isHttpUrl, pctOf, plazoOf, safeFileName,
} from './types';

/* ---------- Estado ---------- */

const BUCKET_STYLE: Record<Bucket, string> = {
  sin: 'border-slate-300 text-slate-500',
  en_proceso: 'border-blue-200 bg-blue-50 text-blue-800',
  cumplido: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  incumplido: 'border-red-200 bg-red-50 text-red-700',
};
const BUCKET_ICON = { sin: CircleDashed, en_proceso: Clock3, cumplido: BadgeCheck, incumplido: XCircle };
export const BUCKET_LABEL: Record<Bucket, string> = { sin: 'Sin registro', ...ESTADO_LABEL };

export function EstadoPill({ bucket }: { bucket: Bucket }) {
  const Icon = BUCKET_ICON[bucket];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${BUCKET_STYLE[bucket]}`}>
      <Icon className="h-3.5 w-3.5" />
      {BUCKET_LABEL[bucket]}
    </span>
  );
}

/* ---------- Plazo ---------- */

const PLAZO_TONE: Record<string, string> = {
  sin_fecha: 'text-slate-500',
  en_plazo: 'text-slate-600',
  proximo: 'text-amber-700',
  hoy: 'text-amber-700',
  vencido: 'text-red-700',
  cerrado: 'text-emerald-700',
  cerrado_tarde: 'text-amber-700',
};

export function PlazoText({ item }: { item: PlanItem }) {
  const p = plazoOf(item.compromiso.fecha, item.seg);
  const Icon = p.kind === 'vencido' || p.kind === 'cerrado_tarde' ? AlertTriangle : CalendarClock;
  const fecha = item.compromiso.fecha ? fechaCorta(item.compromiso.fecha) : null;
  return (
    <div className={`min-w-0 text-sm ${PLAZO_TONE[p.kind]}`}>
      <p className="flex items-center gap-1.5 font-medium">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{p.label}</span>
      </p>
      <p className="mt-0.5 pl-[22px] text-xs tabular-nums text-slate-500">
        {fecha ? `Límite ${fecha}` : 'Sin fecha'}
        {p.kind === 'vencido' && p.days !== null ? `, ${haceTexto(p.days)}` : ''}
      </p>
    </div>
  );
}

export function FueraPeriodoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {compact ? 'Actualizado fuera del periodo' : 'Compromiso actualizado por fuera del periodo de cumplimiento'}
    </span>
  );
}

/* ---------- Progreso ---------- */

const BAR_COLOR: Record<Bucket, string> = { sin: 'bg-slate-300', en_proceso: 'bg-blue-600', cumplido: 'bg-emerald-600', incumplido: 'bg-red-500' };

export function ProgressBar({ pct, bucket, label }: { pct: number; bucket: Bucket; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2.5" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div data-bar className={`plan-bar h-full w-full origin-left rounded-full ${BAR_COLOR[bucket]}`} style={{ transform: `scaleX(${v / 100})` }} />
      </div>
      <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700">{v} %</span>
    </div>
  );
}

export const ProgressOf = ({ item }: { item: PlanItem }) => (
  <ProgressBar pct={pctOf(item)} bucket={bucketOf(item)} label={`Avance de: ${item.compromiso.act}`} />
);

/* ---------- Detalle: bitácora + formulario ---------- */

const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${fechaCorta(iso)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

async function openPdf(path: string): Promise<boolean> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return false;
  window.open(data.signedUrl, '_blank', 'noopener');
  return true;
}

function Evidencia({ r }: { r: Registro }) {
  const [failed, setFailed] = useState(false);
  if (r.evidencia_tipo === 'link' && r.evidencia_url) {
    return (
      <a href={r.evidencia_url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <Link2 className="h-4 w-4 shrink-0" /><span className="truncate">{r.evidencia_url.replace(/^https?:\/\//, '')}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
      </a>
    );
  }
  if (r.evidencia_tipo === 'pdf' && r.evidencia_path) {
    return (
      <span className="inline-flex max-w-full items-center gap-2">
        <button type="button" onClick={async () => setFailed(!(await openPdf(r.evidencia_path!)))} className="inline-flex max-w-full items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
          <FileText className="h-4 w-4 shrink-0" /><span className="truncate">{r.evidencia_nombre || 'Evidencia.pdf'}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" />
        </button>
        {failed && <span role="alert" className="text-xs text-red-700">No se pudo abrir el archivo.</span>}
      </span>
    );
  }
  return null;
}

function Bitacora({ registros, loading }: { registros: Registro[]; loading: boolean }) {
  if (loading) return <div className="h-16 animate-pulse rounded-md bg-slate-100" />;
  if (!registros.length) {
    return <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">Todavía no hay avances registrados para este compromiso.</p>;
  }
  return (
    <ol className="space-y-0">
      {registros.map((r, idx) => (
        <li key={r.id} className="relative flex gap-3 pb-5 last:pb-0">
          {idx < registros.length - 1 && <span aria-hidden className="absolute left-[7px] top-4 h-[calc(100%-8px)] w-px bg-slate-200" />}
          <span aria-hidden className={`relative mt-1 h-[15px] w-[15px] shrink-0 rounded-full border-2 bg-white ${r.estado === 'cumplido' ? 'border-emerald-600' : r.estado === 'incumplido' ? 'border-red-500' : 'border-blue-600'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <EstadoPill bucket={r.estado} />
              <span className="text-sm font-semibold tabular-nums text-slate-900">{r.porcentaje} %</span>
              <time className="text-xs tabular-nums text-slate-500" dateTime={r.created_at}>{fmtStamp(r.created_at)}</time>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.descripcion}</p>
            {(r.evidencia_tipo || r.fuera_de_plazo) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <Evidencia r={r} />
                {r.fuera_de_plazo && <FueraPeriodoBadge compact />}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

type EvTipo = 'none' | 'link' | 'pdf';

interface DetailProps {
  item: PlanItem;
  readOnly: boolean;
  userId: string;
  onSaved: () => void;
}

export function SeguimientoDetail({ item, readOnly, userId, onSaved }: DetailProps) {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);

  const [descripcion, setDescripcion] = useState('');
  const [estado, setEstado] = useState<PlanEstado>(item.seg?.estado ?? 'en_proceso');
  const [pct, setPct] = useState(item.seg?.porcentaje ?? 0);
  const [evTipo, setEvTipo] = useState<EvTipo>('none');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const loadRegistros = useCallback(async () => {
    const { data } = await supabase.from('plan_registros').select('*')
      .eq('acta_id', item.actaId).eq('compromiso_id', item.compromiso.id).order('created_at', { ascending: false });
    setRegistros((data || []) as Registro[]);
    setLoading(false);
  }, [item.actaId, item.compromiso.id]);

  useEffect(() => { loadRegistros(); }, [loadRegistros]);

  const plazo = plazoOf(item.compromiso.fecha, item.seg);
  const lateWarning = plazo.kind === 'vencido';

  function pickEstado(e: PlanEstado) {
    setEstado(e);
    if (e === 'cumplido') setPct(100);
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    setError(null); setSaved(false);
    if (descripcion.trim().length < 5) { setError('Describe el avance con al menos unas palabras.'); return; }
    if (evTipo === 'link' && !isHttpUrl(link)) { setError('El enlace debe empezar por http:// o https://'); return; }
    if (evTipo === 'pdf') {
      if (!file) { setError('Selecciona el archivo PDF de la evidencia.'); return; }
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setError('La evidencia debe ser un archivo PDF.'); return; }
      if (file.size > PDF_MAX_BYTES) { setError('El PDF supera los 10 MB. Comprímelo o comparte un enlace.'); return; }
    }

    setSaving(true);
    let path: string | null = null;
    try {
      if (evTipo === 'pdf' && file) {
        path = `${item.actaId}/${item.compromiso.id}/${Date.now()}-${safeFileName(file.name)}`;
        const { error: up } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (up) throw up;
      }
      const { error: ins } = await supabase.from('plan_registros').insert({
        acta_id: item.actaId,
        compromiso_id: item.compromiso.id,
        estado,
        porcentaje: estado === 'cumplido' ? 100 : pct,
        descripcion: descripcion.trim(),
        evidencia_tipo: evTipo === 'none' ? null : evTipo,
        evidencia_url: evTipo === 'link' ? link.trim() : null,
        evidencia_path: evTipo === 'pdf' ? path : null,
        evidencia_nombre: evTipo === 'pdf' && file ? file.name : null,
        created_by: userId,
      });
      if (ins) throw ins;
      setDescripcion(''); setLink(''); setFile(null); setEvTipo('none'); setSaved(true);
      await loadRegistros();
      onSaved();
    } catch (e: any) {
      console.error('[Plan] registrar', e);
      if (path) supabase.storage.from(BUCKET).remove([path]);
      setError(/dos firmas|evaluadora/.test(e?.message || '') ? e.message : 'No se pudo guardar el avance. Revisa tu conexión e inténtalo de nuevo.');
    } finally { setSaving(false); }
  }

  const idBase = `plan-${item.key}`;
  const estados: PlanEstado[] = ['en_proceso', 'cumplido', 'incumplido'];

  return (
    <div className={`animate-in grid gap-8 border-t border-slate-200 bg-slate-50/60 px-4 py-5 sm:px-5 ${readOnly ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]'}`}>
      {!readOnly && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Registrar avance</h3>
            <p className="mt-0.5 text-xs text-slate-500">Compromiso suscrito en el acta {item.numeroActa || ''}{item.compromiso.fecha ? `, con fecha límite el ${fechaLarga(item.compromiso.fecha)}` : ''}.</p>
          </div>

          {lateWarning && (
            <div role="note" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Este compromiso está vencido. Lo que registres quedará marcado como <strong className="font-semibold">actualizado por fuera del periodo de cumplimiento</strong>.</span>
            </div>
          )}

          <div>
            <label htmlFor={`${idBase}-desc`} className="mb-1.5 block text-sm font-medium text-slate-700">Descripción del avance</label>
            <textarea id={`${idBase}-desc`} rows={3} className="ui-input resize-y" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Qué se hizo, con quién y qué falta." />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Estado</legend>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
              {estados.map((e) => (
                <button key={e} type="button" aria-pressed={estado === e} onClick={() => pickEstado(e)}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors ${estado === e ? (e === 'cumplido' ? 'bg-emerald-50 font-semibold text-emerald-800' : e === 'incumplido' ? 'bg-red-50 font-semibold text-red-800' : 'bg-blue-50 font-semibold text-blue-800') : 'text-slate-500 hover:text-slate-900'}`}>
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor={`${idBase}-pct`} className="text-sm font-medium text-slate-700">Porcentaje de cumplimiento</label>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{estado === 'cumplido' ? 100 : pct} %</span>
            </div>
            <input id={`${idBase}-pct`} type="range" min={0} max={100} step={5} value={estado === 'cumplido' ? 100 : pct} disabled={estado === 'cumplido'}
              onChange={(e) => setPct(Number(e.target.value))} className="h-2 w-full cursor-pointer accent-blue-700 disabled:cursor-not-allowed disabled:opacity-60" />
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Evidencia <span className="font-normal text-slate-500">(opcional)</span></legend>
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5">
              {([['none', 'Sin evidencia'], ['link', 'Enlace'], ['pdf', 'Archivo PDF']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={evTipo === k} onClick={() => { setEvTipo(k); setError(null); }}
                  className={`inline-flex h-8 items-center rounded-md px-3 text-sm transition-colors ${evTipo === k ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-500 hover:text-slate-900'}`}>{l}</button>
              ))}
            </div>
            {evTipo === 'link' && (
              <div className="mt-2.5">
                <label htmlFor={`${idBase}-link`} className="sr-only">Enlace de la evidencia</label>
                <input id={`${idBase}-link`} type="url" inputMode="url" className="ui-input" placeholder="https://drive.google.com/..." value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
            )}
            {evTipo === 'pdf' && (
              <div className="mt-2.5">
                <label htmlFor={`${idBase}-pdf`} className="sr-only">Archivo PDF de la evidencia</label>
                <input id={`${idBase}-pdf`} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                <p className="mt-1 text-xs text-slate-500">Solo PDF, hasta 10 MB.</p>
              </div>
            )}
          </fieldset>

          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {saved && !error && <p role="status" className="text-sm font-medium text-emerald-700">Avance registrado.</p>}

          <button type="submit" disabled={saving} className="ui-btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Guardando' : 'Registrar avance'}
          </button>
        </form>
      )}

      <section aria-label="Historial de seguimiento">
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-sm font-semibold text-slate-900">Historial</h3>
          {item.seg?.actualizado_fuera_plazo && <FueraPeriodoBadge />}
        </div>
        <Bitacora registros={registros} loading={loading} />
      </section>
    </div>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { AlertCircle, ArrowLeft, BadgeCheck, CheckCircle2, Cloud, Copy, FileDown, FileSpreadsheet, Loader2, Lock, PenLine, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ActaPaper } from './ActaPaper';
import { ResultadosPanel } from './ResultadosPanel';
import { exportarExcel } from './resultados';
import { SignDialog } from './SignDialog';
import { StatePill } from './FeedbackModule';
import type { FeedbackRow } from './FeedbackModule';
import { ActaRow, TOTAL_CHECKS, actaState, faltantes, isLocked, newId, shortName, startsWithVerb } from './types';

const CONTENT_FIELDS = ['oficina', 'numero', 'fecha', 'lugar', 'hora_inicio', 'hora_fin', 'objetivo', 'asistentes', 'tipo', 'seguimiento', 'agenda', 'desarrollo', 'convocatoria', 'compromisos', 'anexo', 'transcriptor', 'resultados'] as const;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Field({ id, label, hint, warn, children }: { id: string; label: string; hint?: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="flex justify-between gap-2 text-[13px] font-medium text-slate-700">
        {label}
        {hint && <span className={`text-xs font-normal ${warn ? 'text-amber-700' : 'text-slate-500'}`}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Area({ value, onChange, id, rows = 3 }: { value: string; onChange: (v: string) => void; id: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ref.current; if (!t) return;
    t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight + 2, 56)}px`;
  }, [value]);
  return <textarea ref={ref} id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="ui-input resize-none overflow-hidden text-justify leading-relaxed [hyphens:auto]" />;
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="grid gap-3.5 border-b border-slate-200 py-[18px] last:border-b-0">
      <h2 className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-900">{title}{aside}</h2>
      {children}
    </section>
  );
}

interface Props {
  row: FeedbackRow;
  readOnly: boolean;
  currentUserId: string;
  onBack: () => void;
  onActa: (a: ActaRow) => void;
}

export function ActaEditor({ row, readOnly, currentUserId, onBack, onActa }: Props) {
  const [a, setA] = useState<ActaRow>(row.acta!);
  const [save, setSave] = useState<'saved' | 'saving' | 'error'>('saved');
  const [pane, setPane] = useState<'form' | 'preview'>('form');
  const [signing, setSigning] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<number>();
  const root = useRef<HTMLDivElement>(null);

  const locked = isLocked(a);
  const full = !!(a.evaluator_signed_at && a.evaluated_signed_at);
  const disabled = readOnly || locked;
  const miss = useMemo(() => faltantes(a), [a]);
  const state = actaState(a);

  const edit = useCallback((patch: Partial<ActaRow>) => {
    dirty.current = true; setSave('saving');
    setA((cur) => ({ ...cur, ...patch }));
  }, []);

  // Autoguardado con espera: guarda 700 ms después del último cambio. Un acta firmada no se escribe.
  useEffect(() => {
    if (!dirty.current || disabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const payload: Record<string, unknown> = {};
      CONTENT_FIELDS.forEach((k) => { const v = (a as any)[k]; payload[k] = (k === 'fecha' || k === 'hora_inicio' || k === 'hora_fin') && !v ? null : v; });
      const { data, error } = await supabase.from('feedback_actas').update(payload).eq('id', a.id).select('*').single();
      if (error) { console.error('[Feedback] autosave', error); setSave('error'); return; }
      dirty.current = false; setSave('saved');
      onActa({ ...(data as any), hora_inicio: data.hora_inicio?.slice(0, 5) ?? null, hora_fin: data.hora_fin?.slice(0, 5) ?? null, compromisos: data.compromisos || [] });
    }, 700);
    return () => window.clearTimeout(timer.current);
  }, [a, disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!root.current || reduced()) return;
    const ctx = gsap.context(() => { gsap.from('[data-enter]', { y: 8, opacity: 0, duration: 0.24, ease: 'power3.out', stagger: 0.05, clearProps: 'transform,opacity' }); }, root);
    const safety = window.setTimeout(() => ctx.revert(), 1500);
    return () => { window.clearTimeout(safety); ctx.revert(); };
  }, []);

  // Compromisos: enumerados, se agregan de a uno.
  const addComp = () => {
    const id = newId();
    edit({ compromisos: [...a.compromisos, { id, act: '', resp: '', fecha: '' }] });
    requestAnimationFrame(() => {
      const row = root.current?.querySelector(`[data-cid="${id}"]`);
      if (row && !reduced()) gsap.fromTo(row, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.22, ease: 'power3.out', clearProps: 'transform,opacity' });
      (root.current?.querySelector(`#fb-comp-${id}`) as HTMLElement | null)?.focus();
    });
  };
  const patchComp = (id: string, p: Partial<ActaRow['compromisos'][number]>) => edit({ compromisos: a.compromisos.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const delComp = (id: string) => {
    const el = root.current?.querySelector(`[data-cid="${id}"]`);
    const done = () => { const next = a.compromisos.filter((c) => c.id !== id); edit({ compromisos: next.length ? next : [{ id: newId(), act: '', resp: '', fecha: '' }] }); };
    if (el && !reduced()) gsap.to(el, { opacity: 0, x: 10, duration: 0.16, ease: 'power2.in', onComplete: done }); else done();
  };

  // Clic en el acta: salta al campo y lo resalta.
  const jump = (field: string) => {
    const idMap: Record<string, string> = { tipo: 'fb-tipo' };
    const el = document.getElementById(idMap[field] || (field.startsWith('comp-') ? `fb-${field}` : `fb-${field}`));
    if (!el) return;
    setPane('form');
    requestAnimationFrame(() => {
      el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      (el as HTMLElement).focus?.({ preventScroll: true });
      if (!reduced()) gsap.fromTo(el, { boxShadow: '0 0 0 4px rgba(29,78,216,.35)' }, { boxShadow: '0 0 0 0 rgba(29,78,216,0)', duration: 1.1, ease: 'power3.out', clearProps: 'boxShadow' });
    });
  };

  const reopen = async () => {
    setReopenError(null);
    const { error } = await supabase.rpc('feedback_reopen', { p_acta: a.id, p_user: currentUserId });
    if (error) { setReopenError(error.message || 'No se pudo reabrir el acta.'); return; }
    const { data } = await supabase.from('feedback_actas').select('*').eq('id', a.id).single();
    if (data) { const n = { ...(data as any), hora_inicio: data.hora_inicio?.slice(0, 5) ?? null, hora_fin: data.hora_fin?.slice(0, 5) ?? null, compromisos: data.compromisos || [] } as ActaRow; setA(n); onActa(n); }
    setConfirmReopen(false);
  };

  const aRef = useRef(a); aRef.current = a;
  const onActaRef = useRef(onActa); onActaRef.current = onActa;
  const refreshFromServer = useCallback((p: Partial<ActaRow>) => {
    const n = { ...aRef.current, ...p };
    aRef.current = n; setA(n); onActaRef.current(n);
  }, []);

  const openPdf = () => window.open(`${import.meta.env.BASE_URL}?module=acta-print&id=${a.id}`, '_blank', 'noopener');
  const done = Math.max(0, TOTAL_CHECKS - miss.length);

  const excel = async () => {
    if (!a.resultados || exporting) return;
    setExporting(true); setExportError(null);
    try { await exportarExcel(a.resultados, { evaluado: row.evaluated.nombre, evaluador: row.evaluator.nombre }); }
    catch (e) { console.error('[Feedback] excel', e); setExportError('No se pudo generar el Excel. Inténtalo de nuevo.'); }
    finally { setExporting(false); }
  };

  const copyHash = async () => {
    try { await navigator.clipboard.writeText(a.content_hash || ''); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* sin permiso de portapapeles */ }
  };

  return (
    <div ref={root} className="space-y-4">
      <div data-enter className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button onClick={onBack} className="ui-btn-secondary !py-1.5"><ArrowLeft className="h-4 w-4" /> Equipo</button>
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Acta de retroalimentación</h1>
          <p className="truncate text-sm text-slate-500">{row.evaluated.nombre} - {row.template}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500" aria-live="polite">
          {save === 'saving' && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando</>}
          {save === 'saved' && <><Cloud className="h-3.5 w-3.5" /> Guardado</>}
          {save === 'error' && <span className="text-red-700"><AlertCircle className="mr-1 inline h-3.5 w-3.5" />No se pudo guardar</span>}
        </span>
        <StatePill state={state} />
        {a.resultados && (
          <button onClick={excel} disabled={exporting} className="ui-btn-secondary !py-1.5" title="Descarga la tabla de resultados por criterio">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Resultados en Excel
          </button>
        )}
        <button onClick={openPdf} className="ui-btn-secondary !py-1.5"><FileDown className="h-4 w-4" /> Vista PDF</button>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 lg:hidden" role="group" aria-label="Vista">
          {(['form', 'preview'] as const).map((p) => (
            <button key={p} onClick={() => setPane(p)} aria-pressed={pane === p} className={`h-8 rounded-md px-3 text-sm ${pane === p ? 'bg-blue-50 font-semibold text-blue-800' : 'text-slate-500'}`}>{p === 'form' ? 'Formulario' : 'Vista previa'}</button>
          ))}
        </div>
      </div>

      {readOnly && (
        <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700"><Lock className="h-4 w-4" /> Solo lectura. Únicamente la persona evaluadora edita y firma el acta.</div>
      )}
      {locked && !readOnly && (
        <div data-enter className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          <span className="flex-1">{full ? 'Acta firmada por las dos partes. Ya no se puede modificar.' : 'Acta bloqueada. Cualquier cambio invalida las firmas ya registradas.'}</span>
          {!full && !confirmReopen && <button onClick={() => setConfirmReopen(true)} className="rounded-md border border-amber-700/40 px-3 py-1 text-xs font-semibold hover:bg-amber-100">Reabrir y borrar firmas</button>}
          {!full && confirmReopen && (
            <span className="flex items-center gap-2 text-xs">
              Se borrarán las firmas y habrá que firmar de nuevo.
              <button onClick={reopen} className="rounded-md bg-amber-800 px-3 py-1 font-semibold text-white hover:bg-amber-900">Sí, reabrir</button>
              <button onClick={() => setConfirmReopen(false)} className="rounded-md border border-amber-700/40 px-3 py-1 font-semibold">Cancelar</button>
            </span>
          )}
        </div>
      )}
      {exportError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</div>}
      {reopenError && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{reopenError}</div>}
      {full && (
        <div data-enter className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <BadgeCheck className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Acta firmada y sellada</p>
            <p className="break-all font-mono text-xs text-slate-600">SHA-256 {a.content_hash}</p>
          </div>
          <button onClick={copyHash} className="ui-btn-secondary !py-1.5"><Copy className="h-4 w-4" />{copied ? 'Copiada' : 'Copiar huella'}</button>
          <button onClick={openPdf} className="ui-btn-primary !py-1.5"><FileDown className="h-4 w-4" /> Descargar PDF</button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(380px,460px)_minmax(0,1fr)]">
        <aside data-enter className={`ui-card flex flex-col overflow-hidden lg:sticky lg:top-2 lg:max-h-[calc(100vh-7rem)] ${pane === 'preview' ? 'hidden lg:flex' : ''}`}>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 [overscroll-behavior:contain]">
          <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
            <Section title="Encabezado">
              <Field id="fb-oficina" label="Oficina productora"><input id="fb-oficina" className="ui-input" value={a.oficina} onChange={(e) => edit({ oficina: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="fb-numero" label="No. de acta"><input id="fb-numero" className="ui-input" value={a.numero} placeholder="Ej. 014-2026" onChange={(e) => edit({ numero: e.target.value })} /></Field>
                <Field id="fb-fecha" label="Fecha"><input id="fb-fecha" type="date" className="ui-input tabular-nums" value={a.fecha || ''} onChange={(e) => edit({ fecha: e.target.value })} /></Field>
              </div>
              <Field id="fb-lugar" label="Lugar"><input id="fb-lugar" className="ui-input" value={a.lugar} onChange={(e) => edit({ lugar: e.target.value })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="fb-hora_inicio" label="Hora de inicio"><input id="fb-hora_inicio" type="time" className="ui-input tabular-nums" value={a.hora_inicio || ''} onChange={(e) => edit({ hora_inicio: e.target.value })} /></Field>
                <Field id="fb-hora_fin" label="Hora final"><input id="fb-hora_fin" type="time" className={`ui-input tabular-nums ${a.hora_inicio && a.hora_fin && a.hora_fin <= a.hora_inicio ? '!border-red-500' : ''}`} value={a.hora_fin || ''} onChange={(e) => edit({ hora_fin: e.target.value })} /></Field>
              </div>
            </Section>
            <Section title="Objetivo">
              <Field id="fb-objetivo" label="Objetivo de la reunión" hint={a.objetivo.trim() && !startsWithVerb(a.objetivo) ? 'Revisa: debe iniciar con un verbo' : 'Inicia con un verbo en infinitivo'} warn={!!a.objetivo.trim() && !startsWithVerb(a.objetivo)}>
                <Area id="fb-objetivo" value={a.objetivo} onChange={(v) => edit({ objetivo: v })} />
              </Field>
            </Section>
            <Section title="Asistentes">
              <Field id="fb-asistentes" label="Nombre y cargo, uno por línea"><Area id="fb-asistentes" value={a.asistentes} onChange={(v) => edit({ asistentes: v })} /></Field>
            </Section>
            <Section title="Desarrollo de la reunión">
              <div className="grid grid-cols-[28px_1fr] items-start gap-x-2.5"><b className="pt-0.5 text-[13px] text-blue-700">I.</b>
                <div className="grid gap-1.5"><span className="text-[13px] font-medium text-slate-700">Tipo de reunión</span>
                  <div id="fb-tipo" tabIndex={-1} className="inline-grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Tipo de reunión">
                    {([['nueva', 'Reunión nueva'], ['lectura', 'Lectura y firma del acta anterior']] as const).map(([k, l]) => (
                      <button type="button" key={k} onClick={() => edit({ tipo: k })} aria-pressed={a.tipo === k} className={`rounded-md px-2.5 py-1.5 text-[12.5px] transition-colors ${a.tipo === k ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              </div>
              {([['II.', 'seguimiento', 'Seguimiento a compromisos', 2], ['III.', 'agenda', 'Agenda', 3], ['IV.', 'desarrollo', 'Desarrollo', 5], ['V.', 'convocatoria', 'Convocatoria', 2]] as const).map(([n, k, l, r]) => (
                <div key={k} className="grid gap-3.5">
                  <div className="grid grid-cols-[28px_1fr] items-start gap-x-2.5"><b className="pt-0.5 text-[13px] text-blue-700">{n}</b>
                    <Field id={`fb-${k}`} label={l}><Area id={`fb-${k}`} rows={r} value={(a as any)[k]} onChange={(v) => edit({ [k]: v } as any)} /></Field>
                  </div>
                  {k === 'desarrollo' && (
                    <div className="grid grid-cols-[28px_1fr] gap-x-2.5"><span aria-hidden />
                      <ResultadosPanel resultados={a.resultados} evaluationId={a.evaluation_id} disabled={disabled} onChange={(r) => edit({ resultados: r })} />
                    </div>
                  )}
                </div>
              ))}
            </Section>
            <Section title="Compromisos" aside={<small className="text-xs font-normal text-slate-500">{a.compromisos.length === 1 ? '1 compromiso' : `${a.compromisos.length} compromisos`}</small>}>
              <div className="grid gap-2.5">
                {a.compromisos.map((c, i) => (
                  <div key={c.id} data-cid={c.id} className="grid grid-cols-[28px_1fr_32px] items-start gap-x-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <span className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold tabular-nums text-white">{i + 1}</span>
                    <div className="grid min-w-0 gap-2.5">
                      <Field id={`fb-comp-${c.id}`} label="Actividad">
                        <textarea id={`fb-comp-${c.id}`} rows={2} value={c.act} onChange={(e) => patchComp(c.id, { act: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addComp(); } }}
                          className="ui-input min-h-14 resize-y text-justify leading-relaxed [hyphens:auto]" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3">
                        <Field id={`fb-comp-r-${c.id}`} label="Responsable"><input id={`fb-comp-r-${c.id}`} list="fb-resp" className="ui-input" value={c.resp} onChange={(e) => patchComp(c.id, { resp: e.target.value })} /></Field>
                        <Field id={`fb-comp-f-${c.id}`} label="Fecha"><input id={`fb-comp-f-${c.id}`} type="date" className="ui-input tabular-nums" value={c.fecha} onChange={(e) => patchComp(c.id, { fecha: e.target.value })} /></Field>
                      </div>
                    </div>
                    <button type="button" onClick={() => delComp(c.id)} aria-label={`Quitar compromiso ${i + 1}`} className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <datalist id="fb-resp"><option value={shortName(row.evaluated.nombre)} /><option value={shortName(row.evaluator.nombre)} /></datalist>
              <button type="button" onClick={addComp} className="ui-btn-secondary w-full justify-center border-dashed !text-blue-700"><Plus className="h-4 w-4" /> Agregar compromiso</button>
              <span className="text-xs text-slate-500">Se numeran solos. Ctrl + Enter en una actividad crea el siguiente.</span>
            </Section>
            <Section title="Cierre">
              <Field id="fb-anexo" label="Anexo (opcional)"><input id="fb-anexo" className="ui-input" value={a.anexo} onChange={(e) => edit({ anexo: e.target.value })} /></Field>
              <Field id="fb-transcriptor" label="Transcriptor"><input id="fb-transcriptor" className="ui-input" value={a.transcriptor} onChange={(e) => edit({ transcriptor: e.target.value })} /></Field>
            </Section>
            <Section title="Firmas">
              {([[row.evaluator, 'Evaluador', a.evaluator_signed_at], [row.evaluated, 'Evaluado', a.evaluated_signed_at]] as const).map(([p, role, at]) => (
                <div key={role} className="flex items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5">
                  <div className="min-w-0 flex-1"><p className="truncate text-[13px] font-semibold text-slate-900">{p.nombre}</p><p className="truncate text-xs text-slate-500">{role}, {p.cargo}</p></div>
                  {at ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Firmó</span>
                    : <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Pendiente</span>}
                </div>
              ))}
            </Section>
          </fieldset>
          </div>

          {!readOnly && (
            <div className="grid gap-2 rounded-b-lg border-t border-slate-200 bg-white px-5 py-3">
              <div className="h-1 overflow-hidden rounded bg-slate-200" aria-hidden><i className="block h-full origin-left bg-blue-700 transition-[width] duration-300" style={{ width: `${Math.round((done / TOTAL_CHECKS) * 100)}%` }} /></div>
              <p className={`flex items-start gap-2 text-[12.5px] ${miss.length ? 'text-slate-500' : 'text-emerald-700'}`}>
                {miss.length ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <span>{miss.length ? <><b className="font-semibold text-slate-700">Falta:</b> {miss.slice(0, 3).join(', ')}{miss.length > 3 ? ` y ${miss.length - 3} más` : ''}.</> : 'Acta completa y lista para firmar.'}</span>
              </p>
              <button className="ui-btn-primary justify-center" disabled={(miss.length > 0 && !locked) || save === 'saving' || save === 'error'} onClick={() => setSigning(true)}>
                {full ? <BadgeCheck className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
                {full ? 'Ver constancia' : locked ? 'Continuar firma' : 'Firmar acta'}
              </button>
            </div>
          )}
        </aside>

        <div className={`acta-desk rounded-lg border border-slate-200 bg-slate-200/70 ${pane === 'form' ? 'hidden lg:block' : ''}`}>
          <ActaPaper acta={a} evaluator={row.evaluator} evaluated={row.evaluated} onField={disabled ? undefined : jump} />
        </div>
      </div>

      {signing && (
        <SignDialog
          acta={a} evaluator={row.evaluator} evaluated={row.evaluated} currentUserId={currentUserId}
          onClose={() => setSigning(false)} onActa={refreshFromServer}
        />
      )}
    </div>
  );
}

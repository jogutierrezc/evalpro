import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Api, Boot, SAMPLE_VARS, Template, renderTemplate } from './api';
import { ErrorNote, Pill, Tabs, useReveal } from './parts';

interface Draft { name: string; subject: string; html: string }
type Confirm = null | 'reset' | 'delete' | { switchTo: string };

export default function PlantillasTab({ api }: { api: Api; boot?: Boot }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string>('');
  const [draft, setDraft] = useState<Draft>({ name: '', subject: '', html: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(user?.email || '');
  const [testState, setTestState] = useState<{ busy: boolean; msg?: string; err?: string }>({ busy: false });
  const area = useRef<HTMLTextAreaElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const current = templates.find((t) => t.key === key);
  const dirty = !!current && (draft.subject !== current.subject || draft.html !== current.html || draft.name !== current.name);
  const isCustom = key.startsWith('custom_');
  const modifiedFromDefault = !!current && (current.subject !== current.default_subject || current.html !== current.default_html);

  const load = useCallback(async (select?: string) => {
    try {
      const r = await api<{ templates: Template[] }>('templates_list');
      setTemplates(r.templates);
      const k = select && r.templates.some((t) => t.key === select) ? select : r.templates[0]?.key ?? '';
      const t = r.templates.find((x) => x.key === k);
      setKey(k);
      if (t) setDraft({ name: t.name, subject: t.subject, html: t.html });
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useReveal(root, [loading]);

  const select = (k: string, force = false) => {
    if (k === key) return;
    if (dirty && !force) { setConfirm({ switchTo: k }); return; }
    const t = templates.find((x) => x.key === k);
    if (!t) return;
    setKey(k); setDraft({ name: t.name, subject: t.subject, html: t.html }); setConfirm(null); setSaved(false); setError(null); setTestState({ busy: false });
  };

  async function save(): Promise<boolean> {
    setSaving(true); setError(null); setSaved(false);
    try {
      await api('template_save', { key, name: isCustom ? draft.name : undefined, subject: draft.subject, html: draft.html });
      setTemplates((ts) => ts.map((t) => (t.key === key ? { ...t, name: isCustom ? draft.name : t.name, subject: draft.subject, html: draft.html } : t)));
      setSaved(true);
      return true;
    } catch (e: any) { setError(e.message); return false; } finally { setSaving(false); }
  }

  async function act(fn: () => Promise<unknown>, after?: () => Promise<void> | void) {
    setError(null);
    try { await fn(); await after?.(); } catch (e: any) { setError(e.message); }
  }

  const insertVar = (name: string) => {
    const el = area.current;
    const tag = `{{${name}}}`;
    if (!el) { setDraft((d) => ({ ...d, html: d.html + tag })); return; }
    const a = el.selectionStart, b = el.selectionEnd;
    const next = draft.html.slice(0, a) + tag + draft.html.slice(b);
    setDraft((d) => ({ ...d, html: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); });
  };

  const unknown = useMemo(() => {
    const known = new Set((current?.variables ?? []).map((v) => v.name));
    const found = new Set<string>();
    for (const m of `${draft.subject} ${draft.html}`.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)) if (!known.has(m[1])) found.add(m[1]);
    return Array.from(found);
  }, [draft.subject, draft.html, current]);

  const preview = useMemo(() => renderTemplate(draft.html, SAMPLE_VARS), [draft.html]);
  const previewSubject = useMemo(() => renderTemplate(draft.subject, SAMPLE_VARS, false), [draft.subject]);

  async function sendTest() {
    setTestState({ busy: true });
    try {
      await api('send_test', { templateKey: key, subject: draft.subject, html: draft.html, to: testTo, message: SAMPLE_VARS.mensaje });
      setTestState({ busy: false, msg: `Prueba enviada a ${testTo}. Revisa su bandeja en unos segundos.` });
    } catch (e: any) { setTestState({ busy: false, err: e.message }); }
  }

  if (loading) return <div className="h-96 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div ref={root} className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside data-reveal className="grid gap-2">
        <ul className="ui-card divide-y divide-slate-100 overflow-hidden" aria-label="Plantillas">
          {templates.map((t) => (
            <li key={t.key}>
              <button type="button" onClick={() => select(t.key)} aria-current={t.key === key}
                className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors ${t.key === key ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <span className={`text-sm ${t.key === key ? 'font-semibold text-blue-800' : 'font-medium text-slate-900'}`}>{t.name}</span>
                <span className="line-clamp-2 text-xs text-slate-500">{t.description}</span>
              </button>
            </li>
          ))}
        </ul>
        {newName === null ? (
          <button type="button" className="ui-btn-secondary justify-center border-dashed !text-blue-700" onClick={() => setNewName('')}><Plus className="h-4 w-4" />Nueva plantilla</button>
        ) : (
          <form className="ui-card grid gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) act(async () => { const r = await api<{ key: string }>('template_create', { name: newName, fromKey: key }); setNewName(null); await load(r.key); }); }}>
            <label htmlFor="tpl-new" className="text-xs font-medium text-slate-700">Nombre (se copia de la plantilla abierta)</label>
            <input id="tpl-new" autoFocus className="ui-input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} />
            <div className="flex gap-2"><button className="ui-btn-primary !py-1.5" disabled={!newName.trim()}>Crear</button><button type="button" className="ui-btn-secondary !py-1.5" onClick={() => setNewName(null)}>Cancelar</button></div>
          </form>
        )}
      </aside>

      {current && (
        <section className="grid min-w-0 gap-4" aria-label={`Editar ${current.name}`}>
          <div data-reveal className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-60">
              {isCustom ? (
                <><label htmlFor="tpl-name" className="sr-only">Nombre de la plantilla</label><input id="tpl-name" className="ui-input !text-base !font-semibold" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} /></>
              ) : <h2 className="text-lg font-semibold tracking-tight text-slate-900">{current.name}</h2>}
            </div>
            {dirty ? <Pill tone="amber">Cambios sin guardar</Pill> : saved ? <Pill tone="green" icon={Check}>Guardada</Pill> : modifiedFromDefault ? <Pill tone="blue">Personalizada</Pill> : <Pill>Original</Pill>}
            <button type="button" className="ui-btn-primary" onClick={save} disabled={!dirty || saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Guardar</button>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}
          {typeof confirm === 'object' && confirm && (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <span className="flex-1">Hay cambios sin guardar en esta plantilla.</span>
              <button className="ui-btn-primary !py-1" onClick={async () => { if (await save()) select(confirm.switchTo, true); }}>Guardar y cambiar</button>
              <button className="ui-btn-secondary !py-1" onClick={() => select(confirm.switchTo, true)}>Descartar</button>
              <button className="ui-btn-secondary !py-1" onClick={() => setConfirm(null)}>Seguir editando</button>
            </div>
          )}
          {key === 'otp_firma' && <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">Esta plantilla también es la de los códigos de firma de las actas. Debe conservar la variable <code className="font-mono text-[13px]">{'{{codigo}}'}</code>.</p>}

          <div className="grid items-start gap-4 xl:grid-cols-2">
            <div data-reveal className="grid min-w-0 gap-3">
              <div className="grid gap-1.5">
                <label htmlFor="tpl-subject" className="text-[13px] font-medium text-slate-700">Asunto</label>
                <input id="tpl-subject" className="ui-input" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} maxLength={200} />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between"><label htmlFor="tpl-html" className="text-[13px] font-medium text-slate-700">HTML del correo</label><span className="text-xs tabular-nums text-slate-500">{draft.html.length.toLocaleString('es-CO')} caracteres</span></div>
                <textarea id="tpl-html" ref={area} spellCheck={false} wrap="off" value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })}
                  className="ui-input h-[420px] resize-y overflow-auto whitespace-pre font-mono !text-[12.5px] leading-relaxed" />
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Variables (clic para insertar donde está el cursor)</p>
                <div className="flex flex-wrap gap-1.5">
                  {current.variables.map((v) => (
                    <button key={v.name} type="button" title={v.desc} onClick={() => insertVar(v.name)} className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-800">{`{{${v.name}}}`}</button>
                  ))}
                </div>
                {unknown.length > 0 && <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Variable desconocida, se enviará vacía: {unknown.map((u) => `{{${u}}}`).join(', ')}</p>}
                <p className="mt-2 text-xs text-slate-500">La imagen de apertura y el conteo de clics se agregan solos al enviar; no hace falta incluirlos.</p>
              </div>
            </div>

            <div data-reveal className="grid min-w-0 gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-slate-700">Vista previa con datos de ejemplo</p>
                <Tabs label="Ancho de la vista previa" value={device} onChange={setDevice} items={[['desktop', 'Escritorio'], ['mobile', 'Móvil']]} />
              </div>
              <p className="truncate rounded-md bg-slate-100 px-3 py-1.5 text-sm text-slate-700"><span className="text-slate-500">Asunto: </span>{previewSubject}</p>
              <div className="overflow-auto rounded-md border border-slate-200 bg-[#f5f6f8] p-2">
                <iframe title="Vista previa del correo" sandbox="" srcDoc={preview} className="mx-auto h-[520px] w-full rounded bg-white transition-[max-width] duration-200" style={{ maxWidth: device === 'mobile' ? 375 : 720 }} />
              </div>
              <div className="grid gap-2 rounded-md border border-slate-200 p-3">
                <label htmlFor="tpl-test" className="text-[13px] font-medium text-slate-700">Enviar una prueba</label>
                <div className="flex flex-wrap gap-2">
                  <input id="tpl-test" type="email" className="ui-input min-w-[200px] flex-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="correo registrado en EvalPro" />
                  <button type="button" className="ui-btn-secondary" onClick={sendTest} disabled={testState.busy || !testTo}>{testState.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar prueba</button>
                </div>
                {testState.msg && <p role="status" className="text-sm text-emerald-700">{testState.msg}</p>}
                {testState.err && <ErrorNote>{testState.err}</ErrorNote>}
                <p className="text-xs text-slate-500">Se envía lo que ves en pantalla, aunque no esté guardado. Solo a correos registrados en EvalPro.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {confirm === 'reset' ? (
                  <span className="flex items-center gap-2 text-sm">Se perderá tu versión.
                    <button className="ui-btn-primary !py-1" onClick={() => act(async () => { await api('template_reset', { key }); }, async () => { setConfirm(null); await load(key); })}>Sí, restablecer</button>
                    <button className="ui-btn-secondary !py-1" onClick={() => setConfirm(null)}>Cancelar</button></span>
                ) : <button type="button" className="ui-btn-secondary" onClick={() => setConfirm('reset')} disabled={!modifiedFromDefault && !dirty}><RotateCcw className="h-4 w-4" />Restablecer original</button>}
                {isCustom && (confirm === 'delete' ? (
                  <span className="flex items-center gap-2 text-sm">¿Eliminar esta plantilla?
                    <button className="rounded-md bg-red-700 px-3 py-1 text-sm font-medium text-white hover:bg-red-800" onClick={() => act(async () => { await api('template_delete', { key }); }, async () => { setConfirm(null); await load(); })}>Eliminar</button>
                    <button className="ui-btn-secondary !py-1" onClick={() => setConfirm(null)}>Cancelar</button></span>
                ) : <button type="button" className="ui-btn-secondary !text-red-700" onClick={() => setConfirm('delete')}><Trash2 className="h-4 w-4" />Eliminar</button>)}
                <button type="button" className="ui-btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(draft.html); } catch { /* sin permiso */ } }}><Copy className="h-4 w-4" />Copiar HTML</button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

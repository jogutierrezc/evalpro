import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Loader2, PauseCircle, PlayCircle, Plus, Send, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Api, Boot, Campaign, SAMPLE_VARS, Template, renderTemplate } from './api';
import { Bar, Empty, ErrorNote, StatusPill, Tabs, fmtDT, pct, plural, useReveal } from './parts';
import type { Runner } from './useCampaignRunner';

type Audience = { periodId: string; scope: 'asignadas' | 'pendientes' | 'todos'; campus: string; role: string; officeId: string };
interface Preview { count: number; conPendientes: number; evaluaciones: number; sample: { nombre: string; correo: string; oficina: string; total: number; pendientes: number }[]; byCampus: [string, number][] }

const SCOPE_LABEL: Record<Audience['scope'], string> = { asignadas: 'Con evaluaciones asignadas', pendientes: 'Con evaluaciones pendientes', todos: 'Toda la comunidad' };

export default function EnviosTab({ api, boot, runner }: { api: Api; boot: Boot; runner: Runner }) {
  const [view, setView] = useState<'list' | 'new'>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setCampaigns((await api<{ campaigns: Campaign[] }>('campaigns_list')).campaigns); setError(null); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [api]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!campaigns.some((c) => c.status === 'sending')) return; const t = window.setInterval(load, 6000); return () => window.clearInterval(t); }, [campaigns, load]);
  useReveal(root, [loading, view]);

  if (view === 'new') return <NuevoEnvio api={api} boot={boot} runner={runner} onBack={() => { setView('list'); load(); }} />;

  const run = runner.run;
  const driving = (c: Campaign) => run?.id === c.id && run.status === 'sending';

  return (
    <div ref={root} className="grid gap-5">
      <div data-reveal className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">Avisos y recordatorios a las personas registradas en EvalPro. Cada correo queda en la bitácora con su estado, aperturas y clics.</p>
        <button className="ui-btn-primary" onClick={() => setView('new')} disabled={!boot.mail.configured}><Plus className="h-4 w-4" />Nuevo envío</button>
      </div>
      {!boot.mail.configured && <ErrorNote>El servidor de correo no está configurado: faltan las variables SMTP del servicio. Los envíos están deshabilitados.</ErrorNote>}
      {error && <ErrorNote>{error}</ErrorNote>}

      {run && run.status !== 'done' && (
        <section data-reveal aria-label="Envío en curso" className="ui-card grid gap-3 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-slate-900">{run.name}</h2>
            <StatusPill status={run.status === 'error' ? 'failed' : run.status} />
            <span className="ml-auto text-sm tabular-nums text-slate-600">{run.sent.toLocaleString('es-CO')} de {run.total.toLocaleString('es-CO')} enviados{run.failed ? `, ${run.failed} fallidos` : ''}</span>
          </div>
          <Bar value={run.sent + run.failed} total={run.total} label="Avance del envío" />
          {run.status === 'sending' && <p className="text-xs text-slate-500">Mantén esta pestaña abierta: el envío avanza por lotes para respetar el límite de {boot.limits.per_minute} correos por minuto.</p>}
          {run.note && <p className="text-sm text-amber-800">{run.note}</p>}
        </section>
      )}

      {loading ? <div className="h-40 animate-pulse rounded-lg bg-slate-100" /> : campaigns.length === 0 ? (
        <Empty title="Todavía no hay envíos">Crea el primero con una plantilla y una audiencia. Antes de enviar a todos puedes mandarte una prueba.</Empty>
      ) : (
        <div data-reveal className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">Envío</th><th className="px-3 py-2.5">Estado</th><th className="w-48 px-3 py-2.5">Progreso</th>
                <th className="px-3 py-2.5 text-right">Abiertos</th><th className="px-3 py-2.5 text-right">Clics</th><th className="px-3 py-2.5">Creado</th><th className="px-4 py-2.5"><span className="sr-only">Acciones</span></th>
              </tr></thead>
              <tbody>
                {campaigns.map((c) => {
                  const done = c.stats.sent + c.stats.failed;
                  return (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{c.name}</p><p className="max-w-[320px] truncate text-xs text-slate-500">{c.subject}</p></td>
                      <td className="px-3 py-3"><StatusPill status={driving(c) ? 'sending' : c.status === 'sending' ? 'paused' : c.status} />{c.status === 'sending' && !driving(c) && <p className="mt-1 text-xs text-amber-800">Detenido: reanúdalo</p>}</td>
                      <td className="px-3 py-3"><Bar value={done} total={c.total} tone={c.stats.failed ? 'amber' : 'blue'} label={`Progreso de ${c.name}`} /><p className="mt-1 text-xs tabular-nums text-slate-500">{done.toLocaleString('es-CO')} de {c.total.toLocaleString('es-CO')}{c.stats.failed ? `, ${c.stats.failed} fallidos` : ''}</p></td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-900">{c.stats.opened.toLocaleString('es-CO')}<span className="block text-xs text-slate-500">{pct(c.stats.opened, c.stats.sent)}</span></td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-900">{c.stats.clicked.toLocaleString('es-CO')}<span className="block text-xs text-slate-500">{pct(c.stats.clicked, c.stats.sent)}</span></td>
                      <td className="px-3 py-3 text-xs tabular-nums text-slate-500">{fmtDT(c.created_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">
                          {driving(c) && <button className="ui-btn-secondary !py-1.5" onClick={() => runner.pause(c.id)}><PauseCircle className="h-4 w-4" />Pausar</button>}
                          {!driving(c) && ['sending', 'paused'].includes(c.status) && <button className="ui-btn-primary !py-1.5" disabled={runner.running} onClick={() => runner.resume({ id: c.id, name: c.name, total: c.total, sent: c.stats.sent + c.stats.failed })}><PlayCircle className="h-4 w-4" />Reanudar</button>}
                          {['sending', 'paused'].includes(c.status) && <button className="ui-btn-secondary !py-1.5 !text-red-700" aria-label={`Cancelar ${c.name}`} onClick={() => runner.cancel(c.id)}><XCircle className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- asistente de nuevo envío ---------- */

function NuevoEnvio({ api, boot, runner, onBack }: { api: Api; boot: Boot; runner: Runner; onBack: () => void }) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [aud, setAud] = useState<Audience>({ periodId: boot.periods.find((p) => p.is_active)?.id || boot.periods[0]?.id || '', scope: 'asignadas', campus: '', role: '', officeId: '' });
  const [perMinute, setPerMinute] = useState(boot.limits.per_minute);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [prevBusy, setPrevBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [testTo, setTestTo] = useState(user?.email || '');
  const [test, setTest] = useState<{ busy: boolean; ok?: string; err?: string }>({ busy: false });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ templates: Template[] }>('templates_list').then((r) => {
      setTemplates(r.templates);
      const t = r.templates.find((x) => x.key === 'evaluaciones_disponibles') ?? r.templates[0];
      if (t) { setTemplateKey(t.key); setSubject(t.subject); }
    }).catch((e) => setError(e.message));
  }, [api]);
  useReveal(root, [templates.length > 0]);

  const tpl = templates.find((t) => t.key === templateKey);
  const usesMessage = !!tpl && /\{\{\s*mensaje\s*\}\}/i.test(tpl.html);
  const needsPeriod = aud.scope !== 'todos';
  const period = boot.periods.find((p) => p.id === aud.periodId);

  // La audiencia se recalcula al cambiar los filtros (con espera de 350 ms).
  useEffect(() => {
    if (needsPeriod && !aud.periodId) { setPrev(null); return; }
    setPrevBusy(true);
    const t = window.setTimeout(() => {
      api<Preview>('audience_preview', { audience: { ...aud, officeId: aud.officeId || null, periodId: needsPeriod ? aud.periodId : null } })
        .then((r) => { setPrev(r); setError(null); }).catch((e) => setError(e.message)).finally(() => setPrevBusy(false));
    }, 350);
    return () => window.clearTimeout(t);
  }, [api, aud, needsPeriod]);

  const vars = useMemo(() => {
    const s = prev?.sample[0];
    return {
      ...SAMPLE_VARS,
      ...(s ? { nombre: s.nombre, correo: s.correo, oficina: s.oficina, total: String(s.total), pendientes: String(s.pendientes), evaluaciones_texto: s.total === 1 ? 'evaluación' : 'evaluaciones' } : {}),
      periodo: period ? `periodo ${period.year}` : 'periodo vigente',
      fecha_limite: period ? new Date(`${period.end_date}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '',
      mensaje: message || SAMPLE_VARS.mensaje,
    };
  }, [prev, period, message]);

  const html = useMemo(() => (tpl ? renderTemplate(tpl.html, vars) : ''), [tpl, vars]);
  const count = prev?.count ?? 0;
  const minutes = Math.max(1, Math.ceil(count / perMinute));
  const overCap = boot.sentToday + count > boot.limits.daily_cap;
  const ready = !!tpl && !!name.trim() && count > 0 && !prevBusy;

  async function sendTest() {
    setTest({ busy: true });
    try { await api('send_test', { templateKey, subject, html: tpl?.html, to: testTo, message: vars.mensaje }); setTest({ busy: false, ok: `Prueba enviada a ${testTo}.` }); }
    catch (e: any) { setTest({ busy: false, err: e.message }); }
  }

  async function create() {
    setCreating(true); setError(null);
    try {
      const c = await api<{ id: string; total: number }>('campaign_create', { name, templateKey, subject, message, perMinute, audience: { ...aud, officeId: aud.officeId || null, periodId: needsPeriod ? aud.periodId : null } });
      await api('campaign_start', { id: c.id });
      onBack();
      runner.start({ id: c.id, name, total: c.total });
    } catch (e: any) { setError(e.message); setCreating(false); setConfirming(false); }
  }

  const set = <K extends keyof Audience>(k: K, v: Audience[K]) => { setAud((a) => ({ ...a, [k]: v })); setConfirming(false); };

  return (
    <div ref={root} className="grid gap-5">
      <div data-reveal><button className="ui-btn-secondary !py-1.5" onClick={onBack}><ArrowLeft className="h-4 w-4" />Envíos</button></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
        <div className="grid gap-6">
          <section data-reveal className="grid gap-3.5" aria-labelledby="env-1">
            <h2 id="env-1" className="text-sm font-semibold text-slate-900">Mensaje</h2>
            <div className="grid gap-1.5"><label htmlFor="env-name" className="text-[13px] font-medium text-slate-700">Nombre del envío (solo lo ve el administrador)</label>
              <input id="env-name" className="ui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Apertura de evaluaciones 2026" maxLength={120} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5"><label htmlFor="env-tpl" className="text-[13px] font-medium text-slate-700">Plantilla</label>
                <select id="env-tpl" className="ui-input" value={templateKey} onChange={(e) => { const t = templates.find((x) => x.key === e.target.value); setTemplateKey(e.target.value); if (t) setSubject(t.subject); }}>
                  {templates.filter((t) => t.key !== 'otp_firma' && t.key !== 'firma_invitacion').map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
                </select></div>
              <div className="grid gap-1.5"><label htmlFor="env-sub" className="text-[13px] font-medium text-slate-700">Asunto</label>
                <input id="env-sub" className="ui-input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} /></div>
            </div>
            {usesMessage && <div className="grid gap-1.5"><label htmlFor="env-msg" className="text-[13px] font-medium text-slate-700">Texto del aviso</label>
              <textarea id="env-msg" rows={5} className="ui-input resize-y" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} /></div>}
            <p className="text-xs text-slate-500">Cada persona recibe su nombre, su periodo y el número de evaluaciones que le corresponden. La plantilla se edita en la pestaña Plantillas.</p>
          </section>

          <section data-reveal className="grid gap-3.5" aria-labelledby="env-2">
            <h2 id="env-2" className="text-sm font-semibold text-slate-900">Destinatarios</h2>
            <Tabs label="Alcance" value={aud.scope} onChange={(v) => set('scope', v)} items={(Object.keys(SCOPE_LABEL) as Audience['scope'][]).map((k) => [k, SCOPE_LABEL[k]])} />
            <div className="grid gap-3 sm:grid-cols-2">
              {needsPeriod && <div className="grid gap-1.5"><label htmlFor="env-per" className="text-[13px] font-medium text-slate-700">Periodo</label>
                <select id="env-per" className="ui-input" value={aud.periodId} onChange={(e) => set('periodId', e.target.value)}>{boot.periods.map((p) => <option key={p.id} value={p.id}>Periodo {p.year}{p.is_active ? ' (vigente)' : ''}</option>)}</select></div>}
              <div className="grid gap-1.5"><label htmlFor="env-campus" className="text-[13px] font-medium text-slate-700">Sede</label>
                <select id="env-campus" className="ui-input" value={aud.campus} onChange={(e) => set('campus', e.target.value)}><option value="">Todas</option>{boot.campuses.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="grid gap-1.5"><label htmlFor="env-off" className="text-[13px] font-medium text-slate-700">Oficina</label>
                <select id="env-off" className="ui-input" value={aud.officeId} onChange={(e) => set('officeId', e.target.value)}><option value="">Todas</option>{boot.offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
              <div className="grid gap-1.5"><label htmlFor="env-role" className="text-[13px] font-medium text-slate-700">Cargo o rol</label>
                <select id="env-role" className="ui-input" value={aud.role} onChange={(e) => set('role', e.target.value)}><option value="">Todos</option>{boot.roles.map((r) => <option key={r}>{r}</option>)}</select></div>
            </div>
            <div className="rounded-md border border-slate-200 p-3" aria-live="polite">
              {prevBusy && !prev ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Calculando destinatarios</p> : prev ? (
                <div className="grid gap-2">
                  <p className="text-sm text-slate-700"><b className="text-lg tabular-nums text-slate-900">{prev.count.toLocaleString('es-CO')}</b> {prev.count === 1 ? 'persona recibirá' : 'personas recibirán'} este correo{prevBusy ? '…' : ''}</p>
                  {prev.count > 0 && <p className="text-xs tabular-nums text-slate-500">{plural(prev.evaluaciones, 'evaluación asignada', 'evaluaciones asignadas')}, {prev.conPendientes.toLocaleString('es-CO')} con pendientes. {prev.byCampus.slice(0, 4).map(([c, n]) => `${c}: ${n}`).join(' · ')}</p>}
                  {prev.sample.length > 0 && <p className="truncate text-xs text-slate-500">Ejemplo: {prev.sample.slice(0, 3).map((s) => s.nombre).join(', ')}…</p>}
                </div>
              ) : <p className="text-sm text-slate-500">Elige un periodo para calcular los destinatarios.</p>}
            </div>
          </section>

          <section data-reveal className="grid gap-2.5" aria-labelledby="env-3">
            <h2 id="env-3" className="text-sm font-semibold text-slate-900">Ritmo de envío</h2>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="env-rate" className="text-[13px] text-slate-700">Correos por minuto</label>
              <input id="env-rate" type="number" min={1} max={30} className="ui-input !w-24 tabular-nums" value={perMinute} onChange={(e) => setPerMinute(Math.min(30, Math.max(1, Number(e.target.value) || 1)))} />
              <span className="text-xs text-slate-500">Microsoft 365 permite 30 por minuto por buzón y el buzón se comparte con otras aplicaciones.</span>
            </div>
          </section>
        </div>

        <aside data-reveal className="grid gap-4 lg:sticky lg:top-2">
          <div className="overflow-hidden rounded-md border border-slate-200 bg-[#f5f6f8] p-2">
            <iframe title="Vista previa del correo" sandbox="" srcDoc={html} className="h-[420px] w-full rounded bg-white" />
          </div>
          <div className="ui-card grid gap-3 p-4">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-xs text-slate-500">Destinatarios</dt><dd className="font-semibold tabular-nums text-slate-900">{count.toLocaleString('es-CO')}</dd></div>
              <div><dt className="text-xs text-slate-500">Duración</dt><dd className="font-semibold tabular-nums text-slate-900">{count ? `${minutes} min` : '-'}</dd></div>
              <div><dt className="text-xs text-slate-500">Enviados hoy</dt><dd className="font-semibold tabular-nums text-slate-900">{boot.sentToday} / {boot.limits.daily_cap}</dd></div>
            </dl>
            {overCap && <p className="text-xs text-amber-800">Con este envío se pasaría el límite diario. El envío se pausará al alcanzarlo.</p>}
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="grid gap-1.5 border-t border-slate-200 pt-3">
              <label htmlFor="env-test" className="text-[13px] font-medium text-slate-700">Probar con un solo correo</label>
              <div className="flex gap-2"><input id="env-test" type="email" className="ui-input min-w-0 flex-1" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
                <button className="ui-btn-secondary" onClick={sendTest} disabled={test.busy || !testTo || !tpl}>{test.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Probar</button></div>
              {test.ok && <p role="status" className="text-xs text-emerald-700">{test.ok}</p>}{test.err && <p role="alert" className="text-xs text-red-700">{test.err}</p>}
            </div>
            {!confirming ? (
              <button className="ui-btn-primary justify-center" disabled={!ready} onClick={() => setConfirming(true)}>Revisar y enviar</button>
            ) : (
              <div className="grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">Se enviarán <b>{count.toLocaleString('es-CO')}</b> correos reales. Esta acción no se puede deshacer, aunque sí puedes pausar o cancelar lo que falte.</p>
                <div className="flex gap-2"><button className="ui-btn-primary" onClick={create} disabled={creating}>{creating && <Loader2 className="h-4 w-4 animate-spin" />}Sí, enviar ahora</button><button className="ui-btn-secondary" onClick={() => setConfirming(false)}>Volver</button></div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

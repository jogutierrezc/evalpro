import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, ChevronDown, FileDown, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import { Api, MailEvent } from './api';
import { Empty, ErrorNote, Pill, Timeline, fmtDT, useReveal } from './parts';

interface Cert { id: string; number: string; version: number; status: 'vigente' | 'revocado'; generated_at: string }
interface Person { nombre?: string; email?: string; cargo?: string; signedAt: string | null }
interface Row {
  id: string; numero: string; oficina: string; fecha: string | null; contentHash: string | null; evaluador: Person; evaluado: Person;
  counts: Record<string, number>; lastAt: string; certificates: Cert[];
}
interface Detail {
  acta: { evaluatorSignId: string | null; evaluatedSignId: string | null; contentHash: string | null };
  events: (MailEvent & { label: string; actor: string })[];
  mails: { id: string; role: string; to_email: string; status: string; sent_at: string | null; first_open_at: string | null; open_count: number }[];
}

const n = (r: Row, role: string, type: string) => r.counts[`${role}:${type}`] ?? 0;

export default function FirmasTab({ api }: { api: Api }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try { setRows((await api<{ rows: Row[] }>('otp_trace_list')).rows); setError(null); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useReveal(root, [loading]);

  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetail(null);
    try { setDetail(await api<Detail>('otp_trace_detail', { actaId: id })); } catch (e: any) { setError(e.message); }
  }

  async function generate(r: Row) {
    setBusy(r.id); setError(null);
    try {
      const out = await api<{ url: string | null }>('cert_generate', { actaId: r.id });
      await load();
      if (out.url) window.open(out.url, '_blank', 'noopener');
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function download(c: Cert) {
    setBusy(c.id); setError(null);
    try { const out = await api<{ url: string }>('cert_download', { id: c.id }); window.open(out.url, '_blank', 'noopener'); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(revoking.id); setError(null);
    try { await api('cert_revoke', revoking); setRevoking(null); await load(); }
    catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  if (loading) return <div className="h-64 animate-pulse rounded-lg bg-slate-100" />;

  return (
    <div ref={root} className="grid gap-5">
      <p data-reveal className="max-w-3xl text-sm text-slate-600">Trazabilidad de cada firma con código OTP: apertura del portal, envío y apertura del correo, intentos, verificación y firma, con IP y dispositivo. Cuando las dos personas firman, aquí se emite el certificado en PDF, con QR de verificación y huella de integridad.</p>
      {error && <ErrorNote>{error}</ErrorNote>}
      {rows.length === 0 ? <Empty title="Aún no hay firmas ni códigos registrados">Aparecerán aquí cuando se pida el primer código OTP de un acta. Los códigos pedidos antes de aplicar este módulo no tienen trazabilidad.</Empty> : (
        <div data-reveal className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">Acta</th><th className="px-3 py-2.5">Persona evaluadora</th><th className="px-3 py-2.5">Persona evaluada</th><th className="px-3 py-2.5">Trazabilidad</th><th className="px-3 py-2.5">Certificado</th><th className="w-8 px-3 py-2.5"><span className="sr-only">Detalle</span></th>
              </tr></thead>
              <tbody>
                {rows.map((r) => {
                  const both = !!r.evaluador.signedAt && !!r.evaluado.signedAt;
                  const cert = r.certificates.find((c) => c.status === 'vigente') ?? r.certificates[0];
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/70 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => toggle(r.id)}>
                        <td className="px-4 py-3"><p className="font-medium tabular-nums text-slate-900">{r.numero || 'Sin número'}</p><p className="max-w-[200px] truncate text-xs text-slate-500">{r.oficina}</p></td>
                        <td className="px-3 py-3"><Signer p={r.evaluador} /></td>
                        <td className="px-3 py-3"><Signer p={r.evaluado} /></td>
                        <td className="px-3 py-3 text-xs tabular-nums text-slate-600">
                          <p>QR abierto: <b className="text-slate-900">{n(r, 'evaluado', 'portal_open')}</b></p>
                          <p>Códigos enviados: <b className="text-slate-900">{n(r, 'evaluador', 'otp_sent') + n(r, 'evaluado', 'otp_sent')}</b>, correos abiertos: <b className="text-slate-900">{n(r, 'evaluador', 'open') + n(r, 'evaluado', 'open')}</b></p>
                          {(n(r, 'evaluador', 'otp_failed') + n(r, 'evaluado', 'otp_failed')) > 0 && <p className="text-amber-800">Intentos fallidos: {n(r, 'evaluador', 'otp_failed') + n(r, 'evaluado', 'otp_failed')}</p>}
                        </td>
                        <td className="px-3 py-3">{cert ? <div className="grid gap-1"><span className="font-medium tabular-nums text-slate-900">{cert.number}{cert.version > 1 ? ` v${cert.version}` : ''}</span>{cert.status === 'vigente' ? <Pill tone="green" icon={ShieldCheck}>Vigente</Pill> : <Pill tone="red" icon={ShieldX}>Revocado</Pill>}</div> : <span className="text-xs text-slate-400">{both ? 'Sin emitir' : 'Falta una firma'}</span>}</td>
                        <td className="px-3 py-3 text-slate-400"><ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/60"><td colSpan={6} className="animate-in px-5 py-5">
                          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                            <div>
                              <h3 className="mb-3 text-sm font-semibold text-slate-900">Trazabilidad cronológica</h3>
                              {!detail ? <div className="h-24 animate-pulse rounded bg-slate-100" /> : <Timeline events={detail.events.map((e) => ({ id: e.id, label: e.label, at: e.at, ip: e.ip, ua: e.user_agent, actor: e.actor }))} />}
                            </div>
                            <div className="grid content-start gap-5">
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-slate-900">Correos con el código</h3>
                                {!detail ? null : detail.mails.length === 0 ? <p className="text-sm text-slate-500">No hay correos registrados.</p> : (
                                  <ul className="grid gap-1.5 text-sm">{detail.mails.map((m) => (
                                    <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                      <span className="font-medium text-slate-900">{m.role === 'evaluador' ? 'Evaluadora' : 'Evaluada'}</span><span className="text-slate-600">{m.to_email}</span>
                                      <span className="text-xs tabular-nums text-slate-500">{m.status === 'sent' ? `enviado ${fmtDT(m.sent_at)}` : m.status}{m.open_count ? `, abierto ${m.open_count} ${m.open_count === 1 ? 'vez' : 'veces'}` : ', sin abrir'}</span>
                                    </li>))}</ul>
                                )}
                              </div>
                              {r.contentHash && <div><h3 className="mb-1 text-sm font-semibold text-slate-900">Huella SHA-256 del acta</h3><p className="break-all font-mono text-xs text-slate-600">{r.contentHash}</p></div>}
                              <div>
                                <h3 className="mb-2 text-sm font-semibold text-slate-900">Certificado de firma OTP (PDF)</h3>
                                {r.certificates.length > 0 && (
                                  <ul className="mb-3 divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">{r.certificates.map((c) => (
                                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                                      <span className="font-medium tabular-nums text-slate-900">{c.number}{c.version > 1 ? ` v${c.version}` : ''}</span>
                                      {c.status === 'vigente' ? <Pill tone="green">Vigente</Pill> : <Pill tone="red">Revocado</Pill>}
                                      <span className="text-xs tabular-nums text-slate-500">{fmtDT(c.generated_at)}</span>
                                      <span className="ml-auto flex gap-1.5">
                                        <button className="ui-btn-secondary !py-1" onClick={() => download(c)} disabled={busy === c.id}>{busy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}PDF</button>
                                        {c.status === 'vigente' && <button className="ui-btn-secondary !py-1 !text-red-700" onClick={() => setRevoking({ id: c.id, reason: '' })}>Revocar</button>}
                                      </span>
                                    </li>))}</ul>
                                )}
                                {revoking && r.certificates.some((c) => c.id === revoking.id) && (
                                  <form className="mb-3 grid gap-2 rounded-md border border-red-200 bg-red-50 p-3" onSubmit={(e) => { e.preventDefault(); revoke(); }}>
                                    <label htmlFor="rev-reason" className="text-[13px] font-medium text-red-900">Motivo de la revocación (queda en la trazabilidad)</label>
                                    <input id="rev-reason" autoFocus className="ui-input" value={revoking.reason} onChange={(e) => setRevoking({ ...revoking, reason: e.target.value })} maxLength={300} />
                                    <div className="flex gap-2"><button className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50" disabled={revoking.reason.trim().length < 8 || busy === revoking.id}>Revocar certificado</button><button type="button" className="ui-btn-secondary !py-1.5" onClick={() => setRevoking(null)}>Cancelar</button></div>
                                  </form>
                                )}
                                <button className="ui-btn-primary" onClick={() => generate(r)} disabled={!both || busy === r.id}>
                                  {busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}{r.certificates.length ? 'Emitir una nueva versión' : 'Generar certificado'}
                                </button>
                                {!both && <p className="mt-1.5 text-xs text-slate-500">Se emite cuando las dos personas hayan firmado.</p>}
                              </div>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
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

function Signer({ p }: { p: Person }) {
  return (
    <div className="min-w-0">
      <p className="max-w-[200px] truncate font-medium text-slate-900">{p.nombre || 'Sin nombre'}</p>
      {p.signedAt ? <p className="flex items-center gap-1 text-xs tabular-nums text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Firmó {fmtDT(p.signedAt)}</p> : <p className="text-xs text-slate-400">Pendiente de firma</p>}
    </div>
  );
}

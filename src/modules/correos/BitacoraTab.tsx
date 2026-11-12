import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, FileSpreadsheet, Loader2, Search } from 'lucide-react';
import { Api, Campaign, LogRow, MailEvent } from './api';
import { Empty, ErrorNote, EVENT_LABEL, Pill, Stat, StatusPill, Timeline, fmtDT, pct, useReveal } from './parts';

interface Filters { q: string; kind: string; status: string; opened: string; campaignId: string; from: string; to: string }
interface Summary { total: number; sent: number; failed: number; queued: number; opened: number; clicked: number }
const EMPTY: Filters = { q: '', kind: '', status: '', opened: '', campaignId: '', from: '', to: '' };
const KIND: Record<string, string> = { campaign: 'Envío masivo', otp: 'Código OTP', test: 'Prueba' };
const PAGE = 25;

export default function BitacoraTab({ api }: { api: Api }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [sum, setSum] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ events: MailEvent[]; row: any } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [exporting, setExporting] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // La búsqueda de texto espera 350 ms después de la última tecla.
  useEffect(() => { const t = window.setTimeout(() => { setF((x) => (x.q === q ? x : { ...x, q })); setPage(0); }, 350); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { api<{ campaigns: Campaign[] }>('campaigns_list').then((r) => setCampaigns(r.campaigns)).catch(() => undefined); }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ rows: LogRow[]; total: number; summary: Summary }>('log_list', { filters: f, page, pageSize: PAGE });
      setRows(r.rows); setTotal(r.total); setSum(r.summary); setError(null);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [api, f, page]);
  useEffect(() => { load(); }, [load]);
  useReveal(root, [loading && rows.length === 0]);

  async function toggle(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setDetail(null);
    try { setDetail(await api('log_detail', { id })); } catch (e: any) { setError(e.message); }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const out: string[][] = [['Fecha', 'Tipo', 'Destinatario', 'Correo', 'Asunto', 'Estado', 'Enviado', 'Primera apertura', 'Aperturas', 'Clics', 'Error']];
      for (let p = 0; p < 50; p++) {
        const r = await api<{ rows: LogRow[]; total: number }>('log_list', { filters: f, page: p, pageSize: 100 });
        r.rows.forEach((x) => out.push([fmtDT(x.queued_at), KIND[x.kind] ?? x.kind, x.to_name, x.to_email, x.subject, x.status, fmtDT(x.sent_at), fmtDT(x.first_open_at), String(x.open_count), String(x.click_count), x.error ?? '']));
        if ((p + 1) * 100 >= r.total) break;
      }
      const csv = '﻿' + out.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `bitacora_correos_${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) { setError(e.message); } finally { setExporting(false); }
  }

  const set = (k: keyof Filters, v: string) => { setF((x) => ({ ...x, [k]: v })); setPage(0); };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div ref={root} className="grid gap-5">
      <dl data-reveal className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-slate-200 pb-5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Correos" value={(sum?.total ?? 0).toLocaleString('es-CO')} />
        <Stat label="Enviados" value={(sum?.sent ?? 0).toLocaleString('es-CO')} />
        <Stat label="Fallidos" value={(sum?.failed ?? 0).toLocaleString('es-CO')} />
        <Stat label="En cola" value={(sum?.queued ?? 0).toLocaleString('es-CO')} />
        <Stat label="Abiertos" value={(sum?.opened ?? 0).toLocaleString('es-CO')} hint={pct(sum?.opened ?? 0, sum?.sent ?? 0) + ' de los enviados'} />
        <Stat label="Con clic" value={(sum?.clicked ?? 0).toLocaleString('es-CO')} hint={pct(sum?.clicked ?? 0, sum?.sent ?? 0) + ' de los enviados'} />
      </dl>

      <div data-reveal className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <label htmlFor="bit-q" className="sr-only">Buscar por destinatario o asunto</label>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input id="bit-q" type="search" className="ui-input !pl-9" placeholder="Buscar destinatario o asunto" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Sel id="bit-kind" label="Tipo" value={f.kind} onChange={(v) => set('kind', v)} options={[['', 'Todos'], ['campaign', 'Envíos masivos'], ['otp', 'Códigos OTP'], ['test', 'Pruebas']]} />
        <Sel id="bit-status" label="Estado" value={f.status} onChange={(v) => set('status', v)} options={[['', 'Todos'], ['sent', 'Enviados'], ['failed', 'Fallidos'], ['queued', 'En cola'], ['canceled', 'Cancelados']]} />
        <Sel id="bit-open" label="Apertura" value={f.opened} onChange={(v) => set('opened', v)} options={[['', 'Todas'], ['yes', 'Abiertos'], ['no', 'Sin abrir']]} />
        <Sel id="bit-camp" label="Envío" value={f.campaignId} onChange={(v) => set('campaignId', v)} options={[['', 'Todos'], ...campaigns.map((c): [string, string] => [c.id, c.name])]} />
        <div className="flex items-center gap-2"><label htmlFor="bit-from" className="text-sm text-slate-500">Desde</label><input id="bit-from" type="date" className="ui-input !w-auto tabular-nums" value={f.from} onChange={(e) => set('from', e.target.value)} /></div>
        <div className="flex items-center gap-2"><label htmlFor="bit-to" className="text-sm text-slate-500">Hasta</label><input id="bit-to" type="date" className="ui-input !w-auto tabular-nums" value={f.to} onChange={(e) => set('to', e.target.value)} /></div>
        <button className="ui-btn-secondary ml-auto" onClick={exportCsv} disabled={exporting || total === 0}>{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Exportar CSV</button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {!loading && rows.length === 0 ? <Empty title="No hay correos con esos filtros">Cuando se envíe un aviso o se pida un código de firma, aparecerá aquí.</Empty> : (
        <div data-reveal className="ui-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <th className="px-4 py-2.5">Fecha</th><th className="px-3 py-2.5">Destinatario</th><th className="px-3 py-2.5">Asunto</th><th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Estado</th><th className="px-3 py-2.5">Apertura</th><th className="px-3 py-2.5 text-right">Clics</th><th className="w-8 px-3 py-2.5"><span className="sr-only">Detalle</span></th>
              </tr></thead>
              <tbody>
                {loading && rows.length === 0 && Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={8} className="px-4 py-3"><div className="h-8 animate-pulse rounded bg-slate-100" /></td></tr>)}
                {rows.map((r) => {
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr className={`cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/70 ${isOpen ? 'bg-slate-50' : ''}`} onClick={() => toggle(r.id)}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-500">{fmtDT(r.queued_at)}</td>
                        <td className="px-3 py-2.5"><p className="max-w-[220px] truncate font-medium text-slate-900">{r.to_name || r.to_email}</p><p className="max-w-[220px] truncate text-xs text-slate-500">{r.to_email}</p></td>
                        <td className="max-w-[260px] truncate px-3 py-2.5 text-slate-700">{r.subject}</td>
                        <td className="px-3 py-2.5"><Pill>{KIND[r.kind] ?? r.kind}{r.role ? `, ${r.role === 'evaluador' ? 'evaluadora' : 'evaluada'}` : ''}</Pill></td>
                        <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums">{r.open_count > 0 ? <span className="text-emerald-700"><b>{r.open_count}</b> {r.open_count === 1 ? 'vez' : 'veces'}<span className="block text-slate-500">{fmtDT(r.first_open_at)}</span></span> : <span className="text-slate-400">{r.status === 'sent' ? 'Sin abrir' : '-'}</span>}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.click_count || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-400"><ChevronDown aria-hidden className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} /></td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-slate-100 bg-slate-50/60"><td colSpan={8} className="animate-in px-5 py-4">
                          {!detail ? <div className="h-16 animate-pulse rounded bg-slate-100" /> : (
                            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                              <dl className="grid content-start gap-1.5 text-sm">
                                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Asunto</dt><dd className="min-w-0 break-words text-slate-900">{detail.row.subject}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Plantilla</dt><dd className="text-slate-900">{detail.row.template_key || '-'}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Enviado</dt><dd className="tabular-nums text-slate-900">{fmtDT(detail.row.sent_at, true)}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Última apertura</dt><dd className="tabular-nums text-slate-900">{fmtDT(detail.row.last_open_at, true)}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">ID del mensaje</dt><dd className="min-w-0 break-all font-mono text-xs text-slate-700">{detail.row.message_id || '-'}</dd></div>
                                {detail.row.error && <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Error</dt><dd className="min-w-0 break-words text-red-700">{detail.row.error}</dd></div>}
                                <p className="pt-1 text-xs text-slate-500">Las aperturas se miden con una imagen de rastreo: algunos clientes de correo la bloquean y otros la precargan, por eso es un indicio y no una prueba de lectura.</p>
                              </dl>
                              <div><h3 className="mb-2 text-sm font-semibold text-slate-900">Eventos</h3>
                                <Timeline events={detail.events.map((e) => ({ id: e.id, label: EVENT_LABEL[e.type] ?? e.type, at: e.at, ip: e.ip, ua: e.user_agent }))} /></div>
                            </div>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
            <span className="tabular-nums">{total.toLocaleString('es-CO')} registros</span>
            <div className="flex items-center gap-2"><button className="ui-btn-secondary !py-1" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading}>Anterior</button>
              <span className="tabular-nums">Página {page + 1} de {pages}</span>
              <button className="ui-btn-secondary !py-1" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page + 1 >= pages || loading}>Siguiente</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Sel({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex items-center gap-2"><label htmlFor={id} className="text-sm text-slate-500">{label}</label>
      <select id={id} className="ui-input !w-auto max-w-[200px]" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
  );
}

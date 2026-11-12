import { useRef, useState } from 'react';
import { Check, Loader2, Save } from 'lucide-react';
import { Api, Boot } from './api';
import { ErrorNote, Pill, useReveal } from './parts';

export default function AjustesTab({ api, boot, onSaved }: { api: Api; boot: Boot; onSaved: () => void }) {
  const [perMinute, setPerMinute] = useState(boot.limits.per_minute);
  const [dailyCap, setDailyCap] = useState(boot.limits.daily_cap);
  const [legal, setLegal] = useState(boot.legalText);
  const [busy, setBusy] = useState<'limits' | 'legal' | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, []);

  async function save(kind: 'limits' | 'legal') {
    setBusy(kind); setError(null); setSaved(null);
    try {
      await api('settings_save', kind === 'limits' ? { limits: { per_minute: perMinute, daily_cap: dailyCap } } : { legalText: legal });
      setSaved(kind); onSaved();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  }

  return (
    <div ref={root} className="grid max-w-3xl gap-8">
      {error && <ErrorNote>{error}</ErrorNote>}

      <section data-reveal className="grid gap-3" aria-labelledby="aj-1">
        <h2 id="aj-1" className="text-sm font-semibold text-slate-900">Servidor de correo</h2>
        <dl className="grid gap-2 rounded-md border border-slate-200 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><dt className="w-36 text-slate-500">Estado</dt><dd>{boot.mail.configured ? <Pill tone="green">Conectado</Pill> : <Pill tone="red">Sin configurar</Pill>}</dd></div>
          <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">Servidor SMTP</dt><dd className="break-all font-mono text-[13px] text-slate-900">{boot.mail.host || '-'}</dd></div>
          <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">Remitente</dt><dd className="break-all text-slate-900">{boot.mail.senderName ? `${boot.mail.senderName} <${boot.mail.from}>` : boot.mail.from || '-'}</dd></div>
          <div className="flex gap-2"><dt className="w-36 shrink-0 text-slate-500">Rastreo</dt><dd className="break-all font-mono text-xs text-slate-600">{boot.urls.tracking}</dd></div>
        </dl>
        <p className="text-xs text-slate-500">Los correos salen por Mailpit, que los reenvía por Microsoft 365 con el buzón del remitente. Ese buzón lo comparten otras aplicaciones: un envío muy grande puede retrasar sus correos.</p>
      </section>

      <section data-reveal className="grid gap-3" aria-labelledby="aj-2">
        <h2 id="aj-2" className="text-sm font-semibold text-slate-900">Límites de envío</h2>
        <div className="flex flex-wrap items-end gap-4">
          <div className="grid gap-1.5"><label htmlFor="aj-pm" className="text-[13px] font-medium text-slate-700">Correos por minuto (máx. 30)</label>
            <input id="aj-pm" type="number" min={1} max={30} className="ui-input !w-32 tabular-nums" value={perMinute} onChange={(e) => setPerMinute(Number(e.target.value))} /></div>
          <div className="grid gap-1.5"><label htmlFor="aj-dc" className="text-[13px] font-medium text-slate-700">Tope diario de envíos masivos</label>
            <input id="aj-dc" type="number" min={10} max={9000} className="ui-input !w-32 tabular-nums" value={dailyCap} onChange={(e) => setDailyCap(Number(e.target.value))} /></div>
          <button className="ui-btn-primary" onClick={() => save('limits')} disabled={busy !== null}>{busy === 'limits' ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === 'limits' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}Guardar límites</button>
        </div>
        <p className="text-xs text-slate-500">Microsoft 365 admite 30 mensajes por minuto y 10.000 por día por buzón. El tope diario protege a las demás aplicaciones que usan el mismo buzón.</p>
      </section>

      <section data-reveal className="grid gap-3" aria-labelledby="aj-3">
        <h2 id="aj-3" className="text-sm font-semibold text-slate-900">Fundamento legal del certificado de firma</h2>
        <label htmlFor="aj-legal" className="sr-only">Texto del fundamento legal</label>
        <textarea id="aj-legal" rows={10} className="ui-input resize-y leading-relaxed" value={legal} onChange={(e) => setLegal(e.target.value)} maxLength={4000} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="ui-btn-primary" onClick={() => save('legal')} disabled={busy !== null || legal.trim().length < 40}>{busy === 'legal' ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === 'legal' ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}Guardar texto</button>
          <span className="text-xs tabular-nums text-slate-500">{legal.length} / 4000</span>
        </div>
        <p className="text-xs text-slate-500">Este texto aparece en la sección 6 de cada certificado nuevo. Es un texto de apoyo: la oficina jurídica debe revisarlo antes de usarlo como soporte probatorio. Los certificados ya emitidos no cambian.</p>
      </section>
    </div>
  );
}

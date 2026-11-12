import { useEffect, useRef, useState } from 'react';
import { AlertCircle, BadgeCheck, FileCheck2, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { verifyCertificate } from './api';
import { fmtDT } from './parts';

interface Result {
  valid: boolean; status: 'vigente' | 'revocado'; revokedReason: string | null; number: string; version: number; generatedAt: string;
  acta: { numero: string; oficina: string }; contentHash: string | null; pdfSha256: string; signers: { rol: string; nombre: string; firmadoEn: string | null; firmaId: string | null }[];
}

const sha256 = async (buf: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf))).map((b) => b.toString(16).padStart(2, '0')).join('');

/** Página pública (sin sesión) para comprobar un certificado de firma por su código, y opcionalmente el PDF recibido. */
export default function VerificarCertificado() {
  const initial = new URLSearchParams(window.location.search).get('c') || '';
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<{ name: string; ok: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  async function verify(c = code) {
    setBusy(true); setError(null); setRes(null); setFile(null);
    try { setRes(await verifyCertificate(c)); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  useEffect(() => { if (initial) verify(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function checkFile(f: File | undefined) {
    if (!f || !res) return;
    setFile({ name: f.name, ok: (await sha256(await f.arrayBuffer())) === res.pdfSha256 });
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] px-4 py-6">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-700 text-xs text-white">E</span> Evalpro
        </div>
        <div ref={box} className="ui-card grid gap-4 p-5">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900">Verificar certificado de firma</h1>
            <p className="mt-1 text-sm text-slate-500">Escribe el código que aparece en el certificado (o escanea su código QR) para confirmar que existe y su estado.</p>
          </div>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); verify(); }}>
            <label htmlFor="ver-code" className="sr-only">Código de verificación</label>
            <input id="ver-code" className="ui-input font-mono uppercase tracking-wider" placeholder="XXXX-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} autoComplete="off" />
            <button className="ui-btn-primary" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 12}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}</button>
          </form>

          {error && <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

          {res && (
            <div className="grid gap-4">
              <div className={`flex items-center gap-3 rounded-md border px-3 py-3 ${res.valid ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
                {res.valid ? <ShieldCheck className="h-6 w-6 shrink-0" /> : <ShieldAlert className="h-6 w-6 shrink-0" />}
                <div><p className="font-semibold">{res.valid ? 'Certificado vigente' : 'Certificado revocado'}</p><p className="text-sm">{res.number}{res.version > 1 ? ` (versión ${res.version})` : ''}, expedido el {fmtDT(res.generatedAt)}</p></div>
              </div>
              {!res.valid && res.revokedReason && <p className="text-sm text-slate-700"><b>Motivo:</b> {res.revokedReason}</p>}
              <dl className="grid gap-1.5 text-sm">
                <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Acta</dt><dd className="text-slate-900">No. {res.acta.numero}, {res.acta.oficina}</dd></div>
                {res.signers.map((s) => (
                  <div key={s.rol} className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">{s.rol === 'evaluador' ? 'Evaluadora' : 'Evaluada'}</dt>
                    <dd className="text-slate-900">{s.nombre}<span className="flex items-center gap-1 text-xs tabular-nums text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />Firmó {fmtDT(s.firmadoEn)}{s.firmaId ? `, transacción ${s.firmaId}` : ''}</span></dd></div>
                ))}
                {res.contentHash && <div className="flex gap-2"><dt className="w-28 shrink-0 text-slate-500">Huella del acta</dt><dd className="break-all font-mono text-xs text-slate-600">{res.contentHash}</dd></div>}
              </dl>
              <div className="grid gap-2 border-t border-slate-200 pt-4">
                <label htmlFor="ver-file" className="text-[13px] font-medium text-slate-700">Comprobar el archivo PDF que recibiste (opcional)</label>
                <input id="ver-file" type="file" accept="application/pdf,.pdf" onChange={(e) => checkFile(e.target.files?.[0])}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
                <p className="text-xs text-slate-500">El archivo se analiza en tu navegador y no se sube a ningún servidor.</p>
                {file && (file.ok
                  ? <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700"><FileCheck2 className="h-4 w-4" />El archivo coincide con el certificado: no fue alterado.</p>
                  : <p role="alert" className="flex items-start gap-2 text-sm font-medium text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />El archivo NO coincide con el certificado original. No lo tomes como válido.</p>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

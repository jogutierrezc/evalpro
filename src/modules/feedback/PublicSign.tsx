import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { AlertCircle, BadgeCheck, Loader2, Mail } from 'lucide-react';
import { OtpInput } from './SignDialog';
import { callOtp, fechaLarga, hora12, sello } from './types';

interface PublicActa {
  numero: string; fecha: string | null; lugar: string; hora_inicio: string | null; hora_fin: string | null; objetivo: string;
  compromisos: { id: string; act: string; resp: string; fecha: string }[];
  evaluatorName: string; evaluatedName: string; emailMask: string | null;
  evaluatedSigned: boolean; evaluatedSignedAt: string | null; evaluatorSigned: boolean;
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Página pública (sin sesión) a la que llega la persona evaluada al escanear el QR. Pensada para el celular. */
export default function PublicSign() {
  const token = new URLSearchParams(window.location.search).get('t') || '';
  const [acta, setActa] = useState<PublicActa | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [step, setStep] = useState<'intro' | 'code' | 'done'>('intro');
  const [to, setTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [signedAt, setSignedAt] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setLoadErr('El enlace de firma no es válido.'); return; }
      const r = await callOtp<PublicActa>({ action: 'public_get', token });
      if (!alive) return;
      if (r.error || !r.data) { setLoadErr(r.error || 'No se pudo abrir el acta.'); return; }
      setActa(r.data);
      if (r.data.evaluatedSigned) { setSignedAt(r.data.evaluatedSignedAt); setStep('done'); }
    })();
    return () => { alive = false; };
  }, [token]);

  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, []);

  useEffect(() => {
    if (!box.current || reduced()) return;
    gsap.fromTo(box.current, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.24, ease: 'power3.out', clearProps: 'transform,opacity' });
    const safety = window.setTimeout(() => gsap.set(box.current, { clearProps: 'transform,opacity' }), 1200);
    return () => window.clearTimeout(safety);
  }, [step, acta !== null]);

  const left = step === 'code' ? Math.max(0, 300 - Math.floor((now - sentAt) / 1000)) : 0;
  const cooldown = step === 'code' ? Math.max(0, 30 - Math.floor((now - sentAt) / 1000)) : 0;
  const expired = step === 'code' && left === 0;

  const send = async () => {
    setBusy('send'); setErr(null); setCode(''); setLocked(false);
    const r = await callOtp<{ to: string; devCode?: string }>({ action: 'send', token });
    setBusy(null);
    if (r.error || !r.data) { setErr(r.error || 'No se pudo enviar el código.'); return; }
    setTo(r.data.to); setDevCode(r.data.devCode || null); setSentAt(Date.now()); setNow(Date.now()); setStep('code');
  };
  const verify = async (c: string) => {
    if (c.length !== 6) return;
    setBusy('verify'); setErr(null);
    const r = await callOtp<{ signedAt: string }>({ action: 'verify', token, code: c });
    setBusy(null);
    if (r.error || !r.data) {
      setErr(r.error || 'No se pudo verificar el código.'); setCode('');
      if (r.extra?.locked || r.extra?.expired) setLocked(true);
      if (!reduced()) gsap.fromTo('[data-otp]', { x: 0 }, { keyframes: { x: [-7, 6, -4, 3, 0] }, duration: 0.32, ease: 'power2.out' });
      return;
    }
    setSignedAt(r.data.signedAt); setStep('done');
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold tracking-tight text-slate-900">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-700 text-xs text-white">E</span> Evalpro
        </div>

        <div ref={box} className="ui-card p-5">
          {loadErr && (
            <div role="alert" className="flex items-start gap-2 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{loadErr}</div>
          )}
          {!loadErr && !acta && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}

          {acta && step !== 'done' && (
            <div className="grid gap-4">
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-slate-900">Acta de retroalimentación {acta.numero}</h1>
                <p className="mt-1 text-sm text-slate-500">Hola {acta.evaluatedName.split(' ')[0]}, revisa el resumen y firma con un código que enviaremos a tu correo.</p>
              </div>
              <dl className="grid gap-1.5 rounded-md border border-slate-200 bg-slate-50 p-3 text-[13px]">
                <div className="flex gap-2"><dt className="font-semibold text-slate-900">Evaluador:</dt><dd className="text-slate-700">{acta.evaluatorName}</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-slate-900">Fecha:</dt><dd className="text-slate-700">{fechaLarga(acta.fecha)}, {hora12(acta.hora_inicio)} a {hora12(acta.hora_fin)}</dd></div>
                <div className="flex gap-2"><dt className="font-semibold text-slate-900">Lugar:</dt><dd className="text-slate-700">{acta.lugar}</dd></div>
              </dl>
              <div>
                <h2 className="text-[13px] font-semibold text-slate-900">Objetivo</h2>
                <p className="mt-1 text-justify text-[13px] leading-relaxed text-slate-700 [hyphens:auto]">{acta.objetivo}</p>
              </div>
              {acta.compromisos.length > 0 && (
                <div>
                  <h2 className="text-[13px] font-semibold text-slate-900">Compromisos ({acta.compromisos.length})</h2>
                  <ol className="mt-1 grid gap-1.5 text-[13px] text-slate-700">
                    {acta.compromisos.map((c, i) => <li key={c.id} className="flex gap-2"><span className="tabular-nums text-slate-400">{i + 1}.</span><span className="text-justify [hyphens:auto]">{c.act} <span className="text-slate-500">({c.resp}, {c.fecha.split('-').reverse().join('/')})</span></span></li>)}
                  </ol>
                </div>
              )}

              {step === 'intro' ? (
                <div className="grid gap-2">
                  <p className="text-sm text-slate-600">Al confirmar, enviaremos un código de 6 dígitos a <b className="text-slate-900">{acta.emailMask || 'tu correo institucional'}</b>. Con ese código quedará firmada el acta.</p>
                  <button onClick={send} disabled={busy === 'send'} className="ui-btn-primary justify-center !py-2.5">{busy === 'send' ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando código</> : <><Mail className="h-4 w-4" />Confirmar y recibir código</>}</button>
                  {err && <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
                </div>
              ) : (
                <div className="grid gap-3">
                  <p className="flex items-center justify-between text-sm text-slate-600"><span>Código enviado a <b className="text-slate-900">{to}</b></span><span className={`font-mono text-xs tabular-nums ${expired ? 'text-red-700' : 'text-slate-500'}`}>{expired ? 'Venció' : `Vence en ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</span></p>
                  {devCode && <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">Modo de pruebas, código: <code className="font-mono text-sm tracking-widest text-slate-900">{devCode}</code></p>}
                  <div data-otp><OtpInput label="Código de la persona evaluada" value={code} onChange={setCode} onComplete={verify} disabled={busy === 'verify' || expired || locked} invalid={!!err} /></div>
                  {err && <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
                  <button onClick={() => verify(code)} disabled={code.length < 6 || busy === 'verify' || expired || locked} className="ui-btn-primary justify-center !py-2.5">{busy === 'verify' ? <><Loader2 className="h-4 w-4 animate-spin" />Verificando</> : 'Firmar acta'}</button>
                  <button onClick={send} disabled={cooldown > 0 || busy === 'send'} className="ui-btn-secondary justify-center">{cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar código'}</button>
                </div>
              )}
            </div>
          )}

          {acta && step === 'done' && (
            <div className="grid justify-items-center gap-2 py-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><BadgeCheck className="h-7 w-7" /></span>
              <h1 className="text-lg font-semibold text-slate-900">Acta firmada</h1>
              <p className="text-sm text-slate-600">Tu firma quedó registrada{signedAt ? ` el ${sello(signedAt)}` : ''}. Ya puedes cerrar esta página.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

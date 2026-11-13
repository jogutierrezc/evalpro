import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import qrcode from 'qrcode-generator';
import { AlertCircle, BadgeCheck, Check, Copy, Loader2, Mail, Send, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ActaRow, Person, callOtp, publicSignUrl, sello } from './types';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Seis casillas para el código: avance automático, borrar retrocede y pegar reparte los dígitos. */
export function OtpInput({ value, onChange, onComplete, disabled, invalid, label }: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; disabled?: boolean; invalid?: boolean; label: string }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(6, ' ').split('');
  const set = (next: string) => { onChange(next); if (next.length === 6) onComplete?.(next); };
  return (
    <div className="grid grid-cols-6 gap-2" role="group" aria-label={label}>
      {digits.map((d, i) => (
        <input
          key={i} ref={(el) => { refs.current[i] = el; }} disabled={disabled} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={1}
          value={d.trim()} aria-label={`Dígito ${i + 1}`} aria-invalid={invalid || undefined}
          onChange={(e) => {
            const ch = e.target.value.replace(/\D/g, '').slice(-1);
            set(ch ? (value.slice(0, i) + ch + value.slice(i + 1)).slice(0, 6) : value.slice(0, i) + value.slice(i + 1));
            if (ch && refs.current[i + 1]) refs.current[i + 1]!.focus();
          }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !d.trim() && refs.current[i - 1]) refs.current[i - 1]!.focus(); }}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!t) return; e.preventDefault(); set(t); refs.current[Math.min(t.length, 5)]?.focus();
          }}
          className={`h-12 w-full rounded-md border bg-white text-center font-mono text-xl font-medium text-slate-900 transition-colors focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-50 ${invalid ? 'border-red-500' : 'border-slate-300'}`}
        />
      ))}
    </div>
  );
}

interface Props {
  acta: ActaRow;
  evaluator: Person;
  evaluated: Person;
  currentUserId: string;
  onClose: () => void;
  onActa: (patch: Partial<ActaRow>) => void;
}

export function SignDialog({ acta, evaluator, evaluated, currentUserId, onClose, onActa }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [masks, setMasks] = useState<{ evaluator: string | null; evaluated: string | null }>({ evaluator: null, evaluated: null });
  const [prepErr, setPrepErr] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'sent'>('idle');
  const [sentAt, setSentAt] = useState(0);
  const [to, setTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<{ sent: boolean; to?: string | null; reason?: string } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const actaRef = useRef(acta); actaRef.current = acta;

  const evalSigned = !!acta.evaluator_signed_at;
  const guestSigned = !!acta.evaluated_signed_at;
  const both = evalSigned && guestSigned;
  const link = token ? publicSignUrl(token) : '';

  // Token del QR: lo crea el servidor y solo si el acta está completa.
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await callOtp<{ token: string; evaluatorEmail: string | null; evaluatedEmail: string | null }>({ action: 'prepare', actaId: acta.id, userId: currentUserId });
      if (!alive) return;
      if (r.error || !r.data) { setPrepErr(r.error || 'No se pudo preparar la firma.'); return; }
      setToken(r.data.token); setMasks({ evaluator: r.data.evaluatorEmail, evaluated: r.data.evaluatedEmail });
    })();
    return () => { alive = false; };
  }, [acta.id, currentUserId]);

  // Revisa cada 3 s si la otra persona ya firmó desde su móvil.
  useEffect(() => {
    const id = window.setInterval(async () => {
      const { data } = await supabase.from('feedback_actas').select('evaluator_signed_at, evaluator_sign_id, evaluated_signed_at, evaluated_sign_id, content_hash').eq('id', acta.id).maybeSingle();
      const cur = actaRef.current;
      if (data && (data.evaluated_signed_at !== cur.evaluated_signed_at || data.evaluator_signed_at !== cur.evaluator_signed_at)) onActa(data as Partial<ActaRow>);
    }, 3000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(id); window.clearInterval(tick); };
  }, [acta.id, onActa]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  useLayoutEffect(() => {
    if (!panel.current || reduced()) return;
    gsap.fromTo(panel.current, { opacity: 0, y: 12, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform,opacity' });
    const safety = window.setTimeout(() => gsap.set(panel.current, { clearProps: 'transform,opacity' }), 1200);
    return () => window.clearTimeout(safety);
  }, []);

  const qr = useMemo(() => {
    if (!link) return '';
    const q = qrcode(0, 'M'); q.addData(link); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [link]);

  const left = phase === 'sent' ? Math.max(0, 300 - Math.floor((now - sentAt) / 1000)) : 0;
  const cooldown = phase === 'sent' ? Math.max(0, 30 - Math.floor((now - sentAt) / 1000)) : 0;
  const expired = phase === 'sent' && left === 0;

  const send = useCallback(async () => {
    setBusy('send'); setErr(null); setCode(''); setLocked(false);
    const r = await callOtp<{ to: string; devCode?: string }>({ action: 'send', actaId: acta.id, userId: currentUserId });
    setBusy(null);
    if (r.error || !r.data) { setErr(r.error || 'No se pudo enviar el código.'); return; }
    setTo(r.data.to); setDevCode(r.data.devCode || null); setSentAt(Date.now()); setNow(Date.now()); setPhase('sent');
  }, [acta.id, currentUserId]);

  const verify = useCallback(async (c: string) => {
    if (c.length !== 6) return;
    setBusy('verify'); setErr(null);
    const r = await callOtp<{ signedAt: string; signId: string; finished: boolean; hash: string; invitation?: { sent: boolean; to?: string | null; reason?: string } }>({ action: 'verify', actaId: acta.id, userId: currentUserId, code: c });
    setBusy(null);
    if (r.error || !r.data) {
      setErr(r.error || 'No se pudo verificar el código.'); setCode('');
      if (r.extra?.locked || r.extra?.expired) setLocked(true);
      if (panel.current && !reduced()) gsap.fromTo('[data-otp]', { x: 0 }, { keyframes: { x: [-7, 6, -4, 3, 0] }, duration: 0.32, ease: 'power2.out' });
      return;
    }
    onActa({ evaluator_signed_at: r.data.signedAt, evaluator_sign_id: r.data.signId, content_hash: r.data.hash });
    setPhase('idle'); setDevCode(null); setInvite(r.data.invitation ?? null);
  }, [acta.id, currentUserId, onActa]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* sin permiso */ }
  };

  const steps = [
    { label: 'Acta lista', done: true },
    { label: `Firma de ${evaluator.nombre.split(' ')[0]}`, done: evalSigned },
    { label: `Firma de ${evaluated.nombre.split(' ')[0]}`, done: guestSigned },
  ];
  const currentStep = !evalSigned ? 1 : !guestSigned ? 2 : 3;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="sign-title" className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 px-5 py-4">
          <h2 id="sign-title" className="text-[17px] font-semibold tracking-tight text-slate-900">Firmar acta {acta.numero}</h2>
          <ol className="flex flex-wrap items-center gap-1.5 text-xs">
            {steps.map((s, i) => (
              <li key={i} className={`inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 ${s.done ? 'border-transparent bg-emerald-50 font-semibold text-emerald-700' : i === currentStep ? 'border-blue-700 bg-blue-50 font-semibold text-blue-800' : 'border-slate-200 text-slate-500'}`}>
                {s.done && <Check className="h-3 w-3" />}{s.label}
              </li>
            ))}
          </ol>
          <button onClick={onClose} aria-label="Cerrar" className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        {prepErr ? (
          <div className="p-6"><div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{prepErr}</div></div>
        ) : (
          <div className="grid md:grid-cols-2">
            {/* Evaluador */}
            <div className="grid content-start gap-3.5 p-5">
              <h3 className="flex items-center justify-between text-sm font-semibold text-slate-900">Tu firma
                {phase === 'sent' && !evalSigned && <span className={`font-mono text-xs tabular-nums ${expired ? 'text-red-700' : 'text-slate-500'}`}>{expired ? 'Venció' : `Vence en ${mmss(left)}`}</span>}
              </h3>
              {evalSigned ? (
                <div className="grid gap-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-emerald-700"><BadgeCheck className="h-4 w-4" />Firmaste el {sello(acta.evaluator_signed_at!)}</p>
                  <p className="text-xs text-slate-500">Código verificado. Transacción {acta.evaluator_sign_id}.</p>
                </div>
              ) : phase === 'idle' ? (
                <>
                  <p className="text-sm text-slate-600">Enviaremos un código de 6 dígitos a <b className="text-slate-900">{masks.evaluator || 'tu correo registrado'}</b>.</p>
                  <button onClick={send} disabled={!token || busy === 'send'} className="ui-btn-primary justify-center">
                    {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Enviar código
                  </button>
                  <p className="text-xs text-slate-500">Con tu firma el acta queda bloqueada y no se puede editar.</p>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm text-slate-600"><Mail className="h-4 w-4 shrink-0 text-slate-400" />Código enviado a <b className="text-slate-900">{to}</b></p>
                  {devCode && <p className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500">Modo de pruebas, código: <code className="font-mono text-sm tracking-widest text-slate-900">{devCode}</code></p>}
                  <div data-otp><OtpInput label="Código de la persona evaluadora" value={code} onChange={setCode} onComplete={verify} disabled={busy === 'verify' || expired || locked} invalid={!!err} /></div>
                  {err && <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
                  {expired && !err && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700">El código venció. Pide uno nuevo.</p>}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => verify(code)} disabled={code.length < 6 || busy === 'verify' || expired || locked} className="ui-btn-primary">{busy === 'verify' ? <><Loader2 className="h-4 w-4 animate-spin" />Verificando</> : 'Verificar y firmar'}</button>
                    <button onClick={send} disabled={cooldown > 0 || busy === 'send'} className="ui-btn-secondary">{cooldown > 0 ? `Reenviar en ${cooldown} s` : 'Reenviar código'}</button>
                  </div>
                </>
              )}
              {!evalSigned && phase === 'idle' && err && <p role="alert" className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{err}</p>}
            </div>

            {/* Evaluado por QR */}
            <div className="grid content-start gap-3.5 border-t border-slate-200 p-5 md:border-l md:border-t-0">
              <h3 className="text-sm font-semibold text-slate-900">Firma de {evaluated.nombre.split(' ')[0]}</h3>
              <p className="text-sm text-slate-600">Muestra este QR a {evaluated.nombre.split(' ')[0]}. Al abrirlo en su celular recibe su propio código OTP en <b className="text-slate-900">{masks.evaluated || 'su correo'}</b> y firma desde allí. Cuando firmes, también le llegará por correo el enlace con su código.</p>
              <div className={`mx-auto grid w-fit place-items-center rounded-lg border border-slate-300 bg-white p-3.5 transition-[opacity,filter] duration-300 ${guestSigned ? 'opacity-35 blur-[1.5px]' : ''}`}>
                {qr ? <div className="h-44 w-44 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} aria-label="Código QR para firmar" role="img" /> : <div className="grid h-44 w-44 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>}
              </div>
              {invite && (invite.sent
                ? <p role="status" className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800"><Mail className="mt-0.5 h-4 w-4 shrink-0" />Enviamos a <b>{invite.to || 'su correo'}</b> el enlace de firma y su código OTP.</p>
                : !guestSigned && <p role="alert" className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />No se pudo enviar el correo: {invite.reason || 'intenta de nuevo.'} Usa el QR o copia el enlace.</p>)}
              {link && <p className="break-all text-center font-mono text-[11.5px] text-slate-500">{link.replace(/^https?:\/\//, '')}</p>}
              <p className={`flex items-center gap-2 text-sm font-medium ${guestSigned ? 'text-emerald-700' : 'text-slate-700'}`} aria-live="polite">
                {guestSigned ? <><BadgeCheck className="h-4 w-4" />Firmó el {sello(acta.evaluated_signed_at!)}</> : <><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />Esperando la firma</>}
              </p>
              <button onClick={copyLink} disabled={!link} className="ui-btn-secondary w-fit !py-1.5">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copiado' : 'Copiar enlace'}</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3.5">
          {both
            ? <><span className="flex items-center gap-2 text-sm font-medium text-emerald-700"><BadgeCheck className="h-4 w-4" />Las dos firmas están registradas</span><button onClick={onClose} className="ui-btn-primary ml-auto">Ver acta firmada</button></>
            : <><span className="text-xs text-slate-500">Códigos de un solo uso: vencen a los 5 minutos y se bloquean tras 3 intentos fallidos.</span><button onClick={onClose} className="ui-btn-secondary ml-auto">Cerrar</button></>}
        </div>
      </div>
    </div>
  );
}

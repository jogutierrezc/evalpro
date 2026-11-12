import { useCallback, useEffect, useRef, useState } from 'react';
import type { Api } from './api';

export interface RunState {
  id: string;
  name: string;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  status: 'sending' | 'paused' | 'done' | 'canceled' | 'error';
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Orquesta un envío masivo desde el navegador, por lotes. La función del servidor envía cada lote y dice cuánto
 * esperar para no pasar el límite por minuto del buzón. Si se cierra la pestaña, el envío queda en pausa lógica
 * (los pendientes siguen en cola) y se continúa con "Reanudar".
 */
export function useCampaignRunner(api: Api, onChange: () => void) {
  const [run, setRun] = useState<RunState | null>(null);
  const stop = useRef(false);
  const active = useRef(false);

  const start = useCallback(async (c: { id: string; name: string; total: number; sent?: number }) => {
    if (active.current) return;
    active.current = true;
    stop.current = false;
    setRun({ id: c.id, name: c.name, total: c.total, sent: c.sent ?? 0, failed: 0, remaining: c.total - (c.sent ?? 0), status: 'sending' });
    try {
      let empty = 0;
      while (!stop.current) {
        const r = await api<{ status: string; reason?: string; sent: number; failed: number; remaining: number; waitMs: number; dailyCap?: number }>('campaign_send_batch', { id: c.id, size: 10 });
        const note = r.reason === 'cap' ? `Se alcanzó el límite diario de ${r.dailyCap} correos. Continúa mañana o súbelo en Ajustes.`
          : r.reason === 'smtp' ? 'El servidor de correo falló varias veces seguidas. Revisa Mailpit y reanuda.' : undefined;
        setRun((p) => p && { ...p, sent: p.sent + r.sent, failed: p.failed + r.failed, remaining: r.remaining, status: r.status === 'sending' ? 'sending' : (r.status as RunState['status']), note });
        onChange();
        if (r.status !== 'sending') break;
        empty = r.sent + r.failed === 0 ? empty + 1 : 0;
        if (empty >= 3) {
          setRun((p) => p && { ...p, status: 'paused', note: 'El envío no avanza. Pulsa Reanudar para volver a intentarlo.' });
          break;
        }
        await sleep(Math.max(r.waitMs, 1200));
      }
    } catch (e: any) {
      setRun((p) => p && { ...p, status: 'error', note: e?.message || 'Se interrumpió el envío.' });
    } finally {
      active.current = false;
      onChange();
    }
  }, [api, onChange]);

  const pause = useCallback(async (id: string) => {
    stop.current = true;
    try { await api('campaign_pause', { id }); } catch { /* el ciclo ya se detuvo */ }
    setRun((p) => (p && p.id === id ? { ...p, status: 'paused', note: undefined } : p));
    onChange();
  }, [api, onChange]);

  const resume = useCallback(async (c: { id: string; name: string; total: number; sent?: number }) => {
    await api('campaign_resume', { id: c.id });
    await start(c);
  }, [api, start]);

  const cancel = useCallback(async (id: string) => {
    stop.current = true;
    await api('campaign_cancel', { id });
    setRun((p) => (p && p.id === id ? { ...p, status: 'canceled' } : p));
    onChange();
  }, [api, onChange]);

  useEffect(() => {
    if (run?.status !== 'sending') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run?.status]);

  return { run, start, pause, resume, cancel, running: run?.status === 'sending', dismiss: () => setRun(null) };
}

export type Runner = ReturnType<typeof useCampaignRunner>;

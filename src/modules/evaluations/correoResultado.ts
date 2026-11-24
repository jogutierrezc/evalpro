/**
 * Estado y reenvío del correo de resultados (el mismo que se envía al terminar todas las evaluaciones).
 *
 * Estado: función SQL copia_correo_estado (migración 20261124000000). Reenvío: exactamente el mismo flujo del cierre
 * (cierreCorreo.enviarCopiaSiCompleto con forzar), así que usa la misma plantilla «copia_evaluaciones» y el mismo PDF.
 */
import { supabase } from '../../lib/supabase';
import { enviarCopiaSiCompleto } from './cierreCorreo';

export type EstadoCorreo = 'sent' | 'sending' | 'failed' | 'no_enviado' | 'sin_registro' | 'pendiente' | 'sin_correo';

export interface CorreoInfo {
  user_id: string;
  email: string | null;
  estado: EstadoCorreo;
  sent_at: string | null;
  last_attempt_at: string | null;
  send_count: number;
  error: string | null;
  with_pdf: boolean;
  pendientes: number;
  completadas: number;
}

export const ESTADO_META: Record<EstadoCorreo, { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted'; hint: string }> = {
  sent: { label: 'Enviado', tone: 'ok', hint: 'El correo con los resultados se entregó al servidor de correo.' },
  sending: { label: 'Enviando', tone: 'info', hint: 'El envío está en curso.' },
  failed: { label: 'Falló', tone: 'bad', hint: 'El último intento de envío falló. Puedes reenviarlo.' },
  no_enviado: { label: 'No enviado', tone: 'warn', hint: 'Terminó todas sus evaluaciones y no hay registro de que se le enviara el correo.' },
  sin_registro: { label: 'Sin registro', tone: 'muted', hint: 'Terminó antes de que existiera el seguimiento de correos: no hay dato de si le llegó. Puedes reenviarlo.' },
  pendiente: { label: 'Con pendientes', tone: 'muted', hint: 'Aún tiene evaluaciones por completar; el correo se envía al terminar todas.' },
  sin_correo: { label: 'Sin correo', tone: 'bad', hint: 'La persona no tiene un correo real registrado. Corrígelo en Usuarios para poder enviarle.' },
};

/** Estados desde los que tiene sentido reenviar. */
export const REENVIABLES: EstadoCorreo[] = ['sent', 'failed', 'no_enviado', 'sin_registro'];
/** Estados que el lote «Reenviar pendientes» incluye por defecto (los de «sin registro» son opcionales). */
export const LOTE_BASE: EstadoCorreo[] = ['no_enviado', 'failed'];

export async function fetchEstadosCorreo(periodId: string, userIds?: string[]): Promise<Map<string, CorreoInfo>> {
  const { data, error } = await supabase.rpc('copia_correo_estado', { p_period: periodId, p_users: userIds?.length ? userIds : null });
  if (error) {
    const missing = /copia_correo_estado|PGRST202|Could not find the function/i.test(`${error.code} ${error.message}`);
    throw new Error(missing ? 'Falta aplicar la migración del seguimiento de correos en la base de datos.' : 'No se pudo consultar el estado de los correos.');
  }
  return new Map(((data as CorreoInfo[]) || []).map((r) => [r.user_id, r]));
}

export interface ReenvioResultado { ok: boolean; motivo?: string }

/** Reenvía el correo de resultados de una persona (la misma plantilla y PDF del cierre). Nunca lanza. */
export async function reenviarCorreo(userId: string, periodId: string): Promise<ReenvioResultado> {
  const r = await enviarCopiaSiCompleto(userId, { forzar: true, periodId });
  return { ok: r.enviado, motivo: r.motivo };
}

export const fechaHoraCorta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** Texto de apoyo (tooltip / detalle) del estado de una persona. */
export function detalleCorreo(i?: CorreoInfo | null): string {
  if (!i) return '';
  const m = ESTADO_META[i.estado];
  const partes = [m.hint];
  if (i.sent_at) partes.push(`Último envío: ${fechaHoraCorta(i.sent_at)}${i.send_count > 1 ? ` (${i.send_count} envíos)` : ''}.`);
  if (i.email && i.estado !== 'sin_correo') partes.push(`Destino: ${i.email}.`);
  if (i.error && i.estado !== 'sent') partes.push(`Error: ${i.error}`);
  if (i.error && i.estado === 'sent') partes.push(`El último reenvío falló: ${i.error}`);
  if (i.estado === 'pendiente') partes.push(`Pendientes: ${i.pendientes}.`);
  return partes.join(' ');
}

/**
 * Al terminar TODAS sus evaluaciones del periodo, la persona recibe un correo con la copia en PDF de su autoevaluación.
 *
 * Uso: llamar a `enviarCopiaSiCompleto(user.id)` justo después de completar una evaluación. No lanza errores y es seguro
 * llamarla las veces que haga falta (también al abrir el módulo de evaluaciones): el servidor decide si corresponde enviar
 * y guarda una reserva por persona y periodo, así que nunca se envía dos veces.
 *
 * Flujo:
 *   1. copia_estado (función `correos`, con la sesión de la persona): ¿ya no le quedan pendientes? ¿ya se le envió?
 *   2. Se piden los resultados de cada autoevaluación completada (SQL evaluacion_propia_resultados) y se arma el PDF aquí,
 *      en el navegador, con el motor de paginación de src/lib/pdf.
 *   3. copia_enviar: el servidor vuelve a comprobarlo todo, reserva el envío, adjunta el PDF y manda el correo.
 */
import { supabase } from '../../lib/supabase';
import type { PaperSpec } from '../../lib/pdf/paper';
import type { Resultados } from '../feedback/resultados';

export interface CopiaOpts {
  /** Solo administradores: reenviar aunque ya se haya enviado. */
  forzar?: boolean;
  /** Solo administradores: periodo distinto al activo. */
  periodId?: string;
  /** Tamaño de hoja del PDF (por defecto Carta). */
  paper?: PaperSpec;
  landscape?: boolean;
}

export interface CopiaResultado {
  enviado: boolean;
  motivo?: string;
}

interface Estado {
  elegible: boolean;
  motivo?: string;
  enviada?: boolean;
  periodo?: string;
  completadas?: number;
  fechaCierre?: string | null;
  persona: { id: string; nombre: string; cargo: string };
  autoevaluaciones?: { id: string; completed_at: string | null }[];
}

const BASE = import.meta.env.BASE_URL;
const enCurso = new Map<string, Promise<CopiaResultado>>();

async function invocar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('correos', { body });
  if (!error) return data as T;
  let motivo = 'No se pudo contactar el servicio de correos.';
  try {
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    const payload = ctx && typeof ctx.json === 'function' ? await ctx.json() : null;
    if (payload?.error) motivo = payload.error;
  } catch { /* se queda con el mensaje genérico */ }
  throw new Error(motivo);
}

async function cargarLogo() {
  try {
    const r = await fetch(`${BASE}brand/aluna-color.png`);
    if (!r.ok) return null;
    const blob = await r.blob();
    const data = await new Promise<string>((ok, fail) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result));
      fr.onerror = () => fail(fr.error);
      fr.readAsDataURL(blob);
    });
    const bmp = await createImageBitmap(blob);
    const ratio = bmp.width / bmp.height;
    bmp.close?.();
    return { data, ratio, format: 'PNG' as const };
  } catch {
    return null; // el PDF sale igual, solo con el nombre de la marca
  }
}

async function ejecutar(userId: string, opts: CopiaOpts): Promise<CopiaResultado> {
  const base = { userId, forzar: !!opts.forzar, ...(opts.periodId ? { periodId: opts.periodId } : {}) };

  const est = await invocar<Estado>({ action: 'copia_estado', ...base });
  if (!est.elegible) return { enviado: false, motivo: est.motivo };

  let pdf: string | null = null;
  const propias = est.autoevaluaciones ?? [];
  if (propias.length) {
    const resultados: Resultados[] = [];
    for (const a of propias) {
      const { data, error } = await supabase.rpc('evaluacion_propia_resultados', { p_evaluation: a.id });
      if (error || !data) continue;
      const r = data as Resultados;
      if (Array.isArray(r.sections) && r.sections.some((s) => s.persona != null)) resultados.push(r);
    }
    // Si había autoevaluaciones pero no se pudieron leer, no se envía un correo que diga lo contrario: se reintenta después.
    if (!resultados.length) return { enviado: false, motivo: 'No se pudieron leer los resultados para armar el PDF.' };
    resultados.sort((a, b) => String(a.completed_at ?? '').localeCompare(String(b.completed_at ?? '')));

    const [{ generarCopiaPdf }, logo] = await Promise.all([import('./copiaPdf'), cargarLogo()]);
    const out = await generarCopiaPdf({
      persona: { nombre: est.persona.nombre, cargo: est.persona.cargo },
      periodo: (est.periodo ?? 'periodo').replace(/^./, (c) => c.toUpperCase()),
      fechaCierre: est.fechaCierre ?? new Date().toISOString(),
      resultados,
      logo,
      paper: opts.paper,
      landscape: opts.landscape,
    });
    pdf = out.base64;
  }

  return invocar<CopiaResultado>({ action: 'copia_enviar', ...base, pdf });
}

/**
 * Envía la copia si la persona ya terminó todo y aún no se le envió. Nunca lanza: devuelve el motivo si no se envió.
 * Llamadas simultáneas para la misma persona comparten un único intento.
 */
export function enviarCopiaSiCompleto(userId: string, opts: CopiaOpts = {}): Promise<CopiaResultado> {
  const key = `${userId}:${opts.periodId ?? ''}`;
  const previo = enCurso.get(key);
  if (previo) return previo;
  const intento = ejecutar(userId, opts)
    .catch((e): CopiaResultado => ({ enviado: false, motivo: e instanceof Error ? e.message : 'No se pudo enviar la copia.' }))
    .finally(() => { enCurso.delete(key); });
  enCurso.set(key, intento);
  return intento;
}

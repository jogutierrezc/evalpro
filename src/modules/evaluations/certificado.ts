/**
 * Certificado de una evaluación, emitido desde Resultados y Mis autoevaluaciones.
 *
 * Es el mismo PDF que va adjunto en el correo de cierre (copiaPdf.ts): misma plantilla y motor de paginación, adaptado al
 * tipo de evaluación (autoevaluación o evaluación de otra persona), con el color distintivo del tipo.
 *   - Autoevaluación: resultados de evaluacion_propia_resultados (la propia persona o un administrador).
 *   - Evaluación a otra persona: resultados de feedback_resultados, con comparativo de equipo y UDES.
 */
import { supabase } from '../../lib/supabase';
import { applySnapshot, periodLabel } from '../../lib/evaluationSnapshot';
import { evalTypeColor, evalTypeLabel } from '../../lib/evaluationTypes';
import { loadFormTypeLabels } from '../../hooks/useFormTypes';
import type { Resultados } from '../feedback/resultados';
import { fetchResultados } from '../feedback/resultados';
import { cargarLogo } from './cierreCorreo';

const slug = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'evaluacion';
const cap = (t: string) => t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export async function generarCertificado(evaluationId: string): Promise<{ bytes: Uint8Array; nombreArchivo: string }> {
  const { data, error } = await supabase
    .from('evaluations')
    .select(`id, evaluator_id, evaluated_id, status, period_id, completed_at, created_at, evaluator_snapshot, evaluated_snapshot,
      evaluator:users!evaluator_id ( full_name, role, role_id ), evaluated:users!evaluated_id ( full_name, role, role_id ),
      template:evaluation_templates ( name, type )`)
    .eq('id', evaluationId)
    .maybeSingle();
  if (error || !data) throw new Error('No se pudo leer la evaluación.');
  const ev: any = applySnapshot(data as any);
  if (ev.status !== 'completed') throw new Error('La evaluación aún no está completada.');

  const propia = ev.evaluator_id === ev.evaluated_id;
  const typeKey: string = ev.template?.type || '';
  const [labels, perRes, rolesRes] = await Promise.all([
    loadFormTypeLabels(),
    ev.period_id ? supabase.from('evaluation_periods').select('id, name, year, start_date, end_date').eq('id', ev.period_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('roles').select('id, key, label'),
  ]);

  let res: Resultados;
  if (propia) {
    const { data: r, error: e } = await supabase.rpc('evaluacion_propia_resultados', { p_evaluation: evaluationId });
    if (e || !r) throw new Error('No se pudieron leer los resultados de esta autoevaluación.');
    res = r as Resultados;
    if (!Array.isArray(res.sections) || !res.sections.length) throw new Error('Esta autoevaluación no tiene criterios calificados.');
  } else {
    res = await fetchResultados(evaluationId);
  }

  const cargo = (u: any) => {
    const r = ((rolesRes.data as any[]) || []).find((x) => (u?.role_id && x.id === u.role_id) || x.key === u?.role);
    return String(r?.label || (u?.role ? cap(String(u.role)) : ''));
  };
  const evaluado = ev.evaluated?.full_name || 'Sin nombre';
  const evaluador = ev.evaluator?.full_name || evaluado;
  const periodo = perRes.data ? periodLabel(perRes.data as any) : 'Sin periodo';
  const tipoLabel = evalTypeLabel(typeKey, labels);
  const rol = propia ? 'propia' : 'evaluado';

  const [{ generarCertificadoPdf }, logo] = await Promise.all([import('./copiaPdf'), cargarLogo()]);
  const out = await generarCertificadoPdf({
    persona: { nombre: evaluado, cargo: cargo(ev.evaluated) },
    evaluador,
    periodo,
    fechaCierre: ev.completed_at || ev.created_at,
    resultados: [res],
    tipos: [{ key: typeKey, label: tipoLabel, color: evalTypeColor(typeKey), rol, evaluado, evaluador }],
    logo,
  });
  return { bytes: out.bytes, nombreArchivo: `Certificado_${slug(tipoLabel)}_${slug(evaluado)}.pdf` };
}

/** Genera el certificado y lo descarga. */
export async function descargarCertificado(evaluationId: string): Promise<void> {
  const { bytes, nombreArchivo } = await generarCertificado(evaluationId);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Compromiso, Person } from '../feedback/types';
import type { PlanItem, Seguimiento } from './types';

const chunk = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

interface Args {
  admin: boolean;
  userId?: string;
  periodId: string;
}

/**
 * Compromisos de actas firmadas por las dos partes, con su seguimiento vigente.
 * Quien evalúa ve los suyos; administración ve todos. Un solo periodo a la vez.
 */
export function usePlanData({ admin, userId, periodId }: Args) {
  const [items, setItems] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // silent: refresca sin mostrar el esqueleto, para no cerrar la fila que se está editando.
  const load = useCallback(async (silent = false) => {
    if (!userId || !periodId) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      let q = supabase.from('feedback_actas')
        .select('id, evaluator_id, evaluated_id, period_id, oficina, numero, compromisos')
        .eq('period_id', periodId)
        .not('evaluator_signed_at', 'is', null)
        .not('evaluated_signed_at', 'is', null);
      if (!admin) q = q.eq('evaluator_id', userId);
      const { data: actas, error: e1 } = await q;
      if (e1) throw e1;
      const list = actas || [];

      const userIds = Array.from(new Set(list.flatMap((a: any) => [a.evaluator_id, a.evaluated_id])));
      const [{ data: roles }] = await Promise.all([supabase.from('roles').select('id, key, label')]);
      const roleById: Record<string, string> = {}; const roleByKey: Record<string, string> = {};
      (roles || []).forEach((r: any) => { roleById[r.id] = r.label; roleByKey[r.key] = r.label; });

      const users: Record<string, any> = {};
      for (const ids of chunk(userIds)) {
        const { data } = await supabase.from('users').select('id, full_name, email, role, role_id, office_id').in('id', ids);
        (data || []).forEach((u: any) => { users[u.id] = u; });
      }
      const officeIds = Array.from(new Set(Object.values(users).map((u: any) => u.office_id).filter(Boolean)));
      const officeName: Record<string, string> = {};
      for (const ids of chunk(officeIds)) {
        const { data } = await supabase.from('offices').select('id, name').in('id', ids);
        (data || []).forEach((o: any) => { officeName[o.id] = o.name; });
      }

      const segs: Record<string, Seguimiento> = {};
      for (const ids of chunk(list.map((a: any) => a.id))) {
        const { data, error: e2 } = await supabase.from('plan_seguimiento').select('*').in('acta_id', ids);
        if (e2) throw e2;
        (data || []).forEach((s: any) => { segs[`${s.acta_id}:${s.compromiso_id}`] = s as Seguimiento; });
      }

      const toPerson = (id: string): Person => {
        const u = users[id];
        return { id, nombre: u?.full_name || 'Sin nombre', cargo: (u?.role_id && roleById[u.role_id]) || roleByKey[u?.role] || (u?.role || '').replace(/_/g, ' '), email: u?.email };
      };

      const out: PlanItem[] = [];
      for (const a of list as any[]) {
        const comps: Compromiso[] = Array.isArray(a.compromisos) ? a.compromisos : [];
        const evaluado = toPerson(a.evaluated_id);
        const evaluador = toPerson(a.evaluator_id);
        const oficina = officeName[users[a.evaluated_id]?.office_id] || a.oficina || 'Sin oficina';
        for (const c of comps) {
          if (!c.act?.trim()) continue;
          const key = `${a.id}:${c.id}`;
          out.push({ key, actaId: a.id, numeroActa: a.numero, periodId: a.period_id, compromiso: c, evaluado, evaluador, oficina, seg: segs[key] || null });
        }
      }
      out.sort((x, y) => x.evaluado.nombre.localeCompare(y.evaluado.nombre, 'es') || (x.compromiso.fecha || '9999').localeCompare(y.compromiso.fecha || '9999'));
      setItems(out);
    } catch (e: any) {
      console.error('[Plan] load', e);
      const missing = /plan_seguimiento|plan_registros/.test(e?.message || '');
      setError(missing ? 'Falta aplicar la migración de Plan de Mejora en la base de datos.' : 'No se pudieron cargar los compromisos. Inténtalo de nuevo.');
    } finally { setLoading(false); }
  }, [admin, userId, periodId]);

  useEffect(() => { load(); }, [load]);

  return { items, loading, error, reload: () => load(true) };
}

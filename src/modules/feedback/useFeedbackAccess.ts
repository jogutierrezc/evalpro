import { useEffect, useState } from 'react';
import { supabase, User } from '../../lib/supabase';

export const isAdminRole = (role?: string | null) => ['admin', 'administrador', 'superadmin'].includes((role || '').toString().toLowerCase());

/**
 * Quién ve Retroalimentación: administradores y cualquier persona que haya evaluado a otra.
 * Quien solo es evaluado (o solo se autoevalúa) no lo ve.
 */
export function useFeedbackAccess(user: User | null) {
  const [state, setState] = useState<{ allowed: boolean; loading: boolean }>({ allowed: false, loading: true });

  useEffect(() => {
    let alive = true;
    if (!user) { setState({ allowed: false, loading: false }); return; }
    if (isAdminRole(user.role)) { setState({ allowed: true, loading: false }); return; }
    setState((s) => ({ ...s, loading: true }));
    supabase
      .from('evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('evaluator_id', user.id)
      .neq('evaluated_id', user.id)
      .then(({ count, error }) => {
        if (!alive) return;
        setState({ allowed: !error && (count ?? 0) > 0, loading: false });
      });
    return () => { alive = false; };
  }, [user?.id, user?.role]);

  return state;
}

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ActaPaper } from './ActaPaper';
import { ActaRow, Person, normalizeActa } from './types';
import { useAuth } from '../../contexts/AuthContext';
import { isAdminRole } from './useFeedbackAccess';

/**
 * Vista A4 del acta para guardar como PDF (diálogo de impresión del navegador, "Guardar como PDF").
 * Es la misma maquetación del editor, así que el PDF es fiel al formato GED-FT-032-BUC.
 */
export default function ActaPrint() {
  const { user } = useAuth();
  const id = new URLSearchParams(window.location.search).get('id') || '';
  const [acta, setActa] = useState<ActaRow | null>(null);
  const [people, setPeople] = useState<{ evaluator: Person; evaluated: Person } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from('feedback_actas').select('*').eq('id', id).maybeSingle();
      if (!alive) return;
      if (error || !data) { setErr('No se encontró el acta.'); return; }
      const a = normalizeActa(data);
      if (user && !isAdminRole(user.role) && user.id !== a.evaluator_id) { setErr('No tienes acceso a esta acta.'); return; }
      const [{ data: us }, { data: roles }] = await Promise.all([
        supabase.from('users').select('id, full_name, role, role_id').in('id', [a.evaluator_id, a.evaluated_id]),
        supabase.from('roles').select('id, key, label'),
      ]);
      const byId: Record<string, string> = {}; const byKey: Record<string, string> = {};
      (roles || []).forEach((r: any) => { byId[r.id] = r.label; byKey[r.key] = r.label; });
      const person = (uid: string): Person => {
        const u = (us || []).find((x: any) => x.id === uid) as any;
        return { id: uid, nombre: u?.full_name || 'Sin nombre', cargo: (u?.role_id && byId[u.role_id]) || byKey[u?.role] || (u?.role || '').replace(/_/g, ' ') };
      };
      setPeople({ evaluator: person(a.evaluator_id), evaluated: person(a.evaluated_id) });
      setActa(a);
      document.title = `Acta ${a.numero}`;
    })();
    return () => { alive = false; };
  }, [id, user]);

  const print = async () => {
    try { await document.fonts.ready; } catch { /* sin API de fuentes */ }
    window.print();
  };

  if (err) return <div className="flex min-h-screen items-center justify-center gap-2 p-6 text-sm text-red-700"><AlertCircle className="h-4 w-4" />{err}</div>;
  if (!acta || !people) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  return (
    <div className="min-h-screen bg-[#e6e9ef]">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-sm text-slate-600">Vista del PDF en formato A4. En el diálogo de impresión elige <b>Guardar como PDF</b> y desactiva encabezados y pies de página.</p>
        <button onClick={print} className="ui-btn-primary"><Printer className="h-4 w-4" /> Imprimir o guardar PDF</button>
      </div>
      <div className="acta-desk">
        <ActaPaper acta={acta} evaluator={people.evaluator} evaluated={people.evaluated} />
      </div>
    </div>
  );
}

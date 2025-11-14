import { useEffect, useState } from 'react';
import { supabase, Collaborator, Office } from '../../lib/supabase';

type CollabOfficeRow = {
  id: string;
  collaborator_id: string;
  office_id: string;
  created_at: string | null;
  colaboradores?: Collaborator | null;
  offices?: Office | null;
};

export default function CollaboratorOfficesDebug() {
  const [rows, setRows] = useState<CollabOfficeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runningBackfill, setRunningBackfill] = useState(false);

  async function fetchRows() {
    setLoading(true);
    setError(null);
    try {
      // Try to fetch join rows with related collaborator and office
      const { data, error } = await supabase
        .from('collaborator_offices')
        .select('*, colaboradores ( id, full_name, identification ), offices ( id, name )')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows((data as any) || []);
    } catch (err: any) {
      console.error('Error fetching collaborator_offices:', err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  async function runBackfill() {
    if (!confirm('Esto insertará relaciones en collaborator_offices desde la columna colaboradores.office_id. ¿Continuar?')) return;
    setRunningBackfill(true);
    setError(null);
    try {
      // Read collaborators that still have office_id set (legacy)
      const { data: cols, error: selectErr } = await supabase
        .from('colaboradores')
        .select('id, office_id')
        .not('office_id', 'is', null);

      if (selectErr) throw selectErr;
      if (!cols || cols.length === 0) {
        alert('No se encontraron colaboradores con office_id para backfill.');
        setRunningBackfill(false);
        return;
      }

      const rowsToInsert = (cols as any[]).map((c) => ({
        collaborator_id: c.id,
        office_id: c.office_id,
      }));

      // Use upsert to avoid duplicates if the constraint exists
      const { error: insertErr } = await supabase
        .from('collaborator_offices')
        .upsert(rowsToInsert, { onConflict: 'collaborator_id,office_id' });

      if (insertErr) throw insertErr;
      await fetchRows();
      alert('Backfill completado.');
    } catch (err: any) {
      console.error('Backfill error:', err);
      setError(err.message || String(err));
      alert('Error durante backfill: ' + (err.message || String(err)));
    } finally {
      setRunningBackfill(false);
    }
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold">Depuración: collaborator_offices</h2>
      <p className="text-sm text-slate-500 mb-3">Lista las relaciones colaborador ↔ oficina. Útil para verificar backfill y asignaciones.</p>

      <div className="flex gap-2 mb-3">
        <button className="btn btn-primary" onClick={fetchRows} disabled={loading}>
          {loading ? 'Cargando...' : 'Refrescar'}
        </button>
        <button className="btn btn-secondary" onClick={runBackfill} disabled={runningBackfill}>
          {runningBackfill ? 'Ejecutando backfill...' : 'Backfill desde colaboradores.office_id'}
        </button>
      </div>

      {error && <div className="text-red-600 mb-3">Error: {error}</div>}

      <div className="overflow-auto border rounded">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="p-2 text-left">ID</th>
              <th className="p-2 text-left">Colaborador</th>
              <th className="p-2 text-left">Oficina</th>
              <th className="p-2 text-left">Creado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="p-2 text-slate-500">No hay filas o la tabla no existe.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 align-top">{r.id}</td>
                <td className="p-2 align-top">
                  {r.colaboradores ? (
                    <div>
                      <div className="font-medium">{r.colaboradores.full_name}</div>
                      <div className="text-xs text-slate-500">{r.colaboradores.identification}</div>
                    </div>
                  ) : (
                    r.collaborator_id
                  )}
                </td>
                <td className="p-2 align-top">{r.offices ? r.offices.name : r.office_id}</td>
                <td className="p-2 align-top">{r.created_at ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

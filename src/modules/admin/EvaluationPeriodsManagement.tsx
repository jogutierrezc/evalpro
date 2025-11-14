import { useEffect, useState } from 'react';
import { supabase, FormType } from '../../lib/supabase';

type Period = {
  id: string;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

export default function EvaluationPeriodsManagement() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [formTypes, setFormTypes] = useState<FormType[]>([]);
  const [editing, setEditing] = useState<Partial<Period> | null>(null);
  const [selectedFormTypes, setSelectedFormTypes] = useState<Record<string, boolean>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('evaluation_periods').select('*').order('year', { ascending: false }).order('start_date', { ascending: false });
      setPeriods((p as any) || []);
      const { data: ft } = await supabase.from('form_types').select('*').order('created_at', { ascending: false });
      setFormTypes((ft as any) || []);
    } catch (err) {
      console.error('Error loading periods', err);
    } finally {
      setLoading(false);
    }
  }

  const handleEdit = async (period?: Period) => {
    if (!period) {
      setEditing({ year: new Date().getFullYear(), start_date: '', end_date: '', is_active: false });
      setSelectedFormTypes({});
      return;
    }
    setEditing(period);
    // load associated form types
    try {
      const { data } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
      const map: Record<string, boolean> = {};
      (data || []).forEach((r: any) => { map[r.form_type_key] = true; });
      setSelectedFormTypes(map);
    } catch (err) {
      console.error('Error loading period form types', err);
      setSelectedFormTypes({});
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    const payload: any = {
      year: editing.year,
      start_date: editing.start_date,
      end_date: editing.end_date,
      is_active: !!editing.is_active,
    };

    try {
      let periodId = editing.id;
      if (periodId) {
        const { error } = await supabase.from('evaluation_periods').update(payload).eq('id', periodId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('evaluation_periods').insert([payload]).select().single();
        if (error) throw error;
        periodId = data.id;
      }

      // replace associated form types
      const selectedKeys = Object.keys(selectedFormTypes).filter(k => selectedFormTypes[k]);
      // delete existing
      await supabase.from('evaluation_period_form_types').delete().eq('period_id', periodId);
      if (selectedKeys.length > 0) {
        const inserts = selectedKeys.map(k => ({ period_id: periodId, form_type_key: k }));
        const { error: insErr } = await supabase.from('evaluation_period_form_types').insert(inserts);
        if (insErr) throw insErr;
      }

      // if activated, ensure other periods for same year are deactivated
      if (payload.is_active) {
        await supabase.from('evaluation_periods').update({ is_active: false }).neq('id', periodId).eq('year', payload.year);
      }

      setEditing(null);
      await load();
    } catch (err) {
      console.error('Error saving period', err);
      alert('No se pudo guardar el periodo');
    }
  };

  const handleToggleActive = async (p: Period) => {
    try {
      // toggle: if enabling, disable others in same year
      const newVal = !p.is_active;
      if (newVal) {
        await supabase.from('evaluation_periods').update({ is_active: false }).eq('year', p.year);
      }
      const { error } = await supabase.from('evaluation_periods').update({ is_active: newVal }).eq('id', p.id);
      if (error) throw error;
      await load();
    } catch (err) {
      console.error('Error toggling active', err);
      alert('No se pudo cambiar el estado');
    }
  };

  if (loading) return <div className="text-center py-8">Cargando periodos...</div>;

  if (editing) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">{editing.id ? 'Editar Periodo' : 'Nuevo Periodo'}</h2>
        <div className="grid grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="block text-sm">Año</label>
            <input type="number" className="w-full border p-2 rounded" value={editing.year} onChange={(e) => setEditing({ ...editing, year: Number(e.target.value) })} />
          </div>
          <div>
            <label className="block text-sm">Fecha inicio</label>
            <input type="date" className="w-full border p-2 rounded" value={editing.start_date} onChange={(e) => setEditing({ ...editing, start_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">Fecha fin</label>
            <input type="date" className="w-full border p-2 rounded" value={editing.end_date} onChange={(e) => setEditing({ ...editing, end_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm">Activar</label>
            <input type="checkbox" className="ml-2" checked={!!editing.is_active} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-medium mb-2">Tipos de formulario asociados</div>
          <div className="grid grid-cols-2 gap-2 max-w-xl">
            {formTypes.map(ft => (
              <label key={ft.id} className="flex items-center gap-2">
                <input type="checkbox" checked={!!selectedFormTypes[ft.key]} onChange={(e) => setSelectedFormTypes({ ...selectedFormTypes, [ft.key]: e.target.checked })} />
                <span className="text-sm">{ft.label} ({ft.key})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button className="px-3 py-2 rounded border" onClick={() => setEditing(null)}>Cancelar</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={handleSave}>Guardar</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Periodos de Evaluación</h2>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded bg-green-600 text-white" onClick={() => handleEdit()}>Nuevo Periodo</button>
        </div>
      </div>

      <div className="space-y-3">
        {periods.map((p) => (
          <div key={p.id} className="bg-white border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-medium">{p.year} — {new Date(p.start_date).toLocaleDateString()} hasta {new Date(p.end_date).toLocaleDateString()}</div>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded border text-sm" onClick={() => handleEdit(p)}>Editar</button>
              <button className={`px-3 py-1 rounded text-sm ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`} onClick={() => handleToggleActive(p)}>
                {p.is_active ? 'Activo' : 'Activar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

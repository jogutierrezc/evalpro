import { useEffect, useState } from 'react';
import { supabase, FormType } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function FormTypesManagement() {
  const [types, setTypes] = useState<FormType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FormType | null>(null);

  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [form, setForm] = useState<{ key: string; label: string; description: string; roles: string[] }>({ key: '', label: '', description: '', roles: [] });

  useEffect(() => { loadTypes(); }, []);

  useEffect(() => {
    // load available roles from the new `roles` table (authoritative)
    const loadRoles = async () => {
      try {
        const { data, error } = await supabase.from('roles').select('key, label').order('label');
        if (error) throw error;
        const list = (data || []).map((r: any) => r.key);
        setAvailableRoles(list);
      } catch (err) {
        console.error('Error loading available roles from roles table:', err);
      }
    };
    loadRoles();
  }, []);

  // Friendly labels for known role keys. If a role key isn't listed here, we'll
  // display the raw key as fallback. This map is used to render readable names
  // in the UI; later we could load these labels from the `roles` table too.
  const roleLabelMap: Record<string, string> = {
    colaborador_vaf: 'Colaborador VAF',
    jefe_vaf: 'Jefe VAF',
    jefe_campus_vaf: 'Jefe Campus VAF',
    office_manager: 'Jefe de Oficina',
    admin: 'Administrador',
    employee: 'Colaborador',
  };

  async function loadTypes() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_types')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTypes((data as any) || []);
    } catch (err) {
      console.error('Error loading form types:', err);
      alert('Error cargando tipos de formulario');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ key: '', label: '', description: '', roles: [] });
    setShowForm(true);
  }

  function openEdit(t: FormType) {
    setEditing(t);
    setForm({ key: t.key, label: t.label, description: t.description || '', roles: (t.roles || []) });
    setShowForm(true);
  }

  async function handleSave() {
    // roles is an array
    const rolesArr = (form.roles || []).map(s => s.trim()).filter(Boolean);
    try {
      if (editing) {
        const { error } = await supabase.from('form_types').update({ label: form.label, description: form.description, roles: rolesArr }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('form_types').insert([{ key: form.key, label: form.label, description: form.description, roles: rolesArr }]);
        if (error) throw error;
      }
      setShowForm(false);
      loadTypes();
    } catch (err: any) {
      console.error('Save error:', err);
      alert('Error guardando tipo: ' + (err.message || String(err)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este tipo de formulario?')) return;
    try {
      const { error } = await supabase.from('form_types').delete().eq('id', id);
      if (error) throw error;
      loadTypes();
    } catch (err) {
      console.error('Delete error:', err);
      alert('No se pudo eliminar');
    }
  }

  if (loading) return <div className="py-8 text-center">Cargando...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Tipos de Formularios</h2>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded">
          <Plus className="w-4 h-4" /> Nuevo
        </button>
      </div>

      <div className="grid gap-3">
        {types.map(t => (
          <div key={t.id} className="bg-white p-4 rounded border">
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium">{t.label}</div>
                <div className="text-xs text-slate-500">{t.key}</div>
                {t.description && <div className="text-sm mt-1">{t.description}</div>}
                <div className="text-xs mt-2 text-slate-600">Roles: {(t.roles || []).map((r:string) => (roleLabelMap[r] || r)).join(', ')}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(t)} className="text-blue-600 px-2 py-1 rounded text-sm"><Edit2 className="w-4 h-4 inline" /> Editar</button>
                <button onClick={() => handleDelete(t.id)} className="text-red-600 px-2 py-1 rounded text-sm"><Trash2 className="w-4 h-4 inline" /> Eliminar</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-3">{editing ? 'Editar' : 'Crear'} Tipo</h3>
            <div className="grid gap-3">
              {!editing && (
                <div>
                  <label className="block text-sm">Key (único)</label>
                  <input className="w-full border p-2 rounded" value={form.key} onChange={(e) => setForm({...form, key: e.target.value})} />
                </div>
              )}
              <div>
                <label className="block text-sm">Etiqueta</label>
                <input className="w-full border p-2 rounded" value={form.label} onChange={(e) => setForm({...form, label: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm">Descripción</label>
                <textarea className="w-full border p-2 rounded" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm mb-2">Roles aplicables</label>
                {availableRoles && availableRoles.length > 0 ? (
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.roles.length === availableRoles.length} onChange={(e) => {
                        if (e.target.checked) setForm({ ...form, roles: [...availableRoles] });
                        else setForm({ ...form, roles: [] });
                      }} />
                      <span className="text-sm">Usar todos los roles</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {availableRoles.map((r) => (
                        <label key={r} className="inline-flex items-center gap-2">
                          <input type="checkbox" checked={form.roles.includes(r)} onChange={(e) => {
                            if (e.target.checked) setForm({ ...form, roles: Array.from(new Set([...form.roles, r])) });
                            else setForm({ ...form, roles: form.roles.filter(x => x !== r) });
                          }} />
                          <span className="text-sm">{roleLabelMap[r] ? `${roleLabelMap[r]} (${r})` : r}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">No se encontraron roles en la base. Ingresa roles separados por coma.</label>
                    <input className="w-full border p-2 rounded" value={(form.roles || []).join(',')} onChange={(e) => setForm({ ...form, roles: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="colaborador_vaf,jefe_vaf,office_manager" />
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowForm(false)} className="px-3 py-2 rounded border">Cancelar</button>
                <button onClick={handleSave} className="px-3 py-2 rounded bg-blue-600 text-white">Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

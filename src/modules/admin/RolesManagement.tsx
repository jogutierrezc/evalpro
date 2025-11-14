import { useEffect, useState } from 'react';
import { supabase, Role } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function RolesManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [form, setForm] = useState({ key: '', label: '', description: '' });

  useEffect(() => { loadRoles(); }, []);

  async function loadRoles() {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('roles').select('*').order('label');
      if (error) throw error;
      setRoles((data as any) || []);
    } catch (err) {
      console.error('Error loading roles:', err);
      alert('No se pudieron cargar los roles');
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ key: '', label: '', description: '' });
    setShowForm(true);
  }

  function openEdit(r: Role) {
    setEditing(r);
    setForm({ key: r.key, label: r.label, description: r.description || '' });
    setShowForm(true);
  }

  async function handleSave() {
    try {
      if (editing) {
        const { error } = await supabase.from('roles').update({ label: form.label, description: form.description }).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('roles').insert([{ key: form.key, label: form.label, description: form.description }]);
        if (error) throw error;
      }
      setShowForm(false);
      loadRoles();
    } catch (err: any) {
      console.error('Save role error:', err);
      alert('No se pudo guardar el rol: ' + (err.message || String(err)));
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este rol? Se perderán asociaciones en UI.' )) return;
    try {
      const { error } = await supabase.from('roles').delete().eq('id', id);
      if (error) throw error;
      loadRoles();
    } catch (err) {
      console.error('Delete role error:', err);
      alert('No se pudo eliminar el rol');
    }
  }

  if (loading) return <div className="py-8 text-center">Cargando roles...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Gestión de Roles</h2>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded">
          <Plus className="w-4 h-4" /> Nuevo
        </button>
      </div>

      <div className="grid gap-3">
        {roles.map(r => (
          <div key={r.id} className="bg-white p-4 rounded border flex justify-between items-center">
            <div>
              <div className="font-medium">{r.label}</div>
              <div className="text-xs text-slate-500">{r.key}</div>
              {r.description && <div className="text-sm mt-1">{r.description}</div>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openEdit(r)} className="text-blue-600 px-2 py-1 rounded text-sm"><Edit2 className="w-4 h-4 inline"/> Editar</button>
              <button onClick={() => handleDelete(r.id)} className="text-red-600 px-2 py-1 rounded text-sm"><Trash2 className="w-4 h-4 inline"/> Eliminar</button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-6 rounded w-full max-w-lg">
            <h3 className="text-lg font-semibold mb-3">{editing ? 'Editar' : 'Crear'} Rol</h3>
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

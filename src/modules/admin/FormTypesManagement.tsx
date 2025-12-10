import { useEffect, useState } from 'react';
import { supabase, FormType, Role } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export default function FormTypesManagement() {
  const [types, setTypes] = useState<FormType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<FormType | null>(null);

  const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<{ key: string; label: string; description: string; roles: string[]; relations?: { evaluator: string; evaluated: string }[] }>({ key: '', label: '', description: '', roles: [], relations: [] });

  useEffect(() => { loadTypes(); }, []);

  useEffect(() => {
    // load available roles from the new `roles` table (authoritative)
    const loadRoles = async () => {
      try {
        const { data, error } = await supabase.from('roles').select('*').order('label');
        if (error) throw error;
        setAvailableRoles((data as Role[]) || []);
      } catch (err) {
        console.error('Error loading available roles from roles table:', err);
      }
    };
    loadRoles();
  }, []);

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
    setForm({ key: '', label: '', description: '', roles: [], relations: [] });
    setShowForm(true);
  }

  function openEdit(t: FormType) {
    setEditing(t);
    setForm({ key: t.key, label: t.label, description: t.description || '', roles: (t.roles || []), relations: [] });
    setShowForm(true);
    // load relations for this form type
    (async () => {
      try {
        const { data } = await supabase.from('form_type_relations').select('evaluator_role_key,evaluated_role_key').eq('form_type_key', t.key);
        if (data) {
          const relations = (data || []).map((r: any) => ({ evaluator: r.evaluator_role_key, evaluated: r.evaluated_role_key }));
          setForm((f) => ({ ...f, relations }));
        }
      } catch (err) {
        console.warn('Could not load form type relations', err);
      }
    })();
  }

  async function handleSave() {
    // roles is an array of keys
    const rolesArr = (form.roles || []).filter(Boolean);

    try {
      if (editing) {
        const { error } = await supabase.from('form_types').update({
          label: form.label,
          description: form.description,
          roles: rolesArr
        }).eq('id', editing.id);
        if (error) throw error;
        // update relations: delete existing and insert new
        try {
          await supabase.from('form_type_relations').delete().eq('form_type_key', form.key);
          const inserts = (form.relations || []).map(r => ({
            form_type_key: form.key,
            evaluator_role_key: r.evaluator,
            evaluated_role_key: r.evaluated,
            evaluator_role_id: availableRoles.find(ar => ar.key === r.evaluator)?.id,
            evaluated_role_id: availableRoles.find(ar => ar.key === r.evaluated)?.id
          }));
          if (inserts.length > 0) {
            const { error: insErr } = await supabase.from('form_type_relations').insert(inserts);
            if (insErr) throw insErr;
          }
        } catch (rerr) {
          console.error('Error saving relations', rerr);
          // proceed, but alert to the admin
          alert('Tipo guardado, pero no se pudieron actualizar las relaciones de evaluación.');
        }
      } else {
        const { error } = await supabase.from('form_types').insert([{
          key: form.key,
          label: form.label,
          description: form.description,
          roles: rolesArr
        }]);
        if (error) throw error;
        // insert relations for newly created type
        try {
          const inserts = (form.relations || []).map(r => ({
            form_type_key: form.key,
            evaluator_role_key: r.evaluator,
            evaluated_role_key: r.evaluated,
            evaluator_role_id: availableRoles.find(ar => ar.key === r.evaluator)?.id,
            evaluated_role_id: availableRoles.find(ar => ar.key === r.evaluated)?.id
          }));
          if (inserts.length > 0) {
            const { error: insErr } = await supabase.from('form_type_relations').insert(inserts);
            if (insErr) throw insErr;
          }
        } catch (rerr) {
          console.error('Error inserting relations', rerr);
          alert('Tipo creado, pero no se pudieron crear las relaciones de evaluación.');
        }
      }
      setShowForm(false);
      await loadTypes();
      alert('Cambios guardados correctamente.');
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
                <div className="text-xs mt-2 text-slate-600">Roles: {(t.roles || []).join(', ')}</div>
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded w-full max-w-4xl max-h-[85vh] overflow-y-auto shadow-xl">
            <h3 className="text-lg font-semibold mb-3">{editing ? 'Editar' : 'Crear'} Tipo</h3>
            <div className="grid gap-3">
              {!editing && (
                <div>
                  <label className="block text-sm">Key (único)</label>
                  <input className="w-full border p-2 rounded" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
                </div>
              )}
              <div>
                <label className="block text-sm">Etiqueta</label>
                <input className="w-full border p-2 rounded" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm">Descripción</label>
                <textarea className="w-full border p-2 rounded" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm mb-2">Roles aplicables</label>
                {availableRoles && availableRoles.length > 0 ? (
                  <div className="space-y-2">
                    <label className="inline-flex items-center gap-2">
                      <input type="checkbox" checked={form.roles.length === availableRoles.length} onChange={(e) => {
                        if (e.target.checked) setForm({ ...form, roles: availableRoles.map(r => r.key) });
                        else setForm({ ...form, roles: [] });
                      }} />
                      <span className="text-sm">Usar todos los roles</span>
                    </label>
                    <div className="mt-2 max-h-64 overflow-auto border rounded p-2">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {availableRoles.map((r) => (
                          <label key={r.id} className="inline-flex items-center gap-2">
                            <input type="checkbox" checked={form.roles.includes(r.key)} onChange={(e) => {
                              if (e.target.checked) setForm({ ...form, roles: Array.from(new Set([...form.roles, r.key])) });
                              else setForm({ ...form, roles: form.roles.filter(x => x !== r.key) });
                            }} />
                            <span className="text-sm">{r.label} ({r.key})</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">No se encontraron roles en la base.</label>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm mb-2">Relaciones (Quién evalúa a quién)</label>
                <div className="space-y-2">
                  {(form.relations || []).map((rel, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select className="border p-2 rounded w-1/2" value={rel.evaluator} onChange={(e) => {
                        const copy = (form.relations || []).slice(); copy[idx].evaluator = e.target.value; setForm({ ...form, relations: copy });
                      }}>
                        <option value="">Selecciona evaluador</option>
                        {availableRoles.map(r => <option key={r.id} value={r.key}>{r.label} ({r.key})</option>)}
                      </select>
                      <select className="border p-2 rounded w-1/2" value={rel.evaluated} onChange={(e) => {
                        const copy = (form.relations || []).slice(); copy[idx].evaluated = e.target.value; setForm({ ...form, relations: copy });
                      }}>
                        <option value="">Selecciona evaluado</option>
                        {availableRoles.map(r => <option key={r.id} value={r.key}>{r.label} ({r.key})</option>)}
                      </select>
                    </div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    <button className="px-3 py-1 rounded border" onClick={() => setForm({ ...form, relations: [...(form.relations || []), { evaluator: '', evaluated: '' }] })}>Agregar relación</button>
                    <button className="px-3 py-1 rounded border" onClick={() => setForm({ ...form, relations: (form.relations || []).slice(0, -1) })}>Eliminar última</button>
                  </div>
                </div>
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

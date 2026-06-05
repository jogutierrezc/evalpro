import { useEffect, useState, useCallback } from 'react';
import { supabase, FormType, User } from '../../lib/supabase';
import { Plus, Edit2, Users, X, Copy, Search, Check, UserMinus, ChevronDown, ChevronUp } from 'lucide-react';

type Period = {
  id: string;
  year: number;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

type PeriodCollaborator = {
  id: string;
  period_id: string;
  user_id: string;
  is_active: boolean;
  role_in_period: string | null;
  user?: User;
};

export default function EvaluationPeriodsManagement() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [formTypes, setFormTypes] = useState<FormType[]>([]);
  const [editing, setEditing] = useState<Partial<Period> | null>(null);
  const [selectedFormTypes, setSelectedFormTypes] = useState<Record<string, boolean>>({});
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  // Collaborator management state
  const [periodCollaborators, setPeriodCollaborators] = useState<PeriodCollaborator[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: p } = await supabase.from('evaluation_periods').select('*').order('year', { ascending: false }).order('start_date', { ascending: false });
      setPeriods((p as any) || []);
      const { data: ft } = await supabase.from('form_types').select('*').order('created_at', { ascending: false });
      setFormTypes((ft as any) || []);
      const { data: u } = await supabase.from('users').select('*').order('full_name');
      setAllUsers((u as any) || []);
    } catch (err) {
      console.error('Error loading periods', err);
    } finally {
      setLoading(false);
    }
  }

  const loadCollaborators = useCallback(async (periodId: string) => {
    try {
      const { data } = await supabase
        .from('period_collaborators')
        .select('*, user:users(*)')
        .eq('period_id', periodId)
        .order('created_at', { ascending: true });
      setPeriodCollaborators((data as any) || []);
    } catch (err) {
      console.error('Error loading period collaborators', err);
      setPeriodCollaborators([]);
    }
  }, []);

  const handleEdit = async (period?: Period) => {
    if (!period) {
      setEditing({ year: new Date().getFullYear(), start_date: '', end_date: '', is_active: false });
      setSelectedFormTypes({});
      setPeriodCollaborators([]);
      return;
    }
    setEditing(period);
    setActivePeriodId(period.id);
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
    // load collaborators
    await loadCollaborators(period.id);
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
      setActivePeriodId(null);
      setPeriodCollaborators([]);
      await load();
    } catch (err) {
      console.error('Error saving period', err);
      alert('No se pudo guardar el periodo');
    }
  };

  const handleToggleActive = async (p: Period) => {
    try {
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

  // --- Collaborator management handlers ---

  const handleAddUser = async (userId: string) => {
    if (!activePeriodId) return;
    const exists = periodCollaborators.find(pc => pc.user_id === userId);
    if (exists) {
      alert('Este colaborador ya está asignado al periodo.');
      return;
    }
    try {
      const user = allUsers.find(u => u.id === userId);
      const { error } = await supabase.from('period_collaborators').insert([{
        period_id: activePeriodId,
        user_id: userId,
        is_active: true,
        role_in_period: user?.role || null,
      }]);
      if (error) throw error;
      setShowAddUser(false);
      setUserSearch('');
      await loadCollaborators(activePeriodId);
    } catch (err) {
      console.error('Error adding collaborator', err);
      alert('No se pudo agregar el colaborador');
    }
  };

  const handleRemoveUser = async (collaboratorId: string) => {
    if (!confirm('¿Eliminar este colaborador del periodo? Sus evaluaciones existentes se mantendrán.')) return;
    try {
      const { error } = await supabase.from('period_collaborators').delete().eq('id', collaboratorId);
      if (error) throw error;
      if (activePeriodId) await loadCollaborators(activePeriodId);
    } catch (err) {
      console.error('Error removing collaborator', err);
      alert('No se pudo eliminar el colaborador');
    }
  };

  const handleToggleUserActive = async (collaborator: PeriodCollaborator) => {
    try {
      const { error } = await supabase.from('period_collaborators')
        .update({ is_active: !collaborator.is_active })
        .eq('id', collaborator.id);
      if (error) throw error;
      if (activePeriodId) await loadCollaborators(activePeriodId);
    } catch (err) {
      console.error('Error toggling collaborator active', err);
      alert('No se pudo cambiar el estado');
    }
  };

  const handleCopyFromPrevious = async () => {
    if (!activePeriodId) return;
    const currentPeriod = periods.find(p => p.id === activePeriodId);
    if (!currentPeriod) return;

    // Find previous period (by year, then by start_date)
    const previousPeriods = periods
      .filter(p => p.id !== activePeriodId)
      .sort((a, b) => {
        if (b.year !== a.year) return b.year - a.year;
        return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
      });

    if (previousPeriods.length === 0) {
      alert('No hay periodos anteriores para copiar.');
      return;
    }

    const prevPeriod = previousPeriods[0];
    if (!confirm(`¿Copiar los colaboradores del periodo ${prevPeriod.year} (${new Date(prevPeriod.start_date).toLocaleDateString()} - ${new Date(prevPeriod.end_date).toLocaleDateString()})?`)) return;

    try {
      const { data: prevCollabs } = await supabase
        .from('period_collaborators')
        .select('user_id, is_active, role_in_period')
        .eq('period_id', prevPeriod.id);

      if (!prevCollabs || prevCollabs.length === 0) {
        alert('El periodo anterior no tiene colaboradores asignados.');
        return;
      }

      // Get existing user_ids in current period to avoid duplicates
      const existingIds = new Set(periodCollaborators.map(pc => pc.user_id));

      const toInsert = (prevCollabs as any[])
        .filter((pc: any) => !existingIds.has(pc.user_id))
        .map((pc: any) => ({
          period_id: activePeriodId,
          user_id: pc.user_id,
          is_active: pc.is_active,
          role_in_period: pc.role_in_period,
        }));

      if (toInsert.length === 0) {
        alert('Todos los colaboradores del periodo anterior ya están asignados.');
        return;
      }

      const { error } = await supabase.from('period_collaborators').insert(toInsert);
      if (error) throw error;

      alert(`${toInsert.length} colaboradores copiados exitosamente.`);
      await loadCollaborators(activePeriodId);
    } catch (err) {
      console.error('Error copying collaborators', err);
      alert('Error al copiar colaboradores');
    }
  };

  // Filter users not already in current period
  const availableUsers = allUsers.filter(u => {
    const alreadyAssigned = periodCollaborators.some(pc => pc.user_id === u.id);
    if (alreadyAssigned) return false;
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.identification.toLowerCase().includes(q);
  });

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

        {/* Collaborators Section */}
        {activePeriodId && (
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Users className="w-5 h-5" />
                Colaboradores del Periodo
                <span className="text-sm font-normal text-slate-500">({periodCollaborators.length} asignados)</span>
              </h3>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded border text-sm flex items-center gap-1 hover:bg-slate-50"
                  onClick={handleCopyFromPrevious}
                >
                  <Copy className="w-4 h-4" />
                  Copiar de periodo anterior
                </button>
                <button
                  className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm flex items-center gap-1 hover:bg-blue-700"
                  onClick={() => setShowAddUser(true)}
                >
                  <Plus className="w-4 h-4" />
                  Agregar colaborador
                </button>
              </div>
            </div>

            {/* Add user panel */}
            {showAddUser && (
              <div className="mb-4 p-4 border rounded-lg bg-slate-50">
                <div className="flex items-center gap-2 mb-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Buscar colaborador por nombre o cédula..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                      autoFocus
                    />
                  </div>
                  <button
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
                    onClick={() => { setShowAddUser(false); setUserSearch(''); }}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {availableUsers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      {userSearch ? 'No se encontraron colaboradores' : 'No hay más colaboradores disponibles'}
                    </p>
                  ) : (
                    availableUsers.slice(0, 50).map(u => (
                      <button
                        key={u.id}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-100 flex items-center justify-between group"
                        onClick={() => handleAddUser(u.id)}
                      >
                        <div>
                          <span className="text-sm font-medium">{u.full_name}</span>
                          <span className="text-xs text-slate-500 ml-2">{u.identification}</span>
                          <span className="text-xs text-slate-400 ml-2">({u.role?.replace(/_/g, ' ')})</span>
                        </div>
                        <Plus className="w-4 h-4 text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))
                  )}
                  {availableUsers.length > 50 && (
                    <p className="text-xs text-slate-400 text-center py-1">... y {availableUsers.length - 50} más. Usa el buscador para filtrar.</p>
                  )}
                </div>
              </div>
            )}

            {/* Collaborators list */}
            {periodCollaborators.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border rounded-lg">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No hay colaboradores asignados a este periodo.</p>
                <p className="text-xs mt-1">Agrega colaboradores o cópialos de un periodo anterior.</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Colaborador</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">Rol</th>
                      <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 uppercase">Activo</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {periodCollaborators.map(pc => {
                      const user = pc.user || allUsers.find(u => u.id === pc.user_id);
                      return (
                        <tr key={pc.id} className={`hover:bg-slate-50 transition-colors ${!pc.is_active ? 'opacity-60' : ''}`}>
                          <td className="px-4 py-2">
                            <span className="text-sm font-medium">{user?.full_name || 'Usuario desconocido'}</span>
                            <span className="text-xs text-slate-400 ml-2">{user?.identification}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-xs text-slate-600 capitalize">{pc.role_in_period?.replace(/_/g, ' ') || user?.role?.replace(/_/g, ' ') || '-'}</span>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              onClick={() => handleToggleUserActive(pc)}
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                                pc.is_active
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-red-100 text-red-700 hover:bg-red-200'
                              }`}
                            >
                              <Check className={`w-3 h-3 ${pc.is_active ? '' : 'hidden'}`} />
                              <UserMinus className={`w-3 h-3 ${pc.is_active ? 'hidden' : ''}`} />
                              {pc.is_active ? 'Activo' : 'Inactivo'}
                            </button>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => handleRemoveUser(pc.id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Eliminar del periodo"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button className="px-3 py-2 rounded border" onClick={() => { setEditing(null); setActivePeriodId(null); setPeriodCollaborators([]); }}>Cancelar</button>
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
          <div key={p.id}>
            <div className="bg-white border rounded p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-medium">{p.year} — {new Date(p.start_date).toLocaleDateString()} hasta {new Date(p.end_date).toLocaleDateString()}</div>
                </div>
                <button
                  className={`text-xs flex items-center gap-1 px-2 py-1 rounded-full transition-colors ${
                    expandedPeriodId === p.id ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  onClick={() => {
                    if (expandedPeriodId === p.id) {
                      setExpandedPeriodId(null);
                    } else {
                      setExpandedPeriodId(p.id);
                      loadCollaborators(p.id);
                    }
                  }}
                >
                  <Users className="w-3 h-3" />
                  Colaboradores
                  {expandedPeriodId === p.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1 rounded border text-sm" onClick={() => handleEdit(p)}>Editar</button>
                <button className={`px-3 py-1 rounded text-sm ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`} onClick={() => handleToggleActive(p)}>
                  {p.is_active ? 'Activo' : 'Activar'}
                </button>
              </div>
            </div>

            {/* Expanded collaborator list for period */}
            {expandedPeriodId === p.id && (
              <div className="ml-6 mt-2 border-l-2 border-blue-200 pl-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-600">Colaboradores asignados</span>
                  <button
                    className="px-2 py-1 rounded border text-xs flex items-center gap-1 hover:bg-blue-50"
                    onClick={() => { handleEdit(p); setExpandedPeriodId(null); }}
                  >
                    <Edit2 className="w-3 h-3" />
                    Gestionar
                  </button>
                </div>
                {periodCollaborators.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">Sin colaboradores asignados. {p.is_active && 'Edita el periodo para asignarlos.'}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {periodCollaborators.slice(0, 20).map(pc => {
                      const user = pc.user || allUsers.find(u => u.id === pc.user_id);
                      return (
                        <span
                          key={pc.id}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${
                            pc.is_active
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-red-50 text-red-500 border-red-200 line-through'
                          }`}
                        >
                          {user?.full_name || '?'}
                        </span>
                      );
                    })}
                    {periodCollaborators.length > 20 && (
                      <span className="text-xs text-slate-400 self-center">+{periodCollaborators.length - 20} más</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase, Collaborator, Office } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export function CollaboratorsManagement() {
  const [collaborators, setCollaborators] = useState<(Collaborator & { offices?: Office[]; manager?: Collaborator })[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [availableRoles, setAvailableRoles] = useState<{ key: string; label: string }[]>([]);
  const [managers, setManagers] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCollaborator, setEditingCollaborator] = useState<Collaborator | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    identification: '',
    full_name: '',
    email: '',
    role: 'colaborador_vaf' as Collaborator['role'],
    office_ids: [] as string[],
    manager_id: '',
    campus: '',
  });

  useEffect(() => {
    loadCollaborators();
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase.from('roles').select('key, label').order('label');
      if (error) throw error;
      setAvailableRoles((data as any) || []);
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  const loadCollaborators = async () => {
    try {
      const { data: collaboratorsData, error: collabError } = await supabase
        .from('colaboradores')
        .select(`
          *,
          collaborator_offices (
            offices (
              id,
              name
            )
          ),
          manager:colaboradores!manager_id (
            id,
            full_name
          )
        `)
        .order('full_name');

      const { data: officesData, error: officesError } = await supabase
        .from('offices')
        .select('*')
        .order('name');

      if (collabError) throw collabError;
      if (officesError) throw officesError;

      const collaboratorsWithRelations = collaboratorsData?.map((c: any) => ({
        ...c,
        offices: c.collaborator_offices?.map((co: any) => co.offices).filter(Boolean) || [],
        manager: c.manager,
      })) || [];

      setCollaborators(collaboratorsWithRelations);
      setOffices(officesData || []);
  // managers are users who can be assigned as immediate bosses: include office_manager as well
  setManagers(collaboratorsWithRelations.filter((u) => u.role === 'jefe_vaf' || u.role === 'jefe_campus_vaf' || u.role === 'office_manager'));
    } catch (error) {
      console.error('Error loading collaborators:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      try {
      const collaboratorData = {
        identification: formData.identification,
        full_name: formData.full_name,
        email: formData.email || null,
        role: formData.role,
        manager_id: formData.manager_id || null,
        campus: formData.campus,
        updated_at: new Date().toISOString(),
      };

      let collaboratorId: string;
      if (editingCollaborator) {
        const { error } = await supabase
          .from('colaboradores')
          .update(collaboratorData)
          .eq('id', editingCollaborator.id);
        if (error) throw error;
        collaboratorId = editingCollaborator.id;
      } else {
        collaboratorId = crypto.randomUUID();
        const { error } = await supabase
          .from('colaboradores')
          .insert([{ ...collaboratorData, id: collaboratorId }]);
        if (error) throw error;
      }

      // Handle collaborator_offices
      if (editingCollaborator) {
        // Delete existing
        await supabase.from('collaborator_offices').delete().eq('collaborator_id', collaboratorId);
      }
      // Insert new
      if (formData.office_ids.length > 0) {
        const officesData = formData.office_ids.map(office_id => ({
          collaborator_id: collaboratorId,
          office_id,
        }));
        const { error } = await supabase.from('collaborator_offices').insert(officesData);
        if (error) throw error;
      }

      resetForm();
      loadCollaborators();
      } catch (error) {
      console.error('Error saving collaborator:', error);
      alert(`Error al guardar el colaborador: ${(error as any)?.message || 'Error desconocido'}`);
    }
    } catch (error) {
      console.error('Error saving collaborator:', error);
      alert('Error al guardar el colaborador');
    }
  };

  const handleEdit = async (collaborator: Collaborator) => {
    // Load office_ids
    const { data: collabOffices } = await supabase
      .from('collaborator_offices')
      .select('office_id')
      .eq('collaborator_id', collaborator.id);
    const office_ids = collabOffices?.map(co => co.office_id) || [];
    setEditingCollaborator(collaborator);
    setFormData({
      identification: collaborator.identification,
      full_name: collaborator.full_name,
      email: collaborator.email || '',
      role: collaborator.role,
      office_ids,
      manager_id: collaborator.manager_id || '',
      campus: collaborator.campus,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este colaborador?')) return;

    try {
      const { error } = await supabase.from('colaboradores').delete().eq('id', id);
      if (error) throw error;
      loadCollaborators();
    } catch (error) {
      console.error('Error deleting collaborator:', error);
      alert('Error al eliminar el colaborador');
    }
  };

  const resetForm = () => {
    setFormData({
      identification: '',
      full_name: '',
      email: '',
      role: 'colaborador_vaf',
      office_ids: [],
      manager_id: '',
      campus: '',
    });
    setEditingCollaborator(null);
    setShowForm(false);
  };

  const filteredCollaborators = collaborators.filter(
    (collaborator) =>
      collaborator.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      collaborator.identification.includes(searchTerm)
  );

  const handleImport = async () => {
    if (!importFile) return;

    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: null }) as any[];

      // Build role lookup (case-insensitive) including DB roles
      const roleLookup: Record<string, string> = {};
      // legacy labels
      roleLookup['colaborador'] = 'colaborador_vaf';
      roleLookup['colaborador vaf'] = 'colaborador_vaf';
      roleLookup['colaborador_vaf'] = 'colaborador_vaf';
      roleLookup['jefe de oficina'] = 'office_manager';
      roleLookup['jefe_vaf'] = 'jefe_vaf';
      roleLookup['jefe vaf'] = 'jefe_vaf';
      roleLookup['jefe campus vaf'] = 'jefe_campus_vaf';
      roleLookup['employee'] = 'colaborador_vaf';

      (availableRoles || []).forEach((r) => {
        roleLookup[(r.key || '').toString().toLowerCase()] = r.key;
        if (r.label) roleLookup[r.label.toString().toLowerCase()] = r.key;
      });

      // Map offices by name (case-insensitive)
      const officeMap = offices.reduce((acc, office) => {
        acc[office.name.toLowerCase()] = office.id;
        return acc;
      }, {} as Record<string, string>);

      let inserted = 0;
      let updated = 0;

      for (const row of jsonData) {
        // support different header names
        const identification = (row['No. de Cedula'] || row['Cédula'] || row['Cedula'] || row['identificacion'] || row['identification'] || row['Identificación'] || row['Identificacion'])?.toString().trim();
        const full_name = (row['Nombre Completo'] || row['Nombre'] || row['Full Name'])?.toString().trim();
        const email = (row['Correo'] || row['Email'] || row['E-mail'])?.toString().trim() || null;
        const roleStr = (row['Rol'] || row['Role'])?.toString().trim();
        const officeCell = (row['Oficina'] || row['Office'])?.toString().trim() || '';
        const managerName = (row['Jefe Inmediato'] || row['Jefe'] || row['Manager'])?.toString().trim() || '';
        const campus = (row['Campus'] || row['Sede'])?.toString().trim() || '';

        if (!identification || !full_name || !roleStr) continue;

        const roleKey = roleLookup[roleStr.toLowerCase()] || null;
        if (!roleKey) {
          console.warn('Role not recognized from import row:', roleStr);
          continue;
        }

        // resolve existing collaborator by identification
        let collaboratorId: string | null = null;
        try {
          const { data: existing } = await supabase.from('colaboradores').select('id').eq('identification', identification).maybeSingle();
          if (existing) collaboratorId = existing.id;
        } catch (e) {
          console.error('Error checking existing collaborator', e);
        }

        // resolve manager id by name (prefer exact, fallback ilike)
        let manager_id: string | null = null;
        if (managerName) {
          try {
            const { data: mgr } = await supabase.from('colaboradores').select('id').ilike('full_name', managerName).limit(1).maybeSingle();
            if (mgr) manager_id = mgr.id;
          } catch (e) {
            // ignore
          }
        }

        const collabPayload: any = {
          identification,
          full_name,
          email,
          role: roleKey,
          manager_id: manager_id || null,
          campus: campus || null,
          updated_at: new Date().toISOString(),
        };

        try {
          if (collaboratorId) {
            const { error: upErr } = await supabase.from('colaboradores').update(collabPayload).eq('id', collaboratorId);
            if (upErr) {
              console.error('Error updating collaborator', full_name, upErr);
            } else {
              updated += 1;
            }
          } else {
            collaboratorId = crypto.randomUUID();
            const { error: insErr } = await supabase.from('colaboradores').insert([{ id: collaboratorId, ...collabPayload }]);
            if (insErr) {
              console.error('Error inserting collaborator', full_name, insErr);
              continue;
            } else {
              inserted += 1;
            }
          }
        } catch (e) {
          console.error('Error upserting collaborator', full_name, e);
          continue;
        }

        // handle offices (support multiple separated by comma or semicolon)
        try {
          // remove previous offices for this collaborator to keep sync
          await supabase.from('collaborator_offices').delete().eq('collaborator_id', collaboratorId);

          const officeNames = officeCell ? officeCell.split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean) : [];
          const officeInserts: any[] = [];
          for (const name of officeNames) {
            const low = name.toLowerCase();
            let office_id = officeMap[low];
            if (!office_id) {
              // try DB lookup
              try {
                const { data: off } = await supabase.from('offices').select('id').ilike('name', name).limit(1).maybeSingle();
                if (off) {
                  office_id = off.id;
                  officeMap[low] = office_id;
                }
              } catch (e) {
                console.error('Error looking up office', name, e);
              }
            }
            if (office_id) officeInserts.push({ collaborator_id: collaboratorId, office_id });
            else console.warn('Office not found for import row:', name);
          }

          if (officeInserts.length > 0) {
            const { error: officeError } = await supabase.from('collaborator_offices').insert(officeInserts);
            if (officeError) console.error('Error inserting offices for collaborator', full_name, officeError);
          }
        } catch (e) {
          console.error('Error handling offices for collaborator', full_name, e);
        }
      }

      alert(`Importación completada. Insertados: ${inserted}, Actualizados: ${updated}`);
      setShowImport(false);
      setImportFile(null);
      loadCollaborators();
    } catch (error) {
      console.error('Error importing:', error);
      alert('Error al importar');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Colaboradores VAF</h2>
        {!showForm && !showImport && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nuevo Colaborador
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Importar Excel
            </button>
          </div>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingCollaborator ? 'Editar Colaborador' : 'Nuevo Colaborador'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Cédula</label>
              <input
                type="text"
                value={formData.identification}
                onChange={(e) => setFormData({ ...formData, identification: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={!!editingCollaborator}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Completo</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Rol</label>
                <select
                  value={formData.role}
                  onChange={(e) => {
                    const newRole = e.target.value as Collaborator['role'];
                    const shouldShowManager = (newRole === 'employee' || newRole === 'colaborador_vaf') ||
                      (newRole === 'office_manager' && formData.campus === 'Todas') ||
                      newRole === 'jefe_campus_vaf';
                    setFormData({ ...formData, role: newRole, manager_id: shouldShowManager ? formData.manager_id : '' });
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  {(availableRoles && availableRoles.length > 0) ? (
                    availableRoles.map(r => (
                      <option key={r.key} value={r.key}>{r.label} ({r.key})</option>
                    ))
                  ) : (
                    <>
                      <option value="employee">Colaborador</option>
                      <option value="office_manager">Jefe de Oficina</option>
                      <option value="colaborador_vaf">Colaborador VAF</option>
                      <option value="jefe_vaf">Jefe VAF</option>
                      <option value="jefe_campus_vaf">Jefe Campus VAF</option>
                    </>
                  )}
                </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Oficina(s)</label>
              <select
                multiple
                value={formData.office_ids}
                onChange={(e) => {
                  const values = Array.from(e.target.selectedOptions, option => option.value);
                  // compute managers that belong to any of the selected offices
                  const matchedManagers = managers.filter((m: any) => (m.offices || []).some((o: any) => values.includes(o.id)));
                  // if exactly one manager matches, auto-assign; otherwise keep existing manager_id (allow manual select)
                  const newManagerId = matchedManagers.length === 1 ? matchedManagers[0].id : formData.manager_id;
                  setFormData({ ...formData, office_ids: values, manager_id: newManagerId });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
            {((formData.role === 'employee' || formData.role === 'colaborador_vaf') ||
              (formData.role === 'office_manager' && formData.campus === 'Todas') ||
              formData.role === 'jefe_campus_vaf') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jefe Inmediato</label>
                <select
                  value={formData.manager_id}
                  onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {formData.role === 'jefe_campus_vaf'
                    ? collaborators
                        .filter((c) => c.role === 'jefe_vaf')
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.full_name}
                          </option>
                        ))
                    : managers
                        .filter((m: any) => (m.offices || []).some((o: any) => formData.office_ids.includes(o.id)))
                        .map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.full_name}
                          </option>
                        ))}
                </select>
                {/* Helper: show matching managers for the selected offices and allow manual assign */}
                {formData.office_ids.length > 0 && (
                  <div className="mt-2 text-sm text-gray-700">
                    <div className="font-medium mb-1">Jefes posibles para las oficinas seleccionadas:</div>
                    <div className="space-y-2">
                      {managers
                        .filter((m: any) => (m.offices || []).some((o: any) => formData.office_ids.includes(o.id)))
                        .map((m: any) => (
                          <div key={m.id} className="flex items-center justify-between bg-gray-50 border rounded p-2">
                            <div>
                              <div className="font-medium">{m.full_name}</div>
                              <div className="text-xs text-gray-500">{(m.offices || []).map((o: any) => o.name).join(', ')}</div>
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => setFormData({ ...formData, manager_id: m.id })}
                                className="px-3 py-1 bg-blue-600 text-white rounded text-sm"
                              >
                                Asignar
                              </button>
                            </div>
                          </div>
                        ))}
                      {managers.filter((m: any) => (m.offices || []).some((o: any) => formData.office_ids.includes(o.id))).length === 0 && (
                        <div className="text-xs text-gray-500">No se encontraron jefes para las oficinas seleccionadas.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
              <select
                value={formData.campus}
                onChange={(e) => {
                  const newCampus = e.target.value;
                  const shouldShowManager = (formData.role === 'employee' || formData.role === 'colaborador_vaf') ||
                    (formData.role === 'office_manager' && newCampus === 'Todas') ||
                    formData.role === 'jefe_campus_vaf';
                  setFormData({ ...formData, campus: newCampus, manager_id: shouldShowManager ? formData.manager_id : '' });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="">Seleccionar Campus</option>
                <option value="Valledupar">Valledupar</option>
                <option value="Bogota">Bogota</option>
                <option value="Cúcuta">Cúcuta</option>
                <option value="Bucaramanga">Bucaramanga</option>
                <option value="Arauca">Arauca</option>
                <option value="Todas">Todas</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {editingCollaborator ? 'Actualizar' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {showImport && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Importar Colaboradores desde Excel</h3>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Archivo Excel</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={!importFile}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Importar
            </button>
            <button
              onClick={() => { setShowImport(false); setImportFile(null); }}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            El archivo debe tener las columnas: Nombre Completo, No. de Cedula, Correo, Rol, Oficina, Jefe Inmediato, Campus
            <br />
            <a href="/plantilla_colaboradores.xlsx" download className="text-blue-600 underline">Descargar plantilla</a>
          </p>
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre o cédula..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Cédula</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Rol</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Oficina</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Campus</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Jefe</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCollaborators.map((collaborator) => (
                <tr key={collaborator.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{collaborator.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{collaborator.identification}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium capitalize">
                      {collaborator.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{collaborator.offices?.map(o => o.name).join(', ') || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{collaborator.campus}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{collaborator.manager?.full_name || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(collaborator)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(collaborator.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredCollaborators.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? 'No se encontraron colaboradores' : 'No hay colaboradores registrados'}
        </div>
      )}
    </div>
  );
}
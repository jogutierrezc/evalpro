import { useState, useEffect } from 'react';
import { supabase, User, Office, UserRole } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search, Upload } from 'lucide-react';
import * as XLSX from 'xlsx';

export function UsersManagement() {
  const [users, setUsers] = useState<(User & { office?: Office; manager?: User })[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    identification: '',
    full_name: '',
    email: '',
    role: 'employee' as UserRole,
    office_id: '',
    manager_id: '',
    campus: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, officesRes] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('*').order('name'),
      ]);

      if (usersRes.error) throw usersRes.error;
      if (officesRes.error) throw officesRes.error;

      const usersWithRelations = await Promise.all(
        (usersRes.data || []).map(async (user) => {
          const office = officesRes.data?.find((o) => o.id === user.office_id);
          const manager = usersRes.data?.find((u) => u.id === user.manager_id);
          return { ...user, office, manager };
        })
      );

      setUsers(usersWithRelations);
      setOffices(officesRes.data || []);
      setManagers(usersRes.data?.filter((u) => u.role === 'office_manager') || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const userData = {
        identification: formData.identification,
        full_name: formData.full_name,
        email: formData.email || null,
        role: formData.role,
        office_id: formData.office_id || null,
        manager_id: formData.manager_id || null,
        campus: formData.campus || null,
        updated_at: new Date().toISOString(),
      };

      if (editingUser) {
        const { error } = await supabase.from('users').update(userData).eq('id', editingUser.id);
        if (error) throw error;
      } else {
        if (formData.role === 'admin') {
          // Create auth user for admin
          const identification = formData.identification.trim();
          const emailToUse = (formData.email || '').trim() || `${identification}@evaluation.local`;
          const passwordToUse = identification; // requirement: cedula as password

          console.debug('Creating auth user with email:', emailToUse);

          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: emailToUse,
            password: passwordToUse,
          });

          if (signUpError) {
            console.error('Auth signUp error:', signUpError);
            throw signUpError;
          }

          const createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id || (signUpData as any)?.userId;
          if (!createdUserId) {
            console.warn('Could not determine created user id from signUp response:', signUpData);
          }

          const { error: userError } = await supabase.from('users').insert([{ ...userData, id: createdUserId || undefined, email: emailToUse }]);
          if (userError) {
            console.error('Error inserting into users table:', userError);
            throw userError;
          }
        } else {
          // For non-admin users, insert directly
          const userId = crypto.randomUUID();
          const { error: userError } = await supabase.from('users').insert([{ ...userData, id: userId }]);
          if (userError) {
            console.error('Error inserting into users table:', userError);
            throw userError;
          }
        }
      }

      resetForm();
      loadData();
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Error al guardar el usuario');
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      identification: user.identification,
      full_name: user.full_name,
      email: user.email || '',
      role: user.role,
      office_id: user.office_id || '',
      manager_id: user.manager_id || '',
      campus: user.campus || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este usuario?')) return;

    try {
      const { error } = await supabase.from('users').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Error al eliminar el usuario');
    }
  };

  const resetForm = () => {
    setFormData({
      identification: '',
      full_name: '',
      email: '',
      role: 'employee',
      office_id: '',
      manager_id: '',
      campus: '',
    });
    setEditingUser(null);
    setShowForm(false);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.identification.includes(searchTerm)
  );

  const handleImport = async () => {
    if (!importFile) return;

    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet);

      const roleMap: Record<string, UserRole> = {
        'Colaborador': 'employee',
        'Jefe de Oficina': 'office_manager',
        'Jefe VAF': 'jefe_vaf',
        'Jefe Campus VAF': 'jefe_campus_vaf',
        'Administrador': 'admin',
      };

      const officeMap = offices.reduce((acc, office) => {
        acc[office.name] = office.id;
        return acc;
      }, {} as Record<string, string>);

      const managerMap = users.reduce((acc, user) => {
        acc[user.full_name] = user.id;
        return acc;
      }, {} as Record<string, string>);

      for (const row of jsonData as any[]) {
        const identification = row['No. de Cedula']?.toString().trim();
        const full_name = row['Nombre Completo']?.toString().trim();
        const email = row['Correo']?.toString().trim() || null;
        const roleStr = row['Rol']?.toString().trim();
        const officeName = row['Oficina']?.toString().trim();
        const managerName = row['Jefe Inmediato']?.toString().trim();
        const campus = row['Campus']?.toString().trim() || null;

        if (!identification || !full_name || !roleStr) continue;

        const role = roleMap[roleStr];
        if (!role) continue;

        const office_id = officeName ? officeMap[officeName] : null;
        const manager_id = managerName ? managerMap[managerName] : null;

        if (role === 'admin') {
          // Create auth user for admin
          const emailToUse = email || `${identification}@evaluation.local`;
          const passwordToUse = identification;

          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: emailToUse,
            password: passwordToUse,
          });

          if (signUpError) {
            console.error('Auth signUp error for', full_name, signUpError);
            continue;
          }

          const createdUserId = (signUpData as any)?.user?.id || (signUpData as any)?.id;

          const { error: userError } = await supabase.from('users').insert([{
            id: createdUserId,
            identification,
            full_name,
            email: emailToUse,
            role,
            office_id,
            manager_id,
            campus,
          }]);

          if (userError) {
            console.error('Error inserting user', full_name, userError);
          }
        } else {
          // For non-admin, insert directly
          const userId = crypto.randomUUID();
          const { error: userError } = await supabase.from('users').insert([{
            id: userId,
            identification,
            full_name,
            email: email || null,
            role,
            office_id,
            manager_id,
            campus,
          }]);

          if (userError) {
            console.error('Error inserting user', full_name, userError);
          }
        }
      }

      alert('Importación completada');
      setShowImport(false);
      setImportFile(null);
      loadData();
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
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Personal</h2>
        {!showForm && !showImport && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nuevo Usuario
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
            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
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
                disabled={!!editingUser}
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
                onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="employee">Colaborador</option>
                <option value="office_manager">Jefe de Oficina</option>
                <option value="jefe_vaf">Jefe VAF</option>
                <option value="jefe_campus_vaf">Jefe Campus VAF</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Oficina</label>
              <select
                value={formData.office_id}
                onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sin asignar</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Campus</label>
              <select
                value={formData.campus}
                onChange={(e) => setFormData({ ...formData, campus: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sin asignar</option>
                <option value="Valledupar">Valledupar</option>
                <option value="Bogota">Bogota</option>
                <option value="Cúcuta">Cúcuta</option>
                <option value="Bucaramanga">Bucaramanga</option>
                <option value="Arauca">Arauca</option>
                <option value="Todas">Todas</option>
              </select>
            </div>
            {formData.role === 'employee' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Jefe Inmediato</label>
                <select
                  value={formData.manager_id}
                  onChange={(e) => setFormData({ ...formData, manager_id: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Sin asignar</option>
                  {managers
                    .filter((m) => m.office_id === formData.office_id)
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.full_name}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {editingUser ? 'Actualizar' : 'Guardar'}
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
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Importar Usuarios desde Excel</h3>
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
            <a href="/plantilla_usuarios.xlsx" download className="text-blue-600 underline">Descargar plantilla</a>
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
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{user.full_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.identification}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium capitalize">
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.office?.name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.campus || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{user.manager?.full_name || '-'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
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

      {filteredUsers.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {searchTerm ? 'No se encontraron usuarios' : 'No hay usuarios registrados'}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase, User, Office, UserRole } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';

export function UsersManagement() {
  const [users, setUsers] = useState<(User & { office?: Office; manager?: User })[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    identification: '',
    full_name: '',
    email: '',
    role: 'employee' as UserRole,
    office_id: '',
    manager_id: '',
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
        updated_at: new Date().toISOString(),
      };

      if (editingUser) {
        const { error } = await supabase
          .from('users')
          .update(userData)
          .eq('id', editingUser.id);

        if (error) throw error;
      } else {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: `${formData.identification}@evaluation.local`,
          password: formData.identification,
        });

        if (authError) throw authError;

        const { error: userError } = await supabase
          .from('users')
          .insert([{ ...userData, id: authData.user?.id }]);

        if (userError) throw userError;
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
    });
    setEditingUser(null);
    setShowForm(false);
  };

  const filteredUsers = users.filter(
    (user) =>
      user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.identification.includes(searchTerm)
  );

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Personal</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nuevo Usuario
          </button>
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

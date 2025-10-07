import { useState, useEffect } from 'react';
import { supabase, Office } from '../../lib/supabase';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export function OfficesManagement() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingOffice, setEditingOffice] = useState<Office | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  useEffect(() => {
    loadOffices();
  }, []);

  const loadOffices = async () => {
    try {
      const { data, error } = await supabase
        .from('offices')
        .select('*')
        .order('name');

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingOffice) {
        const { error } = await supabase
          .from('offices')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingOffice.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('offices')
          .insert([formData]);

        if (error) throw error;
      }

      setFormData({ name: '', description: '' });
      setEditingOffice(null);
      setShowForm(false);
      loadOffices();
    } catch (error) {
      console.error('Error saving office:', error);
      alert('Error al guardar la oficina');
    }
  };

  const handleEdit = (office: Office) => {
    setEditingOffice(office);
    setFormData({ name: office.name, description: office.description || '' });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta oficina?')) return;

    try {
      const { error } = await supabase
        .from('offices')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadOffices();
    } catch (error) {
      console.error('Error deleting office:', error);
      alert('Error al eliminar la oficina');
    }
  };

  const handleCancel = () => {
    setFormData({ name: '', description: '' });
    setEditingOffice(null);
    setShowForm(false);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Gestión de Oficinas</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Nueva Oficina
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            {editingOffice ? 'Editar Oficina' : 'Nueva Oficina'}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la Oficina
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {editingOffice ? 'Actualizar' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {offices.map((office) => (
          <div key={office.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-semibold text-gray-900">{office.name}</h3>
              <div className="flex gap-1">
                <button
                  onClick={() => handleEdit(office)}
                  className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  title="Editar"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(office.id)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {office.description && (
              <p className="text-sm text-gray-600">{office.description}</p>
            )}
          </div>
        ))}
      </div>

      {offices.length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-500">
          No hay oficinas registradas. Crea una nueva oficina para comenzar.
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase, EvaluationTemplate, EvaluationQuestion } from '../../lib/supabase';
import { Plus, Edit2, Trash2, Eye } from 'lucide-react';
import { TemplateForm } from './TemplateForm';
import { TemplatePreview } from './TemplatePreview';

export function TemplatesManagement() {
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EvaluationTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EvaluationTemplate | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('evaluation_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: EvaluationTemplate) => {
    setEditingTemplate(template);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este formulario?')) return;

    try {
      const { error } = await supabase
        .from('evaluation_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Error al eliminar el formulario');
    }
  };

  const handleToggleActive = async (template: EvaluationTemplate) => {
    try {
      const { error } = await supabase
        .from('evaluation_templates')
        .update({ is_active: !template.is_active })
        .eq('id', template.id);

      if (error) throw error;
      loadTemplates();
    } catch (error) {
      console.error('Error updating template:', error);
    }
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      soft_skills: 'Habilidades Blandas',
      self_evaluation: 'Autoevaluación',
      manager_to_employee: 'Evaluación Jefe a Colaborador',
      employee_to_manager: 'Evaluación Colaborador a Jefe',
    };
    return labels[type] || type;
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  if (previewTemplate) {
    return (
      <TemplatePreview
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />
    );
  }

  if (showForm) {
    return (
      <TemplateForm
        template={editingTemplate}
        onClose={handleFormClose}
      />
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Formularios de Evaluación</h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nuevo Formulario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`bg-white border-2 rounded-lg p-5 transition-all ${
              template.is_active ? 'border-green-200' : 'border-gray-200'
            }`}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
                <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                  {getTypeLabel(template.type)}
                </span>
                {template.job_position && (
                  <span className="inline-block ml-2 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {template.job_position}
                  </span>
                )}
              </div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={template.is_active}
                  onChange={() => handleToggleActive(template)}
                  className="sr-only peer"
                />
                <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            {template.description && (
              <p className="text-sm text-gray-600 mb-4">{template.description}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setPreviewTemplate(template)}
                className="flex items-center gap-1 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded transition-colors text-sm"
                title="Ver"
              >
                <Eye className="w-4 h-4" />
                Ver
              </button>
              <button
                onClick={() => handleEdit(template)}
                className="flex items-center gap-1 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded transition-colors text-sm"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => handleDelete(template.id)}
                className="flex items-center gap-1 text-red-600 hover:bg-red-50 px-3 py-1.5 rounded transition-colors text-sm"
                title="Eliminar"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No hay formularios registrados. Crea un nuevo formulario para comenzar.
        </div>
      )}
    </div>
  );
}

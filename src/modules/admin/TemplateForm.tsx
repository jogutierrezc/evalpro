import { useState, useEffect } from 'react';
import { supabase, EvaluationTemplate, EvaluationQuestion } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Trash2, ArrowLeft, GripVertical } from 'lucide-react';

interface TemplateFormProps {
  template: EvaluationTemplate | null;
  onClose: () => void;
}

export function TemplateForm({ template, onClose }: TemplateFormProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'soft_skills' as const,
    job_position: '',
    is_active: true,
  });
  const [questions, setQuestions] = useState<Partial<EvaluationQuestion>[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        type: template.type,
        job_position: template.job_position || '',
        is_active: template.is_active,
      });
      loadQuestions(template.id);
    } else {
      addQuestion();
    }
  }, [template]);

  const loadQuestions = async (templateId: string) => {
    try {
      const { data, error } = await supabase
        .from('evaluation_questions')
        .select('*')
        .eq('template_id', templateId)
        .order('order_index');

      if (error) throw error;
      setQuestions(data || []);
      if (data?.length === 0) addQuestion();
    } catch (error) {
      console.error('Error loading questions:', error);
    }
  };

  const addQuestion = () => {
    setQuestions([
      ...questions,
      {
        question_text: '',
        question_type: 'rating',
        options: null,
        order_index: questions.length,
      },
    ]);
  };

  const updateQuestion = (index: number, field: string, value: any) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    if (questions.length === 1) {
      alert('Debe haber al menos una pregunta');
      return;
    }
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let templateId = template?.id;

      if (template) {
        const { error } = await supabase
          .from('evaluation_templates')
          .update({
            ...formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('evaluation_templates')
          .insert([{ ...formData, created_by: user?.id }])
          .select()
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      if (template) {
        await supabase
          .from('evaluation_questions')
          .delete()
          .eq('template_id', template.id);
      }

      const questionsToInsert = questions.map((q, index) => ({
        template_id: templateId,
        question_text: q.question_text,
        question_type: q.question_type,
        options: q.options,
        order_index: index,
      }));

      const { error: questionsError } = await supabase
        .from('evaluation_questions')
        .insert(questionsToInsert);

      if (questionsError) throw questionsError;

      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Error al guardar el formulario');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Volver
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-6">
        {template ? 'Editar Formulario' : 'Nuevo Formulario'}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Información del Formulario</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre del Formulario
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({ ...formData, type: e.target.value as any })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                <option value="soft_skills">Habilidades Blandas</option>
                <option value="self_evaluation">Autoevaluación</option>
                <option value="manager_to_employee">Evaluación Jefe a Colaborador</option>
                <option value="employee_to_manager">Evaluación Colaborador a Jefe</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Puesto de Trabajo (Opcional)
              </label>
              <input
                type="text"
                value={formData.job_position}
                onChange={(e) => setFormData({ ...formData, job_position: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: Analista, Coordinador"
              />
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Formulario activo</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Preguntas</h3>
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Pregunta
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((question, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-start gap-3">
                  <div className="mt-3">
                    <GripVertical className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pregunta {index + 1}
                      </label>
                      <input
                        type="text"
                        value={question.question_text}
                        onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="Escribe la pregunta..."
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                        <select
                          value={question.question_type}
                          onChange={(e) => updateQuestion(index, 'question_type', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                          <option value="rating">Escala (1-5)</option>
                          <option value="text">Texto Libre</option>
                          <option value="multiple_choice">Opción Múltiple</option>
                        </select>
                      </div>

                      {question.question_type === 'multiple_choice' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Opciones (separadas por coma)
                          </label>
                          <input
                            type="text"
                            value={
                              Array.isArray(question.options)
                                ? question.options.join(', ')
                                : ''
                            }
                            onChange={(e) =>
                              updateQuestion(
                                index,
                                'options',
                                e.target.value.split(',').map((opt) => opt.trim())
                              )
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Opción 1, Opción 2, Opción 3"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeQuestion(index)}
                    className="mt-2 p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="Eliminar pregunta"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Guardando...' : template ? 'Actualizar Formulario' : 'Crear Formulario'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

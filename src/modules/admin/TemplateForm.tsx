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

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    type: 'soft_skills' | 'self_evaluation' | 'manager_to_employee' | 'employee_to_manager';
    job_position: string;
    is_active: boolean;
    categories?: string[];
  }>({
    name: '',
    description: '',
    type: 'soft_skills',
    job_position: '',
    is_active: true,
    categories: [],
  });

  const [sections, setSections] = useState<{
    title: string;
    domain_key?: string | null;
    category?: string | null;
    questions: Partial<EvaluationQuestion>[];
  }[]>([]);

  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<any>(null);

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name,
        description: template.description || '',
        type: template.type,
        job_position: template.job_position || '',
        is_active: template.is_active,
        categories: (template as any).categories || [],
      });
      loadQuestions(template.id);
    } else {
      setSections([{ title: 'General', domain_key: null, category: null, questions: [{ question_text: '', question_type: 'rating', options: null }] }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const loadQuestions = async (templateId: string) => {
    try {
      const { data: secs, error: secsErr } = await supabase
        .from('evaluation_sections')
        .select('*')
        .eq('template_id', templateId)
        .order('order_index');

      if (secsErr) throw secsErr;

  const builtSections: { title: string; domain_key?: string | null; questions: Partial<EvaluationQuestion>[] }[] = [];
      const sectionsList: any[] = secs || [];

      for (const s of sectionsList) {
        const { data: qs, error: qsErr } = await supabase
          .from('evaluation_questions')
          .select('*')
          .eq('template_id', templateId)
          .eq('section_id', s.id)
          .order('order_in_section');

        if (qsErr) throw qsErr;

  builtSections.push({ title: s.title || 'Sección', domain_key: s.domain_key || null, category: s.category || null, questions: qs || [] });
      }

      // fallback: if no sections found, include orphan questions under General
      if (builtSections.length === 0) {
        const { data: orphanQs, error: orphanErr } = await supabase
          .from('evaluation_questions')
          .select('*')
          .eq('template_id', templateId)
          .is('section_id', null)
          .order('order_index');

        if (orphanErr) throw orphanErr;

        if ((orphanQs || []).length > 0) {
    builtSections.push({ title: 'General', domain_key: null, category: null, questions: orphanQs || [] });
        }
      }

      if (builtSections.length === 0) {
  builtSections.push({ title: 'General', domain_key: null, category: null, questions: [{ question_text: '', question_type: 'rating', options: null }] });
      }

      setSections(builtSections);
    } catch (error) {
      console.error('Error loading sections/questions:', error);
    }
  };

  const addSection = (title = 'Nueva Sección') => setSections(prev => [...prev, { title, domain_key: null, questions: [{ question_text: '', question_type: 'rating', options: null }] }]);

  const addQuestionToSection = (sectionIndex: number) => {
    setSections(prev => {
      const next = [...prev];
      next[sectionIndex].questions.push({ question_text: '', question_type: 'rating', options: null });
      return next;
    });
  };

  const updateSectionCategory = (sectionIndex: number, category: string | null) => {
    setSections(prev => {
      const next = [...prev];
      next[sectionIndex] = { ...next[sectionIndex], category };
      return next;
    });
  };

  const updateQuestion = (sectionIndex: number, questionIndex: number, field: string, value: any) => {
    setSections(prev => {
      const next = [...prev];
      const q = next[sectionIndex].questions[questionIndex] || {};
      next[sectionIndex].questions[questionIndex] = { ...q, [field]: value };
      return next;
    });
  };

  const removeQuestion = (sectionIndex: number, questionIndex: number) => {
    setSections(prev => {
      const next = [...prev];
      if (next[sectionIndex].questions.length === 1) {
        if (!confirm('Eliminar esta sección también?')) return prev;
        next.splice(sectionIndex, 1);
      } else {
        next[sectionIndex].questions.splice(questionIndex, 1);
      }
  if (next.length === 0) next.push({ title: 'General', domain_key: null, questions: [{ question_text: '', question_type: 'rating', options: null }] });
      return next;
    });
  };

  const removeSection = (sectionIndex: number) => {
    if (!confirm('¿Eliminar sección y todas sus preguntas?')) return;
    setSections(prev => {
      const next = [...prev];
      next.splice(sectionIndex, 1);
  if (next.length === 0) next.push({ title: 'General', domain_key: null, questions: [{ question_text: '', question_type: 'rating', options: null }] });
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      template: { ...formData, id: template?.id },
      sections,
    };
    // deep copy so subsequent edits don't mutate the displayed preview
    setPreviewPayload(JSON.parse(JSON.stringify(payload)));
    setShowPreview(true);
  };

  const doSave = async () => {
    setShowPreview(false);
    setSaving(true);

    try {
      let templateId = template?.id;

      if (template) {
        const { error } = await supabase
          .from('evaluation_templates')
          .update({ ...formData, updated_at: new Date().toISOString(), categories: formData.categories || [] })
          .eq('id', template.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('evaluation_templates')
          .insert([{ ...formData, created_by: user?.id, categories: formData.categories || [] }])
          .select()
          .single();
        if (error) throw error;
        templateId = data.id;
      }

      // clean previous data for this template
      if (template) {
        await supabase.from('evaluation_questions').delete().eq('template_id', template.id);
        await supabase.from('evaluation_sections').delete().eq('template_id', template.id);
      }

      for (let sIndex = 0; sIndex < sections.length; sIndex++) {
        const sec = sections[sIndex];
        const { data: secData, error: secErr } = await supabase
          .from('evaluation_sections')
          .insert([{ template_id: templateId, title: sec.title, order_index: sIndex, domain_key: sec.domain_key || null, category: sec.category || null }])
          .select()
          .single();

        if (secErr) {
          console.error('Error creating section', { sec, secErr });
          throw secErr;
        }

        if (!secData || !secData.id) {
          console.error('No section data returned from insert', { sec, secData });
          throw new Error('No section id after insert');
        }

        const secId = secData.id;

        if (sec.questions && sec.questions.length > 0) {
          const questionsToInsert = sec.questions.map((q: any, qi: number) => ({
            template_id: templateId,
            section_id: secId,
            question_text: q.question_text,
            question_type: q.question_type || 'rating',
            options: q.options || null,
            order_index: (sIndex * 1000) + qi,
            order_in_section: qi + 1,
          }));

          const { error: questionsError } = await supabase.from('evaluation_questions').insert(questionsToInsert);

          if (questionsError) {
            console.error('Error inserting questions for section', { secId, questionsToInsert, questionsError });
            throw questionsError;
          } else {
            console.debug('Inserted questions for section', { secId, count: questionsToInsert.length });
          }
        }
      }

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
      <button onClick={onClose} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
        <ArrowLeft className="w-5 h-5" />
        Volver
      </button>

      <h2 className="text-xl font-semibold text-gray-900 mb-6">{template ? 'Editar Formulario' : 'Nuevo Formulario'}</h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Información del Formulario</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Formulario</label>
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" required>
                <option value="soft_skills">Habilidades Blandas</option>
                <option value="self_evaluation">Autoevaluación</option>
                <option value="manager_to_employee">Evaluación Jefe a Colaborador</option>
                <option value="employee_to_manager">Evaluación Colaborador a Jefe</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Puesto de Trabajo (Opcional)</label>
              <input type="text" value={formData.job_position} onChange={(e) => setFormData({ ...formData, job_position: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Ej: Analista, Coordinador" />
            </div>

            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <span className="ml-2 text-sm font-medium text-gray-700">Formulario activo</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" rows={3} />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Preguntas</h3>
            <div className="flex gap-2">
              <button type="button" onClick={() => addSection()} className="flex items-center gap-2 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
                Agregar Sección
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {sections.map((sec, sIndex) => (
              <div key={sIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-gray-400" />
                    <input placeholder="Título de sección" type="text" value={sec.title} onChange={(e) => { const newSections = [...sections]; newSections[sIndex] = { ...newSections[sIndex], title: e.target.value }; setSections(newSections); }} className="text-lg font-semibold px-2 py-1 border-b border-gray-200 bg-transparent focus:outline-none" aria-label={`Título de sección ${sec.title || sIndex + 1}`} />
                    <select value={sec.domain_key || ''} onChange={(e) => { const newSections = [...sections]; newSections[sIndex] = { ...newSections[sIndex], domain_key: e.target.value || null }; setSections(newSections); }} className="ml-4 px-2 py-1 border rounded text-sm">
                      <option value="">Sin asignar</option>
                      <option value="autoconciencia">Autoconciencia</option>
                      <option value="autogestion">Autogestión</option>
                      <option value="conciencia_social">Conciencia Social</option>
                      <option value="gestion_relaciones">Gestión de Relaciones</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => addQuestionToSection(sIndex)} className="text-sm text-blue-600 hover:bg-blue-50 px-2 py-1 rounded">+ Pregunta</button>
                    <button type="button" onClick={() => removeSection(sIndex)} className="text-sm text-red-600 hover:bg-red-50 px-2 py-1 rounded">Eliminar Sección</button>
                  </div>
                </div>

                <div className="space-y-4">
                  {sec.questions.map((question, qIndex) => (
                    <div key={qIndex} className="border border-gray-200 rounded-lg p-4 bg-white">
                      <div className="flex items-start gap-3">
                        <div className="mt-3">
                          <GripVertical className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="flex-1 space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pregunta</label>
                            <input type="text" value={question.question_text || ''} onChange={(e) => updateQuestion(sIndex, qIndex, 'question_text', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Escribe la pregunta..." required />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                              <select value={question.question_type || 'rating'} onChange={(e) => updateQuestion(sIndex, qIndex, 'question_type', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                <option value="rating">Escala (1-5)</option>
                                <option value="text">Texto Libre</option>
                                <option value="multiple_choice">Opción Múltiple</option>
                              </select>
                            </div>

                            {question.question_type === 'multiple_choice' && (
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Opciones (separadas por coma)</label>
                                <input type="text" value={Array.isArray(question.options) ? question.options.join(', ') : ''} onChange={(e) => updateQuestion(sIndex, qIndex, 'options', e.target.value.split(',').map((opt) => opt.trim()))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Opción 1, Opción 2, Opción 3" />
                              </div>
                            )}
                          </div>
                        </div>

                        <button type="button" onClick={() => removeQuestion(sIndex, qIndex)} className="mt-2 p-2 text-red-600 hover:bg-red-50 rounded transition-colors" title="Eliminar pregunta">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors disabled:opacity-50">{saving ? 'Guardando...' : template ? 'Actualizar Formulario' : 'Crear Formulario'}</button>
          <button type="button" onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg transition-colors">Cancelar</button>
        </div>
      </form>

      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-11/12 max-w-2xl">
            <h3 className="text-lg font-semibold mb-4">Confirmar datos a guardar</h3>
            <div className="max-h-60 overflow-auto text-sm bg-gray-100 p-3 rounded">
              <div className="mb-4">
                <div className="text-lg font-semibold">{previewPayload?.template?.name || '(Sin nombre)'}</div>
                {previewPayload?.template?.description && (
                  <div className="text-sm text-gray-600">{previewPayload.template.description}</div>
                )}
              </div>

              {Array.isArray(previewPayload?.sections) && previewPayload.sections.length > 0 ? (
                previewPayload.sections.map((s: any, si: number) => (
                  <div key={si} className="mb-4">
                    <div className="text-md font-semibold text-gray-800">{s.title || 'Sin título'}</div>
                    <ol className="list-decimal list-inside mt-2 space-y-1">
                      {(s.questions || []).map((q: any, qi: number) => (
                        <li key={qi}>
                          <div className="font-medium">{q.question_text || '<sin texto>'}</div>
                          <div className="text-xs text-gray-600">Tipo: {q.question_type || 'rating'}{Array.isArray(q.options) && q.options.length ? ` — Opciones: ${q.options.join(', ')}` : ''}</div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-600">(No hay secciones)</div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
              <button onClick={doSave} className="px-4 py-2 bg-blue-600 text-white rounded">Confirmar y Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Evaluation, EvaluationTemplate, User } from '../lib/supabase';
import { FileText, Clock, CheckCircle, Play } from 'lucide-react';
import { EvaluationForm } from './evaluations/EvaluationForm';

export function EvaluationsModule() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState<
    (Evaluation & { template?: EvaluationTemplate; evaluator?: User; evaluated?: User })[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [availableSoftTemplates, setAvailableSoftTemplates] = useState<EvaluationTemplate[]>([]);
  const [takenTemplatesMap, setTakenTemplatesMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadEvaluations();
    loadAvailableSoftTemplates();
  }, [user]);

  const loadEvaluations = async () => {
    try {
      let query = supabase.from('evaluations').select('*');

      if (user?.role === 'admin') {
        query = query.order('created_at', { ascending: false });
      } else if (user?.role === 'office_manager') {
        const { data: officeUsers } = await supabase
          .from('users')
          .select('id')
          .eq('office_id', user.office_id);

        const userIds = officeUsers?.map((u) => u.id) || [];
        query = query.or(`evaluator_id.in.(${userIds.join(',')}),evaluated_id.in.(${userIds.join(',')})`);
      } else {
        query = query.or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`);
      }

      const { data: evaluationsData, error } = await query;
      if (error) throw error;

      const evaluationsWithDetails = await Promise.all(
        (evaluationsData || []).map(async (evaluation) => {
          const [templateRes, evaluatorRes, evaluatedRes] = await Promise.all([
            supabase.from('evaluation_templates').select('*').eq('id', evaluation.template_id).single(),
            supabase.from('users').select('*').eq('id', evaluation.evaluator_id).single(),
            supabase.from('users').select('*').eq('id', evaluation.evaluated_id).single(),
          ]);

          return {
            ...evaluation,
            template: templateRes.data,
            evaluator: evaluatorRes.data,
            evaluated: evaluatedRes.data,
          };
        })
      );

      setEvaluations(evaluationsWithDetails);
    } catch (error) {
      console.error('Error loading evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableSoftTemplates = async () => {
    try {
      // load active soft_skills templates
      const { data: templates, error: tplErr } = await supabase
        .from('evaluation_templates')
        .select('*')
        .eq('type', 'soft_skills')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (tplErr) throw tplErr;

      const tplList: EvaluationTemplate[] = templates || [];
      setAvailableSoftTemplates(tplList);

      if (!user || tplList.length === 0) {
        setTakenTemplatesMap({});
        return;
      }

      const templateIds = tplList.map((t) => t.id);

      // fetch evaluations for this user that use these templates
      const { data: existingEvals, error: evalErr } = await supabase
        .from('evaluations')
        .select('template_id')
        .eq('evaluated_id', user.id)
        .in('template_id', templateIds);

      if (evalErr) throw evalErr;

      const taken: Record<string, boolean> = {};
      (existingEvals || []).forEach((e: any) => {
        if (e.template_id) taken[e.template_id] = true;
      });

      setTakenTemplatesMap(taken);
    } catch (error) {
      console.error('Error loading available soft-skill templates:', error);
    }
  };

  const handleStartEvaluation = (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation);
  };

  const handleTakeSoftSkill = async (template: EvaluationTemplate) => {
    if (!user) return;

    // double-check if already taken
    if (takenTemplatesMap[template.id]) {
      alert('Ya has tomado esta prueba');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('evaluations')
        .insert([
          {
            template_id: template.id,
            evaluator_id: user.id,
            evaluated_id: user.id,
            status: 'pending',
          },
        ])
        .select('*')
        .single();

      if (error) throw error;

      // mark as taken locally
      setTakenTemplatesMap((m) => ({ ...m, [template.id]: true }));

      if (data) {
        setSelectedEvaluation(data as Evaluation);
      }
    } catch (error) {
      console.error('Error creating evaluation:', error);
      alert('No se pudo iniciar la evaluación');
    }
  };

  const handleCloseForm = () => {
    setSelectedEvaluation(null);
    loadEvaluations();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      in_progress: 'En Progreso',
      completed: 'Completada',
    };
    return labels[status] || status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (selectedEvaluation) {
    return <EvaluationForm evaluation={selectedEvaluation} onClose={handleCloseForm} />;
  }

  const myEvaluations = evaluations.filter((e) => e.evaluator_id === user?.id);
  const otherEvaluations = evaluations.filter((e) => e.evaluator_id !== user?.id);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Evaluaciones</h1>
        <p className="text-gray-600">Gestiona y completa tus evaluaciones</p>
      </div>
      {/* Available global soft-skills tests (single-use per user) */}
      {availableSoftTemplates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Pruebas de Habilidades Blandas</h2>
          <div className="space-y-3">
            {availableSoftTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow flex items-center justify-between"
              >
                <div>
                  <h3 className="font-semibold text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-600">{template.description}</p>
                </div>
                <div>
                  <button
                    onClick={() => handleTakeSoftSkill(template)}
                    disabled={!!takenTemplatesMap[template.id]}
                    className={`px-4 py-2 rounded-lg text-white transition-colors ${
                      takenTemplatesMap[template.id] ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {takenTemplatesMap[template.id] ? 'Ya tomado' : 'Tomar prueba'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {myEvaluations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Mis Evaluaciones Pendientes</h2>
          <div className="space-y-3">
            {myEvaluations
              .filter((e) => e.status !== 'completed')
              .map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getStatusIcon(evaluation.status)}
                        <h3 className="font-semibold text-gray-900">{evaluation.template?.name}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-1">
                        Evaluando a: <span className="font-medium">{evaluation.evaluated?.full_name}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Creada: {new Date(evaluation.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleStartEvaluation(evaluation)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <Play className="w-4 h-4" />
                      {evaluation.status === 'pending' ? 'Comenzar' : 'Continuar'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {user?.role !== 'employee' && otherEvaluations.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Todas las Evaluaciones</h2>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Formulario</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Evaluador</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Evaluado</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Estado</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {otherEvaluations.map((evaluation) => (
                    <tr key={evaluation.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{evaluation.template?.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{evaluation.evaluator?.full_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{evaluation.evaluated?.full_name}</td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            evaluation.status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : evaluation.status === 'in_progress'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {getStatusLabel(evaluation.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(evaluation.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {evaluations.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No hay evaluaciones disponibles en este momento
        </div>
      )}
    </div>
  );
}

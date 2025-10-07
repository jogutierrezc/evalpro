import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, EvaluationResult, Evaluation, User, Office, EvaluationTemplate } from '../lib/supabase';
import { TrendingUp, Users, Building2, BarChart3, ChevronRight, ChevronDown } from 'lucide-react';

interface ResultWithDetails extends EvaluationResult {
  evaluation?: Evaluation;
  evaluated?: User;
  evaluator?: User;
  template?: EvaluationTemplate;
  office?: Office;
}

export function ResultsModule() {
  const { user } = useAuth();
  const [results, setResults] = useState<ResultWithDetails[]>([]);
  const [groupedByOffice, setGroupedByOffice] = useState<Record<string, ResultWithDetails[]>>({});
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'individual' | 'office'>('individual');

  useEffect(() => {
    loadResults();
  }, [user]);

  const loadResults = async () => {
    try {
      let query = supabase.from('evaluation_results').select('*');

      const { data: resultsData, error } = await query;
      if (error) throw error;

      const resultsWithDetails = await Promise.all(
        (resultsData || []).map(async (result) => {
          const { data: evaluation } = await supabase
            .from('evaluations')
            .select('*')
            .eq('id', result.evaluation_id)
            .single();

          if (!evaluation) return result;

          const [evaluatedRes, evaluatorRes, templateRes] = await Promise.all([
            supabase.from('users').select('*').eq('id', evaluation.evaluated_id).single(),
            supabase.from('users').select('*').eq('id', evaluation.evaluator_id).single(),
            supabase.from('evaluation_templates').select('*').eq('id', evaluation.template_id).single(),
          ]);

          let office = null;
          if (evaluatedRes.data?.office_id) {
            const officeRes = await supabase
              .from('offices')
              .select('*')
              .eq('id', evaluatedRes.data.office_id)
              .single();
            office = officeRes.data;
          }

          return {
            ...result,
            evaluation,
            evaluated: evaluatedRes.data,
            evaluator: evaluatorRes.data,
            template: templateRes.data,
            office,
          };
        })
      );

      let filteredResults = resultsWithDetails;

      if (user?.role === 'office_manager') {
        filteredResults = resultsWithDetails.filter(
          (r) => r.evaluated?.office_id === user.office_id
        );
      } else if (user?.role === 'employee') {
        filteredResults = resultsWithDetails.filter(
          (r) => r.evaluation?.evaluated_id === user.id
        );
      }

      setResults(filteredResults);

      const grouped: Record<string, ResultWithDetails[]> = {};
      filteredResults.forEach((result) => {
        const officeId = result.office?.id || 'sin-oficina';
        if (!grouped[officeId]) {
          grouped[officeId] = [];
        }
        grouped[officeId].push(result);
      });

      setGroupedByOffice(grouped);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleOfficeExpand = (officeId: string) => {
    const newExpanded = new Set(expandedOffices);
    if (newExpanded.has(officeId)) {
      newExpanded.delete(officeId);
    } else {
      newExpanded.add(officeId);
    }
    setExpandedOffices(newExpanded);
  };

  const calculateOfficeAverage = (officeResults: ResultWithDetails[]) => {
    if (officeResults.length === 0) return 0;
    const total = officeResults.reduce((sum, r) => sum + (Number(r.overall_score) || 0), 0);
    return (total / officeResults.length).toFixed(2);
  };

  const getScoreColor = (score: number) => {
    if (score >= 4) return 'text-green-600';
    if (score >= 3) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 4) return 'bg-green-100';
    if (score >= 3) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Resultados</h1>
        <p className="text-gray-600">Análisis de evaluaciones y desempeño</p>
      </div>

      {user?.role !== 'employee' && (
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setViewMode('individual')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'individual'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Vista Individual
          </button>
          <button
            onClick={() => setViewMode('office')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              viewMode === 'office'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Vista por Oficina
          </button>
        </div>
      )}

      {viewMode === 'office' && user?.role !== 'employee' ? (
        <div className="space-y-4">
          {Object.entries(groupedByOffice).map(([officeId, officeResults]) => {
            const officeName = officeResults[0]?.office?.name || 'Sin Oficina';
            const average = Number(calculateOfficeAverage(officeResults));
            const isExpanded = expandedOffices.has(officeId);

            return (
              <div key={officeId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleOfficeExpand(officeId)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Building2 className="w-6 h-6 text-blue-600" />
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{officeName}</h3>
                      <p className="text-sm text-gray-600">
                        {officeResults.length} evaluación{officeResults.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Promedio</p>
                      <p className={`text-2xl font-bold ${getScoreColor(average)}`}>
                        {average}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 p-6 bg-gray-50">
                    <div className="space-y-3">
                      {officeResults.map((result) => (
                        <div
                          key={result.id}
                          className="bg-white rounded-lg border border-gray-200 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">
                                {result.evaluated?.full_name}
                              </h4>
                              <p className="text-sm text-gray-600">
                                {result.template?.name}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Evaluador: {result.evaluator?.full_name}
                              </p>
                            </div>
                            <div className="text-right">
                              <div
                                className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(
                                  Number(result.overall_score)
                                )}`}
                              >
                                <span
                                  className={`text-2xl font-bold ${getScoreColor(
                                    Number(result.overall_score)
                                  )}`}
                                >
                                  {result.overall_score}
                                </span>
                              </div>
                            </div>
                          </div>
                          {result.ai_analysis && (
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm text-gray-700">{result.ai_analysis}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {results.map((result) => (
            <div key={result.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">
                    {result.template?.name}
                  </h3>
                  <p className="text-gray-600 mb-2">
                    Evaluado: <span className="font-medium">{result.evaluated?.full_name}</span>
                  </p>
                  <p className="text-sm text-gray-500">
                    Evaluador: {result.evaluator?.full_name}
                  </p>
                  {result.office && (
                    <p className="text-sm text-gray-500">Oficina: {result.office.name}</p>
                  )}
                </div>
                <div
                  className={`flex items-center justify-center w-20 h-20 rounded-full ${getScoreBgColor(
                    Number(result.overall_score)
                  )}`}
                >
                  <span
                    className={`text-3xl font-bold ${getScoreColor(Number(result.overall_score))}`}
                  >
                    {result.overall_score}
                  </span>
                </div>
              </div>

              {result.ai_analysis && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Análisis IA</h4>
                  <p className="text-sm text-gray-700">{result.ai_analysis}</p>
                </div>
              )}

              {result.recommendations && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Recomendaciones</h4>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {Array.isArray(result.recommendations)
                      ? result.recommendations.map((rec: string, idx: number) => (
                          <li key={idx}>• {rec}</li>
                        ))
                      : null}
                  </ul>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Evaluación completada el {new Date(result.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No hay resultados disponibles</p>
        </div>
      )}
    </div>
  );
}

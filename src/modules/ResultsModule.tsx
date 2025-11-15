import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, EvaluationResult, Evaluation, User, Office, EvaluationTemplate } from '../lib/supabase';
import { Building2, BarChart3, ChevronRight, ChevronDown } from 'lucide-react';
import SectionAnalysis from './SectionAnalysis';

interface ResultWithDetails extends EvaluationResult {
  evaluation?: Evaluation;
  evaluated?: User;
  evaluator?: User;
  template?: EvaluationTemplate;
  office?: Office;
  hasResult?: boolean;
  sectionsSummary?: Array<{
    sectionId: string | null;
    sectionName: string;
    avg: number | null;
    questions: Array<{ id: string; text: string; type: string; weight?: number; response?: any }>;
  }>;
  avgScore?: number | null;
}

export function ResultsModule() {
  const { user } = useAuth();
  const [results, setResults] = useState<ResultWithDetails[]>([]);
  const [groupedByOffice, setGroupedByOffice] = useState<Record<string, ResultWithDetails[]>>({});
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'individual' | 'office'>('individual');
  const [selectedResultForAnalysis, setSelectedResultForAnalysis] = useState<ResultWithDetails | null>(null);

  useEffect(() => {
    loadResults();
  }, [user]);

  const loadResults = async () => {
    try {
      // load existing evaluation results
      const { data: resultsData, error } = await supabase.from('evaluation_results').select('*');
      if (error) throw error;

      const resultsWithDetails = await Promise.all(
        (resultsData || []).map(async (result) => {
          const { data: evaluation } = await supabase
            .from('evaluations')
            .select('*')
            .eq('id', result.evaluation_id)
            .single();

          if (!evaluation) return { ...(result as any), hasResult: true };

          const [evaluatedRes, evaluatorRes, templateRes] = await Promise.all([
            supabase.from('users').select('*').eq('id', evaluation.evaluated_id).single(),
            supabase.from('users').select('*').eq('id', evaluation.evaluator_id).single(),
            supabase.from('evaluation_templates').select('*').eq('id', evaluation.template_id).single(),
          ]);

          // fetch sections, questions and responses for per-section breakdown
          const [sectionsRes, questionsRes, responsesRes] = await Promise.all([
            supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id),
            supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id),
            supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
          ]);

          const sectionsList: any[] = sectionsRes.data || [];
          const questionsList: any[] = questionsRes.data || [];
          const responsesList: any[] = responsesRes.data || [];

          const respMap: Record<string, any> = {};
          responsesList.forEach((r: any) => { respMap[r.question_id] = r.response_value; });

          const sectionsSummary = (sectionsList || []).map((s) => {
            const qs = (questionsList || []).filter((q: any) => q.section_id === s.id);
            const qDetails = qs.map((q: any) => ({ id: q.id, text: q.question_text || '', type: q.question_type, weight: Number(q.weight || 0), response: respMap[q.id] }));
            const ratingQs = qDetails.filter((q: any) => q.type === 'rating' && q.response !== undefined && q.response !== null);
            const hasWeights = ratingQs.some((q: any) => Number(q.weight || 0) > 0);
            let avg: number | null = null;
            if (ratingQs.length > 0) {
              if (hasWeights) {
                let ssum = 0; let wsum = 0;
                ratingQs.forEach((q: any) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
                avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
              } else {
                const ratingVals = ratingQs.map((q: any) => Number(q.response));
                avg = Math.round((ratingVals.reduce((a: number, b: number) => a + b, 0) / ratingVals.length) * 100) / 100;
              }
            }
            return { sectionId: s.id, sectionName: s.name || s.title || `Sección ${s.id}`, avg, questions: qDetails };
          });

          // compute overall average for the exam using rating questions across all sections
          const allRatingQs = sectionsSummary.flatMap((sec) => (sec.questions || []).filter((q: any) => q.type === 'rating' && q.response !== undefined && q.response !== null));
          let avgScore: number | null = null;
          if (allRatingQs.length > 0) {
            const hasWeightsAll = allRatingQs.some((q: any) => Number(q.weight || 0) > 0);
            if (hasWeightsAll) {
              let ssum = 0; let wsum = 0;
              allRatingQs.forEach((q: any) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
              avgScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
            } else {
              const vals = allRatingQs.map((q: any) => Number(q.response)).filter((v: number) => !isNaN(v));
              avgScore = vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 100) / 100 : null;
            }
          } else {
            avgScore = (typeof (result as any).overall_score === 'number') ? Number((result as any).overall_score) : null;
          }

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
            hasResult: true,
            sectionsSummary,
            avgScore,
          };
        })
      );

      // load evaluations that don't have a result yet so the UI can show "in progress / assigned" items
      const { data: allEvals } = await supabase.from('evaluations').select('*').order('created_at', { ascending: false });
      const evalIdsWithResults = new Set((resultsData || []).map((r: any) => r.evaluation_id));
      const evalsNoResults = (allEvals || []).filter((e: any) => !evalIdsWithResults.has(e.id));

      const evalsNoResultWithDetails = await Promise.all(
        evalsNoResults.map(async (evaluation: any) => {
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

          // fetch sections, questions, and responses to compute partial averages for in-progress evaluations
          const [sectionsRes, questionsRes, responsesRes] = await Promise.all([
            supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id),
            supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id),
            supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
          ]);
          const sectionsList: any[] = sectionsRes.data || [];
          const questionsList: any[] = questionsRes.data || [];
          const responsesList: any[] = responsesRes.data || [];

          const respMap: Record<string, any> = {};
          (responsesList || []).forEach((r: any) => { respMap[r.question_id] = r.response_value; });

          const sectionsSummary = (sectionsList || []).map((s) => {
            const qs = (questionsList || []).filter((q: any) => q.section_id === s.id);
            const qDetails = qs.map((q: any) => ({ id: q.id, text: q.question_text || '', type: q.question_type, weight: Number(q.weight || 0), response: respMap[q.id] ?? null }));
            // compute weighted avg if there are responses
            const ratingQs = qDetails.filter((q: any) => q.type === 'rating' && q.response !== undefined && q.response !== null);
            let avg: number | null = null;
            if (ratingQs.length > 0) {
              const hasWeights = ratingQs.some((q: any) => Number(q.weight || 0) > 0);
              if (hasWeights) {
                let ssum = 0; let wsum = 0;
                ratingQs.forEach((q: any) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
                avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
              } else {
                const vals = ratingQs.map((q: any) => Number(q.response)).filter((v: number) => !isNaN(v));
                avg = vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 100) / 100 : null;
              }
            }
            return { sectionId: s.id, sectionName: s.name || s.title || `Sección ${s.id}`, avg, questions: qDetails };
          });

          // compute exam-level avg from any current responses
          const allRatingQs = sectionsSummary.flatMap((sec) => (sec.questions || []).filter((q: any) => q.type === 'rating' && q.response !== undefined && q.response !== null));
          let avgScore: number | null = null;
          if (allRatingQs.length > 0) {
            const hasWeightsAll = allRatingQs.some((q: any) => Number(q.weight || 0) > 0);
            if (hasWeightsAll) {
              let ssum = 0; let wsum = 0;
              allRatingQs.forEach((q: any) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
              avgScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
            } else {
              const vals = allRatingQs.map((q: any) => Number(q.response)).filter((v: number) => !isNaN(v));
              avgScore = vals.length > 0 ? Math.round((vals.reduce((a: number, b: number) => a + b, 0) / vals.length) * 100) / 100 : null;
            }
          }

          return {
            // use a string id to avoid collision with numeric evaluation_result ids
            id: `eval-${evaluation.id}`,
            evaluation,
            evaluated: evaluatedRes.data,
            evaluator: evaluatorRes.data,
            template: templateRes.data,
            office,
            hasResult: false,
            overall_score: null,
            created_at: evaluation.created_at,
            sectionsSummary,
            avgScore,
          } as any;
        })
      );

      let merged = [...resultsWithDetails, ...evalsNoResultWithDetails];

      let filteredResults = merged;

      if (user?.role === 'office_manager') {
        filteredResults = merged.filter(
          (r) => r.evaluated?.office_id === user.office_id
        );
      } else if (user?.role === 'employee') {
        filteredResults = merged.filter(
          (r) => r.evaluation?.evaluated_id === user.id || (r.evaluated && r.evaluated.id === user.id)
        );
      }

      setResults(filteredResults as ResultWithDetails[]);

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
    const valid = officeResults.map((r) => (typeof r.avgScore === 'number' ? Number(r.avgScore) : (typeof r.overall_score === 'number' ? Number(r.overall_score) : 0)));
    const total = valid.reduce((sum, v) => sum + (Number(v) || 0), 0);
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

  const exportSectionsCSV = (result: ResultWithDetails) => {
    try {
      const header = ['SECCIÓN', 'PROMEDIO', 'PREGUNTA', 'TIPO', 'PESO', 'RESPUESTA'];
      const rows: any[] = [];
      (result.sectionsSummary || []).forEach((s) => {
        if ((s.questions || []).length === 0) {
          rows.push([s.sectionName, s.avg ?? '', '', '', '', '']);
        } else {
          s.questions.forEach((q: any, idx: number) => {
            rows.push([idx === 0 ? s.sectionName : '', idx === 0 ? (s.avg ?? '') : '', q.text, q.type, q.weight ?? '', q.response ?? '']);
          });
        }
      });
      const csv = [header, ...rows]
        .map((r: any[]) => r.map((c: any) => `"${String(c).replace(/\"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `secciones_${result.evaluation?.id || result.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting sections CSV', err);
      alert('No se pudo exportar CSV de secciones.');
    }
  };

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
                              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(Number(result.avgScore || result.overall_score || 0))}`}>
                                <span className={`text-2xl font-bold ${getScoreColor(Number(result.avgScore || result.overall_score || 0))}`}>
                                  {(result.avgScore ?? result.overall_score ?? 0) as any}
                                </span>
                              </div>
                            </div>
                          </div>
                          {result.ai_analysis && (
                            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                              <p className="text-sm text-gray-700">{result.ai_analysis}</p>
                            </div>
                          )}
                          {result.sectionsSummary && result.sectionsSummary.length > 0 && (
                            <div className="mt-4">
                              <details className="text-sm">
                                <summary className="cursor-pointer text-blue-600">Desglose por sección ({result.sectionsSummary.length})</summary>
                                <div className="mt-2 text-xs text-gray-700">
                                  {result.sectionsSummary.map((s) => (
                                    <div key={s.sectionId} className={`mb-3 border rounded p-2 ${s.avg !== null && s.avg < 3 ? 'bg-red-50' : 'bg-white'}`}>
                                      <div className="flex justify-between items-center">
                                        <div className={`font-medium ${s.avg !== null && s.avg < 3 ? 'text-red-700' : ''}`}>{s.sectionName}</div>
                                        <div className={`text-sm ${s.avg !== null && s.avg < 3 ? 'text-red-700' : 'text-gray-600'}`}>Promedio: {s.avg !== null ? s.avg.toFixed(2) : '—'}</div>
                                      </div>
                                      <div className="mt-2">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr>
                                              <th className="text-left p-1">Pregunta</th>
                                              <th className="text-right p-1">Tipo</th>
                                              <th className="text-right p-1">Peso</th>
                                              <th className="text-right p-1">Respuesta</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {s.questions.map((q: any) => (
                                              <tr key={q.id} className="border-t">
                                                <td className="p-1">{q.text}</td>
                                                <td className="p-1 text-right">{q.type}</td>
                                                <td className="p-1 text-right">{q.weight ?? 0}</td>
                                                <td className="p-1 text-right">{q.response ?? '—'}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                              <div className="mt-2">
                                <button
                                  onClick={() => exportSectionsCSV(result)}
                                  className="px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
                                >
                                  Exportar CSV secciones
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={() => setSelectedResultForAnalysis(result)}
                              className="px-3 py-2 bg-blue-600 text-white rounded-md"
                            >
                              Ver Análisis
                            </button>
                          </div>
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
                <div className={`flex items-center justify-center w-20 h-20 rounded-full ${getScoreBgColor(Number(result.avgScore || result.overall_score || 0))}`}>
                  <span className={`text-3xl font-bold ${getScoreColor(Number(result.avgScore || result.overall_score || 0))}`}>
                    {(result.avgScore ?? result.overall_score ?? 0) as any}
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

              {/* Se retira el desglose por sección en vista individual según solicitud */}

              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500">
                  Evaluación completada el {new Date(result.created_at).toLocaleString()}
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => setSelectedResultForAnalysis(result)}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md"
                  >
                    Ver Análisis
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedResultForAnalysis && selectedResultForAnalysis.evaluation && (
        <SectionAnalysis evaluation={selectedResultForAnalysis.evaluation as any} onClose={() => setSelectedResultForAnalysis(null)} />
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

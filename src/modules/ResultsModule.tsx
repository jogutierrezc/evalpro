import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Evaluation } from '../lib/supabase';
import { BarChart3, Eye, Trash2, X, Search, Filter, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import SectionAnalysis, { SectionSummaryRow } from './SectionAnalysis';
import OfficeAnalysis from './OfficeAnalysis';
import CampusAnalysis from './CampusAnalysis';
import UniversityAnalysis from './UniversityAnalysis';

interface EvaluationListItem {
  id: string;
  evaluator_id: string;
  evaluated_id: string;
  template_id: string;
  created_at: string;
  completed: boolean;
  evaluator_name?: string;
  evaluated_name?: string;
  evaluator_office?: string;
  evaluated_office?: string;
  evaluator_campus?: string;
  evaluated_campus?: string;
  template_name?: string;
}

export interface ResultWithDetails {
  id: string;
  evaluatedName: string;
  evaluatorName: string;
  evaluatedOffice: string;
  evaluatorOffice: string;
  evaluatedCampus: string;
  evaluatorCampus: string;
  templateName: string;
  date: string;
  avgScore: number | null;
  sectionsSummary?: SectionSummaryRow[];
}

export function ResultsModule() {
  const { user } = useAuth();
  const [allEvaluations, setAllEvaluations] = useState<EvaluationListItem[]>([]);
  const [detailedResults, setDetailedResults] = useState<ResultWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'office' | 'campus' | 'university'>('individual');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [filterCampus, setFilterCampus] = useState('');
  const [filterEvaluator, setFilterEvaluator] = useState('');
  const [filterFormType, setFilterFormType] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [officeCurrentPage, setOfficeCurrentPage] = useState(1);
  const officePageSize = 10;
  
  // Modal for analysis
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  
  // Expanded office details
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);

  useEffect(() => {
    loadEvaluations();
  }, [user]);

  // Load detailed results when switching to aggregate views
  useEffect(() => {
    if (viewMode !== 'individual' && detailedResults.length === 0) {
      loadDetailedResults();
    }
  }, [viewMode]);

  // OPTIMIZED: Load only evaluation basics without sections/questions/responses
  const loadEvaluations = async () => {
    try {
      setLoading(true);

      // Get evaluations with basic info only - FILTER BY COMPLETED STATUS ONLY
      const { data: evals, error } = await supabase
        .from('evaluations')
        .select('id, evaluator_id, evaluated_id, template_id, created_at, status')
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Batch fetch all related users and templates
      const userIds = new Set([
        ...(evals || []).map(e => e.evaluator_id),
        ...(evals || []).map(e => e.evaluated_id)
      ]);

      const templateIds = new Set((evals || []).map(e => e.template_id));

      const [{ data: users }, { data: templates }] = await Promise.all([
        supabase.from('users').select('id, full_name, office_id, campus').in('id', Array.from(userIds)),
        supabase.from('evaluation_templates').select('id, name').in('id', Array.from(templateIds))
      ]);

      // Batch fetch offices for all users
      const officeIds = new Set((users || []).map(u => u.office_id).filter(Boolean));
      const { data: offices } = await supabase.from('offices').select('id, name').in('id', Array.from(officeIds));

      // Create lookup maps
      const userMap = new Map((users || []).map(u => [u.id, u]));
      const templateMap = new Map((templates || []).map(t => [t.id, t]));
      const officeMap = new Map((offices || []).map(o => [o.id, o]));

      // Transform data
      const evaluations: EvaluationListItem[] = (evals || []).map((e: any) => {
        const evaluator = userMap.get(e.evaluator_id);
        const evaluated = userMap.get(e.evaluated_id);
        const template = templateMap.get(e.template_id);
        const evaluatorOffice = evaluator?.office_id ? officeMap.get(evaluator.office_id) : null;
        const evaluatedOffice = evaluated?.office_id ? officeMap.get(evaluated.office_id) : null;

        return {
          id: e.id,
          evaluator_id: e.evaluator_id,
          evaluated_id: e.evaluated_id,
          template_id: e.template_id,
          created_at: e.created_at,
          completed: e.status === 'completed',
          evaluator_name: evaluator?.full_name,
          evaluated_name: evaluated?.full_name,
          evaluator_office: evaluatorOffice?.name,
          evaluated_office: evaluatedOffice?.name,
          evaluator_campus: evaluator?.campus,
          evaluated_campus: evaluated?.campus,
          template_name: template?.name,
        };
      });

      // Filter by role
      const roleLower = (user?.role || '').toLowerCase();
      const isAdmin = roleLower === 'admin' || roleLower.includes('administrador');

      let filtered = evaluations;
      if (!isAdmin) {
        filtered = evaluations.filter(
          (e) => e.evaluated_id === user?.id || e.evaluator_id === user?.id
        );
      }

      setAllEvaluations(filtered);
    } catch (error) {
      console.error('Error loading evaluations:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load detailed results with sections/questions/responses for aggregate views
  const loadDetailedResults = async () => {
    try {
      setLoadingDetailed(true);

      // Use allEvaluations as base - only load sections/questions once per UNIQUE template
      const evaluationsToLoad = allEvaluations;
      const uniqueTemplates = new Set(evaluationsToLoad.map(e => e.template_id));

      // Step 1: Load all sections and questions for each UNIQUE template (not per evaluation)
      const templateDataMap = new Map<string, {
        sections: any[];
        questions: any[];
      }>();

      const templateDataPromises = Array.from(uniqueTemplates).map(async (templateId) => {
        const [{ data: sections }, { data: questions }] = await Promise.all([
          supabase.from('evaluation_sections').select('*').eq('template_id', templateId),
          supabase.from('evaluation_questions').select('*').eq('template_id', templateId),
        ]);
        templateDataMap.set(templateId, { sections: sections || [], questions: questions || [] });
      });

      await Promise.all(templateDataPromises);

      // Step 2: Load ALL responses in ONE query
      const { data: allResponses } = await supabase
        .from('evaluation_responses')
        .select('*')
        .in('evaluation_id', evaluationsToLoad.map(e => e.id));

      const responseMap = new Map<string, any[]>();
      (allResponses || []).forEach(r => {
        if (!responseMap.has(r.evaluation_id)) {
          responseMap.set(r.evaluation_id, []);
        }
        responseMap.get(r.evaluation_id)!.push(r);
      });

      // Step 3: Process each evaluation to build ResultWithDetails
      const detailed: ResultWithDetails[] = evaluationsToLoad.map((evalItem) => {
        const templateData = templateDataMap.get(evalItem.template_id);
        const responses = responseMap.get(evalItem.id) || [];

        if (!templateData) {
          return {
            id: evalItem.id,
            evaluatedName: evalItem.evaluated_name || 'N/A',
            evaluatorName: evalItem.evaluator_name || 'N/A',
            evaluatedOffice: evalItem.evaluated_office || 'N/A',
            evaluatorOffice: evalItem.evaluator_office || 'N/A',
            evaluatedCampus: evalItem.evaluated_campus || 'N/A',
            evaluatorCampus: evalItem.evaluator_campus || 'N/A',
            templateName: evalItem.template_name || 'N/A',
            date: evalItem.created_at,
            avgScore: 0,
            sectionsSummary: []
          };
        }

        // Build response map for this evaluation
        const respMap: Record<string, any> = {};
        responses.forEach((r) => { respMap[r.question_id] = r.response_value; });

        // Build section summaries with proper weight-based averages
        const sectionsSummary: SectionSummaryRow[] = templateData.sections.map((s) => {
          const qs = templateData.questions.filter((q: any) => q.section_id === s.id);
          const qDetails = qs.map((q: any) => ({
            id: q.id,
            text: q.question_text || '',
            type: q.question_type,
            weight: Number(q.weight || 0),
            response: respMap[q.id]
          }));

          // Get only rating questions with valid responses
          const ratingQs = qDetails.filter((q) => q.type === 'rating' && q.response !== undefined && q.response !== null);
          const hasWeights = ratingQs.some((q) => Number(q.weight || 0) > 0);
          
          let avg: number | null = null;
          let sectionWeight = 0;

          if (ratingQs.length > 0) {
            if (hasWeights) {
              // Weighted average using question weights
              let ssum = 0, wsum = 0;
              ratingQs.forEach((q) => {
                const v = Number(q.response);
                const w = Number(q.weight || 0);
                if (!isNaN(v) && w > 0) { 
                  ssum += v * w; 
                  wsum += w; 
                }
              });
              avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
              // Section weight = sum of question weights
              sectionWeight = wsum;
            } else {
              // Simple arithmetic mean if no weights defined
              const vals = ratingQs.map((q) => Number(q.response)).filter(v => !isNaN(v));
              avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
              // If no explicit weights, use number of questions as implicit weight
              sectionWeight = ratingQs.length;
            }
          }

          return {
            sectionId: s.id,
            sectionName: s.name || s.title || `Sección ${s.id}`,
            avg,
            weight: sectionWeight,
            questions: qDetails
          };
        });

        // Normalize weights to percentages (for display)
        const totalWeight = sectionsSummary.reduce((sum, s) => sum + s.weight, 0);
        const originalWeights = sectionsSummary.map(s => s.weight); // Store original weights before normalization
        sectionsSummary.forEach(s => {
          s.weight = totalWeight > 0 ? Math.round((s.weight / totalWeight) * 100) : 0;
        });

        // Calculate global score as weighted average of section scores
        let globalScore = 0;
        const validSections = sectionsSummary.filter(s => s.avg !== null && s.avg !== undefined);
        
        if (validSections.length > 0 && totalWeight > 0) {
          // Use original weights for calculation, normalized weights just for display
          let ssum = 0, wsum = 0;
          validSections.forEach((s, idx) => {
            const sectionScore = Number(s.avg) || 0;
            const sectionWeight = originalWeights[sectionsSummary.indexOf(s)];
            if (!isNaN(sectionScore) && sectionWeight > 0) {
              ssum += sectionScore * sectionWeight;
              wsum += sectionWeight;
            }
          });
          globalScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : 0;
        } else if (validSections.length > 0) {
          // Fallback to simple average if no weights defined
          const scores = validSections.map(s => Number(s.avg)).filter(v => !isNaN(v));
          globalScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
        }

        return {
          id: evalItem.id,
          evaluatedName: evalItem.evaluated_name || 'N/A',
          evaluatorName: evalItem.evaluator_name || 'N/A',
          evaluatedOffice: evalItem.evaluated_office || 'N/A',
          evaluatorOffice: evalItem.evaluator_office || 'N/A',
          evaluatedCampus: evalItem.evaluated_campus || 'N/A',
          evaluatorCampus: evalItem.evaluator_campus || 'N/A',
          templateName: evalItem.template_name || 'N/A',
          date: evalItem.created_at,
          avgScore: globalScore,
          sectionsSummary
        };
      });

      setDetailedResults(detailed);
    } catch (error) {
      console.error('Error loading detailed results:', error);
    } finally {
      setLoadingDetailed(false);
    }
  };

  // Extract unique filter values
  const uniqueOffices = useMemo(() => {
    const offices = new Set(allEvaluations.map(e => e.evaluated_office).filter(Boolean));
    return Array.from(offices).sort();
  }, [allEvaluations]);

  const uniqueCampuses = useMemo(() => {
    const campuses = new Set(allEvaluations.map(e => e.evaluated_campus).filter(Boolean));
    return Array.from(campuses).sort();
  }, [allEvaluations]);

  const uniqueEvaluators = useMemo(() => {
    const evaluators = new Set(allEvaluations.map(e => e.evaluator_name).filter(Boolean));
    return Array.from(evaluators).sort();
  }, [allEvaluations]);

  const uniqueFormTypes = useMemo(() => {
    const types = new Set(allEvaluations.map(e => e.template_name).filter(Boolean));
    return Array.from(types).sort();
  }, [allEvaluations]);

  // Filter evaluations based on current filters
  const filteredEvaluations = useMemo(() => {
    return allEvaluations.filter(e => {
      const matchesSearch = !searchTerm ||
        e.evaluated_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.evaluator_name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesOffice = !filterOffice || e.evaluated_office === filterOffice;
      const matchesCampus = !filterCampus || e.evaluated_campus === filterCampus;
      const matchesEvaluator = !filterEvaluator || e.evaluator_name === filterEvaluator;
      const matchesFormType = !filterFormType || e.template_name === filterFormType;

      return matchesSearch && matchesOffice && matchesCampus && matchesEvaluator && matchesFormType;
    });
  }, [allEvaluations, searchTerm, filterOffice, filterCampus, filterEvaluator, filterFormType]);

  // Pagination
  const paginatedEvaluations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEvaluations.slice(start, start + pageSize);
  }, [filteredEvaluations, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredEvaluations.length / pageSize);

  // Load full evaluation for analysis
  const handleViewAnalysis = async (evalId: string) => {
    try {
      const { data: evaluation } = await supabase
        .from('evaluations')
        .select('*')
        .eq('id', evalId)
        .single();

      if (evaluation) {
        setSelectedEvaluation(evaluation);
      }
    } catch (error) {
      console.error('Error loading evaluation:', error);
    }
  };

  // Delete evaluation
  const handleDelete = async (evalId: string) => {
    try {
      const { error } = await supabase
        .from('evaluations')
        .delete()
        .eq('id', evalId);

      if (error) throw error;

      setDeleteConfirm(null);
      loadEvaluations();
    } catch (error) {
      console.error('Error deleting evaluation:', error);
      alert('Error al eliminar la evaluación');
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchTerm('');
    setFilterOffice('');
    setFilterCampus('');
    setFilterEvaluator('');
    setFilterFormType('');
    setCurrentPage(1);
  };

  const activeFiltersCount = [filterOffice, filterCampus, filterEvaluator, filterFormType]
    .filter(Boolean).length;

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
            onClick={() => {
              setViewMode('individual');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'individual'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            Vista de Lista
          </button>
          <button
            onClick={() => setViewMode('office')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'office'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
          >
            Vista por Oficina
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => setViewMode('campus')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'campus'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Vista por Campus
              </button>
              <button
                onClick={() => setViewMode('university')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${viewMode === 'university'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
              >
                Vista General
              </button>
            </>
          )}
        </div>
      )}

      {viewMode === 'individual' || user?.role === 'employee' ? (
        <div className="space-y-4">
          {/* Filters */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <Filter className="w-4 h-4" />
              <span>Filtros {activeFiltersCount > 0 && `(${activeFiltersCount})`}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <select
                value={filterOffice}
                onChange={(e) => {
                  setFilterOffice(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todas las oficinas</option>
                {uniqueOffices.map(office => (
                  <option key={office} value={office}>{office}</option>
                ))}
              </select>

              <select
                value={filterCampus}
                onChange={(e) => {
                  setFilterCampus(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todos los campus</option>
                {uniqueCampuses.map(campus => (
                  <option key={campus} value={campus}>{campus}</option>
                ))}
              </select>

              <select
                value={filterEvaluator}
                onChange={(e) => {
                  setFilterEvaluator(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todos los evaluadores</option>
                {uniqueEvaluators.map(evaluator => (
                  <option key={evaluator} value={evaluator}>{evaluator}</option>
                ))}
              </select>

              <select
                value={filterFormType}
                onChange={(e) => {
                  setFilterFormType(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">Todos los formularios</option>
                {uniqueFormTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
              >
                <X className="w-3 h-3" />
                Limpiar filtros
              </button>
            )}

            <div className="text-xs text-gray-500">
              Mostrando {paginatedEvaluations.length} de {filteredEvaluations.length} evaluaciones
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-48">Evaluado</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-48">Evaluador</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-40">Oficina</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Campus</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-48">Formulario</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-32">Fecha</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600 w-24">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {paginatedEvaluations.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center">
                        <div className="flex flex-col items-center gap-2 text-gray-500">
                          <AlertCircle className="w-8 h-8 text-gray-400" />
                          <p>No hay evaluaciones disponibles</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedEvaluations.map((evaluation) => (
                      <tr key={evaluation.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 truncate max-w-[12rem]" title={evaluation.evaluated_name}>{evaluation.evaluated_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-700 truncate max-w-[12rem]" title={evaluation.evaluator_name}>{evaluation.evaluator_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[10rem]" title={evaluation.evaluated_office}>{evaluation.evaluated_office || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[8rem]" title={evaluation.evaluated_campus}>{evaluation.evaluated_campus || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600 truncate max-w-[12rem]" title={evaluation.template_name}>{evaluation.template_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(evaluation.created_at).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleViewAnalysis(evaluation.id)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Ver análisis"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(evaluation.id)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Eliminar"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-2 rounded-lg transition-colors ${currentPage === page
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-200 hover:bg-gray-50'
                      }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'office' ? (
        loadingDetailed ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Cargando análisis detallado...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filtro por Campus */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                <Filter className="w-4 h-4" />
                <span>Filtros</span>
              </div>
              <select
                value={filterCampus}
                onChange={(e) => setFilterCampus(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full md:w-64"
              >
                <option value="">Todos los campus</option>
                {uniqueCampuses.map(campus => (
                  <option key={campus} value={campus}>{campus}</option>
                ))}
              </select>
            </div>

            {/* Tabla Resumen por Oficina */}
            {(() => {
              const filteredByOffice = detailedResults.filter(r => 
                !filterCampus || r.evaluatedCampus === filterCampus
              );

              const officeGroups = filteredByOffice.reduce((acc, r) => {
                const office = r.evaluatedOffice;
                const campus = r.evaluatedCampus;
                const key = `${office}|${campus}`;
                if (!acc[key]) acc[key] = { office, campus, results: [] };
                acc[key].results.push(r);
                return acc;
              }, {} as Record<string, { office: string; campus: string; results: ResultWithDetails[] }>);

              const officeSummary = Object.values(officeGroups).map(group => {
                const avgScore = group.results.reduce((sum, r) => sum + (r.avgScore || 0), 0) / group.results.length;
                return {
                  office: group.office,
                  campus: group.campus,
                  count: group.results.length,
                  avgScore: avgScore,
                  results: group.results
                };
              }).sort((a, b) => b.avgScore - a.avgScore);

              // Pagination for office view
              const officeTotalPages = Math.ceil(officeSummary.length / officePageSize);
              const officeStart = (officeCurrentPage - 1) * officePageSize;
              const paginatedOfficeSummary = officeSummary.slice(officeStart, officeStart + officePageSize);

              return (
                <>
                  {/* Contador */}
                  <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="text-xs text-gray-500">
                      Mostrando {paginatedOfficeSummary.length} de {officeSummary.length} oficinas
                    </div>
                  </div>
                  
                  {/* Tabla */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Oficina</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Campus</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">No. Evaluaciones</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">Promedio Acumulado</th>
                          <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedOfficeSummary.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center">
                              <div className="flex flex-col items-center gap-2 text-gray-500">
                                <AlertCircle className="w-8 h-8 text-gray-400" />
                                <p>No hay datos disponibles</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          paginatedOfficeSummary.map((summary) => (
                            <>
                              <tr key={`${summary.office}-${summary.campus}`} className="hover:bg-gray-50 transition-colors">
                                <td className="px-4 py-3 font-medium text-gray-900">{summary.office}</td>
                                <td className="px-4 py-3 text-gray-700">{summary.campus}</td>
                                <td className="px-4 py-3 text-center text-gray-900 font-semibold">{summary.count}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-bold ${
                                    summary.avgScore >= 4.5 ? 'bg-green-100 text-green-700' :
                                    summary.avgScore >= 3.5 ? 'bg-blue-100 text-blue-700' :
                                    'bg-orange-100 text-orange-700'
                                  }`}>
                                    {summary.avgScore.toFixed(2)}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center justify-center">
                                    <button
                                      onClick={() => setExpandedOffice(expandedOffice === `${summary.office}-${summary.campus}` ? null : `${summary.office}-${summary.campus}`)}
                                      className="flex items-center gap-1 px-3 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors text-xs font-medium"
                                    >
                                      <Eye className="w-4 h-4" />
                                      {expandedOffice === `${summary.office}-${summary.campus}` ? 'Ocultar' : 'Ampliar'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              
                              {/* Expanded Details */}
                              {expandedOffice === `${summary.office}-${summary.campus}` && (
                                <tr>
                                  <td colSpan={5} className="bg-slate-50 p-6">
                                    <div className="space-y-4">
                                      {/* Colaboradores */}
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Colaboradores Evaluados:</h4>
                                        <div className="flex flex-wrap gap-2">
                                          {Array.from(new Set(summary.results.map(r => r.evaluatedName))).map(name => (
                                            <span key={name} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                                              {name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Tipos de Exámenes */}
                                      <div>
                                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Tipos de Evaluación:</h4>
                                        <div className="flex flex-wrap gap-2">
                                          {Array.from(new Set(summary.results.map(r => r.templateName))).map(template => (
                                            <span key={template} className="px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
                                              {template}
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Análisis Completo */}
                                      <div className="mt-6 border-t border-gray-200 pt-6">
                                        <OfficeAnalysis officeName={summary.office} results={summary.results} />
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                {/* Pagination */}
                {officeTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <button
                      onClick={() => setOfficeCurrentPage(Math.max(1, officeCurrentPage - 1))}
                      disabled={officeCurrentPage === 1}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Anterior
                    </button>

                    <div className="flex gap-1">
                      {Array.from({ length: officeTotalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setOfficeCurrentPage(page)}
                          className={`px-3 py-2 rounded-lg transition-colors ${officeCurrentPage === page
                            ? 'bg-blue-600 text-white'
                            : 'border border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => setOfficeCurrentPage(Math.min(officeTotalPages, officeCurrentPage + 1))}
                      disabled={officeCurrentPage === officeTotalPages}
                      className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Siguiente
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
              );
            })()}
          </div>
        )
      ) : viewMode === 'campus' ? (
        loadingDetailed ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Cargando análisis detallado...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filtro por Tipo de Formulario */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                <Filter className="w-4 h-4" />
                <span>Filtros</span>
              </div>
              <select
                value={filterFormType}
                onChange={(e) => setFilterFormType(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full md:w-64"
              >
                <option value="">Todos los tipos de formulario</option>
                {uniqueFormTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Campus Analysis con filtro aplicado */}
            {(() => {
              const filteredResults = filterFormType ? detailedResults.filter(r => r.templateName === filterFormType) : detailedResults;
              
              // Calculate global average for benchmarking
              const globalAvg = filteredResults.length > 0 
                ? filteredResults.reduce((sum, r) => sum + (r.avgScore || 0), 0) / filteredResults.length 
                : 0;

              // Get unique campuses in filtered results
              const campuses = Array.from(new Set(filteredResults.map(r => r.evaluatedCampus)));

              return campuses.length === 0 ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-yellow-800">No hay datos disponibles para mostrar</p>
                </div>
              ) : (
                <>
                  {campuses.map(campus => (
                    <div key={campus} className="mb-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-4">{campus}</h3>
                      <CampusAnalysis 
                        campusName={campus}
                        results={filteredResults.filter(r => r.evaluatedCampus === campus)}
                        organizationAverage={globalAvg}
                      />
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        )
      ) : viewMode === 'university' ? (
        loadingDetailed ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Cargando análisis detallado...</div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Filtro por Tipo de Formulario */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-3">
                <Filter className="w-4 h-4" />
                <span>Filtros</span>
              </div>
              <select
                value={filterFormType}
                onChange={(e) => setFilterFormType(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full md:w-64"
              >
                <option value="">Todos los tipos de formulario</option>
                {uniqueFormTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* University Analysis con filtro aplicado */}
            <UniversityAnalysis 
              results={filterFormType ? detailedResults.filter(r => r.templateName === filterFormType) : detailedResults} 
            />
          </div>
        )
      ) : null}

      {/* Analysis Modal */}
      {selectedEvaluation && (
        <SectionAnalysis
          evaluation={selectedEvaluation}
          onClose={() => setSelectedEvaluation(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900">Confirmar eliminación</h3>
                <p className="mt-2 text-sm text-gray-600">
                  ¿Está seguro de que desea eliminar esta evaluación? Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, Evaluation } from '../lib/supabase';
import { BarChart3, Eye, Trash2, X, Search, Filter, AlertCircle, ChevronLeft, ChevronRight, Building2, RefreshCw } from 'lucide-react';
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
  evaluated_role?: string;
  evaluator_office?: string;
  evaluated_office?: string;
  evaluator_campus: string;
  evaluated_campus: string;
  template_name: string;
  results?: any;
}

export interface ResultWithDetails {
  id: string;
  evaluatedId: string;
  evaluatedName: string;
  evaluatedRole?: string;
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

const normalizeValue = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val.replace(',', '.'));
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof val === 'object') {
    return Number(val.value || val.rating || val.score || val.response || 0);
  }
  return 0;
};

// Helper for pagination
const getVisiblePages = (current: number, total: number) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  
  return [1, '...', current - 1, current, current + 1, '...', total];
};

export function ResultsModule() {
  const { user } = useAuth();
  const [allEvaluations, setAllEvaluations] = useState<EvaluationListItem[]>([]);
  const [detailedResults, setDetailedResults] = useState<ResultWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetailed, setLoadingDetailed] = useState(false);
  const [detailedLoaded, setDetailedLoaded] = useState(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  const [totalInDB, setTotalInDB] = useState<number | null>(null);
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
  
  // Selected Campus for detailed view
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);

  // Helper to normalize campus
  const normalizeCampus = (campus: string | null | undefined) => {
    if (!campus || campus.trim() === '') return 'Bucaramanga';
    const c = campus.toLowerCase().trim();
    if (c === 'todos' || c === 'todas' || c === 'sin campus') return 'Bucaramanga';
    return campus;
  };

  useEffect(() => {
    loadEvaluations();
  }, [user]);

  // Reset sub-selections when changing main view
  useEffect(() => {
    setSelectedCampus(null);
  }, [viewMode]);

  // OPTIMIZED: Load only evaluation basics without sections/questions/responses
  const loadEvaluations = async (fetchAll = false) => {
    try {
      setLoading(true);
      
      // Get total count first
      const { count } = await supabase
        .from('evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');
      
      setTotalInDB(count);

      let allEvals: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      // If not fetchAll, only get the first page (Preview)
      while (hasMore) {
        const { data: evals, error } = await supabase
          .from('evaluations')
          .select(`
            id, 
            evaluator_id, 
            evaluated_id, 
            template_id, 
            created_at, 
            status,
            evaluator:users!evaluator_id ( full_name, campus, role, office:offices ( name ) ),
            evaluated:users!evaluated_id ( full_name, campus, role, office:offices ( name ) ),
            template:evaluation_templates ( name ),
            results:evaluation_results ( overall_score, category_scores )
          `)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        
        if (evals && evals.length > 0) {
          allEvals = [...allEvals, ...evals];
          if (evals.length < pageSize || !fetchAll) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      }

      setAllDataLoaded(fetchAll || (count !== null && allEvals.length >= count));

      // Transform data
      const evaluations: EvaluationListItem[] = allEvals.map((e: any) => {
        // Enforce the relation is an array or object safely
        const resultsData = Array.isArray(e.results) ? e.results[0] : e.results;
        return {
          id: e.id,
          evaluator_id: e.evaluator_id,
          evaluated_id: e.evaluated_id,
          template_id: e.template_id,
          created_at: e.created_at,
          completed: e.status === 'completed',
          evaluator_name: e.evaluator?.full_name,
          evaluated_name: e.evaluated?.full_name,
          evaluated_role: e.evaluated?.role,
          evaluator_office: e.evaluator?.office?.name,
          evaluated_office: e.evaluated?.office?.name,
          evaluator_campus: normalizeCampus(e.evaluator?.campus),
          evaluated_campus: normalizeCampus(e.evaluated?.campus),
          template_name: e.template?.name,
          results: resultsData
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

  const loadDetailedResults = async () => {
    try {
      setLoadingDetailed(true);
      
      // 1. Get all completed evaluations (paging)
      let allEvalsFull: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: evals, error } = await supabase
          .from('evaluations')
          .select(`
            id, evaluated_id, evaluator_id, template_id, created_at, status,
            evaluator:users!evaluator_id ( full_name, campus, office:offices ( name ) ),
            evaluated:users!evaluated_id ( full_name, campus, role, office:offices ( name ) ),
            template:evaluation_templates ( name ),
            results:evaluation_results ( overall_score, category_scores )
          `)
          .eq('status', 'completed')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (evals && evals.length > 0) {
          allEvalsFull = [...allEvalsFull, ...evals];
          hasMore = evals.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      if (allEvalsFull.length === 0) {
        setDetailedResults([]);
        setDetailedLoaded(true);
        return;
      }

      // 2. Fetch Templates (Sections & Questions) with Paging
      const uniqueTemplateIds = Array.from(new Set(allEvalsFull.map(e => e.template_id)));
      
      const fetchAllRows = async (table: string, filterField: string, filterValues: any[]) => {
        let results: any[] = [];
        const chunkCount = 100;
        for (let i = 0; i < filterValues.length; i += chunkCount) {
          const chunk = filterValues.slice(i, i + chunkCount);
          let innerPage = 0;
          let innerHasMore = true;
          while (innerHasMore) {
            const { data, error } = await supabase
              .from(table).select('*').in(filterField, chunk)
              .range(innerPage * 1000, (innerPage + 1) * 1000 - 1);
            if (error) throw error;
            if (data && data.length > 0) {
              results = [...results, ...data];
              innerHasMore = data.length === 1000;
              innerPage++;
            } else { innerHasMore = false; }
          }
        }
        return results;
      };

      const [sectionsList, questionsList] = await Promise.all([
        fetchAllRows('evaluation_sections', 'template_id', uniqueTemplateIds),
        fetchAllRows('evaluation_questions', 'template_id', uniqueTemplateIds)
      ]);

      const sectionsByTemplate = new Map<string, any[]>();
      sectionsList.forEach(s => {
        if (!sectionsByTemplate.has(s.template_id)) sectionsByTemplate.set(s.template_id, []);
        sectionsByTemplate.get(s.template_id)!.push(s);
      });

      const questionsByTemplate = new Map<string, any[]>();
      questionsList.forEach(q => {
        if (!questionsByTemplate.has(q.template_id)) questionsByTemplate.set(q.template_id, []);
        questionsByTemplate.get(q.template_id)!.push(q);
      });

      // 3. Fetch Responses in batches
      const evalIds = allEvalsFull.map(e => e.id);
      const respByEval = new Map<string, Record<string, any>>();
      for (let i = 0; i < evalIds.length; i += 30) {
        const chunk = evalIds.slice(i, i + 30);
        let respPage = 0;
        let respHasMore = true;
        while (respHasMore) {
          const { data: respData, error } = await supabase
            .from('evaluation_responses')
            .select('evaluation_id, question_id, response_value')
            .in('evaluation_id', chunk)
            .range(respPage * 1000, (respPage + 1) * 1000 - 1);
          if (error) throw error;
          if (respData && respData.length > 0) {
            respData.forEach(r => {
              if (!respByEval.has(r.evaluation_id)) respByEval.set(r.evaluation_id, {});
              respByEval.get(r.evaluation_id)![r.question_id] = r.response_value;
            });
            respHasMore = respData.length === 1000;
            respPage++;
          } else { respHasMore = false; }
        }
      }

      // 4. Final Mapping with Fallback
      const normVal = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const parsed = parseFloat(val.replace(',', '.'));
          return isNaN(parsed) ? 0 : parsed;
        }
        if (typeof val === 'object') return Number(val.value || val.rating || val.score || 0);
        return 0;
      };

      const detailed: ResultWithDetails[] = allEvalsFull.map(evalItem => {
        const templateSections = sectionsByTemplate.get(evalItem.template_id) || [];
        const templateQuestions = questionsByTemplate.get(evalItem.template_id) || [];
        const responses = respByEval.get(evalItem.id) || {};
        
        const dbResArr = evalItem.results;
        const dbRes = Array.isArray(dbResArr) ? dbResArr[0] : dbResArr;
        const catScores = dbRes?.category_scores || {};

        const sectionsSummary: SectionSummaryRow[] = templateSections
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
          .map(s => {
            const sectionQuestions = templateQuestions.filter(q => q.section_id === s.id);
            const ratingQuestions = sectionQuestions.filter(q => q.question_type === 'rating');
            
            let avg: number | null = null;
            if (ratingQuestions.length > 0) {
              const vals = ratingQuestions.map(q => normVal(responses[q.id])).filter(v => v > 0);
              if (vals.length > 0) avg = vals.reduce((a, b) => a + b, 0) / vals.length;
            }

            if ((avg === null || avg === 0) && Object.keys(catScores).length > 0) {
              const dbVal = catScores[s.name] || catScores[s.title];
              if (dbVal !== undefined && dbVal !== null) avg = Number(dbVal);
            }

            return {
              sectionId: s.id,
              sectionName: s.name || s.title || `Sección ${s.id}`,
              avg: avg !== null ? Math.round(avg * 100) / 100 : null,
              weight: ratingQuestions.length,
              questions: []
            };
          });

        const validSections = sectionsSummary.filter(s => s.avg !== null && s.avg > 0);
        let globalScore = validSections.length > 0 
          ? validSections.reduce((sum, s) => sum + (s.avg || 0), 0) / validSections.length
          : 0;
        
        if (globalScore === 0 && dbRes?.overall_score) {
          globalScore = Number(dbRes.overall_score);
        }

        return {
          id: evalItem.id,
          evaluatedId: evalItem.evaluated_id,
          evaluatedName: evalItem.evaluated?.full_name || 'N/A',
          evaluatedRole: evalItem.evaluated?.role || '',
          evaluatorName: evalItem.evaluator?.full_name || 'N/A',
          evaluatedOffice: evalItem.evaluated?.office?.name || 'N/A',
          evaluatorOffice: evalItem.evaluator?.office?.name || 'N/A',
          evaluatedCampus: normalizeCampus(evalItem.evaluated?.campus) || 'Bucaramanga',
          evaluatorCampus: normalizeCampus(evalItem.evaluator?.campus) || 'Bucaramanga',
          templateName: evalItem.template?.name || 'N/A',
          date: evalItem.created_at,
          avgScore: Math.round(globalScore * 100) / 100,
          sectionsSummary
        };
      });

      setDetailedResults(detailed);
      setDetailedLoaded(true);
      setAllDataLoaded(true);
    } catch (error) {
      console.error('Error loading detailed results:', error);
    } finally {
      setLoadingDetailed(false);
    }
  };

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
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
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
        
        <div className="flex items-center gap-2">
          {detailedLoaded && (
            <button
              onClick={loadDetailedResults}
              disabled={loadingDetailed}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm disabled:opacity-50"
              title="Vuelve a cruzar todos los datos de la base de datos"
            >
              <RefreshCw className={`w-4 h-4 ${loadingDetailed ? 'animate-spin' : ''}`} />
              Recalcular Analítica
            </button>
          )}
        </div>
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

            {totalInDB && allEvaluations.length < totalInDB && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600 animate-pulse" />
                  <p className="text-xs text-blue-800">
                    Vista previa activa: <strong>{allEvaluations.length}</strong> de <strong>{totalInDB}</strong> registros cargados.
                  </p>
                </div>
                <button 
                  onClick={() => loadEvaluations(true)} 
                  className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Cargar Histórico Completo
                </button>
              </div>
            )}

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
                {getVisiblePages(currentPage, totalPages).map((page, idx) => (
                  typeof page === 'number' ? (
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
                  ) : (
                    <span key={`ellipsis-${idx}`} className="px-2 py-2 text-gray-400">...</span>
                  )
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
        ) : !detailedLoaded ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-gray-500 text-sm">Haga clic en el botón para cargar el análisis por oficina.</p>
            <button
              onClick={loadDetailedResults}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Cargar Análisis por Oficina
            </button>
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
              }, {} as Record<string, { office: string; campus: string; results: ResultWithDetails }>);

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
                      {getVisiblePages(officeCurrentPage, officeTotalPages).map((page, idx) => (
                        typeof page === 'number' ? (
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
                        ) : (
                          <span key={`ellipsis-${idx}`} className="px-2 py-2 text-gray-400">...</span>
                        )
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
        ) : !detailedLoaded ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-gray-500 text-sm">Haga clic en el botón para cargar el análisis por campus.</p>
            <button
              onClick={loadDetailedResults}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Cargar Análisis por Campus
            </button>
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
              const campuses = Array.from(new Set(filteredResults.map(r => r.evaluatedCampus))).sort();

              if (campuses.length === 0) {
                return (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-yellow-800">No hay datos disponibles para mostrar</p>
                  </div>
                );
              }

              // DETAIL VIEW
              if (selectedCampus) {
                 return (
                    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                        <button 
                            onClick={() => setSelectedCampus(null)}
                            className="mb-6 flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors font-medium"
                        >
                            <ChevronLeft className="w-5 h-5" />
                            Volver a lista de Campus
                        </button>
                        
                        <h3 className="text-2xl font-bold text-gray-900 mb-6">{selectedCampus}</h3>
                        
                        <CampusAnalysis 
                            campusName={selectedCampus}
                            results={filteredResults.filter(r => r.evaluatedCampus === selectedCampus)}
                            organizationAverage={globalAvg}
                        />
                    </div>
                 );
              }

              // LIST VIEW
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {campuses.map(campus => {
                    const campusResults = filteredResults.filter(r => r.evaluatedCampus === campus);
                    const avg = campusResults.reduce((sum, r) => sum + (r.avgScore || 0), 0) / campusResults.length;
                    const officesCount = new Set(campusResults.map(r => r.evaluatedOffice)).size;
                    
                    return (
                        <div 
                            key={campus}
                            onClick={() => setSelectedCampus(campus)}
                            className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:shadow-md hover:border-indigo-300 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${avg >= 4.5 ? 'bg-emerald-100 text-emerald-700' : avg >= 4.0 ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {avg.toFixed(1)}
                                </div>
                            </div>
                            
                            <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-indigo-700 transition-colors">{campus}</h3>
                            <p className="text-sm text-slate-500 mb-4">Sede Universitaria</p>
                            
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                <div>
                                    <span className="block text-xs text-slate-400 uppercase tracking-wider">Evaluaciones</span>
                                    <span className="font-semibold text-slate-700">{campusResults.length}</span>
                                </div>
                                <div>
                                    <span className="block text-xs text-slate-400 uppercase tracking-wider">Oficinas</span>
                                    <span className="font-semibold text-slate-700">{officesCount}</span>
                                </div>
                            </div>
                        </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )
      ) : viewMode === 'university' ? (
        loadingDetailed ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Cargando análisis detallado...</div>
          </div>
        ) : !detailedLoaded ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <p className="text-gray-500 text-sm">Haga clic en el botón para cargar la vista general.</p>
            <button
              onClick={loadDetailedResults}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Cargar Vista General
            </button>
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

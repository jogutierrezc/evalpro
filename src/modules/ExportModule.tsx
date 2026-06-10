import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Filter, ClipboardCheck, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePeriods } from '../hooks/usePeriods';

interface EvaluationRow {
  id: string;
  evaluator_id: string;
  evaluated_id: string;
  template_id: string;
  created_at: string;
  status: string;
  evaluator_name?: string;
  evaluated_name?: string;
  evaluated_role?: string;
  evaluated_office?: string;
  evaluated_campus?: string;
  template_name?: string;
}

interface SectionSummaryRow {
  sectionId: string;
  sectionName: string;
  avg: number | null;
  weight: number;
}

interface EvaluationDetail {
  evaluationId: string;
  evaluatorId: string;
  evaluatedId: string;
  evaluatedName: string;
  evaluatedRole: string;
  evaluatedOffice: string;
  evaluatedCampus: string;
  evaluatorName: string;
  templateId: string;
  templateName: string;
  sectionsSummary: SectionSummaryRow[];
  avgScore: number | null;
  status: string;
}

interface TemplateData {
  sections: any[];
  questions: any[];
}

const normalizeCampus = (campus: string | null | undefined) => {
  if (!campus || campus.trim() === '') return 'Bucaramanga';
  const c = campus.toLowerCase().trim();
  if (c === 'todos' || c === 'todas' || c === 'sin campus') return 'Bucaramanga';
  return campus;
};

const roundExportValue = (value: number | null | undefined): number | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const floorTenths = Math.floor(value * 10) / 10;
  const firstDecimalDigit = Math.floor(value * 10) % 10;
  const rounded = firstDecimalDigit >= 6 ? floorTenths + 0.1 : floorTenths;
  return Number(rounded.toFixed(1));
};

export default function ExportModule() {
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<EvaluationRow[]>([]);
  const [detailedResults, setDetailedResults] = useState<EvaluationDetail[]>([]);
  const [templateDataMap, setTemplateDataMap] = useState<Map<string, TemplateData>>(new Map());

  const [filterCampus, setFilterCampus] = useState('all');
  const [filterOffice, setFilterOffice] = useState('all');
  const [filterTemplate, setFilterTemplate] = useState('all');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  
  const { periods, activePeriod } = usePeriods();
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');

  useEffect(() => {
    if (activePeriod) {
        setSelectedPeriodId(activePeriod.id);
    }
  }, [activePeriod]);

  useEffect(() => {
    loadData();
  }, [selectedPeriodId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // The full data for export will be fetched on-demand when the user clicks "Exportar".
      let query = supabase
        .from('evaluations')
        .select(`
          id,
          evaluator_id,
          evaluated_id,
          template_id,
          created_at,
          status,
          evaluator:users!evaluator_id ( full_name ),
          evaluated:users!evaluated_id ( full_name, campus, office:offices ( name ) ),
          template:evaluation_templates ( name )
        `)
        .eq('status', 'completed');

      if (selectedPeriodId !== 'all') {
        query = query.eq('period_id', selectedPeriodId);
      }

      const { data: evals, error } = await query
        .order('created_at', { ascending: false })
        .limit(2000); // Sufficient for populating filter lists

      if (error) throw error;

      const mapped: EvaluationRow[] = (evals || []).map((e: any) => ({
        id: e.id,
        evaluator_id: e.evaluator_id || '',
        evaluated_id: e.evaluated_id || '',
        template_id: e.template_id || '',
        created_at: e.created_at || '',
        status: e.status || 'completed',
        evaluator_name: e.evaluator?.full_name,
        evaluated_name: e.evaluated?.full_name,
        evaluated_office: e.evaluated?.office?.name,
        evaluated_campus: normalizeCampus(e.evaluated?.campus),
        template_name: e.template?.name,
      }));

      setEvaluations(mapped);
    } catch (err) {
      console.error('Error loading filter data', err);
    } finally {
      setLoading(false);
    }
  };


  const fetchDetailedData = async (targetCampus: string, targetOffice: string, targetTemplate: string) => {
    const allDetailedResults: EvaluationDetail[] = [];
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;
    let allFilteredEvals: any[] = [];

    // 1. Fetch Evaluations (with Paging and results fallback)
    while (hasMore) {
      setExportProgress(`Buscando evaluaciones... (Página ${page + 1})`);
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data: evals, error } = await supabase
        .from('evaluations')
        .select(`
          id, evaluator_id, evaluated_id, template_id, created_at, status,
          evaluator:users!evaluator_id ( full_name ),
          evaluated:users!evaluated_id!inner ( full_name, campus, role, office:offices ( name ) ),
          template:evaluation_templates!inner ( name ),
          results:evaluation_results ( overall_score, category_scores )
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      if (!evals || evals.length === 0) {
        hasMore = false;
        break;
      }

      let filtered = evals as any[];
      if (targetCampus !== 'all') {
        filtered = filtered.filter((e: any) => normalizeCampus(e.evaluated?.campus) === targetCampus);
      }
      if (targetOffice !== 'all') {
        filtered = filtered.filter((e: any) => e.evaluated?.office?.name === targetOffice);
      }
      if (targetTemplate !== 'all') {
        filtered = filtered.filter((e: any) => e.template?.name === targetTemplate);
      }

      allFilteredEvals = [...allFilteredEvals, ...filtered];
      hasMore = evals.length === pageSize;
      page += 1;
    }

    if (allFilteredEvals.length === 0) return [];

    // 2. Fetch Templates (Sections & Questions) with Paging
    setExportProgress(`Cargando estructuras de plantillas...`);
    const uniqueTemplateIds = Array.from(new Set(allFilteredEvals.map(e => e.template_id)));
    
    // Helper to fetch all rows from any table with a filter and internal paging
    const fetchAllRows = async (table: string, filterField: string, filterValues: any[]) => {
      let results: any[] = [];
      const chunkCount = 100;
      for (let i = 0; i < filterValues.length; i += chunkCount) {
        const chunk = filterValues.slice(i, i + chunkCount);
        let innerPage = 0;
        let innerHasMore = true;
        while (innerHasMore) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .in(filterField, chunk)
            .range(innerPage * 1000, (innerPage + 1) * 1000 - 1);
          if (error) throw error;
          if (data && data.length > 0) {
            results = [...results, ...data];
            innerHasMore = data.length === 1000;
            innerPage++;
          } else {
            innerHasMore = false;
          }
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

    // 3. Fetch Responses with Internal Paging
    setExportProgress(`Cargando respuestas para ${allFilteredEvals.length} evaluaciones...`);
    const evalIds = allFilteredEvals.map(e => e.id);
    const respByEval = new Map<string, Record<string, any>>();
    
    // Process in batches of 30 evaluations to ensure we don't hit response count limits
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
        } else {
          respHasMore = false;
        }
      }
    }

    // 4. Final Mapping (Cross-Referenced with Fallback)
    setExportProgress(`Generando reporte cruzado...`);
    
    const normalizeValue = (val: any): number => {
      if (val === null || val === undefined || val === '') return 0;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = parseFloat(val.replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
      }
      if (typeof val === 'object') return Number(val.value || val.rating || val.score || 0);
      return 0;
    };

    allFilteredEvals.forEach(evalItem => {
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
          
          // Primary: Calculate from responses
          if (ratingQuestions.length > 0) {
            const vals = ratingQuestions.map(q => normalizeValue(responses[q.id]));
            const validVals = vals.filter(v => v > 0);
            if (validVals.length > 0) {
              avg = validVals.reduce((a, b) => a + b, 0) / validVals.length;
            }
          }

          // Fallback: Use pre-calculated category score if calculation failed or yielded 0
          if ((avg === null || avg === 0) && Object.keys(catScores).length > 0) {
            // Try matching by section name
            const dbVal = catScores[s.name] || catScores[s.title];
            if (dbVal !== undefined && dbVal !== null) {
              avg = Number(dbVal);
            }
          }

          return {
            sectionId: s.id,
            sectionName: s.name || s.title || `Sección ${s.id}`,
            avg: avg !== null ? roundExportValue(avg) : null,
            weight: ratingQuestions.length,
            questions: []
          };
        });

      const validSections = sectionsSummary.filter(s => s.avg !== null && s.avg > 0);
      let globalScore = validSections.length > 0 
        ? validSections.reduce((sum, s) => sum + (s.avg || 0), 0) / validSections.length
        : 0;
      
      // Global Fallback
      if (globalScore === 0 && dbRes?.overall_score) {
        globalScore = Number(dbRes.overall_score);
      }

      allDetailedResults.push({
        evaluationId: evalItem.id,
        evaluatorId: evalItem.evaluator_id,
        evaluatedId: evalItem.evaluated_id,
        evaluatedName: evalItem.evaluated?.full_name || 'N/A',
        evaluatedRole: evalItem.evaluated?.role || 'N/A',
        evaluatorName: evalItem.evaluator?.full_name || 'N/A',
        evaluatedOffice: evalItem.evaluated?.office?.name || 'N/A',
        evaluatedCampus: normalizeCampus(evalItem.evaluated?.campus) || 'Bucaramanga',
        templateId: evalItem.template_id,
        templateName: evalItem.template?.name || 'N/A',
        sectionsSummary,
        avgScore: roundExportValue(globalScore),
        status: evalItem.status
      });
    });

    return allDetailedResults;
  };

  const campuses = useMemo(() => {
    const set = new Set(evaluations.map(e => e.evaluated_campus).filter(Boolean));
    return Array.from(set).sort();
  }, [evaluations]);

  const offices = useMemo(() => {
    const set = new Set(evaluations.map(e => e.evaluated_office).filter(Boolean));
    return Array.from(set).sort();
  }, [evaluations]);

  const templates = useMemo(() => {
    const set = new Set(evaluations.map(e => e.template_name).filter(Boolean));
    return Array.from(set).sort();
  }, [evaluations]);

  const filteredDetails = useMemo(() => {
    // This state is now only populated during the export process.
    return detailedResults;
  }, [detailedResults]);

  const exportIndividual = (data: EvaluationDetail[]) => {
    if (data.length === 0) return;

    const templateSections = data[0]?.sectionsSummary || [];
    const sectionNames = templateSections.map(s => s.sectionName);

    const headers = [
      'Nombre del Colaborador',
      'Oficina',
      'Campus',
      'Cargo',
      'Estado',
      ...sectionNames,
      'Nota global',
      'Evaluador'
    ];

    const rows = data.map((r) => {
      const sectionMap: Record<string, number | string> = {};
      r.sectionsSummary.forEach(s => {
        sectionMap[s.sectionName] = s.avg ?? '';
      });

      const isSelf = r.evaluatorId === r.evaluatedId;
      const statusLabel = r.status === 'completed' ? 'Completada' : r.status === 'in_progress' ? 'En progreso' : 'Pendiente';

      return [
        r.evaluatedName,
        r.evaluatedOffice,
        r.evaluatedCampus,
        r.evaluatedRole,
        statusLabel,
        ...sectionNames.map((name) => sectionMap[name] ?? ''),
        r.avgScore ?? 0,
        isSelf ? '' : r.evaluatorName
      ];
    });

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Exportar');
    XLSX.writeFile(wb, `exportar_${filterTemplate.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const exportSummary = (data: EvaluationDetail[]) => {
    const templateNames = Array.from(new Set(data.map(r => r.templateName))).sort();

    const byUser = new Map<string, {
      name: string;
      office: string;
      campus: string;
      role: string;
      templateScores: Record<string, { sum: number; count: number }>;
    }>();

    data.forEach((r) => {
      if (!byUser.has(r.evaluatedId)) {
        byUser.set(r.evaluatedId, {
          name: r.evaluatedName,
          office: r.evaluatedOffice,
          campus: r.evaluatedCampus,
          role: r.evaluatedRole,
          templateScores: {}
        });
      }

      const user = byUser.get(r.evaluatedId)!;
      if (!user.templateScores[r.templateName]) {
        user.templateScores[r.templateName] = { sum: 0, count: 0 };
      }
      if (typeof r.avgScore === 'number') {
        user.templateScores[r.templateName].sum += r.avgScore;
        user.templateScores[r.templateName].count += 1;
      }
    });

    const headers = [
      'Nombre del Colaborador',
      'Oficina',
      'Campus',
      'Cargo',
      ...templateNames,
      'Nota promedio'
    ];

    const rows = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name)).map((u) => {
      const templateAverages = templateNames.map((t) => {
        const entry = u.templateScores[t];
        if (!entry || entry.count === 0) return '';
        return roundExportValue(entry.sum / entry.count) ?? '';
      });

      const validAverages = templateAverages.filter((v) => typeof v === 'number') as number[];
      const overallAvg = validAverages.length > 0 ? roundExportValue(validAverages.reduce((a, b) => a + b, 0) / validAverages.length) ?? '' : '';

      return [
        u.name,
        u.office,
        u.campus,
        u.role,
        ...templateAverages,
        overallAvg
      ];
    });

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Exportar');
    XLSX.writeFile(wb, 'exportar_resumen.xlsx');
  };

  const handleExport = async () => {
    if (loading || isExporting) return;
    
    try {
      setIsExporting(true);
      const data = await fetchDetailedData(filterCampus, filterOffice, filterTemplate);
      
      if (data.length === 0) {
        alert('No se encontraron evaluaciones con los filtros seleccionados.');
        return;
      }

      if (filterTemplate === 'all') {
        exportSummary(data);
      } else {
        exportIndividual(data);
      }
    } catch (err) {
      console.error('Error during export', err);
      alert('Error al generar la exportación.');
    } finally {
      setIsExporting(false);
      setExportProgress('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Exportar</h1>
            <p className="text-gray-600">Exporta evaluaciones a Excel por campus, oficina y tipo de evaluación.</p>
          </div>
          <button
            onClick={handleExport}
            disabled={loading || isExporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:bg-blue-700 transition-colors"
          >
            {isExporting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Procesando...
              </span>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Exportar Excel
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periodo de Evaluación</label>
            <div className="flex items-center gap-2 bg-slate-50 border border-gray-300 rounded-lg px-3 py-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <select
                value={selectedPeriodId}
                onChange={(e) => setSelectedPeriodId(e.target.value)}
                className="w-full bg-transparent border-none text-sm focus:ring-0 cursor-pointer font-medium p-0"
              >
                <option value="all">Todos los tiempos</option>
                {periods.map(p => (
                  <option key={p.id} value={p.id}>{p.year}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
            <select
              value={filterCampus}
              onChange={(e) => setFilterCampus(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todos</option>
              {campuses.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
            <select
              value={filterOffice}
              onChange={(e) => setFilterOffice(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todas</option>
              {offices.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de evaluación</label>
            <select
              value={filterTemplate}
              onChange={(e) => setFilterTemplate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="all">Todos (Resumen)</option>
              {templates.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          {filterTemplate === 'all'
            ? 'Exportará un resumen con tipos de evaluación y nota promedio general.'
            : 'Exportará un examen individual con criterios (secciones) y nota global.'
          }
        </div>
      </div>

      {(loading || isExporting) && (
        <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-100 p-6 flex items-center gap-4 animate-pulse">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-blue-700 font-medium">
            {isExporting ? exportProgress || 'Generando archivo...' : 'Cargando opciones de filtro...'}
          </div>
        </div>
      )}

      {!loading && evaluations.length > 0 && (
        <div className="bg-green-50 rounded-xl shadow-sm border border-green-100 p-6 text-green-800 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" />
          Se han encontrado {evaluations.length} evaluaciones disponibles para filtrar y exportar.
        </div>
      )}
    </div>
  );
}

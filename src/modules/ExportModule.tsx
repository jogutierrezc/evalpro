import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Filter, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // We only load a minimal set of evaluations to populate the filter dropdowns.
      // The full data for export will be fetched on-demand when the user clicks "Exportar".
      const { data: evals, error } = await supabase
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
        .eq('status', 'completed')
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
    const pageSize = 1000;
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      setExportProgress(`Buscando evaluaciones... (Página ${page + 1})`);
      const from = page * pageSize;
      const to = from + pageSize - 1;

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
          evaluated:users!evaluated_id!inner ( full_name, campus, role, office:offices ( name ) ),
          template:evaluation_templates!inner ( name )
        `)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      // NOTE: Filtering on nested join fields (e.g. evaluated.campus) does NOT work
      // with Supabase PostgREST joins. We fetch all and filter in JS below.

      const { data: evals, error } = await query.range(from, to);
      if (error) throw error;

      if (!evals || evals.length === 0) {
        hasMore = false;
        break;
      }

      // Filter in JavaScript
      let filteredEvals = evals as any[];
      if (targetCampus !== 'all') {
        filteredEvals = filteredEvals.filter((e: any) => normalizeCampus(e.evaluated?.campus) === targetCampus);
      }
      if (targetOffice !== 'all') {
        filteredEvals = filteredEvals.filter((e: any) => e.evaluated?.office?.name === targetOffice);
      }
      if (targetTemplate !== 'all') {
        filteredEvals = filteredEvals.filter((e: any) => e.template?.name === targetTemplate);
      }

      if (filteredEvals.length > 0) {
        const evaluationIds = filteredEvals.map(e => e.id);
        
        // Fetch templates
        const uniqueTemplates = new Set(filteredEvals.map((e: any) => e.template_id).filter(Boolean));
        const tempMap = new Map<string, TemplateData>();
        
        setExportProgress(`Cargando plantillas para ${uniqueTemplates.size} tipos de evaluación...`);
        for (const tid of Array.from(uniqueTemplates)) {
          const [{ data: sections }, { data: questions }] = await Promise.all([
            supabase.from('evaluation_sections').select('*').eq('template_id', tid),
            supabase.from('evaluation_questions').select('*').eq('template_id', tid),
          ]);
          tempMap.set(tid as string, { 
            sections: (sections || []).sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0)), 
            questions: questions || [] 
          });
        }

        // Fetch responses in chunks
        setExportProgress(`Cargando respuestas para ${evaluationIds.length} evaluaciones...`);
        const chunkSize = 50;
        let responsesForPage: any[] = [];
        for (let i = 0; i < evaluationIds.length; i += chunkSize) {
          const chunk = evaluationIds.slice(i, i + chunkSize);
          const { data } = await supabase.from('evaluation_responses').select('*').in('evaluation_id', chunk);
          if (data) responsesForPage = [...responsesForPage, ...data];
        }

        const respByEval = new Map<string, any[]>();
        responsesForPage.forEach(r => {
          if (!respByEval.has(r.evaluation_id)) respByEval.set(r.evaluation_id, []);
          respByEval.get(r.evaluation_id)!.push(r);
        });

        setExportProgress(`Procesando puntuaciones para ${allDetailedResults.length + filteredEvals.length} evaluaciones...`);
        await new Promise(r => setTimeout(r, 10)); // Yield to main thread for UI update

        // Process results
        filteredEvals.forEach((evalItem: any) => {
          const templateData = tempMap.get(evalItem.template_id);
          if (!templateData) return;

          const responses = respByEval.get(evalItem.id) || [];
          const rMap: Record<string, any> = {};
          responses.forEach((r) => { rMap[r.question_id] = r.response_value; });

          const sectionsSummary: SectionSummaryRow[] = templateData.sections.map((s) => {
            const qs = templateData.questions.filter((q: any) => q.section_id === s.id);
            const qDetails = qs.map((q: any) => ({
              id: q.id,
              type: q.question_type,
              weight: Number(q.weight || 0),
              response: rMap[q.id]
            }));

            const ratingQs = qDetails.filter((q) => q.type === 'rating' && q.response !== undefined && q.response !== null);
            const hasWeights = ratingQs.some((q) => Number(q.weight || 0) > 0);

            let avg: number | null = null;
            let sectionWeight = 0;

            if (ratingQs.length > 0) {
              if (hasWeights) {
                let ssum = 0, wsum = 0;
                ratingQs.forEach((q) => {
                  const v = normalizeValue(q.response);
                  const w = Number(q.weight || 0);
                  if (!isNaN(v) && w > 0) {
                    ssum += v * w;
                    wsum += w;
                  }
                });
                avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
                sectionWeight = wsum;
              } else {
                const vals = ratingQs.map((q) => normalizeValue(q.response)).filter(v => !isNaN(v));
                avg = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
                sectionWeight = ratingQs.length;
              }
            }

            return {
              sectionId: s.id,
              sectionName: s.name || s.title || `Sección ${s.id}`,
              avg,
              weight: sectionWeight
            };
          });

          // Calculate global score
          const totalWeight = sectionsSummary.reduce((sum, s) => sum + s.weight, 0);
          const originalWeights = sectionsSummary.map(s => s.weight);
          let globalScore = 0;
          const validSections = sectionsSummary.filter(s => s.avg !== null && s.avg !== undefined);

          if (validSections.length > 0 && totalWeight > 0) {
            let ssum = 0, wsum = 0;
            validSections.forEach((s) => {
              const sectionScore = Number(s.avg) || 0;
              const sectionWeight = originalWeights[sectionsSummary.indexOf(s)];
              if (!isNaN(sectionScore) && sectionWeight > 0) {
                ssum += sectionScore * sectionWeight;
                wsum += sectionWeight;
              }
            });
            globalScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : 0;
          } else if (validSections.length > 0) {
            const scores = validSections.map(s => Number(s.avg)).filter(v => !isNaN(v));
            globalScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0;
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
            avgScore: globalScore,
            status: evalItem.status
          });
        });
        
        setExportProgress(`Encontrados ${allDetailedResults.length} resultados...`);
        await new Promise(r => setTimeout(r, 10));
      }

      hasMore = evals.length === pageSize;
      page += 1;
    }

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
        return Math.round((entry.sum / entry.count) * 100) / 100;
      });

      const validAverages = templateAverages.filter((v) => typeof v === 'number') as number[];
      const overallAvg = validAverages.length > 0 ? Math.round((validAverages.reduce((a, b) => a + b, 0) / validAverages.length) * 100) / 100 : '';

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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

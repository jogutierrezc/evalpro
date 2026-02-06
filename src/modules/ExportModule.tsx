import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Filter } from 'lucide-react';
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const rows: EvaluationRow[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const from = page * pageSize;
        const to = from + pageSize - 1;

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
            evaluated:users!evaluated_id ( full_name, campus, role, office:offices ( name ) ),
            template:evaluation_templates ( name )
          `)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const mapped: EvaluationRow[] = (evals || []).map((e: any) => ({
        id: e.id,
        evaluator_id: e.evaluator_id,
        evaluated_id: e.evaluated_id,
        template_id: e.template_id,
        created_at: e.created_at,
        status: e.status,
        evaluator_name: e.evaluator?.full_name,
        evaluated_name: e.evaluated?.full_name,
        evaluated_role: e.evaluated?.role,
        evaluated_office: e.evaluated?.office?.name,
        evaluated_campus: normalizeCampus(e.evaluated?.campus),
        template_name: e.template?.name,
        }));

        rows.push(...mapped);
        hasMore = (evals || []).length === pageSize;
        page += 1;
      }

      setEvaluations(rows);

      const uniqueTemplates = new Set(rows.map(r => r.template_id).filter(Boolean));
      const templateMap = new Map<string, TemplateData>();

      const templatePromises = Array.from(uniqueTemplates).map(async (templateId) => {
        const [{ data: sections }, { data: questions }] = await Promise.all([
          supabase.from('evaluation_sections').select('*').eq('template_id', templateId),
          supabase.from('evaluation_questions').select('*').eq('template_id', templateId),
        ]);

        const orderedSections = (sections || []).sort((a: any, b: any) => {
          const ao = Number(a.order_index ?? 0);
          const bo = Number(b.order_index ?? 0);
          return ao - bo;
        });

        templateMap.set(templateId, { sections: orderedSections, questions: questions || [] });
      });

      await Promise.all(templatePromises);
      setTemplateDataMap(templateMap);

      const evaluationIds = rows.map(r => r.id);
      const chunks: string[][] = [];
      const chunkSize = 50;
      for (let i = 0; i < evaluationIds.length; i += chunkSize) {
        chunks.push(evaluationIds.slice(i, i + chunkSize));
      }

      let allResponses: any[] = [];
      for (const chunk of chunks) {
        const { data } = await supabase
          .from('evaluation_responses')
          .select('*')
          .in('evaluation_id', chunk);

        if (data) {
          allResponses = [...allResponses, ...data];
        }
      }

      const responseMap = new Map<string, any[]>();
      (allResponses || []).forEach(r => {
        if (!responseMap.has(r.evaluation_id)) {
          responseMap.set(r.evaluation_id, []);
        }
        responseMap.get(r.evaluation_id)!.push(r);
      });

      const detailed: EvaluationDetail[] = rows.map((evalItem) => {
        const templateData = templateMap.get(evalItem.template_id);
        if (!templateData) return null;

        const responses = responseMap.get(evalItem.id) || [];
        const respMap: Record<string, any> = {};
        responses.forEach((r) => { respMap[r.question_id] = r.response_value; });

        const sectionsSummary: SectionSummaryRow[] = templateData.sections.map((s) => {
          const qs = templateData.questions.filter((q: any) => q.section_id === s.id);
          const qDetails = qs.map((q: any) => ({
            id: q.id,
            type: q.question_type,
            weight: Number(q.weight || 0),
            response: respMap[q.id]
          }));

          const ratingQs = qDetails.filter((q) => q.type === 'rating' && q.response !== undefined && q.response !== null);
          const hasWeights = ratingQs.some((q) => Number(q.weight || 0) > 0);

          let avg: number | null = null;
          let sectionWeight = 0;

          if (ratingQs.length > 0) {
            if (hasWeights) {
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
              sectionWeight = wsum;
            } else {
              const vals = ratingQs.map((q) => Number(q.response)).filter(v => !isNaN(v));
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

        if (globalScore === 0) return null;

        return {
          evaluationId: evalItem.id,
          evaluatorId: evalItem.evaluator_id,
          evaluatedId: evalItem.evaluated_id,
          evaluatedName: evalItem.evaluated_name || 'N/A',
          evaluatedRole: evalItem.evaluated_role || 'N/A',
          evaluatorName: evalItem.evaluator_name || 'N/A',
          evaluatedOffice: evalItem.evaluated_office || 'N/A',
          evaluatedCampus: normalizeCampus(evalItem.evaluated_campus) || 'Bucaramanga',
          templateId: evalItem.template_id,
          templateName: evalItem.template_name || 'N/A',
          sectionsSummary,
          avgScore: globalScore
        };
      }).filter(Boolean) as EvaluationDetail[];

      setDetailedResults(detailed);
    } catch (err) {
      console.error('Error loading export data', err);
    } finally {
      setLoading(false);
    }
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
    return detailedResults.filter(r => {
      const matchesCampus = filterCampus === 'all' || r.evaluatedCampus === filterCampus;
      const matchesOffice = filterOffice === 'all' || r.evaluatedOffice === filterOffice;
      const matchesTemplate = filterTemplate === 'all' || r.templateName === filterTemplate;
      return matchesCampus && matchesOffice && matchesTemplate;
    });
  }, [detailedResults, filterCampus, filterOffice, filterTemplate]);

  const exportIndividual = () => {
    if (filterTemplate === 'all') return;
    if (filteredDetails.length === 0) return;

    const templateSections = filteredDetails[0]?.sectionsSummary || [];
    const sectionNames = templateSections.map(s => s.sectionName);

    const headers = [
      'Nombre del Colaborador',
      'Oficina',
      'Campus',
      'Cargo',
      ...sectionNames,
      'Nota global',
      'Evaluador'
    ];

    const rows = filteredDetails.map((r) => {
      const sectionMap: Record<string, number | string> = {};
      r.sectionsSummary.forEach(s => {
        sectionMap[s.sectionName] = s.avg ?? '';
      });

      const isSelf = r.evaluatorId === r.evaluatedId;

      return [
        r.evaluatedName,
        r.evaluatedOffice,
        r.evaluatedCampus,
        r.evaluatedRole,
        ...sectionNames.map((name) => sectionMap[name] ?? ''),
        r.avgScore ?? '',
        isSelf ? '' : r.evaluatorName
      ];
    });

    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Exportar');
    XLSX.writeFile(wb, `exportar_${filterTemplate.replace(/\s+/g, '_').toLowerCase()}.xlsx`);
  };

  const exportSummary = () => {
    const filtered = detailedResults.filter(r => {
      const matchesCampus = filterCampus === 'all' || r.evaluatedCampus === filterCampus;
      const matchesOffice = filterOffice === 'all' || r.evaluatedOffice === filterOffice;
      return matchesCampus && matchesOffice;
    });

    const templateNames = Array.from(new Set(filtered.map(r => r.templateName))).sort();

    const byUser = new Map<string, {
      name: string;
      office: string;
      campus: string;
      role: string;
      templateScores: Record<string, { sum: number; count: number }>;
    }>();

    filtered.forEach((r) => {
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

  const handleExport = () => {
    if (loading) return;
    if (filterTemplate === 'all') {
      exportSummary();
    } else {
      exportIndividual();
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
            disabled={loading || detailedResults.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Exportar Excel
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

      {loading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-gray-600">
          Cargando datos para exportación...
        </div>
      )}

      {!loading && detailedResults.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-gray-600">
          No hay evaluaciones completadas para exportar.
        </div>
      )}
    </div>
  );
}

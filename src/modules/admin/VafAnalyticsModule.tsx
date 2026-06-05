import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ScatterChart, Scatter, LineChart, Line, ZAxis, AreaChart, Area, ComposedChart
} from 'recharts';
import {
  LayoutDashboard, TrendingUp, Users, Filter, Search,
  MapPin, Briefcase, FileText, AlertCircle, CheckCircle2, X,
  BarChart2, Layers, Building2, RefreshCw, ChevronLeft, ChevronRight,
  Trophy, Award, History, ArrowUp, ArrowDown,
  Sparkles, Activity, BrainCircuit
} from 'lucide-react';
import AnaliticaTab from './analytics/AnaliticaTab';

interface VafEvaluation {
  id: string;
  evaluatedId: string;
  evaluatedName: string;
  evaluatorId: string;
  evaluatorName: string;
  campus: string;
  office: string;
  templateName: string;
  templateId: string;
  date: string;
  createdAt: string;
  score: number;
  role: string;
}

type StatusType = 'Crítico' | 'Alerta' | 'Medio' | 'Bueno' | 'Óptimo';

const getStatus = (score: number): StatusType => {
  if (score < 2) return 'Crítico';
  if (score < 3) return 'Alerta';
  if (score < 4) return 'Medio';
  if (score < 4.5) return 'Bueno';
  return 'Óptimo';
};

const STATUS_COLORS: Record<StatusType, string> = {
  'Óptimo': '#166534',
  'Bueno': '#118DFF',
  'Medio': '#F2C811',
  'Alerta': '#FF8C00',
  'Crítico': '#E81123'
};

const STATUS_ORDER: StatusType[] = ['Crítico', 'Alerta', 'Medio', 'Bueno', 'Óptimo'];

const COLORS_ARRAY = ['#118DFF', '#12239E', '#00B050', '#F2C811', '#FF8C00', '#E81123', '#8B5CF6', '#06B6D4'];

const normalizeCampus = (campus: string | null | undefined) => {
  if (!campus || campus.trim() === '') return 'Bucaramanga';
  const c = campus.toLowerCase().trim();
  if (c === 'todos' || c === 'todas' || c === 'sin campus') return 'Bucaramanga';
  return campus;
};

const getMonthKey = (dateStr: string) => {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const getMonthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${months[parseInt(m) - 1]} ${y}`;
};

interface Props {
  publicMode?: boolean;
}

export default function VafAnalyticsModule({ publicMode }: Props) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'comparativa' | 'colaboradores' | 'analitica'>('dashboard');
  const [evaluations, setEvaluations] = useState<VafEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterCampus, setFilterCampus] = useState<string>('');
  const [filterOffice, setFilterOffice] = useState<string>('');
  const [filterTemplate, setFilterTemplate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCampuses, setSelectedCampuses] = useState<string[]>([]);

  const [collabPage, setCollabPage] = useState(1);
  const collabPageSize = 10;
  const [gapPage, setGapPage] = useState(1);
  const gapPageSize = 25;

  // Scorecard drill-down
  const [selectedEval, setSelectedEval] = useState<VafEvaluation | null>(null);
  const [historyData, setHistoryData] = useState<VafEvaluation[]>([]);
  const [showScorecard, setShowScorecard] = useState(false);

  const normCampus = (c: string | null | undefined) => normalizeCampus(c);

  useEffect(() => { loadData(); }, []);

  useEffect(() => { setCollabPage(1); setGapPage(1); }, [searchQuery, filterCampus, filterOffice, filterTemplate]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      let allEvals: any[] = [];
      let page = 0;
      const pageSize = 200;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('evaluations')
          .select(`
            id, created_at, evaluator_id, evaluated_id, template_id,
            evaluator:users!evaluator_id(full_name, campus),
            evaluated:users!evaluated_id(full_name, campus, role, office:offices(name)),
            template:evaluation_templates(name)
          `)
          .eq('status', 'completed')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allEvals = [...allEvals, ...data];
          hasMore = data.length === pageSize;
          page++;
        } else { hasMore = false; }
      }

      const evalIds = allEvals.map(e => e.id);
      const scoreMap = new Map<string, number>();
      for (let i = 0; i < evalIds.length; i += 100) {
        const chunk = evalIds.slice(i, i + 100);
        const { data: results } = await supabase.from('evaluation_results').select('evaluation_id, overall_score').in('evaluation_id', chunk);
        if (results) results.forEach(r => { if (r.overall_score) scoreMap.set(r.evaluation_id, r.overall_score); });
      }

      const evalIdsNoScore = allEvals.filter(e => !scoreMap.has(e.id)).map(e => e.id);
      if (evalIdsNoScore.length > 0) {
        for (let i = 0; i < evalIdsNoScore.length; i += 30) {
          const chunk = evalIdsNoScore.slice(i, i + 30);
          const { data: responses } = await supabase
            .from('evaluation_responses')
            .select('evaluation_id, response_value, question:evaluation_questions(question_type)')
            .in('evaluation_id', chunk);
          if (responses) {
            const grouped = new Map<string, number[]>();
            responses.forEach((r: any) => {
              if (!grouped.has(r.evaluation_id)) grouped.set(r.evaluation_id, []);
              const val = Number(r.response_value);
              if (!isNaN(val) && val > 0 && r.question?.question_type === 'rating') grouped.get(r.evaluation_id)!.push(val);
            });
            grouped.forEach((vals, eid) => { if (vals.length > 0) scoreMap.set(eid, vals.reduce((a, b) => a + b, 0) / vals.length); });
          }
        }
      }

      const transformed: VafEvaluation[] = allEvals.map(e => {
        const score = scoreMap.get(e.id) || 0;
        return {
          id: e.id,
          evaluatedId: e.evaluated_id,
          evaluatedName: e.evaluated?.full_name || 'N/A',
          evaluatorId: e.evaluator_id,
          evaluatorName: e.evaluator?.full_name || 'N/A',
          campus: normCampus(e.evaluated?.campus),
          office: e.evaluated?.office?.name || 'N/A',
          templateName: Array.isArray(e.template) ? e.template[0]?.name : e.template?.name || 'N/A',
          templateId: e.template_id,
          date: new Date(e.created_at).toLocaleDateString('es-CO'),
          createdAt: e.created_at,
          score: Math.round(score * 100) / 100,
          role: e.evaluated?.role || ''
        };
      });

      setEvaluations(transformed);
    } catch (err: any) {
      console.error('Error loading VAF data:', err);
      setError('Error al cargar datos: ' + (err.message || String(err)));
    } finally { setLoading(false); }
  };

  const uniqueCampuses = useMemo(() => Array.from(new Set(evaluations.map(e => e.campus))).sort(), [evaluations]);
  const uniqueOffices = useMemo(() => Array.from(new Set(evaluations.map(e => e.office))).sort(), [evaluations]);
  const uniqueTemplates = useMemo(() => Array.from(new Set(evaluations.map(e => e.templateName))).sort(), [evaluations]);

  // Filtered & sorted (desc by score)
  const filteredData = useMemo(() => {
    return evaluations
      .filter(e => {
        const matchCampus = !filterCampus || e.campus === filterCampus;
        const matchOffice = !filterOffice || e.office === filterOffice;
        const matchTemplate = !filterTemplate || e.templateName === filterTemplate;
        const matchSearch = !searchQuery ||
          e.evaluatedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.evaluatorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.office.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCampus && matchOffice && matchTemplate && matchSearch;
      })
      .sort((a, b) => b.score - a.score); // ← ORDER BY BEST SCORE FIRST
  }, [evaluations, filterCampus, filterOffice, filterTemplate, searchQuery]);

  // ─── GLOBAL METRICS ───
  const globalMetrics = useMemo(() => {
    const total = filteredData.length;
    const avgScore = total > 0 ? filteredData.reduce((acc, curr) => acc + curr.score, 0) / total : 0;
    const optimos = filteredData.filter(d => d.score >= 4.5).length;
    const porcentajeOptimo = total > 0 ? Math.round((optimos / total) * 100) : 0;
    const templateCounts: Record<string, number> = {};
    filteredData.forEach(e => { templateCounts[e.templateName] = (templateCounts[e.templateName] || 0) + 1; });
    let mostApplied = { name: 'N/A', count: 0 };
    Object.entries(templateCounts).forEach(([name, count]) => { if (count > mostApplied.count) mostApplied = { name, count }; });
    return { total, avgScore: Number(avgScore.toFixed(2)), porcentajeOptimo, mostApplied };
  }, [filteredData]);

  // ─── EXISTING CHARTS ───
  const campusData = useMemo(() => {
    const grouped: Record<string, { sum: number; count: number }> = {};
    filteredData.forEach(e => {
      if (!grouped[e.campus]) grouped[e.campus] = { sum: 0, count: 0 };
      grouped[e.campus].sum += e.score; grouped[e.campus].count += 1;
    });
    return Object.entries(grouped).map(([name, data]) => ({ name, score: data.count > 0 ? Number((data.sum / data.count).toFixed(2)) : 0, total: data.count })).sort((a, b) => b.score - a.score);
  }, [filteredData]);

  const surveyTypeData = useMemo(() => {
    const grouped: Record<string, { sum: number; count: number }> = {};
    filteredData.forEach(e => {
      if (!grouped[e.templateName]) grouped[e.templateName] = { sum: 0, count: 0 };
      grouped[e.templateName].sum += e.score; grouped[e.templateName].count += 1;
    });
    return Object.entries(grouped).map(([name, data]) => ({ name, score: data.count > 0 ? Number((data.sum / data.count).toFixed(2)) : 0, total: data.count })).sort((a, b) => b.score - a.score);
  }, [filteredData]);

  const statusDistribution = useMemo(() => {
    const counts: Record<StatusType, number> = { 'Óptimo': 0, 'Bueno': 0, 'Medio': 0, 'Alerta': 0, 'Crítico': 0 };
    filteredData.forEach(e => { counts[getStatus(e.score)]++; });
    return Object.entries(counts).map(([name, value]) => ({ name, value })).filter(item => item.value > 0);
  }, [filteredData]);

  // ─── NEW: Evolución Histórica (AreaChart) ───
  const timeTrendData = useMemo(() => {
    const byMonth: Record<string, { sum: number; count: number }> = {};
    filteredData.forEach(e => {
      const key = getMonthKey(e.createdAt);
      if (!byMonth[key]) byMonth[key] = { sum: 0, count: 0 };
      byMonth[key].sum += e.score;
      byMonth[key].count += 1;
    });
    return Object.entries(byMonth)
      .map(([key, data]) => ({ period: getMonthLabel(key), monthKey: key, avg: Number((data.sum / data.count).toFixed(2)), count: data.count }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [filteredData]);

  // ─── NEW: Composición por Campus (Stacked Bar) ───
  const campusCompositionData = useMemo(() => {
    const byCampus: Record<string, Record<StatusType, number>> = {};
    filteredData.forEach(e => {
      if (!byCampus[e.campus]) byCampus[e.campus] = { 'Óptimo': 0, 'Bueno': 0, 'Medio': 0, 'Alerta': 0, 'Crítico': 0 };
      byCampus[e.campus][getStatus(e.score)]++;
    });
    return Object.entries(byCampus).map(([campus, statuses]) => ({ campus, ...statuses })).sort((a, b) => {
      const aTotal = STATUS_ORDER.reduce((s, st) => s + (a[st] as number || 0), 0);
      const bTotal = STATUS_ORDER.reduce((s, st) => s + (b[st] as number || 0), 0);
      return bTotal - aTotal;
    });
  }, [filteredData]);

  // ─── NEW: Ranking Top Oficinas ───
  const topOfficesData = useMemo(() => {
    const grouped: Record<string, { sum: number; count: number }> = {};
    filteredData.forEach(e => {
      if (!grouped[e.office]) grouped[e.office] = { sum: 0, count: 0 };
      grouped[e.office].sum += e.score; grouped[e.office].count += 1;
    });
    return Object.entries(grouped)
      .map(([name, data]) => ({ name, avg: Number((data.sum / data.count).toFixed(2)), total: data.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 10);
  }, [filteredData]);

  // ─── COMPARATIVE ANALYSIS ───
  const comparativeAnalysis = useMemo(() => {
    const campusesToCompare = selectedCampuses.length >= 2 ? selectedCampuses : uniqueCampuses.slice(0, 2);
    if (campusesToCompare.length < 2) return null;

    const campusOfficeScores: Record<string, Record<string, { sum: number; count: number }>> = {};
    campusesToCompare.forEach(campus => {
      const ce = filteredData.filter(e => e.campus === campus);
      campusOfficeScores[campus] = {};
      ce.forEach(e => {
        if (!campusOfficeScores[campus][e.office]) campusOfficeScores[campus][e.office] = { sum: 0, count: 0 };
        campusOfficeScores[campus][e.office].sum += e.score;
        campusOfficeScores[campus][e.office].count += 1;
      });
    });

    const allOffices = new Set<string>();
    campusesToCompare.forEach(c => { Object.keys(campusOfficeScores[c] || {}).forEach(o => allOffices.add(o)); });

    const commonOffices = campusesToCompare.reduce((common, campus) => {
      const offices = Object.keys(campusOfficeScores[campus] || {});
      return common.length === 0 ? offices : common.filter(o => offices.includes(o));
    }, [] as string[]).sort();

    // Only use common offices for the comparison table (omit unique offices per campus)
    const officeTable = Array.from(commonOffices).map(office => {
      const entry: Record<string, any> = { office };
      campusesToCompare.forEach(campus => {
        const d = campusOfficeScores[campus]?.[office];
        entry[`${campus}_score`] = d && d.count > 0 ? Number((d.sum / d.count).toFixed(2)) : null;
        entry[`${campus}_count`] = d?.count || 0;
      });
      const scores = campusesToCompare.map(c => entry[`${c}_score`]).filter((s: number | null) => s !== null) as number[];
      entry.gap = scores.length >= 2 ? Number((Math.max(...scores) - Math.min(...scores)).toFixed(2)) : 0;
      entry.avgScore = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0;
      return entry;
    }).sort((a, b) => b.avgScore - a.avgScore);

    const scatterData = commonOffices.map(office => {
      const c1 = campusOfficeScores[campusesToCompare[0]]?.[office];
      const c2 = campusOfficeScores[campusesToCompare[1]]?.[office];
      return { office, x: c1 && c1.count > 0 ? Number((c1.sum / c1.count).toFixed(2)) : 0, y: c2 && c2.count > 0 ? Number((c2.sum / c2.count).toFixed(2)) : 0, label: office };
    }).filter(d => d.x > 0 && d.y > 0);

    const collaboratorRanking = filteredData
      .filter(e => campusesToCompare.includes(e.campus))
      .reduce((acc, e) => {
        const key = `${e.evaluatedName}|${e.campus}`;
        if (!acc[key]) acc[key] = { evaluatedName: e.evaluatedName, campus: e.campus, office: e.office, sum: 0, count: 0 };
        acc[key].sum += e.score; acc[key].count += 1;
        return acc;
      }, {} as Record<string, { evaluatedName: string; campus: string; office: string; sum: number; count: number }>);

    const collaboratorScores = Object.values(collaboratorRanking)
      .map(c => ({ evaluatedName: c.evaluatedName, campus: c.campus, office: c.office, avgScore: Number((c.sum / c.count).toFixed(2)), count: c.count }))
      .sort((a, b) => b.avgScore - a.avgScore);

    const lineData = commonOffices.map(office => {
      const entry: Record<string, any> = { office };
      campusesToCompare.forEach(campus => { const d = campusOfficeScores[campus]?.[office]; entry[campus] = d && d.count > 0 ? Number((d.sum / d.count).toFixed(2)) : null; });
      return entry;
    });

    const radarData = campusesToCompare.map(campus => {
      const ce = filteredData.filter(e => e.campus === campus);
      const byTemplate: Record<string, { sum: number; count: number }> = {};
      ce.forEach(e => {
        if (!byTemplate[e.templateName]) byTemplate[e.templateName] = { sum: 0, count: 0 };
        byTemplate[e.templateName].sum += e.score; byTemplate[e.templateName].count += 1;
      });
      return { campus, templateAvgs: Object.entries(byTemplate).map(([name, data]) => ({ name, avg: data.count > 0 ? data.sum / data.count : 0 })) };
    });

    // ─── NEW: Matriz Campus vs Instrumento (Grouped Bar) ───
    const campusVsInstrument: { campus: string }[] = [];
    const campusTmplScores: Record<string, Record<string, { sum: number; count: number }>> = {};
    filteredData.forEach(e => {
      if (!campusesToCompare.includes(e.campus)) return;
      if (!campusTmplScores[e.campus]) campusTmplScores[e.campus] = {};
      if (!campusTmplScores[e.campus][e.templateName]) campusTmplScores[e.campus][e.templateName] = { sum: 0, count: 0 };
      campusTmplScores[e.campus][e.templateName].sum += e.score;
      campusTmplScores[e.campus][e.templateName].count += 1;
    });
    const allTmpls = Array.from(new Set(filteredData.filter(e => campusesToCompare.includes(e.campus)).map(e => e.templateName))).sort();

    const matrixData = campusesToCompare.map(campus => {
      const entry: Record<string, any> = { campus };
      allTmpls.forEach(t => {
        const d = campusTmplScores[campus]?.[t];
        entry[t] = d && d.count > 0 ? Number((d.sum / d.count).toFixed(2)) : 0;
      });
      return entry;
    });

    // ─── NEW: Participación vs Calidad (ComposedChart) ───
    const officeParticipation = campusesToCompare.map(campus => {
      const ce = filteredData.filter(e => e.campus === campus);
      const byOffice: Record<string, { sum: number; count: number }> = {};
      ce.forEach(e => {
        if (!byOffice[e.office]) byOffice[e.office] = { sum: 0, count: 0 };
        byOffice[e.office].sum += e.score; byOffice[e.office].count += 1;
      });
      return Object.entries(byOffice).map(([office, data]) => ({
        office: `${office} (${campus.substring(0, 8)})`,
        campus,
        count: data.count,
        avgScore: Number((data.sum / data.count).toFixed(2))
      }));
    }).flat().sort((a, b) => b.count - a.count).slice(0, 15);

    // ─── INSIGHTS ───
    const insights: any[] = [];
    const campusAvgs = campusesToCompare.map(campus => {
      const d = campusOfficeScores[campus]; const offices = Object.values(d || {});
      const total = offices.reduce((s, o) => s + o.sum, 0); const count = offices.reduce((s, o) => s + o.count, 0);
      return { campus, avg: count > 0 ? total / count : 0 };
    }).sort((a, b) => b.avg - a.avg);

    if (campusAvgs.length >= 2) {
      const diff = campusAvgs[0].avg - campusAvgs[1].avg;
      insights.push({ icon: 'Trophy', title: `${campusAvgs[0].campus} lidera`, text: `Promedio ${campusAvgs[0].avg.toFixed(2)} vs ${campusAvgs[1].avg.toFixed(2)} (${diff > 0.5 ? 'brecha significativa' : 'margen ajustado'}).`, color: 'bg-amber-50 border-amber-200 text-amber-800' });
    }
    const biggestGap = [...officeTable].sort((a, b) => b.gap - a.gap)[0];
    if (biggestGap && biggestGap.gap > 0.3) {
      const high = campusesToCompare.map(c => ({ c, s: biggestGap[`${c}_score`] as number | null })).filter(x => x.s !== null).sort((a, b) => (b.s || 0) - (a.s || 0));
      const low = [...high].reverse();
      insights.push({ icon: 'AlertCircle', title: `Brecha en "${biggestGap.office}"`, text: `Diferencia de ${biggestGap.gap.toFixed(2)} pts entre ${high[0]?.c} (${high[0]?.s?.toFixed(2)}) y ${low[0]?.c} (${low[0]?.s?.toFixed(2)}).`, color: 'bg-red-50 border-red-200 text-red-800' });
    }
    if (collaboratorScores.length > 0) {
      insights.push({ icon: 'Award', title: `Mejor evaluado: ${collaboratorScores[0].evaluatedName}`, text: `${collaboratorScores[0].office} (${collaboratorScores[0].campus}) con ${collaboratorScores[0].avgScore.toFixed(2)}.`, color: 'bg-blue-50 border-blue-200 text-blue-800' });
    }

    const campusTemplates: Record<string, Set<string>> = {};
    campusesToCompare.forEach(campus => { campusTemplates[campus] = new Set(filteredData.filter(e => e.campus === campus).map(e => e.templateName)); });
    const commonTemplates = campusesToCompare.reduce((common, campus) => {
      const tmpls = Array.from(campusTemplates[campus] || []);
      return common.length === 0 ? tmpls : common.filter(t => tmpls.includes(t));
    }, [] as string[]);
    if (commonTemplates.length > 0) {
      insights.push({ icon: 'Layers', title: `${commonTemplates.length} instrumentos compartidos`, text: `${commonTemplates.join(', ')}.`, color: 'bg-purple-50 border-purple-200 text-purple-800' });
    }

    return {
      campuses: campusesToCompare, commonOffices, officeTable, scatterData, lineData, radarData,
      collaboratorScores, insights, totalCommonOffices: commonOffices.length,
      matrixData, matrixTemplates: allTmpls, officeParticipation
    };
  }, [filteredData, selectedCampuses, uniqueCampuses]);

  // ─── NEW: Top 3 mejores y peores por campus ───
  const bestWorstByCampus = useMemo(() => {
    const byCampus: Record<string, VafEvaluation[]> = {};
    filteredData.forEach(e => {
      if (!byCampus[e.campus]) byCampus[e.campus] = [];
      byCampus[e.campus].push(e);
    });
    return Object.entries(byCampus).map(([campus, evals]) => {
      // Aggregate by person
      const personMap: Record<string, { sum: number; count: number; office: string }> = {};
      evals.forEach(e => {
        if (!personMap[e.evaluatedName]) personMap[e.evaluatedName] = { sum: 0, count: 0, office: e.office };
        personMap[e.evaluatedName].sum += e.score;
        personMap[e.evaluatedName].count += 1;
      });
      const persons = Object.entries(personMap).map(([name, d]) => ({ name, avg: Number((d.sum / d.count).toFixed(2)), office: d.office, count: d.count }));
      persons.sort((a, b) => b.avg - a.avg);
      return {
        campus,
        best: persons.slice(0, 3),
        worst: [...persons].reverse().slice(0, 3)
      };
    });
  }, [filteredData]);

  // ─── NEW: Gap Analysis (Auto vs Líder + Equipo VAF + Operativos) ───
  const gapAnalysis = useMemo(() => {
    const getType = (tn: string): 'auto' | 'leader' | 'equipo_vaf' | 'operativos' | 'other' => {
      const ltn = tn.toLowerCase();
      if (ltn.includes('auto') || ltn.includes('autoevaluacion')) return 'auto';
      if (ltn.includes('jefe') || ltn.includes('líder') || ltn.includes('lider') || ltn.includes('manager') || ltn.includes('leader') || ltn.includes('lideres')) return 'leader';
      if (ltn.includes('equipo vaf') || ltn.includes('equipovaf') || (ltn.includes('equipo') && ltn.includes('vaf'))) return 'equipo_vaf';
      if (ltn.includes('operativo')) return 'operativos';
      return 'other';
    };

    const personMap: Record<string, {
      campus: string; office: string;
      auto: VafEvaluation[]; leader: VafEvaluation[];
      equipo: VafEvaluation[]; operativos: VafEvaluation[];
    }> = {};

    evaluations.forEach(e => {
      const type = getType(e.templateName);
      if (type === 'other' && !e.templateName.toLowerCase().includes('vaf')) return;
      if (!personMap[e.evaluatedName]) {
        personMap[e.evaluatedName] = { campus: e.campus, office: e.office, auto: [], leader: [], equipo: [], operativos: [] };
      }
      personMap[e.evaluatedName].campus = e.campus;
      personMap[e.evaluatedName].office = e.office;
      if (type === 'auto') personMap[e.evaluatedName].auto.push(e);
      else if (type === 'leader') personMap[e.evaluatedName].leader.push(e);
      else if (type === 'equipo_vaf') personMap[e.evaluatedName].equipo.push(e);
      else if (type === 'operativos') personMap[e.evaluatedName].operativos.push(e);
    });

    const gaps = Object.entries(personMap).map(([name, v]) => {
      const autoAvg = v.auto.length > 0 ? v.auto.reduce((s, e) => s + e.score, 0) / v.auto.length : null;
      const leaderAvg = v.leader.length > 0 ? v.leader.reduce((s, e) => s + e.score, 0) / v.leader.length : null;
      const equipoAvg = v.equipo.length > 0 ? v.equipo.reduce((s, e) => s + e.score, 0) / v.equipo.length : null;
      const operativosAvg = v.operativos.length > 0 ? v.operativos.reduce((s, e) => s + e.score, 0) / v.operativos.length : null;
      let gap = null;
      let direction = '';
      if (autoAvg !== null && leaderAvg !== null) {
        const diff = autoAvg - leaderAvg;
        gap = Number(Math.abs(diff).toFixed(2));
        direction = diff > 0 ? 'sobreestima' : 'subestima';
      }
      return {
        evaluatedName: name,
        campus: v.campus,
        office: v.office,
        auto: autoAvg !== null ? Number(autoAvg.toFixed(2)) : null,
        leader: leaderAvg !== null ? Number(leaderAvg.toFixed(2)) : null,
        equipo: equipoAvg !== null ? Number(equipoAvg.toFixed(2)) : null,
        operativos: operativosAvg !== null ? Number(operativosAvg.toFixed(2)) : null,
        gap,
        direction,
        autoCount: v.auto.length,
        leaderCount: v.leader.length,
      };
    }).sort((a, b) => {
      // Sort by gap (non-null first, then by gap desc)
      if (a.gap !== null && b.gap !== null) return b.gap - a.gap;
      if (a.gap !== null) return -1;
      if (b.gap !== null) return 1;
      return 0;
    });

    return gaps;
  }, [evaluations]);

  // ─── Scorecard drill-down ───
  const openScorecard = async (evaluation: VafEvaluation) => {
    setSelectedEval(evaluation);
    setShowScorecard(true);
    // Load historical evaluations for this person
    const personEvals = evaluations.filter(e => e.evaluatedId === evaluation.evaluatedId);
    setHistoryData(personEvals.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
  };

  const closeScorecard = () => { setShowScorecard(false); setSelectedEval(null); setHistoryData([]); };

  // ─── PAGINATION ───
  const collabTotalPages = Math.ceil(filteredData.length / collabPageSize);
  const paginatedCollabData = useMemo(() => {
    const start = (collabPage - 1) * collabPageSize;
    return filteredData.slice(start, start + collabPageSize);
  }, [filteredData, collabPage, collabPageSize]);

  const getVisiblePages = (current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '...', total];
    if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '...', current - 1, current, current + 1, '...', total];
  };

  const activeFiltersCount = [filterCampus, filterOffice, filterTemplate].filter(Boolean).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F2F1]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#12239E] mx-auto mb-4"></div>
          <p className="text-gray-500">Cargando datos de evaluaciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F3F2F1]">
        <div className="bg-white p-8 rounded-lg shadow-sm border border-red-200 max-w-md text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-red-700 mb-2">Error al cargar datos</h2>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F3F2F1] text-slate-800 font-sans flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 p-4 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="https://udes.edu.co/images/logo/udes-logo-principal.svg"
              alt="Logo UDES"
              className="h-10 w-auto object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="h-8 w-px bg-gray-200"></div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#12239E]">VAF Visor Analitico</h1>
              <p className="text-xs text-gray-500">Dashboard de Estadistica y Analitica de la Universidad de Santander</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <button onClick={loadData} className="flex items-center gap-2 text-gray-600 hover:text-[#12239E] hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"><RefreshCw className="w-4 h-4" /> Actualizar</button>
            {publicMode && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold border border-yellow-300">Vista Pública</span>}
            <div className="w-8 h-8 rounded-full bg-[#12239E] text-white flex items-center justify-center font-bold text-xs">VAF</div>
          </div>
        </div>
      </header>

      {/* Filter Bar */}
      <div className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2 text-gray-500 font-medium mr-4"><Filter className="w-5 h-5" /> Filtros:</div>
          <select className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50" value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
            <option value="">Todos los Campus</option>{uniqueCampuses.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50" value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)}>
            <option value="">Todas las Oficinas</option>{uniqueOffices.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50" value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}>
            <option value="">Todos los Instrumentos</option>{uniqueTemplates.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {activeFiltersCount > 0 && (
            <button onClick={() => { setFilterCampus(''); setFilterOffice(''); setFilterTemplate(''); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded transition-colors"><X className="w-3 h-3" /> Limpiar</button>
          )}
          <div className="ml-auto flex bg-gray-100 p-1 rounded-lg border border-gray-200">
            <button onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}><LayoutDashboard className="w-4 h-4" /> Global</button>
            <button onClick={() => setActiveTab('comparativa')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'comparativa' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}><TrendingUp className="w-4 h-4" /> Comparativas</button>
            <button onClick={() => setActiveTab('colaboradores')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'colaboradores' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}><Users className="w-4 h-4" /> Colaboradores</button>
            <button onClick={() => setActiveTab('analitica')}
              className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${activeTab === 'analitica' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}><BrainCircuit className="w-4 h-4" /> Analítica</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 w-full flex-grow flex flex-col gap-6">
        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 flex flex-col justify-between border-l-4 border-l-[#118DFF]">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Evaluaciones</p>
            <h3 className="text-3xl font-bold text-gray-800">{globalMetrics.total}</h3>
            <p className="text-xs text-gray-400 mt-2">Registros filtrados</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 flex flex-col justify-between border-l-4 border-l-[#12239E]">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Promedio General</p>
            <div className="flex items-end gap-2"><h3 className="text-3xl font-bold text-gray-800">{globalMetrics.avgScore}</h3><span className="text-sm font-medium text-gray-400 mb-1">/ 5.0</span></div>
            <p className="text-xs text-gray-400 mt-2">Escala Likert</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 flex flex-col justify-between border-l-4 border-l-[#00B050]">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">% Nivel Óptimo</p>
            <h3 className="text-3xl font-bold text-gray-800">{globalMetrics.porcentajeOptimo}%</h3>
            <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Puntuación &gt; 4.5</p>
          </div>
          <div className="bg-white rounded-lg p-5 shadow-sm border border-gray-200 flex flex-col justify-between border-l-4 border-l-[#FF8C00]">
            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Instrumento más aplicado</p>
            <h3 className="text-lg font-bold text-gray-800 leading-tight">{globalMetrics.mostApplied.name}</h3>
            <p className="text-xs text-gray-400 mt-2">{globalMetrics.mostApplied.count} respuestas</p>
          </div>
        </div>

        {/* ─── DASHBOARD ─── */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Existing: Status Distribution */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Distribución de Estados</h3>
              {statusDistribution.length > 0 ? (
                <div className="flex-grow min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2} dataKey="value">
                        {statusDistribution.map((entry, index) => (<Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name as StatusType]} />))}
                      </Pie>
                      <RechartsTooltip formatter={(value) => [`${value}`, 'Cantidad']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Sin datos</div>}
            </div>

            {/* NEW: Evolución Histórica (AreaChart) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-2 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2 flex items-center gap-2">
                <History className="w-4 h-4" /> Evolución Histórica del Desempeño
              </h3>
              {timeTrendData.length > 1 ? (
                <div className="flex-grow min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                      <defs>
                        <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#12239E" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#12239E" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 5]} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                      <Area type="monotone" dataKey="avg" name="Promedio" stroke="#12239E" fill="url(#colorAvg)" strokeWidth={3} dot={{ r: 5, fill: '#12239E' }} />
                      <Area type="monotone" dataKey="count" name="Volumen" stroke="#118DFF" fill="none" strokeWidth={1} strokeDasharray="4 4" />
                      <ReferenceLine y={3} stroke="#FF8C00" strokeDasharray="5 5" label={{ value: 'Umbral 3.0', fontSize: 10, fill: '#FF8C00' }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Se necesitan al menos 2 periodos</div>}
            </div>

            {/* NEW: Composición por Campus (Stacked Bar) */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-1 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Composición por Campus</h3>
              {campusCompositionData.length > 0 ? (
                <div className="flex-grow min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={campusCompositionData} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" />
                      <YAxis dataKey="campus" type="category" tick={{ fontSize: 11 }} width={80} />
                      <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      {STATUS_ORDER.filter(st => campusCompositionData.some(d => (d[st] as number) > 0)).map(st => (
                        <Bar key={st} dataKey={st} name={st} stackId="a" fill={STATUS_COLORS[st]} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Sin datos</div>}
            </div>

            {/* NEW: Ranking Top Oficinas */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-2 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-yellow-500" /> Ranking de Top Oficinas
              </h3>
              {topOfficesData.length > 0 ? (
                <div className="flex-grow min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topOfficesData} layout="vertical" margin={{ top: 5, right: 40, left: 80, bottom: 5 }} barSize={20}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" domain={[0, 5]} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                      <RechartsTooltip formatter={(value: number, name: string) => [value.toFixed(2), name === 'avg' ? 'Promedio' : name]}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                      <Bar dataKey="avg" name="Promedio" radius={[0, 4, 4, 0]}>
                        {topOfficesData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={idx < 3 ? '#00B050' : entry.avg >= 3.5 ? '#118DFF' : '#FF8C00'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Sin datos</div>}
            </div>

            {/* Existing: Instrument Analysis */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-3 flex flex-col">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Análisis de Promedios por Instrumento</h3>
              {surveyTypeData.length > 0 ? (
                <div className="flex-grow min-h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={surveyTypeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={80} />
                      <YAxis domain={[0, 5]} />
                      <RechartsTooltip cursor={{ fill: '#F3F4F6' }} />
                      <Bar dataKey="score" name="Puntaje Promedio" fill="#12239E" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex-grow flex items-center justify-center text-gray-400 text-sm">Sin datos</div>}
            </div>
          </div>
        )}

        {/* ─── COMPARATIVAS ─── */}
        {activeTab === 'comparativa' && (
          <div className="flex flex-col gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2"><Building2 className="w-5 h-5 text-[#118DFF]" /> Comparativa entre Campus</h2>
              <p className="text-sm text-gray-500 mb-4">Selecciona 2 o más campus para comparar resultados.</p>
              <div className="flex flex-wrap gap-3">
                {uniqueCampuses.map(campus => (
                  <button key={campus} onClick={() => setSelectedCampuses(prev => prev.includes(campus) ? prev.filter(c => c !== campus) : [...prev, campus])}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all ${selectedCampuses.includes(campus) ? 'bg-[#12239E] text-white border-[#12239E] shadow-md' : 'bg-white text-gray-600 border-gray-300 hover:border-[#118DFF] hover:text-[#118DFF]'}`}>{campus}</button>
                ))}
              </div>
            </div>

            {comparativeAnalysis ? (
              <>
                {/* Insights */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {comparativeAnalysis.insights.slice(0, 4).map((insight: any, idx: number) => (
                    <div key={idx} className={`rounded-xl border p-5 ${insight.color}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">
                          {insight.icon === 'Trophy' && <Trophy className="w-5 h-5" />}
                          {insight.icon === 'AlertCircle' && <AlertCircle className="w-5 h-5" />}
                          {insight.icon === 'CheckCircle2' && <CheckCircle2 className="w-5 h-5" />}
                          {insight.icon === 'Award' && <Award className="w-5 h-5" />}
                          {insight.icon === 'Layers' && <Layers className="w-5 h-5" />}
                        </div>
                        <div><h4 className="font-bold text-sm mb-1">{insight.title}</h4><p className="text-sm opacity-90">{insight.text}</p></div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* NEW: Matriz Campus vs Instrumento */}
                  {comparativeAnalysis.matrixData.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-2">
                      <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Matriz de Desempeño: Campus vs Instrumento</h3>
                      <div className="min-h-[300px]">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={comparativeAnalysis.matrixData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="campus" tick={{ fontSize: 12 }} />
                            <YAxis domain={[0, 5]} />
                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '10px' }} />
                            {comparativeAnalysis.matrixTemplates.map((t: string, idx: number) => (
                              <Bar key={t} dataKey={t} name={t} fill={COLORS_ARRAY[idx % COLORS_ARRAY.length]} radius={[4, 4, 0, 0]} maxBarSize={30} />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Scatter + Line + Radar + Ranking (existing) */}
                  {comparativeAnalysis.scatterData.length > 2 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                      <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Dispersión: {comparativeAnalysis.campuses[0]} vs {comparativeAnalysis.campuses[1]}</h3>
                      <div className="min-h-[280px]">
                        <ResponsiveContainer width="100%" height={280}>
                          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" dataKey="x" name={comparativeAnalysis.campuses[0]} domain={[0, 5]} label={{ value: comparativeAnalysis.campuses[0], position: 'bottom', fontSize: 11 }} />
                            <YAxis type="number" dataKey="y" name={comparativeAnalysis.campuses[1]} domain={[0, 5]} label={{ value: comparativeAnalysis.campuses[1], angle: -90, position: 'insideLeft', fontSize: 11 }} />
                            <ZAxis range={[60, 60]} />
                            <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} formatter={(value: number, name: string) => [value.toFixed(2), name]} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                            <ReferenceLine ifOverflow x={3} stroke="#FF8C00" strokeDasharray="5 5" />
                            <ReferenceLine ifOverflow y={3} stroke="#FF8C00" strokeDasharray="5 5" />
                            <Scatter data={comparativeAnalysis.scatterData} fill="#12239E">
                              {comparativeAnalysis.scatterData.map((d: any, idx: number) => (<Cell key={`cell-${idx}`} fill={d.x >= 4 && d.y >= 4 ? '#00B050' : d.x < 3 || d.y < 3 ? '#E81123' : '#118DFF'} />))}
                            </Scatter>
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* NEW: Participación vs Calidad (ComposedChart) */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4" /> Participación vs Calidad
                    </h3>
                    <div className="min-h-[280px]">
                      <ResponsiveContainer width="100%" height={280}>
                        <ComposedChart data={comparativeAnalysis.officeParticipation} margin={{ top: 5, right: 30, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="office" tick={{ fontSize: 9 }} interval={0} angle={-30} textAnchor="end" height={80} />
                          <YAxis yAxisId="left" orientation="left" domain={[0, 5]} />
                          <YAxis yAxisId="right" orientation="right" />
                          <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                          <Legend wrapperStyle={{ fontSize: '10px' }} />
                          <Bar yAxisId="right" dataKey="count" name="No. Evaluaciones" fill="#E5E7EB" radius={[4, 4, 0, 0]} maxBarSize={30} />
                          <Line yAxisId="left" type="monotone" dataKey="avgScore" name="Promedio" stroke="#12239E" strokeWidth={2} dot={{ r: 4, fill: '#12239E' }} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-xs text-slate-400 text-center mt-1">Barras = volumen de evaluaciones · Línea = promedio obtenido</p>
                  </div>

                  {/* Radar */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                    <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Perfil por Instrumento</h3>
                    <div className="min-h-[280px]">
                      <ResponsiveContainer width="100%" height={280}>
                        <RadarChart cx="50%" cy="50%" outerRadius="60%"
                          data={(() => {
                            const allTemplates = new Set<string>();
                            comparativeAnalysis.radarData.forEach((rd: any) => rd.templateAvgs.forEach((t: any) => allTemplates.add(t.name)));
                            return Array.from(allTemplates).map((tpl: string) => {
                              const entry: Record<string, any> = { name: tpl };
                              comparativeAnalysis.radarData.forEach((rd: any) => { const found = rd.templateAvgs.find((t: any) => t.name === tpl); entry[rd.campus] = found ? Math.round(found.avg * 100) / 100 : 0; });
                              return entry;
                            });
                          })()}>
                          <PolarGrid />
                          <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 5]} />
                          {comparativeAnalysis.campuses.map((campus: string, idx: number) => (
                            <Radar key={campus} name={campus} dataKey={campus} stroke={COLORS_ARRAY[idx % COLORS_ARRAY.length]} fill={COLORS_ARRAY[idx % COLORS_ARRAY.length]} fillOpacity={0.12} />
                          ))}
                          <RechartsTooltip /><Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Line chart */}
                  {comparativeAnalysis.lineData.length > 0 && (
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                      <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Tendencia por Oficina</h3>
                      <div className="min-h-[280px]">
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart data={comparativeAnalysis.lineData.slice(0, 20)} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="office" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={80} />
                            <YAxis domain={[0, 5]} />
                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                            <Legend />
                            {comparativeAnalysis.campuses.map((campus: string, idx: number) => (
                              <Line key={campus} type="monotone" dataKey={campus} name={campus} stroke={COLORS_ARRAY[idx % COLORS_ARRAY.length]} strokeWidth={2} dot={{ r: 4, fill: COLORS_ARRAY[idx % COLORS_ARRAY.length] }} connectNulls />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Office comparison table + Ranking - ancho completo, ranking debajo de tabla */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-2 overflow-x-auto">
                    <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2">Tabla Comparativa por Oficina ({comparativeAnalysis.officeTable.length})</h3>
                    <p className="text-xs text-slate-500 mb-3">Solo se muestran oficinas comunes entre los campus seleccionados. Las oficinas únicas de cada campus se omiten.</p>
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Oficina</th>
                        {comparativeAnalysis.campuses.map((c: string) => (<th key={c} className="px-3 py-2 text-center font-semibold text-slate-600">{c}</th>))}
                        <th className="px-3 py-2 text-center font-semibold text-slate-600">Promedio</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-400">Brecha</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {comparativeAnalysis.officeTable.map((row: any, idx: number) => {
                          const scores = comparativeAnalysis.campuses.map((c: string) => row[`${c}_score`] as number | null);
                          const maxScore = Math.max(...scores.filter((s: number | null) => s !== null) as number[]);
                          const minScore = Math.min(...scores.filter((s: number | null) => s !== null) as number[]);
                          return (
                            <tr key={row.office} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 text-slate-400 font-mono text-xs">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-slate-700">{row.office}</td>
                              {comparativeAnalysis.campuses.map((c: string) => {
                                const score = row[`${c}_score`] as number | null;
                                const isMax = score === maxScore && maxScore > 0;
                                const isMin = score === minScore && minScore > 0 && maxScore !== minScore;
                                return (<td key={c} className={`px-3 py-2 text-center font-bold ${isMax ? 'text-emerald-600' : isMin ? 'text-red-500' : 'text-slate-700'}`}>{score !== null ? score.toFixed(2) : '-'}</td>);
                              })}
                              <td className="px-3 py-2 text-center font-bold text-slate-700">{row.avgScore.toFixed(2)}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${row.gap > 0.5 ? 'bg-red-100 text-red-700' : row.gap > 0.3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{row.gap.toFixed(2)}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-slate-400 text-center mt-2">Total: {comparativeAnalysis.officeTable.length} oficinas comunes entre los campus seleccionados</p>
                  </div>

                  {/* Ranking de Colaboradores (ancho completo, debajo de la tabla) */}
                  <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 lg:col-span-2 overflow-x-auto">
                    <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2 flex items-center gap-2"><Trophy className="w-4 h-4 text-yellow-500" /> Ranking de Colaboradores (Top 20)</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {comparativeAnalysis.collaboratorScores.slice(0, 20).map((c: any, idx: number) => (
                        <div key={`${c.evaluatedName}-${c.campus}`} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${idx === 0 ? 'bg-yellow-500' : idx === 1 ? 'bg-gray-400' : idx === 2 ? 'bg-amber-700' : 'bg-slate-200 text-slate-500'}`}>{idx + 1}</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium text-slate-800 truncate">{c.evaluatedName}</p><p className="text-xs text-slate-400 truncate">{c.office} · {c.campus}</p></div>
                          <div className="text-right shrink-0">
                            <span className={`text-sm font-bold ${c.avgScore >= 4.5 ? 'text-emerald-600' : c.avgScore >= 4.0 ? 'text-blue-600' : 'text-slate-600'}`}>{c.avgScore.toFixed(1)}</span>
                            <span className="text-xs text-slate-400 ml-1">({c.count})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-600 mb-2">Selecciona al menos 2 campus</h3>
                <p className="text-sm text-gray-400">Usa los botones de arriba para elegir los campus que deseas comparar.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── COLABORADORES ─── */}
        {activeTab === 'colaboradores' && (
          <div className="flex flex-col gap-6">
            {/* Top 3 Mejores y Peores por Campus */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {bestWorstByCampus.map(({ campus, best, worst }) => (
                <div key={campus}>
                  <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> {campus}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Best */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <h5 className="text-xs font-bold text-emerald-700 uppercase mb-2 flex items-center gap-1"><ArrowUp className="w-3 h-3" /> Mejores</h5>
                      <div className="space-y-1.5">
                        {best.map((p, i) => (
                          <div key={p.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${i === 0 ? 'bg-yellow-500' : i === 1 ? 'bg-gray-400' : 'bg-amber-700'}`}>{i + 1}</span>
                              <span className="font-medium text-emerald-800 truncate max-w-[120px]">{p.name}</span>
                            </div>
                            <span className="font-bold text-emerald-700">{p.avg.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Worst */}
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <h5 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-1"><ArrowDown className="w-3 h-3" /> Por mejorar</h5>
                      <div className="space-y-1.5">
                        {worst.map((p, i) => (
                          <div key={p.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="w-4 h-4 rounded-full bg-red-200 flex items-center justify-center text-[9px] font-bold text-red-700">{i + 1}</span>
                              <span className="font-medium text-red-800 truncate max-w-[120px]">{p.name}</span>
                            </div>
                            <span className="font-bold text-red-700">{p.avg.toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>              {/* Gap Analysis con paginación 25 */}
            {gapAnalysis.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
                <h3 className="text-sm font-bold text-gray-700 uppercase mb-4 border-b pb-2 flex items-center gap-2">
                  <Layers className="w-4 h-4" /> Análisis de Brecha por Colaborador
                </h3>
                <p className="text-xs text-slate-500 mb-3">Se muestran los puntajes por tipo de instrumento. "-" indica que no tiene evaluación de ese tipo. 
                  <strong>Dirección "Subestima"</strong> = el líder lo evaluó más alto que su autoevaluación (autopercepción baja). 
                  <strong>"Sobreestima"</strong> = se autoevalúa más alto de lo que su líder percibe (posible punto ciego).</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Colaborador</th>
                      <th className="px-3 py-2 text-center font-semibold text-emerald-700">Autoevaluación</th>
                      <th className="px-3 py-2 text-center font-semibold text-blue-700">Evaluación Líder</th>
                      <th className="px-3 py-2 text-center font-semibold text-purple-700">Equipo VAF</th>
                      <th className="px-3 py-2 text-center font-semibold text-orange-700">Operativos</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600">Brecha</th>
                      <th className="px-3 py-2 text-center font-semibold text-slate-600">Dirección</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {gapAnalysis.slice((gapPage - 1) * gapPageSize, gapPage * gapPageSize).map(g => (
                        <tr key={g.evaluatedName} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-700">{g.evaluatedName}</span>
                            <span className="text-xs text-slate-400 ml-2">{g.office}</span>
                          </td>
                          <td className="px-3 py-2 text-center font-bold text-emerald-600">{g.auto !== null ? g.auto.toFixed(2) : '-'}</td>
                          <td className="px-3 py-2 text-center font-bold text-blue-600">{g.leader !== null ? g.leader.toFixed(2) : '-'}</td>
                          <td className="px-3 py-2 text-center font-bold text-purple-600">{g.equipo !== null ? g.equipo.toFixed(2) : '-'}</td>
                          <td className="px-3 py-2 text-center font-bold text-orange-600">{g.operativos !== null ? g.operativos.toFixed(2) : '-'}</td>
                          <td className="px-3 py-2 text-center">
                            {g.gap !== null ? (
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${g.gap > 0.5 ? 'bg-red-100 text-red-700' : g.gap > 0.3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                                {g.gap.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {g.direction ? (
                              <span className={`text-xs font-medium ${g.direction === 'sobreestima' ? 'text-orange-600' : 'text-blue-600'}`}>
                                {g.direction === 'sobreestima' ? 'Sobreestima' : 'Subestima'}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Gap pagination */}
                {(() => {
                  const totalGapPages = Math.ceil(gapAnalysis.length / gapPageSize);
                  if (totalGapPages <= 1) return null;
                  return (
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500">Mostrando {(gapPage - 1) * gapPageSize + 1}–{Math.min(gapPage * gapPageSize, gapAnalysis.length)} de {gapAnalysis.length} colaboradores</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setGapPage(Math.max(1, gapPage - 1))} disabled={gapPage === 1}
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        <span className="text-xs text-gray-500">{gapPage} / {totalGapPages}</span>
                        <button onClick={() => setGapPage(Math.min(totalGapPages, gapPage + 1))} disabled={gapPage === totalGapPages}
                          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          Siguiente <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
              <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                <h3 className="text-sm font-bold text-gray-700 uppercase">Detalle Analítico por Colaborador</h3>
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input type="text" placeholder="Buscar nombre, evaluador, oficina..."
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-md text-sm w-72 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-gray-500 text-xs uppercase tracking-wider">
                      <th className="p-4 border-b font-semibold">#</th>
                      <th className="p-4 border-b font-semibold">Evaluado</th>
                      <th className="p-4 border-b font-semibold">Evaluador</th>
                      <th className="p-4 border-b font-semibold">Instrumento</th>
                      <th className="p-4 border-b font-semibold">Campus / Oficina</th>
                      <th className="p-4 border-b font-semibold text-center">Puntaje</th>
                      <th className="p-4 border-b font-semibold">Estado</th>
                      <th className="p-4 border-b font-semibold text-center">Drill-down</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm text-gray-700">
                    {paginatedCollabData.length === 0 ? (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 text-gray-300" />No hay resultados con los filtros actuales</td></tr>
                    ) : (
                      paginatedCollabData.map((row, idx) => {
                        const status = getStatus(row.score);
                        const rowNumber = (collabPage - 1) * collabPageSize + idx + 1;
                        return (
                          <tr key={row.id} className="hover:bg-blue-50 border-b border-gray-100 transition-colors">
                            <td className="p-4 text-slate-400 font-mono text-xs">{rowNumber}</td>
                            <td className="p-4 font-medium">{row.evaluatedName}</td>
                            <td className="p-4 text-gray-600">{row.evaluatorName}</td>
                            <td className="p-4"><span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium">{row.templateName}</span></td>
                            <td className="p-4">
                              <div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" /> {row.campus}</div>
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1"><Briefcase className="w-3 h-3 text-gray-400" /> {row.office}</div>
                            </td>
                            <td className="p-4 text-center font-bold text-base">{row.score.toFixed(1)}</td>
                            <td className="p-4">
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold border" style={{ backgroundColor: `${STATUS_COLORS[status]}15`, color: STATUS_COLORS[status], borderColor: `${STATUS_COLORS[status]}30` }}>{status}</span>
                            </td>
                            <td className="p-4 text-center">
                              <button onClick={() => openScorecard(row)}
                                className="px-2.5 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors flex items-center gap-1 mx-auto">
                                <Sparkles className="w-3 h-3" /> Ver
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {collabTotalPages > 1 && (
                <div className="p-4 border-t border-gray-200 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Mostrando {(collabPage - 1) * collabPageSize + 1}–{Math.min(collabPage * collabPageSize, filteredData.length)} de {filteredData.length} resultados</p>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setCollabPage(Math.max(1, collabPage - 1))} disabled={collabPage === 1}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Anterior
                      </button>
                      <div className="flex gap-1">
                        {getVisiblePages(collabPage, collabTotalPages).map((page, idx) => (
                          typeof page === 'number' ? (
                            <button key={page} onClick={() => setCollabPage(page)}
                              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${collabPage === page ? 'bg-[#12239E] text-white' : 'border border-gray-200 hover:bg-white'}`}>{page}</button>
                          ) : <span key={`ellipsis-${idx}`} className="px-2 py-1.5 text-gray-400">...</span>
                        ))}
                      </div>
                      <button onClick={() => setCollabPage(Math.min(collabTotalPages, collabPage + 1))} disabled={collabPage === collabTotalPages}
                        className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                        Siguiente <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* ─── ANALÍTICA ─── */}
        {activeTab === 'analitica' && (
          <AnaliticaTab
            evaluations={evaluations}
            filteredData={filteredData}
            uniqueCampuses={uniqueCampuses}
            uniqueOffices={uniqueOffices}
            uniqueTemplates={uniqueTemplates}
            globalMetrics={globalMetrics}
          />
        )}
      </main>

      {/* ─── SCORECARD DRILL-DOWN MODAL ─── */}
      {showScorecard && selectedEval && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={closeScorecard}>
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#12239E] to-blue-700 p-6 text-white rounded-t-2xl">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{selectedEval.evaluatedName}</h2>
                  <p className="text-blue-200 text-sm mt-1">{selectedEval.role} · {selectedEval.office} · {selectedEval.campus}</p>
                </div>
                <button onClick={closeScorecard} className="p-2 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex gap-4 mt-4">
                <div className="bg-white/15 rounded-lg px-4 py-2">
                  <p className="text-xs text-blue-200">Último puntaje</p>
                  <p className="text-2xl font-bold">{selectedEval.score.toFixed(1)} <span className="text-sm font-normal text-blue-200">/ 5.0</span></p>
                </div>
                <div className="bg-white/15 rounded-lg px-4 py-2">
                  <p className="text-xs text-blue-200">Evaluaciones</p>
                  <p className="text-2xl font-bold">{historyData.length}</p>
                </div>
                <div className="bg-white/15 rounded-lg px-4 py-2">
                  <p className="text-xs text-blue-200">Último instrumento</p>
                  <p className="text-sm font-bold truncate max-w-[150px]">{selectedEval.templateName}</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Historical Trend */}
              {historyData.length > 1 && (
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><History className="w-4 h-4" /> Tendencia Histórica</h3>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historyData.map(e => ({ name: e.templateName.substring(0, 18), score: e.score, date: new Date(e.createdAt).toLocaleDateString('es-CO'), template: e.templateName }))} margin={{ top: 5, right: 10, left: 0, bottom: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={50} />
                        <YAxis domain={[0, 5]} />
                        <RechartsTooltip formatter={(value: number, name: string) => [value.toFixed(2), name === 'score' ? 'Puntaje' : name]}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                        <Line type="monotone" dataKey="score" name="Puntaje" stroke="#12239E" strokeWidth={2} dot={{ r: 5, fill: '#12239E' }} />
                        <ReferenceLine y={3} stroke="#FF8C00" strokeDasharray="5 5" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Gap Analysis for this person */}
              {(() => {
                const personGap = gapAnalysis.find(g => g.evaluatedName === selectedEval.evaluatedName);
                if (!personGap) return null;
                return (
                  <div className={`rounded-xl border p-4 ${personGap.gap !== null && personGap.gap > 0.5 ? 'bg-red-50 border-red-200' : personGap.gap !== null && personGap.gap > 0.3 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                    <h3 className="font-bold text-sm mb-2 flex items-center gap-2">
                      <Layers className="w-4 h-4" /> Brecha de Percepción
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-center max-w-sm mx-auto">
                      <div>
                        <p className="text-xs text-slate-500">Autoevaluación</p>
                        <p className="text-lg font-bold text-emerald-600">{personGap.auto !== null ? personGap.auto.toFixed(2) : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Evaluación Líder</p>
                        <p className="text-lg font-bold text-blue-600">{personGap.leader !== null ? personGap.leader.toFixed(2) : '-'}</p>
                      </div>
                    </div>
                    {personGap.gap !== null && (
                      <>
                        <div className="text-center mt-3">
                          <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${personGap.gap > 0.5 ? 'bg-red-100 text-red-700' : personGap.gap > 0.3 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                            Brecha: {personGap.gap.toFixed(2)} · {personGap.direction === 'sobreestima' ? 'Sobreestima' : 'Subestima'}
                          </span>
                        </div>
                        <p className="text-xs mt-2 text-center text-slate-500">
                          {personGap.direction === 'sobreestima'
                            ? `Se autoevalúa ${personGap.gap.toFixed(2)} pts por encima de lo que percibe su líder.`
                            : `El líder lo evalúa ${personGap.gap.toFixed(2)} pts por encima de su autoevaluación.`}
                        </p>
                      </>
                    )}
                  </div>
                );
              })()}

              {/* All evaluations list */}
              <div>
                <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Historial de Evaluaciones</h3>
                <div className="space-y-2">
                  {historyData.map(e => {
                    const st = getStatus(e.score);
                    return (
                      <div key={e.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                        <div>
                          <p className="font-medium text-slate-700">{e.templateName}</p>
                          <p className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleDateString('es-CO')} · Evaluado por {e.evaluatorName}</p>
                        </div>
                        <div className="text-right">
                          <span className={`font-bold text-base ${st === 'Óptimo' ? 'text-emerald-600' : st === 'Bueno' ? 'text-blue-600' : st === 'Medio' ? 'text-yellow-600' : 'text-red-600'}`}>{e.score.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

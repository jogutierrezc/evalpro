import { useState, useMemo, useEffect } from 'react';
import { AI_ENABLED } from '../../../lib/features';
import {
  BarChart3, TrendingDown, AlertTriangle, CheckCircle,
  Users, Filter, FileText, Activity, Search, X,
  Building2, BrainCircuit, Sparkles, Loader2, Bot
} from 'lucide-react';
import { AnalyticsEngine, DIMENSIONS, DimensionCode } from './engine';

interface VafEval {
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

interface Props {
  evaluations: VafEval[];
  filteredData: VafEval[];
  uniqueCampuses: string[];
  uniqueOffices: string[];
  uniqueTemplates: string[];
  globalMetrics: {
    total: number;
    avgScore: number;
    porcentajeOptimo: number;
    mostApplied: { name: string; count: number };
  };
}



const MetricCard = ({ title, value, subtitle, icon: Icon, alert = false }: any) => (
  <div className={`p-6 rounded-2xl border ${alert ? 'bg-rose-50 border-rose-200' : 'bg-white border-slate-200'} shadow-sm`}>
    <div className="flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className={`text-3xl font-bold ${alert ? 'text-rose-700' : 'text-slate-800'}`}>
          {typeof value === 'number' ? value.toFixed(2) : value}
        </h3>
        <p className={`text-xs mt-2 font-medium ${alert ? 'text-rose-600' : 'text-emerald-600'}`}>
          {subtitle}
        </p>
      </div>
      <div className={`p-3 rounded-xl ${alert ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-cyan-700'}`}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const DimensionBar = ({ name, weight, score }: { name: string; weight: number; score: number }) => {
  const percentage = (score / 5) * 100;
  const isCritical = score <= 3.0;
  const isOptimal = score >= 4.0;
  const barColor = isCritical ? 'bg-rose-500' : isOptimal ? 'bg-emerald-500' : 'bg-amber-400';

  return (
    <div className="mb-5">
      <div className="flex justify-between items-end mb-2">
        <div>
          <span className="text-sm font-semibold text-slate-700 block">{name}</span>
          <span className="text-xs text-slate-400">Peso: {weight * 100}%</span>
        </div>
        <span className={`text-sm font-bold ${isCritical ? 'text-rose-600' : 'text-slate-700'}`}>
          {score.toFixed(2)} / 5.0
        </span>
      </div>
      <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all duration-1000 ease-out`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

export default function AnaliticaTab({ evaluations, uniqueCampuses, uniqueOffices, uniqueTemplates, globalMetrics }: Props) {
  const [filterCampus, setFilterCampus] = useState<string>('');
  const [filterOffice, setFilterOffice] = useState<string>('');
  const [filterTemplate, setFilterTemplate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Filter data for the engine
  const engineInput = useMemo(() => {
    return evaluations
      .filter(e => {
        const matchCampus = !filterCampus || e.campus === filterCampus;
        const matchOffice = !filterOffice || e.office === filterOffice;
        const matchTemplate = !filterTemplate || e.templateName === filterTemplate;
        const matchSearch = !searchQuery ||
          e.evaluatedName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.office.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCampus && matchOffice && matchTemplate && matchSearch;
      })
      .map(e => ({
        score: e.score,
        templateName: e.templateName,
        campus: e.campus,
        office: e.office,
        evaluatedName: e.evaluatedName,
        role: e.role,
        createdAt: e.createdAt,
      }));
  }, [evaluations, filterCampus, filterOffice, filterTemplate, searchQuery]);

  // Run the analytics engine
  const analytics = useMemo(() => {
    return AnalyticsEngine.calculateFromAggregated(engineInput);
  }, [engineInput]);

  const campusFilterOptions = useMemo(() => {
    const all = Array.from(new Set(evaluations.map(e => e.campus))).sort();
    return all;
  }, [evaluations]);

  const officeFilterOptions = useMemo(() => {
    const all = Array.from(new Set(evaluations.map(e => e.office))).sort();
    return all;
  }, [evaluations]);

  const templateFilterOptions = useMemo(() => {
    const all = Array.from(new Set(evaluations.map(e => e.templateName))).sort();
    return all;
  }, [evaluations]);

  const activeFiltersCount = [filterCampus, filterOffice, filterTemplate, searchQuery].filter(Boolean).length;

  const DIM_KEYS = Object.keys(DIMENSIONS) as DimensionCode[];

  const [prismaLoading, setPrismaLoading] = useState(false);
  const [prismaResult, setPrismaResult] = useState<any | null>(null);
  const [showPrismaModal, setShowPrismaModal] = useState(false);

  const handlePrismaAnalysis = async () => {
    setPrismaLoading(true);
    try {
      const { PrismaBrain } = await import('../../../lib/prisma-engine');
      const dimSummary = DIM_KEYS.map(dim => {
        const info = DIMENSIONS[dim];
        const avg = analytics.dimensionAverages[dim] || 0;
        return `${info.name}: ${avg.toFixed(2)}/5.0 (peso: ${(info.weight * 100).toFixed(0)}%)`;
      }).join('\n');

      const prompt = `
Eres el Sistema de Inteligencia Analítica de la Universidad de Santander (UDES).
Genera un análisis estratégico profundo basado en los siguientes resultados de evaluación institucional.

DATOS DEL ANÁLISIS:
- Total evaluaciones procesadas: ${analytics.totalEvaluations}
- Índice de Desempeño Compuesto (IDC): ${analytics.idc.toFixed(2)}/5.0
- Brecha de Autopercepción (Δ AUTO): ${analytics.gaps.deltaAuto.toFixed(2)} (${analytics.gaps.status})
- Recomendaciones activas: ${analytics.recommendations.length}

DESEMPEÑO POR DIMENSIÓN:
${dimSummary}

RECOMENDACIONES DETECTADAS (${analytics.recommendations.length}):
${analytics.recommendations.slice(0, 15).map(r => `- [${r.dimension} - Puntaje ${r.currentScore.toFixed(2)}] Sugerencia: ${r.recommendation}`).join('\n')}

CAMPUS ANALIZADOS: ${uniqueCampuses.join(', ')}
OFICINAS ANALIZADAS: ${uniqueOffices.join(', ')}
INSTRUMENTOS: ${uniqueTemplates.join(', ')}

INSTRUCCIONES:
Genera un análisis ejecutivo en ESPAÑOL que incluya:
1. Un diagnóstico general del desempeño institucional (máximo 2 párrafos)
2. Las 3 fortalezas principales identificadas
3. Las 3 áreas de mejora prioritarias
4. Recomendaciones estratégicas accionables (3-5 puntos)
5. Un pronóstico de evolución si se implementan las mejoras sugeridas

Responde ÚNICAMENTE con el objeto JSON, sin texto adicional:
{
  "diagnostico": "...",
  "fortalezas": ["...", "...", "..."],
  "areas_mejora": ["...", "...", "..."],
  "recomendaciones_estrategicas": ["...", "...", "..."],
  "pronostico": "..."
}
`;

      const response = await PrismaBrain.callAI(prompt);
      const cleanJson = response.replace(/```json\n|\n```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      setPrismaResult(parsed);
    } catch (err) {
      console.error('Prisma analysis error:', err);
      setPrismaResult({
        diagnostico: 'No se pudo completar el análisis con IA. Verifica que la clave API de OpenRouter esté configurada en el archivo .env.',
        fortalezas: [],
        areas_mejora: [],
        recomendaciones_estrategicas: [],
        pronostico: 'Intenta nuevamente más tarde.'
      });
    } finally {
      setPrismaLoading(false);
      setShowPrismaModal(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="bg-[#12239E] rounded-2xl p-6 text-white shadow-sm">
        <div className="flex items-center gap-4 mb-3">
          <div className="bg-white/20 p-3 rounded-xl">
            <BrainCircuit className="w-8 h-8" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">Motor de Analítica SGC-VAF</h2>
            <p className="text-indigo-200 text-sm">Arquitectura multidimensional · Índice de Desempeño Compuesto (IDC)</p>
          </div>
          {AI_ENABLED && <button
            onClick={handlePrismaAnalysis}
            disabled={prismaLoading}
            className="flex items-center gap-2 px-5 py-2.5 bg-white text-[#12239E] font-bold rounded-xl hover:bg-indigo-50 transition-all shadow-md disabled:opacity-60 text-sm"
          >
            {prismaLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {prismaLoading ? 'Analizando...' : 'Análisis Prisma'}
          </button>}
        </div>
        <p className="text-indigo-100 text-sm max-w-3xl">
          Basado en 6 dimensiones de evaluación y un catálogo de 180+ recomendaciones.
          Identifica brechas psicométricas y dispara acciones automáticas según umbrales de desempeño.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-slate-600 font-medium mr-2 text-sm">
          <Filter size={16} /> Filtros:
        </div>
        <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50"
          value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)}>
          <option value="">Todos los Campus</option>
          {campusFilterOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50"
          value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)}>
          <option value="">Todas las Oficinas</option>
          {officeFilterOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 bg-gray-50"
          value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}>
          <option value="">Todos los Instrumentos</option>
          {templateFilterOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative max-w-xs">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input type="text" placeholder="Buscar evaluado..."
            className="pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-48 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        {activeFiltersCount > 0 && (
          <button onClick={() => { setFilterCampus(''); setFilterOffice(''); setFilterTemplate(''); setSearchQuery(''); }}
            className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
        <div className="ml-auto flex items-center text-xs text-slate-400">
          Evaluaciones procesadas: <strong className="ml-1 text-slate-700">{analytics.totalEvaluations}</strong>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Índice de Desempeño Compuesto (IDC)"
          value={analytics.idc || 0}
          subtitle="Ponderado según las 6 dimensiones"
          icon={BarChart3}
        />
        <MetricCard
          title="Brecha de Autopercepción (Δ AUTO)"
          value={analytics.gaps.deltaAuto}
          subtitle={analytics.gaps.status}
          icon={Users}
          alert={Math.abs(analytics.gaps.deltaAuto) > 1.0}
        />
        <MetricCard
          title="Recomendaciones Generadas"
          value={analytics.recommendations.length}
          subtitle={`${analytics.recommendations.filter(r => r.currentScore <= 3.0).length} críticas · ${analytics.recommendations.filter(r => r.currentScore > 3.0 && r.currentScore <= 4.0).length} mejora · ${analytics.recommendations.filter(r => r.currentScore > 4.0).length} positivas`}
          icon={AlertTriangle}
          alert={analytics.recommendations.filter(r => r.currentScore <= 3.0).length > 0}
        />
      </div>

      {/* Main Grid: Dimensiones + Recomendaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel: Dimension Analysis */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-1">
          <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <TrendingDown size={20} className="text-cyan-600" />
            Análisis Dimensional
          </h3>
          <div className="space-y-2">
            {DIM_KEYS.map(dim => {
              const info = DIMENSIONS[dim];
              return (
                <DimensionBar
                  key={dim}
                  name={info.name}
                  weight={info.weight}
                  score={analytics.dimensionAverages[dim] || 0}
                />
              );
            })}
          </div>

          {/* Dimension summary table */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Resumen por Dimensión</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 uppercase">
                    <th className="text-left pb-2 font-semibold">Dimensión</th>
                    <th className="text-center pb-2 font-semibold">Puntaje</th>
                    <th className="text-center pb-2 font-semibold">Peso</th>
                    <th className="text-center pb-2 font-semibold">Aporte IDC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DIM_KEYS.map(dim => {
                    const info = DIMENSIONS[dim];
                    const score = analytics.dimensionAverages[dim] || 0;
                    const contribution = score * info.weight;
                    return (
                      <tr key={dim} className="hover:bg-slate-50">
                        <td className="py-2 pr-2 font-medium text-slate-700">{info.name}</td>
                        <td className={`py-2 text-center font-bold ${score <= 3.0 ? 'text-rose-600' : score >= 4.0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {score.toFixed(2)}
                        </td>
                        <td className="py-2 text-center text-slate-500">{(info.weight * 100).toFixed(0)}%</td>
                        <td className="py-2 text-center font-medium text-slate-600">{contribution.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-bold">
                    <td className="pt-2 text-slate-800">IDC Total</td>
                    <td className="pt-2 text-center text-[#12239E]">{analytics.idc.toFixed(2)}</td>
                    <td className="pt-2 text-center text-slate-400">100%</td>
                    <td className="pt-2 text-center text-[#12239E]">{analytics.idc.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Right Panel: Recommendations Engine */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <FileText size={20} className="text-emerald-600" />
            Motor de Recomendaciones y Acciones de Mejora
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            El sistema ha detectado <strong>{analytics.recommendations.length}</strong> áreas que requieren atención
            basadas en el catálogo maestro de recomendaciones SGC-VAF.
          </p>

          {/* Dimension tabs */}
          {analytics.recommendations.length > 0 && (
            <RecommendationsList
              recommendations={analytics.recommendations}
              dimensionAverages={analytics.dimensionAverages}
            />
          )}

          {analytics.recommendations.length === 0 && (
            <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-10">
              <div className="text-center">
                <CheckCircle size={48} className="text-emerald-400 mx-auto mb-3" />
                <p className="text-slate-600 font-medium text-lg">No se detectaron brechas críticas</p>
                <p className="text-slate-400 text-sm mt-1">El desempeño actual supera los umbrales de alerta en todas las dimensiones.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Score composition summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4 text-blue-700" />
            <h4 className="font-bold text-blue-800 text-sm">Cobertura por Campus</h4>
          </div>
          <p className="text-xs text-blue-700">
            {uniqueCampuses.length} campus analizados · {uniqueOffices.length} oficinas
          </p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-emerald-700" />
            <h4 className="font-bold text-emerald-800 text-sm">Nivel de Desempeño</h4>
          </div>
          <p className="text-xs text-emerald-700">
            IDC: {analytics.idc.toFixed(2)}/5.0 · {globalMetrics.porcentajeOptimo}% óptimo · {globalMetrics.total} evaluaciones
          </p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <h4 className="font-bold text-amber-800 text-sm">Alertas Activas</h4>
          </div>
          <p className="text-xs text-amber-700">
            {analytics.recommendations.length} recomendaciones activas · {DIM_KEYS.filter(d => (analytics.dimensionAverages[d] || 0) <= 3.0).length} dimensiones críticas
          </p>
        </div>
      </div>

      {/* Prisma AI Analysis Modal */}
      {AI_ENABLED && showPrismaModal && prismaResult && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPrismaModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Modal header */}
            <div className="sticky top-0 bg-gradient-to-r from-[#12239E] to-indigo-700 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Análisis Prisma</h3>
                  <p className="text-indigo-200 text-xs">Diagnóstico generado por IA · OpenRouter</p>
                </div>
              </div>
              <button onClick={() => setShowPrismaModal(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Diagnóstico General */}
              <div>
                <h4 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                  <Bot className="w-4 h-4 text-[#12239E]" /> Diagnóstico General
                </h4>
                <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-xl p-5 border border-slate-200">
                  <p className="text-slate-700 leading-relaxed">{prismaResult.diagnostico}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fortalezas */}
                <div>
                  <h4 className="text-sm font-bold text-emerald-700 uppercase mb-3">Fortalezas</h4>
                  <ul className="space-y-2">
                    {prismaResult.fortalezas?.map((f: string, i: number) => (
                      <li key={i} className="bg-emerald-50 rounded-lg px-4 py-2.5 text-sm text-emerald-800 border border-emerald-100">
                        {f}
                      </li>
                    ))}
                    {(!prismaResult.fortalezas || prismaResult.fortalezas.length === 0) && (
                      <li className="text-slate-400 text-sm italic">No se identificaron fortalezas específicas.</li>
                    )}
                  </ul>
                </div>

                {/* Áreas de Mejora */}
                <div>
                  <h4 className="text-sm font-bold text-amber-700 uppercase mb-3">Áreas de Mejora</h4>
                  <ul className="space-y-2">
                    {prismaResult.areas_mejora?.map((a: string, i: number) => (
                      <li key={i} className="bg-amber-50 rounded-lg px-4 py-2.5 text-sm text-amber-800 border border-amber-100">
                        {a}
                      </li>
                    ))}
                    {(!prismaResult.areas_mejora || prismaResult.areas_mejora.length === 0) && (
                      <li className="text-slate-400 text-sm italic">No se identificaron áreas de mejora.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Recomendaciones Estratégicas */}
              <div>
                <h4 className="text-sm font-bold text-blue-700 uppercase mb-3">Recomendaciones Estratégicas</h4>
                <div className="space-y-2">
                  {prismaResult.recomendaciones_estrategicas?.map((r: string, i: number) => (
                    <div key={i} className="bg-blue-50 rounded-xl px-5 py-3 border border-blue-100 flex items-start gap-3">
                      <span className="bg-[#12239E] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                      <p className="text-sm text-slate-700">{r}</p>
                    </div>
                  ))}
                  {(!prismaResult.recomendaciones_estrategicas || prismaResult.recomendaciones_estrategicas.length === 0) && (
                    <p className="text-slate-400 text-sm italic">No se generaron recomendaciones estratégicas.</p>
                  )}
                </div>
              </div>

              {/* Pronóstico */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
                <h4 className="text-sm font-bold text-indigo-700 uppercase mb-2">Pronóstico de Evolución</h4>
                <p className="text-sm text-indigo-800 leading-relaxed">{prismaResult.pronostico}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Recommendation list with dimension grouping
function RecommendationsList({
  recommendations,
  dimensionAverages
}: {
  recommendations: any[];
  dimensionAverages: Record<DimensionCode, number>;
}) {
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const DIM_KEYS = Object.keys(DIMENSIONS) as DimensionCode[];

  const grouped = useMemo(() => {
    return AnalyticsEngine.groupByDimension(recommendations);
  }, [recommendations]);

  const sortedDims = useMemo(() => {
    return DIM_KEYS
      .filter(dim => grouped[dim].length > 0)
      .sort((a, b) => (dimensionAverages[a] || 0) - (dimensionAverages[b] || 0));
  }, [DIM_KEYS, grouped, dimensionAverages]);

  // Auto-expand the most critical dimension
  useEffect(() => {
    if (!expandedDim && sortedDims.length > 0) {
      setExpandedDim(sortedDims[0]);
    }
  }, [expandedDim, sortedDims]);

  return (
    <div className="space-y-3 flex-1 flex flex-col overflow-hidden">
      {/* Dimension tabs */}
      <div className="flex flex-wrap gap-2 mb-2">
        {sortedDims.map(dim => {
          const info = DIMENSIONS[dim];
          const avg = dimensionAverages[dim] || 0;
          const isActive = expandedDim === dim;
          const isCritical = avg <= 3.0;
          return (
            <button key={dim}
              onClick={() => setExpandedDim(isActive ? null : dim)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                isActive
                  ? isCritical
                    ? 'bg-rose-500 text-white border-rose-500'
                    : 'bg-[#12239E] text-white border-[#12239E]'
                  : isCritical
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {info.name.substring(0, 20)} ({grouped[dim].length}) · {avg.toFixed(1)}
            </button>
          );
        })}
      </div>

      {/* Recommendations list */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" style={{ maxHeight: '380px' }}>
        {expandedDim && grouped[expandedDim as DimensionCode]?.length > 0 ? (
          grouped[expandedDim as DimensionCode].map((rec, idx) => (
            <div key={`${rec.id}-${idx}`}
              className="bg-slate-50 rounded-xl p-4 border border-slate-100 hover:border-cyan-200 hover:shadow-md transition-all">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-bold px-2 py-1 rounded-md border ${
                  rec.currentScore <= 3.0
                    ? 'bg-rose-100 text-rose-700 border-rose-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                }`}>
                  {rec.dimension} (Prom: {rec.currentScore.toFixed(2)})
                </span>
                <span className="text-xs font-semibold text-slate-400">ID: {rec.id}</span>
              </div>
              <div className="mt-2 space-y-2">
                <p className="text-sm text-slate-700">
                  <span className="font-bold text-cyan-700">Sugerencia:</span>{' '}
                  {rec.recommendation}
                </p>
                <p className="text-sm text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="font-bold text-emerald-700">Acción:</span>{' '}
                  {rec.action}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center p-8 text-slate-400">
            <p>Selecciona una dimensión para ver sus recomendaciones</p>
          </div>
        )}
      </div>
    </div>
  );
}

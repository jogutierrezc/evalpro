import { useEffect, useState, useMemo } from 'react';
import { supabase, Evaluation } from '../lib/supabase';
import {
  X,
  Download,
  Share2,
  BrainCircuit,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Award,
  FileText,
  Target,
  ArrowUpRight,
  AlertTriangle,
  Users,
  BarChart3
} from 'lucide-react';

interface Props {
  evaluation: Evaluation;
  onClose: () => void;
}

interface SectionSummaryRow {
  sectionId: string | null;
  sectionName: string;
  avg: number | null;
  weight: number;
  questions: Array<{ id: string; text: string; type: string; weight?: number; response?: any }>;
}

// --- RADAR CHART COMPONENT ---
const RadarChart = ({ data, size = 300 }: { data: SectionSummaryRow[]; size?: number }) => {
  const center = size / 2;
  const radius = (size / 2) - 40;
  const levels = 5;
  const angleSlice = (Math.PI * 2) / data.length;

  const getCoordinates = (value: number, index: number, maxVal = 5) => {
    const angle = index * angleSlice - Math.PI / 2;
    const r = (value / maxVal) * radius;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle)
    };
  };

  const points = data.map((d, i) => {
    const coords = getCoordinates(d.avg || 0, i);
    return `${coords.x},${coords.y} `;
  }).join(" ");

  return (
    <div className="relative flex justify-center items-center py-4">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background levels */}
        {[...Array(levels)].map((_, level) => {
          const levelRadius = (radius / levels) * (level + 1);
          const levelPoints = data.map((_, i) => {
            const angle = i * angleSlice - Math.PI / 2;
            return `${center + levelRadius * Math.cos(angle)},${center + levelRadius * Math.sin(angle)} `;
          }).join(" ");

          return (
            <g key={level}>
              <polygon points={levelPoints} fill="none" stroke="#e2e8f0" strokeWidth="1" />
              <text
                x={center}
                y={center - levelRadius - 5}
                className="text-[10px] fill-slate-400 font-medium"
                textAnchor="middle"
              >
                {level + 1}
              </text>
            </g>
          );
        })}

        {/* Axes */}
        {data.map((d, i) => {
          const coords = getCoordinates(5, i);
          return (
            <line
              key={`axis - ${i} `}
              x1={center}
              y1={center}
              x2={coords.x}
              y2={coords.y}
              stroke="#e2e8f0"
              strokeWidth="1"
            />
          );
        })}

        {/* Axis labels */}
        {data.map((d, i) => {
          const angle = i * angleSlice - Math.PI / 2;
          const labelRadius = radius + 25;
          const x = center + labelRadius * Math.cos(angle);
          const y = center + labelRadius * Math.sin(angle);

          let anchor = "middle";
          if (x > center + 20) anchor = "start";
          if (x < center - 20) anchor = "end";

          return (
            <text
              key={`label - ${i} `}
              x={x}
              y={y}
              className="text-[10px] sm:text-xs fill-slate-600 font-semibold uppercase tracking-tight"
              textAnchor={anchor}
              dominantBaseline="middle"
            >
              {d.sectionName.length > 15 ? d.sectionName.substring(0, 12) + '...' : d.sectionName}
            </text>
          );
        })}

        {/* Data polygon */}
        <polygon
          points={points}
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#2563eb"
          strokeWidth="2"
          className="drop-shadow-sm filter"
        />

        {/* Data points */}
        {data.map((d, i) => {
          const coords = getCoordinates(d.avg || 0, i);
          return (
            <circle
              key={`point - ${i} `}
              cx={coords.x}
              cy={coords.y}
              r="4"
              fill="#1e40af"
              stroke="white"
              strokeWidth="2"
              className="cursor-pointer hover:r-6 transition-all"
            >
              <title>{d.sectionName}: {d.avg?.toFixed(2) || 'N/A'}</title>
            </circle>
          );
        })}
      </svg>
    </div>
  );
};

export default function SectionAnalysis({ evaluation, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<SectionSummaryRow[]>([]);
  const [global, setGlobal] = useState<number>(0);
  const [expandedSection, setExpandedSection] = useState<number | null>(null);
  const [evaluatedUser, setEvaluatedUser] = useState<any>(null);
  const [evaluatorUser, setEvaluatorUser] = useState<any>(null);

  useEffect(() => { load(); }, [evaluation.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: sections }, { data: questions }, { data: responses }, { data: evaluated }, { data: evaluator }] = await Promise.all([
        supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
        supabase.from('users').select('*').eq('id', evaluation.evaluated_id).single(),
        supabase.from('users').select('*').eq('id', evaluation.evaluator_id).single(),
      ]);

      setEvaluatedUser(evaluated);
      setEvaluatorUser(evaluator);

      const sectionsList: any[] = sections || [];
      const questionsList: any[] = questions || [];
      const responsesList: any[] = responses || [];

      const respMap: Record<string, any> = {};
      responsesList.forEach((r) => { respMap[r.question_id] = r.response_value; });

      const built: SectionSummaryRow[] = sectionsList.map((s) => {
        const qs = (questionsList || []).filter((q: any) => q.section_id === s.id);
        const qDetails = qs.map((q: any) => ({ id: q.id, text: q.question_text || '', type: q.question_type, weight: Number(q.weight || 0), response: respMap[q.id] }));
        const ratingQs = qDetails.filter((q) => q.type === 'rating' && q.response !== undefined && q.response !== null);
        const hasWeights = ratingQs.some((q) => Number(q.weight || 0) > 0);
        let avg: number | null = null;
        if (ratingQs.length > 0) {
          if (hasWeights) {
            let ssum = 0; let wsum = 0;
            ratingQs.forEach((q) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
            avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
          } else {
            const vals = ratingQs.map((q) => Number(q.response));
            avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          }
        }

        // Calculate weight as percentage of total questions (will be normalized later)
        const weight = qs.length;

        return { sectionId: s.id, sectionName: s.name || s.title || `Sección ${s.id}`, avg, weight, questions: qDetails };
      });

      // Normalize weights to sum to 100%
      const totalWeight = built.reduce((sum, s) => sum + s.weight, 0);
      if (totalWeight > 0) {
        built.forEach(s => {
          s.weight = Math.round((s.weight / totalWeight) * 100);
        });
      }

      const allRating = built.flatMap((s) => s.questions.filter((q) => q.type === 'rating'));
      const anyW = allRating.some((q) => Number(q.weight || 0) > 0);
      let globalScore = 0;
      if (allRating.length > 0) {
        if (anyW) {
          let ssum = 0; let wsum = 0;
          allRating.forEach((q) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
          globalScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : 0;
        } else {
          const vals = allRating.map((q) => Number(q.response)).filter((v) => !isNaN(v));
          globalScore = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
        }
      }

      setSections(built);
      setGlobal(globalScore);
    } catch (err) {
      console.error('Error loading section analysis', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    try {
      const header = ['SECCIÓN', 'PROMEDIO', 'PREGUNTA', 'TIPO', 'PESO', 'RESPUESTA'];
      const rows: any[] = [];
      (sections || []).forEach((s) => {
        if ((s.questions || []).length === 0) {
          rows.push([s.sectionName, s.avg ?? '', '', '', '', '']);
        } else {
          s.questions.forEach((q: any, idx: number) => {
            rows.push([idx === 0 ? s.sectionName : '', idx === 0 ? (s.avg ?? '') : '', q.text, q.type, q.weight ?? '', q.response ?? '']);
          });
        }
      });
      const footer = ['GLOBAL', global.toFixed(2), '', '', '', ''];
      const csv = [header, ...rows, footer]
        .map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analisis_${evaluation.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV', err);
      alert('No se pudo exportar CSV.');
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white p-6 rounded-2xl shadow-xl">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-slate-600">Cargando análisis...</p>
      </div>
    </div>
  );

  const strengths = sections.filter(s => s.avg !== null && s.avg >= 4.5);
  const improvements = sections.filter(s => s.avg !== null && s.avg < 4.0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">

      <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* HEADER */}
        <div className="bg-white border-b border-slate-100 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide">Evaluación Finalizada</span>
              <span className="text-slate-400 text-xs">{new Date(evaluation.created_at).toLocaleDateString()}</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Resultados de Desempeño</h2>
            <p className="text-slate-500 text-sm">Evaluado: <span className="font-semibold text-slate-700">{evaluatedUser?.full_name}</span></p>
            <p className="text-slate-400 text-xs">Evaluador: {evaluatorUser?.full_name}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => alert('Función de compartir próximamente')}
              className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-medium text-sm transition-colors border border-slate-200"
            >
              <Share2 className="w-4 h-4" /> Compartir
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors shadow-lg shadow-blue-600/20"
            >
              <Download className="w-4 h-4" /> Descargar CSV
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-slate-50/50">

          {/* Top Section: Score & Radial Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">

            {/* Left: Global Score & AI Summary */}
            <div className="space-y-6">
              {/* Score Card */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-400"></div>
                <h3 className="text-slate-500 font-medium text-sm uppercase tracking-wider mb-4">Puntuación Global</h3>
                <div className="flex items-center justify-center relative">
                  <svg className="w-40 h-40 transform -rotate-90">
                    <circle cx="80" cy="80" r="70" stroke="#f1f5f9" strokeWidth="12" fill="none" />
                    <circle
                      cx="80" cy="80" r="70"
                      stroke="#2563eb"
                      strokeWidth="12"
                      fill="none"
                      strokeDasharray={440}
                      strokeDashoffset={440 - (440 * global) / 5}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-4xl font-bold text-slate-800">{global.toFixed(1)}</span>
                    <span className="text-sm text-slate-400">de 5.0</span>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-100">
                  <TrendingUp className="w-3 h-3" /> {global >= 4.5 ? 'Sobresaliente' : global >= 3.5 ? 'Bueno' : 'En Desarrollo'}
                </div>
              </div>

              {/* AI Insight Box */}
              <div className="bg-gradient-to-br from-indigo-900 to-blue-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <BrainCircuit className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <BrainCircuit className="w-5 h-5 text-yellow-400" />
                  <h3 className="font-bold text-lg">Análisis Inteligente</h3>
                </div>
                <div className="space-y-3 text-sm text-blue-100 relative z-10">
                  {strengths.length > 0 && (
                    <p>
                      <span className="text-emerald-300 font-bold block mb-1">Fortalezas Clave:</span>
                      Tu perfil destaca significativamente en <strong className="text-white">{strengths.map(s => s.sectionName).join(", ")}</strong>. Eres un pilar fundamental para los objetivos del equipo.
                    </p>
                  )}
                  {strengths.length > 0 && improvements.length > 0 && <div className="h-px bg-white/10 my-2"></div>}
                  {improvements.length > 0 && (
                    <p>
                      <span className="text-orange-300 font-bold block mb-1">Áreas de Enfoque:</span>
                      Recomendamos fortalecer <strong className="text-white">{improvements.map(s => s.sectionName).join(", ")}</strong> para lograr un perfil integral de liderazgo.
                    </p>
                  )}
                  {strengths.length === 0 && improvements.length === 0 && (
                    <p className="text-blue-100">
                      Desempeño equilibrado en todas las áreas evaluadas. Continúa con el buen trabajo y busca oportunidades de crecimiento continuo.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Center/Right: Radar Chart Visualization */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-800 text-lg">Mapa de Competencias</h3>
                <div className="flex gap-4 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-600"></span> Tu Puntaje
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-slate-200 border border-slate-300"></span> Meta Esperada
                  </div>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 border-dashed">
                {sections.length > 0 ? (
                  <RadarChart data={sections} size={380} />
                ) : (
                  <p className="text-slate-400">No hay datos suficientes para el gráfico</p>
                )}
              </div>
            </div>

          </div>

          {/* Bottom Section: Detailed Breakdown */}
          <div className="space-y-4">
            <h3 className="font-bold text-slate-800 text-lg mb-2 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" /> Desglose por Sección
            </h3>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              {sections.map((section, idx) => (
                <div key={section.sectionId || idx} className="group">
                  <div
                    onClick={() => setExpandedSection(expandedSection === idx ? null : idx)}
                    className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                  >
                    {/* Icon & Title */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h4 className={`font-bold text-base ${expandedSection === idx ? 'text-blue-700' : 'text-slate-800'}`}>
                          {section.sectionName}
                        </h4>
                        {section.avg !== null && section.avg >= 4.5 && <Award className="w-4 h-4 text-yellow-500" />}
                      </div>
                      <p className="text-xs text-slate-500">{section.questions.length} preguntas evaluadas</p>
                    </div>

                    {/* Progress Bar & Score */}
                    <div className="w-full sm:w-48 md:w-64 flex items-center gap-4">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${(section.avg || 0) >= 4.5 ? 'bg-emerald-500' :
                            (section.avg || 0) >= 3.5 ? 'bg-blue-500' : 'bg-orange-500'
                            }`}
                          style={{ width: `${((section.avg || 0) / 5) * 100}%` }}
                        ></div>
                      </div>
                      <div className={`font-bold text-lg w-12 text-right ${(section.avg || 0) >= 4.5 ? 'text-emerald-600' :
                        (section.avg || 0) >= 3.5 ? 'text-blue-600' : 'text-orange-600'
                        }`}>
                        {section.avg?.toFixed(1) || 'N/A'}
                      </div>
                    </div>

                    {/* Expand Chevron */}
                    <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                      {expandedSection === idx ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expandedSection === idx && (
                    <div className="bg-slate-50 px-5 py-4 sm:px-14 pb-6 animate-in slide-in-from-top-2 duration-200">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                        <h5 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Detalle de Preguntas</h5>
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left p-2 text-xs font-semibold text-slate-600">Pregunta</th>
                              <th className="text-center p-2 text-xs font-semibold text-slate-600">Tipo</th>
                              <th className="text-center p-2 text-xs font-semibold text-slate-600">Peso</th>
                              <th className="text-center p-2 text-xs font-semibold text-slate-600">Respuesta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {section.questions.map((q) => (
                              <tr key={q.id} className="border-t border-slate-100">
                                <td className="p-2 text-slate-700">{q.text}</td>
                                <td className="p-2 text-center text-slate-500 text-xs">{q.type}</td>
                                <td className="p-2 text-center text-slate-500">{q.weight ?? 0}</td>
                                <td className="p-2 text-center font-semibold text-slate-800">{q.response ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* FOOTER */}
        <div className="bg-white border-t border-slate-100 p-4 flex justify-between items-center text-xs text-slate-400 px-8">
          <span>Generado automáticamente por E-Valora UDES</span>
          <span>ID Evaluación: {evaluation.id.substring(0, 13)}</span>
        </div>

      </div>
    </div>
  );
}

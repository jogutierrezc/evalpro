import { useState, useMemo, useEffect } from 'react';
import { Zap, Target, AlertCircle, Brain, Sparkles, Printer, Calendar } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEvaluationReport } from '../hooks/useEvaluationReport';
import { usePeriods } from '../hooks/usePeriods';
import { PrismaBrain, AnalysisResult, PRISMA_KNOWLEDGE_BASE, NarrativeGenerator } from '../lib/prisma-engine';
import { AI_ENABLED } from '../lib/features';
import { supabase } from '../lib/supabase';
import { GoogleAiReport } from '../components/GoogleAiReport';
import { PrismaLoader } from '../components/PrismaLoader';
import { PrintableReport } from '../components/PrintableReport';

// --- RADAR CHART COMPONENT (Adapted from SectionAnalysis) ---
const RadarChart = ({ data, size = 300, comparisonScore }: { data: AnalysisResult[]; size?: number; comparisonScore?: number }) => {
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
        const coords = getCoordinates(d.score || 0, i);
        return `${coords.x},${coords.y} `;
    }).join(" ");

    return (
        <div className="relative flex justify-center items-center py-4">
            <svg width={size} height={size} className="overflow-visible">
                {/* Comparison Polygon (Gray Background) */}
                {comparisonScore !== undefined && (
                    <g>
                        <polygon
                            points={data.map((_, i) => {
                                const coords = getCoordinates(comparisonScore, i);
                                return `${coords.x},${coords.y} `;
                            }).join(" ")}
                            fill="#f1f5f9"
                            stroke="#cbd5e1"
                            strokeWidth="1"
                        />
                    </g>
                )}

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
                {data.map((_d, i) => {
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

                    let anchor: "start" | "middle" | "end" = "middle";
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
                            {d.category.length > 15 ? d.category.substring(0, 12) + '...' : d.category}
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
                    const coords = getCoordinates(d.score || 0, i);
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
                            <title>{d.category}: {d.score.toFixed(2)}</title>
                        </circle>
                    );
                })}
            </svg>
        </div>
    );
};

interface PrismaReportProps {
    targetUserId?: string;
    evaluationId?: string;
    viewMode?: 'self' | 'manager';
    targetUserName?: string;
}

const PrismaReport: React.FC<PrismaReportProps> = ({ targetUserId, evaluationId, viewMode = 'self', targetUserName }) => {
    const { user } = useAuth();
    const { periods, activePeriod } = usePeriods();
    const userIdToFetch = targetUserId || user?.id;
    const [selectedPeriodId, setSelectedPeriodId] = useState<string>('all');
    const [selectedEvalId, setSelectedEvalId] = useState<string | undefined>(evaluationId);
    
    const { rawEvaluation, availableEvaluations, loading } = useEvaluationReport({ 
        userId: userIdToFetch, 
        evaluationId: selectedEvalId,
        periodId: selectedPeriodId
    });

    useEffect(() => {
        if (activePeriod && !selectedEvalId) {
            setSelectedPeriodId(activePeriod.id);
        }
    }, [activePeriod]);
    const [aiResults, setAiResults] = useState<AnalysisResult[] | null>(null);
    const [isEnhancing, setIsEnhancing] = useState(false);

    // Sync selectedEvalId with prop
    useEffect(() => {
        if (evaluationId) {
            setSelectedEvalId(evaluationId);
        }
    }, [evaluationId]);

    // Reset AI results when evaluation or user changes
    useEffect(() => {
        setAiResults(null);
    }, [userIdToFetch, selectedEvalId]);

    // Load saved AI results if available
    useEffect(() => {
        if (rawEvaluation?.results?.[0]?.ai_analysis) {
            try {
                const parsed = JSON.parse(rawEvaluation.results[0].ai_analysis);
                console.log("Loaded saved AI analysis from DB");
                setAiResults(parsed);
            } catch (e) {
                console.error("Failed to parse saved AI analysis", e);
            }
        }
    }, [rawEvaluation]);

    const analysisResults = useMemo(() => {
        if (!rawEvaluation) return [];

        // 1. PRIORIDAD: Usar datos reales (category_scores) de evaluation_results
        const dbResult = rawEvaluation?.results ? (Array.isArray(rawEvaluation.results) ? rawEvaluation.results[0] : rawEvaluation.results) : null;
        
        if (dbResult?.category_scores && Object.keys(dbResult.category_scores).length > 0) {
            console.log("[Prisma] Usando puntajes reales de la base de datos");
            const results: AnalysisResult[] = [];
            const catScores = dbResult.category_scores;
            const categories = PrismaBrain.getCategories();

            categories.forEach(catId => {
                const config = (PRISMA_KNOWLEDGE_BASE as any)[catId];
                const score = parseFloat(catScores[config?.name] || catScores[config?.id] || catScores[catId] || 0);

                if (score > 0) {
                    // Generar narrativa basada en el puntaje real
                    const narrativa = (NarrativeGenerator as any).generate(catId, score, false);
                    results.push({
                        category: config?.name || catId,
                        score: score,
                        rawScore: score,
                        maxPossibleScore: 5.0,
                        percentage: Math.round((score / 5) * 100),
                        anchorFailed: false,
                        ...narrativa
                    });
                }
            });

            if (results.length > 0) return results;
        }

        // 2. FALLBACK: Calcular desde respuestas si no hay resultados procesados
        if (!rawEvaluation.responses) return [];
        
        console.log("[Prisma] Calculando puntajes desde respuestas (fallback)");
        // Helper to handle jsonb values (Robust version from ExportModule)
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

        const userAnswers: Record<string, number> = {};
        const sectionScores: Record<string, { total: number; count: number }> = {};

        rawEvaluation.responses.forEach((r: any) => {
            const qType = r.question?.question_type || r.question?.type || 'rating';
            if (qType !== 'rating' && qType !== 'scale') return;

            const text = r.question?.question_text || '';
            const section = r.question?.section?.title || 'General';
            const val = normalizeValue(r.response_value);

            // Filter out 0/empty values to match ExportModule behavior
            if (val > 0) {
                userAnswers[text] = val;
                if (!sectionScores[section]) sectionScores[section] = { total: 0, count: 0 };
                sectionScores[section].total += val;
                sectionScores[section].count += 1;
            }
        });

        const results: AnalysisResult[] = [];
        const categories = PrismaBrain.getCategories();
        const normalizeStr = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        categories.forEach(cat => {
            let res = PrismaBrain.analyze(cat, userAnswers);

            if (res.score === 0) {
                const catNorm = normalizeStr(cat);
                const matchingSectionKey = Object.keys(sectionScores).find(k => {
                    const kNorm = normalizeStr(k);
                    return kNorm.includes(catNorm) || catNorm.includes(kNorm);
                });

                if (matchingSectionKey) {
                    const sData = sectionScores[matchingSectionKey];
                    const avg = sData.count > 0 ? Number((sData.total / sData.count).toFixed(2)) : 0;

                    if (avg > 0) {
                        const isHigh = avg >= 4;
                        const isMed = avg >= 3;
                        res = {
                            ...res,
                            score: avg,
                            percentage: Math.round((avg / 5) * 100),
                            anchorFailed: false,
                            nivelRiesgo: avg < 3 ? 'Alto' : avg < 4 ? 'Medio' : 'Bajo',
                            arquetipo: isHigh ? 'Desempeño Sobresaliente' : isMed ? 'Desempeño Competente' : 'Oportunidad de Mejora',
                            analisis: `Promedio de sección "${matchingSectionKey}" (${avg}/5.0).`,
                            accionSugerida: isHigh ? 'Continuar liderando.' : 'Establecer objetivos de mejora.'
                        };
                    }
                }
            }
            if (res && res.score > 0) results.push(res);
        });

        return results;
    }, [rawEvaluation]);

    const displayResults = aiResults || analysisResults;
    
    // Helper para normalización de valores numéricos
    const normVal = (val: any): number => {
        if (val === null || val === undefined || val === '') return 0;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const parsed = parseFloat(val.replace(',', '.'));
            return isNaN(parsed) ? 0 : parsed;
        }
        if (typeof val === 'object') return Number(val.value || val.rating || val.score || val.response || 0);
        return 0;
    };

    const globalScore = useMemo(() => {
        if (!rawEvaluation) return "0.0";

        // 1. PRIORIDAD: Usar puntaje global real de la base de datos (solo si es > 0)
        const dbResult = rawEvaluation.results ? (Array.isArray(rawEvaluation.results) ? rawEvaluation.results[0] : rawEvaluation.results) : null;
        const storedScore = normVal(dbResult?.overall_score);
        if (storedScore > 0) {
            return storedScore.toFixed(1);
        }

        // 2. FALLBACK: Calcular desde respuestas
        if (rawEvaluation?.responses?.length) {
            let total = 0;
            let count = 0;
            
            rawEvaluation.responses.forEach((r: any) => {
                const qType = r.question?.question_type || r.question?.type;
                if (!qType || qType === 'rating' || qType === 'scale') {
                    const val = normVal(r.response_value);
                    if (val > 0) {
                        total += val;
                        count++;
                    }
                }
            });

            if (count > 0) return (total / count).toFixed(1);
        }

        return displayResults.length > 0
            ? (displayResults.reduce((acc, curr) => acc + curr.score, 0) / displayResults.length).toFixed(1)
            : "0.0";
    }, [displayResults, rawEvaluation]);

    const handleEnhanceWithAi = async () => {
        if (!AI_ENABLED || isEnhancing) return;
        setIsEnhancing(true);
        try {
            // Process sequentially to avoid Rate Limits (429) on free tier
            const enhanced = [];
            for (const res of analysisResults) {
                // Add a small delay between requests
                await new Promise(resolve => setTimeout(resolve, 500));
                
                let enriched;
                if (viewMode === 'manager') {
                    enriched = await PrismaBrain.enrichWithAiForManager(res, targetUserName || 'Colaborador');
                } else {
                    enriched = await PrismaBrain.enrichWithAi(res);
                }
                
                enhanced.push(enriched);
            }
            setAiResults(enhanced);

            // Save to database
            if (rawEvaluation?.id) {
                try {
                    const score = enhanced.length > 0 
                        ? (enhanced.reduce((acc: any, curr: any) => acc + curr.score, 0) / enhanced.length)
                        : 0;

                    const payload = {
                        evaluation_id: rawEvaluation.id,
                        ai_analysis: JSON.stringify(enhanced),
                        overall_score: score,
                        updated_at: new Date().toISOString()
                    };

                    const { data: existingResult } = await supabase
                        .from('evaluation_results')
                        .select('id')
                        .eq('evaluation_id', rawEvaluation.id)
                        .maybeSingle();

                    if (existingResult) {
                        await supabase
                            .from('evaluation_results')
                            .update(payload)
                            .eq('id', existingResult.id);
                    } else {
                        await supabase
                            .from('evaluation_results')
                            .insert(payload);
                    }
                    console.log("AI Analysis saved to DB");
                } catch (err) {
                    console.error("Error saving AI results", err);
                }
            }
        } catch (error) {
            console.error("Error enhancing with AI", error);
        } finally {
            setIsEnhancing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
                <div className="w-full max-w-md space-y-6 text-center">
                    <div className="relative w-32 h-32 mx-auto">
                        <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                        <Brain className="absolute inset-0 m-auto text-indigo-600 animate-pulse" size={40} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Sistema Neural de Análisis Prisma UDES</h2>
                        <p className="text-slate-500 mt-2">Procesando patrones de comportamiento...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!displayResults.length) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto p-6">
                    <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">No se encontraron resultados</h2>
                    <p className="text-slate-600">No hemos podido generar tu perfil Prisma. Por favor intenta realizar la evaluación nuevamente.</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="print:hidden min-h-screen bg-slate-50 pb-20">
                {/* Header / Hero Section */}
                <div className="bg-indigo-900 text-white pt-12 pb-24 px-4 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full opacity-10">
                    <div className="absolute top-10 left-10 w-64 h-64 bg-indigo-500 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-10 right-10 w-96 h-96 bg-purple-500 rounded-full blur-3xl"></div>
                </div>

                <div className="max-w-5xl mx-auto relative z-10">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div>
                            <div className="inline-flex items-center gap-2 bg-indigo-800/50 px-3 py-1 rounded-full text-indigo-200 text-sm mb-4 border border-indigo-700/50">
                                <Brain size={16} />
                                <span>{viewMode === 'manager' ? 'Informe de Gestión de Talento' : 'Informe de Inteligencia Conductual'}</span>
                            </div>
                             <h1 className="text-3xl md:text-4xl font-bold mb-2">{viewMode === 'manager' ? `Reporte: ${targetUserName}` : 'Mi Resultado Prisma'}</h1>
                             <p className="text-indigo-200 text-lg max-w-2xl mb-4">
                                 {viewMode === 'manager' 
                                     ? `Análisis de desempeño y guía de coaching para ${targetUserName}.`
                                     : `Hola ${user?.full_name?.split(' ')[0]}, hemos analizado tu perfil profesional basándonos en ${displayResults.length} dimensiones clave de desempeño.`
                                 }
                             </p>

                             {/* Selector de Periodo y Evaluación */}
                             <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                 {periods.length > 0 && (
                                     <div className="flex items-center gap-2 bg-indigo-800/50 border border-indigo-700/50 px-4 py-2 rounded-xl">
                                         <Calendar className="w-4 h-4 text-indigo-300" />
                                         <select
                                             className="bg-transparent border-none text-white text-sm focus:ring-0 cursor-pointer font-medium"
                                             value={selectedPeriodId}
                                             onChange={(e) => {
                                                 setSelectedPeriodId(e.target.value);
                                                 setSelectedEvalId(undefined);
                                             }}
                                         >
                                             <option value="all" className="text-slate-900">Todos los periodos</option>
                                             {periods.map(p => (
                                                 <option key={p.id} value={p.id} className="text-slate-900">{p.year}</option>
                                             ))}
                                         </select>
                                     </div>
                                 )}

                                 {availableEvaluations.length > 0 && (
                                     <div className="flex items-center gap-2 bg-indigo-800/50 border border-indigo-700/50 px-4 py-2 rounded-xl">
                                         <Target className="w-4 h-4 text-indigo-300" />
                                         <select 
                                             className="bg-transparent border-none text-white text-sm focus:ring-0 cursor-pointer font-medium"
                                             value={selectedEvalId || availableEvaluations[0]?.id}
                                             onChange={(e) => setSelectedEvalId(e.target.value)}
                                         >
                                             {availableEvaluations.map(ev => (
                                                 <option key={ev.id} value={ev.id} className="text-slate-900">
                                                     {ev.template?.name} - {new Date(ev.created_at).toLocaleDateString()}
                                                 </option>
                                             ))}
                                         </select>
                                     </div>
                                 )}
                                                                             </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => window.print()}
                                className="no-print flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg transition-colors backdrop-blur-sm border border-white/10"
                            >
                                <Printer size={18} />
                                <span className="hidden sm:inline">Imprimir</span>
                            </button>

                            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/10 text-center min-w-[100px]">
                                <span className="block text-3xl font-bold">{globalScore}</span>
                                <span className="text-xs text-indigo-200 uppercase tracking-wider">Global</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 -mt-16 relative z-20">
                <div className="space-y-8">

                    {/* Top Section: Visuals (Radar + Strengths) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Radar Chart Widget */}
                        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-6 border border-slate-100 flex flex-col">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Target size={18} className="text-indigo-600" />
                                Mapa de Competencias
                            </h3>
                            <div className="aspect-square relative flex-1 flex items-center justify-center">
                                {displayResults.length > 0 ? (
                                    <RadarChart
                                        data={displayResults}
                                        size={350}
                                    />
                                ) : (
                                    <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                                        Sin datos para graficar
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-center gap-4 mt-4 text-xs">
                                <div className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-blue-600"></span> Tu Puntaje
                                </div>
                            </div>
                        </div>

                        {/* Resumen de Fortalezas */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" />
                                Top Fortalezas
                            </h3>
                            <div className="space-y-6 flex-1">
                                {[...displayResults]
                                    .sort((a, b) => b.score - a.score)
                                    .slice(0, 5)
                                    .map((res, idx) => (
                                        <div key={idx} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                            <div className="bg-green-100 text-green-700 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="text-base font-bold text-slate-700">{res.category}</h4>
                                                <p className="text-xs text-slate-500">{res.arquetipo}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-slate-700 block">{res.score}</span>
                                                <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
                                                    <div className="h-full bg-green-500" style={{ width: `${(res.score / 5) * 100}%` }}></div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    </div>

                    {/* Bottom Section: AI Results or CTA */}
                    <div>
                        {!AI_ENABLED ? null : isEnhancing ? (
                            <div className="bg-white rounded-2xl p-12 shadow-xl border border-slate-100">
                                <PrismaLoader />
                            </div>
                        ) : aiResults ? (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <GoogleAiReport 
                                    results={displayResults} 
                                    globalScore={globalScore} 
                                    userName={user?.full_name} 
                                />
                                <div className="mt-8 text-center text-xs text-slate-400 border-t border-slate-200 pt-6">
                                    <p className="flex items-center justify-center gap-2">
                                        <Sparkles className="w-3 h-3" />
                                        Este informe se construyó con el Motor de Prisma AI de la Universidad de Santander y Potenciado por Google Gemini.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            /* Call to Action for AI Enhancement */
                            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl p-12 text-white shadow-xl relative overflow-hidden flex flex-col justify-center items-center text-center">
                                {/* Background Effects */}
                                <div className="absolute top-0 left-0 w-full h-full opacity-20">
                                    <div className="absolute top-10 right-10 w-64 h-64 bg-indigo-500 rounded-full blur-3xl"></div>
                                    <div className="absolute bottom-10 left-10 w-64 h-64 bg-purple-500 rounded-full blur-3xl"></div>
                                </div>

                                <div className="relative z-10 max-w-2xl">
                                    <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-8 border border-white/20 shadow-lg">
                                        <Sparkles className="w-10 h-10 text-amber-300" />
                                    </div>
                                    
                                    <h3 className="text-3xl font-bold mb-4">Potenciar Reporte con Prisma AI</h3>
                                    <p className="text-indigo-200 mb-10 text-lg leading-relaxed">
                                        Obtén una perspectiva constructiva y personalizada de tu perfil. 
                                        Nuestra inteligencia artificial analizará tus resultados para ofrecerte una guía de crecimiento profesional, 
                                        identificando oportunidades de evolución de manera reflexiva y sutil.
                                    </p>

                                    <button 
                                        onClick={handleEnhanceWithAi}
                                        disabled={isEnhancing}
                                        className="group relative inline-flex items-center justify-center px-8 py-4 font-bold text-white transition-all duration-200 bg-indigo-600 font-pj rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-600 hover:bg-indigo-500 disabled:opacity-70 disabled:cursor-not-allowed text-lg shadow-lg shadow-indigo-900/50"
                                    >
                                        {isEnhancing ? (
                                            <>
                                                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent mr-3"></div>
                                                Generando Análisis...
                                            </>
                                        ) : (
                                            <>
                                                Generar Reporte Inteligente
                                                <div className="absolute -inset-3 rounded-xl bg-indigo-400 opacity-20 group-hover:opacity-40 blur-lg transition-opacity duration-200" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            </div>
            
            <PrintableReport 
                userName={viewMode === 'manager' ? (targetUserName || 'Colaborador') : (user?.full_name || 'Usuario')}
                globalScore={globalScore}
                results={displayResults}
            />
        </>
    );
};

export default PrismaReport;

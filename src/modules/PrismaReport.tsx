import React, { useState, useMemo, useEffect } from 'react';
import { User, TrendingUp, Shield, Zap, Target, BookOpen, AlertCircle, CheckCircle, ChevronDown, ChevronUp, BarChart2, Briefcase, Brain, Layout, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useEvaluationReport } from '../hooks/useEvaluationReport';
import { PrismaBrain, AnalysisResult } from '../lib/prisma-engine';
import { supabase } from '../lib/supabase';

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

const PrismaReport = () => {
    const { user } = useAuth();
    const { rawEvaluation, loading } = useEvaluationReport({ userId: user?.id });
    const [expandedSection, setExpandedSection] = useState<string | null>(null);

    const analysisResults = useMemo(() => {
        if (!rawEvaluation || !rawEvaluation.responses) return [];

        // Helper to handle jsonb values
        const normalizeValue = (val: any): number => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            if (typeof val === 'string') {
                const parsed = parseFloat(val);
                return isNaN(parsed) ? 0 : parsed;
            }
            if (typeof val === 'object') {
                return Number(val.value || val.rating || val.score || val.response || 0);
            }
            return 0;
        };

        // Map responses: Question Text -> Score
        const userAnswers: Record<string, number> = {};
        const sectionScores: Record<string, { total: number; count: number }> = {};

        rawEvaluation.responses.forEach((r: any) => {
            // Filter only rating questions to avoid skewing averages
            const qType = r.question?.type || 'rating'; // Default to rating if missing, but should be there
            if (qType !== 'rating') return;

            const text = r.question?.question_text || '';
            const section = r.question?.section?.title || 'General';
            const val = normalizeValue(r.response_value);

            // Store by text for fuzzy matching in engine
            userAnswers[text] = val;

            // Store by section for fallback
            if (!sectionScores[section]) sectionScores[section] = { total: 0, count: 0 };
            sectionScores[section].total += val;
            sectionScores[section].count += 1;
        });

        console.log('[Prisma Debug] User Answers Keys:', Object.keys(userAnswers));
        console.log('[Prisma Debug] Section Scores:', sectionScores);

        const results: AnalysisResult[] = [];
        const categories = PrismaBrain.getCategories();

        // Helper to normalize strings (remove accents, lowercase)
        const normalizeStr = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        categories.forEach(cat => {
            let res = PrismaBrain.analyze(cat, userAnswers);

            // Fallback: If score is 0, try to find a matching section
            if (res.score === 0) {
                const configName = normalizeStr(res.category || '');
                const catNorm = normalizeStr(cat);

                // Find matching section in sectionScores
                const matchingSectionKey = Object.keys(sectionScores).find(k => {
                    const kNorm = normalizeStr(k);
                    return kNorm.includes(configName) || configName.includes(configName) ||
                        (catNorm === 'calidad' && kNorm.includes('calidad') && !kNorm.includes('sistema')) || // Prevent Calidad from matching SGC
                        (catNorm.includes('resultados') && kNorm.includes('resultados')) ||
                        (catNorm.includes('integridad') && kNorm.includes('integridad')) ||
                        (catNorm.includes('comunicacion') && kNorm.includes('comunicacion')) ||
                        (catNorm.includes('institucional') && kNorm.includes('institucional')) ||
                        (catNorm.includes('equipo') && kNorm.includes('equipo'));
                });

                if (matchingSectionKey) {
                    const sData = sectionScores[matchingSectionKey];
                    const avg = sData.count > 0 ? Number((sData.total / sData.count).toFixed(2)) : 0;

                    if (avg > 0) {
                        // Create a synthetic result based on the section average
                        // FORCE overwriting the narrative to avoid "Anchor Failed" text from 0 score
                        const isHigh = avg >= 4;
                        const isMed = avg >= 3;

                        res = {
                            ...res,
                            score: avg,
                            percentage: Math.round((avg / 5) * 100),
                            anchorFailed: false, // Important: clear anchor failure
                            nivelRiesgo: avg < 3 ? 'Alto' : avg < 4 ? 'Medio' : 'Bajo',
                            arquetipo: isHigh ? 'Desempeño Sobresaliente' : isMed ? 'Desempeño Competente' : 'Oportunidad de Mejora',
                            analisis: `El análisis se ha generado a partir del promedio general de la sección "${matchingSectionKey}" (${avg}/5.0). ${isHigh ? 'El evaluado demuestra un dominio sólido de esta competencia.' :
                                isMed ? 'El evaluado cumple con los expectativas básicas, aunque hay margen de mejora.' :
                                    'Se requiere un plan de fortalecimiento inmediato en esta área.'
                                }`,
                            accionSugerida: isHigh ? 'Continuar liderando con el ejemplo y mentorear a otros.' :
                                isMed ? 'Establecer objetivos específicos para elevar el estándar de calidad.' :
                                    'Solicitar feedback frecuente y capacitación de refuerzo.'
                        };
                        console.log(`[Prisma Debug] Used fallback for ${cat} using section ${matchingSectionKey}: ${avg}`);
                    }
                }
            }

            console.log(`[Prisma Debug] Analysis for ${cat}:`, res);
            // Only push if score > 0 effectively hides irrelevant categories
            if (res && res.score > 0) results.push(res);
        });

        return results;
    }, [rawEvaluation]);

    const globalScore = useMemo(() => {
        return analysisResults.length > 0
            ? (analysisResults.reduce((acc, curr) => acc + curr.score, 0) / analysisResults.length).toFixed(1)
            : "0.0";
    }, [analysisResults]);

    const toggleSection = (section: string) => {
        setExpandedSection(expandedSection === section ? null : section);
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

    if (!analysisResults.length) {
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
        <div className="min-h-screen bg-slate-50 pb-20">
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
                                <span>Informe de Inteligencia Conductual</span>
                            </div>
                            <h1 className="text-3xl md:text-4xl font-bold mb-2">Mi Resultado Prisma</h1>
                            <p className="text-indigo-200 text-lg max-w-2xl">
                                Hola {user?.full_name?.split(' ')[0]}, hemos analizado tu perfil profesional basándonos en
                                {analysisResults.length} dimensiones clave de desempeño.
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="bg-white/10 backdrop-blur-sm p-4 rounded-xl border border-white/10 text-center min-w-[100px]">
                                <span className="block text-3xl font-bold">{globalScore}</span>
                                <span className="text-xs text-indigo-200 uppercase tracking-wider">Global</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 -mt-16 relative z-20">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Radar & Core Stats */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Radar Chart Widget */}
                        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-6 border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <Target size={18} className="text-indigo-600" />
                                Mapa de Competencias
                            </h3>
                            <div className="aspect-square relative">
                                {analysisResults.length > 0 ? (
                                    <RadarChart
                                        data={analysisResults}
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

                            <div className="mt-4 text-xs text-slate-500 text-center leading-relaxed">
                                Visualización radial de tus competencias clave.
                            </div>
                        </div>

                        {/* Resumen de Fortalezas */}
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" />
                                Top Fortalezas
                            </h3>
                            <div className="space-y-4">
                                {analysisResults
                                    .sort((a, b) => b.score - a.score)
                                    .slice(0, 3)
                                    .map((res, idx) => (
                                        <div key={idx} className="flex items-start gap-3">
                                            <div className="mt-1 bg-green-100 text-green-700 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-bold text-slate-700">{res.category}</h4>
                                                <p className="text-xs text-slate-500 line-clamp-2">{res.arquetipo}</p>
                                            </div>
                                            <span className="text-sm font-bold text-slate-700 ml-auto">{res.score}</span>
                                        </div>
                                    ))
                                }
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Detailed Analysis */}
                    <div className="lg:col-span-2 space-y-6">

                        {/* Categories List */}
                        <div className="space-y-4">
                            {analysisResults.map((result, idx) => (
                                <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
                                    <div className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-800">{result.category}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${result.nivelRiesgo === 'Bajo' ? 'bg-green-100 text-green-700' :
                                                        result.nivelRiesgo === 'Medio' ? 'bg-amber-100 text-amber-700' :
                                                            'bg-red-100 text-red-700'
                                                        }`}>
                                                        Riesgo {result.nivelRiesgo}
                                                    </span>
                                                    <span className="text-xs text-slate-400">•</span>
                                                    <span className="text-xs text-slate-500 font-medium">{result.arquetipo}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-2xl font-bold text-indigo-600">{result.score}</span>
                                                <span className="text-xs text-slate-400 block">/ 5.0</span>
                                            </div>
                                        </div>

                                        <div className="relative h-2 bg-slate-100 rounded-full mb-4 overflow-hidden">
                                            <div
                                                className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ${result.score >= 4 ? 'bg-green-500' :
                                                    result.score >= 3 ? 'bg-amber-500' : 'bg-red-500'
                                                    }`}
                                                style={{ width: `${result.percentage}%` }}
                                            ></div>
                                        </div>

                                        <div className="grid md:grid-cols-2 gap-6 text-sm">
                                            <div className="bg-slate-50 p-3 rounded-lg">
                                                <h4 className="font-bold text-slate-700 mb-1 flex items-center gap-1">
                                                    <Brain size={14} className="text-slate-400" /> Análisis
                                                </h4>
                                                <p className="text-slate-600 leading-relaxed text-xs">
                                                    {result.analisis}
                                                </p>
                                            </div>
                                            <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                                                <h4 className="font-bold text-indigo-800 mb-1 flex items-center gap-1">
                                                    <Briefcase size={14} className="text-indigo-500" /> Acción Sugerida
                                                </h4>
                                                <p className="text-indigo-700 leading-relaxed text-xs">
                                                    {result.accionSugerida}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}


                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PrismaReport;

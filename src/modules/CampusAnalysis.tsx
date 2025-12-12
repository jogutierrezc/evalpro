import { useMemo, useState, useEffect } from 'react';
import { SectionSummaryRow } from './SectionAnalysis';
import { ResultWithDetails } from './ResultsModule';
import { supabase } from '../lib/supabase';
import { PrismaBrain } from '../lib/prisma-engine';
import {
    TrendingUp,
    Award,
    BrainCircuit,
    Building2,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    Target,
    BarChart3,
    Filter
} from 'lucide-react';

interface RadarDataPoint {
    sectionName: string;
    avg?: number | null;
}

// --- COMPARISON RADAR CHART (Campus vs Global) ---
const ComparisonRadarChart = ({ data, campusName, globalScore }: { data: RadarDataPoint[], campusName: string, globalScore: number }) => {
    const size = 350;
    const center = size / 2;
    const radius = (size / 2) - 50;
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

    return (
        <div className="relative flex flex-col items-center">
            <svg width={size} height={size} className="overflow-visible">
                {/* Global Average Polygon (Gray Background) */}
                <g>
                    <polygon
                        points={data.map((_, i) => {
                            const coords = getCoordinates(globalScore, i);
                            return `${coords.x},${coords.y} `;
                        }).join(" ")}
                        fill="#f1f5f9"
                        stroke="#cbd5e1"
                        strokeWidth="1"
                    />
                </g>

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
                {data.map((_, i) => {
                    const coords = getCoordinates(5, i);
                    return (
                        <line
                            key={`axis-${i}`}
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
                    const labelRadius = radius + 20;
                    const x = center + labelRadius * Math.cos(angle);
                    const y = center + labelRadius * Math.sin(angle);
                    let anchor = "middle";
                    if (x > center + 10) anchor = "start";
                    if (x < center - 10) anchor = "end";

                    return (
                        <text
                            key={`label-${i}`}
                            x={x}
                            y={y}
                            className="text-[10px] fill-slate-600 font-semibold uppercase tracking-tight"
                            textAnchor={anchor}
                            dominantBaseline="middle"
                        >
                            {d.sectionName.length > 15 ? d.sectionName.substring(0, 12) + '...' : d.sectionName}
                        </text>
                    );
                })}

                {/* Campus Polygon (Blue) */}
                <g>
                    <polygon
                        points={data.map((d, i) => {
                            const coords = getCoordinates(d.avg || 0, i);
                            return `${coords.x},${coords.y} `;
                        }).join(" ")}
                        fill="rgba(59, 130, 246, 0.2)"
                        stroke="#2563eb"
                        strokeWidth="2"
                    />
                    {data.map((d, i) => {
                        const coords = getCoordinates(d.avg || 0, i);
                        return (
                            <circle
                                key={`point-${i}`}
                                cx={coords.x}
                                cy={coords.y}
                                r="3"
                                fill="#2563eb"
                                stroke="white"
                                strokeWidth="1"
                            />
                        );
                    })}
                </g>
            </svg>

            <div className="flex gap-4 mt-2">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                    <span className="w-3 h-3 rounded-full bg-blue-500"></span> {campusName}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300"></span> Promedio Global ({globalScore.toFixed(1)})
                </div>
            </div>
        </div>
    );
};

interface Props {
    campusName: string;
    results: ResultWithDetails[];
    organizationAverage: number;
}

export default function CampusAnalysis({ campusName, results, organizationAverage }: Props) {
    const [selectedTemplate, setSelectedTemplate] = useState<string>('all');
    const [aiReport, setAiReport] = useState<any>(null);
    const [loadingAi, setLoadingAi] = useState(false);

    const uniqueTemplates = useMemo(() => {
        const templates = new Set<string>();
        results.forEach(r => {
            if (r.templateName) {
                templates.add(r.templateName);
            }
        });
        return Array.from(templates).sort();
    }, [results]);

    const analysis = useMemo(() => {
        // Filter results that have scores
        let validResults = results.filter(r => r.avgScore !== null && r.avgScore !== undefined);

        if (selectedTemplate !== 'all') {
            validResults = validResults.filter(r => r.templateName === selectedTemplate);
        }

        if (validResults.length === 0) return null;

        // 1. Global Campus Score (Arithmetic Mean for display)
        const totalScore = validResults.reduce((sum, r) => sum + (Number(r.avgScore) || 0), 0);
        const globalScore = totalScore / validResults.length;

        // 2. Aggregate Section Data (for Radar & Weights)
        const sectionMap: Record<string, { sum: number; count: number; name: string; id: string }> = {};

        validResults.forEach(r => {
            (r.sectionsSummary || []).forEach(s => {
                if (s.avg !== null) {
                    if (!sectionMap[s.sectionName]) {
                        sectionMap[s.sectionName] = { sum: 0, count: 0, name: s.sectionName, id: s.sectionId || '' };
                    }
                    sectionMap[s.sectionName].sum += s.avg;
                    sectionMap[s.sectionName].count += 1;
                }
            });
        });

        const campusSections: SectionSummaryRow[] = Object.values(sectionMap).map(s => ({
            sectionId: s.id,
            sectionName: s.name,
            avg: s.sum / s.count,
            weight: 1,
            questions: []
        }));

        // 3. Group by Office (The "Members" of this view)
        const officeMap: Record<string, { name: string; sum: number; count: number; sections: Record<string, { sum: number; count: number }> }> = {};

        validResults.forEach(r => {
            const officeName = r.evaluatedOffice || 'Sin Oficina';
            if (!officeMap[officeName]) {
                officeMap[officeName] = { name: officeName, sum: 0, count: 0, sections: {} };
            }
            officeMap[officeName].sum += (Number(r.avgScore) || 0);
            officeMap[officeName].count += 1;

            // Aggregate sections per office
            (r.sectionsSummary || []).forEach(s => {
                if (s.avg !== null) {
                    if (!officeMap[officeName].sections[s.sectionName]) {
                        officeMap[officeName].sections[s.sectionName] = { sum: 0, count: 0 };
                    }
                    officeMap[officeName].sections[s.sectionName].sum += s.avg;
                    officeMap[officeName].sections[s.sectionName].count += 1;
                }
            });
        });

        const offices = Object.values(officeMap).map(o => {
            const avg = o.sum / o.count;
            // Calculate section averages for this office
            const sectionAvgs = Object.entries(o.sections).map(([name, data]) => ({
                name,
                avg: data.sum / data.count
            }));

            // Identify standouts
            const standouts = sectionAvgs
                .filter(s => s.avg >= 4.5)
                .map(s => s.name);

            // Fallback standout
            if (standouts.length === 0 && sectionAvgs.length > 0) {
                const top = [...sectionAvgs].sort((a, b) => b.avg - a.avg)[0];
                standouts.push(top.name);
            }

            return {
                name: o.name,
                avg,
                standouts,
                sectionAvgs
            };
        }).sort((a, b) => b.avg - a.avg);

        // 4. Competencies by Group (Campus Average vs Offices)
        const competenciesAnalysis = campusSections.map(s => {
            const campusAvg = s.avg || 0;
            const metAverage = offices.filter(o => {
                const sec = o.sectionAvgs.find(sa => sa.name === s.sectionName);
                return sec && sec.avg >= campusAvg;
            });

            return {
                sectionName: s.sectionName,
                campusAvg,
                metAverageCount: metAverage.length,
                totalOffices: offices.length,
                metAverageOffices: metAverage
            };
        });

        return {
            globalScore,
            campusSections,
            offices,
            competenciesAnalysis
        };
    }, [results, organizationAverage, selectedTemplate]);

    // Effect to load/generate AI report
    useEffect(() => {
        const fetchAiReport = async () => {
            if (!analysis || !campusName) return;
            
            // Avoid re-fetching if we already have it for this campus
            if (aiReport && aiReport._campus === campusName) return;

            setLoadingAi(true);
            try {
                // 1. Check DB
                const { data: existing } = await supabase
                    .from('campus_ai_reports')
                    .select('report')
                    .eq('campus_name', campusName)
                    .maybeSingle();

                if (existing) {
                    setAiReport({ ...existing.report, _campus: campusName });
                } else {
                    // 2. Generate
                    const sortedSections = [...analysis.campusSections].sort((a, b) => (b.avg || 0) - (a.avg || 0));
                    const strongest = sortedSections[0] || { sectionName: 'N/A', avg: 0 };
                    const weakest = sortedSections[sortedSections.length - 1] || { sectionName: 'N/A', avg: 0 };

                    const report = await PrismaBrain.generateCampusReport(campusName, {
                        globalScore: analysis.globalScore,
                        organizationAverage: organizationAverage,
                        strongestSection: { name: strongest.sectionName, score: strongest.avg || 0 },
                        weakestSection: { name: weakest.sectionName, score: weakest.avg || 0 },
                        officesCount: analysis.offices.length,
                        peopleCount: 0
                    });

                    if (report) {
                        setAiReport({ ...report, _campus: campusName });
                        // 3. Save
                        await supabase.from('campus_ai_reports').upsert({
                            campus_name: campusName,
                            report: report,
                            updated_at: new Date().toISOString()
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching AI report", err);
            } finally {
                setLoadingAi(false);
            }
        };

        fetchAiReport();
    }, [campusName, analysis]);

    if (!analysis) {
        return (
            <div className="p-8 text-center text-slate-500">
                No hay suficientes datos para generar el análisis de campus.
            </div>
        );
    }

    const { globalScore, campusSections, offices, competenciesAnalysis } = analysis;

    // Validations to prevent undefined errors
    if (!globalScore || globalScore === undefined) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">Error: No se pudo calcular el análisis del campus. Verifica que haya datos disponibles.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Template Filter */}
            <div className="flex justify-end mb-4">
                <div className="relative inline-block text-left">
                    <div className="flex items-center gap-2">
                        <Filter className="w-5 h-5 text-slate-500" />
                        <select
                            value={selectedTemplate}
                            onChange={(e) => setSelectedTemplate(e.target.value)}
                            className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                        >
                            <option value="all">Todos los Formularios</option>
                            {uniqueTemplates.map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Global Score Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
                    <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                            <circle
                                cx="48" cy="48" r="40"
                                stroke="#6366f1"
                                strokeWidth="8"
                                fill="none"
                                strokeDasharray={251}
                                strokeDashoffset={251 - (251 * globalScore) / 5}
                                className="transition-all duration-1000 ease-out"
                            />
                        </svg>
                        <span className="absolute text-2xl font-bold text-slate-800">{globalScore.toFixed(1)}</span>
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wide">Puntaje Global</h3>
                        <p className="text-slate-400 text-xs mt-1">Promedio de {results.length} evaluaciones</p>
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-bold">
                            <Building2 className="w-3 h-3" /> {campusName}
                        </div>
                    </div>
                </div>

                {/* Offices Count Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                        <Building2 className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wide">Oficinas Evaluadas</h3>
                        <span className="block text-3xl font-bold text-slate-800">{offices.length}</span>
                        <p className="text-slate-400 text-xs mt-1">Total de dependencias</p>
                    </div>
                </div>

                {/* People Count Card (Estimate) */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-6">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <TrendingUp className="w-8 h-8" />
                    </div>
                    <div>
                        <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wide">Evaluaciones</h3>
                        <span className="block text-3xl font-bold text-slate-800">{results.length}</span>
                        <p className="text-slate-400 text-xs mt-1">Registros procesados</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Campus Competency Map */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">Mapa de Competencias del Campus</h3>
                        <div className="text-xs text-slate-400">Promedio General</div>
                    </div>
                    <div className="flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 border-dashed p-4">
                        <ComparisonRadarChart data={campusSections} campusName={campusName} globalScore={organizationAverage} />
                    </div>
                </div>

                {/* Competencies by Group (Offices) */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 overflow-y-auto max-h-[500px]">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Desempeño por Oficinas</h3>
                    <div className="space-y-6">
                        {competenciesAnalysis.map((comp) => (
                            <div key={comp.sectionName}>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="font-semibold text-slate-700 text-sm">{comp.sectionName}</span>
                                    <span className="text-xs font-bold text-indigo-600">{comp.campusAvg.toFixed(1)} / 5.0</span>
                                </div>

                                {/* Progress Bar */}
                                <div className="relative h-2 bg-slate-100 rounded-full mb-3">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-indigo-500 rounded-full"
                                        style={{ width: `${(comp.campusAvg / 5) * 100}%` }}
                                    ></div>
                                </div>

                                {/* Offices meeting average */}
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2 overflow-hidden">
                                        {comp.metAverageOffices.slice(0, 5).map((o, i) => (
                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600" title={o.name}>
                                                {o.name.charAt(0)}
                                            </div>
                                        ))}
                                        {comp.metAverageOffices.length > 5 && (
                                            <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                +{comp.metAverageOffices.length - 5}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-500">
                                        <strong className="text-slate-700">{comp.metAverageCount}</strong> oficinas cumplieron el promedio
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Offices List Sorted by Score */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-lg">Ranking de Oficinas</h3>
                    <p className="text-slate-500 text-sm">Oficinas organizadas por puntaje global</p>
                </div>
                <div className="divide-y divide-slate-100">
                    {offices.map((office, idx) => (
                        <div key={office.name} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4 flex-1">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${idx < 3 ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30' : 'bg-slate-300'}`}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{office.name}</h4>
                                    <p className="text-xs text-slate-500">Líderes y equipo de trabajo</p>

                                    {/* Standout Categories */}
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {office.standouts.map((s, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100">
                                                <Award className="w-3 h-3" /> {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                <div className="text-right">
                                    <span className="block text-xs text-slate-400 uppercase tracking-wider">Promedio</span>
                                    <span className={`text-xl font-bold ${(Number(office.avg) || 0) >= 4 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                        {Number(office.avg || 0).toFixed(1)}
                                    </span>
                                </div>
                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${(Number(office.avg) || 0) >= 4.5 ? 'bg-emerald-500' : (Number(office.avg) || 0) >= 3.5 ? 'bg-blue-500' : 'bg-orange-500'}`}
                                        style={{ width: `${((Number(office.avg) || 0) / 5) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* AI GENERATED REPORT SECTION */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 relative overflow-hidden mt-8">
                {/* Header with Logo */}
                <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <BrainCircuit className="w-64 h-64" />
                    </div>
                    <div className="relative z-10 flex items-center gap-6">
                        <div className="bg-white p-2 rounded-xl h-20 w-20 flex items-center justify-center">
                            <img src="/prisma.png" alt="Prisma Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold">Prisma AI: Análisis de Campus</h2>
                            <p className="text-slate-400 text-lg">Evaluación Estratégica Generativa</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-10">
                    {loadingAi ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                            <p className="text-slate-500">Generando análisis estratégico con IA...</p>
                        </div>
                    ) : aiReport ? (
                        <>
                            {/* Executive Summary */}
                            <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                                <h3 className="text-lg font-bold text-indigo-900 mb-2 flex items-center gap-2">
                                    <BrainCircuit className="w-5 h-5" /> Resumen Ejecutivo
                                </h3>
                                <p className="text-indigo-800 leading-relaxed">{aiReport.executiveSummary}</p>
                            </div>

                            {/* Strategic Diagnosis */}
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-4">Diagnóstico Estratégico</h3>
                                <p className="text-slate-600 leading-relaxed">{aiReport.strategicDiagnosis}</p>
                            </div>

                            {/* Strengths & Weaknesses */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
                                    <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5" /> Fortalezas Clave
                                    </h3>
                                    <ul className="space-y-2">
                                        {aiReport.strengths?.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-emerald-700 text-sm">
                                                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-orange-50 rounded-xl p-6 border border-orange-100">
                                    <h3 className="font-bold text-orange-800 mb-4 flex items-center gap-2">
                                        <AlertTriangle className="w-5 h-5" /> Oportunidades de Mejora
                                    </h3>
                                    <ul className="space-y-2">
                                        {aiReport.weaknesses?.map((w: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-orange-700 text-sm">
                                                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                                                {w}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <Target className="w-6 h-6 text-indigo-600" />
                                    Recomendaciones Estratégicas
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {aiReport.recommendations?.map((rec: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                            <h4 className="font-bold text-slate-800 mb-2">{rec.title}</h4>
                                            <p className="text-sm text-slate-600 mb-3">{rec.description}</p>
                                            <div className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block">
                                                Impacto: {rec.impact}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Action Plan */}
                            <div>
                                <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <BarChart3 className="w-6 h-6 text-slate-600" />
                                    Plan de Acción Sugerido
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                                        <h4 className="font-bold text-sm text-slate-500 uppercase tracking-wider mb-3">Corto Plazo</h4>
                                        <ul className="space-y-2">
                                            {aiReport.actionPlan?.shortTerm?.map((a: string, i: number) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                    <ArrowRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                                        <h4 className="font-bold text-sm text-slate-500 uppercase tracking-wider mb-3">Mediano Plazo</h4>
                                        <ul className="space-y-2">
                                            {aiReport.actionPlan?.mediumTerm?.map((a: string, i: number) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                    <ArrowRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                                        <h4 className="font-bold text-sm text-slate-500 uppercase tracking-wider mb-3">Largo Plazo</h4>
                                        <ul className="space-y-2">
                                            {aiReport.actionPlan?.longTerm?.map((a: string, i: number) => (
                                                <li key={i} className="text-sm text-slate-600 flex items-start gap-2">
                                                    <ArrowRight className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                                                    {a}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-slate-500">
                            No se pudo generar el reporte de IA.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

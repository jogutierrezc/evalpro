import { useMemo, useState, useEffect } from 'react';
import { ResultWithDetails } from './ResultsModule';
import { PrismaBrain } from '../lib/prisma-engine';
import { supabase } from '../lib/supabase';
import { PrismaLoader } from '../components/PrismaLoader';
import {
    Award,
    BrainCircuit,
    Building2,
    Target,
    CheckCircle2,
    BarChart3,
    AlertTriangle,
    Filter,
    Sparkles,
    FileText,
    Lightbulb
} from 'lucide-react';

interface Props {
    results: ResultWithDetails[];
}

interface RadarDataPoint {
    sectionName: string;
    UniversityAvg: number;
    [key: string]: string | number;
}

// --- MULTI-SERIES RADAR CHART ---
const MultiRadarChart = ({ data, campuses, colors }: { data: RadarDataPoint[], campuses: string[], colors: string[] }) => {
    const size = 400;
    const center = size / 2;
    const radius = (size / 2) - 60;
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
                    const labelRadius = radius + 25;
                    const x = center + labelRadius * Math.cos(angle);
                    const y = center + labelRadius * Math.sin(angle);
                    let anchor = "middle";
                    if (x > center + 20) anchor = "start";
                    if (x < center - 20) anchor = "end";

                    return (
                        <text
                            key={`label-${i}`}
                            x={x}
                            y={y}
                            className="text-[10px] sm:text-xs fill-slate-600 font-semibold uppercase tracking-tight"
                            textAnchor={anchor}
                            dominantBaseline="middle"
                        >
                            {d.sectionName.length > 15 ? d.sectionName.substring(0, 15) + '...' : d.sectionName}
                        </text>
                    );
                })}

                {/* Data Polygons */}
                {campuses.map((campus, idx) => {
                    const points = data.map((d, i) => {
                        const val = (d[campus] as number) || 0;
                        const coords = getCoordinates(val, i);
                        return `${coords.x},${coords.y} `;
                    }).join(" ");
                    const color = colors[idx % colors.length];

                    return (
                        <g key={campus}>
                            <polygon
                                points={points}
                                fill={color}
                                fillOpacity="0.1"
                                stroke={color}
                                strokeWidth="2"
                                className="hover:stroke-[3px] transition-all duration-300"
                            />
                            {/* Points */}
                            {data.map((d, i) => {
                                const val = (d[campus] as number) || 0;
                                const coords = getCoordinates(val, i);
                                return (
                                    <circle
                                        key={`point-${campus}-${i}`}
                                        cx={coords.x}
                                        cy={coords.y}
                                        r="3"
                                        fill={color}
                                        stroke="white"
                                        strokeWidth="1"
                                    >
                                        <title>{campus} - {d.sectionName}: {val.toFixed(2)}</title>
                                    </circle>
                                );
                            })}
                        </g>
                    );
                })}
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap justify-center gap-4 mt-4">
                {campuses.map((campus, idx) => (
                    <div key={campus} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                        {campus}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function UniversityAnalysis({ results }: Props) {
    const [selectedTemplate, setSelectedTemplate] = useState<string>('all');
    const [aiReport, setAiReport] = useState<any>(null);
    const [loadingAi, setLoadingAi] = useState(false);

    // Check for existing report on mount
    useEffect(() => {
        const checkExistingReport = async () => {
            const { data } = await supabase
                .from('university_ai_reports')
                .select('report')
                .eq('report_type', 'general_advanced')
                .maybeSingle();
            
            if (data) {
                setAiReport(data.report);
            }
        };
        checkExistingReport();
    }, []);

    // Load saved AI report
    useEffect(() => {
        const loadSavedReport = async () => {
            try {
                const { data, error } = await supabase
                    .from('university_ai_reports')
                    .select('report')
                    .eq('report_type', 'general_advanced')
                    .maybeSingle();

                if (data?.report) {
                    setAiReport(data.report);
                }
            } catch (err) {
                console.error("Error loading saved university report", err);
            }
        };

        loadSavedReport();
    }, []);

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
        let validResults = results.filter(r => r.avgScore !== null && r.avgScore !== undefined);

        if (selectedTemplate !== 'all') {
            validResults = validResults.filter(r => r.templateName === selectedTemplate);
        }

        if (validResults.length === 0) return null;

        // --- 1. Global Metrics ---
        const totalScore = validResults.reduce((sum, r) => sum + (Number(r.avgScore) || 0), 0);
        const globalAverage = totalScore / validResults.length;

        // --- 2. Group by Campus ---
        const campusMap: Record<string, {
            name: string;
            sum: number;
            count: number;
            sections: Record<string, { sum: number; count: number }>;
            offices: Record<string, { sum: number; count: number }>;
        }> = {};

        // Also track all sections to build the radar axes
        const allSectionNames = new Set<string>();

        validResults.forEach(r => {
            const campusName = r.evaluatedCampus || 'Bucaramanga';
            const officeName = r.evaluatedOffice || 'Sin Oficina';

            if (!campusMap[campusName]) {
                campusMap[campusName] = { name: campusName, sum: 0, count: 0, sections: {}, offices: {} };
            }

            const score = Number(r.avgScore) || 0;
            campusMap[campusName].sum += score;
            campusMap[campusName].count += 1;

            // Track office within campus
            if (!campusMap[campusName].offices[officeName]) {
                campusMap[campusName].offices[officeName] = { sum: 0, count: 0 };
            }
            campusMap[campusName].offices[officeName].sum += score;
            campusMap[campusName].offices[officeName].count += 1;

            // Track sections
            (r.sectionsSummary || []).forEach(s => {
                if (s.avg !== null) {
                    allSectionNames.add(s.sectionName);
                    if (!campusMap[campusName].sections[s.sectionName]) {
                        campusMap[campusName].sections[s.sectionName] = { sum: 0, count: 0 };
                    }
                    campusMap[campusName].sections[s.sectionName].sum += s.avg;
                    campusMap[campusName].sections[s.sectionName].count += 1;
                }
            });
        });

        // Process Campus Data
        const campuses = Object.values(campusMap).map(c => {
            const avg = c.sum / c.count;
            const sectionAvgs: Record<string, number> = {};
            Object.entries(c.sections).forEach(([name, data]) => {
                sectionAvgs[name] = data.sum / data.count;
            });

            // Calculate office averages for this campus
            const officeAvgs = Object.entries(c.offices).map(([name, data]) => ({
                name,
                avg: data.sum / data.count
            }));

            return {
                name: c.name,
                avg,
                sectionAvgs,
                officeAvgs
            };
        }).sort((a, b) => b.avg - a.avg);

        // --- 3. Radar Data Preparation ---
        const radarData: RadarDataPoint[] = Array.from(allSectionNames).map(sectionName => {
            const row: RadarDataPoint = { sectionName, UniversityAvg: 0 };
            campuses.forEach(c => {
                row[c.name] = c.sectionAvgs[sectionName] || 0;
            });
            // Also calculate University Average for this section
            const totalSecSum = validResults.reduce((sum, r) => {
                const s = r.sectionsSummary?.find(sec => sec.sectionName === sectionName);
                return sum + (s?.avg || 0);
            }, 0);
            const totalSecCount = validResults.filter(r => r.sectionsSummary?.some(sec => sec.sectionName === sectionName)).length;
            row['UniversityAvg'] = totalSecCount > 0 ? totalSecSum / totalSecCount : 0;

            return row;
        });

        // --- 4. Top Offices Ranking (University Wide) ---
        const allOffices: { name: string, campus: string, avg: number }[] = [];
        campuses.forEach(c => {
            c.officeAvgs.forEach(o => {
                allOffices.push({ name: o.name, campus: c.name, avg: o.avg });
            });
        });
        const topOffices = allOffices.sort((a, b) => b.avg - a.avg).slice(0, 10); // Top 10

        // --- 5. Top 10 Workers & Bottom 10 Workers ---
        // Deduplicate by evaluated user ID to avoid showing same person multiple times if they have multiple evaluations (though usually 1 per template)
        // If filtering by template, duplicates shouldn't be an issue unless multiple evals of same type.
        // We will take the average score per person if multiple exist.
        const workerScores: Record<string, { name: string, office: string, campus: string, score: number, count: number, role: string }> = {};

        validResults.forEach(r => {
            if (r.evaluatedId) {
                if (!workerScores[r.evaluatedId]) {
                    workerScores[r.evaluatedId] = {
                        name: r.evaluatedName,
                        office: r.evaluatedOffice || 'Sin Oficina',
                        campus: r.evaluatedCampus || 'Bucaramanga',
                        score: 0,
                        count: 0,
                        role: r.evaluatedRole || ''
                    };
                }
                workerScores[r.evaluatedId].score += (Number(r.avgScore) || 0);
                workerScores[r.evaluatedId].count += 1;
            }
        });

        const workersList = Object.values(workerScores).map(w => ({
            ...w,
            avg: w.score / w.count
        }));

        const top10Workers = [...workersList].sort((a, b) => b.avg - a.avg).slice(0, 10);

        // Bottom 10 (or below average)
        // User asked for "10 que no alcanzan la media nacional o estan por debajo de ella"
        const belowAverageWorkers = workersList.filter(w => w.avg < globalAverage);
        const bottom10Workers = [...belowAverageWorkers].sort((a, b) => a.avg - b.avg).slice(0, 10);

        // --- 6. Intelligent Analysis Logic (Legacy - Kept for Header only) ---

        // Level 1: Macro Diagnosis
        // Calculate Standard Deviation of Campus Averages to detect disparity
        const variance = campuses.reduce((sum, c) => sum + Math.pow(c.avg - globalAverage, 2), 0) / campuses.length;
        const stdDev = Math.sqrt(variance);

        let level1Title = "";
        let level1Text = "";
        let level1Color = "";

        if (stdDev > 0.4) { // High disparity threshold
            level1Title = "Fractura Interna: Disparidad Organizacional";
            level1Text = `Se detecta una asimetría crítica en la Universidad (Desviación: ${stdDev.toFixed(2)}). Mientras algunos campus como ${campuses[0].name} operan con excelencia (${campuses[0].avg.toFixed(1)}), existen rezagos significativos en otros como ${campuses[campuses.length - 1].name} (${campuses[campuses.length - 1].avg.toFixed(1)}). Esto sugiere que la cultura no está permeando de manera uniforme.`;
            level1Color = "from-red-900 to-orange-900";
        } else if (globalAverage > 4.6) {
            level1Title = "Excelencia Sostenida: Cultura de Alto Desempeño";
            level1Text = "La Universidad atraviesa un momento de madurez organizacional excepcional. Los indicadores muestran una sinergia efectiva entre la misión institucional y la ejecución operativa. El reto actual no es corregir, sino innovar y retener el talento clave.";
            level1Color = "from-emerald-900 to-teal-900";
        } else if (globalAverage >= 4.0) {
            level1Title = "Estabilidad Funcional: Solidez Operativa";
            level1Text = "La institución muestra una salud organizacional robusta. Si bien los procesos fluyen adecuadamente y el clima es positivo, existe una zona de confort que podría frenar la innovación. Es el momento ideal para elevar la vara en los estándares de calidad.";
            level1Color = "from-blue-900 to-indigo-900";
        } else {
            level1Title = "Alerta Sistémica: Urgencia de Intervención";
            level1Text = "Los resultados globales indican una desconexión entre la estrategia rectoral y la operación diaria. Se requiere una revisión estructural de los procesos y un plan de choque para recuperar la confianza y el compromiso de los colaboradores.";
            level1Color = "from-red-950 to-red-900";
        }

        return {
            globalAverage,
            campuses,
            radarData,
            topOffices,
            intelligentAnalysis: {
                level1: { title: level1Title, text: level1Text, color: level1Color }
            },
            top10Workers,
            bottom10Workers,
            // Data for AI
            topStrengths: [...radarData].sort((a, b) => b.UniversityAvg - a.UniversityAvg).slice(0, 3),
            criticalAreas: [...radarData].sort((a, b) => a.UniversityAvg - b.UniversityAvg).slice(0, 3)
        };
    }, [results, selectedTemplate]);

    const handleGenerateAdvancedReport = async () => {
        if (!analysis || loadingAi) return;
        setLoadingAi(true);
        try {
            // 1. Check DB again just in case
            const { data: existing } = await supabase
                .from('university_ai_reports')
                .select('report')
                .eq('report_type', 'general_advanced')
                .maybeSingle();

            if (existing) {
                setAiReport(existing.report);
            } else {
                // 2. Generate
                const report = await PrismaBrain.generateUniversityReport({
                    globalAverage: analysis.globalAverage,
                    campuses: analysis.campuses.map(c => ({ name: c.name, avg: c.avg })),
                    topOffices: analysis.topOffices.map(o => ({ name: o.name, avg: o.avg })),
                    lowPerformingOffices: analysis.campuses.flatMap(c => c.officeAvgs.map(o => ({ ...o, campus: c.name }))).sort((a, b) => a.avg - b.avg).slice(0, 5),
                    topStrengths: analysis.topStrengths.map(s => ({ name: s.sectionName, avg: s.UniversityAvg })),
                    criticalAreas: analysis.criticalAreas.map(s => ({ name: s.sectionName, avg: s.UniversityAvg }))
                });

                if (report) {
                    setAiReport(report);
                    // 3. Save
                    await supabase.from('university_ai_reports').upsert({
                        report_type: 'general_advanced',
                        report: report,
                        updated_at: new Date().toISOString()
                    });
                }
            }
        } catch (error) {
            console.error("Error generating university report", error);
        } finally {
            setLoadingAi(false);
        }
    };

    if (!analysis) return <div className="p-8 text-center text-slate-500">Cargando análisis universitario...</div>;

    const { globalAverage, campuses, radarData, topOffices, intelligentAnalysis, top10Workers, bottom10Workers } = analysis;
    const campusColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

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

            {/* Header / Level 1 Diagnosis */}
            <div className={`rounded-3xl p-8 text-white bg-gradient-to-br ${intelligentAnalysis.level1.color} shadow-xl relative overflow-hidden`}>
                <div className="absolute top-0 right-0 p-12 opacity-10">
                    <BrainCircuit className="w-64 h-64" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                            <BrainCircuit className="w-6 h-6 text-white" />
                        </div>
                        <span className="text-sm font-bold uppercase tracking-wider text-white/80">Panorama Global Universitario</span>
                    </div>
                    <h2 className="text-3xl font-bold mb-4">{intelligentAnalysis.level1.title}</h2>
                    <p className="text-lg text-white/90 leading-relaxed max-w-4xl">
                        {intelligentAnalysis.level1.text}
                    </p>

                    <div className="mt-8 flex items-center gap-6">
                        <div className="bg-white/10 rounded-xl p-4 border border-white/10 backdrop-blur-sm">
                            <span className="block text-xs text-white/60 mb-1">Promedio Global Ponderado</span>
                            <span className="text-3xl font-bold">{globalAverage.toFixed(2)}</span>
                        </div>
                        <div className="h-12 w-px bg-white/20"></div>
                        <div>
                            <span className="block text-xs text-white/60 mb-1">Campus Evaluados</span>
                            <span className="text-xl font-bold">{campuses.length}</span>
                        </div>
                        <div>
                            <span className="block text-xs text-white/60 mb-1">Oficinas Totales</span>
                            <span className="text-xl font-bold">{topOffices.length} +</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Radar Chart */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">Mapa de Competencias por Campus</h3>
                    </div>
                    <div className="flex justify-center">
                        <MultiRadarChart
                            data={radarData}
                            campuses={campuses.map(c => c.name)}
                            colors={campusColors}
                        />
                    </div>
                </div>

                {/* Performance by Campus List */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 overflow-y-auto max-h-[600px]">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Desempeño por Campus</h3>
                    <div className="space-y-6">
                        {campuses.map((campus, idx) => {
                            const delta = campus.avg - globalAverage;
                            const color = campusColors[idx % campusColors.length];

                            return (
                                <div key={campus.name} className="group">
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></span>
                                            <span className="font-bold text-slate-700">{campus.name}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl font-bold text-slate-800">{campus.avg.toFixed(2)}</span>
                                            <span className="text-xs text-slate-400 ml-2">/ 5.0</span>
                                        </div>
                                    </div>

                                    {/* Bar Chart Comparison */}
                                    <div className="relative h-8 bg-slate-50 rounded-lg overflow-hidden flex items-center mb-2">
                                        {/* Global Avg Marker Line */}
                                        <div
                                            className="absolute top-0 bottom-0 w-0.5 bg-slate-300 z-10"
                                            style={{ left: `${(globalAverage / 5) * 100}%` }}
                                            title={`Promedio Global: ${globalAverage.toFixed(2)}`}
                                        ></div>

                                        {/* Campus Bar */}
                                        <div
                                            className="h-full rounded-r-lg transition-all duration-500"
                                            style={{ width: `${(campus.avg / 5) * 100}%`, backgroundColor: color, opacity: 0.8 }}
                                        ></div>
                                    </div>

                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-500">{campus.officeAvgs.length} oficinas evaluadas</span>
                                        <span className={`font-medium ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {delta >= 0 ? '+' : ''}{delta.toFixed(2)} vs Global
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Top Offices Ranking */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-2 mb-6">
                    <Award className="w-6 h-6 text-yellow-500" />
                    <h3 className="font-bold text-slate-800 text-lg">Ranking de Oficinas Destacadas (Top 10)</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {topOffices.map((office, idx) => (
                        <div key={`${office.name}-${idx}`} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${idx < 3 ? 'bg-yellow-500' : 'bg-slate-400'}`}>
                                {idx + 1}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-slate-800 text-sm">{office.name}</h4>
                                <p className="text-xs text-slate-500 flex items-center gap-1">
                                    <Building2 className="w-3 h-3" /> {office.campus}
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="block text-lg font-bold text-blue-600">{office.avg.toFixed(1)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top 10 Workers */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center gap-2 mb-6">
                    <Award className="w-6 h-6 text-emerald-500" />
                    <h3 className="font-bold text-slate-800 text-lg">Top 10 Colaboradores Destacados</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ranking</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colaborador</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oficina / Campus</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Puntaje</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {top10Workers.map((worker, idx) => (
                                <tr key={idx}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${idx < 3 ? 'bg-emerald-500' : 'bg-slate-400'}`}>
                                            {idx + 1}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{worker.name}</div>
                                        <div className="text-xs text-gray-500">{worker.role}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{worker.office}</div>
                                        <div className="text-xs text-gray-500">{worker.campus}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-sm font-bold text-emerald-600">{worker.avg.toFixed(2)}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Bottom 10 Workers (Below Average) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 border-l-4 border-l-red-500">
                <div className="flex items-center gap-2 mb-6">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                    <h3 className="font-bold text-slate-800 text-lg">Colaboradores por debajo de la Media Nacional (Top 10 Crítico)</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-red-50">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Colaborador</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oficina / Campus</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Puntaje</th>
                                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Desviación</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {bottom10Workers.map((worker, idx) => (
                                <tr key={idx}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{worker.name}</div>
                                        <div className="text-xs text-gray-500">{worker.role}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-900">{worker.office}</div>
                                        <div className="text-xs text-gray-500">{worker.campus}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-sm font-bold text-red-600">{worker.avg.toFixed(2)}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                        <span className="text-xs font-medium text-red-500">
                                            {(worker.avg - globalAverage).toFixed(2)}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* PRISMA AI ADVANCED REPORT SECTION */}
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
                            <h2 className="text-3xl font-bold">Prisma AI: Reporte General Avanzado</h2>
                            <p className="text-slate-400 text-lg">Inteligencia Generativa con Gemini 1.5 Flash</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-10">
                    {loadingAi ? (
                        <div className="bg-white rounded-2xl p-12 shadow-xl border border-slate-100">
                            <PrismaLoader />
                        </div>
                    ) : !aiReport ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="bg-indigo-50 p-6 rounded-full mb-6">
                                <Sparkles className="w-12 h-12 text-indigo-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-slate-800 mb-2">Generar Análisis Estratégico Completo</h3>
                            <p className="text-slate-500 max-w-lg mb-8">
                                Este sistema está potenciado con el Motor PRISMA AI 1.0 y la Inteligencia de Gemini para la construcción de Reportes Inteligentes. Obtén un diagnóstico estructurado, reflectivo y un plan de acción concreto.
                            </p>
                            <button
                                onClick={handleGenerateAdvancedReport}
                                disabled={loadingAi}
                                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-bold shadow-xl shadow-indigo-200 transition-all transform hover:scale-105 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {loadingAi ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                        Analizando Datos Institucionales...
                                    </>
                                ) : (
                                    <>
                                        <BrainCircuit className="w-6 h-6" />
                                        Generar Reporte Avanzado
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 space-y-10">
                            
                            {/* Executive Summary */}
                            <div className="bg-indigo-50 rounded-2xl p-8 border border-indigo-100 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <FileText className="w-48 h-48 text-indigo-900" />
                                </div>
                                <h3 className="text-xl font-bold text-indigo-900 mb-4 flex items-center gap-2 relative z-10">
                                    <BrainCircuit className="w-6 h-6" /> Resumen Ejecutivo
                                </h3>
                                <p className="text-indigo-800 text-lg leading-relaxed relative z-10">
                                    {aiReport.executiveSummary}
                                </p>
                            </div>

                            {/* Strategic Diagnosis */}
                            <div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-4">Diagnóstico Estratégico</h3>
                                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                                    <p className="text-slate-600 leading-relaxed text-lg">{aiReport.strategicDiagnosis}</p>
                                </div>
                            </div>

                            {/* Strengths & Weaknesses */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-emerald-50 rounded-2xl p-8 border border-emerald-100">
                                    <h3 className="font-bold text-emerald-800 mb-6 flex items-center gap-2 text-xl">
                                        <CheckCircle2 className="w-6 h-6" /> Fortalezas Institucionales
                                    </h3>
                                    <ul className="space-y-4">
                                        {aiReport.strengths?.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-emerald-700">
                                                <div className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="font-medium">{s}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-orange-50 rounded-2xl p-8 border border-orange-100">
                                    <h3 className="font-bold text-orange-800 mb-6 flex items-center gap-2 text-xl">
                                        <AlertTriangle className="w-6 h-6" /> Áreas Críticas
                                    </h3>
                                    <ul className="space-y-4">
                                        {aiReport.weaknesses?.map((w: string, i: number) => (
                                            <li key={i} className="flex items-start gap-3 text-orange-700">
                                                <div className="mt-1.5 w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                                                <span className="font-medium">{w}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Recommendations */}
                            <div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                                    <Lightbulb className="w-7 h-7 text-yellow-500" />
                                    Recomendaciones Estratégicas
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {aiReport.recommendations?.map((rec: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-md transition-all hover:-translate-y-1">
                                            <div className="h-1 w-12 bg-indigo-500 rounded-full mb-4"></div>
                                            <h4 className="font-bold text-slate-800 mb-3 text-lg">{rec.title}</h4>
                                            <p className="text-slate-600 mb-4 leading-relaxed">{rec.description}</p>
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wide">
                                                <Target className="w-3 h-3" /> Impacto: {rec.impact}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Low Performance Action Plan */}
                            {aiReport.lowPerformanceActionPlan && (
                                <div className="bg-red-50 rounded-2xl p-8 border border-red-100">
                                    <h3 className="font-bold text-red-900 mb-4 flex items-center gap-2 text-xl">
                                        <AlertTriangle className="w-6 h-6" /> Plan de Choque: Oficinas con Bajo Desempeño
                                    </h3>
                                    <div className="mb-6 bg-white/50 p-4 rounded-xl border border-red-100">
                                        <h4 className="font-bold text-red-800 text-sm uppercase tracking-wider mb-2">Diagnóstico de Causa Raíz (Hipótesis)</h4>
                                        <p className="text-red-700">{aiReport.lowPerformanceActionPlan.diagnosis}</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {aiReport.lowPerformanceActionPlan.actions?.map((action: string, i: number) => (
                                            <div key={i} className="bg-white p-4 rounded-xl border border-red-100 shadow-sm flex items-start gap-3">
                                                <div className="bg-red-100 text-red-600 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">{i + 1}</div>
                                                <p className="text-red-800 text-sm font-medium">{action}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Action Plan Timeline */}
                            <div>
                                <h3 className="text-2xl font-bold text-slate-800 mb-8 flex items-center gap-2">
                                    <BarChart3 className="w-7 h-7 text-slate-700" />
                                    Hoja de Ruta (Timeline)
                                </h3>
                                <div className="relative border-l-2 border-slate-200 ml-4 space-y-12">
                                    {/* Short Term */}
                                    <div className="relative pl-8">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-emerald-500 ring-4 ring-white"></div>
                                        <h4 className="font-bold text-emerald-600 text-lg mb-4">Corto Plazo (Inmediato)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {aiReport.actionPlan?.shortTerm?.map((a: string, i: number) => (
                                                <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                                                    <span className="text-slate-700 font-medium">{a}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Medium Term */}
                                    <div className="relative pl-8">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-white"></div>
                                        <h4 className="font-bold text-blue-600 text-lg mb-4">Mediano Plazo (3-6 Meses)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {aiReport.actionPlan?.mediumTerm?.map((a: string, i: number) => (
                                                <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                                                    <CheckCircle2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                                    <span className="text-slate-700 font-medium">{a}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Long Term */}
                                    <div className="relative pl-8">
                                        <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-purple-500 ring-4 ring-white"></div>
                                        <h4 className="font-bold text-purple-600 text-lg mb-4">Largo Plazo (+1 Año)</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {aiReport.actionPlan?.longTerm?.map((a: string, i: number) => (
                                                <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-start gap-3">
                                                    <CheckCircle2 className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                                                    <span className="text-slate-700 font-medium">{a}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

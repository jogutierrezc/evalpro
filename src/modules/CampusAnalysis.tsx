import { useMemo } from 'react';
import { ResultWithDetails } from './ResultsModule';
import { RadarChart, SectionSummaryRow } from './SectionAnalysis';
import {
    TrendingUp,
    Award,
    BrainCircuit,
    Building2,
    AlertTriangle
} from 'lucide-react';

interface Props {
    campusName: string;
    results: ResultWithDetails[];
    organizationAverage: number;
}

// Helper to normalize text for matching
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export default function CampusAnalysis({ campusName, results, organizationAverage }: Props) {

    const analysis = useMemo(() => {
        // Filter results that have scores
        const validResults = results.filter(r => r.avgScore !== null && r.avgScore !== undefined);

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
            const officeName = r.office?.name || 'Sin Oficina';
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

        // --- INTELLIGENT ANALYSIS LOGIC ---

        // A. Calculate Weighted Score (Strategic Score)
        // Orientación a resultados: 30%
        // Trabajo en Equipo + Comunicación: 30%
        // Integridad + Institucional: 20%
        // Compromiso: 20%

        let weightedScore = 0;
        let totalWeight = 0;

        const getSectionAvg = (namePart: string) => {
            const match = campusSections.find(s => normalize(s.sectionName).includes(normalize(namePart)));
            return match?.avg || 0;
        };

        const s_resultados = getSectionAvg("resultados"); // Orientación a resultados
        const s_equipo = getSectionAvg("equipo"); // Trabajo en Equipo
        const s_comunicacion = getSectionAvg("comunicacion"); // Comunicación
        const s_integridad = getSectionAvg("integridad"); // Integridad
        const s_institucional = getSectionAvg("institucional"); // Institucional
        const s_compromiso = getSectionAvg("compromiso"); // Compromiso

        // Apply weights
        // 1. Resultados (30%)
        if (s_resultados) { weightedScore += s_resultados * 0.3; totalWeight += 0.3; }

        // 2. Equipo + Comunicación (30%)
        const socialAvgs = [s_equipo, s_comunicacion].filter(v => v > 0);
        if (socialAvgs.length > 0) {
            const socialAvg = socialAvgs.reduce((a, b) => a + b, 0) / socialAvgs.length;
            weightedScore += socialAvg * 0.3;
            totalWeight += 0.3;
        }

        // 3. Integridad + Institucional (20%)
        const cultureAvgs = [s_integridad, s_institucional].filter(v => v > 0);
        if (cultureAvgs.length > 0) {
            const cultureAvg = cultureAvgs.reduce((a, b) => a + b, 0) / cultureAvgs.length;
            weightedScore += cultureAvg * 0.2;
            totalWeight += 0.2;
        }

        // 4. Compromiso (20%)
        if (s_compromiso) { weightedScore += s_compromiso * 0.2; totalWeight += 0.2; }

        // Normalize if weights don't sum to 1 (e.g. missing sections)
        const finalStrategicScore = totalWeight > 0 ? weightedScore / totalWeight : globalScore;

        // B. Generate Text
        // Header
        let headerText = "";
        let headerColor = "";
        if (finalStrategicScore > 4.6) {
            headerText = "Este campus se consolida como un referente de excelencia dentro de la organización, superando los estándares esperados en la mayoría de las competencias clave.";
            headerColor = "text-emerald-700 bg-emerald-50 border-emerald-100";
        } else if (finalStrategicScore >= 4.0) {
            headerText = "El campus mantiene un desempeño sólido y consistente, alineándose correctamente con los objetivos estratégicos y la cultura organizacional.";
            headerColor = "text-blue-700 bg-blue-50 border-blue-100";
        } else if (finalStrategicScore >= 3.0) {
            headerText = "El campus muestra un desempeño funcional, aunque se detectan brechas específicas que requieren planes de acción focalizados para alcanzar su máximo potencial.";
            headerColor = "text-orange-700 bg-orange-50 border-orange-100";
        } else {
            headerText = "Se identifican desafíos críticos en el desempeño global del campus que requieren intervención inmediata y reestructuración de objetivos.";
            headerColor = "text-red-700 bg-red-50 border-red-100";
        }

        // Comparative Analysis (Benchmarking)
        const delta = finalStrategicScore - organizationAverage;
        let comparativeText = "";

        // Find strongest and weakest sections for text gen
        const sortedSections = [...campusSections].sort((a, b) => (b.avg || 0) - (a.avg || 0));
        const strongest = sortedSections[0];
        const weakest = sortedSections[sortedSections.length - 1];

        if (delta > 0.3) {
            const percentAbove = ((delta / organizationAverage) * 100).toFixed(0);
            comparativeText = `Al compararse con el promedio global de la empresa, este campus destaca notablemente, situándose un ${percentAbove}% por encima de la media. Su fortaleza principal radica en ${strongest?.sectionName}, lo que sugiere prácticas internas exitosas que podrían replicarse en otras sedes.`;
        } else if (delta >= -0.2) { // Between -0.2 and +0.3 (covering the +0.2 range roughly)
            comparativeText = `El desempeño de este campus se encuentra alineado con el promedio organizacional. Si bien cumple con las expectativas generales, existe una oportunidad clara para potenciar el área de ${weakest?.sectionName} y dar el salto hacia la excelencia.`;
        } else {
            comparativeText = `Los resultados sitúan a este campus por debajo del promedio corporativo. Particularmente, el indicador de ${weakest?.sectionName} es el que más impacta negativamente su ponderación global frente a otras sedes.`;
        }

        // Recommendations
        let recommendationText = "";
        const weakestName = normalize(weakest?.sectionName || "");

        if (weakestName.includes("equipo")) {
            recommendationText = "Se recomienda implementar dinámicas de integración y revisar la distribución de cargas laborales. Fomentar la colaboración transversal es prioritario para elevar la moral y la productividad.";
        } else if (weakestName.includes("resultados")) {
            recommendationText = "Es necesario revisar la claridad de los KPIs y objetivos establecidos. Se sugiere un seguimiento más cortoplacista (semanal/quincenal) para asegurar el cumplimiento de metas.";
        } else if (weakestName.includes("institucional") || weakestName.includes("integridad")) {
            recommendationText = "Alerta cultural detectada. Se sugiere una sesión de re-alineación con los valores corporativos y el código de ética de la empresa para asegurar el compromiso a largo plazo.";
        } else {
            recommendationText = `Se recomienda enfocar esfuerzos de capacitación y seguimiento en ${weakest?.sectionName} para cerrar las brechas detectadas.`;
        }

        return {
            globalScore,
            strategicScore: finalStrategicScore,
            campusSections,
            offices,
            competenciesAnalysis,
            intelligentAnalysis: {
                headerText,
                headerColor,
                comparativeText,
                recommendationText,
                delta
            }
        };
    }, [results, organizationAverage]);

    if (!analysis) {
        return (
            <div className="p-8 text-center text-slate-500">
                No hay suficientes datos para generar el análisis de campus.
            </div>
        );
    }

    const { globalScore, strategicScore, campusSections, offices, competenciesAnalysis, intelligentAnalysis } = analysis;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

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

                {/* Strategic Insight Preview */}
                <div className={`rounded-2xl p-6 shadow-sm border md:col-span-2 flex flex-col justify-center relative overflow-hidden ${intelligentAnalysis.headerColor}`}>
                    <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5" />
                        Diagnóstico Estratégico
                    </h3>
                    <p className="text-sm font-medium leading-relaxed">
                        {intelligentAnalysis.headerText}
                    </p>
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
                        <RadarChart data={campusSections} size={350} />
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

            {/* INTELLIGENT ANALYSIS SECTION */}
            <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-12 opacity-5">
                    <BrainCircuit className="w-64 h-64" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-indigo-500/20 p-3 rounded-xl backdrop-blur-sm border border-indigo-500/30">
                            <BrainCircuit className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Análisis Inteligente Final</h2>
                            <p className="text-slate-400 text-sm">Evaluación estratégica basada en taxonomía de calificación</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                        {/* Comparison Card */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                            <h3 className="text-indigo-300 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" /> Benchmarking Organizacional
                            </h3>
                            <p className="text-slate-200 leading-relaxed mb-6">
                                {intelligentAnalysis.comparativeText}
                            </p>

                            <div className="flex items-center gap-4 text-sm">
                                <div className="flex-1 bg-white/10 rounded-lg p-3 text-center">
                                    <span className="block text-slate-400 text-xs mb-1">Promedio Campus</span>
                                    <span className="text-xl font-bold text-white">{strategicScore.toFixed(2)}</span>
                                </div>
                                <div className="flex items-center justify-center text-slate-500">vs</div>
                                <div className="flex-1 bg-white/10 rounded-lg p-3 text-center">
                                    <span className="block text-slate-400 text-xs mb-1">Promedio Global</span>
                                    <span className="text-xl font-bold text-slate-300">{organizationAverage.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Recommendations Card */}
                        <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-sm rounded-2xl p-6 border border-indigo-500/20">
                            <h3 className="text-orange-300 font-bold text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" /> Conclusiones y Recomendaciones
                            </h3>
                            <p className="text-white font-medium leading-relaxed mb-4">
                                {intelligentAnalysis.recommendationText}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="px-3 py-1 rounded-full bg-white/10 text-xs text-indigo-200 border border-white/10">Plan de Acción Sugerido</span>
                                <span className="px-3 py-1 rounded-full bg-white/10 text-xs text-indigo-200 border border-white/10">Seguimiento Mensual</span>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

        </div>
    );
}

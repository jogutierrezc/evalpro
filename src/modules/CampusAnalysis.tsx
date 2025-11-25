import { useMemo } from 'react';
import { SectionSummaryRow } from './SectionAnalysis';
import { ResultWithDetails } from './ResultsModule';
import {
    TrendingUp,
    Award,
    BrainCircuit,
    Building2,
    AlertTriangle,
    CheckCircle2,
    ArrowRight,
    Target,
    Zap,
    Activity,
    BarChart3,
    Link
} from 'lucide-react';

interface RadarDataPoint {
    sectionName: string;
    avg?: number;
    [key: string]: string | number | undefined;
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

                {/* Global Average Polygon (Gray) */}
                <g>
                    <polygon
                        points={data.map((d, i) => {
                            const coords = getCoordinates(globalScore, i);
                            return `${coords.x},${coords.y} `;
                        }).join(" ")}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="2"
                        strokeDasharray="4 4"
                    />
                </g>

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
                    <span className="w-3 h-3 rounded-full border border-slate-400 border-dashed"></span> Promedio Global ({globalScore.toFixed(1)})
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
        let weightedScore = 0;
        let totalWeight = 0;

        const getSectionAvg = (namePart: string) => {
            const match = campusSections.find(s => normalize(s.sectionName).includes(normalize(namePart)));
            return match?.avg || 0;
        };

        const s_resultados = getSectionAvg("resultados");
        const s_equipo = getSectionAvg("equipo");
        const s_comunicacion = getSectionAvg("comunicacion");
        const s_integridad = getSectionAvg("integridad");
        const s_institucional = getSectionAvg("institucional");
        const s_compromiso = getSectionAvg("compromiso");

        // Apply weights
        if (s_resultados) { weightedScore += s_resultados * 0.3; totalWeight += 0.3; }
        const socialAvgs = [s_equipo, s_comunicacion].filter(v => v > 0);
        if (socialAvgs.length > 0) {
            const socialAvg = socialAvgs.reduce((a, b) => a + b, 0) / socialAvgs.length;
            weightedScore += socialAvg * 0.3;
            totalWeight += 0.3;
        }
        const cultureAvgs = [s_integridad, s_institucional].filter(v => v > 0);
        if (cultureAvgs.length > 0) {
            const cultureAvg = cultureAvgs.reduce((a, b) => a + b, 0) / cultureAvgs.length;
            weightedScore += cultureAvg * 0.2;
            totalWeight += 0.2;
        }
        if (s_compromiso) { weightedScore += s_compromiso * 0.2; totalWeight += 0.2; }

        const finalStrategicScore = totalWeight > 0 ? weightedScore / totalWeight : globalScore;

        // B. Generate Text
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

        const sortedSections = [...campusSections].sort((a, b) => (b.avg || 0) - (a.avg || 0));
        const strongest = sortedSections[0];
        const weakest = sortedSections[sortedSections.length - 1];

        if (delta > 0.3) {
            const percentAbove = ((delta / organizationAverage) * 100).toFixed(0);
            comparativeText = `Al compararse con el promedio global de la empresa, este campus destaca notablemente, situándose un ${percentAbove}% por encima de la media. Su fortaleza principal radica en ${strongest?.sectionName}, lo que sugiere prácticas internas exitosas que podrían replicarse en otras sedes.`;
        } else if (delta >= -0.2) {
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

        // --- PRISMA Logic (Campus Level) ---
        const prismaPlan = {
            shortTerm: [] as string[],
            mediumTerm: [] as string[],
            longTerm: [] as string[]
        };

        // Short Term
        if (weakestName.includes("integridad")) {
            prismaPlan.shortTerm.push("Campaña de sensibilización sobre valores éticos en el campus.");
            prismaPlan.shortTerm.push("Revisión de procesos de toma de decisiones locales.");
        } else if (weakestName.includes("resultados")) {
            prismaPlan.shortTerm.push("Establecimiento de metas semanales por oficina.");
            prismaPlan.shortTerm.push("Reuniones de seguimiento de indicadores clave.");
        } else {
            prismaPlan.shortTerm.push(`Diagnóstico rápido de causas raíz en ${weakest?.sectionName}.`);
            prismaPlan.shortTerm.push("Feedback individual a líderes de oficinas con bajo desempeño.");
        }

        // Medium Term
        if (delta < 0) {
            prismaPlan.mediumTerm.push("Programa de mentoría con campus de alto desempeño.");
            prismaPlan.mediumTerm.push("Capacitación intensiva en competencias críticas.");
        } else {
            prismaPlan.mediumTerm.push("Documentación de casos de éxito para compartir con la organización.");
            prismaPlan.mediumTerm.push("Refuerzo de la cultura de excelencia.");
        }

        // Long Term
        prismaPlan.longTerm.push(`Consolidar ${strongest?.sectionName} como sello distintivo del campus.`);
        prismaPlan.longTerm.push("Plan de sucesión para roles clave de liderazgo en el campus.");

        // --- NEW PRISMA FEATURES (Campus) ---
        const weakestScore = weakest?.avg || 0;
        const strongestName = strongest?.sectionName || "Otras áreas";
        const strongestScore = strongest?.avg || 0;

        // I. Acción Enfocada (3 Options)
        const focusedActions = [];
        if (weakestScore >= 4.0) {
            focusedActions.push({
                title: "Certificación de Excelencia",
                desc: `Convertir al campus en un centro de formación en ${weakest?.sectionName} para toda la universidad.`,
                icon: <Award className="w-5 h-5 text-purple-600" />
            });
            focusedActions.push({
                title: "Expansión de Modelo",
                desc: "Documentar y exportar el modelo de gestión de este campus a otras sedes.",
                icon: <Link className="w-5 h-5 text-blue-600" />
            });
            focusedActions.push({
                title: "Innovación Disruptiva",
                desc: "Piloto de nuevas metodologías de trabajo antes de su despliegue nacional.",
                icon: <Activity className="w-5 h-5 text-emerald-600" />
            });
        } else {
            focusedActions.push({
                title: "Plan de Nivelación",
                desc: `Intervención directa en oficinas con bajo desempeño en ${weakest?.sectionName}.`,
                icon: <AlertTriangle className="w-5 h-5 text-red-600" />
            });
            focusedActions.push({
                title: "Estandarización de Procesos",
                desc: "Asegurar que todas las oficinas sigan los mismos protocolos operativos.",
                icon: <Link className="w-5 h-5 text-orange-600" />
            });
            focusedActions.push({
                title: "Refuerzo de Liderazgo",
                desc: "Capacitación específica para directores de oficina en gestión de equipos.",
                icon: <Target className="w-5 h-5 text-yellow-600" />
            });
        }

        // II. Propuesta Estratégica
        const strategicProposals = [
            {
                name: "Opción A: Programa de Integración de Campus",
                kpi: "Mejorar clima laboral en 10%",
                scope: "Todo el personal - Cultural",
                color: "bg-blue-50 border-blue-200 text-blue-800"
            },
            {
                name: "Opción B: Reingeniería de Procesos Académicos",
                kpi: "Reducir quejas administrativas en 20%",
                scope: "Personal Administrativo - Eficiencia",
                color: "bg-purple-50 border-purple-200 text-purple-800"
            },
            {
                name: "Opción C: Desarrollo de Talento Local",
                kpi: "Cubrir 30% de vacantes con promoción interna",
                scope: "Líderes de Oficina - Sucesión",
                color: "bg-emerald-50 border-emerald-200 text-emerald-800"
            }
        ];

        // III. Predictive
        const riskProb = Math.max(5, Math.min(90, (5 - weakestScore) * 12)).toFixed(0);
        const efficiencyLoss = Math.max(0, (4.5 - globalScore) * 10).toFixed(1);
        const roi = (globalScore * 5).toFixed(0);

        const predictiveAnalysis = {
            risk: {
                label: "Riesgo Operativo",
                value: `${riskProb}%`,
                desc: `Probabilidad de fallos en servicios si no se atiende ${weakest?.sectionName}.`,
                color: "text-red-600"
            },
            financial: {
                label: "Impacto Presupuestal",
                value: `${efficiencyLoss}%`,
                desc: "Desviación estimada en costos operativos por ineficiencia.",
                color: "text-orange-600"
            },
            roi: {
                label: "Potencial de Mejora",
                value: `${roi}%`,
                desc: "Incremento esperado en satisfacción estudiantil/cliente.",
                color: "text-emerald-600"
            }
        };

        // IV. Correlation
        const correlationMap = {
            focus: weakest?.sectionName,
            focusScore: weakestScore.toFixed(1),
            impacted: strongestName,
            impactedScore: strongestScore.toFixed(1),
            analysis: `La brecha en ${weakest?.sectionName} (${weakestScore.toFixed(1)}) está frenando el aprovechamiento total de ${strongestName} (${strongestScore.toFixed(1)}). Equilibrar estas competencias creará un campus más resiliente.`
        };

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
            },
            prismaPlan,
            focusedActions,
            strategicProposals,
            predictiveAnalysis,
            correlationMap
        };
    }, [results, organizationAverage]);

    if (!analysis) {
        return (
            <div className="p-8 text-center text-slate-500">
                No hay suficientes datos para generar el análisis de campus.
            </div>
        );
    }

    const { globalScore, strategicScore, campusSections, offices, competenciesAnalysis, intelligentAnalysis, prismaPlan, focusedActions, strategicProposals, predictiveAnalysis, correlationMap } = analysis;

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

            {/* INTELLIGENT ANALYSIS SECTION (OLD - KEPT AS SUMMARY) */}
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

            {/* PRISMA SYSTEM SECTION - ENHANCED */}
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
                            <h2 className="text-3xl font-bold">Sistema PRISMA</h2>
                            <p className="text-slate-400 text-lg">Inteligencia del Talento & Estrategia Organizacional</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-10">

                    {/* 1. Predictive Analysis & Correlation */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Predictive Stats */}
                        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {Object.values(predictiveAnalysis).map((item, idx) => (
                                <div key={idx} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{item.label}</h4>
                                    <div className={`text-2xl font-bold mb-1 ${item.color}`}>{item.value}</div>
                                    <p className="text-xs text-slate-400 leading-tight">{item.desc}</p>
                                </div>
                            ))}
                        </div>

                        {/* Correlation Map */}
                        <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                            <h4 className="text-sm font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                <Link className="w-4 h-4" /> Mapa de Correlación
                            </h4>
                            <p className="text-sm text-indigo-800 leading-relaxed mb-2">
                                {correlationMap.analysis}
                            </p>
                            <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 mt-3">
                                <span className="px-2 py-1 bg-white rounded border border-indigo-200">{correlationMap.focus}</span>
                                <ArrowRight className="w-3 h-3" />
                                <span className="px-2 py-1 bg-white rounded border border-indigo-200">{correlationMap.impacted}</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Focused Actions (Matriz) */}
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Target className="w-6 h-6 text-orange-500" />
                            I. Acción Enfocada (Matriz de Recomendación)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {focusedActions.map((action, idx) => (
                                <div key={idx} className="group bg-white rounded-xl p-6 border border-slate-200 hover:border-orange-300 hover:shadow-lg transition-all cursor-default">
                                    <div className="mb-4 bg-orange-50 w-10 h-10 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                                        {action.icon}
                                    </div>
                                    <h4 className="font-bold text-slate-800 mb-2">{action.title}</h4>
                                    <p className="text-sm text-slate-500 leading-relaxed">{action.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 3. Strategic Proposals (Rectoría) */}
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <Zap className="w-6 h-6 text-indigo-500" />
                            II. Propuesta Estratégica (Rectoría)
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            {strategicProposals.map((prop, idx) => (
                                <div key={idx} className={`rounded-xl p-5 border flex flex-col md:flex-row items-start md:items-center gap-6 ${prop.color}`}>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-lg mb-1">{prop.name}</h4>
                                        <div className="flex flex-wrap gap-3 mt-2">
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/50 text-xs font-semibold border border-black/5">
                                                <Target className="w-3 h-3" /> KPI: {prop.kpi}
                                            </span>
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/50 text-xs font-semibold border border-black/5">
                                                <Activity className="w-3 h-3" /> Alcance: {prop.scope}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0">
                                        <button className="px-4 py-2 bg-white/80 hover:bg-white text-sm font-bold rounded-lg shadow-sm transition-colors border border-black/5">
                                            Seleccionar Estrategia
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 4. Detailed Implementation Plan (Existing PRISMA) */}
                    <div>
                        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                            <BarChart3 className="w-6 h-6 text-emerald-600" />
                            III. Plan de Implementación Detallado
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Short Term */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <div className="flex items-center gap-2 mb-4 text-emerald-600">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <h3 className="font-bold text-sm uppercase tracking-wider">Corto Plazo (1-3 Meses)</h3>
                                </div>
                                <ul className="space-y-3">
                                    {prismaPlan.shortTerm.map((action, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                                            <ArrowRight className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
                                            <span>{action}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Medium Term */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <div className="flex items-center gap-2 mb-4 text-blue-600">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <h3 className="font-bold text-sm uppercase tracking-wider">Mediano Plazo (3-6 Meses)</h3>
                                </div>
                                <ul className="space-y-3">
                                    {prismaPlan.mediumTerm.map((action, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                                            <ArrowRight className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
                                            <span>{action}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* Long Term */}
                            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                                <div className="flex items-center gap-2 mb-4 text-purple-600">
                                    <CheckCircle2 className="w-5 h-5" />
                                    <h3 className="font-bold text-sm uppercase tracking-wider">Largo Plazo (+6 Meses)</h3>
                                </div>
                                <ul className="space-y-3">
                                    {prismaPlan.longTerm.map((action, idx) => (
                                        <li key={idx} className="flex items-start gap-3 text-sm text-slate-600">
                                            <ArrowRight className="w-4 h-4 mt-0.5 text-purple-500 shrink-0" />
                                            <span>{action}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

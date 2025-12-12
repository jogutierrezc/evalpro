import { useMemo, useState } from 'react';
import { ResultWithDetails } from './ResultsModule';
import { PrismaBrain } from '../lib/prisma-engine';
import {
    Award,
    BrainCircuit,
    Building2,
    Target,
    Zap,
    CheckCircle2,
    ArrowRight,
    Activity,
    BarChart3,
    Link,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    Filter,
    Sparkles
} from 'lucide-react';

interface Props {
    results: ResultWithDetails[];
}

interface RadarDataPoint {
    sectionName: string;
    UniversityAvg: number;
    [key: string]: string | number;
}

// Helper to normalize text
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
    const [expandedProposals, setExpandedProposals] = useState<Record<number, boolean>>({});
    const [selectedTemplate, setSelectedTemplate] = useState<string>('all');
    const [aiReport, setAiReport] = useState<string | null>(null);
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    const toggleProposal = (idx: number) => {
        setExpandedProposals(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

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

        // --- 6. Intelligent Analysis Logic ---

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

        // Level 2: Actionable Insight (Weakest Indicator)
        // Find weakest section university-wide
        const sortedSections = [...radarData].sort((a, b) => a.UniversityAvg - b.UniversityAvg);
        const weakestSection = sortedSections[0];
        const strongestSection = sortedSections[sortedSections.length - 1];

        const weakestName = normalize(weakestSection?.sectionName || "");
        const weakestScore = weakestSection?.UniversityAvg || 0;
        const strongestName = strongestSection?.sectionName || "Otras áreas";
        const strongestScore = strongestSection?.UniversityAvg || 0;

        let level2Title = "";
        let level2Text = "";

        if (weakestName.includes("integridad")) {
            level2Title = "Foco en Integridad";
            level2Text = "Diagnóstico: Posible ambigüedad en valores éticos. Acción: Implementar talleres de 'Dilemas Éticos' y revisar la transparencia en la toma de decisiones directivas.";
        } else if (weakestName.includes("compromiso") || weakestName.includes("calidad")) {
            level2Title = "Foco en Compromiso con la Calidad";
            level2Text = "Diagnóstico: Posible desgaste profesional. Acción: Auditoría de cargas laborales y lanzamiento de programa de 'Mejora Continua'.";
        } else if (weakestName.includes("institucional")) {
            level2Title = "Foco en Sentido Institucional";
            level2Text = "Diagnóstico: Desconexión emocional. Acción: Revisar propuesta de valor al empleado (salario emocional) y eventos de integración con impacto social.";
        } else if (weakestName.includes("equipo")) {
            level2Title = "Foco en Trabajo en Equipo";
            level2Text = "Diagnóstico: Mentalidad de silos. Acción: Crear proyectos transversales obligatorios entre facultades y evaluaciones de 'Cliente Interno'.";
        } else if (weakestName.includes("comunicacion")) {
            level2Title = "Foco en Comunicación Asertiva";
            level2Text = "Diagnóstico: Informalidad o feedback poco claro. Acción: Capacitación en 'Feedback Radical y Empático' para líderes y estandarización de canales.";
        } else if (weakestName.includes("resultados")) {
            level2Title = "Foco en Orientación a Resultados";
            level2Text = "Diagnóstico: Esfuerzo sin impacto. Acción: Implementación de metodología OKRs a nivel institucional para alinear tareas con metas estratégicas.";
        } else {
            level2Title = `Foco en ${weakestSection?.sectionName}`;
            level2Text = `Se identifica ${weakestSection?.sectionName} como el área de mayor oportunidad. Se recomienda establecer mesas de trabajo específicas para diagnosticar las causas raíz.`;
        }

        // Level 3: Strategic Proposals (Old Logic - Kept for Summary)
        let level3Title = "";
        let level3Text = "";

        // Helper to get univ avg for a section
        const getUnivAvg = (namePart: string) => {
            const s = radarData.find(d => normalize(d.sectionName).includes(normalize(namePart)));
            return s ? s.UniversityAvg : 0;
        };

        const s_comunicacion = getUnivAvg("comunicacion");
        const s_equipo = getUnivAvg("equipo");
        const s_resultados = getUnivAvg("resultados");
        const s_institucional = getUnivAvg("institucional");

        // Propuesta A: High Variance (already calc stdDev, but let's check min/max office)
        const maxOfficeAvg = Math.max(...allOffices.map(o => o.avg));
        const minOfficeAvg = Math.min(...allOffices.map(o => o.avg));

        if (maxOfficeAvg > 4.8 && minOfficeAvg < 3.5) {
            level3Title = "Programa de Padrinazgo Interno";
            level3Text = `Dada la brecha de desempeño (${(maxOfficeAvg - minOfficeAvg).toFixed(1)} pts), se propone un programa de Mentoría Cruzada, donde líderes de alto rendimiento apadrinen áreas en desarrollo.`;
        } else if ((s_comunicacion < 3.8 || s_equipo < 3.8) && s_resultados > 4.2) { // Adjusted thresholds slightly
            level3Title = "Academia de Liderazgo Ágil";
            level3Text = "La Universidad cumple metas pero a un costo humano alto (Bajo clima/comunicación). Se propone crear una Escuela de Liderazgo Transformacional para mandos medios.";
        } else if (s_institucional > 4.2 && s_resultados < 3.8) {
            level3Title = "Plan de Incentivos por Eficiencia";
            level3Text = "Existe lealtad y sentido de pertenencia, pero falta enfoque en metas. Se propone rediseñar el esquema de Compensación Variable ligado a hitos cuantificables.";
        } else {
            // Fallback Proposal
            level3Title = "Plan de Consolidación Estratégica";
            level3Text = "Se sugiere mantener los programas actuales de bienestar y reforzar la capacitación técnica en las áreas operativas para sostener el crecimiento.";
        }

        // --- 6. HR Action Plan Generator (Existing PRISMA) ---
        const hrPlan = {
            shortTerm: [] as string[],
            mediumTerm: [] as string[],
            longTerm: [] as string[]
        };

        // Short Term: Address the weakest link immediately
        if (weakestName.includes("integridad")) {
            hrPlan.shortTerm.push("Lanzar campaña de comunicación interna sobre el Código de Ética.");
            hrPlan.shortTerm.push("Habilitar canal de denuncias anónimo y seguro.");
        } else if (weakestName.includes("comunicacion")) {
            hrPlan.shortTerm.push("Implementar reuniones de 'Check-in' semanal en todas las oficinas.");
            hrPlan.shortTerm.push("Taller de comunicación efectiva para mandos medios.");
        } else if (weakestName.includes("resultados")) {
            hrPlan.shortTerm.push("Revisión inmediata de KPIs por departamento.");
            hrPlan.shortTerm.push("Seguimiento quincenal de metas críticas.");
        } else {
            hrPlan.shortTerm.push(`Diagnóstico focalizado en el área de ${weakestSection?.sectionName}.`);
            hrPlan.shortTerm.push("Sesiones de feedback 1 a 1 con líderes de áreas críticas.");
        }

        // Medium Term: Standardization & Culture
        if (stdDev > 0.3) {
            hrPlan.mediumTerm.push("Programa de estandarización de procesos entre campus.");
            hrPlan.mediumTerm.push("Rotación temporal de líderes entre sedes (Intercambio de prácticas).");
        } else {
            hrPlan.mediumTerm.push("Fortalecimiento de la marca empleadora interna.");
            hrPlan.mediumTerm.push("Programa de reconocimiento al desempeño sobresaliente.");
        }

        if (s_equipo < 4.0) {
            hrPlan.mediumTerm.push("Actividades de Team Building semestrales por campus.");
        }

        // Long Term: Strategic Differentiation
        hrPlan.longTerm.push(`Consolidar "${strongestSection?.sectionName}" como pilar de la cultura organizacional.`);
        hrPlan.longTerm.push("Desarrollo de plan de carrera y sucesión para talento clave.");
        hrPlan.longTerm.push("Certificación Great Place to Work basada en fortalezas actuales.");

        // --- NEW PRISMA FEATURES (University) ---

        // I. Acción Enfocada (3 Options)
        const focusedActions = [];
        if (weakestScore >= 4.0) {
            focusedActions.push({
                title: "Universidad Corporativa",
                desc: `Crear una escuela interna para formalizar el conocimiento en ${weakestSection?.sectionName}.`,
                icon: <Award className="w-5 h-5 text-purple-600" />
            });
            focusedActions.push({
                title: "Sello de Calidad Institucional",
                desc: "Certificar los procesos clave bajo normas internacionales (ISO).",
                icon: <Link className="w-5 h-5 text-blue-600" />
            });
            focusedActions.push({
                title: "Cultura de Innovación",
                desc: "Fomentar intra-emprendimiento para mejorar procesos transversales.",
                icon: <Activity className="w-5 h-5 text-emerald-600" />
            });
        } else {
            focusedActions.push({
                title: "Plan Maestro de Recuperación",
                desc: `Intervención sistémica en los campus con menor desempeño en ${weakestSection?.sectionName}.`,
                icon: <AlertTriangle className="w-5 h-5 text-red-600" />
            });
            focusedActions.push({
                title: "Auditoría Organizacional",
                desc: "Revisión externa de la estructura y procesos para identificar cuellos de botella.",
                icon: <Link className="w-5 h-5 text-orange-600" />
            });
            focusedActions.push({
                title: "Alineación Estratégica",
                desc: "Summit de líderes para redefinir prioridades y compromisos.",
                icon: <Target className="w-5 h-5 text-yellow-600" />
            });
        }

        // II. Propuesta Estratégica
        const strategicProposals = [
            {
                name: "Opción A: Transformación Digital del Talento",
                kpi: "Automatizar 50% de procesos de HR",
                scope: "Toda la Universidad - Eficiencia",
                color: "bg-blue-50 border-blue-200 text-blue-800",
                actions: [
                    "Implementar plataforma de autogestión para colaboradores.",
                    "Digitalizar el proceso de onboarding y offboarding.",
                    "Integrar analítica de datos en tiempo real para toma de decisiones."
                ]
            },
            {
                name: "Opción B: Programa de Bienestar Integral 360",
                kpi: "Reducir ausentismo en 15%",
                scope: "Colaboradores y Familias - Clima",
                color: "bg-purple-50 border-purple-200 text-purple-800",
                actions: [
                    "Lanzar programa de salud mental y emocional.",
                    "Establecer beneficios flexibles para familias.",
                    "Promover actividades deportivas y culturales inter-campus."
                ]
            },
            {
                name: "Opción C: Liderazgo para el Futuro",
                kpi: "Tener 80% de puestos clave con sucesor listo",
                scope: "Alta Dirección - Sostenibilidad",
                color: "bg-emerald-50 border-emerald-200 text-emerald-800",
                actions: [
                    "Crear comité de sucesión para roles críticos.",
                    "Diseñar programa de desarrollo para altos potenciales.",
                    "Establecer mentoría cruzada entre directivos."
                ]
            }
        ];

        // III. Predictive
        const riskProb = Math.max(5, Math.min(90, (5 - weakestScore) * 10)).toFixed(0);
        const efficiencyLoss = Math.max(0, (4.5 - globalAverage) * 12).toFixed(1);
        const roi = (globalAverage * 4).toFixed(0);

        const predictiveAnalysis = {
            risk: {
                label: "Riesgo Sistémico",
                value: `${riskProb}%`,
                desc: `Vulnerabilidad institucional ante crisis en ${weakestSection?.sectionName}.`,
                color: "text-red-600"
            },
            financial: {
                label: "Costo de Oportunidad",
                value: `${efficiencyLoss}%`,
                desc: "Pérdida de competitividad frente al mercado educativo.",
                color: "text-orange-600"
            },
            roi: {
                label: "Valor Institucional",
                value: `${roi}%`,
                desc: "Incremento en reputación y ranking universitario.",
                color: "text-emerald-600"
            }
        };

        // IV. Correlation
        const correlationMap = {
            focus: weakestSection?.sectionName,
            focusScore: weakestScore.toFixed(1),
            impacted: strongestName,
            impactedScore: strongestScore.toFixed(1),
            analysis: `La debilidad estructural en ${weakestSection?.sectionName} (${weakestScore.toFixed(1)}) amenaza con erosionar la ventaja competitiva en ${strongestName} (${strongestScore.toFixed(1)}). Una estrategia integral debe abordar ambos frentes.`
        };

        return {
            globalAverage,
            campuses,
            radarData,
            topOffices,
            intelligentAnalysis: {
                level1: { title: level1Title, text: level1Text, color: level1Color },
                level2: { title: level2Title, text: level2Text },
                level3: { title: level3Title, text: level3Text }
            },
            hrPlan,
            focusedActions,
            strategicProposals,
            predictiveAnalysis,
            correlationMap,
            top10Workers,
            bottom10Workers
        };
    }, [results, selectedTemplate]);

    const handleGenerateReport = async () => {
        if (!analysis || isGeneratingAi) return;
        setIsGeneratingAi(true);
        try {
            // Sort sections by UniversityAvg to find strengths and weaknesses
            const sorted = [...analysis.radarData].sort((a, b) => b.UniversityAvg - a.UniversityAvg);
            
            const report = await PrismaBrain.generateExecutiveReport({
                globalAverage: analysis.globalAverage,
                campusStats: analysis.campuses.map(c => ({ name: c.name, avg: c.avg })),
                topStrengths: sorted.slice(0, 3).map(s => ({ name: s.sectionName, avg: s.UniversityAvg })),
                criticalAreas: sorted.slice(-3).reverse().map(s => ({ name: s.sectionName, avg: s.UniversityAvg })),
                totalEvaluations: results.length
            });
            setAiReport(report);
        } catch (error) {
            console.error(error);
        } finally {
            setIsGeneratingAi(false);
        }
    };

    if (!analysis) return <div className="p-8 text-center text-slate-500">Cargando análisis universitario...</div>;

    const { globalAverage, campuses, radarData, topOffices, intelligentAnalysis, hrPlan, focusedActions, strategicProposals, predictiveAnalysis, correlationMap, top10Workers, bottom10Workers } = analysis;
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

                    {/* AI Executive Report Section */}
                    <div className="mt-8">
                        {!aiReport ? (
                            <button
                                onClick={handleGenerateReport}
                                disabled={isGeneratingAi}
                                className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-900/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isGeneratingAi ? (
                                    <>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                        Generando Análisis Ejecutivo...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        Generar Resumen Ejecutivo con IA
                                    </>
                                )}
                            </button>
                        ) : (
                            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 text-white animate-in fade-in slide-in-from-bottom-4 duration-700">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="p-2 bg-amber-500/20 rounded-lg">
                                        <Sparkles className="w-6 h-6 text-amber-400" />
                                    </div>
                                    <h3 className="text-xl font-bold">Resumen Ejecutivo (IA)</h3>
                                </div>
                                <div className="prose prose-invert max-w-none text-sm leading-relaxed text-indigo-100">
                                    <div dangerouslySetInnerHTML={{ __html: aiReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                </div>
                            </div>
                        )}
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

            {/* Strategic Recommendations (Level 2 & 3) - OLD SUMMARY KEPT */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Level 2: Actionable Insight */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 border-l-4 border-l-orange-500">
                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-orange-500" />
                        Diagnóstico Focalizado
                    </h3>
                    <div className="bg-orange-50 rounded-xl p-5 mb-4">
                        <h4 className="font-bold text-orange-800 mb-2">{intelligentAnalysis.level2.title}</h4>
                        <p className="text-sm text-orange-800/80 leading-relaxed">
                            {intelligentAnalysis.level2.text}
                        </p>
                    </div>
                </div>

                {/* Level 3: Strategic Proposal */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 border-l-4 border-l-indigo-500">
                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-indigo-500" />
                        Iniciativa Prioritaria
                    </h3>
                    <div className="bg-indigo-50 rounded-xl p-5 mb-4">
                        <h4 className="font-bold text-indigo-800 mb-2">{intelligentAnalysis.level3.title}</h4>
                        <p className="text-sm text-indigo-800/80 leading-relaxed">
                            {intelligentAnalysis.level3.text}
                        </p>
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
                                <div key={idx} className={`rounded-xl border transition-all duration-300 ${prop.color} ${expandedProposals[idx] ? 'ring-2 ring-offset-2 ring-indigo-100' : ''}`}>
                                    <div
                                        className="p-5 flex flex-col md:flex-row items-start md:items-center gap-6 cursor-pointer"
                                        onClick={() => toggleProposal(idx)}
                                    >
                                        <div className="flex-1">
                                            <h4 className="font-bold text-lg mb-1 flex items-center gap-2">
                                                {prop.name}
                                                {expandedProposals[idx] ? <ChevronUp className="w-4 h-4 opacity-50" /> : <ChevronDown className="w-4 h-4 opacity-50" />}
                                            </h4>
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
                                            <span className="text-xs font-bold uppercase tracking-wider opacity-60">
                                                {expandedProposals[idx] ? 'Ocultar Acciones' : 'Ver Acciones'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Accordion Content */}
                                    <div className={`overflow-hidden transition-all duration-300 ${expandedProposals[idx] ? 'max-h-96 opacity-100 p-5 pt-0' : 'max-h-0 opacity-0'}`}>
                                        <div className="bg-white/60 rounded-lg p-4">
                                            <h5 className="font-bold text-sm mb-2 opacity-80">Acciones Sugeridas:</h5>
                                            <ul className="space-y-2">
                                                {prop.actions.map((action, i) => (
                                                    <li key={i} className="flex items-start gap-2 text-sm opacity-90">
                                                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current opacity-50" />
                                                        {action}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
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
                                    {hrPlan.shortTerm.map((action, idx) => (
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
                                    {hrPlan.mediumTerm.map((action, idx) => (
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
                                    {hrPlan.longTerm.map((action, idx) => (
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

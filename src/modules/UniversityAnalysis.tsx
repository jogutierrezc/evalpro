import { useMemo } from 'react';
import { ResultWithDetails } from './ResultsModule';
import {
    Award,
    BrainCircuit,
    Building2,
    Target,
    Zap,
    ClipboardList,
    CheckCircle2,
    Lightbulb,
    ArrowRight
} from 'lucide-react';

interface Props {
    results: ResultWithDetails[];
}

// Helper to normalize text
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// --- MULTI-SERIES RADAR CHART ---
const MultiRadarChart = ({ data, campuses, colors }: { data: any[], campuses: string[], colors: string[] }) => {
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
                        const val = d[campus] || 0;
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
                                const val = d[campus] || 0;
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

    const analysis = useMemo(() => {
        const validResults = results.filter(r => r.avgScore !== null && r.avgScore !== undefined);
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
            const campusName = r.evaluated?.campus || 'Sin Campus';
            const officeName = r.office?.name || 'Sin Oficina';

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
        const radarData = Array.from(allSectionNames).map(sectionName => {
            const row: any = { sectionName };
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

        // --- 5. Intelligent Analysis Logic ---

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
        const weakestName = normalize(weakestSection?.sectionName || "");

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

        // Level 3: Strategic Proposals
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

        // --- 6. HR Action Plan Generator (New Feature) ---
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
        const strongestSection = sortedSections[sortedSections.length - 1]; // Last one is highest
        hrPlan.longTerm.push(`Consolidar "${strongestSection?.sectionName}" como pilar de la cultura organizacional.`);
        hrPlan.longTerm.push("Desarrollo de plan de carrera y sucesión para talento clave.");
        hrPlan.longTerm.push("Certificación Great Place to Work basada en fortalezas actuales.");


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
            hrPlan
        };
    }, [results]);

    if (!analysis) return <div className="p-8 text-center text-slate-500">Cargando análisis universitario...</div>;

    const { globalAverage, campuses, radarData, topOffices, intelligentAnalysis, hrPlan } = analysis;
    const campusColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

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

            {/* Strategic Recommendations (Level 2 & 3) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Level 2: Actionable Insight */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 border-l-4 border-l-orange-500">
                    <h3 className="font-bold text-slate-800 text-lg mb-4 flex items-center gap-2">
                        <Target className="w-5 h-5 text-orange-500" />
                        Acción Enfocada (Matriz de Recomendación)
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
                        Propuesta Estratégica (Rectoría)
                    </h3>
                    <div className="bg-indigo-50 rounded-xl p-5 mb-4">
                        <h4 className="font-bold text-indigo-800 mb-2">{intelligentAnalysis.level3.title}</h4>
                        <p className="text-sm text-indigo-800/80 leading-relaxed">
                            {intelligentAnalysis.level3.text}
                        </p>
                    </div>
                </div>

            </div>

            {/* HR Action Plan Section */}
            <div className="bg-slate-900 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 left-0 p-12 opacity-5">
                    <ClipboardList className="w-64 h-64" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-emerald-500/20 p-3 rounded-xl backdrop-blur-sm border border-emerald-500/30">
                            <Lightbulb className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold">Plan de Acción Sugerido para Talento Humano</h2>
                            <p className="text-slate-400 text-sm">Hoja de ruta generada automáticamente basada en brechas y fortalezas</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Short Term */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-2 mb-4 text-emerald-400">
                                <CheckCircle2 className="w-5 h-5" />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Corto Plazo (1-3 Meses)</h3>
                            </div>
                            <ul className="space-y-3">
                                {hrPlan.shortTerm.map((action, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                                        <ArrowRight className="w-4 h-4 mt-0.5 text-emerald-500/50 shrink-0" />
                                        <span>{action}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Medium Term */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-2 mb-4 text-blue-400">
                                <CheckCircle2 className="w-5 h-5" />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Mediano Plazo (3-6 Meses)</h3>
                            </div>
                            <ul className="space-y-3">
                                {hrPlan.mediumTerm.map((action, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                                        <ArrowRight className="w-4 h-4 mt-0.5 text-blue-500/50 shrink-0" />
                                        <span>{action}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Long Term */}
                        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-2 mb-4 text-purple-400">
                                <CheckCircle2 className="w-5 h-5" />
                                <h3 className="font-bold text-sm uppercase tracking-wider">Largo Plazo (+6 Meses)</h3>
                            </div>
                            <ul className="space-y-3">
                                {hrPlan.longTerm.map((action, idx) => (
                                    <li key={idx} className="flex items-start gap-3 text-sm text-slate-300">
                                        <ArrowRight className="w-4 h-4 mt-0.5 text-purple-500/50 shrink-0" />
                                        <span>{action}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
}

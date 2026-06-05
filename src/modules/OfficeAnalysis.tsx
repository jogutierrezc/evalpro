import { useMemo, useState } from 'react';
import { ResultWithDetails } from './ResultsModule';
import { RadarChart, SectionSummaryRow } from './SectionAnalysis';
import {
    TrendingUp,
    Award,
    BrainCircuit,
    CheckCircle2,
    ArrowRight,
    Target,
    Zap,
    Activity,
    BarChart3,
    AlertTriangle,
    Link,
    PieChart,
    ChevronDown,
    ChevronUp,
    Layers
} from 'lucide-react';

// Helper to normalize text for matching
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface Props {
    officeName: string;
    results: ResultWithDetails[];
}

export default function OfficeAnalysis({ results }: Props) {
    const [expandedProposals, setExpandedProposals] = useState<Record<number, boolean>>({});

    const toggleProposal = (idx: number) => {
        setExpandedProposals(prev => ({
            ...prev,
            [idx]: !prev[idx]
        }));
    };

    const analysis = useMemo(() => {
        // Filter results that have scores
        const validResults = results.filter(r => r.avgScore !== null && r.avgScore !== undefined);

        if (validResults.length === 0) return null;

        // 1. Global Office Score
        const totalScore = validResults.reduce((sum, r) => sum + (Number(r.avgScore) || 0), 0);
        const globalScore = totalScore / validResults.length;

        // 2. Team Competencies (Radar Data)
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

        const teamSections: SectionSummaryRow[] = Object.values(sectionMap).map(s => ({
            sectionId: s.id,
            sectionName: s.name,
            avg: s.sum / s.count,
            weight: 1, // Placeholder
            questions: [] // Placeholder
        }));

        // 3. Member List (Sorted)
        const sortedMembers = [...validResults].sort((a, b) => (Number(b.avgScore) || 0) - (Number(a.avgScore) || 0));

        const membersWithStandouts = sortedMembers.map(m => {
            const standouts = (m.sectionsSummary || [])
                .filter(s => s.avg !== null && s.avg >= 4.5)
                .map(s => s.sectionName);

            // If no standouts >= 4.5, take the top 1
            if (standouts.length === 0 && m.sectionsSummary && m.sectionsSummary.length > 0) {
                const top = [...m.sectionsSummary].sort((a, b) => (b.avg || 0) - (a.avg || 0))[0];
                if (top && top.avg !== null) standouts.push(top.sectionName);
            }

            return {
                ...m,
                standouts
            };
        });

        // 4. Competencies by Group (Who met the average)
        const competenciesAnalysis = teamSections.map(s => {
            const officeAvg = s.avg || 0;
            const metAverage = validResults.filter(r => {
                const sec = r.sectionsSummary?.find(sec => sec.sectionName === s.sectionName);
                return sec && sec.avg !== null && sec.avg >= officeAvg;
            });

            return {
                sectionName: s.sectionName,
                officeAvg,
                metAverageCount: metAverage.length,
                totalMembers: validResults.length,
                metAverageMembers: metAverage
            };
        });

        // 5. Intelligent Analysis
        const strengths = teamSections.filter(s => (s.avg || 0) >= 4.2).map(s => s.sectionName);
        const weaknesses = teamSections.filter(s => (s.avg || 0) < 3.8).map(s => s.sectionName);

        // --- PRISMA Logic (Office Level) ---
        const prismaPlan = {
            shortTerm: [] as string[],
            mediumTerm: [] as string[],
            longTerm: [] as string[]
        };

        const sortedSections = [...teamSections].sort((a, b) => (a.avg || 0) - (b.avg || 0));
        const weakestSection = sortedSections[0];
        const strongestSection = sortedSections[sortedSections.length - 1];

        const weakestName = normalize(weakestSection?.sectionName || "");
        const weakestScore = weakestSection?.avg || 0;
        const strongestName = strongestSection?.sectionName || "Otras áreas";
        const strongestScore = strongestSection?.avg || 0;

        // --- NEW PRISMA FEATURES ---

        // I. Acción Enfocada (3 Options)
        const focusedActions = [];
        if (weakestScore >= 4.0) {
            focusedActions.push({
                title: `Desarrollo del "Líder Coach" (Alto Impacto)`,
                desc: `Transformar el dominio en ${weakestSection?.sectionName} en un modelo de enseñanza. Crear mentores internos.`,
                icon: <Award className="w-5 h-5 text-purple-600" />
            });
            focusedActions.push({
                title: "Planes de Sucesión Estratégica",
                desc: "Mitigar riesgo de talento clave estableciendo sucesores formales para roles críticos.",
                icon: <Link className="w-5 h-5 text-blue-600" />
            });
            focusedActions.push({
                title: "Consolidación vía Evaluaciones 360°",
                desc: "Profesionalizar el diagnóstico con feedback 360° para mantener la excelencia.",
                icon: <Activity className="w-5 h-5 text-emerald-600" />
            });
        } else if (weakestScore <= 3.0) {
            focusedActions.push({
                title: "Intervención de Choque (Corto Plazo)",
                desc: `Auditoría inmediata de procesos en ${weakestSection?.sectionName} y reentrenamiento básico obligatorio.`,
                icon: <AlertTriangle className="w-5 h-5 text-red-600" />
            });
            focusedActions.push({
                title: "Mentoring Directivo Asignado",
                desc: "Asignar un líder senior de otra área para supervisar la recuperación del desempeño.",
                icon: <Link className="w-5 h-5 text-orange-600" />
            });
            focusedActions.push({
                title: "Reestructuración de Objetivos",
                desc: "Simplificar metas a corto plazo para generar victorias rápidas y recuperar confianza.",
                icon: <Target className="w-5 h-5 text-yellow-600" />
            });
        } else {
            focusedActions.push({
                title: "Capacitación Focalizada (Skill Gap)",
                desc: `Taller práctico intensivo en ${weakestSection?.sectionName} para cerrar brechas técnicas.`,
                icon: <BrainCircuit className="w-5 h-5 text-blue-600" />
            });
            focusedActions.push({
                title: "Círculos de Calidad",
                desc: "Crear grupos de trabajo quincenales para resolver problemas específicos del área.",
                icon: <PieChart className="w-5 h-5 text-indigo-600" />
            });
            focusedActions.push({
                title: "Benchmarking Interno",
                desc: "Visitas a oficinas con alto desempeño para copiar mejores prácticas.",
                icon: <TrendingUp className="w-5 h-5 text-emerald-600" />
            });
        }

        // II. Propuesta Estratégica (Rectoría)
        const strategicProposals = [
            {
                name: "Opción A: Inmersión Transformacional",
                kpi: "Incrementar eNPS en 15% en 12 meses",
                scope: "Mandos Medios (25%) - Rápido Impacto",
                color: "bg-blue-50 border-blue-200 text-blue-800",
                actions: [
                    "Realizar talleres de liderazgo transformacional.",
                    "Implementar sesiones de coaching grupal.",
                    "Establecer feedback 360 trimestral."
                ]
            },
            {
                name: "Opción B: Escuela de Innovación y Sucesión",
                kpi: "Reducir rotación de talento clave en 10%",
                scope: "Líderes Emergentes (15%) - Largo Plazo",
                color: "bg-purple-50 border-purple-200 text-purple-800",
                actions: [
                    "Organizar hackathons internos para resolver problemas reales.",
                    "Lanzar proyectos piloto liderados por talentos emergentes.",
                    "Capacitar en metodologías de Design Thinking."
                ]
            },
            {
                name: "Opción C: Certificación en Gestión Ágil",
                kpi: "Reducir tiempo de proyectos en 20%",
                scope: "Equipos de Proyecto (10%) - Eficiencia",
                color: "bg-emerald-50 border-emerald-200 text-emerald-800",
                actions: [
                    "Certificar al equipo en Scrum o Kanban.",
                    "Implementar tableros visuales de seguimiento.",
                    "Establecer reuniones diarias (dailies) de sincronización."
                ]
            }
        ];

        // III. Predictive Analysis
        const riskProb = Math.max(5, Math.min(90, (5 - weakestScore) * 15)).toFixed(0);
        const efficiencyLoss = Math.max(0, (4.5 - globalScore) * 8).toFixed(1);
        const roi = (globalScore * 6).toFixed(0);

        const predictiveAnalysis = {
            risk: {
                label: "Riesgo de Talento",
                value: `${riskProb}%`,
                desc: `Probabilidad de rotación si no se mejora ${weakestSection?.sectionName}.`,
                color: "text-red-600"
            },
            financial: {
                label: "Impacto Financiero",
                value: `${efficiencyLoss}%`,
                desc: "Costo estimado de ineficiencia operativa anual.",
                color: "text-orange-600"
            },
            roi: {
                label: "Oportunidad de ROI",
                value: `${roi}%`,
                desc: "Retorno esperado al implementar la Propuesta Estratégica.",
                color: "text-emerald-600"
            }
        };

        // IV. Correlation Map
        const correlationMap = {
            focus: weakestSection?.sectionName,
            focusScore: weakestScore.toFixed(1),
            impacted: strongestName,
            impactedScore: strongestScore.toFixed(1),
            analysis: `El desempeño actual en ${weakestSection?.sectionName} (${weakestScore.toFixed(1)}) podría estar limitando el potencial de ${strongestName} (${strongestScore.toFixed(1)}). ${weakestScore < 3.5 ? "Es crítico resolver las bases para desbloquear el crecimiento." : "Al perfeccionar el área foco, se maximizará el impacto de las fortalezas existentes."}`
        };

        // Helper to add actions based on score range (Existing Logic Preserved/Enhanced)
        const addActions = (score: number, competency: string) => {
            const comp = normalize(competency);

            // ⚠️ Nivel de Alerta Crítica (0.0 - 2.0)
            if (score <= 2.0) {
                if (comp.includes("liderazgo")) {
                    prismaPlan.shortTerm.push("Diagnóstico Profundo Obligatorio: Implementar 'Shadowing' de Liderazgo.");
                    prismaPlan.shortTerm.push("Coaching Ejecutivo de Crisis 1:1 centrado en comunicación básica.");
                    prismaPlan.mediumTerm.push("Reestructuración de equipos para asignar mentores temporales.");
                } else if (comp.includes("integridad")) {
                    prismaPlan.shortTerm.push("Auditoría Ética Rápida y Reinducción Obligatoria en Código de Ética.");
                    prismaPlan.shortTerm.push("Establecer Compromiso Ético Formal firmado por el personal.");
                    prismaPlan.mediumTerm.push("Crear un Canal de Denuncia Anónimo de acceso directo.");
                } else if (comp.includes("compromiso") || comp.includes("calidad")) {
                    prismaPlan.shortTerm.push("Capacitación intensiva en Metodología 5S y revisión de procesos.");
                    prismaPlan.shortTerm.push("Establecer Puntos de Control de Calidad (QC) diarios.");
                    prismaPlan.mediumTerm.push("Sesiones de 'Lessons Learned' obligatorias tras fallos.");
                } else if (comp.includes("orientacion") || comp.includes("resultados")) {
                    prismaPlan.shortTerm.push("Taller de Alineación de Objetivos y definición de métricas SMART.");
                    prismaPlan.shortTerm.push("Implementar reuniones diarias (Daily Stand-ups) de progreso.");
                    prismaPlan.mediumTerm.push("Implementar tablero Kanban de visibilidad de resultados.");
                } else if (comp.includes("institucional")) {
                    prismaPlan.shortTerm.push("Taller de Inducción de Cultura y refuerzo de misión/visión.");
                    prismaPlan.shortTerm.push("Sesión de 'Valores en Acción' con ejemplos de comportamiento.");
                    prismaPlan.mediumTerm.push("Programa de Padrinazgo Institucional con empleados clave.");
                }
            }
            // 🟢 Nivel de Desarrollo (2.1 - 3.0)
            else if (score <= 3.0) {
                if (comp.includes("liderazgo")) {
                    prismaPlan.shortTerm.push("Taller de Liderazgo Situacional y manejo de conflictos.");
                    prismaPlan.mediumTerm.push("Programa de Mentoring formal (líderes experimentados a nuevos).");
                    prismaPlan.longTerm.push("Iniciar el uso de Evaluaciones 360° iniciales.");
                } else if (comp.includes("integridad")) {
                    prismaPlan.shortTerm.push("Mesa de Diálogo Ético semestral y análisis de casos.");
                    prismaPlan.mediumTerm.push("Entrenamientos sobre manejo de información confidencial.");
                    prismaPlan.longTerm.push("Reconocimiento a la Transparencia como valor institucional.");
                } else if (comp.includes("compromiso") || comp.includes("calidad")) {
                    prismaPlan.shortTerm.push("Implementación de Herramientas de Gestión (Scrum/Kanban).");
                    prismaPlan.mediumTerm.push("Sistema de Revisión por Pares estandarizado.");
                    prismaPlan.longTerm.push("Taller de Análisis Causa Raíz (Ishikawa/5 Porqués).");
                } else if (comp.includes("orientacion") || comp.includes("resultados")) {
                    prismaPlan.shortTerm.push("Capacitación en OKR (Objectives and Key Results).");
                    prismaPlan.mediumTerm.push("Crear un Dashboard de resultados visible para la unidad.");
                    prismaPlan.longTerm.push("Formación en Gestión del Tiempo y Productividad Personal.");
                } else if (comp.includes("institucional")) {
                    prismaPlan.shortTerm.push("Actividades de integración (Team Building) sobre historia UDES.");
                    prismaPlan.mediumTerm.push("Voluntariado corporativo para reforzar impacto social.");
                    prismaPlan.longTerm.push("Campaña interna de 'Héroes Institucionales'.");
                }
            }
            // 🌟 Nivel de Fortalecimiento (3.1 - 4.0)
            else if (score <= 4.0) {
                if (comp.includes("liderazgo")) {
                    prismaPlan.shortTerm.push("Implementar Escuela de Liderazgo Transformacional.");
                    prismaPlan.mediumTerm.push("Iniciar Planes de Sucesión para mandos medios.");
                } else if (comp.includes("integridad")) {
                    prismaPlan.shortTerm.push("Certificación de áreas clave en normas de calidad y ética.");
                    prismaPlan.mediumTerm.push("Crear un Comité de Ética multidisciplinario.");
                } else if (comp.includes("compromiso") || comp.includes("calidad")) {
                    prismaPlan.shortTerm.push("Implementar Sistema de Gestión de Calidad (SGC) formal.");
                    prismaPlan.mediumTerm.push("Proyectos Lean Six Sigma para reducción de errores.");
                } else if (comp.includes("orientacion") || comp.includes("resultados")) {
                    prismaPlan.shortTerm.push("Introducir Presupuesto Base Cero vinculado a estrategia.");
                    prismaPlan.mediumTerm.push("Incentivos variables ligados a KPI de alta calidad.");
                } else if (comp.includes("institucional")) {
                    prismaPlan.shortTerm.push("Programas de intercambio de personal entre campus/áreas.");
                    prismaPlan.mediumTerm.push("Fomentar visión global mediante rotación de puestos.");
                }
            }
            // 🚀 Nivel de Excelencia (4.1 - 5.0)
            else {
                if (comp.includes("liderazgo")) {
                    prismaPlan.shortTerm.push("Programa de 'Líder Coach' interno para certificar líderes.");
                    prismaPlan.longTerm.push("Publicar un Modelo de Liderazgo Propio de la Universidad.");
                } else if (comp.includes("integridad")) {
                    prismaPlan.shortTerm.push("Buscar Certificación Great Place to Work.");
                    prismaPlan.longTerm.push("Mentoring de Liderazgo Ético a instituciones externas.");
                } else if (comp.includes("compromiso") || comp.includes("calidad")) {
                    prismaPlan.shortTerm.push("Benchmarking con universidades de clase mundial.");
                    prismaPlan.longTerm.push("Fondo de Innovación para mejora de procesos de calidad.");
                } else if (comp.includes("orientacion") || comp.includes("resultados")) {
                    prismaPlan.shortTerm.push("Implementar Oficina de Gestión de Proyectos (PMO) estratégica.");
                    prismaPlan.longTerm.push("Reconocimiento público a equipos que superan OKRs.");
                } else if (comp.includes("institucional")) {
                    prismaPlan.shortTerm.push("Desarrollar Modelo de Proyección Social basado en valores.");
                    prismaPlan.longTerm.push("Promover Movilidad Interinstitucional internacional.");
                }
            }
        };

        // Apply logic to the weakest section found
        if (weakestSection) {
            addActions(weakestScore, weakestName);
        } else {
            // Fallback generic actions if no specific section data
            prismaPlan.shortTerm.push("Realizar diagnóstico general de clima organizacional.");
            prismaPlan.mediumTerm.push("Establecer plan de capacitación basado en roles.");
            prismaPlan.longTerm.push("Evaluación de desempeño anual alineada a objetivos.");
        }

        // Add a general "Next Step" based on Global Score if plan is sparse
        if (prismaPlan.shortTerm.length < 2) {
            if (globalScore < 3.5) {
                prismaPlan.shortTerm.push("Reunión de alineación estratégica con la dirección.");
            } else {
                prismaPlan.shortTerm.push("Sesión de reconocimiento de logros del equipo.");
            }
        }

        // --- V. ANÁLISIS COMPARATIVO POR TIPO DE EXAMEN ---
        const templateMap: Record<string, {
            name: string;
            sum: number;
            count: number;
            sections: Record<string, { sum: number; count: number }>;
        }> = {};

        validResults.forEach(r => {
            const tName = r.templateName || 'Sin Tipo';
            if (!templateMap[tName]) {
                templateMap[tName] = { name: tName, sum: 0, count: 0, sections: {} };
            }
            templateMap[tName].sum += (Number(r.avgScore) || 0);
            templateMap[tName].count += 1;
            (r.sectionsSummary || []).forEach(s => {
                if (s.avg !== null) {
                    if (!templateMap[tName].sections[s.sectionName]) {
                        templateMap[tName].sections[s.sectionName] = { sum: 0, count: 0 };
                    }
                    templateMap[tName].sections[s.sectionName].sum += s.avg;
                    templateMap[tName].sections[s.sectionName].count += 1;
                }
            });
        });

        const templateNames = Object.keys(templateMap).sort();
        const allSectionNames = Array.from(new Set(
            validResults.flatMap(r => (r.sectionsSummary || []).map(s => s.sectionName))
        )).sort();

        const byTemplate = templateNames.map(name => {
            const tmpl = templateMap[name];
            const sections: Record<string, number> = {};
            allSectionNames.forEach(secName => {
                const secData = tmpl.sections[secName];
                sections[secName] = secData && secData.count > 0
                    ? Math.round((secData.sum / secData.count) * 100) / 100
                    : 0;
            });
            return {
                name,
                globalAvg: tmpl.count > 0 ? tmpl.sum / tmpl.count : 0,
                count: tmpl.count,
                sections
            };
        });

        // Detect main disparities (largest gaps between two template types per section)
        const disparities: Array<{
            sectionName: string;
            templateA: string;
            scoreA: number;
            templateB: string;
            scoreB: number;
            gap: number;
        }> = [];

        allSectionNames.forEach(secName => {
            const scores = byTemplate.map(t => ({ name: t.name, score: t.sections[secName] || 0 }));
            for (let i = 0; i < scores.length; i++) {
                for (let j = i + 1; j < scores.length; j++) {
                    const gap = Math.abs(scores[i].score - scores[j].score);
                    if (gap > 0.3) { // threshold for meaningful difference
                        disparities.push({
                            sectionName: secName,
                            templateA: scores[i].name,
                            scoreA: scores[i].score,
                            templateB: scores[j].name,
                            scoreB: scores[j].score,
                            gap: Math.round(gap * 100) / 100
                        });
                    }
                }
            }
        });

        disparities.sort((a, b) => b.gap - a.gap);

        // Generate textual analysis
        const templateComparisonTexts: string[] = [];
        if (byTemplate.length >= 2) {
            // Compare global averages
            const sortedByAvg = [...byTemplate].sort((a, b) => b.globalAvg - a.globalAvg);
            const best = sortedByAvg[0];
            const worst = sortedByAvg[sortedByAvg.length - 1];
            templateComparisonTexts.push(
                `El promedio global más alto se registra en "${best.name}" (${best.globalAvg.toFixed(2)}), mientras que "${worst.name}" presenta el más bajo (${worst.globalAvg.toFixed(2)}), con una diferencia de ${(best.globalAvg - worst.globalAvg).toFixed(2)} puntos.`
            );

            // Top disparities
            if (disparities.length > 0) {
                const topDisp = disparities.slice(0, 3);
                topDisp.forEach(d => {
                    templateComparisonTexts.push(
                        `En la competencia "${d.sectionName}" hay una brecha de ${d.gap.toFixed(2)} puntos entre "${d.templateA}" (${d.scoreA.toFixed(2)}) y "${d.templateB}" (${d.scoreB.toFixed(2)}).`
                    );
                });
            }

            // Check for auto-evaluation vs manager evaluation patterns
            const autoEval = byTemplate.find(t =>
                t.name.toLowerCase().includes('auto') || t.name.toLowerCase().includes('autoevaluacion')
            );
            const managerEval = byTemplate.find(t =>
                t.name.toLowerCase().includes('jefe') || t.name.toLowerCase().includes('líder') ||
                t.name.toLowerCase().includes('lider') || t.name.toLowerCase().includes('manager')
            );
            if (autoEval && managerEval) {
                const diff = autoEval.globalAvg - managerEval.globalAvg;
                if (Math.abs(diff) > 0.3) {
                    if (diff > 0) {
                        templateComparisonTexts.push(
                            `Se detecta una disparidad en la autopercepción: la autoevaluación (${autoEval.globalAvg.toFixed(2)}) es significativamente más alta que la evaluación del líder (${managerEval.globalAvg.toFixed(2)}), lo que sugiere una posible sobreestimación o falta de feedback objetivo.`
                        );
                    } else {
                        templateComparisonTexts.push(
                            `La evaluación del líder (${managerEval.globalAvg.toFixed(2)}) supera a la autoevaluación (${autoEval.globalAvg.toFixed(2)}), indicando autocritica o que el líder percibe un desempeño superior al que el colaborador se atribuye.`
                        );
                    }
                }
            }
        }

        return {
            globalScore,
            teamSections,
            membersWithStandouts,
            competenciesAnalysis,
            strengths,
            weaknesses,
            prismaPlan,
            focusedActions,
            strategicProposals,
            predictiveAnalysis,
            correlationMap,
            comparativeAnalysis: {
                byTemplate,
                allSectionNames,
                templateNames,
                disparities,
                templateComparisonTexts
            }
        };
    }, [results]);

    if (!analysis) {
        return (
            <div className="p-8 text-center text-slate-500">
                No hay suficientes datos para generar el análisis de oficina.
            </div>
        );
    }

    const { globalScore, teamSections, membersWithStandouts, competenciesAnalysis, strengths, weaknesses, prismaPlan, focusedActions, strategicProposals, predictiveAnalysis, correlationMap, comparativeAnalysis } = analysis;

    return (
        <div className="space-y-8 animate-in fade-in duration-500">

            {/* Header Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Global Score Card */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex items-center gap-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="relative w-24 h-24 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="48" cy="48" r="40" stroke="#f1f5f9" strokeWidth="8" fill="none" />
                            <circle
                                cx="48" cy="48" r="40"
                                stroke="#3b82f6"
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
                        <p className="text-slate-400 text-xs mt-1">Promedio de {results.length} miembros</p>
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold">
                            <TrendingUp className="w-3 h-3" /> {globalScore >= 4 ? 'Alto Desempeño' : 'Promedio'}
                        </div>
                    </div>
                </div>

                {/* Team Strengths */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 md:col-span-2 flex flex-col justify-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <h3 className="text-slate-800 font-bold text-lg mb-3 flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5 text-emerald-600" />
                        Análisis Inteligente del Equipo
                    </h3>
                    <div className="text-sm text-slate-600 space-y-2">
                        {strengths.length > 0 ? (
                            <p>
                                El equipo demuestra una solidez excepcional en <strong className="text-emerald-700">{strengths.join(", ")}</strong>.
                                Esto indica un alto nivel de cohesión y competencia en áreas críticas.
                            </p>
                        ) : (
                            <p>El equipo mantiene un desempeño equilibrado, sin fortalezas dominantes extremas.</p>
                        )}
                        {weaknesses.length > 0 && (
                            <p>
                                Se identifican oportunidades de mejora en <strong className="text-orange-600">{weaknesses.join(", ")}</strong>.
                                Se recomienda enfocar capacitaciones en estas áreas.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Team Competency Map */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-slate-800 text-lg">Mapa de Competencias del Equipo</h3>
                        <div className="text-xs text-slate-400">Promedio General</div>
                    </div>
                    <div className="flex items-center justify-center bg-slate-50/50 rounded-xl border border-slate-100 border-dashed p-4">
                        <RadarChart data={teamSections} size={350} />
                    </div>
                </div>

                {/* Competencies by Group (Average Line) */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 overflow-y-auto max-h-[500px]">
                    <h3 className="font-bold text-slate-800 text-lg mb-6">Competencias por Grupo</h3>
                    <div className="space-y-6">
                        {competenciesAnalysis.map((comp) => (
                            <div key={comp.sectionName}>
                                <div className="flex justify-between items-end mb-2">
                                    <span className="font-semibold text-slate-700 text-sm">{comp.sectionName}</span>
                                    <span className="text-xs font-bold text-blue-600">{comp.officeAvg.toFixed(1)} / 5.0</span>
                                </div>

                                {/* Progress Bar with Marker */}
                                <div className="relative h-2 bg-slate-100 rounded-full mb-3">
                                    <div
                                        className="absolute top-0 left-0 h-full bg-blue-500 rounded-full"
                                        style={{ width: `${(comp.officeAvg / 5) * 100}%` }}
                                    ></div>
                                </div>

                                {/* Who met the average */}
                                <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2 overflow-hidden">
                                        {comp.metAverageMembers.slice(0, 5).map((m, i) => (
                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600" title={m.evaluatedName}>
                                                {m.evaluatedName?.charAt(0)}
                                            </div>
                                        ))}
                                        {comp.metAverageMembers.length > 5 && (
                                            <div className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                                                +{comp.metAverageMembers.length - 5}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-500">
                                        <strong className="text-slate-700">{comp.metAverageCount}</strong> miembros cumplieron el promedio
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

            {/* Members List Sorted by Score */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800 text-lg">Ranking de Desempeño</h3>
                    <p className="text-slate-500 text-sm">Miembros organizados por puntaje global</p>
                </div>
                <div className="divide-y divide-slate-100">
                    {membersWithStandouts.map((member, idx) => (
                        <div key={member.id} className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4 flex-1">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${idx < 3 ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30' : 'bg-slate-300'}`}>
                                    {idx + 1}
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-800">{member.evaluatedName}</h4>
                                    <p className="text-xs text-slate-500">{member.evaluatedRole || 'Miembro del equipo'}</p>

                                    {/* Standout Categories */}
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {member.standouts.map((s, i) => (
                                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-100">
                                                <Award className="w-3 h-3" /> {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                <div className="text-right">
                                    <span className="block text-xs text-slate-400 uppercase tracking-wider">Puntaje</span>
                                    <span className={`text-xl font-bold ${(Number(member.avgScore) || 0) >= 4 ? 'text-emerald-600' : 'text-slate-700'}`}>
                                        {Number(member.avgScore || 0).toFixed(1)}
                                    </span>
                                </div>
                                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${(Number(member.avgScore) || 0) >= 4.5 ? 'bg-emerald-500' : (Number(member.avgScore) || 0) >= 3.5 ? 'bg-blue-500' : 'bg-orange-500'}`}
                                        style={{ width: `${((Number(member.avgScore) || 0) / 5) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* --- ANÁLISIS COMPARATIVO POR TIPO DE EXAMEN --- */}
            {comparativeAnalysis && comparativeAnalysis.byTemplate.length >= 2 && (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
                        <div className="flex items-center gap-3">
                            <Layers className="w-6 h-6" />
                            <div>
                                <h3 className="text-xl font-bold">Análisis Comparativo por Tipo de Examen</h3>
                                <p className="text-indigo-200 text-sm mt-1">
                                    Comparación de resultados entre los {comparativeAnalysis.byTemplate.length} tipos de evaluación aplicados
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 space-y-8">

                        {/* Radar Chart Comparativo */}
                        <div>
                            <h4 className="font-bold text-slate-800 text-lg mb-4">Mapa de Competencias por Tipo de Examen</h4>
                            <div className="flex flex-col items-center">
                                <svg width={380} height={380} className="overflow-visible">
                                    {(() => {
                                        const center = 190;
                                        const radius = 130;
                                        const levels = 5;
                                        const data = comparativeAnalysis.allSectionNames;
                                        const templateData = comparativeAnalysis.byTemplate;
                                        const angleSlice = (Math.PI * 2) / data.length;
                                        const getCoords = (value: number, index: number) => {
                                            const angle = index * angleSlice - Math.PI / 2;
                                            const r = (value / 5) * radius;
                                            return { x: center + r * Math.cos(angle), y: center + r * Math.sin(angle) };
                                        };
                                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

                                        return (
                                            <g>
                                                {/* Background levels */}
                                                {[...Array(levels)].map((_, level) => {
                                                    const lr = (radius / levels) * (level + 1);
                                                    const pts = data.map((_, i) => {
                                                        const a = i * angleSlice - Math.PI / 2;
                                                        return `${center + lr * Math.cos(a)},${center + lr * Math.sin(a)}`;
                                                    }).join(' ');
                                                    return (
                                                        <g key={level}>
                                                            <polygon points={pts} fill="none" stroke="#e2e8f0" strokeWidth="1" />
                                                            <text x={center} y={center - lr - 5} className="text-[10px] fill-slate-400" textAnchor="middle">{level + 1}</text>
                                                        </g>
                                                    );
                                                })}

                                                {/* Axes */}
                                                {data.map((_, i) => {
                                                    const c = getCoords(5, i);
                                                    return <line key={`axis-${i}`} x1={center} y1={center} x2={c.x} y2={c.y} stroke="#e2e8f0" strokeWidth="1" />;
                                                })}

                                                {/* Labels */}
                                                {data.map((name, i) => {
                                                    const a = i * angleSlice - Math.PI / 2;
                                                    const lr = radius + 22;
                                                    const x = center + lr * Math.cos(a);
                                                    const y = center + lr * Math.sin(a);
                                                    let anchor = 'middle';
                                                    if (x > center + 10) anchor = 'start';
                                                    if (x < center - 10) anchor = 'end';
                                                    return (
                                                        <text key={`label-${i}`} x={x} y={y} className="text-[10px] fill-slate-600 font-semibold uppercase" textAnchor={anchor} dominantBaseline="middle">
                                                            {name.length > 14 ? name.substring(0, 12) + '...' : name}
                                                        </text>
                                                    );
                                                })}

                                                {/* Polygons per template type */}
                                                {templateData.map((t, tIdx) => {
                                                    const color = colors[tIdx % colors.length];
                                                    const pts = data.map((secName, i) => {
                                                        const val = t.sections[secName] || 0;
                                                        const c = getCoords(val, i);
                                                        return `${c.x},${c.y}`;
                                                    }).join(' ');
                                                    return (
                                                        <g key={t.name}>
                                                            <polygon points={pts} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="2" />
                                                            {data.map((secName, i) => {
                                                                const val = t.sections[secName] || 0;
                                                                const c = getCoords(val, i);
                                                                return <circle key={`pt-${tIdx}-${i}`} cx={c.x} cy={c.y} r="3" fill={color} stroke="white" strokeWidth="1" />;
                                                            })}
                                                        </g>
                                                    );
                                                })}
                                            </g>
                                        );
                                    })()}
                                </svg>

                                {/* Legend */}
                                <div className="flex flex-wrap justify-center gap-4 mt-2">
                                    {comparativeAnalysis.byTemplate.map((t, idx) => {
                                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
                                        return (
                                            <div key={t.name} className="flex items-center gap-2 text-xs font-medium text-slate-600">
                                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                                                {t.name} <span className="text-slate-400">({t.count} eval.)</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Tabla Comparativa */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50">
                                        <th className="px-4 py-3 text-left font-semibold text-slate-600">Competencia</th>
                                        {comparativeAnalysis.byTemplate.map(t => (
                                            <th key={t.name} className="px-4 py-3 text-center font-semibold text-slate-600">{t.name}</th>
                                        ))}
                                        <th className="px-4 py-3 text-center font-semibold text-slate-400">Brecha Máx.</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {comparativeAnalysis.allSectionNames.map(secName => {
                                        const scores = comparativeAnalysis.byTemplate.map(t => t.sections[secName] || 0);
                                        const maxScore = Math.max(...scores);
                                        const minScore = Math.min(...scores);
                                        const gap = Math.round((maxScore - minScore) * 100) / 100;
                                        return (
                                            <tr key={secName} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2 font-medium text-slate-700">{secName}</td>
                                                {comparativeAnalysis.byTemplate.map(t => {
                                                    const score = t.sections[secName] || 0;
                                                    const isBest = score === maxScore && maxScore > 0;
                                                    const isWorst = score === minScore && minScore > 0 && maxScore !== minScore;
                                                    return (
                                                        <td key={t.name} className={`px-4 py-2 text-center font-bold ${
                                                            isBest ? 'text-emerald-600' : isWorst ? 'text-red-500' : 'text-slate-700'
                                                        }`}>
                                                            {score > 0 ? score.toFixed(2) : '-'}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                                                        gap > 0.5 ? 'bg-red-100 text-red-700' :
                                                        gap > 0.3 ? 'bg-yellow-100 text-yellow-700' :
                                                        'bg-green-100 text-green-700'
                                                    }`}>
                                                        {gap.toFixed(2)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {/* Global Average Row */}
                                    <tr className="bg-indigo-50 font-semibold">
                                        <td className="px-4 py-3 text-indigo-800">Promedio Global</td>
                                        {comparativeAnalysis.byTemplate.map(t => {
                                            const allScores = comparativeAnalysis.allSectionNames.map(s => t.sections[s] || 0).filter(v => v > 0);
                                            const avg = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
                                            const allTmplAvgs = comparativeAnalysis.byTemplate.map(t2 => {
                                                const s2 = comparativeAnalysis.allSectionNames.map(s => t2.sections[s] || 0).filter(v => v > 0);
                                                return s2.length > 0 ? s2.reduce((a, b) => a + b, 0) / s2.length : 0;
                                            });
                                            const maxAvg = Math.max(...allTmplAvgs);
                                            const minAvg = Math.min(...allTmplAvgs);
                                            const isBest = avg === maxAvg && maxAvg > 0;
                                            const isWorst = avg === minAvg && minAvg > 0 && maxAvg !== minAvg;
                                            return (
                                                <td key={t.name} className={`px-4 py-3 text-center text-base ${
                                                    isBest ? 'text-emerald-600' : isWorst ? 'text-red-500' : 'text-indigo-800'
                                                }`}>
                                                    {avg.toFixed(2)}
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-3 text-center text-indigo-800">
                                            {(() => {
                                                const avgs = comparativeAnalysis.byTemplate.map(t => {
                                                    const s = comparativeAnalysis.allSectionNames.map(sn => t.sections[sn] || 0).filter(v => v > 0);
                                                    return s.length > 0 ? s.reduce((a, b) => a + b, 0) / s.length : 0;
                                                }).filter(v => v > 0);
                                                return avgs.length >= 2 ? (Math.max(...avgs) - Math.min(...avgs)).toFixed(2) : '-';
                                            })()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Análisis Textual */}
                        {comparativeAnalysis.templateComparisonTexts.length > 0 && (
                            <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                                <h4 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                                    <BrainCircuit className="w-5 h-5" />
                                    Análisis de Disparidad entre Tipos de Examen
                                </h4>
                                <ul className="space-y-3">
                                    {comparativeAnalysis.templateComparisonTexts.map((text, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm text-indigo-800">
                                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                            {text}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* PRISMA SYSTEM SECTION - ENHANCED */}
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 relative overflow-hidden">
                {/* Background Logo */}
                <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
                    {/* Placeholder if needed, but we use header logo now */}
                </div>

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

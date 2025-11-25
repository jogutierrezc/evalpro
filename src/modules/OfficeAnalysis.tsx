
import { useMemo } from 'react';
import { ResultWithDetails } from './ResultsModule';
import { RadarChart, SectionSummaryRow } from './SectionAnalysis';
import {
    TrendingUp,
    Award,
    BrainCircuit,
    ClipboardList,
    CheckCircle2,
    Lightbulb,
    ArrowRight
} from 'lucide-react';

// Helper to normalize text for matching
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface Props {
    officeName: string;
    results: ResultWithDetails[];
}

export default function OfficeAnalysis({ officeName, results }: Props) {

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

        const weakestSection = [...teamSections].sort((a, b) => (a.avg || 0) - (b.avg || 0))[0];
        const weakestName = normalize(weakestSection?.sectionName || "");
        const weakestScore = weakestSection?.avg || 0;

        // Helper to add actions based on score range
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

        return {
            globalScore,
            teamSections,
            membersWithStandouts,
            competenciesAnalysis,
            strengths,
            weaknesses,
            prismaPlan
        };
    }, [results]);

    if (!analysis) {
        return (
            <div className="p-8 text-center text-slate-500">
                No hay suficientes datos para generar el análisis de oficina.
            </div>
        );
    }

    const { globalScore, teamSections, membersWithStandouts, competenciesAnalysis, strengths, weaknesses, prismaPlan } = analysis;

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
                                            <div key={i} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600" title={m.evaluated?.full_name}>
                                                {m.evaluated?.full_name?.charAt(0)}
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
                                    <h4 className="font-bold text-slate-800">{member.evaluated?.full_name}</h4>
                                    <p className="text-xs text-slate-500">{member.evaluated?.role || 'Miembro del equipo'}</p>

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

            {/* PRISMA SYSTEM SECTION */}
            {/* PRISMA SYSTEM SECTION */}
            <div className="bg-white rounded-3xl p-8 shadow-2xl border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 opacity-5 pointer-events-none">
                    <img src="/prisma.png" alt="Prisma Logo" className="w-96 h-96 object-contain -ml-20 -mt-20" />
                </div>

                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                            <Lightbulb className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Sistema PRISMA: Inteligencia del Talento</h2>
                            <p className="text-slate-500 text-sm">Plan de acción estratégico para la Oficina</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Short Term */}
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:shadow-md transition-all">
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
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:shadow-md transition-all">
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
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200 hover:shadow-md transition-all">
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
    );
}

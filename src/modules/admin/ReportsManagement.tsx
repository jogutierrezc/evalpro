import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';

import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Cell
} from 'recharts';
import {
    User,
    ClipboardCheck,
    TrendingUp,
    Users,
    Award,
    AlertCircle,
    CheckCircle2,
    BrainCircuit,
    FileText,
    Target,
    Building2,
    Printer,
    Search,
    Sparkles,
    Shield // Added Shield
} from 'lucide-react';
import { generarInformeIA, EvaluacionInput, InformeGenerado, TipoExamenVaf } from '../../lib/ai-report-logic';
import { AiReportRenderer } from '../../components/AiReportRenderer';

// --- Types ---
interface Office {
    id: string;
    name: string;
}

interface UserProfile {
    id: string;
    full_name: string;
    role: string;
    identification: string;
}

interface SectionData {
    id: string;
    title: string;
    score: number;
    weight: number;
    questions: any[];
}

interface ReportData {
    meta: {
        title: string;
        subject: string;
        date: string;
        evaluator: string;
        analyst: string;
        role: string;
    };
    executive: {
        profile: string;
        weightedScore: number;
        rawScore: number;
        summary: string;
    };
    factors: {
        id: string;
        title: string;
        score: number;
        level: string;
        strengths: string;
        weakness: string;
        icon: any;
    }[];
    recommendations: {
        id: string;
        goal: string;
        action: string;
        psychFocus: string;
    }[];
}

// --- AI Simulation Logic ---
const getProfile = (score: number) => {
    if (score >= 4.5) return { name: "Líder de Proceso Excepcional", color: "text-green-600" };
    if (score >= 4.0) return { name: "Ejecutor Consistente", color: "text-blue-600" };
    if (score >= 3.5) return { name: "Perfil en Desarrollo", color: "text-amber-600" };
    return { name: "Requiere Intervención", color: "text-red-600" };
};

const getLevel = (score: number) => {
    if (score >= 4.7) return "Excepcional";
    if (score >= 4.0) return "Alto";
    if (score >= 3.0) return "En Desarrollo";
    return "Crítico";
};

const generateAnalysis = (sections: SectionData[], subjectName: string) => {
    // 1. Executive Summary
    const weightedScore = sections.reduce((acc, s) => acc + (s.score * (s.weight / 100)), 0);
    const rawScore = sections.reduce((acc, s) => acc + s.score, 0) / sections.length;
    const profile = getProfile(weightedScore);

    let summary = `El/La colaborador(a) ${subjectName} obtiene un perfil de "${profile.name}" con un desempeño general de ${weightedScore.toFixed(2)}. `;

    if (weightedScore >= 4.0) {
        summary += "Este perfil se caracteriza por una sólida orientación a la norma, la ética y los resultados. Demuestra un alto nivel de compromiso institucional y competencias técnicas bien consolidadas. ";
    } else {
        summary += "Este perfil indica que, si bien existen fortalezas operativas, hay áreas críticas que requieren atención inmediata para alinear el desempeño con los estándares institucionales. ";
    }

    const lowSections = sections.filter(s => s.score < 4.0).sort((a, b) => a.score - b.score);
    if (lowSections.length > 0) {
        summary += `El análisis identifica áreas de vulnerabilidad crítica en ${lowSections.map(s => s.title).join(", ")}.`;
    } else {
        summary += "No se detectan brechas críticas significativas, sugiriendo un potencial de alto liderazgo.";
    }

    // 2. Factors Analysis (Simulated Variations)
    const factors = sections.map((s) => {
        let strengths = "";
        let weakness = "";

        // Simulation of "AI" text generation based on score and keywords
        const titleLower = s.title.toLowerCase();

        if (titleLower.includes("integridad") || titleLower.includes("ética")) {
            if (s.score >= 4.5) {
                strengths = "Ética profesional inquebrantable, transparencia total y alineación profunda con los valores institucionales.";
                weakness = "Puede tender a la rigidez normativa en situaciones que requieren flexibilidad adaptativa.";
            } else if (s.score >= 3.5) {
                strengths = "Cumplimiento adecuado de normas y procedimientos básicos.";
                weakness = "Ocasionalmente prioriza la rapidez sobre el protocolo formal.";
            } else {
                strengths = "Reconoce la existencia de normas básicas.";
                weakness = "Riesgo significativo de incumplimiento normativo y falta de transparencia procedimental.";
            }
        } else if (titleLower.includes("liderazgo") || titleLower.includes("relaciones")) {
            if (s.score >= 4.5) {
                strengths = "Capacidad innata para inspirar, delegar efectivamente y mantener un clima laboral positivo.";
                weakness = "Podría sobreproteger al equipo, asumiendo cargas que deberían ser delegadas.";
            } else if (s.score >= 3.5) {
                strengths = "Mantiene relaciones cordiales y colabora cuando se le solicita.";
                weakness = "Estilo de liderazgo reactivo más que proactivo; comunicación mejorable en situaciones de estrés.";
            } else {
                strengths = "Interactúa funcionalmente con pares inmediatos.";
                weakness = "Dificultad severa en gestión de conflictos y comunicación asertiva. Tendencia al aislamiento.";
            }
        } else if (titleLower.includes("resultados") || titleLower.includes("calidad")) {
            if (s.score >= 4.5) {
                strengths = "Ejecución impecable, orientación a la excelencia y ciclo de mejora continua activo.";
                weakness = "Puede frustrarse con compañeros que no mantienen su mismo ritmo de ejecución.";
            } else if (s.score >= 3.5) {
                strengths = "Cumple con los objetivos asignados en tiempo y forma.";
                weakness = "Falta de autoevaluación crítica; depende de la supervisión externa para corregir errores.";
            } else {
                strengths = "Logra completar tareas simples bajo supervisión.";
                weakness = "Incumplimiento recurrente de plazos y estándares de calidad. Requiere supervisión constante.";
            }
        } else {
            // Generic fallback
            if (s.score >= 4.0) {
                strengths = "Desempeño sólido y consistente en esta competencia.";
                weakness = "Oportunidades menores de refinamiento en procesos complejos.";
            } else {
                strengths = "Muestra disposición para aprender.";
                weakness = "Brechas de competencia que afectan la autonomía operativa.";
            }
        }

        return {
            id: s.id,
            title: s.title,
            score: s.score,
            level: getLevel(s.score),
            strengths,
            weakness,
            icon: getIconForSection(s.title)
        };
    });

    // 3. Recommendations (Simulated)
    const recommendations = [];
    const sortedFactors = [...factors].sort((a, b) => a.score - b.score); // Lowest first

    // Add recommendation for lowest score
    if (sortedFactors[0]) {
        recommendations.push({
            id: "R.1",
            goal: `Mejorar ${sortedFactors[0].title}`,
            action: "Plan de Choque Específico",
            psychFocus: `Implementar mentoría directa para abordar las brechas en ${sortedFactors[0].title}. Se requiere un enfoque conductual para modificar hábitos arraigados.`
        });
    }

    // Add recommendation for second lowest
    if (sortedFactors[1] && sortedFactors[1].score < 4.0) {
        recommendations.push({
            id: "R.2",
            goal: "Desarrollo de Competencias",
            action: "Capacitación Focalizada",
            psychFocus: `Taller práctico sobre ${sortedFactors[1].title} con énfasis en casos de estudio reales de la institución.`
        });
    }

    // Add recommendation for highest score (Leverage strength)
    const bestFactor = [...factors].sort((a, b) => b.score - a.score)[0];
    if (bestFactor) {
        recommendations.push({
            id: "R.3",
            goal: "Potenciar Fortalezas",
            action: "Rol de Mentoría",
            psychFocus: `Aprovechar su alto desempeño en ${bestFactor.title} para que actúe como referente o mentor de personal junior, reforzando su sentido de pertenencia.`
        });
    }

    // Generic cultural fit
    recommendations.push({
        id: "R.4",
        goal: "Alineación Cultural",
        action: "Feedback Continuo",
        psychFocus: "Establecer sesiones mensuales de retroalimentación bidireccional para asegurar que la motivación se mantenga alineada con los objetivos estratégicos."
    });

    return {
        summary,
        factors,
        recommendations,
        weightedScore,
        rawScore,
        profile: profile.name
    };
};

const getIconForSection = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes('integridad') || t.includes('ética')) return <ClipboardCheck className="w-6 h-6" />;
    if (t.includes('liderazgo') || t.includes('relaciones')) return <Users className="w-6 h-6" />;
    if (t.includes('resultados') || t.includes('calidad')) return <TrendingUp className="w-6 h-6" />;
    if (t.includes('institucional')) return <Building2 className="w-6 h-6" />;
    return <Award className="w-6 h-6" />;
};

export function ReportsManagement() {
    const { user } = useAuth();
    const [offices, setOffices] = useState<Office[]>([]);
    const [selectedOffice, setSelectedOffice] = useState<string>('');
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [aiReportData, setAiReportData] = useState<{ input: EvaluacionInput, informe: InformeGenerado } | null>(null);
    const [generated, setGenerated] = useState(false);
    const [reportType, setReportType] = useState<'technical' | 'ai-self' | 'vaf'>('technical');
    const componentRef = useRef<HTMLDivElement>(null);

    const loadOffices = async () => {
        try {
            const { data, error } = await supabase.from('offices').select('id, name').order('name');
            if (error) throw error;
            setOffices(data || []);
        } catch (error) {
            console.error('Error loading offices:', error);
        }
    };

    const loadUsers = async (officeId: string) => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, full_name, role, identification')
                .eq('office_id', officeId)
                .order('full_name');

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    const loadEvaluatedUsers = async () => {
        try {
            const { data, error } = await supabase
                .from('evaluations')
                .select('evaluated_id, users:evaluated_id(id, full_name, role, identification)')
                .eq('evaluator_id', user?.id)
                .eq('status', 'completed');

            if (error) throw error;

            const uniqueUsersMap = new Map();
            data?.forEach((item: any) => {
                if (item.users) {
                    uniqueUsersMap.set(item.users.id, item.users);
                }
            });
            setUsers(Array.from(uniqueUsersMap.values()));
        } catch (error) {
            console.error('Error loading evaluated users:', error);
        }
    };

    useEffect(() => {
        if (user) {
            if (user.role === 'admin') {
                loadOffices();
            } else {
                loadEvaluatedUsers();
            }
        }
    }, [user]);

    useEffect(() => {
        if (user?.role === 'admin' && selectedOffice) {
            loadUsers(selectedOffice);
        }
    }, [selectedOffice, user]);

    const generateReport = async () => {
        if (!selectedUser) return;
        setLoading(true);
        setGenerated(false);
        setReportData(null);
        setAiReportData(null);

        try {
            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
          id,
          created_at,
          evaluator_id,
          template_id,
          template:evaluation_templates(name),
          responses:evaluation_responses(
            response_value,
            question:evaluation_questions(
              id,
              question_text,
              weight,
              section:evaluation_sections(id, title)
            )
          )
        `)
                .eq('evaluated_id', selectedUser)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (evaluations && evaluations.length > 0) {
                const evalData = evaluations[0];
                const responses = evalData.responses || [];
                const subject = users.find(u => u.id === selectedUser);
                const templateName = evalData.template?.name || '';
                const templateId = evalData.template_id;

                if (reportType === 'vaf') {
                    // Check if it's a VAF form by Name OR by specific ID
                    const vafIds = ['38d7fa88-bf39-457d-bdc2-3fbff363ce52', '4fb9f1a6-86ad-4fb5-8c52-4a33477a5143'];
                    const isVaf = templateName.toLowerCase().includes('vaf') || vafIds.includes(templateId);

                    if (!isVaf) {
                        alert('Este informe solo está disponible para evaluaciones VAF (Equipo VAF, Líder VAF).');
                        setLoading(false);
                        return;
                    }
                }

                if (reportType === 'technical') {
                    // --- TECHNICAL REPORT LOGIC ---
                    // Fetch Evaluator Name
                    const { data: evaluatorData } = await supabase
                        .from('users')
                        .select('full_name')
                        .eq('id', evalData.evaluator_id)
                        .single();

                    // Process Sections
                    const sectionsMap = new Map<string, SectionData>();

                    responses.forEach((r: any) => {
                        const sectionId = r.question?.section?.id || 'unknown';
                        const sectionTitle = r.question?.section?.title || 'General';

                        if (!sectionsMap.has(sectionId)) {
                            sectionsMap.set(sectionId, {
                                id: sectionId,
                                title: sectionTitle,
                                score: 0,
                                weight: 0, // We'll calculate average score, weight is implicit for now
                                questions: []
                            });
                        }

                        const section = sectionsMap.get(sectionId)!;
                        section.questions.push({
                            score: Number(r.response_value) || 0,
                            weight: r.question?.weight || 1
                        });
                    });

                    // Calculate Section Scores
                    const sections: SectionData[] = Array.from(sectionsMap.values()).map(s => {
                        const totalScore = s.questions.reduce((sum, q) => sum + q.score, 0);
                        const avgScore = totalScore / s.questions.length;
                        return {
                            ...s,
                            score: Math.round(avgScore * 100) / 100,
                            weight: 100 / sectionsMap.size // Distribute weight equally for now, or fetch from DB if available
                        };
                    });

                    const analysis = generateAnalysis(sections, subject?.full_name || 'Colaborador');

                    setReportData({
                        meta: {
                            title: "INFORME DE DESEMPEÑO INDIVIDUAL PRISMA UDES",
                            subject: subject?.full_name || "Desconocido",
                            date: new Date(evalData.created_at).toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
                            evaluator: evaluatorData?.full_name || "Sistema PRISMA",
                            analyst: "Dra. I.A. Psicológica Gemini",
                            role: subject?.role || "Evaluación Individual"
                        },
                        executive: {
                            profile: analysis.profile,
                            weightedScore: Number(analysis.weightedScore.toFixed(2)),
                            rawScore: Number(analysis.rawScore.toFixed(2)),
                            summary: analysis.summary
                        },
                        factors: analysis.factors,
                        recommendations: analysis.recommendations
                    });

                } else {
                    // --- AI SELF-EVALUATION OR VAF REPORT LOGIC ---

                    // Aggregate scores by section (RAW TITLES)
                    const sectionScores: Record<string, { total: number; count: number }> = {};

                    responses.forEach((r: any) => {
                        const sectionTitle = r.question?.section?.title || 'General';
                        // Use raw title as key
                        const key = sectionTitle;

                        if (!sectionScores[key]) sectionScores[key] = { total: 0, count: 0 };
                        sectionScores[key].total += Number(r.response_value) || 0;
                        sectionScores[key].count += 1;
                    });

                    const puntajes: Record<string, number> = {};
                    Object.entries(sectionScores).forEach(([key, val]) => {
                        puntajes[key] = Number((val.total / val.count).toFixed(1));
                    });

                    // Determine specific VAF type based on template name
                    let tipoInforme: TipoExamenVaf = 'AUTOEVALUACION';

                    if (reportType === 'vaf') {
                        const tName = templateName.toLowerCase();
                        if (tName.includes('lider') && tName.includes('colaborador')) {
                            tipoInforme = 'LIDERAZGO_TACTICO';
                        } else if (tName.includes('lider')) {
                            tipoInforme = 'LIDER_ESTRATEGICO';
                        } else {
                            tipoInforme = 'EQUIPO_OPERATIVO';
                        }
                    } else if (reportType === 'ai-self') {
                        tipoInforme = 'AUTOEVALUACION';
                    }

                    const input: EvaluacionInput = {
                        evaluado: {
                            nombre: subject?.full_name || 'Colaborador',
                            rol: subject?.role || 'Analista',
                            fecha: new Date(evalData.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                        },
                        tipoInforme: tipoInforme,
                        puntajes: puntajes
                    };

                    const informe = generarInformeIA(input);
                    setAiReportData({ input, informe });
                }

                setGenerated(true);
            } else {
                alert('No se encontró una evaluación completada para este usuario.');
                setReportData(null);
                setAiReportData(null);
            }
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Error al generar el informe');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const chartData = reportData?.factors.map(f => ({
        category: f.title.length > 10 ? f.title.substring(0, 10) + '...' : f.title,
        score: f.score,
        fullMark: 5,
        color: f.score >= 4.0 ? '#1e3a8a' : '#d97706'
    })) || [];

    return (
        <div className="space-y-6">
            {/* Control Panel - Hidden on Print */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 print:hidden">
                <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-600" />
                    Generador de Informes
                </h2>

                <div className={`grid grid-cols-1 md:grid-cols-${user?.role === 'admin' ? 4 : 3} gap-4 items-end`}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Informe</label>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => { setReportType('technical'); setGenerated(false); }}
                                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all ${reportType === 'technical' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Técnico
                            </button>
                            <button
                                onClick={() => { setReportType('ai-self'); setGenerated(false); }}
                                className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${reportType === 'ai-self' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Sparkles className="w-3 h-3" />
                                IA Auto
                            </button>
                            {user?.role === 'admin' && (
                                <button
                                    onClick={() => { setReportType('vaf'); setGenerated(false); }}
                                    className={`flex-1 py-1.5 px-3 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1 ${reportType === 'vaf' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Shield className="w-3 h-3" />
                                    VAF
                                </button>
                            )}
                        </div>
                    </div>

                    {user?.role === 'admin' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                <select
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    value={selectedOffice}
                                    onChange={(e) => {
                                        setSelectedOffice(e.target.value);
                                        setSelectedUser('');
                                        setGenerated(false);
                                    }}
                                >
                                    <option value="">Seleccionar Oficina...</option>
                                    {offices.map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Colaborador Evaluado</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <select
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                value={selectedUser}
                                onChange={(e) => {
                                    setSelectedUser(e.target.value);
                                    setGenerated(false);
                                }}
                                disabled={user?.role === 'admin' && !selectedOffice}
                            >
                                <option value="">Seleccionar Colaborador...</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={generateReport}
                            disabled={!selectedUser || loading}
                            className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
                        >
                            {loading ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Search className="w-4 h-4" />}
                            Generar
                        </button>
                        {generated && (
                            <button
                                onClick={handlePrint}
                                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 flex items-center justify-center gap-2"
                            >
                                <Printer className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Report View */}
            {generated && (
                <>
                    {reportType === 'technical' && reportData && (
                        <div ref={componentRef} className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-amber-100 print:bg-white">

                            {/* Header / Banner */}
                            <header className="bg-slate-900 text-white pt-10 pb-24 px-6 md:px-12 relative overflow-hidden shadow-lg print:shadow-none print:pt-6 print:pb-12">
                                {/* Logos for Print */}
                                <div className="absolute top-6 left-6 z-30 hidden print:block">
                                    <img src="https://udes.edu.co/images/logo/logo-con-acreditada-color.png" alt="UDES Logo" className="h-16 object-contain bg-white/90 p-2 rounded" />
                                </div>
                                <div className="absolute top-6 right-6 z-30 hidden print:block">
                                    <img src="/prisma.png" alt="PRISMA Logo" className="h-12 object-contain bg-white/90 p-1 rounded" />
                                </div>

                                <div className="absolute top-0 right-0 p-10 opacity-10 print:hidden">
                                    <BrainCircuit size={300} />
                                </div>
                                <div className="max-w-5xl mx-auto relative z-10 print:mt-16">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                                        <div>
                                            <div className="flex items-center gap-3 mb-2 text-amber-500 font-semibold tracking-wider text-sm uppercase">
                                                <FileText size={16} />
                                                {reportData.meta.title}
                                            </div>
                                            <h1 className="text-3xl md:text-5xl font-bold mb-2">{reportData.meta.subject}</h1>
                                            <p className="text-slate-400 text-lg">{reportData.meta.role} | {reportData.meta.date}</p>
                                        </div>
                                        <div className="text-right hidden md:block print:block">
                                            <p className="text-slate-400 text-sm">Evaluadora</p>
                                            <p className="font-medium">{reportData.meta.evaluator}</p>
                                            <p className="text-xs text-amber-500 mt-1">{reportData.meta.analyst}</p>
                                        </div>
                                    </div>
                                </div>
                            </header>

                            <main className="max-w-5xl mx-auto px-6 -mt-16 relative z-20 pb-20 print:mt-0 print:px-8">

                                {/* Executive Summary Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 print:gap-4">
                                    <div className="bg-white rounded-lg shadow-md p-6 border-t-4 border-amber-500 print:shadow-none print:border">
                                        <h3 className="text-slate-500 text-sm font-semibold uppercase mb-2">Puntaje Ponderado</h3>
                                        <div className="flex items-end gap-2">
                                            <span className="text-5xl font-bold text-slate-900">{reportData.executive.weightedScore}</span>
                                            <span className="text-lg text-slate-400 mb-1">/ 5.0</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">Escala PRISMA Global</p>
                                    </div>

                                    <div className="bg-white rounded-lg shadow-md p-6 border-t-4 border-slate-700 print:shadow-none print:border">
                                        <h3 className="text-slate-500 text-sm font-semibold uppercase mb-2">Perfil Obtenido</h3>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Award className="text-amber-500 w-8 h-8" />
                                            <span className="text-xl font-bold text-slate-800 leading-tight">
                                                {reportData.executive.profile}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-3">Nivel de desempeño destacado</p>
                                    </div>

                                    <div className="bg-white rounded-lg shadow-md p-6 border-t-4 border-slate-300 md:col-span-1 print:shadow-none print:border">
                                        <h3 className="text-slate-500 text-sm font-semibold uppercase mb-2">Cumplimiento Bruto</h3>
                                        <div className="flex items-end gap-2">
                                            <span className="text-4xl font-bold text-slate-700">{reportData.executive.rawScore}</span>
                                            <span className="text-sm text-slate-400 mb-1">Promedio Simple</span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2">Basado en respuestas directas</p>
                                    </div>
                                </div>

                                {/* Introduction Summary */}
                                <section className="bg-white rounded-lg shadow-sm p-8 mb-10 border-l-4 border-slate-900 print:shadow-none print:border print:p-4">
                                    <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <User className="text-amber-600" size={24} />
                                        Resumen Ejecutivo
                                    </h2>
                                    <p className="text-slate-600 leading-relaxed text-lg text-justify">
                                        {reportData.executive.summary}
                                    </p>
                                </section>

                                {/* Charts Section */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12 print:grid-cols-1 print:gap-6">
                                    {/* Chart */}
                                    <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-sm print:shadow-none print:border">
                                        <h3 className="text-lg font-bold text-slate-800 mb-6">Métricas de Factores Clave</h3>
                                        <div className="h-64 w-full">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                                    <XAxis type="number" domain={[0, 5]} hide />
                                                    <YAxis type="category" dataKey="category" tick={{ fill: '#475569', fontSize: 12 }} width={100} />
                                                    <Tooltip
                                                        cursor={{ fill: '#f1f5f9' }}
                                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    />
                                                    <ReferenceLine x={3} stroke="#ef4444" strokeDasharray="3 3" />
                                                    <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={30}>
                                                        {chartData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="flex justify-center gap-6 mt-4 text-xs text-slate-500">
                                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-900 rounded-sm"></div> Fortaleza</span>
                                            <span className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-600 rounded-sm"></div> Área de Oportunidad</span>
                                        </div>
                                    </div>

                                    {/* Key Insight Box */}
                                    <div className="bg-slate-800 text-slate-100 p-6 rounded-lg shadow-md flex flex-col justify-center print:bg-slate-100 print:text-slate-900 print:border print:shadow-none">
                                        <h4 className="text-amber-500 font-bold uppercase tracking-wider text-sm mb-4 print:text-amber-700">Diagnóstico IA</h4>
                                        <p className="italic text-slate-300 mb-4 print:text-slate-700">
                                            "{reportData.executive.weightedScore >= 4 ? 'Alto alineamiento cultural y operativo.' : 'Brechas significativas entre potencial y ejecución.'}"
                                        </p>
                                        <div className="mt-auto pt-4 border-t border-slate-700 print:border-slate-300">
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm text-slate-400 print:text-slate-600">Potencial de Liderazgo</span>
                                                <span className="text-amber-500 font-bold print:text-amber-700">{reportData.executive.weightedScore >= 4 ? 'Alto' : 'Medio/Bajo'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Detailed Breakdown */}
                                <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 border-slate-200">Análisis Detallado por Factores</h2>
                                <div className="space-y-6 mb-12 print:break-inside-avoid">
                                    {reportData.factors.map((factor) => (
                                        <div key={factor.id} className="bg-white border border-slate-100 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow print:shadow-none print:border-slate-200 print:break-inside-avoid">
                                            <div className="flex flex-col md:flex-row gap-4 md:items-start">
                                                <div className={`p-3 rounded-full flex-shrink-0 ${factor.score >= 4 ? 'bg-blue-50 text-blue-900' : 'bg-amber-50 text-amber-600'}`}>
                                                    {factor.icon}
                                                </div>
                                                <div className="flex-grow">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <h3 className="text-lg font-bold text-slate-800">{factor.title}</h3>
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${factor.score >= 4.5 ? 'bg-green-100 text-green-800' :
                                                            factor.score >= 4 ? 'bg-blue-100 text-blue-800' :
                                                                'bg-amber-100 text-amber-800'
                                                            }`}>
                                                            {factor.score} / 5.0
                                                        </span>
                                                    </div>

                                                    {/* Progress Bar */}
                                                    <div className="w-full bg-slate-100 rounded-full h-2 mb-4 print:hidden">
                                                        <div
                                                            className={`h-2 rounded-full ${factor.score >= 4 ? 'bg-slate-900' : 'bg-amber-500'}`}
                                                            style={{ width: `${(factor.score / 5) * 100}%` }}
                                                        ></div>
                                                    </div>

                                                    <div className="grid md:grid-cols-2 gap-6">
                                                        <div>
                                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                                                <CheckCircle2 size={14} className="text-green-600" /> Fortalezas
                                                            </h4>
                                                            <p className="text-sm text-slate-600 text-justify">{factor.strengths}</p>
                                                        </div>
                                                        <div>
                                                            <h4 className="text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                                                <AlertCircle size={14} className="text-amber-600" /> Vulnerabilidad
                                                            </h4>
                                                            <p className="text-sm text-slate-600 text-justify">{factor.weakness}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Strategic Recommendations */}
                                <section className="print:break-before-page">
                                    <div className="flex items-center gap-3 mb-6">
                                        <Target className="text-amber-600" size={28} />
                                        <h2 className="text-2xl font-bold text-slate-900">Recomendaciones Estratégicas (IA)</h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {reportData.recommendations.map((rec) => (
                                            <div key={rec.id} className="bg-white p-6 rounded-lg border-l-4 border-amber-500 shadow-sm flex flex-col h-full print:shadow-none print:border">
                                                <div className="flex justify-between items-start mb-3">
                                                    <span className="text-slate-300 font-bold text-xl">{rec.id}</span>
                                                    <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs font-semibold">{rec.goal}</span>
                                                </div>
                                                <h3 className="font-bold text-lg text-slate-800 mb-2">{rec.action}</h3>
                                                <p className="text-slate-600 text-sm leading-relaxed flex-grow text-justify">
                                                    {rec.psychFocus}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                {/* Conclusion Footer */}
                                <div className="mt-12 bg-slate-900 text-slate-300 p-8 rounded-lg text-center print:bg-white print:text-slate-800 print:border-t-2 print:border-slate-900">
                                    <h3 className="text-white font-bold text-lg mb-2 print:text-slate-900">Conclusión PRISMA</h3>
                                    <p className="max-w-3xl mx-auto leading-relaxed">
                                        El/La colaborador(a) {reportData.meta.subject} es un activo valioso para la institución. El mayor retorno de inversión se obtendrá fortaleciendo sus competencias clave identificadas. Si aborda estas áreas, puede transicionar a un nivel de desempeño superior.
                                    </p>
                                </div>
                            </main>
                        </div>
                    )}

                    {(reportType === 'ai-self' || reportType === 'vaf') && aiReportData && (
                        <AiReportRenderer inputData={aiReportData.input} informe={aiReportData.informe} />
                    )}
                </>
            )}
        </div>
    );
}

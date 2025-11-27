
import { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
    Shield, Users, Building, MessageSquare, Target, Zap, ChevronDown,
    Award, AlertTriangle, CheckCircle, Brain, BarChart3, TrendingUp,
    FileText, Printer, Building2
} from 'lucide-react';

/**
 * ============================================================================
 * 🧠 MOTOR DE INTELIGENCIA ARTIFICIAL (LÓGICA DE NEGOCIO)
 * ============================================================================
 */

// --- 1. Definición de Tipos de Datos ---

type RangoDesempeno = 'CRITICO' | 'VULNERABLE' | 'COMPETENTE' | 'DESTACADO' | 'MODELO';

interface EvaluacionInput {
    evaluado: {
        nombre: string;
        rol: string;
        fecha: string;
    };
    puntajes: {
        integridad: number;
        trabajoEquipo: number;
        institucional: number;
        comunicacion: number;
        orientacionResultados: number;
        calidadTrabajo: number;
    };
}

interface FactorAnalisis {
    id: string;
    nombre: string;
    score: number;
    rango: RangoDesempeno;
    color: string;
    icono: any;
    fortaleza: string;
    vulnerabilidad: string;
}

interface Recomendacion {
    id: string;
    titulo: string;
    tipo: 'Estrategia' | 'Cultura' | 'Liderazgo' | 'Operativo';
    descripcion: string;
}

interface InformeGenerado {
    meta: {
        puntajeGlobal: number;
        nivelGlobal: string;
        arquetipo: {
            nombre: string;
            descripcion: string;
            icono: string;
        };
    };
    resumenEjecutivo: string;
    factores: FactorAnalisis[];
    diagnosticoIA: string;
    recomendaciones: Recomendacion[];
}

// --- 2. Base de Conocimiento (Matriz de Variaciones) ---

const KNOWLEDGE_BASE = {
    arquetipos: [
        {
            trigger: (p: any) => p.integridad >= 4.8 && p.trabajoEquipo >= 4.8,
            nombre: "Estabilizador Institucional",
            descripcion: "Columna vertebral moral y operativa. Garantiza la cohesión y el cumplimiento normativo.",
            icono: "🏛️"
        },
        {
            trigger: (p: any) => p.orientacionResultados >= 4.8 && p.comunicacion >= 4.5,
            nombre: "Impulsor Estratégico",
            descripcion: "Agente de cambio enfocado en metas agresivas y movilización de equipos.",
            icono: "🚀"
        },
        {
            trigger: (p: any) => p.calidadTrabajo >= 4.8 && p.trabajoEquipo < 4.0,
            nombre: "Especialista Técnico",
            descripcion: "Alto desempeño individual con oportunidades en la integración colaborativa.",
            icono: "⚙️"
        },
        {
            trigger: (p: any) => true, // Fallback
            nombre: "Ejecutor Consistente",
            descripcion: "Perfil equilibrado que cumple con los estándares esperados de la organización.",
            icono: "📋"
        }
    ],
    textosPorDimension: {
        integridad: {
            MODELO: { f: "Referente moral absoluto; transparencia incuestionable.", v: "Posible rigidez ante situaciones de 'zona gris' que requieran flexibilidad." },
            DESTACADO: { f: "Alineación sólida con valores corporativos.", v: "Ocasionalmente puede dudar en reportar faltas menores de compañeros." },
            COMPETENTE: { f: "Cumple las normas básicas sin incidentes.", v: "Requiere supervisión en manejo de información confidencial compleja." },
            CRITICO: { f: "Reconoce la normativa básica.", v: "Riesgos éticos detectados; requiere plan de intervención inmediato." },
            VULNERABLE: { f: "Conoce las normas.", v: "Riesgo de desviaciones normativas." }
        },
        trabajoEquipo: {
            MODELO: { f: "Agente de cohesión; reduce la fricción grupal instintivamente.", v: "Tendencia a asumir carga ajena para evitar conflictos." },
            DESTACADO: { f: "Colaborador activo y empático.", v: "Puede mejorar en la delegación asertiva hacia pares." },
            COMPETENTE: { f: "Participa cuando se le solicita.", v: "Preferencia por el trabajo silo/individual sobre el colectivo." },
            CRITICO: { f: "Mantiene interacciones mínimas.", v: "Genera fricción o resistencia pasiva en dinámicas grupales." },
            VULNERABLE: { f: "Interacción limitada.", v: "Dificultad para integrarse." }
        },
        orientacionResultados: {
            MODELO: { f: "Visión láser en objetivos; supera expectativas consistentemente.", v: "Riesgo de 'burnout' o de atropellar procesos por llegar a la meta." },
            DESTACADO: { f: "Cumple metas con calidad superior.", v: "Enfoque en el 'cómo' (proceso) puede retrasar el 'qué' (resultado final)." },
            COMPETENTE: { f: "Ejecuta lo asignado correctamente.", v: "Reactivo; espera instrucciones en lugar de proponer mejoras." },
            CRITICO: { f: "Dificultad para cerrar tareas.", v: "Pierde el foco fácilmente; productividad por debajo del estándar." },
            VULNERABLE: { f: "Cumple parcialmente.", v: "Requiere seguimiento constante." }
        }
        // Fallbacks handled in helper
    }
};

// --- 3. Motor de Análisis (Funciones Helper) ---

const determinarRango = (score: number): RangoDesempeno => {
    if (score >= 4.9) return 'MODELO';
    if (score >= 4.5) return 'DESTACADO';
    if (score >= 3.8) return 'COMPETENTE';
    if (score >= 3.0) return 'VULNERABLE';
    return 'CRITICO';
};

const getColorPorRango = (rango: RangoDesempeno): string => {
    switch (rango) {
        case 'MODELO': return 'bg-blue-600'; // Azul fuerte
        case 'DESTACADO': return 'bg-blue-500'; // Azul estándar
        case 'COMPETENTE': return 'bg-yellow-500'; // Amarillo/Naranja
        case 'VULNERABLE': return 'bg-orange-500';
        case 'CRITICO': return 'bg-red-600';
        default: return 'bg-gray-400';
    }
};

const generarInformeIA = (input: EvaluacionInput): InformeGenerado => {
    const p = input.puntajes;

    // 1. Calcular Globales
    const valores = Object.values(p);
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    const nivelGlobal = promedio >= 4.5 ? "Sobresaliente" : promedio >= 4.0 ? "Avanzado" : "Estándar";

    // 2. Determinar Arquetipo
    const arquetipo = KNOWLEDGE_BASE.arquetipos.find(a => a.trigger(p)) || KNOWLEDGE_BASE.arquetipos[KNOWLEDGE_BASE.arquetipos.length - 1];

    // Helper to get text safely
    const getText = (dim: keyof typeof KNOWLEDGE_BASE.textosPorDimension, score: number) => {
        const rango = determinarRango(score);
        const texts = KNOWLEDGE_BASE.textosPorDimension[dim];
        if (texts && texts[rango]) return texts[rango];
        // Fallback generic
        if (score >= 4.0) return { f: "Desempeño sólido.", v: "Oportunidades de mejora continua." };
        return { f: "Muestra disposición.", v: "Requiere plan de desarrollo." };
    };

    // 3. Generar Análisis por Factor
    const factores: FactorAnalisis[] = [
        {
            id: 'int', nombre: 'Integridad y Ética', score: p.integridad, icono: Shield,
            rango: determinarRango(p.integridad), color: getColorPorRango(determinarRango(p.integridad)),
            fortaleza: getText('integridad', p.integridad).f,
            vulnerabilidad: getText('integridad', p.integridad).v
        },
        {
            id: 'team', nombre: 'Trabajo en Equipo', score: p.trabajoEquipo, icono: Users,
            rango: determinarRango(p.trabajoEquipo), color: getColorPorRango(determinarRango(p.trabajoEquipo)),
            fortaleza: getText('trabajoEquipo', p.trabajoEquipo).f,
            vulnerabilidad: getText('trabajoEquipo', p.trabajoEquipo).v
        },
        {
            id: 'inst', nombre: 'Compromiso Institucional', score: p.institucional, icono: Building,
            rango: determinarRango(p.institucional), color: getColorPorRango(determinarRango(p.institucional)),
            fortaleza: "Alineación cultural casi total. Cumplimiento perfecto de horarios y recursos.",
            vulnerabilidad: "Priorización de operatividad sobre formación teórica (capacitaciones)."
        },
        {
            id: 'com', nombre: 'Comunicación', score: p.comunicacion, icono: MessageSquare,
            rango: determinarRango(p.comunicacion), color: getColorPorRango(determinarRango(p.comunicacion)),
            fortaleza: "Etiqueta y comunicación con la comunidad sobresalientes.",
            vulnerabilidad: "Inseguridad en asertividad directa; prudencia excesiva para no ofender."
        },
        {
            id: 'res', nombre: 'Orientación a Resultados', score: p.orientacionResultados, icono: Target,
            rango: determinarRango(p.orientacionResultados), color: getColorPorRango(determinarRango(p.orientacionResultados)),
            fortaleza: getText('orientacionResultados', p.orientacionResultados).f,
            vulnerabilidad: getText('orientacionResultados', p.orientacionResultados).v
        },
        {
            id: 'cal', nombre: 'Calidad del Trabajo', score: p.calidadTrabajo, icono: Award,
            rango: determinarRango(p.calidadTrabajo), color: getColorPorRango(determinarRango(p.calidadTrabajo)),
            fortaleza: "Entrega productos con altos estándares de revisión.",
            vulnerabilidad: "Puede demorar entregas por revisiones excesivas (perfeccionismo)."
        }
    ];

    // 4. Generar Recomendaciones Dinámicas
    const recomendaciones: Recomendacion[] = [];

    if (p.orientacionResultados < 4.5) {
        recomendaciones.push({
            id: "R.1", titulo: "Mentoring en Innovación", tipo: "Estrategia",
            descripcion: "Empoderar para tomar riesgos calculados. Transicionar del 'cumplimiento' a la 'propuesta'."
        });
    }
    if (p.calidadTrabajo > 4.5 && p.orientacionResultados < 4.5) {
        recomendaciones.push({
            id: "R.2", titulo: "Validación Externa de Calidad", tipo: "Liderazgo",
            descripcion: "Calibración de autopercepción. El colaborador es más crítico consigo mismo que el mercado."
        });
    }

    // Generic recs if empty
    if (recomendaciones.length === 0) {
        recomendaciones.push({
            id: "R.1", titulo: "Potenciación de Liderazgo", tipo: "Liderazgo",
            descripcion: "Dado el alto desempeño, se sugiere iniciar rutas de mentoría para personal junior."
        });
    }

    // 5. Resumen Narrativo
    const resumen = `El perfil de ${input.evaluado.nombre} se consolida como "${arquetipo.nombre}". Con un puntaje de ${promedio.toFixed(1)}, demuestra una confiabilidad excepcional (Integridad ${p.integridad}). Su principal desafío radica en equilibrar su perfeccionismo operativo con una visión más estratégica y arriesgada.`;

    return {
        meta: { puntajeGlobal: Number(promedio.toFixed(1)), nivelGlobal, arquetipo: { nombre: arquetipo.nombre, descripcion: arquetipo.descripcion, icono: arquetipo.icono } },
        resumenEjecutivo: resumen,
        factores,
        diagnosticoIA: "Alto alineamiento cultural y operativo. Riesgo latente de estancamiento por aversión al riesgo innovador.",
        recomendaciones
    };
};

/**
 * ============================================================================
 * 🎨 INTERFAZ DE USUARIO (COMPONENTES VISUALES)
 * ============================================================================
 */

const ProgressBar = ({ value, color }: { value: number; color: string }) => (
    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden mt-2">
        <div
            className={`h-full ${color} transition-all duration-1000 ease-out`}
            style={{ width: `${(value / 5) * 100}%` }}
        />
    </div>
);

const CardFactor = ({ factor }: { factor: FactorAnalisis }) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow mb-4 print:break-inside-avoid">
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${factor.color} bg-opacity-10 text-slate-700`}>
                    <factor.icono className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-lg">{factor.nombre}</h3>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-bold ${factor.color.replace('bg-', 'text-')} bg-opacity-10`}>
                {factor.score.toFixed(1)} / 5.0
            </span>
        </div>

        <ProgressBar value={factor.score} color={factor.color} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                <div className="flex items-center gap-2 mb-2 text-green-700 font-bold text-sm uppercase tracking-wide">
                    <CheckCircle className="w-4 h-4" /> Fortalezas
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{factor.fortaleza}</p>
            </div>

            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                <div className="flex items-center gap-2 mb-2 text-orange-700 font-bold text-sm uppercase tracking-wide">
                    <AlertTriangle className="w-4 h-4" /> Vulnerabilidad
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{factor.vulnerabilidad}</p>
            </div>
        </div>
    </div>
);

export function SelfEvaluationReport() {
    const { user } = useAuth();
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [loading, setLoading] = useState(true);
    const componentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (user) {
            loadEvaluationData();
        }
    }, [user]);

    const loadEvaluationData = async () => {
        try {
            setLoading(true);
            const { data: evaluations, error } = await supabase
                .from('evaluations')
                .select(`
                    id,
                    created_at,
                    responses:evaluation_responses(
                        response_value,
                        question:evaluation_questions(
                            id,
                            question_text,
                            section:evaluation_sections(id, title)
                        )
                    )
                `)
                .eq('evaluated_id', user?.id)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;

            if (evaluations && evaluations.length > 0) {
                const evalData = evaluations[0];
                const responses = evalData.responses || [];

                // Aggregate scores by section
                const sectionScores: Record<string, { total: number; count: number }> = {};

                responses.forEach((r: any) => {
                    const sectionTitle = r.question?.section?.title || 'General';
                    let key = 'general';
                    const lowerTitle = sectionTitle.toLowerCase();
                    if (lowerTitle.includes('integridad') || lowerTitle.includes('ética')) key = 'integridad';
                    else if (lowerTitle.includes('equipo') || lowerTitle.includes('colaboración')) key = 'trabajoEquipo';
                    else if (lowerTitle.includes('institucional')) key = 'institucional';
                    else if (lowerTitle.includes('resultados') || lowerTitle.includes('innovación')) key = 'orientacionResultados';
                    else if (lowerTitle.includes('liderazgo')) key = 'liderazgo';
                    else if (lowerTitle.includes('calidad')) key = 'calidadTrabajo';
                    else if (lowerTitle.includes('comunicación')) key = 'comunicacion';
                    else key = sectionTitle;

                    if (!sectionScores[key]) sectionScores[key] = { total: 0, count: 0 };
                    sectionScores[key].total += Number(r.response_value) || 0;
                    sectionScores[key].count += 1;
                });

                const puntajes: any = {};
                Object.entries(sectionScores).forEach(([key, val]) => {
                    puntajes[key] = Number((val.total / val.count).toFixed(1));
                });

                // Ensure all required keys exist with defaults
                const finalPuntajes = {
                    integridad: puntajes.integridad || 0,
                    trabajoEquipo: puntajes.trabajoEquipo || 0,
                    institucional: puntajes.institucional || 0,
                    comunicacion: puntajes.comunicacion || puntajes.liderazgo || 0, // Fallback
                    orientacionResultados: puntajes.orientacionResultados || 0,
                    calidadTrabajo: puntajes.calidadTrabajo || 0
                };

                setInputData({
                    evaluado: {
                        nombre: user!.full_name || 'Colaborador',
                        rol: user!.role || 'Analista',
                        fecha: new Date(evalData.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                    },
                    puntajes: finalPuntajes
                });
            } else {
                setInputData(null);
            }
        } catch (error) {
            console.error('Error loading evaluation:', error);
        } finally {
            setLoading(false);
        }
    };

    const informe = useMemo(() => {
        if (!inputData) return null;
        return generarInformeIA(inputData);
    }, [inputData]);

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="p-8 text-center">Generando análisis de IA...</div>;

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800">No hay informe disponible</h2>
            <p className="text-gray-600 mt-2">Debes completar una autoevaluación para ver tu informe de desempeño.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-20">

            {/* --- HEADER DEL INFORME --- */}
            <header className="bg-slate-900 text-white pt-16 pb-24 px-6 md:px-12 relative overflow-hidden print:pt-8 print:pb-12">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-3xl opacity-20 -mr-20 -mt-20 print:hidden"></div>
                <div className="max-w-5xl mx-auto relative z-10">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm tracking-wider uppercase mb-4">
                        <FileText className="w-4 h-4" /> Informe Confidencial de Desempeño
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold mb-2">{inputData.evaluado.nombre}</h1>
                    <p className="text-slate-400 text-lg flex items-center gap-4">
                        <span>{inputData.evaluado.rol}</span>
                        <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                        <span>{inputData.evaluado.fecha}</span>
                    </p>

                    <div className="absolute top-10 right-10 hidden md:block text-right print:block">
                        <div className="text-slate-500 text-xs uppercase tracking-widest mb-1">Evaluado por</div>
                        <div className="font-semibold text-slate-300">Sistema Neural de Análisis Psicológico</div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-4 md:px-8 -mt-16 relative z-20 print:mt-0">

                {/* --- TARJETAS KPI --- */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10 print:break-inside-avoid">

                    {/* KPI 1: Puntaje Global */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 flex flex-col justify-between print:shadow-none print:border">
                        <div>
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">Puntaje Ponderado</div>
                            <div className="flex items-baseline gap-2">
                                <span className="text-5xl font-extrabold text-slate-900">{informe.meta.puntajeGlobal}</span>
                                <span className="text-slate-400 font-medium">/ 5.0</span>
                            </div>
                        </div>
                        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold w-fit">
                            <Award className="w-4 h-4" /> {informe.meta.nivelGlobal}
                        </div>
                    </div>

                    {/* KPI 2: Arquetipo */}
                    <div className="bg-white p-6 rounded-xl shadow-lg border border-slate-100 md:col-span-2 flex items-center gap-6 print:shadow-none print:border">
                        <div className="text-6xl bg-slate-50 w-24 h-24 flex items-center justify-center rounded-2xl shadow-inner">
                            {informe.meta.arquetipo.icono}
                        </div>
                        <div>
                            <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">Perfil Psicolaboral Obtenido</div>
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">{informe.meta.arquetipo.nombre}</h2>
                            <p className="text-slate-600 text-sm leading-relaxed">{informe.meta.arquetipo.descripcion}</p>
                        </div>
                    </div>

                </div>

                {/* --- RESUMEN EJECUTIVO --- */}
                <section className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 mb-10 print:break-inside-avoid print:shadow-none print:border">
                    <h3 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Brain className="w-5 h-5 text-blue-600" />
                        Resumen Ejecutivo IA
                    </h3>
                    <p className="text-slate-700 text-lg leading-relaxed border-l-4 border-blue-500 pl-6 italic">
                        "{informe.resumenEjecutivo}"
                    </p>
                </section>

                {/* --- DETALLE DE FACTORES --- */}
                <section className="mb-12">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-slate-900">Análisis Detallado por Factores</h2>
                        {/* Hidden on print */}
                        <button className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1 transition-colors print:hidden">
                            <BarChart3 className="w-4 h-4" /> Ver Gráfica Radar
                        </button>
                    </div>

                    <div className="space-y-4">
                        {informe.factores.map((factor) => (
                            <CardFactor key={factor.id} factor={factor} />
                        ))}
                    </div>
                </section>

                {/* --- DIAGNÓSTICO Y RECOMENDACIONES --- */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:break-before-page">

                    {/* Columna Izquierda: Diagnóstico Oscuro */}
                    <div className="bg-slate-900 text-white p-8 rounded-xl shadow-xl flex flex-col justify-center print:bg-slate-800 print:text-white">
                        <div className="text-amber-400 font-bold text-sm tracking-wider uppercase mb-6 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" /> Diagnóstico Sintético
                        </div>
                        <p className="text-2xl font-serif italic leading-normal text-slate-200">
                            "{informe.diagnosticoIA}"
                        </p>
                        <div className="mt-8 pt-6 border-t border-slate-700">
                            <p className="text-sm text-slate-500 uppercase tracking-widest">Acción Prioritaria</p>
                            <p className="text-white font-semibold mt-1">Plan de Desarrollo en Innovación</p>
                        </div>
                    </div>

                    {/* Columna Derecha: Recomendaciones */}
                    <div className="lg:col-span-2">
                        <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-2">
                            <Target className="w-6 h-6 text-amber-500" />
                            Recomendaciones Estratégicas
                        </h2>

                        <div className="grid gap-4">
                            {informe.recomendaciones.map((rec) => (
                                <div key={rec.id} className="bg-white p-6 rounded-xl border-l-4 border-amber-400 shadow-sm hover:shadow-md transition-shadow print:shadow-none print:border">
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="font-bold text-slate-800 text-lg">{rec.id} | {rec.titulo}</h4>
                                        <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide">
                                            {rec.tipo}
                                        </span>
                                    </div>
                                    <p className="text-slate-600">{rec.descripcion}</p>
                                </div>
                            ))}

                            {/* Fallback si no hay recomendaciones críticas */}
                            {informe.recomendaciones.length === 0 && (
                                <div className="bg-green-50 p-6 rounded-xl border border-green-200 text-center">
                                    <p className="text-green-800 font-medium">No se detectaron brechas críticas que requieran intervención inmediata. Se sugiere mantener el plan de carrera actual.</p>
                                </div>
                            )}
                        </div>
                    </div>

                </section>

                {/* --- FOOTER --- */}
                <div className="mt-20 pt-10 border-t border-slate-200 text-center text-slate-500 text-sm print:break-inside-avoid">
                    <p>© 2025 Sistema de Evaluación de Desempeño PRISMA. Documento Confidencial.</p>
                    <button
                        onClick={handlePrint}
                        className="mt-4 inline-flex items-center gap-2 text-slate-400 hover:text-slate-800 transition-colors print:hidden"
                    >
                        <Printer className="w-4 h-4" /> Imprimir Informe PDF
                    </button>
                </div>

            </main>
        </div>
    );
}


import { useEffect, useState, useMemo } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { supabase } from '../lib/supabase';
import { generarInformeIA, EvaluacionInput } from '../lib/ai-report-logic';
import { AiReportRenderer } from '../components/AiReportRenderer';

interface TechnicalReportViewerProps {
    evaluationId?: string;
}

export function TechnicalReportViewer({ evaluationId: propId }: TechnicalReportViewerProps) {
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [loading, setLoading] = useState(true);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const [currentMessage, setCurrentMessage] = useState(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Get ID from props or URL params
    const evaluationId = useMemo(() => {
        if (propId) return propId;
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }, [propId]);

    const messages = [
        "Iniciando análisis neural técnico...",
        "Conectando con base de datos Prisma...",
        "Cargando perfiles de evaluación...",
        "Procesando métricas de integridad...",
        "Analizando patrones de liderazgo...",
        "Evaluando competencias institucionales...",
        "Calculando indicadores de rendimiento...",
        "Comparando con benchmarks globales...",
        "Generando insights estratégicos...",
        "Sintetizando recomendaciones...",
        "Validando coherencia de datos...",
        "Estructurando informe ejecutivo...",
        "Optimizando visualización de resultados...",
        "Finalizando procesamiento neural...",
        "Preparando interfaz de usuario..."
    ];

    useEffect(() => {
        const totalDuration = 5000;
        const messageInterval = totalDuration / messages.length;

        const timer = setInterval(() => {
            setCurrentMessage(prev => {
                if (prev < messages.length - 1) return prev + 1;
                return prev;
            });
        }, messageInterval);

        const totalTimer = setTimeout(() => {
            setMinTimeElapsed(true);
        }, totalDuration);

        return () => {
            clearInterval(timer);
            clearTimeout(totalTimer);
        };
    }, []);

    useEffect(() => {
        if (evaluationId) {
            loadEvaluationData(evaluationId);
        } else {
            setLoading(false);
            setErrorMsg("No se especificó una evaluación.");
        }
    }, [evaluationId]);

    const loadEvaluationData = async (id: string) => {
        try {
            setLoading(true);

            // 1. Fetch Specific Evaluation
            const { data: evaluation, error } = await supabase
                .from('evaluations')
                .select(`
                    id,
                    created_at,
                    evaluated:users!evaluated_id(full_name, role),
                    evaluator:users!evaluator_id(full_name, role),
                    template:evaluation_templates(name, type),
                    responses:evaluation_responses(
                        response_value,
                        question:evaluation_questions(
                            id,
                            question_text,
                            section:evaluation_sections(id, title)
                        )
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            if (!evaluation) throw new Error("Evaluación no encontrada");

            // 2. Fetch Comparative Data (All completed evaluations)
            const { data: allEvaluations } = await supabase
                .from('evaluations')
                .select(`
                    responses:evaluation_responses(
                        response_value,
                        question:evaluation_questions(
                            section:evaluation_sections(title)
                        )
                    )
                `)
                .eq('status', 'completed');

            // Helper to map section titles to keys based on report type context
            // Note: This mapping needs to be robust enough to handle variations in section titles
            const mapSectionToKey = (title: string) => {
                const lowerTitle = title.toLowerCase();

                // Common mappings
                if (lowerTitle.includes('integridad') || lowerTitle.includes('ética') || lowerTitle.includes('etica')) return 'integridad';
                if (lowerTitle.includes('equipo') || lowerTitle.includes('colaboración') || lowerTitle.includes('colaboracion')) return 'trabajoEquipo';
                if (lowerTitle.includes('institucional') || lowerTitle.includes('compromiso')) return 'institucional';
                if (lowerTitle.includes('resultados') || lowerTitle.includes('logro') || lowerTitle.includes('innovación') || lowerTitle.includes('innovacion')) return 'orientacionResultados';
                if (lowerTitle.includes('calidad') || lowerTitle.includes('excelencia') || lowerTitle.includes('técnica') || lowerTitle.includes('tecnica')) return 'calidadTrabajo';
                if (lowerTitle.includes('comunicación') || lowerTitle.includes('comunicacion') || lowerTitle.includes('asertividad')) return 'comunicacion';

                // Fallback or specific mappings
                if (lowerTitle.includes('liderazgo')) return 'comunicacion'; // Map leadership to communication or separate if needed

                return 'general';
            };

            // Process User Scores
            const sectionScores: Record<string, { total: number; count: number }> = {};
            evaluation.responses?.forEach((r: any) => {
                const title = r.question?.section?.title || 'General';
                const key = mapSectionToKey(title);
                if (!sectionScores[key]) sectionScores[key] = { total: 0, count: 0 };
                sectionScores[key].total += Number(r.response_value) || 0;
                sectionScores[key].count += 1;
            });

            const puntajes: any = {};
            Object.entries(sectionScores).forEach(([key, val]) => {
                puntajes[key] = Number((val.total / val.count).toFixed(1));
            });

            // Process Comparative Scores
            const compScores: Record<string, { total: number; count: number }> = {};
            if (allEvaluations) {
                allEvaluations.forEach(ev => {
                    ev.responses?.forEach((r: any) => {
                        const title = r.question?.section?.title || 'General';
                        const key = mapSectionToKey(title);
                        if (!compScores[key]) compScores[key] = { total: 0, count: 0 };
                        compScores[key].total += Number(r.response_value) || 0;
                        compScores[key].count += 1;
                    });
                });
            }

            const comparativePuntajes: any = {};
            Object.entries(compScores).forEach(([key, val]) => {
                comparativePuntajes[key] = Number((val.total / val.count).toFixed(1));
            });

            // Ensure all required keys exist with defaults
            // We use 0 as default, but logic should handle missing values gracefully
            const finalPuntajes = {
                integridad: puntajes.integridad || 0,
                trabajoEquipo: puntajes.trabajoEquipo || 0,
                institucional: puntajes.institucional || 0,
                comunicacion: puntajes.comunicacion || 0,
                orientacionResultados: puntajes.orientacionResultados || 0,
                calidadTrabajo: puntajes.calidadTrabajo || 0
            };

            const finalComparativePuntajes = {
                integridad: comparativePuntajes.integridad || 0,
                trabajoEquipo: comparativePuntajes.trabajoEquipo || 0,
                institucional: comparativePuntajes.institucional || 0,
                comunicacion: comparativePuntajes.comunicacion || 0,
                orientacionResultados: comparativePuntajes.orientacionResultados || 0,
                calidadTrabajo: comparativePuntajes.calidadTrabajo || 0
            };

            const evaluadoUser = (evaluation as any).evaluated; // users table join
            const evaluatorUser = (evaluation as any).evaluator;
            const template = (evaluation as any).template;

            // Determine Report Type
            let tipoInforme: 'autoevaluacion' | 'lider_a_colaborador' | 'otro' = 'otro';
            const tName = (template?.name || '').toLowerCase();
            const tType = (template?.type || '').toLowerCase();

            if (tType === 'self' || tName.includes('autoevaluación') || tName.includes('autoevaluacion')) {
                tipoInforme = 'autoevaluacion';
            } else if (tType === 'manager_to_employee' || tName.includes('líder') || tName.includes('lider')) {
                tipoInforme = 'lider_a_colaborador';
            }

            // Determine Evaluator Name to Display
            let evaluadorNombre = 'Sistema Neural de Análisis Prisma UDES';
            if (tipoInforme === 'lider_a_colaborador') {
                evaluadorNombre = evaluatorUser?.full_name || 'Líder Evaluador';
            }

            setInputData({
                evaluado: {
                    nombre: evaluadoUser?.full_name || 'Colaborador',
                    rol: evaluadoUser?.role || 'Analista',
                    fecha: new Date(evaluation.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                },
                tipoInforme,
                evaluadorNombre,
                puntajes: finalPuntajes,
                comparativeScores: finalComparativePuntajes
            });

        } catch (error: any) {
            console.error('Error loading evaluation:', error);
            setErrorMsg(error.message || "Error al cargar el reporte.");
        } finally {
            setLoading(false);
        }
    };

    const informe = useMemo(() => {
        if (!inputData) return null;
        return generarInformeIA(inputData);
    }, [inputData]);

    if (loading || !minTimeElapsed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
                <div className="w-64 h-64 mb-4">
                    <DotLottieReact
                        src="https://lottie.host/17ecbaa8-0f9f-46c0-81d3-3a02d04b506e/wVxA7W8L22.lottie"
                        loop
                        autoplay
                    />
                </div>
                <div className="text-slate-600 font-medium text-lg animate-pulse">
                    {messages[currentMessage]}
                </div>
                <div className="mt-4 w-64 h-1 bg-slate-200 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-300 ease-out"
                        style={{ width: `${((currentMessage + 1) / messages.length) * 100}%` }}
                    />
                </div>
            </div>
        );
    }

    if (errorMsg) return (
        <div className="p-8 text-center bg-white rounded-lg shadow min-h-screen flex items-center justify-center">
            <div>
                <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
                <p className="text-gray-600">{errorMsg}</p>
            </div>
        </div>
    );

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow min-h-screen flex items-center justify-center">
            <h2 className="text-xl font-bold text-gray-800">No hay datos disponibles</h2>
        </div>
    );

    return <AiReportRenderer inputData={inputData} informe={informe} />;
}

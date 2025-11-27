
import { useEffect, useState, useMemo } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generarInformeIA, EvaluacionInput } from '../lib/ai-report-logic';
import { AiReportRenderer } from '../components/AiReportRenderer';

export function SelfEvaluationReport() {
    const { user } = useAuth();
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [loading, setLoading] = useState(true);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);
    const [currentMessage, setCurrentMessage] = useState(0);

    const messages = [
        "Iniciando análisis neural...",
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
        if (user) {
            loadEvaluationData();
        }
    }, [user]);

    const loadEvaluationData = async () => {
        try {
            setLoading(true);

            // 1. Fetch User Evaluation
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

            if (evaluations && evaluations.length > 0) {
                const evalData = evaluations[0];

                // Helper to map section titles to keys
                const mapSectionToKey = (title: string) => {
                    const lowerTitle = title.toLowerCase();
                    if (lowerTitle.includes('integridad') || lowerTitle.includes('ética')) return 'integridad';
                    if (lowerTitle.includes('equipo') || lowerTitle.includes('colaboración')) return 'trabajoEquipo';
                    if (lowerTitle.includes('institucional')) return 'institucional';
                    if (lowerTitle.includes('resultados') || lowerTitle.includes('innovación')) return 'orientacionResultados';
                    if (lowerTitle.includes('liderazgo')) return 'liderazgo';
                    if (lowerTitle.includes('calidad')) return 'calidadTrabajo';
                    if (lowerTitle.includes('comunicación')) return 'comunicacion';
                    return 'general';
                };

                // Process User Scores
                const sectionScores: Record<string, { total: number; count: number }> = {};
                evalData.responses?.forEach((r: any) => {
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
                const finalPuntajes = {
                    integridad: puntajes.integridad || 0,
                    trabajoEquipo: puntajes.trabajoEquipo || 0,
                    institucional: puntajes.institucional || 0,
                    comunicacion: puntajes.comunicacion || puntajes.liderazgo || 0,
                    orientacionResultados: puntajes.orientacionResultados || 0,
                    calidadTrabajo: puntajes.calidadTrabajo || 0
                };

                const finalComparativePuntajes = {
                    integridad: comparativePuntajes.integridad || 0,
                    trabajoEquipo: comparativePuntajes.trabajoEquipo || 0,
                    institucional: comparativePuntajes.institucional || 0,
                    comunicacion: comparativePuntajes.comunicacion || comparativePuntajes.liderazgo || 0,
                    orientacionResultados: comparativePuntajes.orientacionResultados || 0,
                    calidadTrabajo: comparativePuntajes.calidadTrabajo || 0
                };

                setInputData({
                    evaluado: {
                        nombre: user!.full_name || 'Colaborador',
                        rol: user!.role || 'Analista',
                        fecha: new Date(evalData.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                    },
                    puntajes: finalPuntajes,
                    comparativeScores: finalComparativePuntajes,
                    tipoInforme: 'autoevaluacion'
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

    if (loading || !minTimeElapsed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] bg-slate-50">
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

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800">No hay informe disponible</h2>
            <p className="text-gray-600 mt-2">Debes completar una autoevaluación para ver tu informe de desempeño.</p>
        </div>
    );

    return <AiReportRenderer inputData={inputData} informe={informe} />;
}

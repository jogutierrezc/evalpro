
import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { generarInformeIA, EvaluacionInput } from '../lib/ai-report-logic';
import { AiReportRenderer } from '../components/AiReportRenderer';

export function SelfEvaluationReport() {
    const { user } = useAuth();
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [loading, setLoading] = useState(true);

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

    if (loading) return <div className="p-8 text-center">Generando análisis de IA...</div>;

    if (!inputData || !informe) return (
        <div className="p-8 text-center bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold text-gray-800">No hay informe disponible</h2>
            <p className="text-gray-600 mt-2">Debes completar una autoevaluación para ver tu informe de desempeño.</p>
        </div>
    );

    return <AiReportRenderer inputData={inputData} informe={informe} />;
}

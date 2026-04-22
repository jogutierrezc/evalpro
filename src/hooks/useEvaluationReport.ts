import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EvaluacionInput, TipoExamenVaf } from '../lib/ai-report-logic';

interface UseEvaluationReportProps {
    evaluationId?: string;
    userId?: string; // If provided and no evaluationId, fetches latest self-evaluation
}

export function useEvaluationReport({ evaluationId, userId }: UseEvaluationReportProps) {
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [evaluationData, setEvaluationData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            let evaluationData = null;

            // 1. Fetch Evaluation Data
            if (evaluationId) {
                const { data, error } = await supabase
                    .from('evaluations')
                    .select(`
                        id,
                        created_at,
                        evaluated:users!evaluated_id(full_name, role),
                        evaluator:users!evaluator_id(full_name, role),
                        template:evaluation_templates(name, type),
                        results:evaluation_results(ai_analysis),
                        responses:evaluation_responses(
                            response_value,
                            question:evaluation_questions(
                                id,
                                question_text,
                                question_type,
                                section:evaluation_sections(id, title)
                            )
                        )
                    `)
                    .eq('id', evaluationId)
                    .single();

                if (error) throw error;
                evaluationData = data;
                setEvaluationData(data);
            } else if (userId) {
                const { data, error } = await supabase
                    .from('evaluations')
                    .select(`
                        id,
                        created_at,
                        evaluated:users!evaluated_id(full_name, role),
                        template:evaluation_templates(name, type),
                        results:evaluation_results(ai_analysis),
                        responses:evaluation_responses(
                            response_value,
                            question:evaluation_questions(
                                id,
                                question_text,
                                question_type,
                                section:evaluation_sections(id, title)
                            )
                        )
                    `)
                    .eq('evaluated_id', userId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                evaluationData = data;
                setEvaluationData(data);
            }

            if (!evaluationData) {
                setInputData(null);
                setLoading(false);
                return;
            }

            // 2. Fetch Comparative Data (All completed evaluations)
            // Note: For comparative data to be meaningful with dynamic sections, 
            // we ideally need to aggregate by the SAME section names.
            const { data: allEvaluations } = await supabase
                .from('evaluations')
                .select(`
                    responses:evaluation_responses(
                        response_value,
                        question:evaluation_questions(
                            question_type,
                            section:evaluation_sections(title)
                        )
                    )
                `)
                .eq('status', 'completed');

            // Helper to handle jsonb values
            const normalizeValue = (val: any): number => {
                if (val === null || val === undefined) return 0;
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    const parsed = parseFloat(val);
                    return isNaN(parsed) ? 0 : parsed;
                }
                if (typeof val === 'object') {
                    // Start digging
                    return Number(val.value || val.rating || val.score || val.response || 0);
                }
                return 0;
            };

            // Process User Scores - Aggregating by RAW Section Title
            const sectionScores: Record<string, { total: number; count: number }> = {};

            console.log('[EvalPro Debug] Processing responses:', evaluationData.responses?.length);

            evaluationData.responses?.forEach((r: any) => {
                const qType = r.question?.question_type;
                const title = r.question?.section?.title || 'General';
                const numericVal = normalizeValue(r.response_value);

                // Ignore non-rating questions and any questions with a value of 0 or empty
                // In a 1-5 scale, 0 is an unanswered question and shouldn't drag down the average
                if (numericVal === 0) return;

                // We use the raw title to allow the AI logic to detect the dimension dynamically
                // or display the custom section name if no dimension matches.
                if (!sectionScores[title]) sectionScores[title] = { total: 0, count: 0 };
                sectionScores[title].total += numericVal;
                sectionScores[title].count += 1;
            });

            console.log('[EvalPro Debug] Section Scores:', sectionScores);

            const puntajes: Record<string, number> = {};
            Object.entries(sectionScores).forEach(([key, val]) => {
                puntajes[key] = val.count > 0 ? Number((val.total / val.count).toFixed(1)) : 0;
            });

            // Process Comparative Scores - Also by RAW Section Title
            const compScores: Record<string, { total: number; count: number }> = {};
            if (allEvaluations) {
                allEvaluations.forEach(ev => {
                    ev.responses?.forEach((r: any) => {
                        // Same normalization for comparative
                        const qType = r.question?.question_type;
                        const numericVal = normalizeValue(r.response_value);
                        if (qType && qType !== 'rating' && numericVal === 0) return;

                        const title = r.question?.section?.title || 'General';
                        if (!compScores[title]) compScores[title] = { total: 0, count: 0 };
                        compScores[title].total += numericVal;
                        compScores[title].count += 1;
                    });
                });
            }

            const comparativePuntajes: Record<string, number> = {};
            Object.entries(compScores).forEach(([key, val]) => {
                comparativePuntajes[key] = val.count > 0 ? Number((val.total / val.count).toFixed(1)) : 0;
            });

            // Determine Report Type
            let tipoInforme: TipoExamenVaf = 'AUTOEVALUACION';
            const template = (evaluationData as any).template;
            const tName = (template?.name || '').toLowerCase();
            const tType = (template?.type || '').toLowerCase();

            if (tName.includes('vaf') || tName.includes('equipo') || tName.includes('personal') || tName.includes('auxiliar')) {
                if (tName.includes('lider') && tName.includes('colaborador')) {
                    tipoInforme = 'LIDERAZGO_TACTICO';
                } else if (tName.includes('lider') || tName.includes('jefe') || tName.includes('coordinador')) {
                    tipoInforme = 'LIDER_ESTRATEGICO';
                } else {
                    tipoInforme = 'EQUIPO_OPERATIVO';
                }
            } else if (tType === 'self' || tName.includes('autoevaluación') || tName.includes('autoevaluacion')) {
                tipoInforme = 'AUTOEVALUACION';
            } else if (tType === 'manager_to_employee' || tName.includes('líder') || tName.includes('lider') || tName.includes('evaluador')) {
                tipoInforme = 'LIDERAZGO_TACTICO';
            }

            const evaluadoUser = (evaluationData as any).evaluated;
            const evaluatorUser = (evaluationData as any).evaluator;

            let evaluadorNombre = 'Sistema Neural de Análisis Prisma UDES';
            if (tipoInforme === 'LIDERAZGO_TACTICO') {
                evaluadorNombre = evaluatorUser?.full_name || 'Líder Evaluador';
            }

            setInputData({
                evaluado: {
                    nombre: evaluadoUser?.full_name || 'Colaborador',
                    rol: evaluadoUser?.role || 'Analista',
                    fecha: new Date(evaluationData.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                },
                tipoInforme,
                evaluadorNombre,
                puntajes, // Dynamic keys now
                comparativeScores: comparativePuntajes
            });

        } catch (err: any) {
            console.error('Error loading evaluation report:', err);
            setError(err.message || "Error al cargar el reporte.");
        } finally {
            setLoading(false);
        }
    }, [evaluationId, userId]);

    useEffect(() => {
        if (evaluationId || userId) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [loadData, evaluationId, userId]);

    return { inputData, rawEvaluation: evaluationData, loading, error, reload: loadData };
}

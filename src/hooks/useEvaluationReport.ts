import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EvaluacionInput, TipoExamenVaf } from '../lib/ai-report-logic';

interface UseEvaluationReportProps {
    evaluationId?: string;
    userId?: string; // If provided and no evaluationId, fetches latest self-evaluation
    periodId?: string; // Filter evaluations by period
}

export function useEvaluationReport({ evaluationId, userId, periodId }: UseEvaluationReportProps) {
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [evaluationData, setEvaluationData] = useState<any | null>(null);
    const [availableEvaluations, setAvailableEvaluations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            let currentEval = null;

            // 1. Fetch ALL available evaluations for this user to allow switching
            if (userId) {
                let listQuery = supabase
                    .from('evaluations')
                    .select(`
                        id,
                        evaluator_id,
                        evaluated_id,
                        created_at,
                        status,
                        template:evaluation_templates(name, type),
                        evaluator:users!evaluator_id(full_name),
                        evaluated:users!evaluated_id(full_name)
                    `)
                    .or(`evaluated_id.eq.${userId},evaluator_id.eq.${userId}`)
                    .eq('status', 'completed');

                if (periodId && periodId !== 'all') {
                    listQuery = listQuery.eq('period_id', periodId);
                }

                const { data: allEvals, error: listError } = await listQuery
                    .order('created_at', { ascending: false });

                if (!listError && allEvals) {
                    setAvailableEvaluations(allEvals);
                }
            }

            // 2. Fetch specific or latest evaluation data
            let targetId = evaluationId;
            if (!targetId && userId) {
                let latestQuery = supabase
                    .from('evaluations')
                    .select('id')
                    .eq('evaluated_id', userId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1);
                
                if (periodId && periodId !== 'all') {
                    latestQuery = latestQuery.eq('period_id', periodId);
                }
                
                const { data: latest } = await latestQuery.maybeSingle();
                targetId = latest?.id;
            }

            if (targetId) {
                const { data, error } = await supabase
                    .from('evaluations')
                    .select(`
                        id,
                        created_at,
                        evaluated:users!evaluated_id(full_name, role),
                        evaluator:users!evaluator_id(full_name, role),
                        template:evaluation_templates(name, type),
                        results:evaluation_results(overall_score, category_scores, ai_analysis, recommendations),
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
                    .eq('id', targetId)
                    .single();

                if (error) throw error;
                currentEval = data;
                setEvaluationData(data);
            }

            if (!currentEval) {
                setInputData(null);
                setLoading(false);
                return;
            }

            // 3. Fetch Comparative Data (All completed evaluations)
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
                if (val === null || val === undefined || val === '') return 0;
                if (typeof val === 'number') return val;
                if (typeof val === 'string') {
                    const parsed = parseFloat(val.replace(',', '.'));
                    return isNaN(parsed) ? 0 : parsed;
                }
                if (typeof val === 'object') {
                    return Number(val.value || val.rating || val.score || val.response || 0);
                }
                return 0;
            };

            // Process User Scores
            const sectionScores: Record<string, { total: number; count: number }> = {};
            currentEval.responses?.forEach((r: any) => {
                const title = r.question?.section?.title || 'General';
                const numericVal = normalizeValue(r.response_value);
                if (numericVal === 0) return;
                if (!sectionScores[title]) sectionScores[title] = { total: 0, count: 0 };
                sectionScores[title].total += numericVal;
                sectionScores[title].count += 1;
            });

            const puntajes: Record<string, number> = {};
            Object.entries(sectionScores).forEach(([key, val]) => {
                puntajes[key] = val.count > 0 ? Number((val.total / val.count).toFixed(1)) : 0;
            });

            // Process Comparative Scores
            const compScores: Record<string, { total: number; count: number }> = {};
            if (allEvaluations) {
                allEvaluations.forEach(ev => {
                    ev.responses?.forEach((r: any) => {
                        const numericVal = normalizeValue(r.response_value);
                        const qType = r.question?.question_type;
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
            const template = (currentEval as any).template;
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

            const evaluadoUser = (currentEval as any).evaluated;
            const evaluatorUser = (currentEval as any).evaluator;

            let evaluadorNombre = 'Sistema Neural de Análisis Prisma UDES';
            if (tipoInforme === 'LIDERAZGO_TACTICO') {
                evaluadorNombre = evaluatorUser?.full_name || 'Líder Evaluador';
            }

            setInputData({
                evaluado: {
                    nombre: evaluadoUser?.full_name || 'Colaborador',
                    rol: evaluadoUser?.role || 'Analista',
                    fecha: new Date(currentEval.created_at).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
                },
                tipoInforme,
                evaluadorNombre,
                puntajes,
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

    return { inputData, rawEvaluation: evaluationData, availableEvaluations, loading, error, reload: loadData };
}

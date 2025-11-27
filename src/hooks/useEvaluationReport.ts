import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { EvaluacionInput } from '../lib/ai-report-logic';

interface UseEvaluationReportProps {
    evaluationId?: string;
    userId?: string; // If provided and no evaluationId, fetches latest self-evaluation
}

export function useEvaluationReport({ evaluationId, userId }: UseEvaluationReportProps) {
    const [inputData, setInputData] = useState<EvaluacionInput | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const mapSectionToKey = useCallback((title: string) => {
        const lowerTitle = title.toLowerCase();

        // Integridad y Ética
        if (lowerTitle.match(/integridad|ética|etica|valores|honestidad|moral/)) return 'integridad';

        // Trabajo en Equipo
        if (lowerTitle.match(/equipo|colaboración|colaboracion|interpersonal|relaciones|compañerismo/)) return 'trabajoEquipo';

        // Compromiso Institucional
        if (lowerTitle.match(/institucional|compromiso|pertenencia|identidad|cultura|normas/)) return 'institucional';

        // Comunicación
        if (lowerTitle.match(/comunicación|comunicacion|asertividad|expresión|expresion|escucha|liderazgo/)) return 'comunicacion';

        // Orientación a Resultados
        if (lowerTitle.match(/resultados|logro|objetivos|metas|desempeño|innovacion|innovación|proactividad/)) return 'orientacionResultados';

        // Calidad del Trabajo
        if (lowerTitle.match(/calidad|excelencia|técnica|tecnica|rigor|detalle|profesionalismo|conocimiento/)) return 'calidadTrabajo';

        return 'general';
    }, []);

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
                        responses:evaluation_responses(
                            response_value,
                            question:evaluation_questions(
                                id,
                                question_text,
                                section:evaluation_sections(id, title)
                            )
                        )
                    `)
                    .eq('id', evaluationId)
                    .single();

                if (error) throw error;
                evaluationData = data;
            } else if (userId) {
                const { data, error } = await supabase
                    .from('evaluations')
                    .select(`
                        id,
                        created_at,
                        evaluated:users!evaluated_id(full_name, role),
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
                    .eq('evaluated_id', userId)
                    .eq('status', 'completed')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (error) throw error;
                evaluationData = data;
            }

            if (!evaluationData) {
                setInputData(null);
                setLoading(false);
                return;
            }

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

            // Process User Scores
            const sectionScores: Record<string, { total: number; count: number }> = {};
            evaluationData.responses?.forEach((r: any) => {
                const title = r.question?.section?.title || 'General';
                const key = mapSectionToKey(title);
                if (key === 'general') return; // Skip unmapped for now, or maybe log it

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
                        if (key === 'general') return;

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

            // Determine Report Type
            let tipoInforme: 'autoevaluacion' | 'lider_a_colaborador' | 'otro' = 'otro';
            const template = (evaluationData as any).template;
            const tName = (template?.name || '').toLowerCase();
            const tType = (template?.type || '').toLowerCase();

            if (tType === 'self' || tName.includes('autoevaluación') || tName.includes('autoevaluacion')) {
                tipoInforme = 'autoevaluacion';
            } else if (tType === 'manager_to_employee' || tName.includes('líder') || tName.includes('lider') || tName.includes('evaluador')) {
                tipoInforme = 'lider_a_colaborador';
            }

            const evaluadoUser = (evaluationData as any).evaluated;
            const evaluatorUser = (evaluationData as any).evaluator;

            let evaluadorNombre = 'Sistema Neural de Análisis Prisma UDES';
            if (tipoInforme === 'lider_a_colaborador') {
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
                puntajes: finalPuntajes,
                comparativeScores: finalComparativePuntajes
            });

        } catch (err: any) {
            console.error('Error loading evaluation report:', err);
            setError(err.message || "Error al cargar el reporte.");
        } finally {
            setLoading(false);
        }
    }, [evaluationId, userId, mapSectionToKey]);

    useEffect(() => {
        if (evaluationId || userId) {
            loadData();
        } else {
            setLoading(false);
        }
    }, [loadData, evaluationId, userId]);

    return { inputData, loading, error, reload: loadData };
}

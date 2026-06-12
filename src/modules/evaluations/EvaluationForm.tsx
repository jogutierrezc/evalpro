import { useState, useEffect } from 'react';
import { supabase, Evaluation, EvaluationQuestion } from '../../lib/supabase';
import { ArrowLeft, Save } from 'lucide-react';

interface EvaluationFormProps {
  evaluation: Evaluation;
  onClose: () => void;
}

export function EvaluationForm({ evaluation, onClose }: EvaluationFormProps) {
  const [questions, setQuestions] = useState<EvaluationQuestion[]>([]);
  const [groupedSections, setGroupedSections] = useState<{
    id: string | null;
    title: string;
    domain_key?: string | null;
    category?: string | null;
    questions: EvaluationQuestion[];
  }[]>([]);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [periodInfo, setPeriodInfo] = useState<{ year: number; start_date: string; end_date: string } | null>(null);

  useEffect(() => {
    loadQuestionsAndResponses();
  }, [evaluation.id]);

  const loadQuestionsAndResponses = async () => {
    try {
      const [questionsRes, responsesRes, sectionsRes] = await Promise.all([
        supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id).order('order_index'),
        supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
        supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id).order('order_index'),
      ]);

      if (questionsRes.error) throw questionsRes.error;
      if (responsesRes.error) throw responsesRes.error;

      const flatQuestions: EvaluationQuestion[] = questionsRes.data || [];
      setQuestions(flatQuestions);

      // build grouped sections for UI
      const sectionsData: any[] = sectionsRes.data || [];
      const sectionsOrder = sectionsData.map((s) => ({ id: s.id, title: s.title || 'Sección', domain_key: s.domain_key || null, category: s.category || null }));

      const grouped: { id: string | null; title: string; domain_key?: string | null; category?: string | null; questions: EvaluationQuestion[] }[] = [];

      // for each defined section keep order
      for (const sec of sectionsOrder) {
        const qs = flatQuestions.filter((q) => (q as any).section_id === sec.id);
        grouped.push({ id: sec.id, title: sec.title, domain_key: sec.domain_key, category: sec.category, questions: qs });
      }

      // orphan questions (no section) -> add as General at the end
      const orphanQs = flatQuestions.filter((q) => !(q as any).section_id);
      if (orphanQs.length > 0) {
        grouped.push({ id: null, title: 'General', domain_key: null, category: null, questions: orphanQs });
      }

      setGroupedSections(grouped);

      const responsesMap: Record<string, any> = {};
      responsesRes.data?.forEach((response) => {
        responsesMap[response.question_id] = response.response_value;
      });
      setResponses(responsesMap);

      // Auto-save restore: Load from localStorage if present and merge
      // We do this AFTER loading from DB so local changes (if newer/unsaved) take precedence
      try {
        const saved = localStorage.getItem(`eval_autosave_${evaluation.id}`);
        if (saved) {
          const localResponses = JSON.parse(saved);
          // Merge: prefer DB if auto-save is empty? No, prefer Local if it exists, assuming user was working on it.
          // However, if DB has data and Local has data, usually Local is "newer" if they navigated away.
          // Be safe: Merge local into DB responses.
          setResponses(prev => ({ ...prev, ...localResponses }));
          console.log('Restored auto-save data');
        }
      } catch (e) {
        console.warn('Error loading auto-save', e);
      }

      // Fetch period info if available
      if (evaluation.period_id) {
        const { data: pData } = await supabase
          .from('evaluation_periods')
          .select('year, start_date, end_date')
          .eq('id', evaluation.period_id)
          .single();
        if (pData) setPeriodInfo(pData);
      }

      if (evaluation.status === 'pending') {
        await supabase
          .from('evaluations')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', evaluation.id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save effect
  useEffect(() => {
    if (evaluation.id && Object.keys(responses).length > 0) {
      localStorage.setItem(`eval_autosave_${evaluation.id}`, JSON.stringify(responses));
    }
  }, [responses, evaluation.id]);

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSave = async (complete: boolean = false) => {
    // Pre-validation: Don't allow saving if there are no responses but there are questions
    if (questions.length > 0 && Object.keys(responses).length === 0) {
      alert('No se han detectado respuestas para guardar. Por favor responde al menos una pregunta.');
      return;
    }

    setSaving(true);

    try {
      const responsesToInsert = Object.entries(responses).map(([questionId, value]) => ({
        evaluation_id: evaluation.id,
        question_id: questionId,
        response_value: value,
      }));

      // Only delete and re-insert if we have data or if the form is empty
      if (questions.length > 0 && responsesToInsert.length === 0) {
        throw new Error('No hay respuestas para procesar.');
      }

      const { error: deleteError } = await supabase
        .from('evaluation_responses')
        .delete()
        .eq('evaluation_id', evaluation.id);
      
      if (deleteError) throw deleteError;

      if (responsesToInsert.length > 0) {
        const { error: responsesError } = await supabase
          .from('evaluation_responses')
          .insert(responsesToInsert);

        if (responsesError) throw responsesError;
      }

      if (complete) {
        const allAnswered = questions.every((q) => responses[q.id] !== undefined);
        if (!allAnswered) {
          alert('Por favor responde todas las preguntas antes de completar');
          setSaving(false);
          return;
        }

        await supabase
          .from('evaluations')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', evaluation.id);

        // Clear auto-save on completion
        localStorage.removeItem(`eval_autosave_${evaluation.id}`);

        // compute overall score: prefer category-weighted (global competencies weights) if possible,
        // otherwise fall back to the existing question-weighted calculation
        let overallScore: any = calculateOverallScore();

        // fetch sections once and reuse
        let sectionsList: any[] | undefined = undefined;
        try {
          const resSections = await supabase
            .from('evaluation_sections')
            .select('*')
            .eq('template_id', evaluation.template_id);
          sectionsList = resSections.data || [];

          const sectionCategoryMap: Record<string, string | null> = {};
          (sectionsList || []).forEach((s: any) => {
            sectionCategoryMap[s.id] = s.category || null;
          });

          // accumulate per-category weighted sums (by question weight) and counts
          const sumsWeightedCat: Record<string, number> = {};
          const weightsSumCat: Record<string, number> = {};
          const sumsRawCat: Record<string, number> = {};
          const countsCat: Record<string, number> = {};

          questions.forEach((q) => {
            if (q.question_type !== 'rating') return;
            const qid = q.id;
            const resp = responses[qid];
            const num = typeof resp === 'number' ? resp : Number(resp) || 0;
            const secId = (q as any).section_id;
            const catName = secId ? sectionCategoryMap[secId] : null;
            if (!catName) return;

            const w = Number((q as any).weight || 0);
            const key = String(catName || 'Sin categoría');
            if (w > 0) {
              sumsWeightedCat[key] = (sumsWeightedCat[key] || 0) + (num * w);
              weightsSumCat[key] = (weightsSumCat[key] || 0) + w;
            } else {
              sumsRawCat[key] = (sumsRawCat[key] || 0) + num;
              countsCat[key] = (countsCat[key] || 0) + 1;
            }
          });

          // compute per-category scores
          const categoryScoresByName: Record<string, number> = {};
          Object.keys({ ...sumsWeightedCat, ...sumsRawCat }).forEach((k) => {
            if (weightsSumCat[k] && weightsSumCat[k] > 0) {
              categoryScoresByName[k] = Number((sumsWeightedCat[k] / weightsSumCat[k]).toFixed(2));
            } else if (sumsRawCat[k]) {
              categoryScoresByName[k] = Number((sumsRawCat[k] / (countsCat[k] || 1)).toFixed(2));
            } else {
              categoryScoresByName[k] = 0;
            }
          });

          // predefined category weights (same used by CompetencyAnalysis)
          const CATEGORY_WEIGHTS: { name: string; weightPercent: number }[] = [
            { name: 'Integridad', weightPercent: 15 },
            { name: 'Compromiso con la calidad del trabajo', weightPercent: 16 },
            { name: 'Institucional', weightPercent: 16 },
            { name: 'Liderazgo o Empowerment', weightPercent: 20 },
            { name: 'Proactividad', weightPercent: 15 },
            { name: 'Orientación a los resultados con calidad', weightPercent: 18 },
          ];

          const normalize = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/gi, '').trim();

          // compute overall using category weights if any category matches
          let totalCategoryWeightUsed = 0;
          let weightedCategorySum = 0;
          for (const cw of CATEGORY_WEIGHTS) {
            // try to find a matching category key in categoryScoresByName
            const target = normalize(cw.name);
            const foundKey = Object.keys(categoryScoresByName).find((k) => normalize(k) === target || normalize(k).includes(target) || target.includes(normalize(k)));
            if (foundKey) {
              const catScore = categoryScoresByName[foundKey] || 0;
              weightedCategorySum += catScore * (cw.weightPercent / 100);
              totalCategoryWeightUsed += cw.weightPercent;
            }
          }

          if (totalCategoryWeightUsed > 0) {
            // normalize by total percent (should be 100 but guard anyway)
            overallScore = Number((weightedCategorySum / (totalCategoryWeightUsed / 100)).toFixed(2));
          }
        } catch (err) {
          console.error('Error computing overall by category weights:', err);
        }

        // compute category scores by section (attempt to map section titles to Goleman domains)
        let category_scores: Record<string, number> = {};
        try {
          // domain synonyms mapping (same keys used in IndividualAnalysis)
          const DOMAIN_KEYS: { key: string; synonyms: string[] }[] = [
            { key: 'autoconciencia', synonyms: ['autoconciencia', 'self_awareness', 'selfawareness', 'self-awareness', 'autoconsciencia'] },
            { key: 'autogestion', synonyms: ['autogestion', 'autogestión', 'self_management', 'selfmanagement', 'autocontrol'] },
            { key: 'conciencia_social', synonyms: ['conciencia_social', 'concienciasocial', 'conciencia social', 'social_awareness', 'empatía', 'empathy'] },
            { key: 'gestion_relaciones', synonyms: ['gestion_relaciones', 'gestión_relaciones', 'relationship_management', 'relationshipmanagement', 'gestion de relaciones', 'relationship'] },
          ];

          const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

          const sectionIdToDomainKey: Record<string, string> = {};
          (sectionsList || []).forEach((sec: any) => {
            // Prefer explicit domain_key set in the DB
            if (sec.domain_key) {
              sectionIdToDomainKey[sec.id] = String(sec.domain_key);
              return;
            }

            // fallback: try to infer from section title
            const title = sec.title || '';
            const nt = normalize(title);
            for (const d of DOMAIN_KEYS) {
              for (const syn of d.synonyms) {
                if (nt.includes(syn.replace(/[^a-z0-9]/g, ''))) {
                  sectionIdToDomainKey[sec.id] = d.key;
                  return;
                }
              }
            }
          });

          // fallback: if no mapping by section title, try to map by question text keywords

          // use weights if provided on questions; otherwise fallback to simple averages
          const sumsWeighted: Record<string, number> = {};
          const weightsSum: Record<string, number> = {};
          const sumsRaw: Record<string, number> = {};
          const counts: Record<string, number> = {};

          questions.forEach((q) => {
            if (q.question_type !== 'rating') return;
            const qid = q.id;
            const resp = responses[qid];
            const num = typeof resp === 'number' ? resp : Number(resp) || 0;
            const secId = (q as any).section_id;
            const domainKey = sectionIdToDomainKey[secId] || null;
            if (!domainKey) return;

            const w = Number((q as any).weight || 0);
            if (w > 0) {
              sumsWeighted[domainKey] = (sumsWeighted[domainKey] || 0) + (num * w);
              weightsSum[domainKey] = (weightsSum[domainKey] || 0) + w;
            } else {
              sumsRaw[domainKey] = (sumsRaw[domainKey] || 0) + num;
              counts[domainKey] = (counts[domainKey] || 0) + 1;
            }
          });

          // populate all domains with computed averages (0 if none)
          const allDomainKeys = DOMAIN_KEYS.map((d) => d.key);
          allDomainKeys.forEach((k) => {
            if (weightsSum[k] && weightsSum[k] > 0) {
              category_scores[k] = Number((sumsWeighted[k] / weightsSum[k]).toFixed(2));
            } else if (sumsRaw[k]) {
              category_scores[k] = Number((sumsRaw[k] / (counts[k] || 1)).toFixed(2));
            } else {
              category_scores[k] = 0;
            }
          });

        } catch (err) {
          console.error('Error computing category scores:', err);
        }

        try {
          // remove any existing result for this evaluation and insert new
          await supabase.from('evaluation_results').delete().eq('evaluation_id', evaluation.id);
          await supabase.from('evaluation_results').insert([
            {
              evaluation_id: evaluation.id,
              overall_score: Number(overallScore),
              category_scores,
            },
          ]);
        } catch (err) {
          console.error('Error saving evaluation results:', err);
        }

        // --- AUTO-NOTIFICACIÓN: Verificar si TODAS las evaluaciones están completas ---
        try {
          const session = await supabase.auth.getSession();
          const accessToken = session?.data?.session?.access_token;
          if (accessToken && evaluation.period_id) {
            // Llamar al endpoint de Vercel para verificar y enviar notificación
            const baseUrl = window.location.origin;
            const notifyResponse = await fetch(`${baseUrl}/api/auto-notify`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                evaluatorId: evaluation.evaluator_id,
                periodId: evaluation.period_id,
              }),
            });
            const notifyResult = await notifyResponse.json();
            if (notifyResult.success) {
              console.log('[AutoNotify] Correo enviado a', notifyResult.message);
            } else if (!notifyResult.skipped) {
              console.warn('[AutoNotify] Error:', notifyResult.message || notifyResult.error);
            }
            // skipped significa que no aplicaba (no todas completas, o no configurado)
          }
        } catch (notifyErr) {
          console.warn('[AutoNotify] No se pudo enviar notificación automática:', notifyErr);
          // No bloquear la experiencia del usuario si falla la notificación
        }

        alert('Evaluación completada exitosamente');
        onClose();
      } else {
        alert('Progreso guardado');
      }
    } catch (error: any) {
      console.error('Error saving evaluation:', error);
      const msg = error?.message || error?.error || (typeof error === 'string' ? error : JSON.stringify(error || {}));
      alert('Error al guardar la evaluación: ' + (msg || 'ver consola para más detalles'));
    } finally {
      setSaving(false);
    }
  };

  const calculateOverallScore = () => {
    const ratingQuestions = questions.filter((q) => q.question_type === 'rating');
    if (ratingQuestions.length === 0) return 0;

    // if any question has weight > 0, compute weighted average
    const totalWeights = ratingQuestions.reduce((acc, q) => acc + (Number((q as any).weight) || 0), 0);
    if (totalWeights > 0) {
      const weightedSum = ratingQuestions.reduce((acc, q) => {
        const value = responses[q.id] || 0;
        const num = typeof value === 'number' ? value : Number(value) || 0;
        const w = Number((q as any).weight) || 0;
        return acc + (num * w);
      }, 0);
      return (weightedSum / totalWeights).toFixed(2);
    }

    const total = ratingQuestions.reduce((sum, q) => {
      const value = responses[q.id] || 0;
      return sum + (typeof value === 'number' ? value : 0);
    }, 0);

    return (total / ratingQuestions.length).toFixed(2);
  };
  const renderQuestion = (question: EvaluationQuestion) => {
    switch (question.question_type) {
      case 'rating':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleResponseChange(question.id, rating)}
                className={`w-12 h-12 border-2 rounded-lg font-semibold transition-all ${responses[question.id] === rating
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-blue-300'
                  }`}
              >
                {rating}
              </button>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(question.options as string[])?.map((option, idx) => (
              <label
                key={idx}
                className="flex items-center gap-3 cursor-pointer p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={responses[question.id] === option}
                  onChange={() => handleResponseChange(question.id, option)}
                  className="w-4 h-4 text-blue-600"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'text':
        return (
          <textarea
            value={responses[question.id] || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={4}
            placeholder="Escribe tu respuesta..."
          />
        );
      default:
        return null;
    }
  };

  // build render blocks grouped by section to show section titles
  const renderBlocks: JSX.Element[] = [];
  let globalIndex = 0;
  groupedSections.forEach((sec, sIdx) => {
    renderBlocks.push(
      <div key={`sec-${sec.id || 'general'}-${sIdx}`} className="pb-8 border-b border-gray-200 last:border-0">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">{sec.title}</h2>
        <div className="space-y-6">
          {sec.questions.map((question) => {
            globalIndex += 1;
            return (
              <div key={question.id} className="pb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{globalIndex}. {question.question_text}</h3>
                {renderQuestion(question)}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div>
      <button
        onClick={onClose}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Volver
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">Evaluación</h1>

          {periodInfo && (
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-lg p-4 mb-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse"></span>
                    <span className="text-white font-semibold">Período Activo {periodInfo.year}</span>
                  </div>
                </div>
                <span className="text-blue-100 text-sm">
                  {new Date(periodInfo.start_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} — {new Date(periodInfo.end_date).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-gray-600">
              Completa todas las preguntas de esta evaluación. Puedes guardar tu progreso y continuar más tarde.
            </p>
          </div>

          {/* Rating Scale Instructions */}
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-lg">
            <h3 className="font-semibold text-amber-900 mb-2">📊 Escala de Calificación</h3>
            <p className="text-sm text-amber-800 mb-3">
              Para las preguntas con escala numérica, seleccione de <strong>1 a 5</strong> de acuerdo con la frecuencia:
            </p>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              <div className="bg-red-100 border border-red-300 rounded p-2">
                <div className="font-bold text-red-700 text-lg">1</div>
                <div className="text-red-600 mt-1 font-semibold">Nunca</div>
              </div>
              <div className="bg-orange-100 border border-orange-300 rounded p-2">
                <div className="font-bold text-orange-700 text-lg">2</div>
                <div className="text-orange-600 mt-1 font-semibold">Casi nunca</div>
              </div>
              <div className="bg-yellow-100 border border-yellow-300 rounded p-2">
                <div className="font-bold text-yellow-700 text-lg">3</div>
                <div className="text-yellow-600 mt-1 font-semibold">A veces</div>
              </div>
              <div className="bg-lime-100 border border-lime-300 rounded p-2">
                <div className="font-bold text-lime-700 text-lg">4</div>
                <div className="text-lime-600 mt-1 font-semibold">Casi siempre</div>
              </div>
              <div className="bg-green-100 border border-green-300 rounded p-2">
                <div className="font-bold text-green-700 text-lg">5</div>
                <div className="text-green-600 mt-1 font-semibold">Siempre</div>
              </div>
            </div>
            <p className="text-xs text-amber-700 mt-3 italic">
              * Donde <strong>1 = Nunca</strong> y <strong>5 = Siempre</strong>
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {groupedSections && groupedSections.length > 0 ? (
            // render grouped sections (we built renderBlocks earlier)
            <div>{renderBlocks}</div>
          ) : (
            // fallback: render flat questions
            <div className="space-y-8">
              {questions.map((question, index) => (
                <div key={question.id} className="pb-8 border-b border-gray-200 last:border-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {index + 1}. {question.question_text}
                  </h3>
                  {renderQuestion(question)}
                </div>
              ))}
            </div>
          )}
        </div>

        {questions.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Este formulario no tiene preguntas configuradas
          </div>
        )}

        {questions.length > 0 && (
          <div className="mt-8 flex gap-3 pt-6 border-t border-gray-200">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Guardar Progreso
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors disabled:opacity-50"
            >
              Completar Evaluación
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

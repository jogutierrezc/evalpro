import { useState, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { supabase, Evaluation, EvaluationQuestion } from '../../lib/supabase';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Save } from 'lucide-react';
import { enviarCopiaSiCompleto } from './cierreCorreo';

interface EvaluationFormProps {
  evaluation: Evaluation;
  onClose: () => void;
}

type Notice = { type: 'ok' | 'error'; text: string };

const SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Nunca' },
  { value: 2, label: 'Casi nunca' },
  { value: 3, label: 'A veces' },
  { value: 4, label: 'Casi siempre' },
  { value: 5, label: 'Siempre' },
];

/** Una respuesta cuenta solo si tiene contenido: el texto vacío o con solo espacios no cuenta. */
const isAnswered = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

/** Las fechas sin hora (AAAA-MM-DD) se leen como día local: `new Date('2026-01-12')` es UTC y en Colombia mostraría el día anterior. */
const fechaLarga = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-blue-800 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';
const btnSecondary =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-[background-color,transform] duration-150 ease-out hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

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
  const [meta, setMeta] = useState<{ templateName: string; evaluatedName: string | null }>({
    templateName: (evaluation as any).template?.name || '',
    evaluatedName: (evaluation as any).evaluated?.full_name || null,
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);

  const isSelf = evaluation.evaluator_id === evaluation.evaluated_id;

  useEffect(() => {
    loadQuestionsAndResponses();
  }, [evaluation.id]);

  // Nombre de la plantilla y de la persona evaluada, si la pantalla anterior no los trajo (evaluación recién creada).
  useEffect(() => {
    (async () => {
      try {
        const [tpl, usr] = await Promise.all([
          meta.templateName ? Promise.resolve({ data: null }) : supabase.from('evaluation_templates').select('name').eq('id', evaluation.template_id).maybeSingle(),
          meta.evaluatedName || isSelf ? Promise.resolve({ data: null }) : supabase.from('users').select('full_name').eq('id', evaluation.evaluated_id).maybeSingle(),
        ]);
        setMeta((m) => ({
          templateName: m.templateName || (tpl.data as any)?.name || '',
          evaluatedName: m.evaluatedName || (usr.data as any)?.full_name || null,
        }));
      } catch { /* el título es opcional: se queda con «Evaluación» */ }
    })();
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
      setNotice({ type: 'error', text: 'Aún no hay respuestas que guardar. Responde al menos una pregunta.' });
      return;
    }

    setSaving(true);
    setNotice(null);

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
        // Una respuesta de texto vacía o solo con espacios no cuenta como respondida.
        const allAnswered = questions.every((q) => isAnswered(responses[q.id]));
        if (!allAnswered) {
          setSaving(false);
          setConfirming(false);
          showMissing();
          return;
        }

        const { error: completeError } = await supabase
          .from('evaluations')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', evaluation.id);
        // Antes el error se ignoraba y la evaluación quedaba abierta sin avisar.
        if (completeError) throw completeError;

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

        // Si esta era la última evaluación pendiente del período, la persona recibe su copia en PDF por correo.
        // Va después de guardar los puntajes (el PDF los lee) y sin await: no retrasa ni bloquea el cierre.
        void enviarCopiaSiCompleto(evaluation.evaluator_id).catch((err) =>
          console.warn('[CopiaPDF] No se pudo enviar la copia:', err),
        );

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

        setConfirming(false);
        setDone(true);
      } else {
        setNotice({ type: 'ok', text: `Progreso guardado a las ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}.` });
      }
    } catch (error: any) {
      console.error('Error saving evaluation:', error);
      const msg = error?.message || error?.error || (typeof error === 'string' ? error : JSON.stringify(error || {}));
      setConfirming(false);
      setNotice({ type: 'error', text: 'No se pudo guardar la evaluación: ' + (msg || 'revisa la consola para más detalles') });
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

  // ---------- Presentación ----------
  const total = questions.length;
  const answeredCount = useMemo(() => questions.filter((q) => isAnswered(responses[q.id])).length, [questions, responses]);
  const unanswered = total - answeredCount;
  const ratio = total > 0 ? answeredCount / total : 0;
  const hasRating = questions.some((q) => q.question_type === 'rating');

  // Al responder, la pregunta deja de marcarse como faltante.
  useEffect(() => {
    setMissingIds((ids) => (ids.length ? ids.filter((id) => !isAnswered(responses[id])) : ids));
  }, [responses]);

  // Una sola entrada al abrir el formulario, y un momento propio al completar. Con «reducir movimiento» no se anima.
  useLayoutEffect(() => {
    if (loading || done) return;
    const mm = gsap.matchMedia();
    mm.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        gsap.from('[data-rise]', { autoAlpha: 0, y: 12, duration: 0.6, ease: 'expo.out', stagger: 0.06, clearProps: 'transform,opacity,visibility' });
      },
      root.current ?? undefined,
    );
    return () => mm.revert();
  }, [loading, done]);

  useLayoutEffect(() => {
    if (!done) return;
    const mm = gsap.matchMedia();
    mm.add(
      '(prefers-reduced-motion: no-preference)',
      () => {
        const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
        tl.from('[data-check]', { scale: 0.85, autoAlpha: 0, duration: 0.55, clearProps: 'transform,opacity,visibility' }, 0)
          .from('[data-done]', { autoAlpha: 0, y: 10, duration: 0.55, stagger: 0.07, clearProps: 'transform,opacity,visibility' }, 0.08);
      },
      root.current ?? undefined,
    );
    return () => mm.revert();
  }, [done]);

  const showMissing = () => {
    const ids = questions.filter((q) => !isAnswered(responses[q.id])).map((q) => q.id);
    if (ids.length === 0) return;
    setMissingIds(ids);
    setNotice({ type: 'error', text: ids.length === 1 ? 'Falta 1 pregunta por responder.' : `Faltan ${ids.length} preguntas por responder.` });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`q-${ids[0]}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  };

  const onCompleteClick = () => {
    if (saving) return;
    if (unanswered > 0) {
      setConfirming(false);
      showMissing();
      return;
    }
    if (!confirming) {
      setConfirming(true);
      setNotice(null);
      return;
    }
    handleSave(true);
  };

  const renderQuestion = (question: EvaluationQuestion) => {
    const value = responses[question.id];
    switch (question.question_type) {
      case 'rating': {
        const current = SCALE.find((s) => s.value === value);
        return (
          <div>
            <div role="radiogroup" aria-labelledby={`qt-${question.id}`} className="flex gap-2">
              {SCALE.map(({ value: v, label }) => (
                <label key={v} className="min-w-0 flex-1 sm:max-w-[7.5rem]">
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    checked={value === v}
                    onChange={() => handleResponseChange(question.id, v)}
                    className="peer sr-only"
                  />
                  <span className="flex h-14 cursor-pointer select-none flex-col items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] peer-checked:border-blue-700 peer-checked:bg-blue-700 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-blue-600 peer-focus-visible:ring-offset-2 [@media(hover:hover)]:[input:not(:checked)+&]:hover:border-blue-500 [@media(hover:hover)]:[input:not(:checked)+&]:hover:bg-blue-50">
                    <span className="tabular text-lg font-semibold leading-none">{v}</span>
                    <span className="mt-1 hidden text-[11px] font-medium leading-none opacity-80 sm:block">{label}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 h-5 text-sm text-slate-500 sm:hidden" aria-hidden>{current ? `${current.value} · ${current.label}` : ''}</p>
          </div>
        );
      }
      case 'multiple_choice':
        return (
          <div role="radiogroup" aria-labelledby={`qt-${question.id}`} className="space-y-2">
            {(question.options as string[])?.map((option, idx) => (
              <label
                key={idx}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 transition-colors duration-150 has-[:checked]:border-blue-700 has-[:checked]:bg-blue-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 [@media(hover:hover)]:hover:border-blue-400"
              >
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={value === option}
                  onChange={() => handleResponseChange(question.id, option)}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-blue-700 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-slate-800">{option}</span>
              </label>
            ))}
          </div>
        );
      case 'text':
        return (
          <textarea
            aria-labelledby={`qt-${question.id}`}
            value={value || ''}
            onChange={(e) => handleResponseChange(question.id, e.target.value)}
            className="ui-input min-h-[7rem] resize-y px-4 py-3 text-base"
            rows={4}
            placeholder="Escribe tu respuesta…"
          />
        );
      default:
        return null;
    }
  };

  // Secciones con preguntas; si la plantilla no tiene secciones, una lista plana sin título.
  const blocks: { key: string; title: string | null; questions: EvaluationQuestion[] }[] = groupedSections.some((s) => s.questions.length > 0)
    ? groupedSections.filter((s) => s.questions.length > 0).map((s, i) => ({ key: `${s.id || 'general'}-${i}`, title: s.title, questions: s.questions }))
    : questions.length > 0
      ? [{ key: 'plana', title: null, questions }]
      : [];
  let questionNumber = 0;

  const asunto = meta.templateName || 'Evaluación';
  const quien = isSelf ? 'Autoevaluación' : meta.evaluatedName ? `Evaluado: ${meta.evaluatedName}` : null;
  const periodo = periodInfo ? `Período ${periodInfo.year} · ${fechaLarga(periodInfo.start_date)} al ${fechaLarga(periodInfo.end_date)}` : null;

  let content: ReactNode;

  if (loading) {
    content = (
      <div className="mx-auto max-w-3xl animate-pulse space-y-6" aria-busy="true" aria-label="Cargando evaluación">
        <div className="h-5 w-24 rounded bg-slate-200" />
        <div className="space-y-3">
          <div className="h-8 w-2/3 rounded bg-slate-200" />
          <div className="h-4 w-1/2 rounded bg-slate-200" />
        </div>
        <div className="space-y-px overflow-hidden rounded-xl border border-slate-200 bg-white">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-4 p-6">
              <div className="h-5 w-3/4 rounded bg-slate-100" />
              <div className="flex gap-2">{[0, 1, 2, 3, 4].map((j) => <div key={j} className="h-14 flex-1 rounded-lg bg-slate-100" />)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  } else if (done) {
    content = (
      <div className="mx-auto flex max-w-md flex-col items-center px-2 py-16 text-center">
        <span data-check className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <Check className="h-8 w-8" strokeWidth={2.5} aria-hidden />
        </span>
        <h1 data-done className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Evaluación completada</h1>
        <p data-done className="mt-2 text-slate-600">Tus respuestas quedaron registradas.</p>
        <p data-done className="mt-4 font-medium text-slate-900">{asunto}</p>
        {quien && <p data-done className="text-sm text-slate-500">{quien}</p>}
        <p data-done className="mt-5 text-sm text-slate-500">Puedes ver el informe y descargar el PDF desde la pestaña Completadas.</p>
        <button data-done onClick={onClose} className={`${btnPrimary} mt-8`}>
          Volver a mis evaluaciones
        </button>
      </div>
    );
  } else {
    content = (
      <div className="mx-auto max-w-3xl">
        <button
          data-rise
          onClick={onClose}
          className="-ml-2 mb-4 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver a mis evaluaciones
        </button>

        <header data-rise className="border-b border-slate-200 pb-6">
          <h1 className="text-balance text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{asunto}</h1>
          {(quien || periodo) && (
            <p className="mt-2 text-sm text-slate-500">
              {quien && <span className="font-medium text-slate-700">{quien}</span>}
              {quien && periodo && ' · '}
              {periodo}
            </p>
          )}
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-slate-600">
            Responde todas las preguntas. Mientras respondes, tu avance se conserva en este equipo; usa «Guardar progreso» para
            poder continuar después desde cualquier equipo.
          </p>
        </header>

        {hasRating && (
          <div data-rise className="mt-6 rounded-xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">Escala de 1 a 5, según la frecuencia</p>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-600">
              {SCALE.map((s) => (
                <li key={s.value}><span className="tabular font-semibold text-slate-900">{s.value}</span> {s.label}</li>
              ))}
            </ul>
          </div>
        )}

        {blocks.length === 0 ? (
          <div data-rise className="mt-6 rounded-xl border border-dashed border-slate-300 px-6 py-14 text-center">
            <p className="text-sm font-semibold text-slate-900">Este formulario aún no tiene preguntas</p>
            <p className="mt-1 text-sm text-slate-500">Avísale al administrador para que configure la plantilla.</p>
          </div>
        ) : (
          <div className="mt-8 space-y-8">
            {blocks.map((block) => {
              const answeredInBlock = block.questions.filter((q) => isAnswered(responses[q.id])).length;
              return (
                <section key={block.key} data-rise aria-label={block.title || 'Preguntas'}>
                  {block.title && (
                    <div className="mb-3 flex items-baseline justify-between gap-4 px-1">
                      <h2 className="text-lg font-semibold text-slate-900">{block.title}</h2>
                      <span className="tabular shrink-0 text-sm text-slate-500">{answeredInBlock} de {block.questions.length}</span>
                    </div>
                  )}
                  <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {block.questions.map((question) => {
                      questionNumber += 1;
                      const answered = isAnswered(responses[question.id]);
                      const missing = missingIds.includes(question.id);
                      return (
                        <li
                          key={question.id}
                          id={`q-${question.id}`}
                          className={`scroll-mt-24 px-5 py-6 sm:px-7 ${missing ? 'bg-red-50' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`tabular mt-0.5 flex h-6 w-7 shrink-0 items-center text-sm font-semibold ${answered ? 'text-emerald-600' : 'text-slate-400'}`}>
                              {answered ? <Check className="h-4 w-4" aria-label="Respondida" /> : questionNumber}
                            </span>
                            <div className="min-w-0 flex-1">
                              <h3 id={`qt-${question.id}`} className="max-w-prose text-base font-medium leading-relaxed text-slate-900">
                                {question.question_text}
                              </h3>
                              {missing && <p className="mt-1 text-sm text-red-700">Esta pregunta falta por responder.</p>}
                              <div className="mt-4">{renderQuestion(question)}</div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              );
            })}
          </div>
        )}

        {questions.length > 0 && (
          <div data-rise className="sticky bottom-4 z-20 mt-8">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-lg shadow-slate-900/10 sm:p-5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="tabular font-semibold text-slate-900">{answeredCount} de {total} respondidas</span>
                {unanswered > 0 && <span className="text-slate-500">{unanswered === 1 ? 'Falta 1' : `Faltan ${unanswered}`}</span>}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answeredCount} aria-label="Preguntas respondidas">
                <div className="h-full origin-left rounded-full bg-blue-700 transition-transform duration-300 ease-out" style={{ transform: `scaleX(${ratio})` }} />
              </div>

              <div aria-live="polite" className="empty:hidden">
                {notice && (
                  <p
                    role={notice.type === 'error' ? 'alert' : 'status'}
                    className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${notice.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}
                  >
                    {notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                    {notice.text}
                  </p>
                )}
              </div>

              {confirming ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-700">Al completar no podrás cambiar tus respuestas. ¿Confirmas?</p>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <button onClick={() => setConfirming(false)} disabled={saving} className={btnSecondary}>Seguir revisando</button>
                    <button onClick={onCompleteClick} disabled={saving} className={btnPrimary}>
                      {saving ? 'Guardando…' : 'Sí, completar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                  <button onClick={() => handleSave(false)} disabled={saving} aria-label="Guardar progreso" className={btnSecondary}>
                    <Save className="h-4 w-4" aria-hidden />
                    {saving ? 'Guardando…' : (<><span className="sm:hidden">Guardar</span><span className="hidden sm:inline">Guardar progreso</span></>)}
                  </button>
                  <button onClick={onCompleteClick} disabled={saving} aria-label="Completar evaluación" className={btnPrimary}>
                    <span className="sm:hidden">Completar</span><span className="hidden sm:inline">Completar evaluación</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return <div ref={root}>{content}</div>;
}

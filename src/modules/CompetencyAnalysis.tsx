import { useEffect, useState, Fragment } from 'react';
import { supabase, Evaluation } from '../lib/supabase';
import { X } from 'lucide-react';

interface Props {
  evaluation: Evaluation;
  onClose: () => void;
}

const COMPETENCIES: { key: string; label: string; weightPercent: number; logic: string }[] = [
  { key: 'Integridad', label: 'INTEGRIDAD', weightPercent: 15, logic: 'Si la puntuación es alta (4.0+), destacar la solidez ética como valor institucional. Si es baja (menos de 3.5), indicar riesgo en transparencia o cumplimiento.' },
  { key: 'Compromiso con la calidad del trabajo', label: 'COMPROMISO CON LA CALIDAD DEL TRABAJO', weightPercent: 16, logic: 'Competencia de peso medio-alto. Si es la más baja, declararla el foco principal de desarrollo, enfatizando la necesidad de mejorar la planeación y el rigor.' },
  { key: 'Institucional', label: 'INSTITUCIONAL', weightPercent: 16, logic: 'Puntuación alta indica alineación total. Sugerir que el evaluado sirva de referente o mentor en este ámbito para otros miembros del equipo.' },
  { key: 'Liderazgo o Empowerment', label: 'LIDERAZGO O EMPOWERMENT', weightPercent: 20, logic: 'Mayor peso de la matriz. Cualquier desviación a la baja tiene un impacto máximo en el global. Si está en NOTABLE, enfocar el análisis en cómo potenciar el retorno de la inversión en esta competencia.' },
  { key: 'Proactividad', label: 'PROACTIVIDAD', weightPercent: 15, logic: 'Si la puntuación es alta, sugerir que la proactividad se canalice hacia iniciativas formales que contribuyan a procesos mayores.' },
  { key: 'Orientación a los resultados con calidad', label: 'ORIENTACIÓN A LOS RESULTADOS CON CALIDAD', weightPercent: 18, logic: 'Competencia de alto peso. Una puntuación alta valida la estrategia de trabajo. Si fuera baja (menos de 4.0), indicar urgencia para revisar la metodología de planificación.' },
];

// normalize strings: remove accents, lowercase, remove non-alphanum
const normalizeForMatch = (s?: string | null) => {
  if (!s) return '';
  // remove diacritics using basic unicode range, then non-alphanum
  return String(s)
    .normalize('NFD')
    .replace(/[-\uFFFF]/g, (c) => c) // keep basic unicode (noop, safe)
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim();
};

const matchesCategory = (compKey: string, category: string | null) => {
  if (!category) return false;
  const a = normalizeForMatch(compKey);
  const b = normalizeForMatch(category);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  // token overlap: if any token from one appears in the other
  const atoks = a.split(/\s+/).filter(Boolean);
  const btoks = b.split(/\s+/).filter(Boolean);
  if (atoks.some((t) => btoks.includes(t))) return true;
  return false;
};

const matchesExact = (aRaw: string, bRaw?: string | null) => {
  if (!bRaw) return false;
  const a = normalizeForMatch(aRaw);
  const b = normalizeForMatch(bRaw);
  return a === b;
};

export function CompetencyAnalysis({ evaluation, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [globalScore, setGlobalScore] = useState<number>(0);
  const [generatedGlobal, setGeneratedGlobal] = useState<string>('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showBreakdown, setShowBreakdown] = useState<boolean>(false);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [dataWarning, setDataWarning] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluation.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: sections }, { data: questions }, { data: responses }] = await Promise.all([
        supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
      ]);

      const sectionsList: any[] = sections || [];
      const questionsList: any[] = questions || [];
      const responsesList: any[] = responses || [];

      // try to load stored results for this evaluation; prefer persisted values when available
      const { data: resultsData } = await supabase
        .from('evaluation_results')
        .select('*')
        .eq('evaluation_id', evaluation.id)
        .limit(1);
      const storedResult = (resultsData && resultsData.length > 0) ? resultsData[0] : null;

  // try to load template (type + categories) to respect template-specific categories if present
  const { data: tmplData } = await supabase.from('evaluation_templates').select('type,categories').eq('id', evaluation.template_id).limit(1);
  const templateRow = (tmplData && tmplData.length > 0) ? tmplData[0] : null;
  // Only consider template categories for category-based evaluation types
  const CATEGORY_TYPES = ['self_evaluation', 'manager_to_employee', 'employee_to_manager'];
  const templateCategories: string[] | null = (templateRow && CATEGORY_TYPES.includes(templateRow.type)) ? templateRow.categories || null : null;

      // map section.id -> category (category may be null)
      const sectionCategory: Record<string, string | null> = {};
      sectionsList.forEach((s) => {
        sectionCategory[s.id] = s.category || null;
      });

      // build responses map
      const respMap: Record<string, any> = {};
      responsesList.forEach((r) => {
        respMap[r.question_id] = r.response_value;
      });

    // compute per-category/competency averages (use section.category to map)
  const computed: any[] = [];
    let globalSum = 0;

    let totalCategoryWeightUsed = 0;

      // If the template defines categories, derive weights from questions (sum of question weights per category or counts)
      const useTemplateCategories = Array.isArray(templateCategories) && templateCategories.length > 0;

      let categoriesToIterate: { key: string; label: string; weightPercent: number; logic: string }[] = [];
      if (useTemplateCategories) {
        // build map category -> questions
        const catQs: Record<string, any[]> = {};
        for (const c of templateCategories || []) catQs[c] = [];
        for (const q of questionsList) {
          // ensure question belongs to the same template (UUID check)
          if (!q.template_id || q.template_id !== evaluation.template_id) continue;
          const resp = respMap[q.id];
          // only consider questions that were answered in this evaluation
          if (resp === undefined || resp === null) continue;
          const secId = q.section_id;
          // prefer section category, fallback to question.category if present
          const catFromSection = secId ? sectionCategory[secId] : null;
          const cat = catFromSection ?? (q.category || null);
          if (!cat) continue;
          // find matching template category name (flexible match)
          const found = (templateCategories || []).find((tc) => matchesCategory(tc, cat));
          if (found) catQs[found].push(q);
        }

        // decide weight method: if any question has weight > 0 then use weights, else use counts
        let globalHasWeights = false;
        for (const k of Object.keys(catQs)) {
          if ((catQs[k] || []).some((qq) => Number(qq.weight || 0) > 0)) {
            globalHasWeights = true;
            break;
          }
        }

        const rawWeights: Record<string, number> = {};
        for (const k of Object.keys(catQs)) {
          const list = catQs[k] || [];
          if (globalHasWeights) {
            rawWeights[k] = list.reduce((s, qq) => s + (Number(qq.weight || 0)), 0);
          } else {
            // count only rating questions
            rawWeights[k] = list.filter((qq) => qq.question_type === 'rating').length;
          }
        }

        const totalRaw = Object.values(rawWeights).reduce((s, v) => s + (v || 0), 0) || 0;
        for (const k of Object.keys(rawWeights)) {
          const wp = totalRaw > 0 ? (rawWeights[k] / totalRaw) * 100 : (100 / (templateCategories || []).length);
          categoriesToIterate.push({ key: k, label: k, weightPercent: Math.round(wp * 100) / 100, logic: '' });
        }
      } else {
        categoriesToIterate = COMPETENCIES;
      }

  const breakdownArr: any[] = [];
  for (const comp of categoriesToIterate) {
        // if we have stored results, try to use them for this competency
        let avg = 0;
        if (storedResult && storedResult.category_scores) {
          const catObj = storedResult.category_scores;
          // restrict stored category keys to those that belong to this template
          const storedKeys = Object.keys(catObj || {}).filter((k) => {
            if (useTemplateCategories) {
              // match only if stored key equals one of the template categories (exact normalized)
              return (templateCategories || []).some((tc) => matchesExact(tc, k));
            }
            // otherwise only accept stored keys that match a section category from this template
            return Object.values(sectionCategory).some((sc) => sc ? matchesCategory(k, sc) : false);
          });
          const foundKey = storedKeys.find((k) => matchesCategory(comp.key, k));
          if (foundKey) {
            const raw = catObj[foundKey];
            avg = typeof raw === 'number' ? raw : Number(raw) || 0;
          }
        }

        // compute matched questions and raw stats for this category
          const matchedQs = questionsList.filter((q) => {
            // ensure question belongs to the same template (UUID check)
            if (!q.template_id || q.template_id !== evaluation.template_id) return false;
            const resp = respMap[q.id];
            if (resp === undefined || resp === null) return false; // only use questions answered in this evaluation
            const secId = q.section_id;
            const catFromSection = secId ? sectionCategory[secId] : null;
            const cat = catFromSection ?? (q.category || null);
            if (!cat) return false;
            // if using template categories, require exact normalized match to avoid cross-template mixing
            if (useTemplateCategories) return matchesExact(comp.key, cat);
            return matchesCategory(comp.key, cat);
          });

        const numRatingQs = matchedQs.filter((q) => q.question_type === 'rating').length;
        const sumQWeights = matchedQs.reduce((s, q) => s + (Number(q.weight || 0) || 0), 0);

        // if no stored per-category score, compute from responses/questions
        if (!avg || avg === 0) {
          // decide if within-category we should use question weights
          const hasWeights = matchedQs.some((qq) => Number(qq.weight || 0) > 0);
          if (hasWeights) {
            let s = 0;
            let wsum = 0;
            matchedQs.forEach((q) => {
              if (q.question_type !== 'rating') return;
              const v = respMap[q.id];
              const num = typeof v === 'number' ? v : Number(v);
              const w = Number(q.weight || 0) || 0;
              if (!isNaN(num)) {
                s += num * w;
                wsum += w;
              }
            });
            avg = wsum > 0 ? Math.round((s / wsum) * 100) / 100 : 0;
          } else {
            const ratings: number[] = [];
            matchedQs.forEach((q) => {
              if (q.question_type !== 'rating') return;
              const v = respMap[q.id];
              const num = typeof v === 'number' ? v : Number(v);
              if (!isNaN(num)) ratings.push(num);
            });
            avg = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0;
          }
        }

        const weightDecimal = comp.weightPercent / 100;
        const weightedImpact = Math.round((avg * weightDecimal) * 100) / 100;

        // if this competency is represented (either from storedResult or computed ratings), count its weight
        const represented = (storedResult && storedResult.category_scores && Object.keys(storedResult.category_scores).some((k) => matchesCategory(comp.key, k))) || (questionsList.some((q) => {
          const secId = q.section_id;
          const cat = secId ? sectionCategory[secId] : null;
          return cat ? matchesCategory(comp.key, cat) : false;
        }));
        if (represented) totalCategoryWeightUsed += comp.weightPercent;

        globalSum += weightedImpact;

        // use generateCompetencyAnalysis only when we are using the fixed COMPETENCIES keys (best-effort)
        const generatedAnalysis = useTemplateCategories ? '' : generateCompetencyAnalysis(comp.key, avg);

        computed.push({
          competencia: comp.label,
          peso: comp.weightPercent,
          puntuacion: avg,
          nivel: levelLabel(avg),
          impacto: weightedImpact,
          analisis: comp.logic || '',
          generatedAnalysis,
        });

        // prepare matched question details
        const matchedDetails = matchedQs.map((q) => ({
          id: q.id,
          text: q.question_text || '',
          type: q.question_type,
          weight: Number(q.weight || 0),
          response: respMap[q.id],
          section_id: q.section_id || null,
          template_id: q.template_id || null,
        }));

        // push breakdown entry
        breakdownArr.push({
          key: comp.key,
          label: comp.label,
          numRatingQs,
          sumQuestionWeights: sumQWeights,
          categoryWeightPercent: comp.weightPercent,
          avg,
          impacto: weightedImpact,
          questions: matchedDetails,
        });
      }

      // If this template is of collaborator/employee type and there are no rating questions found overall, set a warning
      const totalRatingQuestions = breakdownArr.reduce((s, b) => s + (b.numRatingQs || 0), 0);
      if (!useTemplateCategories && totalRatingQuestions === 0) {
        setDataWarning('No se encontraron preguntas de tipo rating para esta plantilla; por eso los resultados aparecen en 0. Verifica secciones y preguntas asociadas a la plantilla.');
      } else {
        setDataWarning(null);
      }

      // compute normalization like EvaluationForm: if totalCategoryWeightUsed < 100, scale up to 100%
  const normalizationMultiplier = totalCategoryWeightUsed > 0 ? (100 / totalCategoryWeightUsed) : 1;

      // adjust each row impacto to normalized contribution so the row impactos sum to the normalized global
      let rowsNormalized = computed.map((r) => ({
        ...r,
        impacto: Math.round((r.impacto * normalizationMultiplier) * 100) / 100,
      }));

      // compute the sum after normalization (this is the authoritative recalculated global)
      const computedGlobalAfterNorm = rowsNormalized.reduce((s, r) => s + (Number(r.impacto) || 0), 0);

      // Use recalculated normalized global as the displayed finalGlobal (match sum of impactos)
      const finalGlobal = Math.round(computedGlobalAfterNorm * 100) / 100;

      setRows(rowsNormalized);
      setGlobalScore(finalGlobal);
      setGeneratedGlobal(globalInterpretation(finalGlobal, rowsNormalized));
      setBreakdown(breakdownArr.map((b, idx) => ({ ...b, impactoNormalized: rowsNormalized[idx]?.impacto || 0 })));

      // prepare debug info to help diagnose collaborator templates showing zeros
      const totalSections = sectionsList.length;
      const totalQuestions = questionsList.length;
      const totalResponses = responsesList.length;
      const questionsSameTemplate = questionsList.filter((q) => q.template_id === evaluation.template_id).length;
      const answeredQuestions = Object.keys(respMap).length;
      const unansweredSameTemplate = questionsList.filter((q) => q.template_id === evaluation.template_id && (respMap[q.id] === undefined || respMap[q.id] === null)).length;
      const sectionCategories = Object.entries(sectionCategory).slice(0, 20);
      const sampleMatchedPerCategory: Record<string, any> = {};
      for (const c of categoriesToIterate) {
        const matched = questionsList.filter((q) => q.template_id === evaluation.template_id && respMap[q.id] !== undefined && respMap[q.id] !== null && ((q.section_id && sectionCategory[q.section_id] && (useTemplateCategories ? matchesExact(c.key, sectionCategory[q.section_id]) : matchesCategory(c.key, sectionCategory[q.section_id]))) || (!q.section_id && q.category && (useTemplateCategories ? matchesExact(c.key, q.category) : matchesCategory(c.key, q.category)))));
        sampleMatchedPerCategory[c.key] = { count: matched.length, ids: matched.slice(0, 10).map((m) => m.id) };
      }

      setDebugInfo({
        evaluation_id: evaluation.id,
        template_id: evaluation.template_id,
        templateRow,
        useTemplateCategories,
        templateCategories,
        totalSections,
        totalQuestions,
        totalResponses,
        questionsSameTemplate,
        answeredQuestions,
        unansweredSameTemplate,
        sectionCategories,
        sampleMatchedPerCategory,
        breakdownSample: breakdownArr.slice(0, 10),
      });
    } catch (err) {
      console.error('Error loading competency analysis', err);
    } finally {
      setLoading(false);
    }
  };

  const levelLabel = (score: number) => {
    if (score >= 4.0) return 'SOBRESALIENTE';
    if (score >= 3.5) return 'NOTABLE';
    if (score >= 3.0) return 'ACEPTABLE';
    return 'NECESITA MEJORA';
  };

  const generateCompetencyAnalysis = (key: string, score: number) => {
    // Use ranges defined in the matrix to produce an interpretative comment
    const s = Number(score || 0);
    switch (key.toLowerCase()) {
      case 'integridad':
      case 'integridad (15%)':
      case 'INTEGRIDAD':
        if (s >= 4.5) return 'La solidez ética y la transparencia son ejemplares. El evaluado es un modelo de honestidad y asume la responsabilidad de sus acciones y las de su equipo con total madurez.';
        if (s >= 4.0) return 'El evaluado cumple consistentemente con las normas de conducta. Se recomienda reforzar la proactividad en la identificación y corrección temprana de errores.';
        if (s >= 3.0) return 'Mantiene una conducta apropiada, pero se debe hacer énfasis en la transparencia total en la comunicación y en el cumplimiento estricto de las normas en situaciones ambiguas.';
        if (s >= 2.0) return 'Existe un riesgo latente o se han identificado inconsistencias en la conducta. Es prioritario establecer un plan de seguimiento inmediato en temas de ética y lealtad institucional.';
        return 'El desempeño es inaceptable. Es necesario iniciar un proceso de revisión formal de la conducta debido a la falta de cumplimiento de normas fundamentales de Integridad.';

      case 'compromiso con la calidad del trabajo':
      case 'calidad del trabajo':
      case 'CALIDAD DEL TRABAJO (16%)':
        if (s >= 4.5) return 'El evaluado demuestra un rigor y metodología impecable. La planeación de actividades es consistente, garantizando que los resultados sean precisos y completos en todo momento.';
        if (s >= 4.0) return 'El compromiso con la calidad es alto, pero existen oportunidades para formalizar la estructura de trabajo (listas o planes detallados) para asegurar una consistencia del 100%.';
        if (s >= 3.0) return 'La calidad de la entrega es aceptable, pero requiere supervisión para asegurar que se cumplan todos los requisitos y estándares establecidos, especialmente en tareas complejas.';
        if (s >= 2.0) return 'Se observa un bajo nivel de rigor. El evaluado debe enfocarse urgentemente en la planeación previa a la ejecución y en la verificación de la precisión de sus entregas.';
        return 'El trabajo es incompleto o no cumple con los estándares mínimos. Existe una necesidad urgente de capacitación en metodologías de trabajo y seguimiento estricto.';

      case 'institucional':
      case 'INSTITUCIONAL':
        if (s >= 4.5) return 'Alineación ejemplar. El evaluado no solo cumple, sino que aplica activamente la normativa, PDI y PEI, y hace un uso eficiente y consciente de los recursos.';
        if (s >= 4.0) return 'Muestra un sólido cumplimiento de la normativa. El foco de desarrollo debe ser en la participación activa en actividades institucionales y en promover la conciencia sobre el uso eficiente de recursos.';
        if (s >= 3.0) return 'El cumplimiento es reactivo (cumple cuando se le pide). Se requiere un esfuerzo en la consulta proactiva de documentos institucionales para aplicar tendencias y avances relevantes al cargo.';
        if (s >= 2.0) return 'Se evidencia desconocimiento o desapego a normativas esenciales. Es obligatoria una reinducción formal e inmediata sobre el reglamento interno y el uso de recursos.';
        return 'Incumplimiento grave de las políticas institucionales. Requiere una intervención disciplinaria y una revisión de la idoneidad del cargo.';

      case 'liderazgo o empowerment':
      case 'liderazgo':
      case 'LIDERAZGO (20%)':
        if (s >= 4.5) return 'La competencia de mayor peso es una fortaleza principal. El evaluado fomenta un ambiente positivo, genera cohesión e incentiva la contribución activa del equipo, impulsando nuevas iniciativas.';
        if (s >= 4.0) return 'El evaluado ejerce un liderazgo efectivo. La mejora se centra en documentar las nuevas ideas/iniciativas puestas en marcha y maximizar los espacios de reconocimiento grupal.';
        if (s >= 3.0) return 'El liderazgo es funcional, pero el ambiente de trabajo o la motivación del equipo pueden mejorar. Se debe trabajar en fomentar la participación activa y tomar en cuenta las opiniones del equipo para la toma de decisiones.';
        if (s >= 2.0) return 'Se requiere formación en habilidades de liderazgo y empowerment. El equipo no se siente motivado o sus opiniones no son consideradas, afectando la cohesión.';
        return 'El liderazgo es deficiente. No hay cohesión ni iniciativas, y el ambiente laboral es negativo. Se requiere un cambio de enfoque o una revisión del rol de liderazgo.';

      case 'proactividad':
      case 'PROACTIVIDAD (15%)':
        if (s >= 4.5) return 'El evaluado es un agente de cambio. Demuestra una perseverancia excepcional, se anticipa sistemáticamente a los problemas y presenta constantemente propuestas de valor para el crecimiento del proceso.';
        if (s >= 4.0) return 'El evaluado es proactivo y perseverante. El foco de desarrollo está en formalizar la presentación de nuevas ideas y asegurar que estas se traduzcan en proyectos puestos en marcha.';
        if (s >= 3.0) return 'Muestra iniciativa, pero esta no es consistente. La mejora se centra en la anticipación activa a problemas potenciales en lugar de solo reaccionar a los obstáculos.';
        if (s >= 2.0) return 'La proactividad es baja. El evaluado trabaja principalmente bajo demanda y no propone soluciones ni se anticipa. Necesita entrenamiento en pensamiento estratégico.';
        return 'Falta total de iniciativa y perseverancia ante los obstáculos. El evaluado requiere supervisión constante para el cumplimiento de tareas básicas.';

      case 'orientación a los resultados con calidad':
      case 'orientación a resultados':
      case 'ORIENTACIÓN A RESULTADOS (18%)':
        if (s >= 4.5) return 'Alto desempeño en una competencia crítica. El evaluado analiza métodos, implementa objetivos SMART y planea, ejecuta y verifica las actividades con un enfoque de calidad total.';
        if (s >= 4.0) return 'El evaluado cumple metas consistentemente. El desarrollo debe enfocarse en la evaluación periódica de métodos y procedimientos para generar mejoras continuas, no solo resultados puntuales.';
        if (s >= 3.0) return 'Los resultados se alcanzan, pero la planificación y verificación son inconsistentes. Se debe formalizar la comunicación de objetivos claros y el uso de métricas medibles.';
        if (s >= 2.0) return 'Los resultados son inestables. Se requiere una revisión urgente de la forma en que se establecen, comunican y controlan los objetivos y un plan de acción para proteger los activos institucionales.';
        return 'Incapacidad para planificar y alcanzar los objetivos de calidad. Se requiere capacitación intensiva en gestión de proyectos y establecimiento de metas.';

      default:
        return '';
    }
  };

  const globalInterpretation = (total: number, rowsData: any[]) => {
    const t = Number(total || 0);
    let base = '';
    if (t >= 4.5) base = 'El evaluado es un colaborador de valor estratégico cuyo perfil supera consistentemente las expectativas en la mayoría de las competencias críticas. La estrategia debe ser de mantenimiento y promoción, utilizando al evaluado como un referente de alto rendimiento.';
    else if (t >= 4.0) base = 'El evaluado es un perfil sólido y confiable que cumple con todas las expectativas. Se recomienda enfocar el Plan de Desarrollo Individual (PDI) en la competencia de menor puntuación obtenida para llevar su desempeño al nivel sobresaliente.';
    else if (t >= 3.0) base = 'El evaluado es funcional, pero presenta áreas de oportunidad claras. La estrategia debe ser desarrollar y consolidar las competencias de mayor peso (Liderazgo u Orientación a Resultados) para asegurar el cumplimiento total de su rol.';
    else if (t >= 2.0) base = 'El rendimiento es preocupante y requiere intervención. Se debe establecer un Plan de Mejora formal en las dos (2) competencias con el puntaje más bajo, con seguimiento de 3 a 6 meses para validar su continuidad.';
    else base = 'El desempeño no es sostenible. Se debe realizar una revisión de la idoneidad del cargo y, de ser necesario, iniciar un proceso formal de desarrollo intensivo o reubicación.';

    // identify top impact and lowest scored competency
    const topImpact = rowsData.slice().sort((a, b) => b.impacto - a.impacto)[0];
    const lowestScore = rowsData.slice().sort((a, b) => a.puntuacion - b.puntuacion)[0];

    const extra = `Competencia con mayor impacto: ${topImpact?.competencia || 'N/A'} (${topImpact?.impacto?.toFixed ? topImpact.impacto.toFixed(2) : topImpact?.impacto}). Área prioritaria de desarrollo: ${lowestScore?.competencia || 'N/A'} (puntaje ${lowestScore?.puntuacion?.toFixed ? lowestScore.puntuacion.toFixed(2) : lowestScore?.puntuacion}).`;

    return `${base} ${extra}`;
  };

  const exportCSV = () => {
    const header = ['COMPETENCIA', 'PESO %', 'PUNTUACIÓN OBTENIDA (Máx 5.0)', 'NIVEL DE DESEMPEÑO', 'CÁLCULO DE IMPACTO PONDERADO', 'ANÁLISIS LÓGICO BASADO EN PESO E ÍNDICE'];
    const rowsCsv = rows.map((r) => [r.competencia, String(r.peso) + '%', r.puntuacion, r.nivel, r.impacto, r.generatedAnalysis || r.analisis]);
    const footer = ['PUNTUACIÓN GLOBAL FINAL', '100%', globalScore.toFixed(2), '', globalScore.toFixed(2), generatedGlobal];
    const csv = [header, ...rowsCsv, footer].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `competency_analysis_${evaluation.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-8">Cargando análisis...</div>;

  // build a simple scores map for the radar chart
  const scoresMap: Record<string, number> = {};
  rows.forEach((r) => {
    scoresMap[r.competencia] = Number(r.puntuacion || 0);
  });
  

  const topImpact = rows.slice().sort((a, b) => b.impacto - a.impacto)[0];
  const lowestScore = rows.slice().sort((a, b) => a.puntuacion - b.puntuacion)[0];

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-40 p-2 sm:p-4">
      <div className="bg-white w-full max-w-[95vw] sm:max-w-3xl rounded-lg shadow-lg overflow-auto max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold">Análisis de Competencias</h2>
            <p className="text-sm text-gray-600">Evaluación: {evaluation.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="px-3 py-2 bg-gray-100 rounded-md text-sm">Exportar</button>
            <button onClick={() => exportToPDF()} className="px-3 py-2 bg-gray-100 rounded-md text-sm">PDF</button>
            <button onClick={() => setShowBreakdown((s) => !s)} className="px-3 py-2 bg-gray-100 rounded-md text-sm">{showBreakdown ? 'Ocultar desglose' : 'Ver desglose'}</button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {dataWarning && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800">
              {dataWarning}
            </div>
          )}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="text-sm text-gray-500">Puntación Global Final</div>
              <div className="text-3xl font-extrabold text-blue-600">{globalScore.toFixed(2)} / 5.0</div>
            </div>
            <div className="text-sm">
              <div><span className="font-semibold">Fortaleza:</span> {topImpact?.competencia || 'N/A'}</div>
              <div><span className="font-semibold">Prioridad:</span> {lowestScore?.competencia || 'N/A'}</div>
            </div>
            <div className="hidden md:block">
              <RadarChart scores={scoresMap} />
            </div>
          </div>

          <div className="bg-white border rounded">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-sm">Competencia</th>
                  <th className="p-3 text-left text-sm">Peso</th>
                  <th className="p-3 text-right text-sm">Puntaje</th>
                  <th className="p-3 text-center text-sm">Nivel</th>
                  <th className="p-3 text-right text-sm">Impacto</th>
                  <th className="p-3 text-center text-sm">Ver</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <Fragment key={`row-${idx}`}>
                    <tr className="border-t">
                      <td className="p-3 align-middle">{r.competencia}</td>
                      <td className="p-3 align-middle">{r.peso}%</td>
                      <td className="p-3 align-middle text-right font-semibold">{(r.puntuacion || 0).toFixed(2)}</td>
                      <td className="p-3 align-middle text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${r.nivel === 'SOBRESALIENTE' ? 'bg-green-100 text-green-800' : r.nivel === 'NOTABLE' ? 'bg-yellow-100 text-yellow-800' : r.nivel === 'ACEPTABLE' ? 'bg-blue-50 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                          {r.nivel}
                        </span>
                      </td>
                      <td className="p-3 align-middle text-right">{(r.impacto || 0).toFixed(2)}</td>
                      <td className="p-3 align-middle text-center">
                        <button onClick={() => setExpanded(expanded === idx ? null : idx)} className="text-sm text-blue-600">{expanded === idx ? 'Ocultar' : 'Ver'}</button>
                      </td>
                    </tr>
                    {expanded === idx && (
                      <tr key={`detail-${idx}`} className="bg-gray-50">
                        <td colSpan={6} className="p-4 text-sm text-gray-700">
                          <div className="font-semibold mb-1">Análisis</div>
                          <div>{r.generatedAnalysis}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {showBreakdown && (
            <div className="bg-gray-50 p-4 rounded mt-4 text-sm">
              <div className="font-semibold mb-2">Desglose por categoría (depuración)</div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left">Categoría</th>
                      <th className="p-2 text-right"># Preguntas (rating)</th>
                      <th className="p-2 text-right">Suma pesos preguntas</th>
                      <th className="p-2 text-right">Peso categoría %</th>
                      <th className="p-2 text-right">Promedio/ponderado</th>
                      <th className="p-2 text-right">Impacto (antes norm)</th>
                      <th className="p-2 text-right">Impacto (normalizado)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((b, i) => (
                      <Fragment key={`break-${i}`}>
                        <tr className="border-t">
                          <td className="p-2">{b.label}</td>
                          <td className="p-2 text-right">{b.numRatingQs}</td>
                          <td className="p-2 text-right">{b.sumQuestionWeights}</td>
                          <td className="p-2 text-right">{b.categoryWeightPercent}%</td>
                          <td className="p-2 text-right">{(b.avg || 0).toFixed(2)}</td>
                          <td className="p-2 text-right">{(b.impacto || 0).toFixed(2)}</td>
                          <td className="p-2 text-right">{(b.impactoNormalized || 0).toFixed(2)}</td>
                        </tr>
                        <tr className="bg-white">
                          <td colSpan={7} className="p-2">
                            <details>
                              <summary className="cursor-pointer text-sm text-blue-600">Ver preguntas ({(b.questions || []).length})</summary>
                              <div className="mt-2 text-xs">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className="p-1 text-left">ID</th>
                                      <th className="p-1 text-left">Pregunta</th>
                                      <th className="p-1 text-right">Tipo</th>
                                      <th className="p-1 text-right">Peso</th>
                                      <th className="p-1 text-right">Respuesta</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(b.questions || []).map((q: any, qi: number) => (
                                      <tr key={`q-${q.id || qi}`} className="border-t">
                                        <td className="p-1">{q.id}</td>
                                        <td className="p-1">{q.text}</td>
                                        <td className="p-1 text-right">{q.type}</td>
                                        <td className="p-1 text-right">{q.weight}</td>
                                        <td className="p-1 text-right">{String(q.response ?? '')}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
                {debugInfo && (
                  <div className="mt-4 bg-white p-3 rounded text-xs text-gray-700">
                    <div className="font-semibold mb-1">Debug info</div>
                    <pre className="whitespace-pre-wrap">{JSON.stringify(debugInfo, null, 2)}</pre>
                  </div>
                )}
            </div>
          )}
        </div>

          <div className="bg-gray-50 p-4 rounded text-sm">
            <div className="font-semibold">Conclusión Global</div>
            <div className="text-gray-700 mt-2">{generatedGlobal}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// RadarChart component for 6 competencies
const RadarChart: React.FC<{ scores: Record<string, number> }> = ({ scores }) => {
  const size = 240;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 90;
  const angleStep = (Math.PI * 2) / COMPETENCIES.length;

  const points = COMPETENCIES.map((c, i) => {
    const v = Math.max(0, Math.min(5, Number(scores[c.label] || 0)));
    const r = (v / 5) * radius;
    const angle = -Math.PI / 2 + i * angleStep;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return `${x},${y}`;
  }).join(' ');

  const gridLevels = [0.25, 0.5, 0.75, 1].map((t) => {
    const pts = COMPETENCIES.map((_, i) => {
      const angle = -Math.PI / 2 + i * angleStep;
      const x = cx + radius * t * Math.cos(angle);
      const y = cy + radius * t * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
    return pts;
  });

  return (
    <svg width={size} height={size}>
      {gridLevels.map((g, idx) => (
        <polygon key={idx} points={g} fill={idx % 2 === 0 ? '#f3f4f6' : '#ffffff'} stroke="#e5e7eb" />
      ))}
      <polygon points={points} fill="#60a5fa55" stroke="#3b82f6" strokeWidth={2} />
      {COMPETENCIES.map((c, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const x = cx + (radius + 14) * Math.cos(angle);
        const y = cy + (radius + 14) * Math.sin(angle);
        return (
          <g key={c.key}>
            <line x1={cx} y1={cy} x2={cx + radius * Math.cos(angle)} y2={cy + radius * Math.sin(angle)} stroke="#e5e7eb" />
            <text x={x} y={y} fontSize={10} textAnchor="middle" fill="#374151">{c.label}</text>
          </g>
        );
      })}
    </svg>
  );
};

const exportToPDF = () => {
  try {
    // build minimal printable HTML
    // (removed duplicate module-level exporter; use component-scoped exportToPDF)
  } catch (err) {
    console.error('Error exporting PDF', err);
    alert('No se pudo generar el PDF. Por favor permita ventanas emergentes y vuelva a intentarlo.');
  }
};

export default CompetencyAnalysis;

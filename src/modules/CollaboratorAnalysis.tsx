import { useEffect, useState, Fragment } from 'react';
import { supabase, Evaluation } from '../lib/supabase';
import { X } from 'lucide-react';

interface Props {
  evaluation: Evaluation;
  onClose: () => void;
}

// This component provides a focused analysis flow for collaborator (employee) evaluations.
// It intentionally avoids fuzzy category matching and uses only questions that belong to the
// same template_id and that have a response in the current evaluation.
export default function CollaboratorAnalysis({ evaluation, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  // categories kept implicit in breakdown keys
  const [global, setGlobal] = useState<number>(0);
  const [breakdown, setBreakdown] = useState<any[]>([]);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawSectionsState, setRawSectionsState] = useState<any[] | null>(null);
  const [rawQuestionsState, setRawQuestionsState] = useState<any[] | null>(null);
  const [rawResponsesState, setRawResponsesState] = useState<any[] | null>(null);
  const [rawTemplateState, setRawTemplateState] = useState<any | null>(null);
  const [collaborator, setCollaborator] = useState<any>(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluation.id]);

  function normalizeForMatch(s?: string | null) {
    if (!s) return '';
    return String(s)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .toLowerCase()
      .trim();
  }

  function matchesCategory(compKey: string, category: string | null) {
    if (!category) return false;
    const a = normalizeForMatch(compKey);
    const b = normalizeForMatch(category);
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const atoks = a.split(/\s+/).filter(Boolean);
    const btoks = b.split(/\s+/).filter(Boolean);
    if (atoks.some((t) => btoks.includes(t))) return true;
    return false;
  }

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: sections }, { data: questions }, { data: responses }] = await Promise.all([
        supabase.from('evaluation_sections').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_questions').select('*').eq('template_id', evaluation.template_id),
        supabase.from('evaluation_responses').select('*').eq('evaluation_id', evaluation.id),
      ]);

      const { data: collabData } = await supabase.from('colaboradores').select(`
        *,
        collaborator_offices (
          offices (
            id,
            name
          )
        )
      `).eq('id', evaluation.evaluated_id).maybeSingle();

      const sectionsList: any[] = sections || [];
      const questionsList: any[] = questions || [];
      const responsesList: any[] = responses || [];

      if (collabData) {
        setCollaborator({
          ...collabData,
          offices: collabData.collaborator_offices?.map((co: any) => co.offices).filter(Boolean) || []
        });
      }

  // shared containers/vars used across the function (declare early to avoid TDZ runtime errors)
  const breakdownArr: any[] = [];
  let globalSum = 0;
  let catQs: Record<string, any[]> = {};
  let rawWeightsFromQs: Record<string, number> = {};
  let totalRawFromQs = 0;
  let usedKeys: string[] = [];
  let rawWeights: Record<string, number> = {};
  let anyWeights = false;

  // populate raw debug states so the UI can display DB rows for debugging
  setRawSectionsState(sectionsList.slice(0, 200));
  setRawQuestionsState(questionsList.slice(0, 500));
  setRawResponsesState(responsesList.slice(0, 500));

      // map section id -> category
      const sectionCategory: Record<string, string | null> = {};
      sectionsList.forEach((s) => { sectionCategory[s.id] = s.category || null; });

      const respMap: Record<string, any> = {};
      responsesList.forEach((r) => { respMap[r.question_id] = r.response_value; });

      // If there are no raw responses, try to use stored evaluation_results as a fallback
      let storedResult: any = null;
      if ((responsesList || []).length === 0) {
        try {
          const { data: resultsData } = await supabase.from('evaluation_results').select('overall_score,category_scores').eq('evaluation_id', evaluation.id).limit(1);
          if (resultsData && resultsData.length > 0) storedResult = resultsData[0];
        } catch (err) {
          console.error('Error loading stored evaluation_results fallback:', err);
        }
      }

      // load template categories if present to match stored category keys strictly
      let templateRow: any = null;
      let templateCategories: string[] | null = null;
      try {
        const { data: tmplData } = await supabase.from('evaluation_templates').select('type,categories').eq('id', evaluation.template_id).limit(1);
        if (tmplData && tmplData.length > 0) {
          templateRow = tmplData[0];
          templateCategories = Array.isArray(templateRow.categories) ? templateRow.categories : null;
          setRawTemplateState(templateRow);
        }
      } catch (err) {
        // ignore
      }

      // group questions by category using responses: find the question by response.question_id
      const catMap: Record<string, any[]> = {};
      const questionsById: Record<string, any> = {};
      questionsList.forEach((q) => { questionsById[q.id] = q; });

      const unmatchedResponseIds: string[] = [];
      for (const r of responsesList) {
        const q = questionsById[r.question_id];
        if (!q) {
          // question not found in current template's question list - record for debug
          unmatchedResponseIds.push(r.question_id);
          continue;
        }
        if (!q.template_id || q.template_id !== evaluation.template_id) {
          // record questions that exist but belong to a different template
          if (!debugInfo) debugInfo; // noop to satisfy linter scope
        }
        if (!q.template_id || q.template_id !== evaluation.template_id) continue; // ensure template uuid match
        const secCat = q.section_id ? sectionCategory[q.section_id] : null;
        const cat = secCat ?? (q.category || 'Sin categoría');
        if (!catMap[cat]) catMap[cat] = [];
        // avoid duplicates if multiple responses for same question
        if (!catMap[cat].some((existing) => existing.id === q.id)) {
          catMap[cat].push(q);
        }
      }

      // basic debug info collected; final debug will include mapping details after we compute breakdown
      const questionsSameTemplate = questionsList.filter((q) => q.template_id === evaluation.template_id).length;
      const questionsWrongTemplate = questionsList.filter((q) => q.template_id && q.template_id !== evaluation.template_id).map((q) => ({ id: q.id, template_id: q.template_id }));
      const matchedCount = Object.values(catMap).reduce((s, arr) => s + (arr?.length || 0), 0);
      const baseDebug: any = {
        evaluation_id: evaluation.id,
        template_id: evaluation.template_id,
        totalQuestions: questionsList.length,
        totalResponses: responsesList.length,
        questionsSameTemplate,
        questionsWrongTemplateSample: questionsWrongTemplate.slice(0, 10),
        unmatchedResponseIds: unmatchedResponseIds.slice(0, 20),
        matchedCount,
        catMapKeys: Object.keys(catMap),
        responsesRaw: responsesList.slice(0, 50),
        storedResultRaw: storedResult || null,
      };

      // compute per-category averages and derive weights
      for (const k of Object.keys(catMap)) {
        const list = catMap[k];
        if ((list || []).some((qq) => Number(qq.weight || 0) > 0)) anyWeights = true;
      }

      // If storedResult exists and no raw responses, build breakdown from stored category_scores
      if (storedResult && (!responsesList || responsesList.length === 0)) {
        const catObj = storedResult.category_scores || {};

  // derive raw weights per template category from questions (sum weights or counts)
  catQs = {};
        // fill keys from templateCategories if available, otherwise will use section/category strings
        if (Array.isArray(templateCategories) && templateCategories.length > 0) {
          for (const c of templateCategories) catQs[c] = [];
        }

        for (const q of questionsList) {
          if (!q.template_id || q.template_id !== evaluation.template_id) continue;
          const secId = q.section_id;
          const cat = secId ? sectionCategory[secId] : (q.category || null);
          if (!cat) continue;
            if (Array.isArray(templateCategories) && templateCategories.length > 0) {
            const found = templateCategories.find((tc) => matchesCategory(tc, cat));
            if (found) catQs[found].push(q);
          } else {
            if (!catQs[cat]) catQs[cat] = [];
            catQs[cat].push(q);
          }
        }

        // detect whether questions use explicit weights
        let globalHasWeights = false;
        for (const k of Object.keys(catQs)) {
          if ((catQs[k] || []).some((qq) => Number(qq.weight || 0) > 0)) { globalHasWeights = true; break; }
        }
        rawWeightsFromQs = {};
        for (const k of Object.keys(catQs)) {
          const list = catQs[k] || [];
          rawWeightsFromQs[k] = globalHasWeights ? list.reduce((s, qq) => s + (Number(qq.weight || 0) || 0), 0) : list.filter((qq) => qq.question_type === 'rating').length;
        }

        totalRawFromQs = Object.values(rawWeightsFromQs).reduce((s, v) => s + (v || 0), 0) || 0;

  // Prefer using template-defined categories when available: iterate templateCategories
    usedKeys = [];
        if (Array.isArray(templateCategories) && templateCategories.length > 0) {
          for (const tc of templateCategories) {
            // find if stored result has a key that matches this template category
            const storedMatchKey = Object.keys(catObj).find((sk) => matchesCategory(tc, sk));
            const avg = storedMatchKey ? (typeof catObj[storedMatchKey] === 'number' ? catObj[storedMatchKey] : Number(catObj[storedMatchKey]) || 0) : 0;
            const weightPercent = totalRawFromQs > 0 && rawWeightsFromQs[tc] != null ? Math.round((rawWeightsFromQs[tc] / totalRawFromQs) * 10000) / 100 : (templateCategories.length ? Math.round((100 / templateCategories.length) * 100) / 100 : 0);
            const impacto = Math.round((avg * (weightPercent / 100)) * 100) / 100;
            breakdownArr.push({ category: tc, count: (catQs[tc] || []).length, sumWeights: rawWeightsFromQs[tc] || 0, weightPercent, avg, impacto, questions: [] });
            globalSum += impacto;
            if (storedMatchKey) usedKeys.push(storedMatchKey);
          }

          // include any leftover stored keys that didn't match templateCategories
          const leftover = Object.keys(catObj).filter((k) => !usedKeys.includes(k));
          if (leftover.length > 0) {
            const equalWeight = Math.round((100 / leftover.length) * 100) / 100;
            for (const sk of leftover) {
              const avg = typeof catObj[sk] === 'number' ? catObj[sk] : Number(catObj[sk]) || 0;
              const impacto = Math.round((avg * (equalWeight / 100)) * 100) / 100;
              breakdownArr.push({ category: sk, count: 0, sumWeights: 0, weightPercent: equalWeight, avg, impacto, questions: [] });
              globalSum += impacto;
            }
          }
        } else {
          // no template categories: try to map stored keys to section categories or use stored keys directly
          const storedKeys = Object.keys(catObj);
          for (const sk of storedKeys) {
            // try match to sectionCategory values
            const foundSec = Object.values(sectionCategory).find((sc) => sc ? matchesCategory(sk, sc) : false) as string | undefined;
            const outKey = foundSec || sk;
            const avg = typeof catObj[sk] === 'number' ? catObj[sk] : Number(catObj[sk]) || 0;
            const weightPercent = totalRawFromQs > 0 && rawWeightsFromQs[outKey] != null ? Math.round((rawWeightsFromQs[outKey] / totalRawFromQs) * 10000) / 100 : Math.round((100 / storedKeys.length) * 100) / 100;
            const impacto = Math.round((avg * (weightPercent / 100)) * 100) / 100;
            breakdownArr.push({ category: outKey, count: (catQs[outKey] || []).length || 0, sumWeights: rawWeightsFromQs[outKey] || 0, weightPercent, avg, impacto, questions: [] });
            globalSum += impacto;
          }
        }
      } else {
        for (const k of Object.keys(catMap)) {
        const list = catMap[k] || [];
        if (anyWeights) rawWeights[k] = list.reduce((s, q) => s + (Number(q.weight || 0) || 0), 0);
        else rawWeights[k] = list.filter((q) => q.question_type === 'rating').length;
        }
      }

  const totalRaw = Object.values(rawWeights).reduce((s, v) => s + (v || 0), 0) || 0;

      for (const k of Object.keys(catMap)) {
        const list = catMap[k] || [];
        // compute category average
        const hasWeights = anyWeights;
        let avg = 0;
        if (hasWeights) {
          let s = 0; let wsum = 0;
          for (const q of list) {
            if (q.question_type !== 'rating') continue;
            const v = respMap[q.id];
            const num = typeof v === 'number' ? v : Number(v);
            const w = Number(q.weight || 0) || 0;
            if (!isNaN(num)) { s += num * w; wsum += w; }
          }
          avg = wsum > 0 ? Math.round((s / wsum) * 100) / 100 : 0;
        } else {
          const ratings: number[] = [];
          for (const q of list) {
            if (q.question_type !== 'rating') continue;
            const v = respMap[q.id];
            const num = typeof v === 'number' ? v : Number(v);
            if (!isNaN(num)) ratings.push(num);
          }
          avg = ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : 0;
        }

        const weightPercent = totalRaw > 0 ? Math.round((rawWeights[k] / totalRaw) * 10000) / 100 : 0;
        const impacto = Math.round((avg * (weightPercent / 100)) * 100) / 100;
        breakdownArr.push({ category: k, count: list.length, sumWeights: rawWeights[k], weightPercent, avg, impacto, questions: list.map((q) => ({ id: q.id, text: q.question_text, type: q.question_type, weight: Number(q.weight || 0), response: respMap[q.id] })) });
        globalSum += impacto;
      }

      const finalGlobal = Math.round(globalSum * 100) / 100;

      // include mapping details in debug info for easier troubleshooting
      const debugExtras: any = {};
      if (storedResult && (!responsesList || responsesList.length === 0)) {
        debugExtras.templateCategories = templateCategories || null;
        debugExtras.catQs = Object.keys(catQs || {}).slice(0, 50);
        debugExtras.rawWeightsFromQs = rawWeightsFromQs || {};
        debugExtras.totalRawFromQs = totalRawFromQs || 0;
        debugExtras.matchedStoredKeys = (typeof usedKeys !== 'undefined') ? usedKeys : [];
      } else {
        debugExtras.rawWeights = rawWeights;
        debugExtras.anyWeights = anyWeights;
      }

      // categories derived from breakdown keys when needed
      setBreakdown(breakdownArr);
      setGlobal(finalGlobal);
      setDebugInfo({ ...baseDebug, ...debugExtras });
    } catch (err) {
      console.error('Error loading collaborator analysis', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const header = ['CATEGORÍA', 'PREGUNTAS', 'SUMA PESOS', 'PESO %', 'PUNTUACIÓN', 'IMPACTO'];
    const rows = breakdown.map((b) => [b.category, String(b.count), String(b.sumWeights), String(b.weightPercent), String(b.avg), String(b.impacto)]);
    const csv = [header, ...rows, ['PUNTUACIÓN GLOBAL', '', '', '100', String(global)]].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `collab_analysis_${evaluation.id}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  if (loading) return <div className="text-center py-8">Cargando informe para colaboradores...</div>;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-40 p-2 sm:p-4">
      <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg overflow-auto max-h-[95vh] p-4">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <div>
            <h3 className="text-lg font-bold">Informe - Colaboradores</h3>
            <div className="text-sm text-gray-600">Evaluación: {evaluation.id}</div>
            {collaborator && (
              <div className="text-sm text-gray-600 mt-1">
                Colaborador: {collaborator.full_name} ({collaborator.identification})<br />
                Oficinas: {collaborator.offices?.map((o: any) => o.name).join(', ') || 'Ninguna'}<br />
                Rol: {collaborator.role.replace('_', ' ')} | Campus: {collaborator.campus}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="px-3 py-2 bg-gray-100 rounded text-sm">Exportar CSV</button>
            <button onClick={onClose} className="p-2 rounded hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-2xl font-extrabold text-blue-600">{global.toFixed(2)} / 5.0</div>

          {debugInfo && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 text-xs text-yellow-800">
              <div className="font-semibold">Debug (diagnóstico rápido)</div>
              <pre className="whitespace-pre-wrap mt-2">{JSON.stringify(debugInfo, null, 2)}</pre>
            </div>
          )}

          <div className="bg-white border rounded">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left">Categoría</th>
                    <th className="p-3 text-right"># Preguntas</th>
                    <th className="p-3 text-right">Suma pesos</th>
                    <th className="p-3 text-right">Peso %</th>
                    <th className="p-3 text-right">Puntaje</th>
                    <th className="p-3 text-right">Impacto</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdown.map((b, i) => (
                    <Fragment key={`cb-${i}`}>
                      <tr className="border-t">
                        <td className="p-3">{b.category}</td>
                        <td className="p-3 text-right">{b.count}</td>
                        <td className="p-3 text-right">{b.sumWeights}</td>
                        <td className="p-3 text-right">{b.weightPercent}%</td>
                        <td className="p-3 text-right font-semibold">{(b.avg || 0).toFixed(2)}</td>
                        <td className="p-3 text-right">{(b.impacto || 0).toFixed(2)}</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="p-3">
                          <details>
                            <summary className="cursor-pointer text-sm text-blue-600">Ver preguntas ({(b.questions || []).length})</summary>
                            <div className="mt-2 text-xs">
                              <table className="w-full">
                                <thead>
                                  <tr>
                                    <th className="p-1 text-left">ID</th>
                                    <th className="p-1 text-left">Pregunta</th>
                                    <th className="p-1 text-right">Peso</th>
                                    <th className="p-1 text-right">Respuesta</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(b.questions || []).map((q: any, qi: number) => (
                                    <tr key={`cbq-${q.id || qi}`} className="border-t text-xs">
                                      <td className="p-1">{q.id}</td>
                                      <td className="p-1">{q.text}</td>
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
          </div>
          <div className="flex items-center justify-end">
            <button onClick={() => setShowRaw(!showRaw)} className="text-xs px-2 py-1 bg-gray-100 rounded">{showRaw ? 'Ocultar raw' : 'Mostrar raw'}</button>
          </div>
          {showRaw && (
            <div className="bg-gray-50 border rounded p-3 text-xs">
              <div className="font-semibold mb-2">Raw DB (debug)</div>
              <div className="grid grid-cols-1 gap-2">
                <div>
                  <div className="font-medium">Template</div>
                  <pre className="whitespace-pre-wrap">{JSON.stringify(rawTemplateState || {}, null, 2)}</pre>
                </div>
                <div>
                  <div className="font-medium">Sections (first 200)</div>
                  <pre className="whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(rawSectionsState || [], null, 2)}</pre>
                </div>
                <div>
                  <div className="font-medium">Questions (first 500)</div>
                  <pre className="whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(rawQuestionsState || [], null, 2)}</pre>
                </div>
                <div>
                  <div className="font-medium">Responses (first 500)</div>
                  <pre className="whitespace-pre-wrap max-h-40 overflow-auto">{JSON.stringify(rawResponsesState || [], null, 2)}</pre>
                </div>
                {/* Stored Result removed from debug display; kept in debugInfo if needed */}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

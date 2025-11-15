import { useEffect, useState, Fragment } from 'react';
import { supabase, Evaluation } from '../lib/supabase';
import { X } from 'lucide-react';

interface Props {
  evaluation: Evaluation;
  onClose: () => void;
}

interface SectionSummaryRow {
  sectionId: string | null;
  sectionName: string;
  avg: number | null;
  questions: Array<{ id: string; text: string; type: string; weight?: number; response?: any }>;
}

export default function SectionAnalysis({ evaluation, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<SectionSummaryRow[]>([]);
  const [global, setGlobal] = useState<number>(0);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => { load(); }, [evaluation.id]);

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

      const respMap: Record<string, any> = {};
      responsesList.forEach((r) => { respMap[r.question_id] = r.response_value; });

      const built: SectionSummaryRow[] = sectionsList.map((s) => {
        const qs = (questionsList || []).filter((q: any) => q.section_id === s.id);
        const qDetails = qs.map((q: any) => ({ id: q.id, text: q.question_text || '', type: q.question_type, weight: Number(q.weight || 0), response: respMap[q.id] }));
        const ratingQs = qDetails.filter((q) => q.type === 'rating' && q.response !== undefined && q.response !== null);
        const hasWeights = ratingQs.some((q) => Number(q.weight || 0) > 0);
        let avg: number | null = null;
        if (ratingQs.length > 0) {
          if (hasWeights) {
            let ssum = 0; let wsum = 0;
            ratingQs.forEach((q) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
            avg = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : null;
          } else {
            const vals = ratingQs.map((q) => Number(q.response));
            avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
          }
        }
        return { sectionId: s.id, sectionName: s.name || s.title || `Sección ${s.id}` , avg, questions: qDetails };
      });

      // compute global weighted by question weights across all sections (rating only)
      const allRating = built.flatMap((s) => s.questions.filter((q) => q.type === 'rating'));
      const anyW = allRating.some((q) => Number(q.weight || 0) > 0);
      let globalScore = 0;
      if (allRating.length > 0) {
        if (anyW) {
          let ssum = 0; let wsum = 0;
          allRating.forEach((q) => { const v = Number(q.response); const w = Number(q.weight || 0); if (!isNaN(v)) { ssum += v * w; wsum += w; } });
          globalScore = wsum > 0 ? Math.round((ssum / wsum) * 100) / 100 : 0;
        } else {
          const vals = allRating.map((q) => Number(q.response)).filter((v) => !isNaN(v));
          globalScore = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
        }
      }

      setSections(built);
      setGlobal(globalScore);
    } catch (err) {
      console.error('Error loading section analysis', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    try {
      const header = ['SECCIÓN', 'PROMEDIO', 'PREGUNTA', 'TIPO', 'PESO', 'RESPUESTA'];
      const rows: any[] = [];
      (sections || []).forEach((s) => {
        if ((s.questions || []).length === 0) {
          rows.push([s.sectionName, s.avg ?? '', '', '', '', '']);
        } else {
          s.questions.forEach((q: any, idx: number) => {
            rows.push([idx === 0 ? s.sectionName : '', idx === 0 ? (s.avg ?? '') : '', q.text, q.type, q.weight ?? '', q.response ?? '']);
          });
        }
      });
      const footer = ['GLOBAL', global.toFixed(2), '', '', '', ''];
      const csv = [header, ...rows, footer]
        .map((r: any[]) => r.map((c: any) => `"${String(c).replace(/\"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analisis_secciones_${evaluation.id}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting CSV', err);
      alert('No se pudo exportar CSV.');
    }
  };

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white p-4 rounded">Cargando análisis por sección...</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black bg-opacity-40 p-2 sm:p-4">
      <div className="bg-white w-full max-w-[95vw] sm:max-w-3xl rounded-lg shadow-lg overflow-auto max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-xl font-bold">Análisis por Sección</h2>
            <p className="text-sm text-gray-600">Evaluación: {evaluation.id}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} className="px-3 py-2 bg-gray-100 rounded-md text-sm">Exportar CSV</button>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-gray-100"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-sm text-gray-600">Puntuación global (ponderada por pregunta): <span className="font-semibold">{global.toFixed(2)} / 5.0</span></div>

          <div className="bg-white border rounded">
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left text-sm">Sección</th>
                    <th className="p-3 text-right text-sm">Promedio</th>
                    <th className="p-3 text-center text-sm">Ver</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((s, idx) => (
                    <Fragment key={s.sectionId || idx}>
                      <tr className={`border-t ${s.avg !== null && s.avg < 3 ? 'bg-red-50' : ''}`}>
                        <td className={`p-3 align-middle ${s.avg !== null && s.avg < 3 ? 'text-red-700' : ''}`}>{s.sectionName}</td>
                        <td className={`p-3 align-middle text-right ${s.avg !== null && s.avg < 3 ? 'text-red-700' : ''}`}>{s.avg !== null ? s.avg.toFixed(2) : '—'}</td>
                        <td className="p-3 align-middle text-center">
                          <button onClick={() => setExpanded(expanded === idx ? null : idx)} className="text-sm text-blue-600">{expanded === idx ? 'Ocultar' : 'Ver'}</button>
                        </td>
                      </tr>
                      {expanded === idx && (
                        <tr className="bg-gray-50">
                          <td colSpan={3} className="p-4 text-sm text-gray-700">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    <th className="text-left p-1">Pregunta</th>
                                    <th className="text-right p-1">Tipo</th>
                                    <th className="text-right p-1">Peso</th>
                                    <th className="text-right p-1">Respuesta</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.questions.map((q) => (
                                    <tr key={q.id} className="border-t">
                                      <td className="p-1">{q.text}</td>
                                      <td className="p-1 text-right">{q.type}</td>
                                      <td className="p-1 text-right">{q.weight ?? 0}</td>
                                      <td className="p-1 text-right">{q.response ?? '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

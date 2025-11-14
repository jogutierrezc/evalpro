import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase, EvaluationQuestion, FormType } from '../../lib/supabase';

type ParsedRow = {
  section?: string;
  question?: string;
  type?: string;
  weight?: number;
};

export default function TemplateImport({ onClose, onImported }: { onClose: () => void; onImported: () => void; }) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formTypes, setFormTypes] = useState<FormType[]>([]);
  const [selectedFormType, setSelectedFormType] = useState<string>('soft_skills');
  const [typeMapping, setTypeMapping] = useState<Record<string, 'rating' | 'text' | 'multiple_choice'>>({});

  useEffect(() => { loadFormTypes(); }, []);

  async function loadFormTypes() {
    try {
      const { data } = await supabase.from('form_types').select('*').order('created_at', { ascending: false });
      setFormTypes((data as any) || []);
      if (data && data.length) setSelectedFormType((data as any)[0].key);
    } catch (err) {
      console.error('Error loading form types', err);
    }
  }

  function parseFile(f: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

      // map columns ignoring case/accents
      const parsed: ParsedRow[] = (json || []).map((r: any) => {
        const keys = Object.keys(r);
        const map: any = {};
        keys.forEach((k) => {
          const kk = k.toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
          // detect 'tipo' before 'pregunta' because header like 'Tipo de Pregunta' contains 'pregunta'
          if (kk.includes('tipo') || kk.includes('type')) map.type = r[k];
          else if (kk.includes('seccion') || kk.includes('section')) map.section = r[k];
          else if (kk.includes('pregunta') || kk.includes('question')) map.question = r[k];
          else if (kk.includes('ponder') || kk.includes('peso') || kk.includes('ponderacion') || kk.includes('weight')) map.weight = Number(r[k]) || 0;
        });
        // ensure question text is trimmed and keep rows without section (they'll go to 'General')
        if (map.question && typeof map.question === 'string') map.question = map.question.trim();
        return map as ParsedRow;
      }).filter(p => p.question && String(p.question).length > 0);

      setRows(parsed);
      // initialize typeMapping for unique values
      const uniques = Array.from(new Set(parsed.map(r => (r.type || '').toString()).filter(Boolean)));
      const map: any = {};
      uniques.forEach(u => { map[u] = 'rating'; });
      setTypeMapping(map);
    };
    reader.readAsArrayBuffer(f);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    if (f) parseFile(f);
  }

  function buildSections() {
    const grouped: Record<string, ParsedRow[]> = {};
    for (const r of rows) {
      const sec = (r.section && r.section.toString()) || 'General';
      if (!grouped[sec]) grouped[sec] = [];
      grouped[sec].push(r);
    }
    return Object.entries(grouped).map(([title, items]) => ({ title, questions: items }));
  }

  async function doImport() {
    if (!formName) { alert('Proporciona un nombre para el formulario'); return; }
    setLoading(true);
    try {
      // validate template type against allowed DB check constraint
      const ALLOWED_TYPES = ['soft_skills', 'self_evaluation', 'manager_to_employee', 'employee_to_manager'];
      const typeToUse = ALLOWED_TYPES.includes(selectedFormType) ? selectedFormType : 'soft_skills';
      if (!ALLOWED_TYPES.includes(selectedFormType)) {
        console.warn('Selected form type is not allowed by DB constraint, falling back to', typeToUse);
      }
      // create template
      const { data, error } = await supabase.from('evaluation_templates').insert([{ name: formName, description: formDesc || null, type: typeToUse, is_active: true }]).select().single();
      if (error) throw error;
      const templateId = data.id;

      const sections = buildSections();
      for (let sIndex = 0; sIndex < sections.length; sIndex++) {
        const sec = sections[sIndex];
        const { data: secData, error: secErr } = await supabase.from('evaluation_sections').insert([{ template_id: templateId, title: sec.title, order_index: sIndex }]).select().single();
        if (secErr) throw secErr;
        const secId = secData.id;

        const questionsToInsert: Partial<EvaluationQuestion & { weight?: number }>[] = sec.questions.map((q: ParsedRow, qi: number) => ({
          template_id: templateId,
          section_id: secId,
          question_text: q.question || '',
          question_type: (typeMapping[q.type || ''] || 'rating'),
          options: null,
          weight: typeof q.weight === 'number' ? q.weight : 0,
          order_index: (sIndex * 1000) + qi,
          order_in_section: qi + 1,
        }));

        if (questionsToInsert.length > 0) {
          const { error: qErr } = await supabase.from('evaluation_questions').insert(questionsToInsert);
          if (qErr) throw qErr;
        }
      }

      alert('Importación completada');
      onImported();
      onClose();
    } catch (err: any) {
      console.error('Import error', err);
      alert('Error durante importación: ' + (err.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-3">Importar Formulario desde Excel</h3>
      <div className="grid gap-3">
        <div>
          <label className="block text-sm">Archivo Excel</label>
          <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
        </div>
        <div>
          <label className="block text-sm">Nombre del Formulario</label>
          <input className="w-full border p-2 rounded" value={formName} onChange={(e) => setFormName(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">Descripción (opcional)</label>
          <input className="w-full border p-2 rounded" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm">Tipo de formulario</label>
          <select className="w-full border p-2 rounded" value={selectedFormType} onChange={(e) => setSelectedFormType(e.target.value)}>
            {formTypes.map(ft => <option key={ft.id} value={ft.key}>{ft.label}</option>)}
          </select>
        </div>

        {rows.length > 0 && (
          <div className="border rounded p-3 bg-white">
            <div className="mb-2 font-medium">Previsualización: {Object.keys(rows.reduce((acc:any, r) => { acc[r.section||'General']=1; return acc; }, {})).length} secciones</div>
            <div className="mb-2 text-sm text-slate-600">Asignar tipos detectados a tipos internos</div>
            <div className="space-y-2">
              {Array.from(new Set(rows.map(r => r.type || ''))).filter(Boolean).map((val) => (
                <div key={val} className="flex items-center gap-3">
                  <div className="w-40 text-sm">{val}</div>
                  <select className="border p-1 rounded" value={typeMapping[val]} onChange={(e) => setTypeMapping({ ...typeMapping, [val]: e.target.value as any })}>
                    <option value="rating">Escala (rating)</option>
                    <option value="text">Texto libre</option>
                    <option value="multiple_choice">Opción múltiple</option>
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-3 text-sm">
              <div className="font-medium">Secciones y cantidad de preguntas</div>
              <ul className="mt-2">
                {buildSections().map((s, i) => (
                  <li key={i} className="text-sm">{s.title}: {s.questions.length} preguntas</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="px-3 py-2 rounded border" onClick={onClose}>Cancelar</button>
          <button className="px-3 py-2 rounded bg-blue-600 text-white" onClick={doImport} disabled={loading}>{loading ? 'Importando...' : 'Importar y Crear'}</button>
        </div>
      </div>
    </div>
  );
}

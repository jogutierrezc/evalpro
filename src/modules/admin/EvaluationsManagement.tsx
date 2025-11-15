import { useEffect, useMemo, useState } from 'react';
import { supabase, EvaluationTemplate, User } from '../../lib/supabase';
import { ChevronDown } from 'lucide-react';

export function EvaluationsManagement() {
  const [loading, setLoading] = useState(true);
  const [campusMap, setCampusMap] = useState<Record<string, {
    offices: Record<string, { users: User[]; templatesByUser: Record<string, EvaluationTemplate[]>; evaluationsByUser?: Record<string, any[]> }>
  }>>({});
  const [officesMap, setOfficesMap] = useState<Record<string, { id: string; name: string }>>({});
  const [selectedCampus, setSelectedCampus] = useState<string>('');
  const [selectedOffice, setSelectedOffice] = useState<string>('');
  const [openOffice, setOpenOffice] = useState<string | null>(null);
  const [progressByEval, setProgressByEval] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, []);

  const resolveCanonicalRole = async (role: string) => {
    if (!role) return role;
    try {
      const { data: roles } = await supabase.from('roles').select('key,label');
      if (roles && roles.length > 0) {
        const byKey = roles.find((r: any) => r.key === role);
        if (byKey) return byKey.key;
        const byLabel = roles.find((r: any) => (r.label || '').toString().toLowerCase() === role.toString().toLowerCase());
        if (byLabel) return byLabel.key;
      }
    } catch (e) {
      // ignore and fallback to original
    }
    return role;
  };

  const resolveTemplatesForUser = async (u: User) => {
    const canonical = await resolveCanonicalRole(u.role || '');
    // find form_types via relations where evaluated_role_key = canonical
    const { data: rels } = await supabase.from('form_type_relations').select('form_type_key').eq('evaluated_role_key', canonical);
    const relKeys = (rels || []).map((r: any) => r.form_type_key);

    // find form_types whose roles include canonical
    const { data: fts } = await supabase.from('form_types').select('key').filter('roles', 'cs', `{${canonical}}`);
    const ftKeysFromRoles = (fts || []).map((f: any) => f.key);

    const finalKeys = Array.from(new Set([...(relKeys || []), ...(ftKeysFromRoles || [])]));
    if (finalKeys.length === 0) return [] as EvaluationTemplate[];

    const { data: templates } = await supabase.from('evaluation_templates').select('*').eq('is_active', true).in('type', finalKeys).order('created_at', { ascending: false });
    return (templates || []) as EvaluationTemplate[];
  };

  const resolveEvaluationsForUser = async (u: User) => {
    try {
      const { data: evals } = await supabase.from('evaluations').select('*').eq('evaluated_id', u.id).order('created_at', { ascending: false });
      if (!evals || evals.length === 0) return [];
      // fetch templates, evaluators and evaluated users for evaluations
      const templateIds = Array.from(new Set((evals || []).map((e: any) => e.template_id))).filter(Boolean);
      const evaluatorIds = Array.from(new Set((evals || []).map((e: any) => e.evaluator_id))).filter(Boolean);
      const evaluatedIds = Array.from(new Set((evals || []).map((e: any) => e.evaluated_id))).filter(Boolean);
      
      const [{ data: templates }, { data: evaluators }, { data: evaluated }] = await Promise.all([
        supabase.from('evaluation_templates').select('*').in('id', templateIds),
        supabase.from('users').select('*').in('id', evaluatorIds),
        supabase.from('users').select('*').in('id', evaluatedIds),
      ]);
      
      const tplMap: Record<string, EvaluationTemplate> = {};
      (templates || []).forEach((t: any) => { tplMap[t.id] = t; });
      
      const evaluatorMap: Record<string, User> = {};
      (evaluators || []).forEach((e: any) => { evaluatorMap[e.id] = e; });
      
      const evaluatedMap: Record<string, User> = {};
      (evaluated || []).forEach((e: any) => { evaluatedMap[e.id] = e; });
      
      return (evals || []).map((ev: any) => ({ 
        ...ev, 
        template: tplMap[ev.template_id] || null,
        evaluator: evaluatorMap[ev.evaluator_id] || null,
        evaluated: evaluatedMap[ev.evaluated_id] || null,
      }));
    } catch (err) {
      console.warn('Error loading evaluations for user', u.id, err);
      return [];
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: users }, { data: offices }] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('*'),
      ]);

      const officesMapLocal: Record<string, { id: string; name: string }> = {};
      (offices || []).forEach((o: any) => { officesMapLocal[o.id] = { id: o.id, name: o.name }; });
      setOfficesMap(officesMapLocal);

      // group by campus -> office
      const map: Record<string, any> = {};

      for (const u of (users || []) as User[]) {
        const campus = u.campus || 'Sin campus';
        const office = u.office_id || 'Sin oficina';
        if (!map[campus]) map[campus] = { offices: {} };
        if (!map[campus].offices[office]) map[campus].offices[office] = { users: [], templatesByUser: {} };
        map[campus].offices[office].users.push(u);
      }

      // for each user fetch allowed templates and recent evaluations
      for (const campus of Object.keys(map)) {
        for (const office of Object.keys(map[campus].offices)) {
          const usersList: User[] = map[campus].offices[office].users;
          for (const u of usersList) {
            const [tplList, evalList] = await Promise.all([resolveTemplatesForUser(u), resolveEvaluationsForUser(u)]);
            map[campus].offices[office].templatesByUser[u.id] = tplList;
            map[campus].offices[office].evaluationsByUser = map[campus].offices[office].evaluationsByUser || {};
            map[campus].offices[office].evaluationsByUser[u.id] = evalList;
          }
        }
      }

      setCampusMap(map);

      // initialize campus selection to first available if not set
      if (!selectedCampus) {
        const firstCampus = Object.keys(map)[0] || '';
        setSelectedCampus(firstCampus);
      }
    } catch (err) {
      console.error('Error loading admin evaluations view', err);
    } finally {
      setLoading(false);
    }
  };

  // Build a grouped list of evaluations by office considering filters
  const groupedByOffice = useMemo(() => {
    const items: Array<{ officeId: string; officeName: string; evaluations: any[] }> = [];
    const campusKeys = selectedCampus ? [selectedCampus] : Object.keys(campusMap);
    campusKeys.forEach((campus) => {
      const campusData = campusMap[campus];
      if (!campusData) return;
      const officeIds = selectedOffice ? [selectedOffice] : Object.keys(campusData.offices);
      officeIds.forEach((oid) => {
        const of = campusData.offices[oid];
        if (!of) return;
        const evals: any[] = [];
        const evalByUser = of.evaluationsByUser || {};
        Object.keys(evalByUser).forEach((uid) => {
          (evalByUser[uid] || []).forEach((ev: any) => {
            evals.push(ev);
          });
        });
        const name = officesMap[oid]?.name || oid;
        items.push({ officeId: oid, officeName: name, evaluations: evals });
      });
    });
    return items;
  }, [campusMap, officesMap, selectedCampus, selectedOffice]);

  // Compute progress for current grouped evaluations (responses vs rating questions)
  useEffect(() => {
    const compute = async () => {
      try {
        const evals = groupedByOffice.flatMap((g) => g.evaluations);
        if (evals.length === 0) { setProgressByEval({}); return; }
        const evalIds = Array.from(new Set((evals || []).map((e: any) => e.id)));
        const templateIds = Array.from(new Set((evals || []).map((e: any) => e.template_id))).filter(Boolean);

        const [{ data: questions }, { data: responses }] = await Promise.all([
          supabase.from('evaluation_questions').select('id,template_id,question_type,weight').in('template_id', templateIds),
          supabase.from('evaluation_responses').select('evaluation_id,question_id,response_value').in('evaluation_id', evalIds),
        ]);
        const qByTemplate: Record<string, any[]> = {};
        (questions || []).forEach((q: any) => {
          const arr = qByTemplate[q.template_id] || (qByTemplate[q.template_id] = []);
          arr.push(q);
        });
        const respByEval: Record<string, any[]> = {};
        (responses || []).forEach((r: any) => {
          const arr = respByEval[r.evaluation_id] || (respByEval[r.evaluation_id] = []);
          arr.push(r);
        });

        const prog: Record<string, number> = {};
        evalIds.forEach((eid) => {
          const ev = evals.find((e: any) => e.id === eid);
          if (!ev) return;
          const qs = (qByTemplate[ev.template_id] || []).filter((q: any) => q.question_type === 'rating');
          const denom = qs.length || 0;
          const answered = (respByEval[eid] || []).filter((r: any) => qs.some((q: any) => q.id === r.question_id)).length;
          const pct = denom > 0 ? Math.max(0, Math.min(100, Math.round((answered / denom) * 100))) : 0;
          prog[String(eid)] = pct;
        });
        setProgressByEval(prog);
      } catch (e) {
        // safe fallback
        setProgressByEval({});
      }
    };
    compute();
  }, [groupedByOffice]);

  const campusList = Object.keys(campusMap);
  if (loading) return <div className="py-8 text-center">Cargando evaluaciones...</div>;

  return (
    <div className="p-1 sm:p-2">
      <h2 className="text-xl font-semibold mb-4">Evaluaciones por Campus y Oficina</h2>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-xl border mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Campus</label>
          <select
            value={selectedCampus}
            onChange={(e) => { setSelectedCampus(e.target.value); setSelectedOffice(''); setOpenOffice(null); }}
            className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">-- Todos los Campus --</option>
            {campusList.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-sm font-medium text-gray-700 mb-1">Oficina</label>
          <select
            value={selectedOffice}
            onChange={(e) => { setSelectedOffice(e.target.value); setOpenOffice(null); }}
            className="p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60 disabled:bg-gray-100"
            disabled={!selectedCampus}
          >
            <option value="">-- Todas las Oficinas ({selectedCampus || 'Selecciona Campus'}) --</option>
            {selectedCampus && Object.keys(campusMap[selectedCampus]?.offices || {}).map((oid) => (
              <option key={oid} value={oid}>{officesMap[oid]?.name || oid}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Resultados */}
      <div className="space-y-4">
        {groupedByOffice.length === 0 ? (
          <div className="p-6 text-center bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200">
            No se encontraron evaluaciones para los filtros seleccionados.
          </div>
        ) : (
          groupedByOffice.map((group) => (
            <div key={group.officeId} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
              <button
                onClick={() => setOpenOffice(openOffice === group.officeId ? null : group.officeId)}
                className="w-full flex items-center justify-between p-4 bg-indigo-50 hover:bg-indigo-100 transition"
              >
                <div className="text-indigo-900 font-semibold">
                  {group.officeName} <span className="text-sm text-indigo-700 font-normal">({group.evaluations.length} evaluaciones)</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-indigo-900 transition-transform ${openOffice === group.officeId ? 'rotate-180' : ''}`} />
              </button>
              {openOffice === group.officeId && (
                <div className="p-4 border-t">
                  <div className="space-y-3">
                    {group.evaluations.map((ev) => (
                      <div key={ev.id} className="p-4 border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
                          <div className="col-span-2 md:col-span-1">
                            <span className="font-bold text-gray-800 block md:hidden">Tipo:</span>
                            <span className="font-medium text-indigo-600">{ev.template?.name || 'Formulario'}</span>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="font-bold text-gray-800 block md:hidden">Evaluador:</span>
                            <span className="text-gray-700 truncate block">{ev.evaluator?.full_name || ev.evaluator_id}</span>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="font-bold text-gray-800 block md:hidden">Evaluado:</span>
                            <span className="text-gray-700 truncate block">{ev.evaluated?.full_name || ev.evaluated_id}</span>
                          </div>
                          <div className="col-span-2 md:col-span-1">
                            <span className="font-bold text-gray-800 block md:hidden">Ubicación:</span>
                            <span className="text-gray-500">{ev.evaluated?.campus || '—'} / {group.officeName}</span>
                          </div>
                          <div className="col-span-2 md:col-span-2">
                            <span className="font-bold text-gray-800 mr-2">Estado:</span>
                            <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${ev.status === 'completed' ? 'bg-green-100 text-green-800' : ev.status === 'in_progress' ? 'bg-blue-100 text-blue-800' : ev.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                              {ev.status === 'completed' ? 'Completada' : ev.status === 'in_progress' ? 'En Progreso' : ev.status === 'pending' ? 'Pendiente' : 'Vencida'}
                            </span>
                            <div className="mt-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-700 ease-out ${progressByEval[String(ev.id)] >= 100 ? 'bg-green-500' : progressByEval[String(ev.id)] > 50 ? 'bg-blue-500' : progressByEval[String(ev.id)] > 0 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                                   style={{ width: `${progressByEval[String(ev.id)] || 0}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{progressByEval[String(ev.id)] || 0}% completado</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default EvaluationsManagement;

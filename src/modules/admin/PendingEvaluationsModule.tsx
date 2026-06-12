import { useEffect, useState, useMemo } from 'react';
import { supabase, User } from '../../lib/supabase';import { AlertCircle, Filter, Building2, MapPin, RefreshCw,
  ChevronDown, ChevronRight, Clock, CheckCircle, Loader2,
  UserCheck, FileText, Search, XCircle, PlusCircle
} from 'lucide-react';


interface PendingItem {
  evaluationId?: string; // undefined for missing self-evals
  templateId?: string;  // for creating missing self-evals
  templateName: string;
  evaluatedName: string;
  status: string;
  isSelfEval: boolean;
}

interface EvaluatorData {
  userId: string;
  fullName: string;
  email: string | null;
  role: string;
  campus: string;
  officeName: string;
  pending: PendingItem[];
  inProgress: PendingItem[];
  completedCount: number;
  missingSelfEvals: PendingItem[];
}

interface GroupedCampus {
  campus: string;
  offices: {
    officeId: string;
    officeName: string;
    evaluators: EvaluatorData[];
  }[];
}

const normalizeStr = (s: any) =>
  (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export default function PendingEvaluationsModule() {
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [groupedData, setGroupedData] = useState<GroupedCampus[]>([]);
  const [campusList, setCampusList] = useState<string[]>([]);
  const [officesList, setOfficesList] = useState<{ id: string; name: string }[]>([]);
  const [expandedCampus, setExpandedCampus] = useState<Set<string>>(new Set());
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());
  const [expandedEvaluators, setExpandedEvaluators] = useState<Set<string>>(new Set());
  const [solvingId, setSolvingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activePeriodId, setActivePeriodId] = useState<string>('');

  // Filters
  const [filterCampus, setFilterCampus] = useState('');
  const [filterOffice, setFilterOffice] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { loadPendingEvaluations(); }, []);

  // ─── Pagination helper ───
  async function fetchAllEvals(periodId: string) {
    const all: any[] = [];
    const pageSize = 200;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('evaluations')
        .select('id, evaluator_id, evaluated_id, template_id, status')
        .eq('period_id', periodId)
        .range(from, to);
      if (error) throw error;
      if (data) all.push(...data);
      hasMore = data && data.length === pageSize;
      from += pageSize;
    }
    return all;
  }

  // ─── Cancel evaluation ───
  const cancelEvaluation = async (evalId: string, evalName: string) => {
    if (!window.confirm(`¿Forzar completado de "${evalName}"?
La evaluación se marcará como finalizada.`)) return;
    setSolvingId(evalId);
    setActionMsg(null);
    try {
      const { error } = await supabase
        .from('evaluations')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', evalId);
      if (error) throw error;
      setActionMsg({ type: 'success', text: `✅ Evaluación de "${evalName}" cancelada.` });
      setTimeout(() => { setActionMsg(null); loadPendingEvaluations(); }, 2000);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `❌ Error al cancelar "${evalName}": ${err.message}` });
    } finally {
      setSolvingId(null);
    }
  };

  // ─── Create evaluation ───
  const createSelfEvaluation = async (templateId: string, evaluatorId: string, templateName: string) => {
    if (!window.confirm(`¿Crear autoevaluación "${templateName}"?
Se creará una nueva evaluación pendiente.`)) return;
    setActionMsg(null);
    setSolvingId(`create-${templateId}-${evaluatorId}`);
    try {
      const { error } = await supabase.from('evaluations').insert({
        template_id: templateId,
        evaluator_id: evaluatorId,
        evaluated_id: evaluatorId,
        period_id: activePeriodId,
        status: 'pending',
      });
      if (error) throw error;
      setActionMsg({ type: 'success', text: `✅ Autoevaluación "${templateName}" creada.` });
      setTimeout(() => { setActionMsg(null); loadPendingEvaluations(); }, 2000);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: `❌ Error: ${err.message}` });
    } finally {
      setSolvingId(null);
    }
  };

  const loadPendingEvaluations = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(5);
    try {
      // 1. Active period — buscar primero por fecha, fallback al último período
      setLoadingStep('Detectando período activo...');
      const todayStr = new Date().toISOString().slice(0, 10);
      console.log('[PendingModule] todayStr:', todayStr);
      let { data: periods } = await supabase
        .from('evaluation_periods')
        .select('id, year, start_date, end_date, is_active')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
        .limit(1);

      let activePeriod = periods?.[0]?.is_active !== false ? periods?.[0] : null;

      // Fallback: si no hay período activo por fecha, tomar el último no desactivado
      if (!activePeriod) {
        setLoadingStep('Buscando último período disponible...');
        console.log('[PendingModule] No period by date, trying latest...');
        const { data: allPeriods } = await supabase
          .from('evaluation_periods')
          .select('id, year, start_date, end_date, is_active')
          .neq('is_active', false)
          .order('end_date', { ascending: false })
          .limit(1);
        activePeriod = allPeriods?.[0] || null;
      }

      if (!activePeriod) { setError('No hay período activo.'); setLoading(false); return; }
      setActivePeriodId(activePeriod.id);
      console.log('[PendingModule] Active period:', activePeriod.year, activePeriod.id);

      setLoadingStep(`Período ${activePeriod.year} — Cargando datos...`);
      setLoadingProgress(15);

      // 2. Load data — now includes form_type_relations
      const [
        evaluations,
        { data: templates },
        { data: users },
        { data: offices },
        { data: periodFormTypes },
        { data: formTypeRelations },
      ] = await Promise.all([
        fetchAllEvals(activePeriod.id),
        supabase.from('evaluation_templates').select('id, name, type').eq('is_active', true),
        supabase.from('users').select('id, full_name, email, role, campus, office_id'),
        supabase.from('offices').select('id, name'),
        supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', activePeriod.id),
        supabase.from('form_type_relations').select('form_type_key, evaluator_role_key, evaluated_role_key'),
      ]);

      setLoadingProgress(40);
      setLoadingStep('Procesando evaluaciones...');

      // Build maps
      const templateMap = Object.fromEntries((templates || []).map((t: any) => [t.id, t.name]));
      const officeMap = Object.fromEntries((offices || []).map((o: any) => [o.id, o.name]));
      setOfficesList((offices || []).map((o: any) => ({ id: o.id, name: o.name })));

      const userMap: Record<string, any> = {};
      const campuses = new Set<string>();
      (users || []).forEach((u: any) => {
        userMap[u.id] = u;
        campuses.add(u.campus || 'Sin Campus');
      });
      setCampusList(Array.from(campuses).sort());

      const allowedFormTypeKeys = new Set((periodFormTypes || []).map((r: any) => r.form_type_key));

      // Templates by type
      const templatesByType: Record<string, { id: string; name: string }[]> = {};
      (templates || []).forEach((t: any) => {
        if (!templatesByType[t.type]) templatesByType[t.type] = [];
        templatesByType[t.type].push({ id: t.id, name: t.name });
      });

      // ─── Self-eval relations from form_type_relations ───
      const selfEvalRelations = (formTypeRelations || []).filter(
        (r: any) => normalizeStr(r.evaluator_role_key) === normalizeStr(r.evaluated_role_key)
      );

      setLoadingProgress(60);
      setLoadingStep('Agrupando por evaluador...');

      // === STEP 1: Group evaluations by evaluator ===
      const byEvaluator: Record<string, {
        total: number; completed: number;
        pendingItems: PendingItem[]; inProgressItems: PendingItem[];
      }> = {};

      (evaluations || []).forEach((ev: any) => {
        if (!byEvaluator[ev.evaluator_id]) {
          byEvaluator[ev.evaluator_id] = { total: 0, completed: 0, pendingItems: [], inProgressItems: [] };
        }
        byEvaluator[ev.evaluator_id].total++;
        if (ev.status === 'completed') {
          byEvaluator[ev.evaluator_id].completed++;
        } else {
          const evaluatedUser = userMap[ev.evaluated_id];
          const item: PendingItem = {
            evaluationId: ev.id,
            templateName: templateMap[ev.template_id] || 'Evaluación',
            evaluatedName: evaluatedUser?.full_name || 'Desconocido',
            status: ev.status,
            isSelfEval: ev.evaluated_id === ev.evaluator_id,
          };
          if (ev.status === 'in_progress') {
            byEvaluator[ev.evaluator_id].inProgressItems.push(item);
          } else {
            byEvaluator[ev.evaluator_id].pendingItems.push(item);
          }
        }
      });

      // === STEP 2: Detect missing self-evaluations from form_type_relations ===
      const detectMissingSelfEvals = (user: any): PendingItem[] => {
        const missing: PendingItem[] = [];
        const userRoleNorm = normalizeStr(user.role || '');
        if (!userRoleNorm || selfEvalRelations.length === 0) return missing;

        for (const rel of selfEvalRelations) {
          if (normalizeStr(rel.evaluator_role_key) !== userRoleNorm) continue;
          if (!allowedFormTypeKeys.has(rel.form_type_key)) continue;
          const tmpls = templatesByType[rel.form_type_key] || [];
          for (const tpl of tmpls) {
            const exists = (evaluations || []).some(
              (ev: any) => ev.evaluator_id === user.id && ev.evaluated_id === user.id && ev.template_id === tpl.id
            );
            if (!exists) {
              missing.push({
                templateId: tpl.id,
                templateName: tpl.name,
                evaluatedName: user.full_name + ' (Autoevaluación)',
                status: 'not_done',
                isSelfEval: true,
              });
            }
          }
        }
        return missing;
      };

      // === STEP 3: Build evaluator list ===
      const allUserIds = new Set([
        ...Object.keys(byEvaluator),
        ...(users || []).map((u: any) => u.id),
      ]);

      const evaluators: EvaluatorData[] = [];
      for (const userId of allUserIds) {
        const userData = userMap[userId];
        if (!userData) continue;
        const dbData = byEvaluator[userId];
        const missingSelf = detectMissingSelfEvals(userData);
        const hasPending = dbData && (dbData.pendingItems.length > 0 || dbData.inProgressItems.length > 0);
        const hasMissingSelf = missingSelf.length > 0;
        if (!hasPending && !hasMissingSelf) continue;
        evaluators.push({
          userId, fullName: userData.full_name, email: userData.email,
          role: userData.role, campus: userData.campus || 'Sin Campus',
          officeName: officeMap[userData.office_id] || 'Sin Oficina',
          pending: dbData?.pendingItems || [], inProgress: dbData?.inProgressItems || [],
          completedCount: dbData?.completed || 0, missingSelfEvals: missingSelf,
        });
      }
      evaluators.sort((a, b) => a.fullName.localeCompare(b.fullName));

      // === STEP 4: Group by campus → office ===
      const grouped: Record<string, GroupedCampus> = {};
      for (const ev of evaluators) {
        const campus = ev.campus;
        const officeName = ev.officeName;
        if (!grouped[campus]) grouped[campus] = { campus, offices: [] };
        let oe = grouped[campus].offices.find(o => o.officeName === officeName);
        if (!oe) { oe = { officeId: officeName, officeName, evaluators: [] }; grouped[campus].offices.push(oe); }
        oe.evaluators.push(ev);
      }
      const result = Object.values(grouped).sort((a, b) => a.campus.localeCompare(b.campus));
      result.forEach(g => g.offices.sort((a, b) => a.officeName.localeCompare(b.officeName)));

      setGroupedData(result);
      setLoadingProgress(100);
      if (result.length > 0) setExpandedCampus(new Set([result[0].campus]));

    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Error al cargar');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // === FILTERS ===
  const filteredData = useMemo(() => {
    let data = groupedData;
    if (filterCampus) data = data.filter(g => g.campus === filterCampus);
    if (filterOffice) {
      data = data.map(g => ({
        ...g,
        offices: g.offices.filter(o => o.officeName === filterOffice),
      })).filter(g => g.offices.length > 0);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.map(g => ({
        ...g,
        offices: g.offices.map(o => ({
          ...o,
          evaluators: o.evaluators.filter(ev =>
            ev.fullName.toLowerCase().includes(term) ||
            ev.email?.toLowerCase().includes(term) ||
            ev.role?.toLowerCase().includes(term)
          ),
        })).filter(o => o.evaluators.length > 0),
      })).filter(g => g.offices.length > 0);
    }
    return data;
  }, [groupedData, filterCampus, filterOffice, searchTerm]);

  // === STATS ===
  const stats = useMemo(() => {
    let people = 0, totalPending = 0, totalMissing = 0;
    for (const g of filteredData) {
      for (const o of g.offices) {
        people += o.evaluators.length;
        for (const ev of o.evaluators) {
          totalPending += ev.pending.length + ev.inProgress.length;
          totalMissing += ev.missingSelfEvals.length;
        }
      }
    }
    return { people, totalPending, totalMissing };
  }, [filteredData]);

  const tgl = (set: Set<string>, id: string) => {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  };

  // === RENDER ===
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 rounded-full" />
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin" />
              <Loader2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 animate-pulse" />
            </div>
          </div>
          <p className="text-center text-gray-700 font-medium mb-4">{loadingStep}</p>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500" style={{ width: `${loadingProgress}%` }} />
          </div>
          <p className="text-center text-sm text-gray-500 mt-2">{loadingProgress}%</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-red-800 font-medium">Error</p>
          <p className="text-red-600 text-sm">{error}</p>
          <button onClick={loadPendingEvaluations} className="mt-2 text-sm text-red-700 underline">Reintentar</button>
        </div>
      </div>
    );
  }



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Evaluaciones Pendientes</h2>
          <p className="text-gray-500 text-sm">Usuarios con evaluaciones sin completar</p>
        </div>
        <button onClick={loadPendingEvaluations} disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          actionMsg.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {actionMsg.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg"><UserCheck className="w-5 h-5 text-blue-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{stats.people}</p><p className="text-sm text-gray-500">Personas con pendientes</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg"><FileText className="w-5 h-5 text-orange-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{stats.totalMissing}</p><p className="text-sm text-gray-500">Autoevaluaciones pendientes</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg"><Clock className="w-5 h-5 text-purple-600" /></div>
            <div><p className="text-2xl font-bold text-gray-900">{stats.totalPending}</p><p className="text-sm text-gray-500">Evaluaciones sin completar (BD)</p></div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                placeholder="Nombre o email..." className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
            <select value={filterCampus} onChange={e => setFilterCampus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Todos</option>
              {campusList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
            <select value={filterOffice} onChange={e => setFilterOffice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="">Todas</option>
              {officesList.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredData.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-green-800 font-semibold text-lg">¡Excelente!</p>
          <p className="text-green-600 text-sm">
            {searchTerm || filterCampus || filterOffice ? 'Sin resultados con los filtros' : 'Todos han completado sus evaluaciones.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map(group => (
            <div key={group.campus} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => setExpandedCampus(prev => tgl(prev, group.campus))}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-900">{group.campus}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {group.offices.reduce((s, o) => s + o.evaluators.length, 0)} con pendientes
                  </span>
                </div>
                {expandedCampus.has(group.campus) ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
              </button>

              {expandedCampus.has(group.campus) && (
                <div className="divide-y divide-gray-100">
                  {group.offices.map(office => (
                    <div key={office.officeId}>
                      <button onClick={() => setExpandedOffices(prev => tgl(prev, office.officeId))}
                        className="w-full flex items-center justify-between p-4 pl-8 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <span className="font-medium text-gray-800">{office.officeName}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{office.evaluators.length}</span>
                        </div>
                        {expandedOffices.has(office.officeId) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                      </button>

                      {expandedOffices.has(office.officeId) && (
                        <div className="bg-gray-50 px-4 pb-4 space-y-2">
                          {office.evaluators.map(evaluator => (
                            <div key={evaluator.userId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <button onClick={() => setExpandedEvaluators(prev => tgl(prev, evaluator.userId))}
                                className="w-full flex items-center justify-between p-3 hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                                    {evaluator.fullName.charAt(0)}
                                  </div>
                                  <div className="text-left">
                                    <p className="font-medium text-gray-900">{evaluator.fullName}</p>
                                    <p className="text-xs text-gray-500">{evaluator.role}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  {evaluator.missingSelfEvals.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                                      <FileText className="w-3 h-3" />{evaluator.missingSelfEvals.length} autoeval
                                    </span>
                                  )}
                                  {(evaluator.pending.length + evaluator.inProgress.length) > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                      <Clock className="w-3 h-3" />{evaluator.pending.length + evaluator.inProgress.length} sin completar
                                    </span>
                                  )}
                                  {evaluator.completedCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      <CheckCircle className="w-3 h-3" />{evaluator.completedCount} completadas
                                    </span>
                                  )}
                                  {expandedEvaluators.has(evaluator.userId) ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                </div>
                              </button>

                              {expandedEvaluators.has(evaluator.userId) && (
                                <div className="border-t border-gray-200 p-3 bg-gray-50 space-y-3 max-h-96 overflow-y-auto">
                                  {/* Missing self-evaluations */}
                                  {evaluator.missingSelfEvals.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-orange-700 uppercase mb-2">Autoevaluaciones pendientes:</p>
                                      {evaluator.missingSelfEvals.map((pe, i) => (
                                        <div key={`s-${i}`} className="flex items-center gap-3 p-2 bg-orange-50 border border-orange-200 rounded-lg mb-1">
                                          <FileText className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{pe.templateName}</p>
                                            <p className="text-xs text-gray-500">{evaluator.fullName}</p>
                                          </div>
                                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs whitespace-nowrap">No realizada</span>
                                          {/* 🆕 Create button */}
                                          {pe.templateId && (
                                            <button
                                              onClick={() => createSelfEvaluation(pe.templateId!, evaluator.userId, pe.templateName)}
                                              disabled={solvingId === `create-${pe.templateId}-${evaluator.userId}`}
                                              className="ml-1 p-1.5 bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors disabled:opacity-50"
                                              title="Crear esta autoevaluación">
                                              {solvingId === `create-${pe.templateId}-${evaluator.userId}`
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <PlusCircle className="w-4 h-4" />}
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Pending evaluations from DB */}
                                  {(evaluator.pending.length + evaluator.inProgress.length) > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Evaluaciones sin completar (BD):</p>
                                      {[...evaluator.pending, ...evaluator.inProgress].map((pe, i) => (
                                        <div key={`p-${i}`} className="flex items-center gap-3 p-2 bg-purple-50 border border-purple-200 rounded-lg mb-1">
                                          <Clock className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{pe.evaluatedName}</p>
                                            <p className="text-xs text-gray-500"><FileText className="w-3 h-3 inline mr-1" />{pe.templateName}</p>
                                          </div>
                                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs whitespace-nowrap">
                                            {pe.status === 'in_progress' ? 'En progreso' : 'Pendiente'}
                                          </span>
                                          {/* 🔧 Resolver button */}
                                          {pe.evaluationId && (
                                            <button
                                              onClick={() => cancelEvaluation(pe.evaluationId!, pe.evaluatedName)}
                                              disabled={solvingId === pe.evaluationId}
                                              className="ml-1 p-1.5 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors disabled:opacity-50"
                                              title="Cancelar esta evaluación">
                                              {solvingId === pe.evaluationId
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <XCircle className="w-4 h-4" />}
                                            </button>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Completed */}
                                  {evaluator.completedCount > 0 && (
                                    <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                                      <p className="text-xs text-green-700"><CheckCircle className="w-3 h-3 inline mr-1" />{evaluator.completedCount} evaluación(es) completada(s)</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

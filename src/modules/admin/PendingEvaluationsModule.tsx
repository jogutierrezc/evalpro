import { useEffect, useState, useMemo } from 'react';
import { supabase, User } from '../../lib/supabase';
import { AlertCircle, Filter, Building2, MapPin, RefreshCw, ChevronDown, ChevronRight, Clock, CheckCircle, Loader2, UserCheck, FileText, AlertTriangle, UserX } from 'lucide-react';

interface EvaluationPending {
  id?: string;
  templateId: string;
  templateName: string;
  formTypeKey: string;
  evaluatedId: string;
  evaluatedName: string;
  isSelfEval: boolean;
  status: 'not_done' | 'pending' | 'in_progress' | 'completed';
}

interface EvaluatorPending {
  user: User;
  officeName: string;
  // Autoevaluaciones que NO ha realizado
  missingSelfEvals: EvaluationPending[];
  // Evaluaciones a otros que NO ha realizado  
  missingOtherEvals: EvaluationPending[];
  // Evaluaciones creadas pero no completadas
  pendingEvaluations: EvaluationPending[];
  inProgressEvaluations: EvaluationPending[];
  completedCount: number;
}

interface GroupedPending {
  campus: string;
  offices: {
    officeId: string;
    officeName: string;
    evaluators: EvaluatorPending[];
  }[];
  totalPending: number;
}

export default function PendingEvaluationsModule() {
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>('');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<GroupedPending[]>([]);
  const [campusList, setCampusList] = useState<string[]>([]);
  const [officesList, setOfficesList] = useState<{ id: string; name: string }[]>([]);
  
  // Filters
  const [filterCampus, setFilterCampus] = useState<string>('');
  const [filterOffice, setFilterOffice] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'self_eval' | 'other_eval' | 'in_progress'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Expanded sections
  const [expandedCampus, setExpandedCampus] = useState<Set<string>>(new Set());
  const [expandedOffices, setExpandedOffices] = useState<Set<string>>(new Set());
  const [expandedEvaluators, setExpandedEvaluators] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPendingEvaluations();
  }, []);

  const loadPendingEvaluations = async () => {
    setLoading(true);
    setError(null);
    setLoadingProgress(0);
    
    try {
      setLoadingStep('Consultando base de datos...');
      setLoadingProgress(10);

      // Cargar todos los datos en paralelo
      const [
        { data: users, error: usersError },
        { data: offices, error: officesError },
        { data: evaluations, error: evalsError },
        { data: templates },
        { data: roles },
        { data: formTypeRelations },
        { data: userManagers },
        { data: formTypes }
      ] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('id, name'),
        supabase.from('evaluations').select('id, evaluator_id, evaluated_id, template_id, status'),
        supabase.from('evaluation_templates').select('id, name, type').eq('is_active', true),
        supabase.from('roles').select('key, label'),
        supabase.from('form_type_relations').select('form_type_key, evaluator_role_key, evaluated_role_key'),
        supabase.from('user_managers').select('user_id, manager_id'),
        supabase.from('form_types').select('key, roles')
      ]);

      if (usersError) throw usersError;
      if (officesError) throw officesError;
      if (evalsError) throw evalsError;

      setLoadingStep('Procesando datos...');
      setLoadingProgress(30);

      // Construir mapas
      const officeMap: Record<string, string> = {};
      (offices || []).forEach((o: any) => { officeMap[o.id] = o.name; });
      setOfficesList((offices || []).map((o: any) => ({ id: o.id, name: o.name })));

      const userMap: Record<string, User> = {};
      (users || []).forEach((u: any) => { userMap[u.id] = u as User; });

      const templateMap: Record<string, { name: string; type: string }> = {};
      const templatesByType: Record<string, { id: string; name: string }[]> = {};
      (templates || []).forEach((t: any) => {
        templateMap[t.id] = { name: t.name, type: t.type };
        if (!templatesByType[t.type]) templatesByType[t.type] = [];
        templatesByType[t.type].push({ id: t.id, name: t.name });
      });

      // Normalización de roles
      const normalizeStr = (s: any) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      
      const roleKeyMap: Record<string, string> = {};
      const roleLabelMap: Record<string, string> = {};
      (roles || []).forEach((r: any) => {
        roleKeyMap[r.key] = r.key;
        roleKeyMap[normalizeStr(r.key)] = r.key;
        if (r.label) {
          roleKeyMap[normalizeStr(r.label)] = r.key;
          roleLabelMap[r.key] = r.label;
        }
      });

      const resolveRoleKey = (role: string): string => {
        if (!role) return '';
        if (roleKeyMap[role]) return roleKeyMap[role];
        if (roleKeyMap[normalizeStr(role)]) return roleKeyMap[normalizeStr(role)];
        return role;
      };

      // Mapa de subordinados por manager
      const subordinatesByManager: Record<string, string[]> = {};
      
      // Desde user_managers
      (userManagers || []).forEach((um: any) => {
        if (!subordinatesByManager[um.manager_id]) subordinatesByManager[um.manager_id] = [];
        if (!subordinatesByManager[um.manager_id].includes(um.user_id)) {
          subordinatesByManager[um.manager_id].push(um.user_id);
        }
      });
      
      // Desde users.manager_id
      (users || []).forEach((u: any) => {
        if (u.manager_id) {
          if (!subordinatesByManager[u.manager_id]) subordinatesByManager[u.manager_id] = [];
          if (!subordinatesByManager[u.manager_id].includes(u.id)) {
            subordinatesByManager[u.manager_id].push(u.id);
          }
        }
      });

      setLoadingStep('Analizando relaciones...');
      setLoadingProgress(50);

      // Mapa de evaluaciones existentes: evaluator_id -> evaluated_id -> template_id -> status
      const existingEvals: Record<string, Record<string, Record<string, string>>> = {};
      (evaluations || []).forEach((ev: any) => {
        if (!existingEvals[ev.evaluator_id]) existingEvals[ev.evaluator_id] = {};
        if (!existingEvals[ev.evaluator_id][ev.evaluated_id]) existingEvals[ev.evaluator_id][ev.evaluated_id] = {};
        existingEvals[ev.evaluator_id][ev.evaluated_id][ev.template_id] = ev.status;
      });

      // Construir campus list
      const campusSet = new Set<string>();
      (users || []).forEach((u: any) => { campusSet.add(u.campus || 'Sin Campus'); });
      setCampusList(Array.from(campusSet).sort());

      // Mapa de form_types con sus roles
      const formTypeRolesMap: Record<string, string[]> = {};
      (formTypes || []).forEach((ft: any) => {
        formTypeRolesMap[ft.key] = ft.roles || [];
      });

      // Agrupar relaciones por form_type_key
      const relationsByFormType: Record<string, { evaluatorRole: string; evaluatedRole: string }[]> = {};
      (formTypeRelations || []).forEach((rel: any) => {
        if (!relationsByFormType[rel.form_type_key]) relationsByFormType[rel.form_type_key] = [];
        relationsByFormType[rel.form_type_key].push({
          evaluatorRole: rel.evaluator_role_key,
          evaluatedRole: rel.evaluated_role_key
        });
      });

      setLoadingStep('Calculando pendientes...');
      setLoadingProgress(70);

      // Procesar cada usuario para determinar qué evaluaciones le faltan
      const evaluatorPendingMap: Record<string, EvaluatorPending> = {};

      for (const user of (users || []) as User[]) {
        const userRoleKey = resolveRoleKey(user.role || '');
        const userRoleNorm = normalizeStr(userRoleKey);
        
        if (!userRoleKey) continue;

        const pending: EvaluatorPending = {
          user,
          officeName: officeMap[user.office_id || ''] || 'Sin Oficina',
          missingSelfEvals: [],
          missingOtherEvals: [],
          pendingEvaluations: [],
          inProgressEvaluations: [],
          completedCount: 0
        };

        // Revisar cada form_type y sus templates
        for (const [formTypeKey, rels] of Object.entries(relationsByFormType)) {
          const templatesForType = templatesByType[formTypeKey] || [];
          if (templatesForType.length === 0) continue;

          for (const rel of rels) {
            const evaluatorRoleNorm = normalizeStr(rel.evaluatorRole);
            const evaluatedRoleNorm = normalizeStr(rel.evaluatedRole);

            // ¿Este usuario es el evaluador según la relación?
            if (evaluatorRoleNorm !== userRoleNorm) continue;

            const isSelfEval = evaluatorRoleNorm === evaluatedRoleNorm;

            if (isSelfEval) {
              // AUTOEVALUACIÓN: El usuario debe evaluarse a sí mismo
              for (const tpl of templatesForType) {
                const status = existingEvals[user.id]?.[user.id]?.[tpl.id];
                
                const evalPending: EvaluationPending = {
                  templateId: tpl.id,
                  templateName: tpl.name,
                  formTypeKey,
                  evaluatedId: user.id,
                  evaluatedName: user.full_name + ' (Autoevaluación)',
                  isSelfEval: true,
                  status: status ? status as any : 'not_done'
                };

                if (!status) {
                  pending.missingSelfEvals.push(evalPending);
                } else if (status === 'completed') {
                  pending.completedCount++;
                } else if (status === 'in_progress') {
                  pending.inProgressEvaluations.push(evalPending);
                } else {
                  pending.pendingEvaluations.push(evalPending);
                }
              }
            } else {
              // EVALUACIÓN A OTROS: Debe evaluar a subordinados con el rol evaluated
              const subordinates = subordinatesByManager[user.id] || [];
              
              for (const subId of subordinates) {
                const subordinate = userMap[subId];
                if (!subordinate) continue;

                const subRoleKey = resolveRoleKey(subordinate.role || '');
                const subRoleNorm = normalizeStr(subRoleKey);

                // ¿El subordinado tiene el rol que debe ser evaluado?
                if (subRoleNorm !== evaluatedRoleNorm) continue;

                // Verificar campus (mismo campus o evaluador tiene "Todas")
                const evaluatorCampus = (user.campus || '').toLowerCase();
                const subCampus = (subordinate.campus || '').toLowerCase();
                const campusMatch = !evaluatorCampus || 
                                   evaluatorCampus === 'todas' || 
                                   evaluatorCampus === 'todos' ||
                                   evaluatorCampus === subCampus;
                
                if (!campusMatch) continue;

                for (const tpl of templatesForType) {
                  const status = existingEvals[user.id]?.[subId]?.[tpl.id];
                  
                  const evalPending: EvaluationPending = {
                    templateId: tpl.id,
                    templateName: tpl.name,
                    formTypeKey,
                    evaluatedId: subId,
                    evaluatedName: subordinate.full_name,
                    isSelfEval: false,
                    status: status ? status as any : 'not_done'
                  };

                  if (!status) {
                    pending.missingOtherEvals.push(evalPending);
                  } else if (status === 'completed') {
                    pending.completedCount++;
                  } else if (status === 'in_progress') {
                    pending.inProgressEvaluations.push(evalPending);
                  } else {
                    pending.pendingEvaluations.push(evalPending);
                  }
                }
              }
            }
          }
        }

        // Solo agregar si tiene algo pendiente
        const totalPending = pending.missingSelfEvals.length + 
                            pending.missingOtherEvals.length + 
                            pending.pendingEvaluations.length + 
                            pending.inProgressEvaluations.length;
        
        if (totalPending > 0) {
          evaluatorPendingMap[user.id] = pending;
        }
      }

      setLoadingStep('Organizando resultados...');
      setLoadingProgress(90);

      // Agrupar por campus y oficina
      const grouped: Record<string, GroupedPending> = {};

      Object.values(evaluatorPendingMap).forEach((evaluator) => {
        const totalPending = evaluator.missingSelfEvals.length + 
                            evaluator.missingOtherEvals.length + 
                            evaluator.pendingEvaluations.length + 
                            evaluator.inProgressEvaluations.length;

        const campus = evaluator.user.campus || 'Sin Campus';
        const officeId = evaluator.user.office_id || 'sin_oficina';

        if (!grouped[campus]) {
          grouped[campus] = { campus, offices: [], totalPending: 0 };
        }

        let officeEntry = grouped[campus].offices.find(o => o.officeId === officeId);
        if (!officeEntry) {
          officeEntry = { officeId, officeName: evaluator.officeName, evaluators: [] };
          grouped[campus].offices.push(officeEntry);
        }

        officeEntry.evaluators.push(evaluator);
        grouped[campus].totalPending += totalPending;
      });

      // Ordenar
      const result = Object.values(grouped).sort((a, b) => a.campus.localeCompare(b.campus));
      result.forEach(g => {
        g.offices.sort((a, b) => a.officeName.localeCompare(b.officeName));
        g.offices.forEach(o => o.evaluators.sort((a, b) => 
          a.user.full_name.localeCompare(b.user.full_name)
        ));
      });

      setPendingData(result);
      setLoadingProgress(100);
      
      if (result.length > 0) {
        setExpandedCampus(new Set([result[0].campus]));
      }
    } catch (err: any) {
      console.error('Error loading pending evaluations:', err);
      setError(err.message || 'Error cargando evaluaciones pendientes');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Filtered data
  const filteredData = useMemo(() => {
    let data = pendingData;

    if (filterCampus) {
      data = data.filter(g => g.campus === filterCampus);
    }

    if (filterOffice) {
      data = data.map(g => ({
        ...g,
        offices: g.offices.filter(o => o.officeId === filterOffice),
      })).filter(g => g.offices.length > 0);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      data = data.map(g => ({
        ...g,
        offices: g.offices.map(o => ({
          ...o,
          evaluators: o.evaluators.filter(ev => 
            ev.user.full_name.toLowerCase().includes(term) ||
            ev.user.identification?.toLowerCase().includes(term) ||
            ev.user.email?.toLowerCase().includes(term) ||
            ev.missingSelfEvals.some(pe => pe.evaluatedName.toLowerCase().includes(term)) ||
            ev.missingOtherEvals.some(pe => pe.evaluatedName.toLowerCase().includes(term))
          ),
        })).filter(o => o.evaluators.length > 0),
      })).filter(g => g.offices.length > 0);
    }

    if (filterStatus !== 'all') {
      data = data.map(g => ({
        ...g,
        offices: g.offices.map(o => ({
          ...o,
          evaluators: o.evaluators.filter(ev => {
            if (filterStatus === 'self_eval') return ev.missingSelfEvals.length > 0;
            if (filterStatus === 'other_eval') return ev.missingOtherEvals.length > 0;
            if (filterStatus === 'in_progress') return ev.inProgressEvaluations.length > 0;
            return true;
          }),
        })).filter(o => o.evaluators.length > 0),
      })).filter(g => g.offices.length > 0);
    }

    return data;
  }, [pendingData, filterCampus, filterOffice, searchTerm, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    let totalEvaluators = 0;
    let totalMissingSelf = 0;
    let totalMissingOther = 0;
    let totalInProgress = 0;
    
    filteredData.forEach(g => {
      g.offices.forEach(o => {
        totalEvaluators += o.evaluators.length;
        o.evaluators.forEach(ev => {
          totalMissingSelf += ev.missingSelfEvals.length;
          totalMissingOther += ev.missingOtherEvals.length;
          totalInProgress += ev.inProgressEvaluations.length + ev.pendingEvaluations.length;
        });
      });
    });

    return { totalEvaluators, totalMissingSelf, totalMissingOther, totalInProgress };
  }, [filteredData]);

  const toggleCampus = (campus: string) => {
    setExpandedCampus(prev => {
      const next = new Set(prev);
      if (next.has(campus)) next.delete(campus);
      else next.add(campus);
      return next;
    });
  };

  const toggleOffice = (officeId: string) => {
    setExpandedOffices(prev => {
      const next = new Set(prev);
      if (next.has(officeId)) next.delete(officeId);
      else next.add(officeId);
      return next;
    });
  };

  const toggleEvaluator = (evaluatorId: string) => {
    setExpandedEvaluators(prev => {
      const next = new Set(prev);
      if (next.has(evaluatorId)) next.delete(evaluatorId);
      else next.add(evaluatorId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-blue-200 rounded-full"></div>
              <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              <Loader2 className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 animate-pulse" />
            </div>
          </div>
          <p className="text-center text-gray-700 font-medium mb-4">{loadingStep || 'Iniciando...'}</p>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out" style={{ width: `${loadingProgress}%` }}></div>
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
          <button onClick={loadPendingEvaluations} className="mt-2 text-sm text-red-700 hover:text-red-800 underline">Reintentar</button>
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
          <p className="text-gray-600">Usuarios que no han completado sus evaluaciones asignadas</p>
        </div>
        <button onClick={loadPendingEvaluations} disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UserCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalEvaluators}</p>
              <p className="text-sm text-gray-500">Personas con pendientes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <UserX className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalMissingSelf}</p>
              <p className="text-sm text-gray-500">Autoevaluaciones faltantes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalMissingOther}</p>
              <p className="text-sm text-gray-500">Eval. a otros faltantes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalInProgress}</p>
              <p className="text-sm text-gray-500">En progreso / Sin completar</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900">Filtros</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Nombre o identificación..." className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
            <select value={filterCampus} onChange={(e) => setFilterCampus(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Todos los campus</option>
              {campusList.map(c => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
            <select value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Todas las oficinas</option>
              {officesList.map(o => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">Todos</option>
              <option value="self_eval">Autoevaluaciones faltantes</option>
              <option value="other_eval">Eval. a otros faltantes</option>
              <option value="in_progress">En progreso</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredData.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-green-800 font-semibold text-lg">¡Excelente!</p>
          <p className="text-green-600">{searchTerm || filterCampus || filterOffice ? 'No se encontraron pendientes con los filtros aplicados.' : 'Todos han completado sus evaluaciones.'}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map(group => (
            <div key={group.campus} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <button onClick={() => toggleCampus(group.campus)} className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-900">{group.campus}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {group.offices.reduce((sum, o) => sum + o.evaluators.length, 0)} con pendientes
                  </span>
                </div>
                {expandedCampus.has(group.campus) ? <ChevronDown className="w-5 h-5 text-gray-500" /> : <ChevronRight className="w-5 h-5 text-gray-500" />}
              </button>

              {expandedCampus.has(group.campus) && (
                <div className="divide-y divide-gray-100">
                  {group.offices.map(office => (
                    <div key={office.officeId}>
                      <button onClick={() => toggleOffice(office.officeId)} className="w-full flex items-center justify-between p-4 pl-8 hover:bg-gray-50 transition-colors">
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
                            <div key={evaluator.user.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              <button onClick={() => toggleEvaluator(evaluator.user.id)} className="w-full flex items-center justify-between p-3 hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                                    {evaluator.user.full_name?.charAt(0) || '?'}
                                  </div>
                                  <div className="text-left">
                                    <p className="font-medium text-gray-900">{evaluator.user.full_name}</p>
                                    <p className="text-xs text-gray-500">{evaluator.user.role}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap justify-end">
                                  {evaluator.missingSelfEvals.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                                      <UserX className="w-3 h-3" />{evaluator.missingSelfEvals.length} autoeval
                                    </span>
                                  )}
                                  {evaluator.missingOtherEvals.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                      <AlertTriangle className="w-3 h-3" />{evaluator.missingOtherEvals.length} a otros
                                    </span>
                                  )}
                                  {(evaluator.pendingEvaluations.length + evaluator.inProgressEvaluations.length) > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                      <Clock className="w-3 h-3" />{evaluator.pendingEvaluations.length + evaluator.inProgressEvaluations.length} sin completar
                                    </span>
                                  )}
                                  {evaluator.completedCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      <CheckCircle className="w-3 h-3" />{evaluator.completedCount}
                                    </span>
                                  )}
                                  {expandedEvaluators.has(evaluator.user.id) ? <ChevronDown className="w-4 h-4 text-gray-400 ml-2" /> : <ChevronRight className="w-4 h-4 text-gray-400 ml-2" />}
                                </div>
                              </button>

                              {expandedEvaluators.has(evaluator.user.id) && (
                                <div className="border-t border-gray-200 p-3 bg-gray-50 space-y-3 max-h-72 overflow-y-auto">
                                  {/* Autoevaluaciones faltantes */}
                                  {evaluator.missingSelfEvals.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-orange-700 uppercase mb-2">Autoevaluaciones faltantes:</p>
                                      {evaluator.missingSelfEvals.map((pe, idx) => (
                                        <div key={`self-${idx}`} className="flex items-center gap-3 p-2 bg-orange-50 border border-orange-200 rounded-lg mb-1">
                                          <UserX className="w-4 h-4 text-orange-500 flex-shrink-0" />
                                          <div className="flex-1">
                                            <p className="text-sm font-medium text-gray-900">{pe.templateName}</p>
                                          </div>
                                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">No realizada</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Evaluaciones a otros faltantes */}
                                  {evaluator.missingOtherEvals.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-red-700 uppercase mb-2">Debe evaluar a:</p>
                                      {evaluator.missingOtherEvals.map((pe, idx) => (
                                        <div key={`other-${idx}`} className="flex items-center gap-3 p-2 bg-red-50 border border-red-200 rounded-lg mb-1">
                                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{pe.evaluatedName}</p>
                                            <p className="text-xs text-gray-500 flex items-center gap-1"><FileText className="w-3 h-3" />{pe.templateName}</p>
                                          </div>
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs whitespace-nowrap">No realizada</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* En progreso / sin completar */}
                                  {(evaluator.pendingEvaluations.length + evaluator.inProgressEvaluations.length) > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Sin completar:</p>
                                      {[...evaluator.pendingEvaluations, ...evaluator.inProgressEvaluations].map((pe, idx) => (
                                        <div key={`prog-${idx}`} className="flex items-center gap-3 p-2 bg-purple-50 border border-purple-200 rounded-lg mb-1">
                                          <Clock className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{pe.evaluatedName}</p>
                                            <p className="text-xs text-gray-500 flex items-center gap-1"><FileText className="w-3 h-3" />{pe.templateName}</p>
                                          </div>
                                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{pe.status === 'in_progress' ? 'En progreso' : 'Sin iniciar'}</span>
                                        </div>
                                      ))}
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

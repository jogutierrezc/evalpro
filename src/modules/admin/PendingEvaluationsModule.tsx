import { useEffect, useState, useMemo } from 'react';
import { supabase, User } from '../../lib/supabase';
import { AlertCircle, Filter, Building2, MapPin, RefreshCw, ChevronDown, ChevronRight, Clock, CheckCircle, XCircle, Loader2, UserCheck, FileText } from 'lucide-react';

interface EvaluationPending {
  id: string;
  templateId: string;
  templateName: string;
  evaluatedId: string;
  evaluatedName: string;
  status: 'pending' | 'in_progress';
  createdAt: string;
}

interface EvaluatorPending {
  user: User;
  officeName: string;
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
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in_progress'>('all');
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
      // ============ PASO 1: Cargar todos los datos en paralelo ============
      setLoadingStep('Consultando base de datos...');
      setLoadingProgress(10);

      const [
        { data: users, error: usersError },
        { data: offices, error: officesError },
        { data: evaluations, error: evalsError },
        { data: templates }
      ] = await Promise.all([
        supabase.from('users').select('*').order('full_name'),
        supabase.from('offices').select('id, name'),
        supabase.from('evaluations').select('id, evaluator_id, evaluated_id, template_id, status, created_at'),
        supabase.from('evaluation_templates').select('id, name')
      ]);

      if (usersError) throw usersError;
      if (officesError) throw officesError;
      if (evalsError) throw evalsError;

      setLoadingStep('Procesando datos...');
      setLoadingProgress(40);

      // ============ PASO 2: Construir mapas de lookup ============
      
      // Mapa de oficinas
      const officeMap: Record<string, string> = {};
      (offices || []).forEach((o: any) => {
        officeMap[o.id] = o.name;
      });
      setOfficesList((offices || []).map((o: any) => ({ id: o.id, name: o.name })));

      // Mapa de usuarios por ID
      const userMap: Record<string, User> = {};
      (users || []).forEach((u: any) => {
        userMap[u.id] = u as User;
      });

      // Mapa de templates por ID
      const templateMap: Record<string, string> = {};
      (templates || []).forEach((t: any) => {
        templateMap[t.id] = t.name;
      });

      setLoadingStep('Analizando evaluaciones...');
      setLoadingProgress(60);

      // ============ PASO 3: Agrupar evaluaciones por evaluador ============
      
      // Construir lista de campus
      const campusSet = new Set<string>();
      (users || []).forEach((u: any) => {
        campusSet.add(u.campus || 'Sin Campus');
      });
      setCampusList(Array.from(campusSet).sort());

      // Agrupar evaluaciones por evaluator_id
      const evalsByEvaluator: Record<string, {
        pending: EvaluationPending[];
        inProgress: EvaluationPending[];
        completed: number;
      }> = {};

      (evaluations || []).forEach((ev: any) => {
        const evaluatorId = ev.evaluator_id;
        if (!evaluatorId) return;

        if (!evalsByEvaluator[evaluatorId]) {
          evalsByEvaluator[evaluatorId] = { pending: [], inProgress: [], completed: 0 };
        }

        const evaluatedUser = userMap[ev.evaluated_id];
        const evalData: EvaluationPending = {
          id: ev.id,
          templateId: ev.template_id,
          templateName: templateMap[ev.template_id] || 'Sin nombre',
          evaluatedId: ev.evaluated_id,
          evaluatedName: evaluatedUser?.full_name || 'Usuario desconocido',
          status: ev.status,
          createdAt: ev.created_at,
        };

        if (ev.status === 'completed') {
          evalsByEvaluator[evaluatorId].completed++;
        } else if (ev.status === 'in_progress') {
          evalsByEvaluator[evaluatorId].inProgress.push(evalData);
        } else {
          // pending or any other status
          evalsByEvaluator[evaluatorId].pending.push(evalData);
        }
      });

      setLoadingStep('Organizando resultados...');
      setLoadingProgress(80);

      // ============ PASO 4: Agrupar por campus y oficina ============
      const grouped: Record<string, GroupedPending> = {};

      Object.entries(evalsByEvaluator).forEach(([evaluatorId, evalInfo]) => {
        // Solo incluir si tiene pendientes o en progreso
        if (evalInfo.pending.length === 0 && evalInfo.inProgress.length === 0) return;

        const evaluator = userMap[evaluatorId];
        if (!evaluator) return;

        const campus = evaluator.campus || 'Sin Campus';
        const officeId = evaluator.office_id || 'sin_oficina';
        const officeName = officeMap[officeId] || 'Sin Oficina';

        if (!grouped[campus]) {
          grouped[campus] = { campus, offices: [], totalPending: 0 };
        }

        let officeEntry = grouped[campus].offices.find(o => o.officeId === officeId);
        if (!officeEntry) {
          officeEntry = { officeId, officeName, evaluators: [] };
          grouped[campus].offices.push(officeEntry);
        }

        officeEntry.evaluators.push({
          user: evaluator,
          officeName,
          pendingEvaluations: evalInfo.pending,
          inProgressEvaluations: evalInfo.inProgress,
          completedCount: evalInfo.completed,
        });

        grouped[campus].totalPending += evalInfo.pending.length + evalInfo.inProgress.length;
      });

      setLoadingProgress(95);

      // Ordenar resultados
      const result = Object.values(grouped).sort((a, b) => a.campus.localeCompare(b.campus));
      result.forEach(g => {
        g.offices.sort((a, b) => a.officeName.localeCompare(b.officeName));
        g.offices.forEach(o => o.evaluators.sort((a, b) => 
          a.user.full_name.localeCompare(b.user.full_name)
        ));
      });

      setPendingData(result);
      setLoadingProgress(100);
      
      // Expandir primer campus por defecto
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

    // Filter by campus
    if (filterCampus) {
      data = data.filter(g => g.campus === filterCampus);
    }

    // Filter by office
    if (filterOffice) {
      data = data.map(g => ({
        ...g,
        offices: g.offices.filter(o => o.officeId === filterOffice),
      })).filter(g => g.offices.length > 0);
    }

    // Filter by search term
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
            ev.pendingEvaluations.some(pe => pe.evaluatedName.toLowerCase().includes(term)) ||
            ev.inProgressEvaluations.some(pe => pe.evaluatedName.toLowerCase().includes(term))
          ),
        })).filter(o => o.evaluators.length > 0),
      })).filter(g => g.offices.length > 0);
    }

    // Filter by status
    if (filterStatus !== 'all') {
      data = data.map(g => ({
        ...g,
        offices: g.offices.map(o => ({
          ...o,
          evaluators: o.evaluators.filter(ev => 
            filterStatus === 'pending' ? ev.pendingEvaluations.length > 0 : ev.inProgressEvaluations.length > 0
          ),
        })).filter(o => o.evaluators.length > 0),
      })).filter(g => g.offices.length > 0);
    }

    return data;
  }, [pendingData, filterCampus, filterOffice, searchTerm, filterStatus]);

  // Stats
  const stats = useMemo(() => {
    let totalEvaluators = 0;
    let totalPending = 0;
    let totalInProgress = 0;
    
    filteredData.forEach(g => {
      g.offices.forEach(o => {
        totalEvaluators += o.evaluators.length;
        o.evaluators.forEach(ev => {
          totalPending += ev.pendingEvaluations.length;
          totalInProgress += ev.inProgressEvaluations.length;
        });
      });
    });

    return { totalEvaluators, totalPending, totalInProgress };
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

  // ============ LOADING STATE CON ANIMACIÓN ============
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
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${loadingProgress}%` }}
            ></div>
          </div>
          <p className="text-center text-sm text-gray-500 mt-2">{loadingProgress}%</p>
          <div className="flex justify-center gap-2 mt-6">
            {[10, 40, 60, 80, 100].map(step => (
              <div key={step} className={`w-2 h-2 rounded-full transition-colors ${loadingProgress >= step ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            ))}
          </div>
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
          <button onClick={loadPendingEvaluations} className="mt-2 text-sm text-red-700 hover:text-red-800 underline">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Evaluaciones Pendientes por Realizar</h2>
          <p className="text-gray-600">Lista de evaluadores que tienen evaluaciones asignadas sin completar</p>
        </div>
        <button
          onClick={loadPendingEvaluations}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UserCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalEvaluators}</p>
              <p className="text-sm text-gray-500">Evaluadores con pendientes</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalPending}</p>
              <p className="text-sm text-gray-500">Evaluaciones sin iniciar</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stats.totalInProgress}</p>
              <p className="text-sm text-gray-500">Evaluaciones en progreso</p>
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
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Evaluador o evaluado..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campus</label>
            <select
              value={filterCampus}
              onChange={(e) => setFilterCampus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los campus</option>
              {campusList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oficina</label>
            <select
              value={filterOffice}
              onChange={(e) => setFilterOffice(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas las oficinas</option>
              {officesList.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Todos</option>
              <option value="pending">Solo sin iniciar</option>
              <option value="in_progress">Solo en progreso</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {filteredData.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <p className="text-green-800 font-semibold text-lg">¡Excelente!</p>
          <p className="text-green-600">
            {searchTerm || filterCampus || filterOffice 
              ? 'No se encontraron evaluadores pendientes con los filtros aplicados.'
              : 'Todos los evaluadores han completado sus evaluaciones asignadas.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredData.map(group => (
            <div key={group.campus} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* Campus Header */}
              <button
                onClick={() => toggleCampus(group.campus)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-gray-900">{group.campus}</span>
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                    {group.offices.reduce((sum, o) => sum + o.evaluators.length, 0)} evaluadores con pendientes
                  </span>
                </div>
                {expandedCampus.has(group.campus) ? (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {/* Campus Content */}
              {expandedCampus.has(group.campus) && (
                <div className="divide-y divide-gray-100">
                  {group.offices.map(office => (
                    <div key={office.officeId}>
                      {/* Office Header */}
                      <button
                        onClick={() => toggleOffice(office.officeId)}
                        className="w-full flex items-center justify-between p-4 pl-8 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Building2 className="w-4 h-4 text-gray-500" />
                          <span className="font-medium text-gray-800">{office.officeName}</span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                            {office.evaluators.length} evaluadores
                          </span>
                        </div>
                        {expandedOffices.has(office.officeId) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {/* Evaluators List */}
                      {expandedOffices.has(office.officeId) && (
                        <div className="bg-gray-50 px-4 pb-4 space-y-2">
                          {office.evaluators.map(evaluator => (
                            <div key={evaluator.user.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                              {/* Evaluator Header */}
                              <button
                                onClick={() => toggleEvaluator(evaluator.user.id)}
                                className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                                    {evaluator.user.full_name?.charAt(0) || '?'}
                                  </div>
                                  <div className="text-left">
                                    <p className="font-medium text-gray-900">{evaluator.user.full_name}</p>
                                    <p className="text-xs text-gray-500">{evaluator.user.email || evaluator.user.identification}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {evaluator.pendingEvaluations.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium">
                                      <XCircle className="w-3 h-3" />
                                      {evaluator.pendingEvaluations.length} sin iniciar
                                    </span>
                                  )}
                                  {evaluator.inProgressEvaluations.length > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                                      <Clock className="w-3 h-3" />
                                      {evaluator.inProgressEvaluations.length} en progreso
                                    </span>
                                  )}
                                  {evaluator.completedCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                      <CheckCircle className="w-3 h-3" />
                                      {evaluator.completedCount} completadas
                                    </span>
                                  )}
                                  {expandedEvaluators.has(evaluator.user.id) ? (
                                    <ChevronDown className="w-4 h-4 text-gray-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                              </button>

                              {/* Evaluations Detail */}
                              {expandedEvaluators.has(evaluator.user.id) && (
                                <div className="border-t border-gray-200 p-3 bg-gray-50">
                                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Evaluaciones asignadas:</p>
                                  <div className="space-y-2">
                                    {/* Pending */}
                                    {evaluator.pendingEvaluations.map(pe => (
                                      <div key={pe.id} className="flex items-center gap-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                                        <XCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">
                                            Debe evaluar a: <span className="text-amber-700">{pe.evaluatedName}</span>
                                          </p>
                                          <p className="text-xs text-gray-500 flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {pe.templateName}
                                          </p>
                                        </div>
                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Sin iniciar</span>
                                      </div>
                                    ))}
                                    {/* In Progress */}
                                    {evaluator.inProgressEvaluations.map(pe => (
                                      <div key={pe.id} className="flex items-center gap-3 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                                        <Clock className="w-4 h-4 text-purple-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium text-gray-900 truncate">
                                            Evaluando a: <span className="text-purple-700">{pe.evaluatedName}</span>
                                          </p>
                                          <p className="text-xs text-gray-500 flex items-center gap-1">
                                            <FileText className="w-3 h-3" />
                                            {pe.templateName}
                                          </p>
                                        </div>
                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">En progreso</span>
                                      </div>
                                    ))}
                                  </div>
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

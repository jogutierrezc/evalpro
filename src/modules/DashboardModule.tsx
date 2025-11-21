import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState } from 'react';
import { supabase, EvaluationTemplate, User, Evaluation } from '../lib/supabase';
import { Users, Building2, FileCheck, AlertCircle } from 'lucide-react';
import { EvaluationForm } from './evaluations/EvaluationForm';

export function DashboardModule() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalOffices: 0,
    pendingEvaluations: 0,
    completedEvaluations: 0,
  });
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableTemplatesCount, setAvailableTemplatesCount] = useState(0);
  const [availableTemplates, setAvailableTemplates] = useState<EvaluationTemplate[]>([]);
  const [managerCandidatesMap, setManagerCandidatesMap] = useState<Record<string, User[]>>({});
  const [selfEvalAllowedMap, setSelfEvalAllowedMap] = useState<Record<string, boolean>>({});
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [userEvaluationsMap, setUserEvaluationsMap] = useState<Record<string, Evaluation>>({});

  useEffect(() => {
    loadRoles();
    loadStats();
    loadUserEvaluations();
  }, [user]);

  const loadUserEvaluations = async () => {
    if (!user?.id) return;
    try {
      // Load all evaluations where user is the evaluator
      const { data: evaluations } = await supabase
        .from('evaluations')
        .select('*')
        .eq('evaluator_id', user.id);

      // Create map: template_id -> evaluation (for self-evaluations)
      // AND track which users have been evaluated per template
      const map: Record<string, Evaluation> = {};
      const evaluatedUsersMap: Record<string, Set<string>> = {};

      (evaluations || []).forEach((e: any) => {
        // Map for self-evaluations (where evaluator = evaluated)
        if (e.evaluator_id === e.evaluated_id) {
          map[e.template_id] = e as Evaluation;
        }

        // Track all evaluated users per template
        if (!evaluatedUsersMap[e.template_id]) {
          evaluatedUsersMap[e.template_id] = new Set();
        }
        evaluatedUsersMap[e.template_id].add(e.evaluated_id);
      });

      setUserEvaluationsMap(map);

      // Store evaluated users for filtering candidates
      (window as any).__evaluatedUsersMap = evaluatedUsersMap;

      console.debug('[Dashboard] User evaluations map:', map);
      console.debug('[Dashboard] Evaluated users map:', evaluatedUsersMap);
    } catch (err) {
      console.warn('[Dashboard] Error loading user evaluations:', err);
    }
  };

  useEffect(() => {
    // Load evaluation candidates based on form_type_relations
    (async () => {
      if (!availableTemplates || availableTemplates.length === 0) return;

      // Resolve canonical roleKey for current user with robust normalization
      let roleKey = (user?.role || '') as string;
      const normalizeStr = (s: any) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').replace(/[\u0300-\u036f]/g, '').trim();
      try {
        const { data: allRoles } = await supabase.from('roles').select('key,label');
        const rolesList = (allRoles || []) as any[];
        // try direct key match
        const direct = rolesList.find((r) => r.key === roleKey);
        if (!direct) {
          // try matching by normalized label or normalized key
          const target = normalizeStr(roleKey);
          const found = rolesList.find((rr) => normalizeStr(rr.label) === target || normalizeStr(rr.key) === target);
          if (found) roleKey = found.key;
          else {
            // some stored roles might be labels; attempt loose matching by keywords
            const lower = (roleKey || '').toString().toLowerCase();
            if (lower.includes('colaborador') || lower.includes('empleado')) roleKey = 'colaborador_vaf';
            if (lower.includes('admin') || lower.includes('administrador')) roleKey = 'admin';
            if (lower.includes('jefe') || lower.includes('manager') || lower.includes('oficina')) roleKey = 'office_manager';
          }
        }
      } catch (err) {
        console.warn('[Dashboard] Could not resolve roleKey from roles table', err);
      }

      console.debug('[Dashboard] Loading candidates for user role:', roleKey);

      const map: Record<string, User[]> = {};
      const selfMap: Record<string, boolean> = {};

      // Helper: filter candidates by manager relationship (strict)
      const filterByManagerRelation = async (cands: any[]): Promise<any[]> => {
        if (!user?.id) return [];
        const evaluatorId = user.id;

        // 1) Collect managed users via `user_managers` table and `users.manager_id`
        const { data: managedRows } = await supabase.from('user_managers').select('user_id').eq('manager_id', evaluatorId);
        const managedIdsFromTable = (managedRows || []).map((r: any) => r.user_id).filter(Boolean);

        const { data: directManaged } = await supabase.from('users').select('id').eq('manager_id', evaluatorId);
        const directManagedIds = (directManaged || []).map((r: any) => r.id).filter(Boolean);

        const managedIds = new Set([...(managedIdsFromTable || []), ...(directManagedIds || [])]);

        return (cands || []).filter((cand) => managedIds.has(cand.id));
      };

      for (const tpl of availableTemplates) {
        try {
          // Resolve template.type to canonical form_type key
          let tplTypeKey = tpl.type as string;
          try {
            const { data: ft1 } = await supabase.from('form_types').select('key').eq('key', tplTypeKey).limit(1);
            if (!ft1 || ft1.length === 0) {
              const { data: ft2 } = await supabase.from('form_types').select('key,label');
              const matched = (ft2 || []).find((f: any) => (f.label || '').toString().toLowerCase() === (tpl.type || '').toString().toLowerCase());
              if (matched) tplTypeKey = matched.key;
            }
          } catch (e) {
            console.debug('[Dashboard] Error resolving tpl.type to form_type key', e);
          }

          console.debug('[Dashboard] Template:', tpl.name, 'type:', tplTypeKey);

          // Load relations where user is evaluator (using robust normalization)
          const { data: allRels } = await supabase
            .from('form_type_relations')
            .select('evaluated_role_key, evaluator_role_key')
            .eq('form_type_key', tplTypeKey);

          const userRoleNorm = normalizeStr(roleKey);
          let rels = (allRels || []).filter((r: any) => normalizeStr(r.evaluator_role_key) === userRoleNorm);

          // FALLBACK: If no direct relation found, check for generic manager roles
          // This handles cases where a specific role (e.g. 'Rectoria') acts as a manager but the relation is defined for 'office_manager'
          if (rels.length === 0) {
            console.debug('[Dashboard] No direct relations for', userRoleNorm, '. Checking generic manager roles against:', (allRels || []).map((r: any) => r.evaluator_role_key));
            const genericManagerRels = (allRels || []).filter((r: any) => {
              const k = normalizeStr(r.evaluator_role_key);
              return k === 'office_manager' || k === 'officemanager' ||
                k === 'lider' || k === 'jefe' ||
                k === 'lider_proceso' || k === 'liderproceso' ||
                k === 'lider_vaf' || k === 'lidervaf' ||
                k === 'director' || k === 'coordinador';
            });
            if (genericManagerRels.length > 0) {
              console.debug('[Dashboard] Using generic manager relations for role:', roleKey, 'found:', genericManagerRels);
              rels = genericManagerRels;
            }
          }

          console.debug('[Dashboard] Relations found for template:', tpl.name, 'relations:', rels);

          // Check if user can self-evaluate (relation exists where evaluated == evaluator)
          let canSelfEval = rels.some((r: any) => normalizeStr(r.evaluated_role_key) === userRoleNorm);

          // Fallback: if no relation-based self-eval, check if role is directly allowed in form_type
          if (!canSelfEval) {
            try {
              const { data: ft } = await supabase.from('form_types').select('roles').eq('key', tplTypeKey).single();
              if (ft && Array.isArray(ft.roles)) {
                const normalizedFtRoles = ft.roles.map((r: any) => normalizeStr(r));
                if (normalizedFtRoles.includes(userRoleNorm)) {
                  canSelfEval = true;
                }
              }
            } catch (e) {
              console.debug('[Dashboard] Error checking form_type roles fallback', e);
            }
          }

          selfMap[tpl.id] = canSelfEval;

          if (!rels || rels.length === 0) {
            map[tpl.id] = [];
            continue;
          }

          const evaluatedRoles = rels.map((r: any) => r.evaluated_role_key);

          // Load all roles to map keys to labels
          const { data: rolesData } = await supabase.from('roles').select('*');
          const roleKeyToLabel: Record<string, string> = {};
          (rolesData || []).forEach((r: any) => { roleKeyToLabel[r.key] = r.label; });

          // Load users with matching roles (try both keys and labels)
          const evaluatedLabels = evaluatedRoles.map((k: any) => roleKeyToLabel[k] || k);

          // Prepare normalized target roles/labels
          const targetRolesNormalized = new Set<string>();
          evaluatedRoles.forEach((r: any) => targetRolesNormalized.add(normalizeStr(r)));
          evaluatedLabels.forEach((l: any) => targetRolesNormalized.add(normalizeStr(l)));

          const { data: candidates } = await supabase.from('users').select('*');

          const roleMatchedCandidates = (candidates || []).filter((u: any) => {
            const r = normalizeStr(u.role);
            return targetRolesNormalized.has(r);
          });

          console.debug('[Dashboard] Candidates for template (role match):', tpl.name, 'count:', roleMatchedCandidates.length);

          // Enforce manager-based eligibility
          const filtered = await filterByManagerRelation(roleMatchedCandidates);
          // Remove self from candidates list (handled by self-eval button)
          const filteredWithoutSelf = filtered.filter(c => c.id !== user?.id);

          map[tpl.id] = (filteredWithoutSelf as User[]) || [];
        } catch (err) {
          console.warn('[Dashboard] Error loading candidates for template', tpl.id, err);
          map[tpl.id] = [];
          selfMap[tpl.id] = false;
        }
      }

      console.debug('[Dashboard] Final candidatesMap:', map);
      setManagerCandidatesMap(map);
      setSelfEvalAllowedMap(selfMap);
    })();
  }, [availableTemplates, user]);

  const handleCloseForm = () => {
    setSelectedEvaluation(null);
    // refresh stats and evaluations to reflect any new evaluation
    loadStats();
    loadUserEvaluations();
  };

  const loadRoles = async () => {
    try {
      const { data } = await supabase.from('roles').select('key,label');
      setRoles((data as any) || []);
    } catch (err) {
      console.warn('Could not load roles for dashboard:', err);
      setRoles([]);
    }
  };

  const normalizeRoleKey = (r: string | undefined | null) => {
    if (!r) return r;
    const asStr = r.toString();
    const direct = roles.find((x) => x.key === asStr);
    if (direct) return direct.key;
    const byLabel = roles.find((x) => x.label && x.label.toLowerCase() === asStr.toLowerCase());
    if (byLabel) return byLabel.key;
    const lower = asStr.toLowerCase();
    if (lower.includes('jefe') || lower.includes('manager') || lower.includes('oficina')) return 'office_manager';
    if (lower.includes('admin') || lower.includes('administrador')) return 'admin';
    if (lower.includes('colaborador') || lower.includes('empleado')) return 'colaborador_vaf';
    return asStr;
  };

  const loadStats = async () => {
    try {
      const roleKey = normalizeRoleKey(user?.role as any);

      if (user?.role === 'admin' || roleKey === 'admin') {
        const [employeesRes, officesRes, pendingRes, completedRes] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('offices').select('id', { count: 'exact', head: true }),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        ]);

        setStats({
          totalEmployees: employeesRes.count || 0,
          totalOffices: officesRes.count || 0,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
        });
      } else {
        // For all non-admin users, count only evaluations related to the user
        const [pendingRes, completedRes] = await Promise.all([
          supabase
            .from('evaluations')
            .select('id', { count: 'exact', head: true })
            .or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`)
            .neq('status', 'completed'),
          supabase
            .from('evaluations')
            .select('id', { count: 'exact', head: true })
            .or(`evaluator_id.eq.${user?.id},evaluated_id.eq.${user?.id}`)
            .eq('status', 'completed'),
        ]);

        // compute available templates for this role (consider active period if present)
        let availableCount = 0;
        try {
          const today = new Date().toISOString().slice(0, 10);
          const { data: periodData } = await supabase
            .from('evaluation_periods')
            .select('id')
            .lte('start_date', today)
            .gte('end_date', today)
            .limit(1);

          const period = (periodData && periodData.length > 0) ? periodData[0] : null;

          let allowedFormTypeKeys: string[] = [];
          if (period) {
            const { data: pfts } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
            allowedFormTypeKeys = (pfts || []).map((r: any) => r.form_type_key);
          } else {
            const { data: allFts } = await supabase.from('form_types').select('key');
            allowedFormTypeKeys = (allFts || []).map((r: any) => r.key);
          }

          if (allowedFormTypeKeys.length > 0) {
            const { data: fts } = await supabase.from('form_types').select('key,roles').in('key', allowedFormTypeKeys);
            console.debug('[Dashboard] roleKey=', roleKey, 'allowedFormTypeKeys=', allowedFormTypeKeys, 'fts_count=', (fts || []).length);
            const allowedForRole = (fts || []).filter((ft: any) => Array.isArray(ft.roles) ? ft.roles.includes(roleKey) : false).map((ft: any) => ft.key);

            // Try explicit relations too
            let relAllowed: string[] = [];
            try {
              const { data: rels } = await supabase.from('form_type_relations').select('form_type_key').in('form_type_key', allowedFormTypeKeys).eq('evaluator_role_key', roleKey);
              relAllowed = (rels || []).map((r: any) => r.form_type_key);
            } catch (e) {
              console.debug('[Dashboard] no relations table or query failed', e);
            }

            const finalAllowed = Array.from(new Set([...allowedForRole, ...relAllowed]));
            console.debug('[Dashboard] allowedForRole=', allowedForRole, 'relAllowed=', relAllowed, 'finalAllowed=', finalAllowed);

            if (finalAllowed.length > 0) {
              const { data: templates, error: tplErr } = await supabase
                .from('evaluation_templates')
                .select('*')
                .eq('is_active', true)
                .in('type', finalAllowed)
                .order('created_at', { ascending: false });
              if (tplErr) throw tplErr;
              setAvailableTemplates((templates as EvaluationTemplate[]) || []);
              availableCount = (templates || []).length || 0;
            } else {
              setAvailableTemplates([]);
            }
          }
        } catch (err) {
          console.warn('Error computing available templates for dashboard', err);
          availableCount = 0;
        }

        setStats({
          totalEmployees: 0,
          totalOffices: 0,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
        });
        setAvailableTemplatesCount(availableCount);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    ...(user?.role === 'admin' || user?.role === 'office_manager'
      ? [
        {
          title: 'Total Empleados',
          value: stats.totalEmployees,
          icon: Users,
          color: 'bg-blue-500',
        },
        {
          title: user?.role === 'admin' ? 'Total Oficinas' : 'Mi Oficina',
          value: stats.totalOffices,
          icon: Building2,
          color: 'bg-green-500',
        },
      ]
      : []),
    {
      title: 'Evaluaciones Pendientes',
      value: stats.pendingEvaluations,
      icon: AlertCircle,
      color: 'bg-orange-500',
    },
    ...(user && (user?.role !== 'admin')
      ? [
        {
          title: 'Pruebas Disponibles',
          value: availableTemplatesCount,
          icon: FileCheck,
          color: 'bg-indigo-500',
        },
      ]
      : []),
    {
      title: 'Evaluaciones Completadas',
      value: stats.completedEvaluations,
      icon: FileCheck,
      color: 'bg-teal-500',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando...</div>
      </div>
    );
  }

  if (selectedEvaluation) {
    return <EvaluationForm evaluation={selectedEvaluation} onClose={handleCloseForm} />;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Bienvenido, {user?.full_name}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <h3 className="text-gray-600 text-sm font-medium mb-1">{stat.title}</h3>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Información del Usuario</h2>
        <div className="space-y-3">
          <div>
            <span className="text-gray-600">Nombre:</span>
            <span className="ml-2 font-medium text-gray-900">{user?.full_name}</span>
          </div>
          <div>
            <span className="text-gray-600">Cédula:</span>
            <span className="ml-2 font-medium text-gray-900">{user?.identification}</span>
          </div>
          <div>
            <span className="text-gray-600">Rol:</span>
            <span className="ml-2 font-medium text-gray-900 capitalize">
              {user?.role?.replace('_', ' ')}
            </span>
          </div>
        </div>
      </div>

      {/* Sección: Exámenes Disponibles para el rol */}
      <div className="mt-8 bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Exámenes Disponibles</h2>
        {availableTemplates.length === 0 ? (
          <div className="text-gray-500">No hay exámenes disponibles para tu rol en este momento.</div>
        ) : (
          <div className="space-y-3">
            {availableTemplates.map((tpl) => {
              const candidates = managerCandidatesMap[tpl.id] || [];
              const showCandidateSelect = candidates.length > 0;
              const canSelfEval = selfEvalAllowedMap[tpl.id];

              // If neither self-eval nor candidates are available, hide the card
              if (!canSelfEval && !showCandidateSelect) return null;

              // Get evaluated users for this template
              const evaluatedUsersMap = (window as any).__evaluatedUsersMap || {};
              const evaluatedUsers = evaluatedUsersMap[tpl.id] || new Set();

              // Filter out already evaluated candidates
              const availableCandidates = candidates.filter(c => !evaluatedUsers.has(c.id));

              const existingEvaluation = userEvaluationsMap[tpl.id];
              const isCompleted = existingEvaluation && existingEvaluation.status === 'completed';
              const isInProgress = existingEvaluation && existingEvaluation.status !== 'completed';

              return (
                <div key={tpl.id} className="border rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{tpl.name}</div>
                      <div className="text-xs text-gray-500">{tpl.description}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Self-evaluation button - ONLY if allowed */}
                      {canSelfEval && (
                        isCompleted ? (
                          <button
                            disabled
                            className="px-4 py-2 bg-gray-400 text-white rounded cursor-not-allowed text-sm"
                          >
                            Ya realizado
                          </button>
                        ) : isInProgress ? (
                          <button
                            onClick={() => setSelectedEvaluation(existingEvaluation)}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          >
                            Continuar
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              try {
                                const evaluatorId = user?.id;
                                if (!evaluatorId) throw new Error('No user');

                                const { data, error } = await supabase
                                  .from('evaluations')
                                  .insert([
                                    {
                                      template_id: tpl.id,
                                      evaluator_id: evaluatorId,
                                      evaluated_id: evaluatorId, // Self-evaluation
                                      status: 'pending',
                                    },
                                  ])
                                  .select('*')
                                  .single();

                                if (error) throw error;

                                setSelectedEvaluation(data as Evaluation);
                                loadUserEvaluations();
                              } catch (err) {
                                console.error('Error creating evaluation from dashboard', err);
                                alert('No se pudo iniciar la evaluación');
                              }
                            }}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm"
                          >
                            Iniciar Examen
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Evaluate others section - only show if there are candidates */}
                  {showCandidateSelect && availableCandidates.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-600 font-medium">Evaluar a otro colaborador:</label>
                        <select
                          className="border rounded p-2 text-sm flex-1"
                          value={selectedCandidate[tpl.id] || ''}
                          onChange={(e) => setSelectedCandidate({ ...selectedCandidate, [tpl.id]: e.target.value })}
                        >
                          <option value="">Selecciona colaborador</option>
                          {availableCandidates.map((c) => (
                            <option key={c.id} value={c.id}>{c.full_name} ({c.role || c.identification})</option>
                          ))}
                        </select>
                        <button
                          onClick={async () => {
                            try {
                              const evaluatorId = user?.id;
                              if (!evaluatorId) throw new Error('No user');

                              const evaluatedId = selectedCandidate[tpl.id];
                              if (!evaluatedId) {
                                alert('Selecciona un colaborador');
                                return;
                              }

                              const { data, error } = await supabase
                                .from('evaluations')
                                .insert([
                                  {
                                    template_id: tpl.id,
                                    evaluator_id: evaluatorId,
                                    evaluated_id: evaluatedId,
                                    status: 'pending',
                                  },
                                ])
                                .select('*')
                                .single();

                              if (error) throw error;

                              setSelectedEvaluation(data as Evaluation);
                              loadUserEvaluations();
                            } catch (err) {
                              console.error('Error creating evaluation from dashboard', err);
                              alert('No se pudo iniciar la evaluación');
                            }
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm whitespace-nowrap"
                        >
                          Crear Evaluación
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Show message if all candidates have been evaluated */}
                  {showCandidateSelect && candidates.length > 0 && availableCandidates.length === 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="text-xs text-gray-500 italic">
                        Todos los colaboradores disponibles ya han sido evaluados
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

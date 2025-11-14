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
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);

  useEffect(() => {
    loadRoles();
    loadStats();
    // pre-load candidates for manager scenarios when templates are loaded
  }, [user]);

  useEffect(() => {
    // when availableTemplates change, for manager users fetch candidate users for templates that evaluate specific roles
    (async () => {
      if (!availableTemplates || availableTemplates.length === 0) return;
      const userRoleStr = (user?.role || '').toString().toLowerCase();
      const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria'];
      const isManagerRole = managerKeywords.some((k) => userRoleStr.includes(k));
      if (!isManagerRole) return;

      const targetLabels = ['colaborador vaf', 'colaboradores', 'coordinadores académicos'];
      const map: Record<string, User[]> = {};

      for (const tpl of availableTemplates) {
        try {
          // resolve form_type to know which roles the template evaluates
          const { data: ft } = await supabase.from('form_types').select('key,roles,label').eq('key', tpl.type).limit(1);
          let rolesForTpl: string[] = [];
          if (ft && ft.length > 0) {
            rolesForTpl = (ft[0] as any).roles || [];
          } else {
            // tolerant: try by label
            const { data: ft2 } = await supabase.from('form_types').select('key,roles,label');
            const matched = (ft2 || []).find((f: any) => (f.label || '').toString().toLowerCase() === (tpl.type || '').toString().toLowerCase());
            rolesForTpl = matched ? (matched.roles || []) : [];
          }

          const targetMatch = rolesForTpl.some((r: string) => targetLabels.includes((r || '').toString().toLowerCase()) || ['colaborador_vaf','colaboradores','coordinadores_academicos'].includes(r));
          if (!targetMatch) continue;

          // fetch users that match the target roles
          const { data: candidates } = await supabase.from('users').select('*').in('role', ['colaborador_vaf','colaboradores','coordinadores_academicos']);
          map[tpl.id] = (candidates as User[]) || [];
        } catch (err) {
          console.warn('Error loading candidates for template', tpl.id, err);
          map[tpl.id] = [];
        }
      }

      setManagerCandidatesMap(map);
    })();
  }, [availableTemplates, user]);

  const handleCloseForm = () => {
    setSelectedEvaluation(null);
    // refresh stats to reflect any new evaluation
    loadStats();
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
            const allowedForRole = (fts || []).filter((ft: any) => Array.isArray(ft.roles) ? ft.roles.includes(roleKey) : false).map((ft: any) => ft.key);

              if (allowedForRole.length > 0) {
                const { data: templates, error: tplErr } = await supabase
                  .from('evaluation_templates')
                  .select('*')
                  .eq('is_active', true)
                  .in('type', allowedForRole)
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
              // determine if current user is a manager-type for special behavior
              const userRoleStr = (user?.role || '').toString().toLowerCase();
              const managerKeywords = ['director', 'programa', 'lider', 'vaf', 'proceso', 'rectoria', 'vicerectoria'];
              const isManagerRole = managerKeywords.some((k) => userRoleStr.includes(k));

              const targetEvaluatedLabels = ['colaborador vaf', 'colaboradores', 'coordinadores académicos'];

              const candidates = managerCandidatesMap[tpl.id] || [];

              const showCandidateSelect = isManagerRole && candidates.length > 0;

              return (
                <div key={tpl.id} className="flex items-center justify-between border rounded p-4">
                  <div>
                    <div className="text-sm text-gray-600">{tpl.name}</div>
                    <div className="text-xs text-gray-500">{tpl.description}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {showCandidateSelect && (
                      <select
                        className="border rounded p-2 text-sm"
                        value={selectedCandidate[tpl.id] || ''}
                        onChange={(e) => setSelectedCandidate({ ...selectedCandidate, [tpl.id]: e.target.value })}
                      >
                        <option value="">Selecciona colaborador</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>{c.full_name} ({c.identification})</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          const evaluatorId = user?.id;
                          if (!evaluatorId) throw new Error('No user');

                          // if manager selecting another evaluated
                          const evaluatedId = showCandidateSelect ? (selectedCandidate[tpl.id] || '') : evaluatorId;
                          if (showCandidateSelect && !evaluatedId) { alert('Selecciona un colaborador'); return; }

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

                          // open form immediately
                          setSelectedEvaluation(data as Evaluation);
                        } catch (err) {
                          console.error('Error creating evaluation from dashboard', err);
                          alert('No se pudo iniciar la evaluación');
                        }
                      }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                    >
                      Iniciar Examen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

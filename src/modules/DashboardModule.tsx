import { useAuth } from '../contexts/AuthContext';
import { useEffect, useState, useRef } from 'react';
import { supabase, EvaluationTemplate, User, Evaluation } from '../lib/supabase';
import {
  Users,
  Building2,
  FileCheck,
  Clock,
  CheckCircle2,
  FileText,
  User as UserIcon,
  ChevronDown,
  ChevronUp,
  Search,
  Check
} from 'lucide-react';
import { EvaluationForm } from './evaluations/EvaluationForm';

export function DashboardModule() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    totalEmployees: 0,
    totalOffices: 0,
    pendingEvaluations: 0,
    completedEvaluations: 0,
    totalRoles: 0,
  });
  const [usersByCampus, setUsersByCampus] = useState<Record<string, number>>({});
  const [roles, setRoles] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableTemplatesCount, setAvailableTemplatesCount] = useState(0);
  const [availableTemplates, setAvailableTemplates] = useState<EvaluationTemplate[]>([]);
  const [managerCandidatesMap, setManagerCandidatesMap] = useState<Record<string, User[]>>({});
  const [selfEvalAllowedMap, setSelfEvalAllowedMap] = useState<Record<string, boolean>>({});

  // Dynamic Dropdown State
  const [selectedCandidate, setSelectedCandidate] = useState<Record<string, string>>({});
  const [inProgressEvaluations, setInProgressEvaluations] = useState<any[]>([]);

  const [dropdownOpenMap, setDropdownOpenMap] = useState<Record<string, boolean>>({});
  const [searchTermMap, setSearchTermMap] = useState<Record<string, string>>({});
  const dropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [userEvaluationsMap, setUserEvaluationsMap] = useState<Record<string, Evaluation>>({});

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!mounted) return;
      setLoading(true);
      await loadRoles();
      await loadStats();
      await loadUserEvaluations();
      // We need to trigger template calculation here or ensure it runs after roles/stats
      // The separate useEffect for availableTemplates depends on 'availableTemplates' state which is set in loadStats?
      // No, loadStats sets availableTemplates.
      setLoading(false);
    };

    if (user) {
      init();
    }

    return () => { mounted = false; };
  }, [user]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      Object.keys(dropdownRefs.current).forEach(tplId => {
        const ref = dropdownRefs.current[tplId];
        if (ref && !ref.contains(event.target as Node)) {
          setDropdownOpenMap(prev => ({ ...prev, [tplId]: false }));
        }
      });
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      const pendingList: any[] = [];

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

        // Track in-progress evaluations (All types)
        if (e.status !== 'completed') {
          pendingList.push(e);
        }
      });

      // Fetch details for pending list (names, templates)
      if (pendingList.length > 0) {
        // Fetch templates
        const tplIds = Array.from(new Set(pendingList.map(p => p.template_id)));
        const { data: tpls } = await supabase.from('evaluation_templates').select('id,name').in('id', tplIds);
        const tplMap: Record<string, string> = {};
        (tpls || []).forEach((t: any) => tplMap[t.id] = t.name);

        // Fetch evaluated users names
        const userIds = Array.from(new Set(pendingList.map(p => p.evaluated_id)));
        const { data: usrs } = await supabase.from('users').select('id,full_name').in('id', userIds);
        const usrMap: Record<string, string> = {};
        (usrs || []).forEach((u: any) => usrMap[u.id] = u.full_name);

        const enrichedPending = pendingList.map(p => ({
          ...p,
          template_name: tplMap[p.template_id] || 'Evaluación',
          evaluated_name: usrMap[p.evaluated_id] || 'Desconocido'
        }));
        setInProgressEvaluations(enrichedPending);
      } else {
        setInProgressEvaluations([]);
      }

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
      if (!user) return;

      // Fetch form types to check roles
      const tplTypes = Array.from(new Set(availableTemplates.map(t => t.type)));
      const { data: ftsData } = await supabase.from('form_types').select('key,roles').in('key', tplTypes);
      const formTypeMap: Record<string, any> = {};
      (ftsData || []).forEach((ft: any) => { formTypeMap[ft.key] = ft; });

      const normalizeStr = (s: any) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[^\w\s-]/g, '').replace(/[\u0300-\u036f]/g, '').trim();


      let userRoleNorm = normalizeStr(user.role);
      const userRoleId = user.role_id;
      let userRoleKey = user.role; // The canonical key from roles table
      let userRoleLabel = user.role; // The label from roles table

      console.log('[Dashboard] ==== ROLE DETECTION ====');
      console.log('[Dashboard] User:', user.full_name);
      console.log('[Dashboard] Original role:', user.role);
      console.log('[Dashboard] Normalized role:', userRoleNorm);
      console.log('[Dashboard] Role ID:', userRoleId);

      // Try to canonicalize role key if possible AND get both key and label
      try {
        const { data: allRoles } = await supabase.from('roles').select('id,key,label');
        const rolesList = (allRoles || []) as any[];

        // First try to match by role_id
        let roleObj = null;
        if (userRoleId) {
          roleObj = rolesList.find((r) => r.id === userRoleId);
        }

        // If not found by ID, try by string match
        if (!roleObj) {
          const direct = rolesList.find((r) => r.key === user.role);
          if (direct) {
            roleObj = direct;
          } else {
            const target = normalizeStr(user.role);
            roleObj = rolesList.find((rr) => normalizeStr(rr.label) === target || normalizeStr(rr.key) === target);
          }
        }

        if (roleObj) {
          userRoleKey = roleObj.key;
          userRoleLabel = roleObj.label;
          userRoleNorm = normalizeStr(roleObj.key);
          console.log('[Dashboard] ✅ Found role - Key:', roleObj.key, ', Label:', roleObj.label);
        } else {
          console.warn('[Dashboard] ⚠️ Role not found in roles table:', user.role);
        }
      } catch (e) {
        console.warn('Error fetching roles for normalization', e);
      }
      console.log('[Dashboard] Final - Key:', userRoleKey, ', Label:', userRoleLabel, ', Normalized:', userRoleNorm);
      console.log('[Dashboard] ============================');

      const map: Record<string, User[]> = {};
      const selfMap: Record<string, boolean> = {};

      // Helper: filter candidates by manager relationship (strict) + campus
      const filterByManagerRelation = async (cands: any[]): Promise<any[]> => {
        if (!user?.id) return [];
        const evaluatorId = user.id;
        const evaluatorCampus = user.campus || '';

        // 1) Collect managed users via `user_managers` table and `users.manager_id`
        const { data: managedRows } = await supabase.from('user_managers').select('user_id').eq('manager_id', evaluatorId);
        const managedIdsFromTable = (managedRows || []).map((r: any) => r.user_id).filter(Boolean);

        const { data: directManaged } = await supabase.from('users').select('id').eq('manager_id', evaluatorId);
        const directManagedIds = (directManaged || []).map((r: any) => r.id).filter(Boolean);

        const managedIds = new Set([...(managedIdsFromTable || []), ...(directManagedIds || [])]);

        // 2) Filter by manager relationship
        const directReports = (cands || []).filter((cand) => managedIds.has(cand.id));

        // 3) Filter by campus - UNLESS evaluator has campus = 'Todos' or 'Todas'
        const canEvaluateAllCampuses = evaluatorCampus.toLowerCase() === 'todos' ||
          evaluatorCampus.toLowerCase() === 'todas' ||
          !evaluatorCampus; // If no campus assigned, allow all

        if (canEvaluateAllCampuses) {
          console.log(`[Dashboard] Manager ${user.full_name} has campus="${evaluatorCampus}" - can evaluate all campuses`);
          return directReports;
        } else {
          // Filter by same campus
          const sameCampusReports = directReports.filter(cand => {
            const candCampus = (cand.campus || '').toString();
            return candCampus === evaluatorCampus;
          });

          console.log(`[Dashboard] Manager ${user.full_name} (campus: ${evaluatorCampus}) - filtered ${directReports.length} direct reports to ${sameCampusReports.length} same-campus reports`);
          return sameCampusReports;
        }
      };

      for (const tpl of availableTemplates) {
        try {
          let tplTypeKey = tpl.key || tpl.type; // prefer key if available

          console.log(`[Dashboard] ---- Processing template: ${tpl.name} (type: ${tplTypeKey}) ----`);

          // Fetch relations for this form type
          const { data: allRels } = await supabase
            .from('form_type_relations')
            .select('*')
            .eq('form_type_key', tplTypeKey);

          console.log(`[Dashboard] Found ${(allRels || []).length} relations for form type "${tplTypeKey}":`, allRels);

          // 1. Determine Relations (Evaluator)
          let rels = [];
          if (userRoleId) {
            rels = (allRels || []).filter((r: any) => r.evaluator_role_id === userRoleId);
            console.log(`[Dashboard] Matched by role_id (${userRoleId}):`, rels.length, 'relations');
          }

          if (rels.length === 0) {
            // Try with normalized role key
            const relsByNormalized = (allRels || []).filter((r: any) => normalizeStr(r.evaluator_role_key) === userRoleNorm);
            console.log(`[Dashboard] Matched by normalized role key (${userRoleNorm}):`, relsByNormalized.length, 'relations');

            // Try with original user role
            const relsByOriginal = (allRels || []).filter((r: any) => normalizeStr(r.evaluator_role_key) === normalizeStr(user.role));
            console.log(`[Dashboard] Matched by original role (${user.role}):`, relsByOriginal.length, 'relations');

            rels = relsByNormalized.length > 0 ? relsByNormalized : relsByOriginal;

            // Last fallback to generic manager keywords
            if (rels.length === 0) {
              const genericManagerRels = (allRels || []).filter((r: any) => {
                const k = normalizeStr(r.evaluator_role_key);
                return ['office_manager', 'officemanager', 'lider', 'jefe', 'director', 'coordinador', 'lider_proceso', 'lider_vaf'].includes(k);
              });
              if (genericManagerRels.length > 0) rels = genericManagerRels;
            }
          }

          // 2. Determine Self-Eval
          let canSelfEval = false;

          // Only enable Self-Eval card if NO relations are defined (Pure Self-Eval / Survey)
          // If relations exist (e.g. Leader -> Team, or even Director -> Director), 
          // it implies a Managed Evaluation (evaluating others), so we hide the Self-Eval card 
          // to prevent "Evaluación Líder al equipo" from showing as "Autoevaluación".
          if (rels.length === 0) {
            const ft = formTypeMap[tplTypeKey] || formTypeMap[tpl.type];
            // Verify user is actually allowed in this form type
            // Check against: role key, role label, normalized role, and original role
            if (ft && ft.roles && Array.isArray(ft.roles)) {
              const hasRoleKey = ft.roles.some((r: string) => normalizeStr(r) === normalizeStr(userRoleKey));
              const hasRoleLabel = ft.roles.some((r: string) => normalizeStr(r) === normalizeStr(userRoleLabel));
              const hasNormalizedRole = ft.roles.some((r: string) => normalizeStr(r) === userRoleNorm);
              const hasOriginalRole = ft.roles.some((r: string) => normalizeStr(r) === normalizeStr(user.role));

              canSelfEval = hasRoleKey || hasRoleLabel || hasNormalizedRole || hasOriginalRole;

              console.log(`[Dashboard] Self-eval check for ${tpl.name}:`, {
                hasRoleKey,
                hasRoleLabel,
                hasNormalizedRole,
                hasOriginalRole,
                canSelfEval,
                userRoleKey,
                userRoleLabel,
                formTypeRoles: ft.roles
              });
            }
          }

          selfMap[tpl.id] = canSelfEval;

          // 3. Determine Candidates (Evaluated)
          if (rels.length === 0) {
            // If no relations, we have no candidates to evaluate (other than self, handled above)
            map[tpl.id] = [];
            continue;
          }

          // Get target roles/IDs
          const targetRoleIds = new Set(rels.map((r: any) => r.evaluated_role_id).filter(Boolean));
          const targetRoleKeys = new Set(rels.map((r: any) => normalizeStr(r.evaluated_role_key)));

          const { data: candidates } = await supabase.from('users').select('*');

          let eligible = (candidates || []).filter((u: any) => {
            if (user && u.id === user.id) return false; // exclude self
            if (u.role_id && targetRoleIds.has(u.role_id)) return true;
            if (targetRoleKeys.has(normalizeStr(u.role))) return true;
            return false;
          });

          // Filter by manager relation (STRICT - NO FALLBACK TO OFFICE/CAMPUS)
          const managedCandidates = await filterByManagerRelation(eligible);

          // ONLY use direct manager relationship - no office or campus fallback
          if (managedCandidates.length > 0) {
            map[tpl.id] = managedCandidates;
            console.log(`[Dashboard] Template ${tpl.name}: Found ${managedCandidates.length} direct reports (manager relationship)`);
          } else {
            // No fallback - if no direct reports, show empty
            map[tpl.id] = [];
            console.log(`[Dashboard] Template ${tpl.name}: No direct reports found for this manager`);
          }

        } catch (err) {
          console.warn('[Dashboard] Error processing template', tpl.id, err);
          map[tpl.id] = [];
          selfMap[tpl.id] = false;
        }
      }

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
    console.log('[Dashboard] === loadStats CALLED ===');
    console.log('[Dashboard] User:', user?.full_name, 'Role:', user?.role);
    try {
      const roleKey = normalizeRoleKey(user?.role as any);
      console.log('[Dashboard] Normalized roleKey:', roleKey);

      if (user?.role === 'admin' || roleKey === 'admin') {
        console.log('[Dashboard] User is ADMIN - loading admin stats');
        const [employeesRes, officesRes, pendingRes, completedRes, rolesRes, usersData] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('offices').select('id', { count: 'exact', head: true }),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
          supabase.from('evaluations').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
          supabase.from('roles').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('campus'),
        ]);

        // Calculate users by campus
        const campusDistribution: Record<string, number> = {};
        (usersData.data || []).forEach((user: any) => {
          const campus = user.campus || 'Sin asignar';
          campusDistribution[campus] = (campusDistribution[campus] || 0) + 1;
        });

        setStats({
          totalEmployees: employeesRes.count || 0,
          totalOffices: officesRes.count || 0,
          pendingEvaluations: pendingRes.count || 0,
          completedEvaluations: completedRes.count || 0,
          totalRoles: rolesRes.count || 0,
        });
        setUsersByCampus(campusDistribution);
      } else {
        console.log('[Dashboard] User is NOT ADMIN - loading user stats');
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
        console.log('[Dashboard] About to start template loading...');
        try {
          // Get comprehensive role information
          let userRoleKey = user?.role || '';
          let userRoleLabel = user?.role || '';

          // Try to get canonical role from roles table
          if (user?.role_id) {
            const { data: roleData } = await supabase
              .from('roles')
              .select('key, label')
              .eq('id', user.role_id)
              .single();

            if (roleData) {
              userRoleKey = roleData.key;
              userRoleLabel = roleData.label;
            }
          }

          console.log('[Dashboard] Starting template loading for user:', user?.full_name, 'role:', user?.role, 'roleKey:', roleKey, 'userRoleKey:', userRoleKey, 'userRoleLabel:', userRoleLabel);

          // Use local date for period check to avoid timezone issues (UTC vs Local)
          const now = new Date();
          const today = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
          console.log('[Dashboard] Today date:', today);

          const { data: periodData, error: periodError } = await supabase
            .from('evaluation_periods')
            .select('id')
            .lte('start_date', today)
            .gte('end_date', today)
            .limit(1);

          console.log('[Dashboard] Period query result:', { periodData, periodError });

          const period = (periodData && periodData.length > 0) ? periodData[0] : null;
          console.log('[Dashboard] Active period:', period);

          let allowedFormTypeKeys: string[] = [];
          if (period) {
            const { data: pfts, error: pftsError } = await supabase.from('evaluation_period_form_types').select('form_type_key').eq('period_id', period.id);
            console.log('[Dashboard] Period form types:', { pfts, pftsError });
            allowedFormTypeKeys = (pfts || []).map((r: any) => r.form_type_key);
          } else {
            const { data: allFts, error: allFtsError } = await supabase.from('form_types').select('key');
            console.log('[Dashboard] All form types (no period):', { allFts, allFtsError });
            allowedFormTypeKeys = (allFts || []).map((r: any) => r.key);
          }

          console.log('[Dashboard] Allowed form type keys:', allowedFormTypeKeys);

          if (allowedFormTypeKeys.length > 0) {
            const { data: fts, error: ftsError } = await supabase.from('form_types').select('key,roles,role_ids').in('key', allowedFormTypeKeys);
            console.log('[Dashboard] Form types with roles:', { fts, ftsError, roleKey, userRoleKey, userRoleLabel, originalRole: user?.role });

            const allowedForRole = (fts || []).filter((ft: any) => {
              if (!Array.isArray(ft.roles)) return false;

              // Check ALL role variants
              const hasNormalizedRole = ft.roles.includes(roleKey);
              const hasUserRoleKey = ft.roles.includes(userRoleKey);
              const hasUserRoleLabel = ft.roles.includes(userRoleLabel);
              const hasOriginalRole = ft.roles.includes(user?.role);

              const allowed = hasNormalizedRole || hasUserRoleKey || hasUserRoleLabel || hasOriginalRole;

              console.log(`[Dashboard] Form type ${ft.key}: roles=${JSON.stringify(ft.roles)}, ` +
                `includes roleKey(${roleKey})=${hasNormalizedRole}, ` +
                `includes userRoleKey(${userRoleKey})=${hasUserRoleKey}, ` +
                `includes userRoleLabel(${userRoleLabel})=${hasUserRoleLabel}, ` +
                `includes originalRole(${user?.role})=${hasOriginalRole}, ` +
                `allowed=${allowed}`);

              return allowed;
            }).map((ft: any) => ft.key);

            console.log('[Dashboard] Allowed for role:', allowedForRole);

            // Try explicit relations too
            let relAllowed: string[] = [];
            try {
              // Try with normalized roleKey first
              const { data: rels1, error: relsError1 } = await supabase
                .from('form_type_relations')
                .select('form_type_key,evaluator_role_key')
                .in('form_type_key', allowedFormTypeKeys)
                .eq('evaluator_role_key', roleKey);

              // Also try with original user.role
              const { data: rels2, error: relsError2 } = await supabase
                .from('form_type_relations')
                .select('form_type_key,evaluator_role_key')
                .in('form_type_key', allowedFormTypeKeys)
                .eq('evaluator_role_key', user?.role);

              console.log('[Dashboard] Relations query:', {
                rels1, relsError1,
                rels2, relsError2,
                roleKey,
                originalRole: user?.role
              });

              const allRels = [...(rels1 || []), ...(rels2 || [])];
              relAllowed = Array.from(new Set(allRels.map((r: any) => r.form_type_key)));
            } catch (e) {
              console.debug('[Dashboard] no relations table or query failed', e);
            }

            const finalAllowed = Array.from(new Set([...allowedForRole, ...relAllowed]));
            console.log('[Dashboard] Final allowed form types:', finalAllowed);

            if (finalAllowed.length > 0) {
              const { data: templates, error: tplErr } = await supabase
                .from('evaluation_templates')
                .select('*')
                .eq('is_active', true)
                .in('type', finalAllowed)
                .order('created_at', { ascending: false });

              console.log('[Dashboard] Templates query result:', { templates, tplErr, count: templates?.length });

              if (tplErr) throw tplErr;
              setAvailableTemplates((templates as EvaluationTemplate[]) || []);
              availableCount = (templates || []).length || 0;
            } else {
              console.warn('[Dashboard] No allowed form types for user role');
              setAvailableTemplates([]);
            }
          } else {
            console.warn('[Dashboard] No form type keys available');
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
          totalRoles: 0,
        });
        setAvailableTemplatesCount(availableCount);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const roleKey = normalizeRoleKey(user?.role as any);
  const isAdmin = user?.role === 'admin' || roleKey === 'admin';

  const statCards = isAdmin ? [
    {
      label: "Total Personal",
      value: stats.totalEmployees,
      icon: <Users className="w-6 h-6 text-purple-600" />,
      color: "bg-purple-50",
      borderColor: "border-purple-100"
    },
    {
      label: "Oficinas Creadas",
      value: stats.totalOffices,
      icon: <Building2 className="w-6 h-6 text-indigo-600" />,
      color: "bg-indigo-50",
      borderColor: "border-indigo-100"
    },
    {
      label: "Roles Registrados",
      value: stats.totalRoles,
      icon: <FileCheck className="w-6 h-6 text-teal-600" />,
      color: "bg-teal-50",
      borderColor: "border-teal-100"
    },
    {
      label: "Evaluaciones Pendientes",
      value: stats.pendingEvaluations,
      icon: <Clock className="w-6 h-6 text-orange-500" />,
      color: "bg-orange-50",
      borderColor: "border-orange-100"
    },
    {
      label: "Evaluaciones Completadas",
      value: stats.completedEvaluations,
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />,
      color: "bg-emerald-50",
      borderColor: "border-emerald-100"
    },
  ] : [
    {
      label: "Evaluaciones Pendientes",
      value: stats.pendingEvaluations,
      icon: <Clock className="w-6 h-6 text-orange-500" />,
      color: "bg-orange-50",
      borderColor: "border-orange-100"
    },
    {
      label: "Pruebas Disponibles",
      value: availableTemplatesCount,
      icon: <FileText className="w-6 h-6 text-blue-600" />,
      color: "bg-blue-50",
      borderColor: "border-blue-100"
    },
    {
      label: "Evaluaciones Completadas",
      value: stats.completedEvaluations,
      icon: <CheckCircle2 className="w-6 h-6 text-emerald-500" />,
      color: "bg-emerald-50",
      borderColor: "border-emerald-100"
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
    <div className="font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">

        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
          <p className="text-slate-500 mt-1">Bienvenido de nuevo, gestiona tus evaluaciones y rendimiento.</p>
        </div>

        {/* Stats Grid */}
        <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-2 lg:grid-cols-5' : 'md:grid-cols-3'} gap-6 mb-10`}>
          {statCards.map((stat, index) => (
            <div
              key={index}
              className={`bg-white p-6 rounded-2xl shadow-sm border ${stat.borderColor} hover:shadow-md transition-shadow duration-300 flex items-center gap-4`}
            >
              <div className={`p-4 rounded-xl ${stat.color}`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-3xl font-bold text-slate-800">{stat.value}</p>
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Campus Distribution Section - Admin Only */}
        {isAdmin && Object.keys(usersByCampus).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-10">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Distribución de Personal por Campus
            </h3>
            <div className="space-y-3">
              {Object.entries(usersByCampus)
                .sort(([, a], [, b]) => b - a)
                .map(([campus, count]) => {
                  const maxCount = Math.max(...Object.values(usersByCampus));
                  const percentage = (count / maxCount) * 100;
                  return (
                    <div key={campus} className="flex items-center gap-4">
                      <div className="w-32 text-sm font-medium text-slate-700 truncate" title={campus}>
                        {campus}
                      </div>
                      <div className="flex-grow">
                        <div className="h-8 bg-slate-100 rounded-lg overflow-hidden relative">
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg transition-all duration-500 flex items-center justify-end pr-3"
                            style={{ width: `${percentage}%` }}
                          >
                            {percentage > 15 && (
                              <span className="text-white text-xs font-bold">{count}</span>
                            )}
                          </div>
                          {percentage <= 15 && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs font-bold">
                              {count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Exams (Takes up 2/3 on desktop) */}
          <div className="lg:col-span-2 space-y-6">

            {/* Pending Evaluations Section */}
            {inProgressEvaluations.length > 0 && (
              <div className="mb-8">
                <h4 className="text-md font-semibold text-orange-600 mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Evaluaciones Pendientes por terminar ({inProgressEvaluations.length})
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  {inProgressEvaluations.map((p) => (
                    <div key={p.id} className="bg-white rounded-xl p-5 shadow-sm border border-orange-100 flex flex-col sm:flex-row justify-between items-center gap-4">
                      <div>
                        <h5 className="font-bold text-slate-800">{p.template_name}</h5>
                        <div className="text-sm text-slate-500 mt-1">
                          Evaluado: <span className="font-medium text-slate-700">{p.evaluated_name}</span>
                          {p.evaluator_id === p.evaluated_id && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Autoevaluación</span>}
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          Iniciado el: {new Date(p.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedEvaluation(p)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                        >
                          Continuar
                        </button>
                        {/* Optional: Add cancel/delete button */}
                      </div>
                    </div>
                  ))}
                </div>
                <hr className="my-6 border-slate-100" />
              </div>
            )}

            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                Exámenes Disponibles
              </h3>
            </div>

            {availableTemplates.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-slate-500">
                No hay exámenes disponibles para tu rol en este momento.
              </div>
            ) : (
              availableTemplates.map((tpl) => {
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

                // Filter candidates for dropdown
                const searchTerm = searchTermMap[tpl.id] || "";
                const filteredCandidates = availableCandidates.filter(c =>
                  c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (c.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                  c.identification.includes(searchTerm)
                );

                const selectedCandId = selectedCandidate[tpl.id];
                const selectedCandObj = candidates.find(c => c.id === selectedCandId);

                return (
                  <div key={tpl.id}>
                    {/* Manager Evaluation Card */}
                    {showCandidateSelect && (
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 overflow-visible relative mb-6">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
                          <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-2 sm:mb-0">
                            Institucional
                          </div>
                          {/* <span className="text-slate-400 text-xs">Vence en 5 días</span> */}
                        </div>

                        <h4 className="text-lg font-bold text-slate-800 mb-2">{tpl.name}</h4>
                        <p className="text-slate-500 text-sm leading-relaxed mb-6">
                          {tpl.description || 'Apreciado líder, a continuación se presentan una serie de preguntas orientadas a la valoración del desempeño de su equipo.'}
                        </p>

                        {availableCandidates.length > 0 ? (
                          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                              Selecciona Colaborador a Evaluar
                            </label>

                            <div className="flex flex-col sm:flex-row gap-3 items-start">

                              {/* --- CUSTOM DYNAMIC DROPDOWN --- */}
                              <div className="relative flex-grow w-full" ref={el => dropdownRefs.current[tpl.id] = el}>
                                <div
                                  onClick={() => setDropdownOpenMap(prev => ({ ...prev, [tpl.id]: !prev[tpl.id] }))}
                                  className={`w-full bg-white border text-left py-3 px-4 rounded-lg cursor-pointer flex items-center justify-between transition-all duration-200 ${dropdownOpenMap[tpl.id] ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-300 hover:border-slate-400'}`}
                                >
                                  {selectedCandObj ? (
                                    <div className="flex items-center gap-3">
                                      <div className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold">
                                        {selectedCandObj.full_name.charAt(0)}
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-slate-700 font-medium truncate text-sm sm:text-base">{selectedCandObj.full_name}</span>
                                        {selectedCandObj.campus && <span className="text-xs text-slate-400">Campus: {selectedCandObj.campus}</span>}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">Buscar colaborador...</span>
                                  )}
                                  {dropdownOpenMap[tpl.id] ? <ChevronUp className="w-4 h-4 text-blue-500" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>

                                {/* Dropdown Menu */}
                                {dropdownOpenMap[tpl.id] && (
                                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden">
                                    {/* Search Input inside Dropdown */}
                                    <div className="p-2 border-b border-slate-100 bg-slate-50 sticky top-0">
                                      <div className="relative">
                                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                        <input
                                          type="text"
                                          className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
                                          placeholder="Filtrar por nombre..."
                                          value={searchTermMap[tpl.id] || ""}
                                          onChange={(e) => setSearchTermMap(prev => ({ ...prev, [tpl.id]: e.target.value }))}
                                          autoFocus
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                      </div>
                                    </div>

                                    {/* List Options */}
                                    <div className="max-h-60 overflow-y-auto">
                                      {filteredCandidates.length > 0 ? (
                                        filteredCandidates.map((col) => (
                                          <div
                                            key={col.id}
                                            onClick={() => {
                                              setSelectedCandidate(prev => ({ ...prev, [tpl.id]: col.id }));
                                              setDropdownOpenMap(prev => ({ ...prev, [tpl.id]: false }));
                                              setSearchTermMap(prev => ({ ...prev, [tpl.id]: "" }));
                                            }}
                                            className={`px-4 py-3 cursor-pointer flex items-center gap-3 hover:bg-blue-50 transition-colors ${selectedCandId === col.id ? 'bg-blue-50' : ''}`}
                                          >
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${selectedCandId === col.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                              {col.full_name.charAt(0)}
                                            </div>
                                            <div className="flex flex-col overflow-hidden">
                                              <span className={`text-sm truncate ${selectedCandId === col.id ? 'font-bold text-blue-700' : 'font-medium text-slate-700'}`}>
                                                {col.full_name}
                                              </span>
                                              <span className="text-xs text-slate-400 truncate">
                                                {col.role} {col.campus ? `• ${col.campus}` : ''}
                                              </span>
                                            </div>
                                            {selectedCandId === col.id && (
                                              <Check className="w-4 h-4 text-blue-600 ml-auto" />
                                            )}
                                          </div>
                                        ))
                                      ) : (
                                        <div className="p-4 text-center text-slate-400 text-sm">
                                          No se encontraron resultados
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <button
                                disabled={!selectedCandId}
                                onClick={async () => {
                                  try {
                                    const evaluatorId = user?.id;
                                    if (!evaluatorId) throw new Error('No user');

                                    const evaluatedId = selectedCandId;
                                    if (!evaluatedId) return;

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
                                    // Clear selection
                                    setSelectedCandidate(prev => ({ ...prev, [tpl.id]: '' }));
                                  } catch (err) {
                                    console.error('Error creating evaluation from dashboard', err);
                                    alert('No se pudo iniciar la evaluación');
                                  }
                                }}
                                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-semibold transition-all shadow-lg shadow-emerald-600/20 whitespace-nowrap active:scale-95"
                              >
                                Crear Evaluación
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center text-slate-500 text-sm italic">
                            Todos los colaboradores disponibles ya han sido evaluados.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Self Evaluation Card */}
                    {canSelfEval && (
                      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-6 mb-6">
                        <div className="flex-grow">
                          <div className="bg-purple-50 text-purple-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider inline-block mb-3">
                            Personal
                          </div>
                          <h4 className="text-lg font-bold text-slate-800 mb-2">Autoevaluación: {tpl.name}</h4>
                          <p className="text-slate-500 text-sm leading-relaxed mb-4">
                            Apreciado colaborador, le invitamos a responder de acuerdo con su percepción personal sobre su desempeño.
                          </p>
                        </div>
                        <div className="flex items-end">
                          {isCompleted ? (
                            <button disabled className="w-full sm:w-auto bg-slate-300 text-white px-6 py-3 rounded-lg font-semibold cursor-not-allowed">
                              Ya realizado
                            </button>
                          ) : isInProgress ? (
                            <button
                              onClick={() => setSelectedEvaluation(existingEvaluation)}
                              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20"
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
                              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors shadow-lg shadow-blue-600/20"
                            >
                              Iniciar Examen
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: User Profile Summary (Takes up 1/3 on desktop) */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sticky top-24">
              <div className="flex flex-col items-center text-center pb-6 border-b border-slate-100 mb-6">
                <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center text-blue-700 text-3xl font-bold mb-4 shadow-inner">
                  {user?.full_name?.charAt(0)}
                </div>
                <h3 className="text-lg font-bold text-slate-800 px-4">{user?.full_name}</h3>
                <p className="text-blue-600 font-medium text-sm mt-1">{user?.role?.replace(/_/g, ' ')}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1">Cédula</p>
                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    {user?.identification}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase font-semibold tracking-wider mb-1">Estado</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="text-emerald-600 font-medium text-sm">Activo</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100">
                {/* Optional: Add profile actions here */}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
